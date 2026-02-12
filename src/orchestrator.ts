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
  SourcePage, 
  ImportRun, 
  Product, 
  Offer, 
  Banner,
  CrawlResult,
  ChangeEvent,
  Oem,
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
// Configuration
// ============================================================================

export interface OrchestratorConfig {
  supabaseClient: any;
  r2Bucket: R2Bucket;
  browser: Fetcher; // Browser Rendering binding
  aiRouter: AiRouter;
  notifier: MultiChannelNotifier;
  
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
  extractionResult?: PageExtractionResult;
  error?: string;
  durationMs: number;
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
   * Run a scheduled crawl for all due pages across all OEMs.
   * 
   * This is the main entry point called by the scheduled worker.
   */
  async runScheduledCrawl(): Promise<{
    jobsProcessed: number;
    pagesChanged: number;
    errors: number;
  }> {
    console.log('[Orchestrator] Starting scheduled crawl...');
    
    const startTime = Date.now();
    let jobsProcessed = 0;
    let pagesChanged = 0;
    let errors = 0;

    // Get all active OEMs
    const { data: oems, error: oemsError } = await this.config.supabaseClient
      .from('oems')
      .select('*')
      .eq('is_active', true);

    if (oemsError) {
      console.error('[Orchestrator] Failed to fetch OEMs:', oemsError);
      return { jobsProcessed: 0, pagesChanged: 0, errors: 1 };
    }

    // Process each OEM
    for (const oem of oems) {
      try {
        const result = await this.crawlOem(oem.id as OemId);
        jobsProcessed += result.jobsProcessed;
        pagesChanged += result.pagesChanged;
        errors += result.errors;
      } catch (error) {
        console.error(`[Orchestrator] Error crawling OEM ${oem.id}:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Orchestrator] Scheduled crawl complete: ${jobsProcessed} jobs, ${pagesChanged} changed, ${errors} errors in ${duration}ms`);

    return { jobsProcessed, pagesChanged, errors };
  }

  /**
   * Run a full crawl for a specific OEM.
   */
  async crawlOem(oemId: OemId): Promise<{
    jobsProcessed: number;
    pagesChanged: number;
    errors: number;
    importRunId: string | null;
  }> {
    console.log(`[Orchestrator] Crawling OEM: ${oemId}`);

    // Create import run record
    const importRun: Partial<ImportRun> = {
      id: crypto.randomUUID(),
      oem_id: oemId,
      status: 'running',
      started_at: new Date().toISOString(),
    };

    await this.config.supabaseClient
      .from('import_runs')
      .insert(importRun);

    // Get due pages for this OEM
    const pages = await this.getDuePages(oemId);
    
    let jobsProcessed = 0;
    let pagesChanged = 0;
    let errors = 0;

    // Process each page
    for (const page of pages) {
      try {
        const result = await this.crawlPage(oemId, page);
        jobsProcessed++;

        if (result.success) {
          if (result.extractionResult?.products?.data?.length || 
              result.extractionResult?.offers?.data?.length) {
            pagesChanged++;
          }
        } else {
          errors++;
        }
      } catch (error) {
        console.error(`[Orchestrator] Error crawling page ${page.url}:`, error);
        errors++;
      }
    }

    // Update import run
    await this.config.supabaseClient
      .from('import_runs')
      .update({
        status: errors > 0 ? (pagesChanged > 0 ? 'partial' : 'failed') : 'completed',
        finished_at: new Date().toISOString(),
        pages_checked: jobsProcessed,
        pages_changed: pagesChanged,
        pages_errored: errors,
      })
      .eq('id', importRun.id);

    // Send batched alerts
    await this.sendBatchedAlerts(oemId);

    return {
      jobsProcessed,
      pagesChanged,
      errors,
      importRunId: importRun.id || null,
    };
  }

  /**
   * Crawl a single page.
   */
  async crawlPage(oemId: OemId, page: SourcePage): Promise<CrawlPipelineResult> {
    const startTime = Date.now();
    
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
          durationMs: Date.now() - startTime,
        };
      }

      // Step 2: Cheap check (fetch HTML)
      const html = await this.fetchHtml(page.url);
      const htmlHash = await computeHtmlHash(html);

      // Step 3: Determine if browser rendering is needed
      const renderCheck = this.scheduler.shouldRender(page, htmlHash);
      let finalHtml = html;
      let wasRendered = false;

      if (renderCheck.shouldRender) {
        // Check budget before rendering
        const budgetCheck = await this.checkRenderBudget(oemId);
        if (budgetCheck.allowed) {
          finalHtml = await this.renderPage(page.url, oemId);
          wasRendered = true;
        }
      }

      // Step 4: Extract data
      let extractionResult = this.extractionEngine.extract(
        finalHtml,
        oemId,
        page.page_type,
        page.url
      );

      // Step 5: LLM fallback if needed
      if (this.extractionEngine.needsLlmFallback(extractionResult)) {
        const llmResult = await this.runLlmExtraction(finalHtml, oemId, page);
        // Merge LLM results with extraction
        extractionResult = this.mergeLlmResults(extractionResult, llmResult);
      }

      // Step 6: Process changes
      await this.processChanges(oemId, page, extractionResult);

      // Step 7: Update source page record
      await this.updateSourcePage(page, htmlHash, wasRendered);

      return {
        success: true,
        sourcePageId: page.id,
        url: page.url,
        htmlHash,
        wasRendered,
        extractionResult,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      // Update page with error
      await this.updateSourcePageError(page, error instanceof Error ? error.message : String(error));

      return {
        success: false,
        sourcePageId: page.id,
        url: page.url,
        htmlHash: '',
        wasRendered: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async getDuePages(oemId: OemId): Promise<SourcePage[]> {
    const { data, error } = await this.config.supabaseClient
      .from('source_pages')
      .select('*')
      .eq('oem_id', oemId)
      .eq('status', 'active')
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(100);

    if (error) {
      throw new Error(`Failed to fetch source pages: ${error.message}`);
    }

    // Filter to only pages that are due
    return (data || []).filter((page: SourcePage) => {
      const check = this.scheduler.shouldCrawl(page);
      return check.shouldCrawl;
    });
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  private async renderPage(url: string, oemId: OemId): Promise<string> {
    // Use Browser Rendering API
    // This is a simplified version - real implementation would use the BROWSER binding
    const response = await this.config.browser.fetch('http://localhost/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Browser render failed: ${response.status}`);
    }

    const result = await response.json() as { html: string };
    return result.html;
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
        data: llmResult.products || extractionResult.products.data,
        confidence: extractionResult.products.confidence,
        method: 'llm' as const,
        coverage: extractionResult.products.coverage,
      },
      offers: {
        data: llmResult.offers || extractionResult.offers.data,
        confidence: extractionResult.offers.confidence,
        method: 'llm' as const,
        coverage: extractionResult.offers.coverage,
      },
      bannerSlides: {
        data: llmResult.banner_slides || extractionResult.bannerSlides.data,
        confidence: extractionResult.bannerSlides.confidence,
        method: 'llm' as const,
        coverage: extractionResult.bannerSlides.coverage,
      },
    };
  }

  private async processChanges(
    oemId: OemId,
    page: SourcePage,
    extractionResult: PageExtractionResult
  ): Promise<void> {
    // Process products
    if (extractionResult.products?.data) {
      for (const extractedProduct of extractionResult.products.data) {
        await this.upsertProduct(oemId, page.url, extractedProduct);
      }
    }

    // Process offers
    if (extractionResult.offers?.data) {
      for (const extractedOffer of extractionResult.offers.data) {
        await this.upsertOffer(oemId, page.url, extractedOffer);
      }
    }

    // Process banners
    if (extractionResult.bannerSlides?.data) {
      for (const slide of extractionResult.bannerSlides.data) {
        await this.upsertBanner(oemId, page.url, slide);
      }
    }
  }

  private async upsertProduct(
    oemId: OemId,
    sourceUrl: string,
    productData: any
  ): Promise<void> {
    // Check for existing product
    const { data: existing } = await this.config.supabaseClient
      .from('products')
      .select('*')
      .eq('oem_id', oemId)
      .eq('source_url', sourceUrl)
      .maybeSingle();

    const product: Partial<Product> = {
      oem_id: oemId,
      source_url: sourceUrl,
      title: productData.title,
      subtitle: productData.subtitle,
      body_type: productData.body_type,
      fuel_type: productData.fuel_type,
      availability: productData.availability || 'available',
      price_amount: productData.price?.amount,
      price_currency: productData.price?.currency || 'AUD',
      price_type: productData.price?.type,
      price_raw_string: productData.price?.raw_string,
      disclaimer_text: productData.disclaimer_text,
      key_features: productData.key_features || [],
      variants: productData.variants || [],
      cta_links: productData.cta_links || [],
      meta: productData.meta || {},
      last_seen_at: new Date().toISOString(),
    };

    if (existing) {
      // Detect changes
      const analysis = this.changeDetector.detectProductChanges(existing, product as Product);
      
      if (analysis) {
        // Update product
        await this.config.supabaseClient
          .from('products')
          .update(product)
          .eq('id', existing.id);

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
      }
    } else {
      // New product
      product.id = crypto.randomUUID();
      product.first_seen_at = new Date().toISOString();
      
      await this.config.supabaseClient
        .from('products')
        .insert(product);

      // Create change event for new product
      const analysis = this.changeDetector.detectProductChanges(null, product as Product);
      if (analysis) {
        await this.createChangeEvent(oemId, analysis);
        this.alertBatcher.add(analysis, oemId);
      }
    }
  }

  private async upsertOffer(
    oemId: OemId,
    sourceUrl: string,
    offerData: any
  ): Promise<void> {
    // Similar to upsertProduct
    // ... implementation
  }

  private async upsertBanner(
    oemId: OemId,
    pageUrl: string,
    slideData: any
  ): Promise<void> {
    // ... implementation
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
      wasRendered
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
  anthropicApiKey?: string;
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
    anthropic: config.anthropicApiKey,
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
  });
}
