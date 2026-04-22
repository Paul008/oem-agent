/**
 * Main Orchestrator
 * 
 * Coordinates the entire Multi-OEM AI Agent pipeline:
 * 1. Scheduling — decides what to crawl and when
 * 2. Crawling — fetches pages (cheap check or browser render)
 * 3. Extraction — extracts structured data
 * 4. AI Routing — uses LLM fallback when needed
 * 5. Change Detection — identifies meaningful changes
 * 6. Notifications — alerts via Slack/email
 * 7. Storage — persists to Supabase and R2
 */

import type {
  OemId,
  PageType,
  SourcePage,
  ImportRun,
  Product,
  Offer,
  Banner,
  CrawlResult,
  ChangeEvent,
  Oem,
  SmartModeResult,
  NetworkRequest,
  NetworkResponse,
  ApiCandidate,
  DiscoveredApi,
} from './oem/types';
import type { PageExtractionResult } from './extract/engine';

import { CrawlScheduler, CrawlPriorityQueue, estimateMonthlyCosts } from './crawl/scheduler';
import { ExtractionEngine, computeHtmlHash, normalizeHtml } from './extract/engine';
import { AiRouter } from './ai/router';
import { ChangeDetector, AlertBatcher } from './notify/change-detector';
import { SlackNotifier, MultiChannelNotifier } from './notify/slack';
import { SalesRepAgent } from './ai/sales-rep';
import { DesignAgent } from './design/agent';
import { getOemDefinition } from './oem/registry';

// ============================================================================
// Helpers
// ============================================================================

/** Race a promise against a timeout. Rejects with a descriptive error on expiry. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Race a promise against a timeout, with an AbortSignal for cooperative cancellation.
 * When the timeout fires, the signal is aborted AND the returned promise rejects.
 */
function withAbortableTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const ac = new AbortController();
  const promise = fn(ac.signal);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      ac.abort();
      reject(new Error(`Timeout: ${label} exceeded ${ms}ms`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ============================================================================
// Configuration
// ============================================================================

export interface OrchestratorConfig {
  supabaseClient: any;
  r2Bucket: R2Bucket;
  browser: Fetcher; // Browser Rendering binding (BrowserWorker)
  aiRouter: AiRouter;
  notifier: MultiChannelNotifier;
  lightpandaUrl?: string; // Lightpanda CDP WebSocket endpoint

  // Optional overrides
  scheduler?: CrawlScheduler;
  changeDetector?: ChangeDetector;
  salesRepAgent?: SalesRepAgent;
  designAgent?: DesignAgent;
}

export interface CrawlJob {
  oemId: OemId;
  sourcePage: SourcePage;
  priority: number;
}

// ============================================================================
// Pipeline Result Types
// ============================================================================

export interface CrawlPipelineResult {
  success: boolean;
  sourcePageId: string;
  url: string;
  htmlHash: string;
  wasRendered: boolean;
  smartMode?: boolean;
  extractionResult?: PageExtractionResult;
  discoveredApis?: ApiCandidate[];
  error?: string;
  durationMs: number;
  productsUpserted?: number;
  offersUpserted?: number;
  bannersUpserted?: number;
  brochuresUpserted?: number;
  changesFound?: number;
}

export interface ChangePipelineResult {
  productsCreated: number;
  productsUpdated: number;
  offersCreated: number;
  offersUpdated: number;
  bannersUpdated: number;
  changeEvents: ChangeEvent[];
  alertsSent: number;
}

// ============================================================================
// Main Orchestrator
// ============================================================================

export class OemAgentOrchestrator {
  private config: OrchestratorConfig;
  private scheduler: CrawlScheduler;
  private extractionEngine: ExtractionEngine;
  private changeDetector: ChangeDetector;
  private alertBatcher: AlertBatcher;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.scheduler = config.scheduler || new CrawlScheduler();
    this.extractionEngine = new ExtractionEngine();
    this.changeDetector = config.changeDetector || new ChangeDetector();
    this.alertBatcher = new AlertBatcher();
  }

  // ==========================================================================
  // Main Entry Points
  // ==========================================================================

  /**
   * Map crawl_type from cron triggers to the page_types they should crawl.
   *
   * - homepage  → homepage pages (banners)
   * - offers    → offers pages (offers + banners on offer pages)
   * - vehicles  → vehicle, category, build_price pages (variants/models)
   * - news      → news pages
   * - sitemap   → sitemap pages
   * - full      → all page types (no filter)
   */
  private static readonly CRAWL_TYPE_TO_PAGE_TYPES: Record<string, PageType[]> = {
    homepage: ['homepage'],
    offers: ['offers'],
    vehicles: ['vehicle', 'category', 'build_price'],
    news: ['news'],
    sitemap: ['sitemap'],
  };

  /**
   * Run a scheduled crawl for all due pages across all OEMs.
   *
   * This is the main entry point called by the scheduled worker.
   * When crawlType is provided, only pages matching that type are crawled.
   */
  async runScheduledCrawl(
    crawlType?: string,
    opts?: {
      oemIds?: string[];
      onProgress?: (partial: {
        phase: string;
        completed: number;
        total: number;
        elapsedMs: number;
        oemResults: Array<{
          oemId: string;
          status: 'success' | 'timeout' | 'error' | 'skipped';
          durationMs: number;
          jobsProcessed: number;
          pagesChanged: number;
          errors: number;
          error?: string;
        }>;
      }) => Promise<void>;
    },
  ): Promise<{
    jobsProcessed: number;
    pagesChanged: number;
    errors: number;
    durationMs: number;
    deadlineHit: boolean;
    oemsSkipped: string[];
    oemResults: Array<{
      oemId: string;
      status: 'success' | 'timeout' | 'error' | 'skipped';
      durationMs: number;
      jobsProcessed: number;
      pagesChanged: number;
      errors: number;
      error?: string;
    }>;
  }> {
    const pageTypes = crawlType
      ? OemAgentOrchestrator.CRAWL_TYPE_TO_PAGE_TYPES[crawlType]
      : undefined;

    console.log(`[Orchestrator] Starting scheduled crawl (type: ${crawlType ?? 'full'}, pageTypes: ${pageTypes?.join(', ') ?? 'all'})...`);

    const startTime = Date.now();
    let jobsProcessed = 0;
    let pagesChanged = 0;
    let errors = 0;

    // Safe-fire wrapper for the progress callback — a buggy or hung callback
    // must never take down the crawl.
    const reportProgress = async (phase: string, completed: number, total: number, results: any[]) => {
      if (!opts?.onProgress) return;
      try {
        await Promise.race([
          opts.onProgress({ phase, completed, total, elapsedMs: Date.now() - startTime, oemResults: results }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('onProgress timeout')), 5_000)),
        ]);
      } catch (e) {
        console.warn('[Orchestrator] onProgress callback failed (non-fatal):', e);
      }
    };

    // Mark that we've started — this lands in R2 immediately so if the next
    // Supabase query hangs, the run record at least shows phase='setup'.
    await reportProgress('setup', 0, 0, []);

    // ── Housekeeping: mark stale "running" import_runs as timed out ──
    // Any run stuck in "running" for >10 min is dead (Worker was killed).
    //
    // HANG FIX: these Supabase queries previously had no timeout and were
    // the confirmed hang point (diagnosed via incremental progress saves).
    // Each query is now wrapped with a 10s timeout and the crawl continues
    // even if housekeeping fails — data correctness matters more than the
    // cleanup niceties.
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    type SupaResult = { data?: any; error?: any };
    try {
      const staleResult = await withTimeout<SupaResult>(
        this.config.supabaseClient
          .from('import_runs')
          .update({
            status: 'timeout',
            finished_at: new Date().toISOString(),
            error_log: 'Automatically marked as timeout — run exceeded 10 min without completion',
          })
          .eq('status', 'running')
          .lt('started_at', staleThreshold)
          .select('id') as unknown as Promise<SupaResult>,
        10_000,
        'stale-running-cleanup',
      );
      if (staleResult.data?.length) {
        console.log(`[Orchestrator] Cleaned up ${staleResult.data.length} stale "running" import_runs`);
      }
      if (staleResult.error) {
        console.warn('[Orchestrator] Failed to clean stale runs:', staleResult.error);
      }
    } catch (e) {
      console.warn('[Orchestrator] stale-running-cleanup skipped (timeout or error):', e instanceof Error ? e.message : e);
    }
    await reportProgress('stale_running_cleaned', 0, 0, []);

    // Also clean up orphaned "pending" retry runs (never picked up)
    try {
      const stalePendingResult = await withTimeout<SupaResult>(
        this.config.supabaseClient
          .from('import_runs')
          .update({
            status: 'timeout',
            finished_at: new Date().toISOString(),
            error_log: 'Orphaned pending run — never picked up by crawler',
          })
          .eq('status', 'pending')
          .lt('started_at', staleThreshold)
          .select('id') as unknown as Promise<SupaResult>,
        10_000,
        'stale-pending-cleanup',
      );
      if (stalePendingResult.data?.length) {
        console.log(`[Orchestrator] Cleaned up ${stalePendingResult.data.length} orphaned "pending" import_runs`);
      }
    } catch (e) {
      console.warn('[Orchestrator] stale-pending-cleanup skipped (timeout or error):', e instanceof Error ? e.message : e);
    }
    await reportProgress('stale_pending_cleaned', 0, 0, []);

    // Get all active OEMs
    let oems: any[] = [];
    let oemsError: any = null;
    try {
      const oemsResult = await withTimeout<SupaResult>(
        this.config.supabaseClient
          .from('oems')
          .select('*')
          .eq('is_active', true) as unknown as Promise<SupaResult>,
        10_000,
        'fetch-active-oems',
      );
      oems = oemsResult.data || [];
      oemsError = oemsResult.error;
    } catch (e) {
      console.error('[Orchestrator] fetch-active-oems failed:', e instanceof Error ? e.message : e);
      oemsError = e;
    }
    // Honour oemIds filter from the cron config. Without this the crawl
    // always fans out to every active OEM in the DB, which exhausts the
    // Worker's CPU/subrequest budget before any OEM finishes.
    if (opts?.oemIds && opts.oemIds.length > 0) {
      const allow = new Set(opts.oemIds);
      const beforeCount = oems.length;
      oems = oems.filter((o: any) => allow.has(o.id));
      console.log(`[Orchestrator] Filtered ${beforeCount} → ${oems.length} OEMs by oemIds filter`);
    }
    await reportProgress('oems_fetched', 0, oems.length, []);

    if (oemsError) {
      console.error('[Orchestrator] Failed to fetch OEMs:', oemsError);
      return {
        jobsProcessed: 0,
        pagesChanged: 0,
        errors: 1,
        durationMs: Date.now() - startTime,
        deadlineHit: false,
        oemsSkipped: [],
        oemResults: [],
      };
    }

    // Fan-out: process OEMs in parallel batches of 6.
    // Each OEM gets its own 60s timeout with AbortController.
    // 18 OEMs / 6 concurrent = 3 batches × ~90s = ~4.5 min.
    //
    // SAFETY NET: a hard global deadline enforced between batches. Even if
    // individual per-OEM timeouts fail to propagate (the hang bug from Mar 25),
    // this guarantees the cron completes before hitting the 10-min stale
    // cleanup. Any OEMs not started before the deadline are recorded as
    // 'skipped' so we can see them in the run history.
    const PER_OEM_TIMEOUT_MS = 60_000;
    const CONCURRENCY = 6;
    const GLOBAL_DEADLINE_MS = 6 * 60_000; // 6 min hard cap (cron stale cleanup at 10 min)

    const oemResults: Array<{
      oemId: string;
      status: 'success' | 'timeout' | 'error' | 'skipped';
      durationMs: number;
      jobsProcessed: number;
      pagesChanged: number;
      errors: number;
      error?: string;
    }> = [];
    const oemsSkipped: string[] = [];
    let deadlineHit = false;

    batchLoop: for (let i = 0; i < oems.length; i += CONCURRENCY) {
      // Global deadline check — break out before starting next batch if
      // we're approaching the hard cap. This is the safety net that
      // guarantees the cron completes regardless of downstream hangs.
      const elapsed = Date.now() - startTime;
      if (elapsed >= GLOBAL_DEADLINE_MS) {
        deadlineHit = true;
        console.warn(`[Orchestrator] Global deadline hit at ${elapsed}ms — skipping remaining ${oems.length - i} OEMs`);
        for (let k = i; k < oems.length; k++) {
          oemsSkipped.push(oems[k].id);
          oemResults.push({
            oemId: oems[k].id,
            status: 'skipped',
            durationMs: 0,
            jobsProcessed: 0,
            pagesChanged: 0,
            errors: 0,
            error: 'Skipped: global deadline exceeded before batch started',
          });
        }
        break batchLoop;
      }

      const batch = oems.slice(i, i + CONCURRENCY);
      console.log(`[Orchestrator] Batch ${Math.floor(i / CONCURRENCY) + 1} (${batch.length} OEMs): ${batch.map((o: any) => o.id).join(', ')} | elapsed ${elapsed}ms`);
      await reportProgress(`batch_${Math.floor(i / CONCURRENCY) + 1}_start`, oemResults.length, oems.length, oemResults);

      const batchStartTimes = batch.map(() => Date.now());
      const batchResults = await Promise.allSettled(
        batch.map((oem: any, idx: number) => {
          batchStartTimes[idx] = Date.now();
          console.log(`[Orchestrator] [crawl-start] ${oem.id}`);
          return withAbortableTimeout(
            (signal) => this.crawlOem(oem.id as OemId, pageTypes, 'scheduled', signal),
            PER_OEM_TIMEOUT_MS,
            `crawlOem(${oem.id})`,
          );
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const oemId = batch[j].id;
        const oemDuration = Date.now() - batchStartTimes[j];

        if (result.status === 'fulfilled') {
          jobsProcessed += result.value.jobsProcessed;
          pagesChanged += result.value.pagesChanged;
          errors += result.value.errors;
          console.log(`[Orchestrator] [crawl-end] ${oemId} ${oemDuration}ms success (${result.value.jobsProcessed} jobs, ${result.value.errors} errors)`);
          oemResults.push({
            oemId,
            status: 'success',
            durationMs: oemDuration,
            jobsProcessed: result.value.jobsProcessed,
            pagesChanged: result.value.pagesChanged,
            errors: result.value.errors,
          });
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          const isTimeout = /Timeout:/.test(reason);
          console.error(`[Orchestrator] [crawl-end] ${oemId} ${oemDuration}ms ${isTimeout ? 'TIMEOUT' : 'ERROR'} — ${reason}`);
          errors++;
          oemResults.push({
            oemId,
            status: isTimeout ? 'timeout' : 'error',
            durationMs: oemDuration,
            jobsProcessed: 0,
            pagesChanged: 0,
            errors: 1,
            error: reason,
          });
        }
      }

      // Persist progress after every batch so if the Worker is killed next,
      // the diagnostic data for completed OEMs is already in R2.
      await reportProgress('batch_complete', oemResults.length, oems.length, oemResults);
    }

    const duration = Date.now() - startTime;
    console.log(`[Orchestrator] Scheduled crawl complete (type: ${crawlType ?? 'full'}): ${jobsProcessed} jobs, ${pagesChanged} changed, ${errors} errors in ${duration}ms${deadlineHit ? ' [DEADLINE HIT]' : ''}`);

    await reportProgress('done', oemResults.length, oems.length, oemResults);

    return { jobsProcessed, pagesChanged, errors, durationMs: duration, deadlineHit, oemsSkipped, oemResults };
  }

  /**
   * Run a crawl for a specific OEM, optionally filtered to specific page types.
   */
  async crawlOem(
    oemId: OemId,
    pageTypes?: PageType[],
    runType: 'manual' | 'scheduled' | 'retry' = 'manual',
    signal?: AbortSignal,
    skipRender = false,
  ): Promise<{
    jobsProcessed: number;
    pagesChanged: number;
    errors: number;
    importRunId: string | null;
  }> {
    console.log(`[Orchestrator] Crawling OEM: ${oemId}${pageTypes ? ` (page types: ${pageTypes.join(', ')})` : ''}`);

    // Create import run record
    const importRunId = crypto.randomUUID();
    const importRun = {
      id: importRunId,
      oem_id: oemId,
      run_type: runType,
      status: 'running',
      started_at: new Date().toISOString(),
    };

    console.log(`[Orchestrator] Creating import run: ${importRunId}`);
    const { error: insertError } = await this.config.supabaseClient
      .from('import_runs')
      .insert(importRun);

    if (insertError) {
      console.error('[Orchestrator] Failed to create import run:', insertError);
    } else {
      console.log(`[Orchestrator] Import run created: ${importRunId}`);
    }

    let jobsProcessed = 0;
    let pagesChanged = 0;
    let errors = 0;
    let productsUpserted = 0;
    let offersUpserted = 0;
    let bannersUpserted = 0;
    let brochuresUpserted = 0;
    let changesFound = 0;
    let finalStatus = 'completed';
    let errorLog: string | null = null;

    try {
      // Get due pages for this OEM (filtered by page type if specified)
      console.log(`[Orchestrator] Fetching due pages for ${oemId}...`);
      const pages = await this.getDuePages(oemId, pageTypes);
      console.log(`[Orchestrator] Found ${pages.length} due pages for ${oemId}`);

      // Process each page with a per-page timeout (30s max)
      const PER_PAGE_TIMEOUT_MS = 30_000;
      for (const page of pages) {
        // Cooperative cancellation: stop processing if parent timed out
        if (signal?.aborted) {
          console.log(`[Orchestrator] crawlOem(${oemId}) aborted — skipping remaining ${pages.length - jobsProcessed} pages`);
          errorLog = 'Aborted by parent timeout — not all pages were processed';
          break;
        }
        try {
          const result = await withTimeout(
            this.crawlPage(oemId, page, skipRender, signal),
            PER_PAGE_TIMEOUT_MS,
            `crawlPage(${page.url})`,
          );
          jobsProcessed++;

          if (result.success) {
            if (result.extractionResult?.products?.data?.length ||
                result.extractionResult?.offers?.data?.length) {
              pagesChanged++;
            }
            // Accumulate counters
            productsUpserted += result.productsUpserted || 0;
            offersUpserted += result.offersUpserted || 0;
            bannersUpserted += result.bannersUpserted || 0;
            brochuresUpserted += result.brochuresUpserted || 0;
            changesFound += result.changesFound || 0;
          } else {
            errors++;
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`[Orchestrator] Error crawling page ${page.url}: ${msg}`);
          errors++;
          jobsProcessed++;
        }
      }

      // Determine final status
      if (errors > 0 && pagesChanged > 0) {
        finalStatus = 'partial';
      } else if (errors > 0 && pagesChanged === 0) {
        finalStatus = 'failed';
      } else {
        finalStatus = 'completed';
      }
    } catch (outerError) {
      // Catch-all: unexpected errors (e.g. getDuePages failure, timeout from parent)
      const msg = outerError instanceof Error ? outerError.message : String(outerError);
      console.error(`[Orchestrator] crawlOem(${oemId}) failed: ${msg}`);
      finalStatus = 'failed';
      errorLog = msg.slice(0, 500);
    } finally {
      // ── ALWAYS update the import_run — this is the critical fix ──
      try {
        await this.config.supabaseClient
          .from('import_runs')
          .update({
            status: finalStatus,
            finished_at: new Date().toISOString(),
            pages_checked: jobsProcessed,
            pages_changed: pagesChanged,
            pages_errored: errors,
            products_upserted: productsUpserted,
            offers_upserted: offersUpserted,
            banners_upserted: bannersUpserted,
            changes_found: changesFound,
            error_log: errorLog,
          })
          .eq('id', importRunId);
        console.log(`[Orchestrator] Import run ${importRunId} → ${finalStatus} (${jobsProcessed} pages, ${errors} errors)`);
      } catch (updateErr) {
        console.error(`[Orchestrator] CRITICAL: Failed to update import_run ${importRunId}:`, updateErr);
      }
    }

    // Send batched alerts (non-critical — don't let it break the return)
    try {
      await this.sendBatchedAlerts(oemId);
    } catch (alertErr) {
      console.warn(`[Orchestrator] Alert batching failed for ${oemId}:`, alertErr);
    }

    return {
      jobsProcessed,
      pagesChanged,
      errors,
      importRunId,
    };
  }

  /**
   * Crawl a single page using smart mode (network interception).
   * When skipRender is true, only cheap fetch is used (no browser) — suitable for
   * HTTP-triggered crawls where waitUntil budget is limited to ~30s.
   */
  async crawlPage(oemId: OemId, page: SourcePage, skipRender = false, signal?: AbortSignal): Promise<CrawlPipelineResult> {
    const startTime = Date.now();

    // Cooperative cancellation: bail immediately if parent already aborted.
    // This is the one low-cost propagation we can add without refactoring
    // every downstream fetch — catches the common case where a previous
    // page on the same OEM already blew the per-OEM budget.
    if (signal?.aborted) {
      return {
        success: false,
        sourcePageId: page.id,
        url: page.url,
        htmlHash: page.last_hash || '',
        wasRendered: false,
        smartMode: false,
        error: 'Aborted by parent timeout before crawl started',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Step 1: Check schedule
      const scheduleCheck = this.scheduler.shouldCrawl(page);
      if (!scheduleCheck.shouldCrawl) {
        return {
          success: true,
          sourcePageId: page.id,
          url: page.url,
          htmlHash: page.last_hash || '',
          wasRendered: false,
          smartMode: false,
          durationMs: Date.now() - startTime,
        };
      }

      // Step 2: Cheap check (fetch HTML without browser)
      let cheapHtml = '';
      let cheapFetchFailed = false;
      try {
        cheapHtml = await this.fetchHtml(page.url);
      } catch (fetchErr: any) {
        // 403/bot protection — skip cheap check, force browser rendering
        console.warn(`[Orchestrator] Cheap fetch failed for ${page.url}: ${fetchErr.message} — will try browser`);
        cheapFetchFailed = true;
      }
      const htmlHash = cheapFetchFailed ? '' : await computeHtmlHash(cheapHtml);

      // Step 3: Determine if browser rendering (smart mode) is needed
      const renderCheck = cheapFetchFailed
        ? { shouldRender: true, reason: 'cheap_fetch_blocked' }
        : this.scheduler.shouldRender(page, htmlHash);
      let finalHtml = cheapHtml;
      let wasRendered = false;
      let smartModeResult: SmartModeResult | null = null;
      let discoveredApis: ApiCandidate[] = [];

      if (renderCheck.shouldRender && !skipRender) {
        // Check budget before rendering
        const budgetCheck = await this.checkRenderBudget(oemId);
        if (budgetCheck.allowed) {
          // Try Lightpanda first (fast, lightweight), falls back to Smart Mode
          smartModeResult = await this.renderPageLightpanda(page.url, oemId);
          finalHtml = smartModeResult.html;
          discoveredApis = smartModeResult.apiCandidates;
          wasRendered = true;

          console.log(`[Orchestrator] Smart mode for ${page.url}:`);
          console.log(`  - Discovered ${discoveredApis.length} API candidates`);

          // Log high-confidence APIs
          const highConfidenceApis = discoveredApis.filter((api) => api.confidence >= 0.7);
          if (highConfidenceApis.length > 0) {
            console.log(`  - High confidence APIs:`);
            highConfidenceApis.forEach((api) => {
              console.log(`    * ${api.dataType || 'unknown'}: ${api.url} (${(api.confidence * 100).toFixed(0)}%)`);
            });
          }

          // Store discovered APIs
          if (discoveredApis.length > 0) {
            await this.storeDiscoveredApis(oemId, page.url, discoveredApis);
          }
        }
      }

      // Step 4: Extract data from HTML
      let extractionResult = this.extractionEngine.extract(
        finalHtml,
        oemId,
        page.page_type,
        page.url
      );

      // Step 5: Try to extract from discovered APIs first (smart mode priority)
      if (smartModeResult && discoveredApis.length > 0) {
        const apiExtractionResult = await this.extractFromDiscoveredApis(
          oemId,
          page,
          smartModeResult
        );
        if (apiExtractionResult) {
          extractionResult = this.mergeApiResults(extractionResult, apiExtractionResult);
        }
      }

      // Step 6: Direct Ford API fetch for known endpoints
      // Only run on vehicle pages — running it on news/offers/homepage causes
      // bare nameplates from the vehiclesmenu API to be inserted with the
      // calling page's URL as source_url, creating orphan rows when the
      // enrichment step (Step 6.5) fails or returns shallow data.
      let fordApiDebug: any = { attempted: false };
      if (oemId === 'ford-au' && page.url.includes('ford.com.au') && page.page_type === 'vehicle') {
        fordApiDebug.attempted = true;
        console.log(`[Orchestrator] Attempting direct Ford API fetch for ${page.url}`);
        try {
          const fordApiUrl = 'https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data';
          const fordResponse = await fetch(fordApiUrl, {
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-AU,en;q=0.9',
              'Referer': 'https://www.ford.com.au/',
              'Origin': 'https://www.ford.com.au',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin',
            },
          });

          fordApiDebug.status = fordResponse.status;
          fordApiDebug.statusText = fordResponse.statusText;

          if (fordResponse.ok) {
            const body = await fordResponse.text();
            fordApiDebug.bodyLength = body.length;
            console.log(`[Orchestrator] Ford API direct fetch: ${body.length} chars`);
            const data = JSON.parse(body);
            fordApiDebug.parsedType = Array.isArray(data) ? 'array' : typeof data;
            fordApiDebug.parsedLength = Array.isArray(data) ? data.length : null;
            const fordProducts = this.extractProductsFromApiResponse(data);
            fordApiDebug.extractedCount = fordProducts.length;
            console.log(`[Orchestrator] Extracted ${fordProducts.length} products from direct Ford API fetch`);
            
            // Log all extracted product names
            const extractedNames = fordProducts.map((p: any) => p.title).filter(Boolean);
            console.log(`[Orchestrator] Ford API product names: ${extractedNames.join(', ')}`);
            
            if (fordProducts.length > 0) {
              // Merge with existing extraction
              const existingProducts = extractionResult.products?.data || [];
              const seenTitles = new Set(existingProducts.map((p: any) => p.title?.toLowerCase().trim()));
              console.log(`[Orchestrator] Existing products before merge: ${existingProducts.length}`);
              
              let added = 0;
              let skipped = 0;
              for (const fp of fordProducts) {
                const title = fp.title?.toLowerCase().trim();
                if (title) {
                  if (!seenTitles.has(title)) {
                    seenTitles.add(title);
                    existingProducts.push(fp);
                    added++;
                  } else {
                    skipped++;
                    console.log(`[Orchestrator] Skipping duplicate: ${title}`);
                  }
                } else {
                  console.log(`[Orchestrator] Skipping product without title:`, fp);
                }
              }
              console.log(`[Orchestrator] Added ${added} new products from Ford API (skipped ${skipped})`);
              extractionResult = {
                ...extractionResult,
                products: {
                  data: existingProducts,
                  confidence: 0.95,
                  method: 'api' as any,
                  coverage: 1,
                },
              };
            }
          }
        } catch (fordError: any) {
          console.error(`[Orchestrator] Ford API direct fetch failed:`, fordError);
          fordApiDebug.error = fordError?.message || String(fordError);
        }
      }

      // Attach Ford API debug info to result
      (extractionResult as any).fordApiDebug = fordApiDebug;

      // Step 6.5: Enrich Ford products with variant data from pricing API
      // This adds detailed trim/grade information to each nameplate
      if (oemId === 'ford-au' && fordApiDebug.extractedCount > 0) {
        console.log(`[Orchestrator] Enriching Ford products with variant data from pricing API...`);
        try {
          const enrichedProducts = await this.enrichFordProductsWithVariants(extractionResult.products?.data || []);
          fordApiDebug.enrichedCount = enrichedProducts.length;
          
          extractionResult = {
            ...extractionResult,
            products: {
              data: enrichedProducts,
              confidence: 0.95,
              method: 'api' as any,
              coverage: 1,
            },
          };
          console.log(`[Orchestrator] Enriched ${enrichedProducts.length} Ford products with variants`);
        } catch (enrichError: any) {
          console.error(`[Orchestrator] Ford variant enrichment failed (non-critical):`, enrichError?.message || String(enrichError));
          fordApiDebug.enrichError = enrichError?.message || String(enrichError);
          // Continue with base products even if enrichment fails
        }
      }

      // Step 7: LLM fallback if still needed
      if (this.extractionEngine.needsLlmFallback(extractionResult)) {
        const llmResult = await this.runLlmExtraction(finalHtml, oemId, page);
        extractionResult = this.mergeLlmResults(extractionResult, llmResult);
      }

      // Step 8: Store raw API responses to R2 for debugging
      if (smartModeResult?.networkResponses) {
        await this.storeRawResponses(oemId, page.url, smartModeResult.networkResponses);
      }

      // Step 9: Process changes
      console.log(`[Orchestrator] About to process changes. Products: ${extractionResult.products?.data?.length || 0}`);
      let changeCounters = { productsUpserted: 0, offersUpserted: 0, bannersUpserted: 0, brochuresUpserted: 0, changesFound: 0 };
      try {
        changeCounters = await this.processChanges(oemId, page, extractionResult);
        console.log(`[Orchestrator] Process changes completed successfully`);
      } catch (processError) {
        console.error(`[Orchestrator] Process changes FAILED:`, processError);
        throw processError;
      }

      // Step 10: Update source page record
      await this.updateSourcePage(page, htmlHash, wasRendered);

      return {
        success: true,
        sourcePageId: page.id,
        url: page.url,
        htmlHash,
        wasRendered,
        smartMode: wasRendered,
        extractionResult,
        discoveredApis,
        durationMs: Date.now() - startTime,
        productsUpserted: changeCounters.productsUpserted,
        offersUpserted: changeCounters.offersUpserted,
        bannersUpserted: changeCounters.bannersUpserted,
        brochuresUpserted: changeCounters.brochuresUpserted,
        changesFound: changeCounters.changesFound,
      };
    } catch (error) {
      // Update page with error
      await this.updateSourcePageError(
        page,
        error instanceof Error ? error.message : String(error)
      );

      return {
        success: false,
        sourcePageId: page.id,
        url: page.url,
        htmlHash: '',
        wasRendered: false,
        smartMode: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract data directly from discovered API responses.
   */
  private async extractFromDiscoveredApis(
    oemId: OemId,
    page: SourcePage,
    smartModeResult: SmartModeResult
  ): Promise<PageExtractionResult | null> {
    const productApis = smartModeResult.apiCandidates.filter(
      (api) => api.dataType === 'products' && api.confidence >= 0.6
    );
    const offerApis = smartModeResult.apiCandidates.filter(
      (api) => api.dataType === 'offers' && api.confidence >= 0.6
    );

    // Find corresponding responses
    const products: any[] = [];
    const offers: any[] = [];

    console.log(`[Orchestrator] extractFromDiscoveredApis: ${productApis.length} product APIs, ${offerApis.length} offer APIs`);
    console.log(`[Orchestrator] Total networkResponses: ${smartModeResult.networkResponses.length}`);
    
    // Debug: Log all API candidate URLs and response URLs
    if (productApis.length > 0) {
      console.log(`[Orchestrator] API Candidate URLs:`);
      productApis.forEach(api => console.log(`  - ${api.url}`));
    }
    if (smartModeResult.networkResponses.length > 0) {
      const jsonResponses = smartModeResult.networkResponses.filter(r => r.contentType?.includes('json'));
      console.log(`[Orchestrator] JSON Response URLs (${jsonResponses.length}):`);
      jsonResponses.forEach(r => console.log(`  - ${r.url.substring(0, 100)} (body: ${r.body?.length || 0} chars)`));
    }

    // ROBUST EXTRACTION: Try to extract from ALL JSON responses with bodies first
    // This bypasses URL matching issues and extracts from any response that looks like vehicle data
    const jsonResponsesWithBody = smartModeResult.networkResponses.filter(
      (r) => r.contentType?.includes('json') && r.body && r.body.length > 100
    );
    
    console.log(`[Orchestrator] Attempting robust extraction from ${jsonResponsesWithBody.length} JSON responses`);
    
    const seenTitles = new Set<string>();
    for (const response of jsonResponsesWithBody) {
      try {
        const data = JSON.parse(response.body!);
        console.log(`[Orchestrator] Parsing JSON from ${response.url.substring(0, 60)}... (type: ${Array.isArray(data) ? 'array' : typeof data})`);
        const extracted = this.extractProductsFromApiResponse(data);
        console.log(`[Orchestrator] Extraction returned ${extracted.length} items`);
        if (extracted.length > 0) {
          console.log(`[Orchestrator] Extracted ${extracted.length} products from: ${response.url.substring(0, 80)}`);
          // Deduplicate as we go
          let added = 0;
          for (const p of extracted) {
            const title = p.title?.toLowerCase().trim();
            if (title) {
              if (!seenTitles.has(title)) {
                seenTitles.add(title);
                products.push(p);
                added++;
              } else {
                console.log(`[Orchestrator] Duplicate title skipped: ${title}`);
              }
            } else {
              console.log(`[Orchestrator] Item without title: ${JSON.stringify(p).substring(0, 100)}`);
            }
          }
          console.log(`[Orchestrator] Added ${added} unique products from this response`);
        }
      } catch (err) {
        console.error(`[Orchestrator] Error extracting from ${response.url.substring(0, 60)}:`, err);
      }
    }
    
    console.log(`[Orchestrator] Total unique products from JSON responses: ${products.length}`);

    // Fallback: Try direct fetch for any product APIs that weren't captured in network responses
    for (const api of productApis) {
      // Skip if we already have products from this URL (check by path)
      try {
        const apiPath = new URL(api.url).pathname;
        const alreadyCaptured = jsonResponsesWithBody.some(r => {
          try {
            return new URL(r.url).pathname === apiPath;
          } catch {
            return false;
          }
        });
        if (alreadyCaptured) continue;
      } catch {
        continue;
      }
      
      console.log(`[Orchestrator] API not captured, trying direct fetch: ${api.url.substring(0, 80)}`);
      
      try {
        const headers: Record<string, string> = {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };
        
        if (api.url.includes('ford.com')) {
          headers['Referer'] = 'https://www.ford.com.au/';
          headers['Origin'] = 'https://www.ford.com.au';
        } else if (api.url.includes('toyota.com')) {
          headers['Referer'] = 'https://www.toyota.com.au/';
        } else if (api.url.includes('hyundai.com')) {
          headers['Referer'] = 'https://www.hyundai.com/au/';
        }
        
        const directResponse = await fetch(api.url, { headers });
        
        if (directResponse.ok) {
          const body = await directResponse.text();
          if (body.length > 0) {
            const data = JSON.parse(body);
            const extracted = this.extractProductsFromApiResponse(data);
            for (const p of extracted) {
              const title = p.title?.toLowerCase().trim();
              if (title && !seenTitles.has(title)) {
                seenTitles.add(title);
                products.push(p);
              }
            }
            if (extracted.length > 0) {
              console.log(`[Orchestrator] Direct fetch added ${extracted.length} products`);
            }
          }
        }
      } catch (fetchErr) {
        // Ignore fetch errors
      }
    }

    // Also extract offers from all JSON responses
    for (const response of jsonResponsesWithBody) {
      try {
        const data = JSON.parse(response.body!);
        const extracted = this.extractOffersFromApiResponse(data);
        if (extracted.length > 0) {
          console.log(`[Orchestrator] Extracted ${extracted.length} offers from: ${response.url.substring(0, 80)}`);
          offers.push(...extracted);
        }
      } catch (err) {
        // Ignore parse errors
      }
    }

    if (products.length === 0 && offers.length === 0) {
      return null;
    }

    return {
      url: page.url,
      products: {
        data: products,
        confidence: 0.9, // High confidence for direct API extraction
        method: 'api' as any,
        coverage: 1,
      },
      offers: {
        data: offers,
        confidence: 0.9,
        method: 'api' as any,
        coverage: 1,
      },
      bannerSlides: {
        data: [],
        confidence: 0,
        method: 'none' as any,
        coverage: 0,
      },
      discoveredUrls: [],
      metadata: {
        title: '',
        description: '',
        jsonLdSchemas: [],
      },
    };
  }

  /**
   * Extract products from API JSON response.
   * Handles multiple formats: generic APIs, Ford AEM, and OEM-specific structures.
   */
  private extractProductsFromApiResponse(data: any): any[] {
    const products: any[] = [];

    // Try common response shapes
    let items: any[] = [];

    // 1. Ford AEM vehiclesmenu.data format - MUST check first (is an array but with nested nameplates)
    if (this.isAemVehicleMenuData(data)) {
      items = this.extractAemVehicleMenuItems(data);
      console.log(`[Orchestrator] Extracted ${items.length} items from AEM vehiclesmenu.data`);
    }
    // 2. AEM generic content structure (jcr:content, components, etc.)
    else if (this.isAemContentStructure(data)) {
      items = this.extractAemContentItems(data);
      console.log(`[Orchestrator] Extracted ${items.length} items from AEM content structure`);
    }
    // 3. Direct array (generic)
    else if (Array.isArray(data)) {
      items = data;
    }
    // 4. Standard wrapper patterns
    else if (data.data && Array.isArray(data.data)) {
      items = data.data;
    } else if (data.vehicles && Array.isArray(data.vehicles)) {
      items = data.vehicles;
    } else if (data.models && Array.isArray(data.models)) {
      items = data.models;
    } else if (data.products && Array.isArray(data.products)) {
      items = data.products;
    } else if (data.results && Array.isArray(data.results)) {
      items = data.results;
    }

    let skippedNoTitle = 0;
    for (const item of items) {
      // Normalize to our product format
      const product = {
        title: item.name || item.title || item.modelName || item.model || item.vehicleName,
        subtitle: item.subtitle || item.tagline,
        variant_name: item.variant || item.variantName || item.trim || item.trimName || item.grade || item.gradeName || null,
        variant_code: item.variantCode || item.trimCode || item.gradeCode || item.sku || null,
        body_type: item.bodyType || item.body_type || item.type || item.vehicleType || item.category,
        fuel_type: item.fuelType || item.fuel_type || item.fuel || item.powerTrain,
        availability: item.availability || item.status || 'available',
        price: {
          amount: item.price || item.msrp || item.driveaway_price || item.priceAmount ||
                  item.startingPrice || item.fromPrice || this.extractPriceFromString(item.priceText || item.priceDisplay),
          currency: item.currency || 'AUD',
          type: item.priceType || item.price_type || 'driveaway',
          raw_string: item.priceDisplay || item.price_raw || item.priceText,
        },
        key_features: item.features || item.highlights || item.keyFeatures || [],
        variants: item.variants || item.trims || item.grades || [],
        disclaimer_text: item.disclaimer || item.terms || item.legalText,
        // Ford uses imageUrl (built in extraction), fallback to raw image field
        primary_image_url: item.imageUrl || item.image || item.hero_image || item.thumbnailImage || item.vehicleImage,
        // Ford uses 'code' as external key
        external_key: item.code || item.modelCode || item.vehicleCode || item.id,
        // Ford uses sourceUrl (built in extraction), fallback to other URL fields
        source_url: item.sourceUrl || item.link || item.url || item.detailsUrl || item.ctaLink,
      };

      // Only add if we have at least a title
      if (!product.title) {
        skippedNoTitle++;
        console.log(`[Orchestrator] Skipping item without title: ${JSON.stringify(item).substring(0, 200)}`);
        continue;
      }

      // Skip CMS draft/duplicate artifacts. Headless CMSes (Storyblok, Contentful,
      // Strapi) frequently expose draft or duplicated entries as top-level items
      // in the same API response as real content. They have titles like
      // "Foo Copy", "Foo - Copy", or "Foo (draft)" and no product data.
      // These polluted GMSV on 2026-04-02 ("GMSV", "GMSV Copy", "Testing Rule
      // Copy (draft)") before the upsertProduct empty-row guard landed.
      if (/\(draft\)/i.test(product.title) || /\s-?\s*Copy\s*$/i.test(product.title)) {
        console.log(`[Orchestrator] Skipping CMS draft/copy artifact: "${product.title}"`);
        continue;
      }

      products.push(product);
    }
    
    if (skippedNoTitle > 0) {
      console.log(`[Orchestrator] Skipped ${skippedNoTitle} items without title`);
    }

    return products;
  }

  /**
   * Check if data is Ford AEM vehiclesmenu.data format.
   */
  private isAemVehicleMenuData(data: any): boolean {
    if (!data) return false;

    // Ford AU format: Array of category objects with nameplates
    // [{ category: "Trucks", nameplates: [...] }, ...]
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first && typeof first === 'object') {
        // Check for Ford's nameplates structure
        if (first.nameplates || first.category || first.vehicleCategories) {
          return true;
        }
      }
    }

    if (typeof data !== 'object') return false;

    // AEM vehiclesmenu typically has categories or navItems with vehicle entries
    const hasCategories = Array.isArray(data.categories) || Array.isArray(data.navItems) ||
                          Array.isArray(data.vehicleCategories) || Array.isArray(data.menuItems);

    // Or nested object with child nodes containing vehicle data
    const hasNestedItems = Object.keys(data).some(key => {
      const child = data[key];
      return child && typeof child === 'object' &&
             (child.vehicles || child.items || child.models || child.nameplates || Array.isArray(child));
    });

    // Check for AEM-specific markers
    const hasAemMarkers = data[':type'] || data['jcr:primaryType'] || data['sling:resourceType'];

    return hasCategories || hasNestedItems || hasAemMarkers;
  }

  /**
   * Extract vehicle items from Ford AEM vehiclesmenu.data format.
   */
  private extractAemVehicleMenuItems(data: any): any[] {
    const items: any[] = [];

    // Ford AU format: Array of category objects with nameplates
    // Structure: [{ category: "Trucks", nameplates: [{ code, name, image, pricing, ... }] }]
    if (Array.isArray(data)) {
      for (const categoryObj of data) {
        if (categoryObj && typeof categoryObj === 'object') {
          const categoryName = categoryObj.category || categoryObj.name || categoryObj.title;
          const nameplates = categoryObj.nameplates || categoryObj.vehicles || categoryObj.items || [];

          for (const np of (Array.isArray(nameplates) ? nameplates : [])) {
            items.push({
              ...np,
              category: categoryName,
              // Normalize Ford-specific fields
              title: np.name,
              bodyType: np.bodyType?.[0] || categoryName,
              vehicleType: np.vehicleType?.[0] || categoryName,
              // Extract price from Ford's nested structure
              priceText: np.pricing?.min?.priceVat || np.pricing?.min?.price,
              // Build full image URL
              imageUrl: np.image?.startsWith('/') ? `https://www.ford.com.au${np.image}` : np.image,
              // Build source URL from path
              sourceUrl: np.path?.startsWith('/') ? `https://www.ford.com.au${np.path.replace('/content/ecomm-img', '')}` : np.path,
              // CTA link for build & price
              ctaLink: np.additionalCTA,
            });
          }
        }
      }
      console.log(`[Orchestrator] Ford nameplates extraction found ${items.length} vehicles`);
      // Log all extracted vehicle names for debugging
      const vehicleNames = items.map((i: any) => i.title).filter(Boolean);
      console.log(`[Orchestrator] Extracted vehicles: ${vehicleNames.join(', ')}`);
      
      // Log by category for debugging
      const byCategory: Record<string, string[]> = {};
      for (const item of items) {
        const cat = item.category || 'Unknown';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(item.title);
      }
      console.log(`[Orchestrator] By category:`);
      for (const [cat, names] of Object.entries(byCategory)) {
        console.log(`[Orchestrator]   ${cat}: ${names.join(', ')}`);
      }
      
      return items;
    }

    // Handle wrapped categories object
    const categories = data.categories || data.navItems || data.vehicleCategories || data.menuItems || [];

    for (const category of (Array.isArray(categories) ? categories : [])) {
      // Each category may have vehicles/items/nameplates
      const categoryItems = category.nameplates || category.vehicles || category.items || category.models ||
                            category.children || category.entries || [];

      for (const item of (Array.isArray(categoryItems) ? categoryItems : [])) {
        items.push({
          ...item,
          category: category.name || category.title || category.label || category.category,
          bodyType: item.bodyType?.[0] || category.type || category.bodyType,
        });
      }
    }

    // Handle nested object structure (common in AEM)
    if (items.length === 0 && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(':') || key.startsWith('jcr:') || key.startsWith('sling:')) continue;

        if (Array.isArray(value)) {
          // Direct array of items
          for (const item of value) {
            if (item && typeof item === 'object' && (item.name || item.title || item.model)) {
              items.push(item);
            }
          }
        } else if (value && typeof value === 'object') {
          // Nested object - could be a category or a single vehicle
          const nestedItems = (value as any).nameplates || (value as any).vehicles || (value as any).items || (value as any).models;
          if (Array.isArray(nestedItems)) {
            for (const item of nestedItems) {
              items.push({
                ...item,
                category: key,
              });
            }
          } else if ((value as any).name || (value as any).title || (value as any).model) {
            // It's a single vehicle entry
            items.push({
              ...value,
              category: key,
            });
          }
        }
      }
    }

    console.log(`[Orchestrator] AEM vehicle menu extraction found ${items.length} vehicles`);
    return items;
  }

  /**
   * Check if data is AEM content structure.
   */
  private isAemContentStructure(data: any): boolean {
    if (!data || typeof data !== 'object') return false;

    // Check for jcr:content or similar AEM patterns
    return !!(data['jcr:content'] || data['cq:template'] || data['sling:resourceType'] ||
              data.root || data.container || data.responsivegrid);
  }

  /**
   * Extract items from AEM content structure.
   */
  private extractAemContentItems(data: any): any[] {
    const items: any[] = [];

    // Recursively search for vehicle/product data in AEM structure
    this.recursiveAemExtract(data, items, 0);

    return items;
  }

  /**
   * Recursively extract vehicle data from AEM content structure.
   */
  private recursiveAemExtract(obj: any, items: any[], depth: number): void {
    if (!obj || typeof obj !== 'object' || depth > 10) return;

    // Check if this object looks like a vehicle/product
    const hasVehicleData = obj.name || obj.title || obj.modelName || obj.vehicleName;
    const hasPrice = obj.price || obj.msrp || obj.priceText || obj.startingPrice;
    const hasImage = obj.image || obj.imageUrl || obj.thumbnailImage;

    if (hasVehicleData && (hasPrice || hasImage)) {
      items.push(obj);
      return; // Don't recurse into already-captured items
    }

    // Recurse into arrays
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.recursiveAemExtract(item, items, depth + 1);
      }
      return;
    }

    // Recurse into object properties
    for (const [key, value] of Object.entries(obj)) {
      // Skip AEM metadata keys
      if (key.startsWith(':') || key.startsWith('jcr:') || key.startsWith('sling:') || key.startsWith('cq:')) {
        continue;
      }
      this.recursiveAemExtract(value, items, depth + 1);
    }
  }

  /**
   * Extract numeric price from string (e.g., "From $45,990" -> 45990)
   */
  private extractPriceFromString(priceStr: string | undefined): number | undefined {
    if (!priceStr) return undefined;

    // Remove currency symbols, commas, and extract number
    const match = priceStr.replace(/[,$]/g, '').match(/(\d+(?:\.\d{2})?)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }

  /**
   * Extract offers from API JSON response.
   */
  private extractOffersFromApiResponse(data: any): any[] {
    const offers: any[] = [];

    let items: any[] = [];

    if (Array.isArray(data)) {
      items = data;
    } else if (data.data && Array.isArray(data.data)) {
      items = data.data;
    } else if (data.offers && Array.isArray(data.offers)) {
      items = data.offers;
    } else if (data.promotions && Array.isArray(data.promotions)) {
      items = data.promotions;
    } else if (data.deals && Array.isArray(data.deals)) {
      items = data.deals;
    }

    for (const item of items) {
      const offer = {
        title: item.name || item.title || item.headline,
        description: item.description || item.details,
        offer_type: item.type || item.offer_type,
        applicable_models: item.models || item.applicable_models || [],
        price: {
          amount: item.price || item.amount,
          saving_amount: item.saving || item.discount || item.savings,
          raw_string: item.priceDisplay,
        },
        validity: {
          start_date: item.startDate || item.start_date,
          end_date: item.endDate || item.end_date,
          raw_string: item.validityText || item.terms,
        },
        cta_text: item.ctaText || item.cta_text || 'View Offer',
        cta_url: item.ctaUrl || item.cta_url || item.url,
        disclaimer_text: item.disclaimer || item.terms,
      };

      if (offer.title) {
        offers.push(offer);
      }
    }

    return offers;
  }

  /**
   * Merge API extraction results with HTML extraction results.
   */
  private mergeApiResults(
    htmlResult: PageExtractionResult,
    apiResult: PageExtractionResult
  ): PageExtractionResult {
    // API results take precedence when available
    const apiProducts = apiResult.products.data || [];
    const apiOffers = apiResult.offers.data || [];

    return {
      ...htmlResult,
      products: apiProducts.length > 0 ? apiResult.products : htmlResult.products,
      offers: apiOffers.length > 0 ? apiResult.offers : htmlResult.offers,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async getDuePages(oemId: OemId, pageTypes?: PageType[]): Promise<SourcePage[]> {
    console.log(`[Orchestrator] Querying source_pages for ${oemId}${pageTypes ? ` (types: ${pageTypes.join(', ')})` : ''}...`);
    let query = this.config.supabaseClient
      .from('source_pages')
      .select('*')
      .eq('oem_id', oemId)
      .eq('status', 'active');

    // Filter by page types when a specific crawl type is targeted
    if (pageTypes && pageTypes.length > 0) {
      query = query.in('page_type', pageTypes);
    }

    const { data, error } = await query
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(100);

    if (error) {
      console.error(`[Orchestrator] Source pages query error:`, error);
      throw new Error(`Failed to fetch source pages: ${error.message}`);
    }

    console.log(`[Orchestrator] Found ${data?.length || 0} active pages for ${oemId}`);

    // Filter to only pages that are due
    const duePages = (data || []).filter((page: SourcePage) => {
      const check = this.scheduler.shouldCrawl(page);
      return check.shouldCrawl;
    });
    console.log(`[Orchestrator] ${duePages.length} pages are due for crawl`);
    return duePages;
  }

  private async fetchHtml(url: string): Promise<string> {
    // AbortSignal.timeout() propagates cancellation into the underlying
    // fetch so a hung connection actually releases the CPU instead of
    // just rejecting the outer Promise wrapper.
    // Full Chrome fingerprint + Sec-Fetch headers — Akamai-fronted sites
    // (ford.com.au, others) serve stripped fallback HTML to anything that
    // looks bot-shaped. A complete browser-like header set dodges that.
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Render a page with smart mode network interception.
   * Captures all network requests to discover internal APIs.
   */
  private async renderPageSmartMode(url: string, oemId: OemId): Promise<SmartModeResult> {
    console.log(`[Orchestrator] Smart mode: Launching browser for ${url}`);

    let browser;
    try {
      // Dynamic import to avoid initialization issues
      const puppeteerModule = await import('@cloudflare/puppeteer');
      const puppeteer = puppeteerModule.default;
      browser = await puppeteer.launch(this.config.browser as any);
      console.log(`[Orchestrator] Browser launched successfully`);
    } catch (launchError) {
      console.error(`[Orchestrator] Browser launch failed:`, launchError);
      // Return basic result without network capture
      return this.renderPageBasic(url);
    }

    const networkRequests: NetworkRequest[] = [];
    const networkResponses: NetworkResponse[] = [];
    let pendingResponseHandlers = 0;
    const responsePromises: Promise<void>[] = [];

    try {
      console.log(`[Orchestrator] Creating new page...`);
      const page = await browser.newPage();
      console.log(`[Orchestrator] Page created successfully`);

      // Set viewport and user agent with stealth mode to bypass bot detection
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
      );

      // Set realistic headers to bypass bot detection (Akamai, etc.)
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      });

      // Emulate navigator properties to avoid bot detection
      await page.evaluateOnNewDocument(() => {
        // Override webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-AU', 'en'],
        });

        // Add chrome property
        (window as any).chrome = { runtime: {} };
      });

      // Known cross-origin API domains for OEMs (Ford uses imgservices.ford.com)
      const knownApiDomains = [
        'imgservices.ford.com',
        'api.ford.com',
        'ford-api.com',
        'api.toyota.com',
        'api.hyundai.com',
        'api.kia.com',
        'api.mazda.com',
      ];

      // Try to enable request interception to capture network traffic
      let interceptionEnabled = false;
      try {
        await page.setRequestInterception(true);
        interceptionEnabled = true;
        console.log(`[Orchestrator] Request interception enabled`);
      } catch (interceptError) {
        console.warn(`[Orchestrator] Request interception not supported:`, interceptError);
      }

      // Capture all requests (only if interception is enabled)
      if (interceptionEnabled) {
        page.on('request', (request) => {
          const requestUrl = request.url();
          const resourceType = request.resourceType();
          const method = request.method();

          // Check if this is a cross-origin API request
          const isCrossOriginApi = knownApiDomains.some(domain => requestUrl.includes(domain));
          const isApiPath = requestUrl.includes('/api/') || requestUrl.includes('/v1/') || requestUrl.includes('/v2/');
          // AEM (Adobe Experience Manager) patterns - Ford uses .data endpoints
          const isAemDataEndpoint = requestUrl.endsWith('.data') || requestUrl.includes('.data?');
          const isAemContentPath = requestUrl.includes('/content/') && !requestUrl.match(/\.(js|css|png|jpg|gif|svg|woff|woff2)$/);
          const isDataRequest = ['POST', 'PUT', 'PATCH'].includes(method) ||
                                (method === 'GET' && (isApiPath || isAemDataEndpoint || isAemContentPath));

          // Log ALL requests for debugging
          if (isCrossOriginApi || isApiPath || isAemDataEndpoint || isAemContentPath || ['xhr', 'fetch'].includes(resourceType)) {
            console.log(`[SmartMode] REQUEST: ${method} ${resourceType} ${requestUrl.substring(0, 120)}`);
            if (isAemDataEndpoint) {
              console.log(`[SmartMode]   ^ AEM .data endpoint`);
            }
            if (isAemContentPath) {
              console.log(`[SmartMode]   ^ AEM content path`);
            }
            if (request.postData()) {
              console.log(`[SmartMode]   POST body: ${request.postData()?.substring(0, 200)}...`);
            }
          }

          // Track XHR, fetch, document requests AND cross-origin API requests AND AEM endpoints
          if (['xhr', 'fetch', 'document', 'script'].includes(resourceType) || isCrossOriginApi || isDataRequest || isAemDataEndpoint || isAemContentPath) {
            networkRequests.push({
              url: requestUrl,
              method: method,
              headers: request.headers(),
              postData: request.postData(),
              resourceType,
              timestamp: Date.now(),
            });
          }
          request.continue();
        });
      }

      // Capture all responses (response events work even without interception)
      page.on('response', (response) => {
        // Track this handler as pending
        pendingResponseHandlers++;
        const handlerPromise = (async () => {
          try {
          const request = response.request();
          const resourceType = request.resourceType();
          const responseUrl = response.url();
          const method = request.method();
          const contentType = response.headers()['content-type'] || null;

          // Check if this is a cross-origin API response
          const isCrossOriginApi = knownApiDomains.some(domain => responseUrl.includes(domain));
          const isApiPath = responseUrl.includes('/api/') || responseUrl.includes('/v1/') || responseUrl.includes('/v2/');
          // AEM (Adobe Experience Manager) patterns - Ford uses .data endpoints
          const isAemDataEndpoint = responseUrl.endsWith('.data') || responseUrl.includes('.data?');
          const isAemContentPath = responseUrl.includes('/content/') && !responseUrl.match(/\.(js|css|png|jpg|gif|svg|woff|woff2)$/);
          const isJsonResponse = contentType?.includes('application/json') || contentType?.includes('text/json');
          const isDataMethod = ['POST', 'PUT', 'PATCH'].includes(method);

          // Track responses for XHR/fetch requests AND cross-origin API responses
          const shouldTrack = ['xhr', 'fetch'].includes(resourceType) ||
                              isCrossOriginApi ||
                              isAemDataEndpoint ||
                              (isAemContentPath && isJsonResponse) ||
                              (isApiPath && isJsonResponse) ||
                              (isDataMethod && isJsonResponse);

          if (shouldTrack) {
            let body: string | undefined;

            // Log the response for debugging
            console.log(`[SmartMode] RESPONSE: ${response.status()} ${method} ${resourceType} ${responseUrl.substring(0, 100)}`);
            if (isCrossOriginApi) {
              console.log(`[SmartMode]   ^ Cross-origin API detected!`);
            }
            if (isAemDataEndpoint) {
              console.log(`[SmartMode]   ^ AEM .data endpoint detected!`);
            }
            if (isAemContentPath) {
              console.log(`[SmartMode]   ^ AEM content path detected!`);
            }

            // Try to get response body for JSON responses
            if (isJsonResponse) {
              try {
                body = await response.text();
                console.log(`[SmartMode]   Body captured: ${body?.length || 0} chars`);
                // Log first 200 chars of body for debugging
                if (body && body.length > 0) {
                  console.log(`[SmartMode]   Preview: ${body.substring(0, 200)}...`);
                }
              } catch (e) {
                // Cross-origin responses may fail to get body - log but continue
                console.log(`[SmartMode]   Failed to get body (likely CORS): ${e}`);
                // For cross-origin APIs, we still want to track the URL even without body
              }
            }

            networkResponses.push({
              url: responseUrl,
              status: response.status(),
              statusText: response.statusText(),
              headers: response.headers(),
              contentType,
              body,
              bodySize: parseInt(response.headers()['content-length'] || '0', 10),
              timestamp: Date.now(),
            });
          }
        } catch (responseError) {
          console.warn(`[SmartMode] Error processing response:`, responseError);
        } finally {
          pendingResponseHandlers--;
        }
        })();
        responsePromises.push(handlerPromise);
      });

      // Track performance metrics
      let domContentLoaded = 0;
      let loadComplete = 0;

      page.on('domcontentloaded', () => {
        domContentLoaded = Date.now();
      });

      page.on('load', () => {
        loadComplete = Date.now();
      });

      const startTime = Date.now();

      // Navigate with timeout
      console.log(`[Orchestrator] Navigating to ${url}...`);
      try {
        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 15000,
        });
        console.log(`[Orchestrator] Initial navigation complete`);

        // Brief wait for delayed API calls (some OEM sites lazy-load data)
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Quick scroll to trigger lazy-loaded content
        try {
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight / 2);
          });
          await new Promise(resolve => setTimeout(resolve, 500));
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log(`[Orchestrator] Scroll triggers complete`);
        } catch (scrollErr) {
          console.warn(`[Orchestrator] Scroll failed:`, scrollErr);
        }

        console.log(`[Orchestrator] Navigation and scroll complete`);
      } catch (navError) {
        console.warn(`[Orchestrator] Navigation warning:`, navError);
        // Try to get content anyway
      }

      // Get the full HTML content
      const html = await page.content();
      console.log(`[Orchestrator] Got page content: ${html.length} chars`);

      // Wait for response handlers with a timeout (5s max — don't let hanging responses block the crawl)
      console.log(`[Orchestrator] Waiting for ${pendingResponseHandlers} pending response handlers (5s max)...`);
      await Promise.race([
        Promise.all(responsePromises),
        new Promise<void>(resolve => setTimeout(resolve, 5000)),
      ]);
      console.log(`[Orchestrator] Response handlers done or timed out, ${networkResponses.length} responses captured`);

      // Analyze captured responses to identify API candidates
      const apiCandidates = this.analyzeApiCandidates(networkResponses, oemId);

      console.log(`[Orchestrator] Smart mode complete for ${url}:`);
      console.log(`  - HTML: ${html.length} chars`);
      console.log(`  - Network requests: ${networkRequests.length}`);
      console.log(`  - Network responses: ${networkResponses.length}`);
      console.log(`  - API candidates: ${apiCandidates.length}`);

      // Log all requests for debugging (including POST/PUT to cross-origin)
      const postPutRequests = networkRequests.filter((r) => ['POST', 'PUT', 'PATCH'].includes(r.method));
      if (postPutRequests.length > 0) {
        console.log(`  - POST/PUT/PATCH requests found:`);
        postPutRequests.forEach((r) => {
          console.log(`    * ${r.method} ${r.url.substring(0, 100)}`);
          if (r.postData) {
            console.log(`      Body: ${r.postData.substring(0, 150)}...`);
          }
        });
      } else {
        console.log(`  - No POST/PUT/PATCH requests captured`);
      }

      // Log cross-origin requests specifically
      const crossOriginRequests = networkRequests.filter((r) =>
        r.url.includes('imgservices.ford.com') ||
        r.url.includes('api.ford.com')
      );
      if (crossOriginRequests.length > 0) {
        console.log(`  - Cross-origin Ford API requests:`);
        crossOriginRequests.forEach((r) => {
          console.log(`    * ${r.method} ${r.url}`);
        });
      } else {
        console.log(`  - No cross-origin Ford API requests captured`);
      }

      // Log AEM .data endpoint requests
      const aemDataRequests = networkRequests.filter((r) =>
        r.url.endsWith('.data') || r.url.includes('.data?')
      );
      if (aemDataRequests.length > 0) {
        console.log(`  - AEM .data endpoint requests:`);
        aemDataRequests.forEach((r) => {
          console.log(`    * ${r.method} ${r.url}`);
        });
      } else {
        console.log(`  - No AEM .data endpoint requests captured`);
      }

      // Log all JSON responses for debugging
      const jsonResponses = networkResponses.filter((r) => r.contentType?.includes('json'));
      if (jsonResponses.length > 0) {
        console.log(`  - JSON responses found:`);
        jsonResponses.forEach((r) => {
          console.log(`    * ${r.url} (${r.bodySize || r.body?.length || 0} bytes)`);
        });
      } else {
        console.log(`  - No JSON responses captured`);
      }

      // Log all captured URLs
      console.log(`  - All captured network responses (${networkResponses.length}):`);
      networkResponses.forEach((r) => {
        console.log(`    * [${r.status}] ${r.contentType || 'no-type'}: ${r.url.substring(0, 120)}`);
      });

      return {
        html,
        networkRequests,
        networkResponses,
        apiCandidates,
        performanceMetrics: {
          domContentLoaded: domContentLoaded - startTime,
          loadComplete: loadComplete - startTime,
          firstPaint: null, // Would require additional CDP calls
        },
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Fallback: Render page without network interception.
   * Used when smart mode fails (e.g., browser launch issues).
   */
  private async renderPageBasic(url: string): Promise<SmartModeResult> {
    console.log(`[Orchestrator] Falling back to basic render for ${url}`);

    try {
      // Dynamic import to avoid initialization issues
      const puppeteerModule = await import('@cloudflare/puppeteer');
      const puppeteer = puppeteerModule.default;
      const browser = await puppeteer.launch(this.config.browser as any);
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 30000,
        });

        const html = await page.content();
        console.log(`[Orchestrator] Basic render complete: ${html.length} chars`);

        return {
          html,
          networkRequests: [],
          networkResponses: [],
          apiCandidates: [],
          performanceMetrics: {
            domContentLoaded: 0,
            loadComplete: 0,
            firstPaint: null,
          },
        };
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error(`[Orchestrator] Basic render also failed:`, error);
      // Return minimal result with fetched HTML
      const html = await this.fetchHtml(url);
      return {
        html,
        networkRequests: [],
        networkResponses: [],
        apiCandidates: [],
        performanceMetrics: {
          domContentLoaded: 0,
          loadComplete: 0,
          firstPaint: null,
        },
      };
    }
  }

  /**
   * Render a page using Lightpanda headless browser via raw CDP WebSocket.
   * Lightpanda is a lightweight Zig-based browser (Zig + V8) — 11x faster,
   * 9x less memory than Chrome. Uses raw CDP because Lightpanda supports
   * only 1 connection per process and puppeteer/playwright open multiple.
   *
   * Falls back to Cloudflare Browser (Smart Mode) if Lightpanda is
   * unavailable or if the page fails to render within the timeout.
   */
  private async renderPageLightpanda(url: string, oemId: OemId): Promise<SmartModeResult> {
    const lpUrl = this.config.lightpandaUrl;
    if (!lpUrl) {
      return this.renderPageSmartMode(url, oemId);
    }

    console.log(`[Lightpanda] Rendering ${url}`);
    const startTime = Date.now();
    const TIMEOUT_MS = 15000; // Fast timeout — fall back to Chrome quickly

    try {
      const html = await this.lightpandaCdpNavigate(lpUrl, url, TIMEOUT_MS);
      const loadComplete = Date.now() - startTime;

      // Detect Cloudflare challenge page — Lightpanda can't solve Turnstile
      if (html.includes('cf-mitigated') || html.includes('cf_chl_opt') || html.includes('Just a moment')) {
        console.warn(`[Lightpanda] Got Cloudflare challenge page for ${url} — falling back to Smart Mode`);
        return this.renderPageSmartMode(url, oemId);
      }

      console.log(`[Lightpanda] Success: ${html.length} chars in ${loadComplete}ms for ${url}`);

      // Lightpanda doesn't support network interception yet (beta),
      // so we return HTML only. API discovery will rely on the HTML
      // extraction engine which parses inline JSON and script tags.
      return {
        html,
        networkRequests: [],
        networkResponses: [],
        apiCandidates: [],
        performanceMetrics: {
          domContentLoaded: loadComplete,
          loadComplete,
          firstPaint: null,
        },
      };
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      console.warn(`[Lightpanda] Failed in ${elapsed}ms: ${err?.message || err}`);
      console.log(`[Lightpanda] Falling back to Smart Mode for ${url}`);
      return this.renderPageSmartMode(url, oemId);
    }
  }

  /**
   * Low-level CDP navigation via raw WebSocket to Lightpanda.
   * Uses Target.createTarget → Target.attachToTarget → Page.loadEventFired
   * → Runtime.evaluate to extract HTML.
   */
  private lightpandaCdpNavigate(wsUrl: string, pageUrl: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      // WebSocket is available in Cloudflare Workers runtime
      const ws = new WebSocket(wsUrl);
      let sessionId: string | undefined;
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { ws.close(); } catch {}
          reject(new Error(`CDP timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        try { ws.close(); } catch {}
      };

      ws.addEventListener('open', () => {
        // Step 1: Create a target with the URL (navigates immediately)
        ws.send(JSON.stringify({
          id: 1,
          method: 'Target.createTarget',
          params: { url: pageUrl },
        }));
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        if (resolved) return;
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');

          // Step 2: Target created — attach to it
          if (msg.id === 1 && msg.result?.targetId) {
            ws.send(JSON.stringify({
              id: 2,
              method: 'Target.attachToTarget',
              params: { targetId: msg.result.targetId, flatten: true },
            }));
          }

          // Capture sessionId from attachment
          if (msg.method === 'Target.attachedToTarget') {
            sessionId = msg.params.sessionId;
          }

          // Step 3: Page loaded — extract HTML
          if (msg.method === 'Page.loadEventFired' && sessionId) {
            ws.send(JSON.stringify({
              id: 10,
              method: 'Runtime.evaluate',
              params: { expression: 'document.documentElement.outerHTML' },
              sessionId,
            }));
          }

          // Step 4: HTML received — resolve
          if (msg.id === 10 && msg.result?.result?.value) {
            resolved = true;
            cleanup();
            resolve(msg.result.result.value);
          }

          // Handle CDP errors
          if (msg.id === 1 && msg.error) {
            resolved = true;
            cleanup();
            reject(new Error(`CDP createTarget error: ${msg.error.message}`));
          }
        } catch (parseErr) {
          // Ignore parse errors for binary frames
        }
      });

      ws.addEventListener('error', (err: Event) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`WebSocket error: ${(err as any).message || 'connection failed'}`));
        }
      });

      ws.addEventListener('close', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          reject(new Error('WebSocket closed before page loaded'));
        }
      });
    });
  }

  /**
   * Analyze network responses to identify potential API endpoints.
   */
  private analyzeApiCandidates(responses: NetworkResponse[], oemId: OemId): ApiCandidate[] {
    const candidates: ApiCandidate[] = [];

    for (const response of responses) {
      // Skip non-successful responses
      if (response.status < 200 || response.status >= 300) continue;

      const isJson = response.contentType?.includes('application/json') || false;
      const url = response.url;

      // Skip known non-API endpoints
      if (this.isKnownNonApi(url)) continue;

      // Determine if this looks like a data API
      const isPotentialDataApi = this.isPotentialDataApi(url, response.body, isJson);
      const dataType = isPotentialDataApi ? this.classifyDataType(url, response.body) : null;

      // Calculate confidence score
      const confidence = this.calculateApiConfidence(url, response, isJson, isPotentialDataApi);

      // Include all JSON responses with any confidence > 0.1
      if (isJson || confidence > 0.3) {
        const finalConfidence = Math.max(confidence, isJson ? 0.3 : 0);
        candidates.push({
          url,
          method: 'GET', // Inferred from response
          contentType: response.contentType,
          responseSize: response.bodySize || (response.body?.length ?? 0),
          isJson,
          isPotentialDataApi,
          dataType,
          confidence: finalConfidence,
        });
        console.log(`[Orchestrator] API candidate: ${url.substring(0, 80)} (json=${isJson}, conf=${finalConfidence.toFixed(2)})`);
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    return candidates;
  }

  /**
   * Check if URL is a known non-API endpoint (analytics, tracking, etc.)
   */
  private isKnownNonApi(url: string): boolean {
    const nonApiPatterns = [
      /google-analytics\.com/,
      /googletagmanager\.com/,
      /facebook\.com\/tr/,
      /doubleclick\.net/,
      /hotjar\.com/,
      /newrelic\.com/,
      /sentry\.io/,
      /cloudflare\.com/,
      /cdn\./,
      /fonts\./,
      /\.woff2?$/,
      /\.css$/,
      /\.js$/,
      /\.png$/,
      /\.jpg$/,
      /\.gif$/,
      /\.svg$/,
      /\.ico$/,
    ];

    return nonApiPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Determine if a response looks like a data API.
   */
  private isPotentialDataApi(url: string, body: string | undefined, isJson: boolean): boolean {
    if (!isJson || !body) return false;

    try {
      const data = JSON.parse(body);

      // Check for array of objects (common API pattern)
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        return true;
      }

      // Check for object with data array property
      if (typeof data === 'object' && data !== null) {
        const keys = Object.keys(data);
        const dataKeys = ['data', 'items', 'results', 'vehicles', 'models', 'offers', 'products'];
        if (keys.some((k) => dataKeys.includes(k.toLowerCase()))) {
          return true;
        }
      }

      // Check URL patterns that suggest data APIs
      const apiUrlPatterns = [
        /\/api\//,
        /\/v[0-9]+\//,
        /\/vehicles/,
        /\/models/,
        /\/offers/,
        /\/products/,
        /\/inventory/,
        /\/pricing/,
        /\/stock/,
        /graphql/,
      ];

      if (apiUrlPatterns.some((p) => p.test(url))) {
        return true;
      }
    } catch {
      // Invalid JSON
    }

    return false;
  }

  /**
   * Classify the type of data returned by an API.
   */
  private classifyDataType(
    url: string,
    body: string | undefined
  ): 'products' | 'offers' | 'inventory' | 'pricing' | 'config' | 'other' | null {
    const urlLower = url.toLowerCase();

    // URL-based classification
    if (/vehicles|models|cars|range/.test(urlLower)) return 'products';
    if (/offers|deals|promotions|specials/.test(urlLower)) return 'offers';
    if (/inventory|stock|available/.test(urlLower)) return 'inventory';
    if (/price|pricing|quote|summary/.test(urlLower)) return 'pricing';
    if (/config|settings|feature/.test(urlLower)) return 'config';

    // Ford-specific patterns
    if (/vehicle-features|accessories|nukleus/.test(urlLower)) return 'products';
    if (/polk\/update|configurator/.test(urlLower)) return 'pricing';

    // AEM patterns
    if (/vehiclesmenu\.data|vehicles\.data|models\.data|range\.data/.test(urlLower)) return 'products';
    if (/buildandprice|build-and-price/.test(urlLower)) return 'pricing';

    // Body-based classification
    if (body) {
      try {
        const data = JSON.parse(body);
        const jsonStr = JSON.stringify(data).toLowerCase();

        if (/price|msrp|driveaway/.test(jsonStr) && /vehicle|model|car/.test(jsonStr)) {
          return 'products';
        }
        if (/discount|saving|offer|deal/.test(jsonStr)) {
          return 'offers';
        }
        // Ford-specific: accessories, features, variant data
        if (/accessory|feature|variant|trim|series/.test(jsonStr)) {
          return 'products';
        }
        // Ford pricing data patterns
        if (/totalprice|baseprice|driveway|rrp/.test(jsonStr.replace(/_/g, ''))) {
          return 'pricing';
        }
      } catch {
        // Invalid JSON
      }
    }

    return 'other';
  }

  /**
   * Calculate confidence score for an API candidate.
   */
  private calculateApiConfidence(
    url: string,
    response: NetworkResponse,
    isJson: boolean,
    isPotentialDataApi: boolean
  ): number {
    let confidence = 0;

    // Base score for JSON responses
    if (isJson) confidence += 0.3;

    // Boost for data API patterns
    if (isPotentialDataApi) confidence += 0.4;

    // URL pattern scoring
    if (/\/api\//.test(url)) confidence += 0.2;
    if (/\/v[0-9]+\//.test(url)) confidence += 0.1;
    if (/graphql/.test(url)) confidence += 0.3;

    // Known cross-origin API domains get a big boost
    const knownApiDomains = [
      'imgservices.ford.com',
      'api.ford.com',
      'ford-api.com',
    ];
    if (knownApiDomains.some(domain => url.includes(domain))) {
      confidence += 0.5;
    }

    // Ford-specific API patterns (vehicle-features, polk/update, price/summary)
    if (/vehicle-features|accessories|polk|nukleus|price\/.*summary/.test(url)) {
      confidence += 0.4;
    }

    // AEM (Adobe Experience Manager) .data endpoints - very high confidence
    if (/\.data$|\.data\?/.test(url)) {
      confidence += 0.5;
    }

    // AEM content paths with vehicle/model data
    if (/\/content\/.*\/(vehicles|models|range|buildandprice|vehiclesmenu)/.test(url.toLowerCase())) {
      confidence += 0.4;
    }

    // OEM pricing/configurator patterns
    if (/price|pricing|configurator|build.*price|summary/.test(url.toLowerCase())) {
      confidence += 0.3;
    }

    // Response size scoring (larger responses more likely to be data)
    const size = response.bodySize || (response.body?.length ?? 0);
    if (size > 10000) confidence += 0.1;
    if (size > 50000) confidence += 0.1;

    // Penalize if URL looks like a tracking/analytics endpoint
    if (/track|log|analytics|event|metric/.test(url.toLowerCase())) {
      confidence -= 0.3;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Legacy renderPage method - now uses smart mode internally.
   */
  private async renderPage(url: string, oemId: OemId): Promise<string> {
    const result = await this.renderPageSmartMode(url, oemId);

    // Store discovered APIs asynchronously
    if (result.apiCandidates.length > 0) {
      this.storeDiscoveredApis(oemId, url, result.apiCandidates).catch((err) => {
        console.error(`[Orchestrator] Failed to store discovered APIs:`, err);
      });
    }

    return result.html;
  }

  /**
   * Store raw API responses to R2 for debugging.
   */
  private async storeRawResponses(
    oemId: OemId,
    sourceUrl: string,
    responses: NetworkResponse[]
  ): Promise<void> {
    try {
      const jsonResponses = responses.filter(r => r.contentType?.includes('json') && r.body && r.body.length > 100);
      if (jsonResponses.length === 0) return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const key = `raw-responses/${oemId}/${timestamp}.json`;
      
      const data = {
        oemId,
        sourceUrl,
        timestamp: new Date().toISOString(),
        responses: jsonResponses.map(r => ({
          url: r.url,
          status: r.status,
          contentType: r.contentType,
          bodyLength: r.body?.length,
          body: r.body,
        })),
      };

      await this.config.r2Bucket.put(key, JSON.stringify(data, null, 2), {
        httpMetadata: { contentType: 'application/json' },
      });
      
      console.log(`[Orchestrator] Stored ${jsonResponses.length} raw responses to R2: ${key}`);
    } catch (error) {
      console.error(`[Orchestrator] Failed to store raw responses:`, error);
    }
  }

  /**
   * Agentic Ford variant extraction.
   * Crawls each nameplate's Build & Price page to extract detailed variant information.
   */
  private async extractFordVariantsAgentic(nameplates: any[]): Promise<any[]> {
    const allVariants: any[] = [];
    const maxPagesToProcess = 5; // Limit to avoid timeout - process most popular nameplates
    let pagesProcessed = 0;

    // Priority nameplates to extract variants from (most popular Ford AU vehicles)
    const priorityNameplates = ['Ranger', 'Everest', 'Mustang', 'F-150', 'Transit Custom'];

    // Sort nameplates by priority
    const sortedNameplates = [...nameplates].sort((a, b) => {
      const aIdx = priorityNameplates.findIndex(p => a.title?.includes(p));
      const bIdx = priorityNameplates.findIndex(p => b.title?.includes(p));
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    for (const nameplate of sortedNameplates) {
      if (pagesProcessed >= maxPagesToProcess) {
        console.log(`[Orchestrator] Ford variants: Reached max pages limit (${maxPagesToProcess})`);
        break;
      }

      // Get Build & Price URL from nameplate's ctaLink or additionalCTA
      const buildPriceUrl = nameplate.ctaLink || nameplate.source_url;
      if (!buildPriceUrl || !buildPriceUrl.includes('ford.com.au/price')) {
        continue;
      }

      console.log(`[Orchestrator] Ford variants: Crawling ${nameplate.title} at ${buildPriceUrl}`);
      pagesProcessed++;

      try {
        // Use browser rendering to load the Build & Price page and capture network traffic
        const smartResult = await this.renderPageSmartMode(buildPriceUrl, 'ford-au');

        // Look for variant data in network responses
        const jsonResponses = smartResult.networkResponses.filter(
          (r) => r.contentType?.includes('json') && r.body && r.body.length > 500
        );

        console.log(`[Orchestrator] Ford variants: ${nameplate.title} - ${jsonResponses.length} JSON responses captured`);

        // Try to extract variants from each response
        for (const response of jsonResponses) {
          try {
            const data = JSON.parse(response.body || '');
            const variants = this.extractFordVariantsFromResponse(data, nameplate.title);
            if (variants.length > 0) {
              console.log(`[Orchestrator] Ford variants: Found ${variants.length} variants for ${nameplate.title}`);
              allVariants.push(...variants);
              break; // Found variants, move to next nameplate
            }
          } catch (parseError) {
            // Skip invalid JSON
          }
        }

        // Also try to extract from HTML (embedded JSON in React props)
        const htmlVariants = this.extractFordVariantsFromHtml(smartResult.html, nameplate.title);
        if (htmlVariants.length > 0) {
          console.log(`[Orchestrator] Ford variants: Found ${htmlVariants.length} HTML-embedded variants for ${nameplate.title}`);
          // Deduplicate against already found variants
          for (const v of htmlVariants) {
            const exists = allVariants.some(av => av.title?.toLowerCase() === v.title?.toLowerCase());
            if (!exists) {
              allVariants.push(v);
            }
          }
        }

      } catch (crawlError: any) {
        console.error(`[Orchestrator] Ford variants: Error crawling ${nameplate.title}:`, crawlError?.message);
      }
    }

    console.log(`[Orchestrator] Ford variants: Total extracted: ${allVariants.length} from ${pagesProcessed} pages`);
    return allVariants;
  }

  /**
   * Extract Ford variants from a JSON API response.
   */
  private extractFordVariantsFromResponse(data: any, nameplateName: string): any[] {
    const variants: any[] = [];

    // Look for filterData structure (Ford Build & Price configurator)
    const filterData = data.filterData || data.data?.filterData || data;

    // Try to find series/variants in various structures
    const seriesData = filterData?.series || filterData?.variants || filterData?.models ||
                       filterData?.trims || filterData?.grades || data?.vehicles || data?.models;

    if (Array.isArray(seriesData)) {
      for (const series of seriesData) {
        const variantName = series.name || series.title || series.seriesName || series.trimName;
        if (!variantName) continue;

        variants.push({
          title: `${nameplateName} ${variantName}`,
          subtitle: series.description || series.tagline,
          body_type: series.bodyType || series.body || nameplateName,
          fuel_type: series.fuelType || series.powerTrain || series.engine,
          price: {
            amount: series.price || series.msrp || series.startingPrice,
            currency: 'AUD',
            type: 'driveaway',
            raw_string: series.priceDisplay || series.priceText,
          },
          primary_image_url: series.image || series.imageUrl || series.thumbnail,
          external_key: series.code || series.id || series.seriesCode,
          source_url: `https://www.ford.com.au/price/${nameplateName.replace(/\s+/g, '')}`,
          parent_nameplate: nameplateName,
        });
      }
    }

    // Also check for body styles within series
    if (filterData?.bodyStyles || filterData?.bodyTypes) {
      const bodyStyles = filterData.bodyStyles || filterData.bodyTypes;
      if (Array.isArray(bodyStyles)) {
        for (const body of bodyStyles) {
          const series = body.series || body.variants || body.trims || [];
          for (const s of (Array.isArray(series) ? series : [])) {
            const variantName = s.name || s.title;
            const bodyName = body.name || body.title;
            if (!variantName) continue;

            const fullName = bodyName ? `${nameplateName} ${variantName} ${bodyName}` : `${nameplateName} ${variantName}`;
            const exists = variants.some(v => v.title === fullName);
            if (!exists) {
              variants.push({
                title: fullName,
                body_type: bodyName || nameplateName,
                price: {
                  amount: s.price || s.msrp,
                  currency: 'AUD',
                  type: 'driveaway',
                },
                external_key: s.code || s.id,
                source_url: `https://www.ford.com.au/price/${nameplateName.replace(/\s+/g, '')}`,
                parent_nameplate: nameplateName,
              });
            }
          }
        }
      }
    }

    return variants;
  }

  /**
   * Extract Ford variants from embedded JSON in HTML.
   */
  private extractFordVariantsFromHtml(html: string, nameplateName: string): any[] {
    const variants: any[] = [];

    // Try to find JSON data in script tags
    const scriptPattern = /<script[^>]*>([^<]*(?:filterData|series|variants|models)[^<]*)<\/script>/gi;
    let match;

    while ((match = scriptPattern.exec(html)) !== null) {
      try {
        // Try to extract and parse JSON from the script content
        const scriptContent = match[1];

        // Look for series names directly (common Ford pattern)
        const seriesNames = ['XL', 'XLS', 'XLT', 'Sport', 'Wildtrak', 'Platinum', 'Raptor', 'Trend', 'Ambiente'];
        for (const seriesName of seriesNames) {
          const pattern = new RegExp(`"name"\\s*:\\s*"${seriesName}"`, 'i');
          if (pattern.test(scriptContent)) {
            // Check if we already have this variant
            const fullName = `${nameplateName} ${seriesName}`;
            const exists = variants.some(v => v.title === fullName);
            if (!exists) {
              variants.push({
                title: fullName,
                body_type: nameplateName,
                external_key: `${nameplateName.toLowerCase()}-${seriesName.toLowerCase()}`,
                source_url: `https://www.ford.com.au/price/${nameplateName.replace(/\s+/g, '')}`,
                parent_nameplate: nameplateName,
              });
            }
          }
        }
      } catch (e) {
        // Skip invalid content
      }
    }

    return variants;
  }

  /**
   * Expand Ford products into separate variant products.
   * Fetches pricing.data endpoint and creates a product record for EACH variant/trim.
   */
  private async enrichFordProductsWithVariants(products: any[]): Promise<any[]> {
    const expandedProducts: any[] = [];
    const maxToExpand = 10; // Limit to avoid timeout - prioritize popular models
    let expanded = 0;

    // Priority order for variant expansion
    const priorityModels = ['Ranger', 'Everest', 'Mustang', 'F-150', 'Transit Custom', 'Ranger Raptor', 'Transit Van'];
    
    // Sort products by priority
    const sortedProducts = [...products].sort((a, b) => {
      const aIdx = priorityModels.findIndex(p => a.title?.includes(p));
      const bIdx = priorityModels.findIndex(p => b.title?.includes(p));
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    for (const product of sortedProducts) {
      // Always add the base product first
      expandedProducts.push(product);

      if (expanded >= maxToExpand) {
        // Add remaining products without variant expansion
        const remainingIdx = sortedProducts.indexOf(product) + 1;
        if (remainingIdx < sortedProducts.length) {
          expandedProducts.push(...sortedProducts.slice(remainingIdx));
        }
        break;
      }

      // Extract vehicle code from external_key or ctaLink
      let vehicleCode = product.external_key;
      
      // Try to extract from ctaLink if no code
      if (!vehicleCode && product.ctaLink) {
        const match = product.ctaLink.match(/price\/([^/]+)/i);
        if (match) vehicleCode = match[1];
      }

      if (!vehicleCode) {
        continue;
      }

      try {
        // Try to fetch pricing data
        const pricingUrl = `https://www.ford.com.au/content/ford/au/en_au/home/${vehicleCode.toLowerCase().replace(/_/g, '-')}/pricing.data`;
        
        const response = await fetch(pricingUrl, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-AU,en;q=0.9',
            'Referer': 'https://www.ford.com.au/',
            'Origin': 'https://www.ford.com.au',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
          },
        });

        let data: any = null;
        
        if (!response.ok) {
          // Try alternative URL format
          const altUrl = `https://www.ford.com.au/content/ford/au/en_au/home/vehicles/${vehicleCode.toLowerCase().replace(/_/g, '-')}/pricing.data`;
          const altResponse = await fetch(altUrl, { headers: response.headers });
          
          if (altResponse.ok) {
            data = await altResponse.json();
          }
        } else {
          data = await response.json();
        }

        if (!data) {
          continue;
        }

        // Extract variants, colors, features, and gallery images from pricing data
        const variants = this.extractVariantsFromPricingData(data, product.title);
        const colors = this.extractColorsFromPricingData(data);
        const features = this.extractFeaturesFromPricingData(data);
        const galleryImages = this.extractGalleryImagesFromPricingData(data);

        if (variants.length > 0) {
          // Create a separate product for EACH variant
          for (const variant of variants) {
            const variantProduct = {
              ...product,
              // Unique title: "Ranger XL", "Ranger XLT", etc.
              title: `${product.title} ${variant.name}`,
              // Unique external_key for deduplication
              external_key: variant.code || `${product.external_key}-${variant.name.toLowerCase().replace(/\s+/g, '-')}`,
              subtitle: variant.description || product.subtitle,
              price: {
                amount: variant.price?.driveAway || variant.price?.msrp || variant.price?.startingPrice || product.price?.amount,
                currency: 'AUD',
                type: 'driveaway',
                raw_string: variant.price?.driveAway ? `$${variant.price.driveAway}` : product.price?.raw_string,
              },
              // Store parent nameplate reference
              parent_nameplate: product.title,
              // Engine and transmission from variant
              fuel_type: variant.engine || product.fuel_type,
              // Variant-specific metadata
              meta: {
                ...(product.meta || {}),
                parentNameplate: product.title,
                parentExternalKey: product.external_key,
                variantName: variant.name,
                variantCode: variant.code,
                variantDataSource: 'pricing_api',
                bodyType: variant.bodyType || product.body_type,
                transmission: variant.transmission,
                engine: variant.engine,
                availableColors: colors,
                colorCount: colors.length,
                variantFeatures: variant.features || [],
                nameplateFeatures: features,
                // Gallery images
                galleryImages: galleryImages,
                galleryImageCount: galleryImages.length,
                interiorImages: galleryImages.filter((img: any) => img.type === 'interior'),
                exteriorImages: galleryImages.filter((img: any) => img.type === 'exterior'),
              },
              // Variants array contains sibling variants
              variants: variants.map((v: any) => ({
                name: v.name,
                code: v.code,
                price: v.price,
                engine: v.engine,
                transmission: v.transmission,
              })),
            };

            expandedProducts.push(variantProduct);
          }

          expanded++;
          console.log(`[Ford Expand] ${product.title}: Created ${variants.length} variant products with ${galleryImages.length} gallery images`);
        }
      } catch (error: any) {
        console.log(`[Ford Expand] ${product.title}: Error fetching variants - ${error?.message || 'unknown'}`);
      }
    }

    console.log(`[Ford Expand] Total products: ${expandedProducts.length} (${products.length} base + ${expandedProducts.length - products.length} variants)`);
    return expandedProducts;
  }

  /**
   * Extract variant/trim data from Ford pricing API response.
   */
  private extractVariantsFromPricingData(data: any, nameplateName: string): any[] {
    const variants: any[] = [];
    
    // Look for series/grades/trims in various structures
    const seriesData = data.series || data.grades || data.trims || data.variants ||
                       data.data?.series || data.data?.grades || data.data?.trims ||
                       data.filterData?.series || data.filterData?.grades ||
                       data.modelSeries || data.vehicleSeries;

    if (Array.isArray(seriesData)) {
      for (const series of seriesData) {
        const variantName = series.name || series.title || series.gradeName || series.trimName || series.seriesName;
        if (!variantName) continue;

        variants.push({
          name: variantName,
          code: series.code || series.id || series.gradeCode || series.seriesCode || 
                `${nameplateName.toLowerCase().replace(/\s+/g, '-')}-${variantName.toLowerCase().replace(/\s+/g, '-')}`,
          description: series.description || series.tagline || series.subtitle,
          bodyType: series.bodyType || series.bodyStyle || series.body,
          engine: series.engine || series.powerTrain || series.drivetrain || series.engineType,
          engineSize: series.engineSize || series.displacement,
          power: series.power || series.kw || series.horsepower,
          torque: series.torque || series.nm,
          transmission: series.transmission || series.transmissionType || series.gearbox,
          drivetrain: series.drivetrain || series.driveType || series.drive,
          fuelType: series.fuelType || series.fuel || series.powerTrain,
          price: {
            msrp: series.msrp || series.price || series.rrp,
            driveAway: series.driveAwayPrice || series.driveawayPrice || series.driveAway,
            startingPrice: series.startingPrice || series.fromPrice || series.priceFrom,
          },
          features: series.features || series.highlights || series.standardFeatures || [],
          images: series.images || series.imageUrls || series.thumbnails || [],
        });
      }
    }

    // Also check for body styles with nested series
    const bodyStyles = data.bodyStyles || data.bodyTypes || data.data?.bodyStyles || data.bodyStyleOptions;
    if (Array.isArray(bodyStyles)) {
      for (const body of bodyStyles) {
        const bodyName = body.name || body.title || body.style || body.type;
        const bodySeries = body.series || body.grades || body.trims || body.variants || [];
        
        for (const series of bodySeries) {
          const variantName = series.name || series.title || series.grade;
          if (!variantName) continue;

          variants.push({
            name: bodyName ? `${variantName} ${bodyName}` : variantName,
            code: series.code || series.id || `${nameplateName.toLowerCase()}-${variantName.toLowerCase().replace(/\s+/g, '-')}`,
            bodyType: bodyName,
            engine: series.engine || series.powerTrain || series.engineSpec,
            engineSize: series.engineSize || series.displacement,
            transmission: series.transmission || series.gearbox,
            drivetrain: series.drivetrain || series.drive,
            fuelType: series.fuelType || series.fuel,
            price: {
              msrp: series.msrp || series.price,
              driveAway: series.driveAwayPrice || series.driveaway,
              startingPrice: series.startingPrice || series.from,
            },
            features: series.features || series.highlights || [],
          });
        }
      }
    }

    return variants;
  }

  /**
   * Extract color options from Ford pricing API response.
   * Handles Ford's color swatch format with images and hex values.
   */
  private extractColorsFromPricingData(data: any): any[] {
    const colors: any[] = [];
    
    // Try multiple possible locations for color data
    const colorData = data.colors || data.colours || 
                      data.data?.colors || data.data?.colours ||
                      data.colourData || data.colorData || 
                      data.paintOptions || data.paintColours ||
                      data.exteriorColors || data.exteriorColours ||
                      data.colorSwatches || data.colourSwatches ||
                      data.vehicleColors || data.availableColors;

    if (Array.isArray(colorData)) {
      for (const color of colorData) {
        // Handle both object and string formats
        if (typeof color === 'string') {
          colors.push({
            name: color,
            code: null,
            hex: null,
            type: 'standard',
            price: 0,
            image: null,
          });
          continue;
        }

        // Extract swatch image - Ford often uses these fields
        const swatchImage = color.swatchImage || color.swatch || color.thumbnail || 
                           color.image || color.colourImage || color.colorImage ||
                           color.previewImage || color.sampleImage ||
                           (color.images?.[0]) ||
                           (color.swatchImages?.[0]);

        // Extract full-size image if different from swatch
        const fullImage = color.fullImage || color.vehicleImage || color.renderImage ||
                         color.imageUrl || color.imageURL || color.photo ||
                         (color.images?.[1]) || swatchImage;

        colors.push({
          name: color.name || color.label || color.colourName || color.colorName || 
                color.title || color.description,
          code: color.code || color.id || color.colourCode || color.colorCode || 
                color.swatchCode || color.optionCode,
          hex: color.hex || color.colourHex || color.colorHex || color.rgb || 
               color.colourRgb || color.colorRgb || color.htmlColor,
          type: color.type || color.category || color.colourType || color.optionType || 
                (color.isPremium ? 'premium' : color.isMetallic ? 'metallic' : 'standard'),
          price: color.price || color.cost || color.colourPrice || color.optionPrice || 
                 color.priceAdjustment || color.additionalCost || 0,
          // Swatch image (small thumbnail)
          swatchImage: swatchImage,
          // Full-size image of vehicle in this color
          fullImage: fullImage,
          // Generic image field for backward compatibility
          image: swatchImage || fullImage,
          // Ford-specific fields
          fordColorCode: color.fordColourCode || color.fordColorCode,
          paintType: color.paintType || color.finish || color.colourFinish,
          availability: color.availability || color.status || color.inStock,
          // Any additional metadata
          meta: {
            isPremium: color.isPremium || color.premium || false,
            isMetallic: color.isMetallic || color.metallic || false,
            isSpecialOrder: color.isSpecialOrder || color.specialOrder || false,
            orderCode: color.orderCode || color.factoryOrderCode,
          }
        });
      }
    }

    // Also check for legacy Ford format with separate swatches object
    const swatchesData = data.swatches || data.colourSwatches || data.colorSwatches ||
                        data.swatchData || data.paintSwatches;
    if (Array.isArray(swatchesData) && colors.length === 0) {
      for (const swatch of swatchesData) {
        colors.push({
          name: swatch.name || swatch.colourName || swatch.colorName,
          code: swatch.code || swatch.colourCode || swatch.id,
          hex: swatch.hex || swatch.colourHex || swatch.rgb,
          type: swatch.type || 'standard',
          price: swatch.price || swatch.cost || 0,
          swatchImage: swatch.image || swatch.swatchImage || swatch.url || swatch.swatchUrl,
          image: swatch.image || swatch.swatchImage || swatch.url,
        });
      }
    }

    return colors;
  }

  /**
   * Extract feature highlights from Ford pricing API response.
   */
  private extractFeaturesFromPricingData(data: any): string[] {
    const features: string[] = [];
    
    const featureData = data.features || data.highlights || data.keyFeatures ||
                        data.data?.features || data.data?.highlights ||
                        data.vehicleFeatures || data.standardFeatures;

    if (Array.isArray(featureData)) {
      for (const feature of featureData) {
        if (typeof feature === 'string') {
          features.push(feature);
        } else if (feature.name || feature.title || feature.description) {
          features.push(feature.name || feature.title || feature.description);
        }
      }
    }

    return features;
  }

  /**
   * Extract gallery images from Ford pricing API response.
   * Includes exterior shots, interior images, and detail shots.
   */
  private extractGalleryImagesFromPricingData(data: any): any[] {
    const images: any[] = [];
    
    // Try multiple possible locations for gallery/image data
    const galleryData = data.gallery || data.images || data.imageGallery ||
                        data.data?.gallery || data.data?.images ||
                        data.vehicleImages || data.carImages ||
                        data.exteriorImages || data.interiorImages ||
                        data.mediaGallery || data.photoGallery ||
                        data.assetLibrary || data.visualAssets;

    if (Array.isArray(galleryData)) {
      for (const img of galleryData) {
        if (typeof img === 'string') {
          // Simple URL string
          images.push({
            url: img,
            type: 'exterior',
            category: 'gallery',
            alt: null,
          });
          continue;
        }

        // Determine image type/category
        const imageType = img.type || img.imageType || img.category || img.photoType || 'exterior';
        const isInterior = imageType.toLowerCase().includes('interior') || 
                          (img.tags && img.tags.some((t: string) => t.toLowerCase().includes('interior')));
        const isExterior = imageType.toLowerCase().includes('exterior') ||
                          (img.tags && img.tags.some((t: string) => t.toLowerCase().includes('exterior')));
        const isDetail = imageType.toLowerCase().includes('detail') || 
                        imageType.toLowerCase().includes('feature');

        images.push({
          // Image URLs - try multiple fields
          url: img.url || img.src || img.imageUrl || img.imageURL || 
               img.path || img.file || img.location,
          thumbnail: img.thumbnail || img.thumbUrl || img.thumbnailUrl || 
                     img.preview || img.small,
          fullSize: img.fullSize || img.fullUrl || img.highRes || 
                    img.large || img.original,
          // Image metadata
          type: isInterior ? 'interior' : isExterior ? 'exterior' : isDetail ? 'detail' : 'gallery',
          category: img.category || img.section || img.group,
          alt: img.alt || img.altText || img.description || img.caption || img.title,
          // Position/sorting
          position: img.position || img.order || img.sequence || img.index,
          // Tags/labels
          tags: img.tags || img.labels || img.keywords || [],
          // Interior-specific fields
          interiorView: img.interiorView || img.cockpitView || img.dashboardView,
          seatView: img.seatView || img.upholsteryView,
          // Ford-specific
          fordAssetId: img.assetId || img.fordAssetId || img.mediaId,
        });
      }
    }

    // Also look for separate interior images array
    const interiorData = data.interiorImages || data.interiorGallery || 
                        data.cockpitImages || data.cabinImages ||
                        data.data?.interiorImages || data.insideImages;
    
    if (Array.isArray(interiorData)) {
      for (const img of interiorData) {
        const existingUrl = typeof img === 'string' ? img : 
                           (img.url || img.src || img.imageUrl);
        
        // Check if already exists
        if (!images.some((i: any) => i.url === existingUrl)) {
          images.push({
            url: existingUrl,
            thumbnail: typeof img === 'object' ? (img.thumbnail || img.thumbUrl) : null,
            type: 'interior',
            category: img.category || 'interior',
            alt: typeof img === 'object' ? (img.alt || img.description) : null,
            interiorView: typeof img === 'object' ? (img.view || img.angle) : null,
          });
        }
      }
    }

    // Look for exterior images array
    const exteriorData = data.exteriorImages || data.exteriorGallery ||
                        data.outsideImages || data.bodyImages ||
                        data.data?.exteriorImages;
    
    if (Array.isArray(exteriorData)) {
      for (const img of exteriorData) {
        const existingUrl = typeof img === 'string' ? img : 
                           (img.url || img.src || img.imageUrl);
        
        if (!images.some((i: any) => i.url === existingUrl)) {
          images.push({
            url: existingUrl,
            thumbnail: typeof img === 'object' ? (img.thumbnail || img.thumbUrl) : null,
            type: 'exterior',
            category: typeof img === 'object' ? (img.category || img.angle) : 'exterior',
            alt: typeof img === 'object' ? (img.alt || img.description) : null,
          });
        }
      }
    }

    return images;
  }

  /**
   * Capture Ford pricing API data using browser network interception.
   * Navigates to Build & Price page and intercepts the pricing.data API response.
   * 
   * @param vehicleCode The Ford vehicle code (e.g., 'Next-Gen_Ranger-test')
   * @param vehicleName The display name (e.g., 'Ranger')
   * @returns The captured pricing data or null if not found
   */
  private async captureFordPricingApiWithBrowser(
    vehicleCode: string,
    vehicleName: string
  ): Promise<{ data: any; source: string } | null> {
    console.log(`[Ford Pricing Capture] Starting browser capture for ${vehicleName} (${vehicleCode})`);

    // Build the Build & Price URL
    const buildPriceUrl = `https://www.ford.com.au/price/${vehicleName.replace(/\s+/g, '')}`;
    
    try {
      // Use Smart Mode to render the page and capture network traffic
      const smartResult = await this.renderPageSmartMode(buildPriceUrl, 'ford-au');
      
      console.log(`[Ford Pricing Capture] ${vehicleName}: Captured ${smartResult.networkResponses.length} network responses`);

      // Look for pricing.data responses
      const pricingResponses = smartResult.networkResponses.filter((r) =>
        r.url.includes('pricing.data') && r.status === 200 && r.body && r.body.length > 100
      );

      console.log(`[Ford Pricing Capture] ${vehicleName}: Found ${pricingResponses.length} pricing.data responses`);

      // Try each pricing response
      for (const response of pricingResponses) {
        try {
          const data = JSON.parse(response.body || '{}');
          
          // Validate this looks like pricing data (has expected structure)
          if (this.isValidFordPricingData(data)) {
            console.log(`[Ford Pricing Capture] ${vehicleName}: Valid pricing data found!`);
            
            // Store the raw response to R2 for debugging/analysis
            await this.storeFordPricingResponse(vehicleName, vehicleCode, data, response.url);
            
            return { data, source: response.url };
          }
        } catch (parseError) {
          // Skip invalid JSON
          console.log(`[Ford Pricing Capture] ${vehicleName}: Failed to parse response from ${response.url}`);
        }
      }

      // Also check for pricing data embedded in HTML (React hydration data)
      const htmlData = this.extractFordPricingFromHtml(smartResult.html, vehicleName);
      if (htmlData) {
        console.log(`[Ford Pricing Capture] ${vehicleName}: Found pricing data embedded in HTML`);
        await this.storeFordPricingResponse(vehicleName, vehicleCode, htmlData, 'html-embedded');
        return { data: htmlData, source: 'html-embedded' };
      }

      console.log(`[Ford Pricing Capture] ${vehicleName}: No valid pricing data found`);
      
      // Store the raw responses for debugging even if we couldn't parse them
      await this.storeFordPricingDebug(vehicleName, vehicleCode, smartResult.networkResponses);
      
      return null;
    } catch (error: any) {
      console.error(`[Ford Pricing Capture] ${vehicleName}: Error during capture - ${error?.message}`);
      return null;
    }
  }

  /**
   * Validate that data looks like Ford pricing data.
   */
  private isValidFordPricingData(data: any): boolean {
    // Check for common Ford pricing data structures
    const hasSeries = data.series || data.grades || data.trims || data.variants ||
                      data.data?.series || data.data?.grades;
    const hasColors = data.colors || data.colours || data.paintOptions || 
                      data.exteriorColors || data.colorSwatches;
    const hasPricing = data.price || data.pricing || data.msrp || 
                       data.driveAwayPrice || data.startingPrice;
    const hasModels = data.models || data.vehicles || data.nameplates;
    
    return !!(hasSeries || hasColors || hasPricing || hasModels);
  }

  /**
   * Extract Ford pricing data embedded in HTML (React hydration, etc).
   */
  private extractFordPricingFromHtml(html: string, vehicleName: string): any | null {
    // Look for JSON data in script tags that contains pricing/series data
    const patterns = [
      /<script[^>]*>.*?window\.__INITIAL_STATE__\s*=\s*({.*?});.*?<\/script>/s,
      /<script[^>]*>.*?window\.__DATA__\s*=\s*({.*?});.*?<\/script>/s,
      /<script[^>]*type="application\/json"[^>]*>({.*?})<\/script>/s,
      /<script[^>]*>.*?"filterData":\s*({.*?\}).*?<\/script>/s,
      /<script[^>]*>.*?"pricingData":\s*({.*?\}).*?<\/script>/s,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        try {
          // Try to parse the JSON
          const data = JSON.parse(match[1]);
          if (this.isValidFordPricingData(data)) {
            return data;
          }
        } catch (e) {
          // Try with unescaping
          try {
            const unescaped = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
            const data = JSON.parse(unescaped);
            if (this.isValidFordPricingData(data)) {
              return data;
            }
          } catch (e2) {
            // Continue to next pattern
          }
        }
      }
    }

    return null;
  }

  /**
   * Store Ford pricing API response to R2 for debugging and analysis.
   */
  private async storeFordPricingResponse(
    vehicleName: string,
    vehicleCode: string,
    data: any,
    sourceUrl: string
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const key = `ford-pricing/${vehicleCode}/${timestamp}.json`;

      const payload = {
        vehicleName,
        vehicleCode,
        capturedAt: new Date().toISOString(),
        sourceUrl,
        data,
      };

      await this.config.r2Bucket.put(key, JSON.stringify(payload, null, 2), {
        httpMetadata: { contentType: 'application/json' },
      });

      console.log(`[Ford Pricing Capture] Stored pricing data to R2: ${key}`);
    } catch (error) {
      console.error(`[Ford Pricing Capture] Failed to store pricing response:`, error);
    }
  }

  /**
   * Store debug info when pricing capture fails.
   */
  private async storeFordPricingDebug(
    vehicleName: string,
    vehicleCode: string,
    responses: NetworkResponse[]
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const key = `ford-pricing/${vehicleCode}/debug-${timestamp}.json`;

      const payload = {
        vehicleName,
        vehicleCode,
        capturedAt: new Date().toISOString(),
        responses: responses.map(r => ({
          url: r.url,
          status: r.status,
          contentType: r.contentType,
          bodyLength: r.body?.length,
          bodyPreview: r.body?.substring(0, 500),
        })),
      };

      await this.config.r2Bucket.put(key, JSON.stringify(payload, null, 2), {
        httpMetadata: { contentType: 'application/json' },
      });

      console.log(`[Ford Pricing Capture] Stored debug info to R2: ${key}`);
    } catch (error) {
      // Silent fail for debug storage
    }
  }

  /**
   * Enrich Ford products with variants using browser-based pricing API capture.
   * This method navigates to each vehicle's Build & Price page and intercepts
   * the pricing API response to extract variants, colors, and gallery images.
   */
  async enrichFordProductsWithBrowserCapture(products: any[]): Promise<{
    enriched: any[];
    captureResults: Array<{ vehicle: string; success: boolean; variants: number; colors: number; images: number }>;
  }> {
    const enrichedProducts: any[] = [];
    const captureResults: Array<{ vehicle: string; success: boolean; variants: number; colors: number; images: number }> = [];
    
    // Priority vehicles to process
    const priorityVehicles = ['Ranger', 'Everest', 'Mustang', 'F-150', 'Transit Custom'];
    
    // Sort products by priority
    const sortedProducts = [...products].sort((a, b) => {
      const aIdx = priorityVehicles.findIndex(p => a.title?.includes(p));
      const bIdx = priorityVehicles.findIndex(p => b.title?.includes(p));
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    // Limit to avoid timeout
    const maxToProcess = Math.min(5, sortedProducts.length);
    const productsToProcess = sortedProducts.slice(0, maxToProcess);

    console.log(`[Ford Enrich] Processing ${productsToProcess.length} vehicles with browser capture`);

    for (const product of productsToProcess) {
      // Always include the base product
      enrichedProducts.push(product);

      const vehicleCode = product.external_key;
      if (!vehicleCode) {
        console.log(`[Ford Enrich] ${product.title}: No vehicle code, skipping`);
        continue;
      }

      console.log(`[Ford Enrich] Processing ${product.title} (${vehicleCode})`);

      // Capture pricing API using browser
      const captureResult = await this.captureFordPricingApiWithBrowser(vehicleCode, product.title);

      if (!captureResult) {
        console.log(`[Ford Enrich] ${product.title}: Failed to capture pricing data`);
        captureResults.push({ vehicle: product.title, success: false, variants: 0, colors: 0, images: 0 });
        continue;
      }

      // Extract variants, colors, and images
      const variants = this.extractVariantsFromPricingData(captureResult.data, product.title);
      const colors = this.extractColorsFromPricingData(captureResult.data);
      const galleryImages = this.extractGalleryImagesFromPricingData(captureResult.data);

      console.log(`[Ford Enrich] ${product.title}: Found ${variants.length} variants, ${colors.length} colors, ${galleryImages.length} images`);

      captureResults.push({
        vehicle: product.title,
        success: true,
        variants: variants.length,
        colors: colors.length,
        images: galleryImages.length,
      });

      if (variants.length > 0) {
        // Create variant products
        for (const variant of variants) {
          const variantProduct = {
            ...product,
            title: `${product.title} ${variant.name}`,
            external_key: variant.code || `${product.external_key}-${variant.name.toLowerCase().replace(/\s+/g, '-')}`,
            subtitle: variant.description || product.subtitle,
            price: {
              amount: variant.price?.driveAway || variant.price?.msrp || product.price?.amount,
              currency: 'AUD',
              type: 'driveaway',
              raw_string: variant.price?.driveAway ? `$${variant.price.driveAway}` : undefined,
            },
            parent_nameplate: product.title,
            fuel_type: variant.fuelType || variant.engine || product.fuel_type,
            meta: {
              ...(product.meta || {}),
              parentNameplate: product.title,
              parentExternalKey: product.external_key,
              variantName: variant.name,
              variantCode: variant.code,
              variantDataSource: 'browser_capture',
              capturedAt: new Date().toISOString(),
              bodyType: variant.bodyType,
              transmission: variant.transmission,
              engine: variant.engine,
              engineSize: variant.engineSize,
              power: variant.power,
              torque: variant.torque,
              drivetrain: variant.drivetrain,
              availableColors: colors,
              colorCount: colors.length,
              variantFeatures: variant.features || [],
              galleryImages: galleryImages,
              galleryImageCount: galleryImages.length,
            },
            variants: variants.map(v => ({
              name: v.name,
              code: v.code,
              price: v.price,
              engine: v.engine,
              transmission: v.transmission,
            })),
          };

          enrichedProducts.push(variantProduct);
        }

        // Update base product with enrichment data
        product.meta = {
          ...(product.meta || {}),
          hasVariantData: true,
          variantCount: variants.length,
          availableColors: colors,
          colorCount: colors.length,
          galleryImages: galleryImages,
          galleryImageCount: galleryImages.length,
          variantDataSource: 'browser_capture',
          capturedAt: new Date().toISOString(),
        };
      }
    }

    console.log(`[Ford Enrich] Complete: ${enrichedProducts.length} total products (${products.length} base + ${enrichedProducts.length - products.length} variants)`);

    return { enriched: enrichedProducts, captureResults };
  }

  /**
   * Store discovered APIs in the database.
   */
  private async storeDiscoveredApis(
    oemId: OemId,
    sourceUrl: string,
    candidates: ApiCandidate[]
  ): Promise<void> {
    console.log(`[Orchestrator] Storing ${candidates.length} discovered APIs for ${oemId}`);

    // Get source page ID
    const { data: sourcePage } = await this.config.supabaseClient
      .from('source_pages')
      .select('id')
      .eq('url', sourceUrl)
      .eq('oem_id', oemId)
      .maybeSingle();

    for (const candidate of candidates) {
      // Store candidates with confidence >= 0.3
      if (candidate.confidence < 0.3) continue;

      console.log(`[Orchestrator] Storing API: ${candidate.url} (confidence: ${candidate.confidence.toFixed(2)}, type: ${candidate.dataType})`);

      const api: Partial<DiscoveredApi> = {
        id: crypto.randomUUID(),
        oem_id: oemId,
        source_page_id: sourcePage?.id || null,
        url: candidate.url,
        method: candidate.method as any,
        content_type: candidate.contentType,
        response_type: candidate.isJson ? 'json' : 'text',
        data_type: candidate.dataType,
        reliability_score: candidate.confidence,
        status: 'discovered',
        call_count: 1,
        error_count: 0,
        discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Upsert (update if URL already exists)
      const { error } = await this.config.supabaseClient
        .from('discovered_apis')
        .upsert(api, { onConflict: 'oem_id,url' });

      if (error) {
        console.error(`[Orchestrator] Failed to store API ${candidate.url}:`, error);
      }
    }
  }

  private async checkRenderBudget(oemId: OemId): Promise<{ allowed: boolean; reason?: string }> {
    // Get current month's render count for this OEM
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count, error } = await this.config.supabaseClient
      .from('design_captures')
      .select('*', { count: 'exact', head: true })
      .eq('oem_id', oemId)
      .gte('created_at', startOfMonth.toISOString());

    if (error) {
      console.warn('[Orchestrator] Failed to check render budget:', error);
      return { allowed: true }; // Allow on error
    }

    return this.scheduler.checkRenderBudget(oemId, count || 0, count || 0);
  }

  private async runLlmExtraction(
    html: string,
    oemId: OemId,
    page: SourcePage
  ): Promise<Partial<CrawlResult>> {
    const prompt = `
Extract structured automotive data from this HTML page.

OEM: ${oemId}
Page Type: ${page.page_type}
URL: ${page.url}

Return JSON with:
- products: Array of {title, price, availability, body_type, fuel_type}
- offers: Array of {title, description, validity}
- banner_slides: Array of {position, headline, cta_text, image_url}

HTML (truncated):
${html.substring(0, 50000)}
`;

    const response = await this.config.aiRouter.route({
      taskType: 'llm_extraction',
      prompt,
      oemId,
      requireJson: true,
    });

    try {
      return JSON.parse(response.content);
    } catch {
      return {};
    }
  }

  private mergeLlmResults(
    extractionResult: PageExtractionResult,
    llmResult: Partial<CrawlResult>
  ): PageExtractionResult {
    return {
      ...extractionResult,
      products: {
        data: llmResult.products?.length ? llmResult.products : extractionResult.products.data,
        confidence: extractionResult.products.confidence,
        method: llmResult.products?.length ? 'llm' as const : extractionResult.products.method,
        coverage: extractionResult.products.coverage,
      },
      offers: {
        data: llmResult.offers?.length ? llmResult.offers : extractionResult.offers.data,
        confidence: extractionResult.offers.confidence,
        method: llmResult.offers?.length ? 'llm' as const : extractionResult.offers.method,
        coverage: extractionResult.offers.coverage,
      },
      bannerSlides: {
        // Prefer CSS over LLM: the LLM tends to hallucinate nav/menu tiles
        // as banners (e.g. Ford's "Trucks", "SUVs" category buttons), while
        // CSS targets the actual hero carousel (.billboard-item on Ford).
        // Use LLM only when CSS returns nothing.
        data: extractionResult.bannerSlides.data?.length
          ? extractionResult.bannerSlides.data
          : (llmResult.banner_slides?.length ? llmResult.banner_slides : null),
        confidence: extractionResult.bannerSlides.confidence,
        method: extractionResult.bannerSlides.data?.length
          ? extractionResult.bannerSlides.method
          : (llmResult.banner_slides?.length ? 'llm' as const : 'none'),
        coverage: extractionResult.bannerSlides.coverage,
      },
    };
  }

  private async processChanges(
    oemId: OemId,
    page: SourcePage,
    extractionResult: PageExtractionResult
  ): Promise<{ productsUpserted: number, offersUpserted: number, bannersUpserted: number, brochuresUpserted: number, changesFound: number }> {
    let productsUpserted = 0;
    let offersUpserted = 0;
    let bannersUpserted = 0;
    let brochuresUpserted = 0;
    let changesFound = 0;

    // Process products
    if (extractionResult.products?.data) {
      console.log(`[Orchestrator] Processing ${extractionResult.products.data.length} products for ${page.url}`);
      for (const extractedProduct of extractionResult.products.data) {
        try {
          const result = await this.upsertProduct(oemId, page.url, extractedProduct);
          if (result.created || result.updated) {
            productsUpserted++;
          }
          if (result.changeDetected) {
            changesFound++;
          }
          console.log(`[Orchestrator] Upserted product: ${extractedProduct.title} (created: ${result.created}, updated: ${result.updated}, changed: ${result.changeDetected})`);
        } catch (error) {
          console.error(`[Orchestrator] Failed to upsert product ${extractedProduct.title}:`, error);
        }
      }
    }

    // Process offers
    if (extractionResult.offers?.data) {
      console.log(`[Orchestrator] Processing ${extractionResult.offers.data.length} offers for ${page.url}`);
      for (const extractedOffer of extractionResult.offers.data) {
        try {
          const result = await this.upsertOffer(oemId, page.url, extractedOffer);
          if (result.created || result.updated) {
            offersUpserted++;
          }
          if (result.changeDetected) {
            changesFound++;
          }
          console.log(`[Orchestrator] Upserted offer: ${extractedOffer.title} (created: ${result.created}, updated: ${result.updated}, changed: ${result.changeDetected})`);
        } catch (error) {
          console.error(`[Orchestrator] Failed to upsert offer ${extractedOffer.title}:`, error);
        }
      }
    }

    // Process banners
    if (extractionResult.bannerSlides?.data) {
      console.log(`[Orchestrator] Processing ${extractionResult.bannerSlides.data.length} banners for ${page.url}`);
      for (const slide of extractionResult.bannerSlides.data) {
        try {
          const result = await this.upsertBanner(oemId, page.url, slide);
          if (result.created || result.updated) {
            bannersUpserted++;
          }
          if (result.changeDetected) {
            changesFound++;
          }
          console.log(`[Orchestrator] Upserted banner: position ${slide.position} (created: ${result.created}, updated: ${result.updated}, changed: ${result.changeDetected})`);
        } catch (error) {
          console.error(`[Orchestrator] Failed to upsert banner:`, error);
        }
      }

      // Reconcile: prune stale banner rows at positions we didn't see this crawl.
      // Guards against zombie rows from prior bad extractions (e.g. LLM-hallucinated
      // nav tiles). Only runs when we actually got banner data, so a transient
      // extraction failure doesn't wipe the table.
      const currentPositions = extractionResult.bannerSlides.data
        .map((s: any) => s.position)
        .filter((p: unknown) => typeof p === 'number');
      if (currentPositions.length > 0) {
        try {
          const maxPos = Math.max(...currentPositions);
          const { data: pruned, error: pruneError } = await this.config.supabaseClient
            .from('banners')
            .delete()
            .eq('oem_id', oemId)
            .eq('page_url', page.url)
            .gt('position', maxPos)
            .select('id, position, headline');
          if (pruneError) {
            console.error(`[Orchestrator] Banner reconcile failed for ${page.url}:`, pruneError);
          } else if (pruned && pruned.length > 0) {
            console.log(`[Orchestrator] Pruned ${pruned.length} stale banner rows at positions > ${maxPos} for ${page.url}`);
          }
        } catch (e) {
          console.error(`[Orchestrator] Banner reconcile threw for ${page.url}:`, e);
        }
      }
    }

    // Detect banner extraction failure for homepage crawls
    if (
      page.page_type === 'homepage' &&
      (!extractionResult.bannerSlides?.data || extractionResult.bannerSlides.data.length === 0)
    ) {
      const { count: previousBannerCount } = await this.config.supabaseClient
        .from('banners')
        .select('id', { count: 'exact', head: true })
        .eq('oem_id', oemId);

      if (previousBannerCount && previousBannerCount > 0) {
        // Dedup: check if event already exists in last 24h
        const { count: recentEventCount } = await this.config.supabaseClient
          .from('change_events')
          .select('id', { count: 'exact', head: true })
          .eq('oem_id', oemId)
          .eq('event_type', 'banner_extraction_failed')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (!recentEventCount) {
          console.log(`[Orchestrator] Banner extraction returned 0 for ${oemId} homepage (previously had ${previousBannerCount}). Emitting banner_extraction_failed event.`);
          await this.config.supabaseClient.from('change_events').insert({
            id: crypto.randomUUID(),
            entity_type: 'banner',
            entity_id: null,
            oem_id: oemId,
            event_type: 'banner_extraction_failed',
            severity: 'high',
            summary: `Banner extraction returned 0 results for ${oemId} homepage (previously had ${previousBannerCount} banners)`,
            diff_json: {
              selector_used: extractionResult.bannerSlides?.method || 'none',
              page_url: page.url,
              previous_banner_count: previousBannerCount,
            },
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    // Note: brochuresUpserted currently 0 - vehicle models not extracted during crawls
    // Infrastructure ready for when model extraction is implemented

    return { productsUpserted, offersUpserted, bannersUpserted, brochuresUpserted, changesFound };
  }

  private async upsertProduct(
    oemId: OemId,
    sourceUrl: string,
    productData: any
  ): Promise<{ created: boolean, updated: boolean, changeDetected: boolean }> {
    console.log(`[UpsertProduct] Processing: ${productData.title}`);

    // Skip products without external_key — these are bare model-level entries
    // from listing pages that create orphan records with no model_id
    if (!productData.external_key) {
      console.log(`[UpsertProduct] Skipping "${productData.title}" — no external_key (likely a model listing entry)`);
      return { created: false, updated: false, changeDetected: false };
    }

    // Check for existing product
    // Match by oem_id + title (multiple products can come from same source_url)
    const { data: existing, error: queryError } = await this.config.supabaseClient
      .from('products')
      .select('id, title')
      .eq('oem_id', oemId)
      .eq('title', productData.title)
      .maybeSingle();
    
    if (queryError) {
      console.error(`[UpsertProduct] Query error for ${productData.title}:`, queryError);
      return { created: false, updated: false, changeDetected: false };
    }

    // Validate extracted price before upsert — reject obvious anomalies
    let priceAmount = productData.price?.amount;
    if (priceAmount != null) {
      // Reject prices that are clearly wrong
      if (typeof priceAmount !== 'number') priceAmount = parseFloat(priceAmount);
      if (isNaN(priceAmount) || priceAmount < 0) {
        console.warn(`[UpsertProduct] Invalid price ${productData.price?.amount} for "${productData.title}" — setting to null`);
        priceAmount = null;
      } else if (priceAmount > 0 && priceAmount < 1000) {
        // Likely stored in cents or extraction error — don't overwrite existing price
        console.warn(`[UpsertProduct] Suspect low price $${priceAmount} for "${productData.title}" — skipping price update`);
        priceAmount = existing ? undefined : null; // undefined = don't include in update
      } else if (priceAmount > 500000) {
        console.warn(`[UpsertProduct] Suspect high price $${priceAmount} for "${productData.title}" — skipping price update`);
        priceAmount = existing ? undefined : null;
      }
    }

    // Use database column names (meta_json, not meta)
    const product: Record<string, any> = {
      oem_id: oemId,
      external_key: productData.external_key, // Store external key for deduplication
      source_url: sourceUrl,
      title: productData.title,
      subtitle: productData.subtitle,
      variant_name: productData.variant_name ?? null,
      variant_code: productData.variant_code ?? null,
      body_type: productData.body_type,
      fuel_type: productData.fuel_type,
      availability: productData.availability || 'available',
      price_amount: priceAmount,
      price_currency: productData.price?.currency || 'AUD',
      price_type: productData.price?.type,
      price_raw_string: productData.price?.raw_string,
      disclaimer_text: productData.disclaimer_text,
      key_features: productData.key_features || [],
      variants: productData.variants || [],
      cta_links: productData.cta_links || [],
      meta_json: productData.meta || {}, // Database column is meta_json
      specs_json: this.buildSpecsJson(productData),
      engine_size: productData.meta?.engineSize || productData.engine_size || null,
      cylinders: productData.meta?.cylinders ? parseInt(productData.meta.cylinders, 10) || null : null,
      transmission: productData.meta?.transmission || productData.transmission || null,
      drive: productData.meta?.drivetrain || productData.meta?.drive || productData.drive || null,
      drivetrain: productData.meta?.drivetrain || productData.drivetrain || null,
      last_seen_at: new Date().toISOString(),
    };

    // Guard: refuse to CREATE a new row that has no real product data.
    // Updates to existing rows are still allowed (extraction may be transiently
    // shallow). This stops bare-nameplate orphans from polluting the catalog
    // when an upstream API returns model names without trim/price/spec data —
    // the failure mode that produced 7 orphan Ford rows on 2026-04-02.
    if (!existing) {
      const hasPrice = product.price_amount != null && product.price_amount > 0;
      const hasSpecs = product.specs_json && Object.keys(product.specs_json).length > 0;
      const hasFeatures = Array.isArray(product.key_features) && product.key_features.length > 0;
      const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
      if (!hasPrice && !hasSpecs && !hasFeatures && !hasVariants) {
        console.warn(`[UpsertProduct] Refusing to create empty product "${productData.title}" (oem=${oemId}, source=${sourceUrl}) — no price, specs, features, or variants`);
        return { created: false, updated: false, changeDetected: false };
      }
    }

    if (existing) {
      console.log(`[UpsertProduct] Existing product found: ${existing.id}`);
      // Detect changes
      const analysis = this.changeDetector.detectProductChanges(existing, product as Product);
      
      if (analysis) {
        console.log(`[UpsertProduct] Changes detected, updating: ${productData.title}`);
        // Update product
        const { error: updateError } = await this.config.supabaseClient
          .from('products')
          .update(product)
          .eq('id', existing.id);
        
        if (updateError) {
          console.error(`[UpsertProduct] Update error for ${productData.title}:`, updateError);
          return { created: false, updated: false, changeDetected: false };
        }

        // Create version record
        await this.config.supabaseClient
          .from('product_versions')
          .insert({
            product_id: existing.id,
            oem_id: oemId,
            snapshot_json: product,
            content_hash: '', // Would compute proper hash
          });

        // Create change event
        await this.createChangeEvent(oemId, analysis);

        // Queue alert
        this.alertBatcher.add(analysis, oemId);

        // Sync variant_colors from extracted color data
        await this.syncVariantColors(existing.id, oemId, productData);

        return { created: false, updated: true, changeDetected: true };
      } else {
        console.log(`[UpsertProduct] No changes for: ${productData.title}`);
        // Still update last_seen_at
        await this.config.supabaseClient
          .from('products')
          .update({ last_seen_at: product.last_seen_at })
          .eq('id', existing.id);

        // Sync variant_colors even when no product changes — colors may come
        // from a different data source (e.g. pricing API) than the product itself
        await this.syncVariantColors(existing.id, oemId, productData);

        return { created: false, updated: true, changeDetected: false };
      }
    } else {
      console.log(`[UpsertProduct] NEW product, inserting: ${productData.title}`);
      // New product
      product.id = crypto.randomUUID();
      // Note: first_seen_at doesn't exist in schema, using created_at (auto-set by DB)

      const { error: insertError } = await this.config.supabaseClient
        .from('products')
        .insert(product);

      if (insertError) {
        console.error(`[UpsertProduct] Failed to insert ${product.title}:`, insertError);
        return { created: false, updated: false, changeDetected: false };
      }
      console.log(`[UpsertProduct] Successfully inserted: ${product.title} (${product.id})`);

      // Sync variant_colors from extracted color data
      await this.syncVariantColors(product.id, oemId, productData);

      // Create change event for new product
      const analysis = this.changeDetector.detectProductChanges(null, product as Product);
      if (analysis) {
        await this.createChangeEvent(oemId, analysis);
        this.alertBatcher.add(analysis, oemId);
      }
      return { created: true, updated: false, changeDetected: true };
    }
  }

  /**
   * Build a standardized specs_json object from product data and meta fields.
   * Consolidates individual spec columns + meta_json into the canonical shape
   * that page-generator and dealer-api expect.
   */
  private buildSpecsJson(productData: any): Record<string, any> | null {
    const meta = productData.meta || {};
    const specs: Record<string, any> = {};

    // Engine
    const engine: Record<string, any> = {};
    if (meta.engineSize || productData.engine_size) engine.displacement = meta.engineSize || productData.engine_size;
    if (meta.engine || productData.fuel_type) engine.type = meta.engine || productData.fuel_type;
    if (meta.cylinders) engine.cylinders = parseInt(meta.cylinders, 10) || undefined;
    if (meta.power) engine.power = meta.power;
    if (meta.torque) engine.torque = meta.torque;
    if (Object.keys(engine).length > 0) specs.engine = engine;

    // Transmission
    const transmission: Record<string, any> = {};
    if (meta.transmission || productData.transmission) transmission.type = meta.transmission || productData.transmission;
    if (meta.gears) transmission.gears = parseInt(meta.gears, 10) || undefined;
    if (meta.drivetrain || productData.drivetrain) transmission.drivetrain = meta.drivetrain || productData.drivetrain;
    if (Object.keys(transmission).length > 0) specs.transmission = transmission;

    // Dimensions (if available in meta)
    const dimensions: Record<string, any> = {};
    if (meta.length) dimensions.length = meta.length;
    if (meta.width) dimensions.width = meta.width;
    if (meta.height) dimensions.height = meta.height;
    if (meta.wheelbase) dimensions.wheelbase = meta.wheelbase;
    if (meta.groundClearance) dimensions.ground_clearance = meta.groundClearance;
    if (meta.kerbWeight || meta.weight) dimensions.kerb_weight = meta.kerbWeight || meta.weight;
    if (Object.keys(dimensions).length > 0) specs.dimensions = dimensions;

    // Towing (if available)
    const towing: Record<string, any> = {};
    if (meta.towingCapacity || meta.maxTowing) towing.braked = meta.towingCapacity || meta.maxTowing;
    if (meta.unbrakeTowing) towing.unbraked = meta.unbrakeTowing;
    if (meta.payload || meta.maxPayload) towing.payload = meta.payload || meta.maxPayload;
    if (meta.gvm) towing.gvm = meta.gvm;
    if (Object.keys(towing).length > 0) specs.towing = towing;

    // Capacity
    const capacity: Record<string, any> = {};
    if (meta.seats || productData.seats) capacity.seats = parseInt(meta.seats || productData.seats, 10) || undefined;
    if (meta.doors || productData.doors) capacity.doors = parseInt(meta.doors || productData.doors, 10) || undefined;
    if (meta.cargoVolume || meta.bootSpace) capacity.cargo_volume = meta.cargoVolume || meta.bootSpace;
    if (meta.fuelCapacity || meta.tankSize) capacity.fuel_tank = meta.fuelCapacity || meta.tankSize;
    if (Object.keys(capacity).length > 0) specs.capacity = capacity;

    // Performance
    const performance: Record<string, any> = {};
    if (meta.fuelConsumption || meta.fuelEconomy) performance.fuel_consumption = meta.fuelConsumption || meta.fuelEconomy;
    if (meta.co2Emissions) performance.co2_emissions = meta.co2Emissions;
    if (meta.topSpeed) performance.top_speed = meta.topSpeed;
    if (meta.acceleration || meta.zeroToHundred) performance.zero_to_hundred = meta.acceleration || meta.zeroToHundred;
    if (Object.keys(performance).length > 0) specs.performance = performance;

    return Object.keys(specs).length > 0 ? specs : null;
  }

  /**
   * Sync extracted color data into the variant_colors table.
   * Generalizes the pattern from kia-colors.ts to work for all OEMs.
   * Colors are sourced from meta_json.availableColors (set during extraction).
   */
  private async syncVariantColors(
    productId: string,
    oemId: OemId,
    productData: any,
  ): Promise<void> {
    const meta = productData.meta || {};
    const colors: any[] = meta.availableColors || [];

    if (colors.length === 0) return;

    // Skip Kia AU — handled by dedicated kia-colors.ts sync with richer data
    if (oemId === 'kia-au') return;

    const rows = colors
      .filter((c: any) => c.name) // Must have a name at minimum
      .map((c: any, i: number) => ({
        product_id: productId,
        // Use code if available, otherwise generate a slug from the name
        color_code: c.code || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''),
        color_name: c.name,
        color_type: this.normalizeColorType(c.type, c.meta),
        is_standard: c.meta?.isPremium === false || c.type === 'standard' || c.price === 0,
        price_delta: typeof c.price === 'number' ? c.price : 0,
        swatch_url: c.swatchImage || c.image || null,
        hero_image_url: c.fullImage || null,
        gallery_urls: null,
        sort_order: i,
      }));

    if (rows.length === 0) return;

    const { error } = await this.config.supabaseClient
      .from('variant_colors')
      .upsert(rows, { onConflict: 'product_id,color_code' });

    if (error) {
      console.error(`[SyncVariantColors] Failed for ${productData.title} (${productId}):`, error.message);
    } else {
      console.log(`[SyncVariantColors] ${productData.title}: upserted ${rows.length} colors`);
    }
  }

  /**
   * Normalize color type strings from various OEM formats into our canonical set:
   * 'solid' | 'metallic' | 'pearl' | 'matte'
   */
  private normalizeColorType(type: string | undefined, meta?: any): string {
    if (!type && !meta) return 'solid';

    const raw = (type || '').toLowerCase();

    if (meta?.isMetallic || raw.includes('metallic')) return 'metallic';
    if (raw.includes('pearl') || raw.includes('pearlescent')) return 'pearl';
    if (raw.includes('matte') || raw.includes('matt')) return 'matte';
    if (raw.includes('premium') || meta?.isPremium) return 'metallic'; // premium is usually metallic
    if (raw.includes('solid') || raw === 'standard') return 'solid';

    return 'solid';
  }

  private async upsertOffer(
    oemId: OemId,
    sourceUrl: string,
    offerData: any
  ): Promise<{ created: boolean, updated: boolean, changeDetected: boolean }> {
    console.log(`[UpsertOffer] Processing: ${offerData.title}`);

    // Build a content hash for deduplication (title + oem is the match key)
    const now = new Date().toISOString();

    // Check for existing offer by oem_id + title
    const { data: existing, error: queryError } = await this.config.supabaseClient
      .from('offers')
      .select('id, title, price_amount, saving_amount, validity_end, disclaimer_text')
      .eq('oem_id', oemId)
      .eq('title', offerData.title)
      .maybeSingle();

    if (queryError) {
      console.error(`[UpsertOffer] Query error for "${offerData.title}":`, queryError);
      return { created: false, updated: false, changeDetected: false };
    }

    // Map extracted offer data to DB columns
    const offer: Record<string, any> = {
      oem_id: oemId,
      source_url: sourceUrl,
      title: offerData.title,
      description: offerData.description || null,
      offer_type: offerData.offer_type || null,
      applicable_models: offerData.applicable_models || null,
      price_amount: offerData.price?.amount || null,
      price_type: offerData.price?.type || null,
      price_raw_string: offerData.price?.raw_string || null,
      saving_amount: offerData.price?.saving_amount || null,
      validity_start: offerData.validity?.start_date || null,
      validity_end: offerData.validity?.end_date || null,
      validity_raw: offerData.validity?.raw_string || null,
      cta_text: offerData.cta_text || null,
      cta_url: offerData.cta_url || null,
      hero_image_r2_key: offerData.hero_image_url || null,
      disclaimer_text: offerData.disclaimer_text || null,
      disclaimer_html: offerData.disclaimer_html || null,
      eligibility: offerData.eligibility || null,
      last_seen_at: now,
      updated_at: now,
    };

    if (existing) {
      console.log(`[UpsertOffer] Existing offer found: ${existing.id}`);

      // Detect changes
      const analysis = this.changeDetector.detectOfferChanges(existing as any, offer as any);

      if (analysis) {
        console.log(`[UpsertOffer] Changes detected, updating: ${offerData.title}`);

        const { error: updateError } = await this.config.supabaseClient
          .from('offers')
          .update(offer)
          .eq('id', existing.id);

        if (updateError) {
          console.error(`[UpsertOffer] Update error for "${offerData.title}":`, updateError);
          return { created: false, updated: false, changeDetected: false };
        }

        // Create change event and queue alert
        await this.createChangeEvent(oemId, analysis);
        this.alertBatcher.add(analysis, oemId);
        return { created: false, updated: true, changeDetected: true };
      } else {
        console.log(`[UpsertOffer] No changes for: ${offerData.title}`);
        // Still update last_seen_at
        await this.config.supabaseClient
          .from('offers')
          .update({ last_seen_at: now })
          .eq('id', existing.id);
        return { created: false, updated: true, changeDetected: false };
      }
    } else {
      console.log(`[UpsertOffer] NEW offer, inserting: ${offerData.title}`);
      offer.id = crypto.randomUUID();

      const { error: insertError } = await this.config.supabaseClient
        .from('offers')
        .insert(offer);

      if (insertError) {
        console.error(`[UpsertOffer] Failed to insert "${offerData.title}":`, insertError);
        return { created: false, updated: false, changeDetected: false };
      }

      console.log(`[UpsertOffer] Successfully inserted: ${offerData.title} (${offer.id})`);

      // Create change event for new offer
      const analysis = this.changeDetector.detectOfferChanges(null, offer as any);
      if (analysis) {
        await this.createChangeEvent(oemId, analysis);
        this.alertBatcher.add(analysis, oemId);
      }
      return { created: true, updated: false, changeDetected: true };
    }
  }

  private async upsertBanner(
    oemId: OemId,
    pageUrl: string,
    slideData: any
  ): Promise<{ created: boolean, updated: boolean, changeDetected: boolean }> {
    console.log(`[UpsertBanner] Processing: position ${slideData.position} from ${pageUrl}`);

    // Check for existing banner
    // Match by oem_id + page_url + position
    const { data: existing, error: queryError } = await this.config.supabaseClient
      .from('banners')
      .select('id, headline, position, image_url_desktop, image_url_mobile, cta_url')
      .eq('oem_id', oemId)
      .eq('page_url', pageUrl)
      .eq('position', slideData.position || 0)
      .maybeSingle();

    if (queryError) {
      console.error(`[UpsertBanner] Query error for position ${slideData.position}:`, queryError);
      return { created: false, updated: false, changeDetected: false };
    }

    // Prepare banner object
    const banner: Record<string, any> = {
      oem_id: oemId,
      page_url: pageUrl,
      position: slideData.position || 0,
      headline: slideData.headline,
      sub_headline: slideData.sub_headline,
      cta_text: slideData.cta_text,
      cta_url: slideData.cta_url,
      image_url_desktop: slideData.image_url_desktop || slideData.image_url,
      image_url_mobile: slideData.image_url_mobile || slideData.image_url,
      disclaimer_text: slideData.disclaimer_text,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      console.log(`[UpsertBanner] Existing banner found: ${existing.id}`);

      // Simple change detection - check if any user-visible field changed
      const headlineChanged = existing.headline !== banner.headline;
      const desktopImgChanged = (existing as any).image_url_desktop !== banner.image_url_desktop;
      const mobileImgChanged = (existing as any).image_url_mobile !== banner.image_url_mobile;
      const ctaChanged = (existing as any).cta_url !== banner.cta_url;
      const changeDetected = headlineChanged || desktopImgChanged || mobileImgChanged || ctaChanged;

      if (changeDetected) {
        console.log(`[UpsertBanner] Changes detected, updating banner at position ${slideData.position}`);

        const { error: updateError } = await this.config.supabaseClient
          .from('banners')
          .update(banner)
          .eq('id', existing.id);

        if (updateError) {
          console.error(`[UpsertBanner] Update error for position ${slideData.position}:`, updateError);
          return { created: false, updated: false, changeDetected: false };
        }

        return { created: false, updated: true, changeDetected: true };
      } else {
        console.log(`[UpsertBanner] No changes for banner at position ${slideData.position}`);

        // Still update last_seen_at
        await this.config.supabaseClient
          .from('banners')
          .update({ last_seen_at: banner.last_seen_at, updated_at: banner.updated_at })
          .eq('id', existing.id);

        return { created: false, updated: true, changeDetected: false };
      }
    } else {
      console.log(`[UpsertBanner] NEW banner, inserting at position ${slideData.position}`);

      banner.id = crypto.randomUUID();

      const { error: insertError } = await this.config.supabaseClient
        .from('banners')
        .insert(banner);

      if (insertError) {
        console.error(`[UpsertBanner] Failed to insert banner:`, insertError);
        return { created: false, updated: false, changeDetected: false };
      }

      console.log(`[UpsertBanner] Successfully inserted banner: ${banner.id}`);
      return { created: true, updated: false, changeDetected: true };
    }
  }

  private async createChangeEvent(
    oemId: OemId,
    analysis: any
  ): Promise<void> {
    const event: Partial<ChangeEvent> = {
      id: crypto.randomUUID(),
      oem_id: oemId,
      entity_type: analysis.entityType,
      entity_id: analysis.entityId,
      event_type: analysis.eventType,
      severity: analysis.severity,
      summary: analysis.summary,
      diff_json: analysis.fieldChanges,
      created_at: new Date().toISOString(),
    };

    await this.config.supabaseClient
      .from('change_events')
      .insert(event);
  }

  private async sendBatchedAlerts(oemId: OemId): Promise<void> {
    // Send hourly batch
    const hourlyBatch = this.alertBatcher.getHourlyBatch(oemId);
    if (hourlyBatch.length > 0) {
      // TODO: Send Slack batch message
      this.alertBatcher.clearHourly(oemId);
    }
  }

  private async updateSourcePage(
    page: SourcePage,
    htmlHash: string,
    wasRendered: boolean
  ): Promise<void> {
    const updates = this.scheduler.updateAfterCrawl(
      page,
      htmlHash !== page.last_hash,
      wasRendered,
      undefined,
      htmlHash,
    );

    await this.config.supabaseClient
      .from('source_pages')
      .update(updates)
      .eq('id', page.id);
  }

  private async updateSourcePageError(page: SourcePage, error: string): Promise<void> {
    await this.config.supabaseClient
      .from('source_pages')
      .update({
        status: 'error',
        error_message: error,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', page.id);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get cost estimates for all OEMs.
   */
  getCostEstimates(): Array<{
    oemId: OemId;
    pagesMonitored: number;
    estimatedMonthlyCost: number;
  }> {
    const estimates: Array<{ oemId: OemId; pagesMonitored: number; estimatedMonthlyCost: number }> = [];
    // Would fetch actual page counts and calculate
    return estimates;
  }

  /**
   * Trigger a manual crawl for a specific OEM.
   */
  async triggerManualCrawl(oemId: OemId): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.crawlOem(oemId);
      return {
        success: true,
        message: `Crawled ${result.jobsProcessed} pages, ${result.pagesChanged} changed, ${result.errors} errors`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Trigger a design capture for an OEM.
   */
  async triggerDesignCapture(
    oemId: OemId,
    pageType: string
  ): Promise<{ success: boolean; message: string }> {
    // Implementation would use DesignAgent
    return { success: true, message: 'Design capture triggered' };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createOrchestrator(config: {
  supabaseUrl: string;
  supabaseKey: string;
  r2Bucket: R2Bucket;
  browser: Fetcher;
  slackWebhookUrl?: string;
  groqApiKey?: string;
  togetherApiKey?: string;
  moonshotApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  lightpandaUrl?: string;
}): OemAgentOrchestrator {
  // Create Supabase client
  const supabaseClient = {
    from: (table: string) => ({
      select: (columns: string, options?: any) => ({
        eq: (col: string, val: any) => ({
          order: (col: string, opts?: any) => ({
            limit: (n: number) => Promise.resolve({ data: [], error: null }),
          }),
          single: () => Promise.resolve({ data: null, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
        order: (col: string, opts?: any) => ({
          limit: (n: number) => Promise.resolve({ data: [], error: null }),
        }),
      }),
      insert: (data: any) => Promise.resolve({ data: null, error: null }),
      update: (data: any) => ({
        eq: (col: string, val: any) => Promise.resolve({ data: null, error: null }),
      }),
    }),
  };

  // Create AI router
  const aiRouter = new AiRouter({
    groq: config.groqApiKey,
    together: config.togetherApiKey,
    moonshot: config.moonshotApiKey,
    anthropic: config.anthropicApiKey,
    google: config.googleApiKey,
  });

  // Create notifier
  const notifier = config.slackWebhookUrl
    ? new MultiChannelNotifier({ slackWebhookUrl: config.slackWebhookUrl })
    : new MultiChannelNotifier({ slackWebhookUrl: '' });

  return new OemAgentOrchestrator({
    supabaseClient,
    r2Bucket: config.r2Bucket,
    browser: config.browser,
    aiRouter,
    notifier,
    lightpandaUrl: config.lightpandaUrl,
  });
}
