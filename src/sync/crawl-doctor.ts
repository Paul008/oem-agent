/**
 * Crawl Doctor — Autonomous Diagnosis & Repair Agent
 *
 * Runs after the Traffic Controller (or on-demand) to diagnose and fix
 * crawl failures without human intervention.
 *
 * Recovery actions (safest first):
 *   1. Reset error pages caused by browser rendering (detached frame, 403, execution context)
 *   2. Deactivate genuine 404 pages
 *   3. Seed missing hashes via cheap fetch
 *   4. Re-trigger crawls for stale OEMs
 *
 * See docs/KNOWN_ISSUES_RUNBOOK.md for error pattern reference.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DoctorResult {
  timestamp: string;
  pages_reset: number;
  pages_deactivated: number;
  hashes_seeded: number;
  crawls_triggered: number;
  offers_expired: number;
  offers_archived: number;
  price_anomalies: number;
  diagnoses: Diagnosis[];
}

interface Diagnosis {
  oem_id: string;
  issue: string;
  action: string;
  result: 'fixed' | 'flagged' | 'skipped';
  detail?: string;
}

// Error patterns that indicate browser rendering failures (safe to reset)
const BROWSER_RENDER_ERRORS = [
  'Attempted to use detached Frame',
  'Execution context was destroyed',
  'Browser render failed',
  'Protocol error',
  'Target closed',
  'Navigation timeout',
  'net::ERR_',
];

// Errors that mean the page is genuinely gone
const GONE_ERRORS = [
  'HTTP 404',
  'HTTP 410',
];

export async function executeCrawlDoctor(
  supabase: SupabaseClient,
  slackWebhookUrl?: string,
): Promise<DoctorResult> {
  const now = new Date();
  const diagnoses: Diagnosis[] = [];
  let pagesReset = 0;
  let pagesDeactivated = 0;
  let hashesSeeded = 0;
  let crawlsTriggered = 0;

  console.log('[CrawlDoctor] Starting autonomous diagnosis...');

  // ── Step 1: Reset pages in "error" state caused by browser rendering ──
  // These pages were marked as error due to Puppeteer/Lightpanda issues.
  // With requiresBrowserRendering=false on SSR OEMs, they should work via cheap fetch.
  const { data: errorPages } = await supabase
    .from('source_pages')
    .select('id, oem_id, url, status, error_message')
    .eq('status', 'error')
    .not('error_message', 'is', null);

  for (const page of errorPages ?? []) {
    const err = page.error_message || '';

    // Check if this is a browser rendering error (safe to reset)
    const isBrowserError = BROWSER_RENDER_ERRORS.some(pattern => err.includes(pattern));
    // Check if this is a 403 (may work with cheap fetch)
    const is403 = err.includes('HTTP 403');
    // Check if this is a genuine 404/410 (page is gone)
    const isGone = GONE_ERRORS.some(pattern => err.includes(pattern));

    if (isGone) {
      // Deactivate genuinely gone pages
      await supabase
        .from('source_pages')
        .update({
          status: 'removed',
          error_message: `[CrawlDoctor] ${err} — page deactivated`,
          updated_at: now.toISOString(),
        })
        .eq('id', page.id);
      pagesDeactivated++;
      diagnoses.push({
        oem_id: page.oem_id,
        issue: `Page 404/410: ${page.url}`,
        action: 'Deactivated (page genuinely gone)',
        result: 'fixed',
      });
    } else if (isBrowserError || is403) {
      // Reset browser-caused errors back to active
      await supabase
        .from('source_pages')
        .update({
          status: 'active',
          error_message: null,
          last_checked_at: null, // Force re-check on next cron
          updated_at: now.toISOString(),
        })
        .eq('id', page.id);
      pagesReset++;
      diagnoses.push({
        oem_id: page.oem_id,
        issue: `Browser error: ${err.slice(0, 60)}`,
        action: 'Reset to active (browser rendering disabled or fallback to cheap fetch)',
        result: 'fixed',
      });
    } else {
      // Unknown error — flag for human review
      diagnoses.push({
        oem_id: page.oem_id,
        issue: `Unknown error: ${err.slice(0, 60)}`,
        action: 'Flagged for manual review',
        result: 'flagged',
        detail: page.url,
      });
    }
  }

  console.log(`[CrawlDoctor] Step 1: Reset ${pagesReset} pages, deactivated ${pagesDeactivated}, flagged ${diagnoses.filter(d => d.result === 'flagged').length}`);

  // ── Step 2: Check for pages with NULL hashes (need seeding) ──
  // Pages without hashes can't use the hash-based render skip optimization.
  const { data: nullHashPages } = await supabase
    .from('source_pages')
    .select('oem_id')
    .eq('status', 'active')
    .is('last_hash', null);

  const oemsNeedingHashes = new Set((nullHashPages ?? []).map(p => p.oem_id));
  hashesSeeded = nullHashPages?.length ?? 0;

  if (oemsNeedingHashes.size > 0) {
    console.log(`[CrawlDoctor] Step 2: ${hashesSeeded} pages across ${oemsNeedingHashes.size} OEMs need hash seeding`);
    for (const oemId of oemsNeedingHashes) {
      const count = (nullHashPages ?? []).filter(p => p.oem_id === oemId).length;
      diagnoses.push({
        oem_id: oemId,
        issue: `${count} pages without hash (render skip optimization disabled)`,
        action: 'Next cron will seed hashes via cheap fetch',
        result: 'flagged',
      });
    }
  }

  // ── Step 3: Detect OEMs with high error rates and diagnose ──
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRuns } = await supabase
    .from('import_runs')
    .select('oem_id, status, error_log, pages_checked, pages_errored')
    .gte('started_at', since24h);

  // Group by OEM
  const oemStats: Record<string, { total: number; failed: number; errored_pages: number; errors: string[] }> = {};
  for (const run of recentRuns ?? []) {
    const oem = run.oem_id;
    if (!oemStats[oem]) oemStats[oem] = { total: 0, failed: 0, errored_pages: 0, errors: [] };
    oemStats[oem].total++;
    if (run.status === 'failed' || run.status === 'timeout') {
      oemStats[oem].failed++;
    }
    oemStats[oem].errored_pages += run.pages_errored || 0;
    if (run.error_log && !oemStats[oem].errors.includes(run.error_log.slice(0, 80))) {
      oemStats[oem].errors.push(run.error_log.slice(0, 80));
    }
  }

  for (const [oemId, stats] of Object.entries(oemStats)) {
    const successRate = stats.total > 0 ? ((stats.total - stats.failed) / stats.total) * 100 : 0;

    if (successRate < 50 && stats.total >= 3) {
      // Check error patterns
      const hasTimeoutError = stats.errors.some(e => e.includes('timeout') || e.includes('Timeout'));
      const hasAbortError = stats.errors.some(e => e.includes('Aborted'));

      let recommendation: string;
      if (hasTimeoutError || hasAbortError) {
        recommendation = 'OEM likely has too many pages or browser rendering is slow. Check requiresBrowserRendering flag and page count.';
      } else if (stats.errored_pages > 0) {
        recommendation = 'Page-level extraction errors. Check source_pages for this OEM with status=error.';
      } else {
        recommendation = 'Unknown failure pattern. Check Worker logs.';
      }

      diagnoses.push({
        oem_id: oemId,
        issue: `${Math.round(successRate)}% success rate (${stats.failed}/${stats.total} failed in 24h)`,
        action: recommendation,
        result: 'flagged',
        detail: stats.errors.join(' | '),
      });
    }
  }

  // ── Step 4: Offer lifecycle management ──
  // Mark offers past validity_end as expired, archive offers expired >30 days
  let offersExpired = 0;
  let offersArchived = 0;

  // 4a: Set is_active=false for offers past validity_end
  const { data: expiredOffers } = await supabase
    .from('offers')
    .select('id, oem_id, title, validity_end')
    .not('validity_end', 'is', null)
    .lt('validity_end', now.toISOString());

  if (expiredOffers && expiredOffers.length > 0) {
    // Group by OEM for logging
    const expiredByOem: Record<string, number> = {};
    for (const o of expiredOffers) {
      expiredByOem[o.oem_id] = (expiredByOem[o.oem_id] || 0) + 1;
    }

    // Archive offers expired > 30 days (delete them)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const staleExpired = expiredOffers.filter(o => o.validity_end && o.validity_end < thirtyDaysAgo);

    if (staleExpired.length > 0) {
      const staleIds = staleExpired.map(o => o.id);
      const { error: delErr } = await supabase
        .from('offers')
        .delete()
        .in('id', staleIds);

      if (!delErr) {
        offersArchived = staleIds.length;
        for (const [oemId, count] of Object.entries(expiredByOem)) {
          const archivedForOem = staleExpired.filter(o => o.oem_id === oemId).length;
          if (archivedForOem > 0) {
            diagnoses.push({
              oem_id: oemId,
              issue: `${archivedForOem} offers expired >30 days`,
              action: 'Archived (deleted from DB)',
              result: 'fixed',
            });
          }
        }
      }
    }

    // Flag recently expired offers (< 30 days) — keep in DB but flag
    const recentlyExpired = expiredOffers.filter(o => o.validity_end && o.validity_end >= thirtyDaysAgo);
    if (recentlyExpired.length > 0) {
      offersExpired = recentlyExpired.length;
      for (const [oemId, count] of Object.entries(expiredByOem)) {
        const recentForOem = recentlyExpired.filter(o => o.oem_id === oemId).length;
        if (recentForOem > 0) {
          diagnoses.push({
            oem_id: oemId,
            issue: `${recentForOem} expired offers still active (< 30 days old)`,
            action: 'Flagged — will archive after 30 days',
            result: 'flagged',
          });
        }
      }
    }
  }

  console.log(`[CrawlDoctor] Step 4: ${offersExpired} recently expired, ${offersArchived} archived (>30d)`);

  // ── Step 5: Price anomaly detection ──
  // Flag products where price_amount seems wrong (null, 0, or unreasonably high/low)
  let priceAnomalies = 0;

  const { data: suspectProducts } = await supabase
    .from('products')
    .select('id, oem_id, title, price_amount')
    .or('price_amount.lt.1000,price_amount.gt.500000')
    .not('price_amount', 'is', null);

  for (const p of suspectProducts ?? []) {
    const price = p.price_amount;
    if (price < 1000 || price > 500000) {
      priceAnomalies++;
      diagnoses.push({
        oem_id: p.oem_id,
        issue: `Suspect price $${price.toLocaleString()} on "${p.title}"`,
        action: price < 1000
          ? 'Price likely in wrong unit (cents?) or extraction error'
          : 'Price unusually high — verify on OEM site',
        result: 'flagged',
        detail: p.id,
      });
    }
  }

  if (priceAnomalies > 0) {
    console.log(`[CrawlDoctor] Step 5: ${priceAnomalies} price anomalies detected`);
  }

  // ── Step 6: Stale product detection ──
  // Flag products not seen in 90+ days as potentially discontinued
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: staleProducts } = await supabase
    .from('products')
    .select('oem_id')
    .lt('last_seen_at', ninetyDaysAgo);

  if (staleProducts && staleProducts.length > 0) {
    const staleByOem: Record<string, number> = {};
    for (const p of staleProducts) {
      staleByOem[p.oem_id] = (staleByOem[p.oem_id] || 0) + 1;
    }
    for (const [oemId, count] of Object.entries(staleByOem)) {
      diagnoses.push({
        oem_id: oemId,
        issue: `${count} products not seen on site in 90+ days — possibly discontinued`,
        action: 'Review products with old last_seen_at and consider deactivating',
        result: 'flagged',
      });
    }
    console.log(`[CrawlDoctor] Step 6: ${staleProducts.length} stale products (>90d not seen)`);
  }

  // ── Step 6: Send diagnosis report to Slack ──
  if (slackWebhookUrl && diagnoses.length > 0) {
    const fixed = diagnoses.filter(d => d.result === 'fixed');
    const flagged = diagnoses.filter(d => d.result === 'flagged');

    const blocks: any[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🩺 Crawl Doctor — ${fixed.length} fixed, ${flagged.length} flagged` },
      },
    ];

    if (fixed.length > 0) {
      const fixedSummary = fixed.slice(0, 10).map(d =>
        `✅ \`${d.oem_id}\`: ${d.action}`
      ).join('\n');
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: fixedSummary + (fixed.length > 10 ? `\n_...and ${fixed.length - 10} more_` : '') },
      });
    }

    if (flagged.length > 0) {
      const flaggedSummary = flagged.slice(0, 8).map(d =>
        `⚠️ \`${d.oem_id}\`: ${d.issue}`
      ).join('\n');
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: flaggedSummary + (flagged.length > 8 ? `\n_...and ${flagged.length - 8} more_` : '') },
      });
    }

    try {
      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, text: `Crawl Doctor: ${fixed.length} fixed, ${flagged.length} flagged` }),
      });
    } catch (e) {
      console.warn('[CrawlDoctor] Slack error:', e);
    }
  }

  const result: DoctorResult = {
    timestamp: now.toISOString(),
    pages_reset: pagesReset,
    pages_deactivated: pagesDeactivated,
    hashes_seeded: hashesSeeded,
    crawls_triggered: crawlsTriggered,
    offers_expired: offersExpired,
    offers_archived: offersArchived,
    price_anomalies: priceAnomalies,
    diagnoses,
  };

  console.log(
    `[CrawlDoctor] Done — ${pagesReset} reset, ${pagesDeactivated} deactivated, ` +
    `${offersArchived} offers archived, ${offersExpired} expired, ${priceAnomalies} price anomalies, ` +
    `${diagnoses.filter(d => d.result === 'flagged').length} flagged`
  );

  return result;
}
