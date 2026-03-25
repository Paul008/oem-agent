/**
 * Weekly Stock Summary Report
 *
 * Generates a comprehensive Slack report for the stock manager covering:
 * - Data freshness across all OEMs
 * - Price movements in the last 7 days
 * - New/removed products and offers
 * - Crawl health metrics
 * - Action items
 *
 * Runs weekly (Monday 9am AEST) via OpenClaw cron.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface WeeklyReportResult {
  timestamp: string;
  period: { from: string; to: string };
  oem_count: number;
  product_count: number;
  offer_count: number;
  crawl_success_rate: number;
  price_changes: number;
  new_products: number;
  removed_offers: number;
  action_items: string[];
}

export async function executeWeeklyReport(
  supabase: SupabaseClient,
  slackWebhookUrl?: string,
): Promise<WeeklyReportResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since = sevenDaysAgo.toISOString();

  console.log('[WeeklyReport] Generating stock summary...');

  // ── 1. Overall counts ──
  const [oemsRes, productsRes, offersRes] = await Promise.all([
    supabase.from('oems').select('id, name').eq('is_active', true),
    supabase.from('products').select('oem_id, updated_at, last_seen_at, price_amount').limit(2000),
    supabase.from('offers').select('oem_id, updated_at, validity_end').limit(1000),
  ]);

  const oems = oemsRes.data ?? [];
  const products = productsRes.data ?? [];
  const offers = offersRes.data ?? [];

  // ── 2. Crawl health this week ──
  const { data: weekRuns } = await supabase
    .from('import_runs')
    .select('status, products_upserted, offers_upserted, changes_found')
    .gte('started_at', since);

  const runs = weekRuns ?? [];
  const completedRuns = runs.filter(r => r.status === 'completed');
  const failedRuns = runs.filter(r => r.status === 'failed' || r.status === 'timeout');
  const crawlSuccessRate = runs.length > 0 ? Math.round((completedRuns.length / runs.length) * 100) : 0;
  const totalProductsUpserted = runs.reduce((s, r) => s + (r.products_upserted || 0), 0);
  const totalOffersUpserted = runs.reduce((s, r) => s + (r.offers_upserted || 0), 0);
  const totalChanges = runs.reduce((s, r) => s + (r.changes_found || 0), 0);

  // ── 3. Change events this week ──
  const { data: changes } = await supabase
    .from('change_events')
    .select('entity_type, event_type, severity, oem_id')
    .gte('created_at', since);

  const changeEvents = changes ?? [];
  const priceChanges = changeEvents.filter(c => c.event_type === 'price_changed' || c.event_type === 'updated').length;
  const newProducts = changeEvents.filter(c => c.entity_type === 'product' && c.event_type === 'created').length;
  const removedOffers = changeEvents.filter(c => c.entity_type === 'offer' && c.event_type === 'removed').length;
  const criticalChanges = changeEvents.filter(c => c.severity === 'critical' || c.severity === 'high');

  // ── 4. Product freshness ──
  const staleOems: string[] = [];
  const freshOems: string[] = [];
  for (const oem of oems) {
    const oemProducts = products.filter(p => p.oem_id === oem.id);
    if (oemProducts.length === 0) continue;
    const newest = oemProducts.reduce((max, p) =>
      new Date(p.updated_at) > new Date(max.updated_at) ? p : max
    );
    const ageDays = Math.floor((now.getTime() - new Date(newest.updated_at).getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays > 7) {
      staleOems.push(`${oem.name?.replace(' Australia', '')} (${ageDays}d)`);
    } else {
      freshOems.push(oem.name?.replace(' Australia', '') || oem.id);
    }
  }

  // ── 5. Expired offers ──
  const expiredOffers = offers.filter(o =>
    o.validity_end && new Date(o.validity_end) < now
  );

  // ── 6. Action items ──
  const actionItems: string[] = [];
  if (staleOems.length > 0) {
    actionItems.push(`${staleOems.length} OEMs have stale products (>7d): ${staleOems.slice(0, 5).join(', ')}${staleOems.length > 5 ? '...' : ''}`);
  }
  if (expiredOffers.length > 0) {
    actionItems.push(`${expiredOffers.length} expired offers need review`);
  }
  if (crawlSuccessRate < 90) {
    actionItems.push(`Crawl success rate is ${crawlSuccessRate}% (target: >90%)`);
  }
  if (criticalChanges.length > 0) {
    actionItems.push(`${criticalChanges.length} critical/high-severity changes this week`);
  }

  // ── 7. Send Slack report ──
  if (slackWebhookUrl) {
    const blocks: any[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📊 Weekly Stock Summary' },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Week of ${sevenDaysAgo.toLocaleDateString('en-AU')} — ${now.toLocaleDateString('en-AU')}` }],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*OEMs Active*\n${oems.length}` },
          { type: 'mrkdwn', text: `*Products*\n${products.length}` },
          { type: 'mrkdwn', text: `*Offers*\n${offers.length}` },
          { type: 'mrkdwn', text: `*Crawl Success*\n${crawlSuccessRate}%` },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*This Week's Activity*\n` +
            `• ${runs.length} crawl runs (${completedRuns.length} completed, ${failedRuns.length} failed)\n` +
            `• ${totalProductsUpserted} products upserted, ${totalOffersUpserted} offers upserted\n` +
            `• ${totalChanges} changes detected, ${priceChanges} price movements\n` +
            `• ${newProducts} new products, ${removedOffers} offers removed`,
        },
      },
    ];

    if (freshOems.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*✅ Fresh OEMs (${freshOems.length}):* ${freshOems.join(', ')}`,
        },
      });
    }

    if (staleOems.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*⚠️ Stale OEMs (${staleOems.length}):* ${staleOems.join(', ')}`,
        },
      });
    }

    if (actionItems.length > 0) {
      blocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🎯 Action Items*\n${actionItems.map(a => `• ${a}`).join('\n')}`,
          },
        },
      );
    }

    if (actionItems.length === 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '✅ *No action items — all systems healthy*' },
      });
    }

    try {
      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, text: `Weekly Stock Summary: ${products.length} products, ${offers.length} offers, ${crawlSuccessRate}% crawl success` }),
      });
    } catch (e) {
      console.warn('[WeeklyReport] Slack error:', e);
    }
  }

  const result: WeeklyReportResult = {
    timestamp: now.toISOString(),
    period: { from: since, to: now.toISOString() },
    oem_count: oems.length,
    product_count: products.length,
    offer_count: offers.length,
    crawl_success_rate: crawlSuccessRate,
    price_changes: priceChanges,
    new_products: newProducts,
    removed_offers: removedOffers,
    action_items: actionItems,
  };

  console.log(`[WeeklyReport] Done — ${oems.length} OEMs, ${products.length} products, ${crawlSuccessRate}% crawl success, ${actionItems.length} action items`);
  return result;
}
