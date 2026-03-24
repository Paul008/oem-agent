/**
 * OEM Orchestrator Controller — "Traffic Controller"
 *
 * Central intelligence that monitors, coordinates, and self-heals
 * across all 18 OEMs. Runs on its own cron schedule (every 2h).
 *
 * Responsibilities:
 *   1. Monitor — check each OEM's extraction health
 *   2. Retry — re-trigger failed OEMs with exponential backoff
 *   3. Escalate — Slack alert when OEM needs human intervention
 *   4. Report — system-wide status for dashboard/Slack
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

interface OemHealth {
  oem_id: string;
  status: 'healthy' | 'degraded' | 'failing' | 'stale';
  success_rate: number;
  runs_24h: number;
  last_success_at: string | null;
  last_error: string | null;
  products: number;
  colors: number;
  offers: number;
  hours_since_last_run: number;
  retry_count: number;
}

export interface ControllerResult {
  timestamp: string;
  oems_total: number;
  oems_healthy: number;
  oems_degraded: number;
  oems_failing: number;
  oems_stale: number;
  retries_triggered: number;
  escalations_sent: number;
  health: OemHealth[];
}

// Retry state stored in R2
interface RetryState {
  [oemId: string]: {
    consecutive_failures: number;
    last_retry_at: string;
    backoff_minutes: number;
  };
}

const R2_RETRY_KEY = 'memory/controller/retry-state.json';
const MAX_CONSECUTIVE_FAILURES = 5;
const BASE_BACKOFF_MINUTES = 30;
const MAX_BACKOFF_MINUTES = 720; // 12 hours

// ============================================================================
// Main Controller
// ============================================================================

export async function executeOrchestratorController(
  supabase: SupabaseClient,
  r2Bucket: R2Bucket,
  slackWebhookUrl?: string,
): Promise<ControllerResult> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  console.log('[Controller] Starting orchestrator health check...');

  // 1. Load all active OEMs
  const { data: oems } = await supabase.from('oems').select('id').eq('is_active', true);
  const oemIds = (oems ?? []).map(o => o.id);

  // 2. Load import_runs from last 24h
  const { data: runs } = await supabase
    .from('import_runs')
    .select('oem_id, status, products_upserted, offers_upserted, error_log, started_at, finished_at')
    .gte('started_at', since24h)
    .order('started_at', { ascending: false });

  // 3. Load current data counts per OEM
  const { data: products } = await supabase.from('products').select('oem_id, updated_at');
  const { data: allOffers } = await supabase.from('offers').select('oem_id, validity_end');

  const prodByOem: Record<string, number> = {};
  for (const p of products ?? []) {
    prodByOem[p.oem_id] = (prodByOem[p.oem_id] || 0) + 1;
  }
  const offerByOem: Record<string, number> = {};
  for (const o of allOffers ?? []) {
    offerByOem[o.oem_id] = (offerByOem[o.oem_id] || 0) + 1;
  }

  // 4. Load retry state from R2
  let retryState: RetryState = {};
  try {
    const obj = await r2Bucket.get(R2_RETRY_KEY);
    if (obj) retryState = await obj.json();
  } catch { /* fresh start */ }

  // 5. Assess each OEM
  const health: OemHealth[] = [];
  let retriesTriggered = 0;
  let escalationsSent = 0;

  for (const oemId of oemIds) {
    const oemRuns = (runs ?? []).filter(r => r.oem_id === oemId);
    const successRuns = oemRuns.filter(r => r.status === 'completed');
    // Treat "running" runs older than 10 min as failed (Worker was killed)
    const staleThresholdMs = 10 * 60 * 1000;
    const failedRuns = oemRuns.filter(r =>
      r.status === 'failed' ||
      r.status === 'timeout' ||
      (r.status === 'running' && (now.getTime() - new Date(r.started_at).getTime()) > staleThresholdMs) ||
      (r.status === 'pending' && (now.getTime() - new Date(r.started_at).getTime()) > staleThresholdMs)
    );
    const lastRun = oemRuns[0];
    const lastSuccess = successRuns[0];

    const successRate = oemRuns.length > 0 ? successRuns.length / oemRuns.length : 0;
    const hoursSinceLastRun = lastRun
      ? (now.getTime() - new Date(lastRun.started_at).getTime()) / (1000 * 60 * 60)
      : 999;

    // Determine status
    let status: OemHealth['status'] = 'healthy';
    if (oemRuns.length === 0 || hoursSinceLastRun > 36) {
      status = 'stale'; // No runs in 36h
    } else if (successRate < 0.3) {
      status = 'failing'; // Less than 30% success
    } else if (successRate < 0.7) {
      status = 'degraded'; // Less than 70% success
    }

    const retryInfo = retryState[oemId] || { consecutive_failures: 0, last_retry_at: '', backoff_minutes: BASE_BACKOFF_MINUTES };

    // Track consecutive failures
    if (failedRuns.length > 0 && (!lastSuccess || new Date(failedRuns[0].started_at) > new Date(lastSuccess.started_at))) {
      retryInfo.consecutive_failures++;
    } else if (lastSuccess) {
      retryInfo.consecutive_failures = 0;
      retryInfo.backoff_minutes = BASE_BACKOFF_MINUTES;
    }

    health.push({
      oem_id: oemId,
      status,
      success_rate: Math.round(successRate * 100),
      runs_24h: oemRuns.length,
      last_success_at: lastSuccess?.finished_at || null,
      last_error: failedRuns[0]?.error_log?.slice(0, 150) || null,
      products: prodByOem[oemId] || 0,
      colors: 0, // Skip color count for performance
      offers: offerByOem[oemId] || 0,
      hours_since_last_run: Math.round(hoursSinceLastRun * 10) / 10,
      retry_count: retryInfo.consecutive_failures,
    });

    // 6. Retry logic — re-trigger crawl for failing/stale OEMs
    if ((status === 'failing' || status === 'stale') && retryInfo.consecutive_failures < MAX_CONSECUTIVE_FAILURES) {
      const minutesSinceRetry = retryInfo.last_retry_at
        ? (now.getTime() - new Date(retryInfo.last_retry_at).getTime()) / (1000 * 60)
        : Infinity;

      if (minutesSinceRetry >= retryInfo.backoff_minutes) {
        // Log retry intent — the next scheduled cron will pick up this OEM.
        // We no longer create orphaned "pending" import_runs that nothing processes.
        retryInfo.last_retry_at = now.toISOString();
        retryInfo.backoff_minutes = Math.min(retryInfo.backoff_minutes * 2, MAX_BACKOFF_MINUTES);
        retriesTriggered++;
        console.log(`[Controller] Retry noted for ${oemId} (attempt ${retryInfo.consecutive_failures + 1}, next backoff: ${retryInfo.backoff_minutes}min) — next cron will re-crawl`);
      }
    }

    // 7. Escalate — alert when max retries exceeded
    if (retryInfo.consecutive_failures >= MAX_CONSECUTIVE_FAILURES && status !== 'healthy') {
      escalationsSent++;
    }

    retryState[oemId] = retryInfo;
  }

  // 8. Save retry state to R2
  await r2Bucket.put(R2_RETRY_KEY, JSON.stringify(retryState), {
    httpMetadata: { contentType: 'application/json' },
  });

  // 9. Send Slack summary if issues exist
  const degradedOems = health.filter(h => h.status !== 'healthy');
  if (degradedOems.length > 0 && slackWebhookUrl) {
    try {
      const blocks: any[] = [
        { type: 'header', text: { type: 'plain_text', text: `🚦 Traffic Controller — ${degradedOems.length} OEM${degradedOems.length > 1 ? 's' : ''} need attention` } },
      ];

      for (const oem of degradedOems) {
        const emoji = oem.status === 'failing' ? '🔴' : oem.status === 'stale' ? '⚪' : '🟡';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *\`${oem.oem_id}\`* — ${oem.status.toUpperCase()}\n` +
              `Success: ${oem.success_rate}% · Runs: ${oem.runs_24h} · Last run: ${oem.hours_since_last_run}h ago` +
              (oem.retry_count > 0 ? ` · Retries: ${oem.retry_count}/${MAX_CONSECUTIVE_FAILURES}` : '') +
              (oem.last_error ? `\n_${oem.last_error}_` : ''),
          },
        });
      }

      if (retriesTriggered > 0) {
        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `🔄 ${retriesTriggered} retry crawl${retriesTriggered > 1 ? 's' : ''} triggered with exponential backoff` }],
        });
      }

      if (escalationsSent > 0) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `🚨 *${escalationsSent} OEM${escalationsSent > 1 ? 's' : ''} exceeded max retries (${MAX_CONSECUTIVE_FAILURES}) — human intervention needed*` },
        });
      }

      const response = await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks,
          text: `Traffic Controller: ${degradedOems.length} OEMs need attention, ${retriesTriggered} retries triggered`,
        }),
      });

      if (!response.ok) console.warn('[Controller] Slack send failed:', response.status);
    } catch (e) {
      console.warn('[Controller] Slack error:', e);
    }
  }

  // 10. Stock freshness alerts — stale products, expiring offers
  if (slackWebhookUrl) {
    const stockAlerts: string[] = [];

    // Stale products: OEMs where newest product update is >7 days old
    const STALE_PRODUCT_DAYS = 7;
    for (const oemId of oemIds) {
      const oemProducts = (products ?? []).filter(p => p.oem_id === oemId);
      if (oemProducts.length === 0) continue;
      const newest = oemProducts.reduce((max, p) =>
        new Date(p.updated_at) > new Date(max.updated_at) ? p : max
      );
      const ageDays = Math.floor((now.getTime() - new Date(newest.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays >= STALE_PRODUCT_DAYS) {
        stockAlerts.push(`📦 *\`${oemId}\`* — Products stale (${ageDays}d since last update, ${oemProducts.length} products)`);
      }
    }

    // Expiring offers: offers with validity_end within 48 hours
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const expiringOffers: { oem_id: string; count: number }[] = [];
    for (const oemId of oemIds) {
      const expiring = (allOffers ?? []).filter(o =>
        o.oem_id === oemId && o.validity_end &&
        new Date(o.validity_end) > now && new Date(o.validity_end) <= in48h
      );
      if (expiring.length > 0) {
        expiringOffers.push({ oem_id: oemId, count: expiring.length });
      }
    }
    if (expiringOffers.length > 0) {
      for (const { oem_id, count } of expiringOffers) {
        stockAlerts.push(`⏳ *\`${oem_id}\`* — ${count} offer${count > 1 ? 's' : ''} expiring within 48h`);
      }
    }

    // Expired offers still in the system
    const expiredOffers: { oem_id: string; count: number }[] = [];
    for (const oemId of oemIds) {
      const expired = (allOffers ?? []).filter(o =>
        o.oem_id === oemId && o.validity_end && new Date(o.validity_end) < now
      );
      if (expired.length > 0) {
        expiredOffers.push({ oem_id: oemId, count: expired.length });
      }
    }
    if (expiredOffers.length > 0) {
      const total = expiredOffers.reduce((s, e) => s + e.count, 0);
      stockAlerts.push(`🗑️ ${total} expired offer${total > 1 ? 's' : ''} still in system (${expiredOffers.map(e => `${e.oem_id}: ${e.count}`).join(', ')})`);
    }

    // Send stock alerts if any
    if (stockAlerts.length > 0) {
      try {
        const blocks: any[] = [
          { type: 'header', text: { type: 'plain_text', text: `📊 Stock Health — ${stockAlerts.length} item${stockAlerts.length > 1 ? 's' : ''} need attention` } },
          ...stockAlerts.map(text => ({
            type: 'section',
            text: { type: 'mrkdwn', text },
          })),
        ];

        await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks, text: `Stock Health: ${stockAlerts.length} alerts` }),
        });
      } catch (e) {
        console.warn('[Controller] Stock alert error:', e);
      }
    }
  }

  const result: ControllerResult = {
    timestamp: now.toISOString(),
    oems_total: oemIds.length,
    oems_healthy: health.filter(h => h.status === 'healthy').length,
    oems_degraded: health.filter(h => h.status === 'degraded').length,
    oems_failing: health.filter(h => h.status === 'failing').length,
    oems_stale: health.filter(h => h.status === 'stale').length,
    retries_triggered: retriesTriggered,
    escalations_sent: escalationsSent,
    health,
  };

  console.log(
    `[Controller] Done — ${result.oems_healthy} healthy, ${result.oems_degraded} degraded, ` +
    `${result.oems_failing} failing, ${result.oems_stale} stale, ${retriesTriggered} retries, ${escalationsSent} escalations`,
  );

  return result;
}
