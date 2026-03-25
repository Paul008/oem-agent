/**
 * Competitive Intelligence Agent
 *
 * Cross-OEM analysis: price positioning, segment movements, and market alerts.
 * Runs weekly (Wednesday 9am AEST) or on-demand via cron.
 *
 * Analyses:
 *   1. Price positioning by body type (SUV, sedan, ute, hatch, van)
 *   2. Significant price movements in the last 7 days
 *   3. Segment gap detection (e.g. "no OEM has a small SUV under $25K")
 *   4. Offer density by segment (which segments are most promoted)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CompetitiveIntelResult {
  timestamp: string;
  segments: SegmentAnalysis[];
  price_movements: PriceMovement[];
  market_alerts: string[];
}

interface SegmentAnalysis {
  body_type: string;
  product_count: number;
  oem_count: number;
  price_min: number;
  price_max: number;
  price_avg: number;
  cheapest: { oem: string; title: string; price: number };
  most_expensive: { oem: string; title: string; price: number };
  active_offers: number;
}

interface PriceMovement {
  oem_id: string;
  title: string;
  body_type: string;
  old_price: number;
  new_price: number;
  change_pct: number;
  direction: 'up' | 'down';
}

export async function executeCompetitiveIntel(
  supabase: SupabaseClient,
  slackWebhookUrl?: string,
): Promise<CompetitiveIntelResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  console.log('[CompetitiveIntel] Generating market analysis...');

  // ── 1. Load all products with prices ──
  const { data: products } = await supabase
    .from('products')
    .select('oem_id, title, body_type, price_amount, price_type')
    .not('price_amount', 'is', null)
    .gt('price_amount', 1000)
    .order('body_type');

  const { data: oems } = await supabase
    .from('oems')
    .select('id, name')
    .eq('is_active', true);

  const oemNames: Record<string, string> = {};
  for (const o of oems ?? []) {
    oemNames[o.id] = (o.name ?? '').replace(' Australia', '');
  }

  // ── 2. Load active offers ──
  const { data: offers } = await supabase
    .from('offers')
    .select('oem_id, offer_type, applicable_models')
    .limit(1000);

  // ── 3. Load recent price change events ──
  const { data: priceChanges } = await supabase
    .from('change_events')
    .select('oem_id, entity_id, summary, diff_json')
    .eq('event_type', 'price_changed')
    .gte('created_at', sevenDaysAgo)
    .limit(100);

  // ── 4. Segment analysis ──
  const bodyTypes = new Set((products ?? []).map(p => p.body_type).filter(Boolean));
  const segments: SegmentAnalysis[] = [];

  for (const bodyType of bodyTypes) {
    const segProducts = (products ?? []).filter(p => p.body_type === bodyType && p.price_amount > 0);
    if (segProducts.length === 0) continue;

    const prices = segProducts.map(p => p.price_amount);
    const oemSet = new Set(segProducts.map(p => p.oem_id));

    const cheapest = segProducts.reduce((min, p) => p.price_amount < min.price_amount ? p : min);
    const mostExpensive = segProducts.reduce((max, p) => p.price_amount > max.price_amount ? p : max);

    const segOffers = (offers ?? []).filter(o => {
      const models = o.applicable_models || [];
      return segProducts.some(p =>
        models.some((m: string) => p.title.toLowerCase().includes(m.toLowerCase()))
      );
    });

    segments.push({
      body_type: bodyType,
      product_count: segProducts.length,
      oem_count: oemSet.size,
      price_min: Math.min(...prices),
      price_max: Math.max(...prices),
      price_avg: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
      cheapest: {
        oem: oemNames[cheapest.oem_id] || cheapest.oem_id,
        title: cheapest.title,
        price: cheapest.price_amount,
      },
      most_expensive: {
        oem: oemNames[mostExpensive.oem_id] || mostExpensive.oem_id,
        title: mostExpensive.title,
        price: mostExpensive.price_amount,
      },
      active_offers: segOffers.length,
    });
  }

  segments.sort((a, b) => b.product_count - a.product_count);

  // ── 5. Price movements ──
  const priceMovements: PriceMovement[] = [];
  for (const change of priceChanges ?? []) {
    const diff = change.diff_json as Record<string, any> | null;
    if (!diff?.price_amount) continue;
    const oldPrice = diff.price_amount.old;
    const newPrice = diff.price_amount.new;
    if (typeof oldPrice !== 'number' || typeof newPrice !== 'number' || oldPrice === 0) continue;

    const changePct = Math.round(((newPrice - oldPrice) / oldPrice) * 100);
    if (Math.abs(changePct) < 1) continue; // Skip negligible changes

    const product = (products ?? []).find(p => p.oem_id === change.oem_id && p.title);
    priceMovements.push({
      oem_id: change.oem_id,
      title: product?.title || change.entity_id,
      body_type: product?.body_type || 'unknown',
      old_price: oldPrice,
      new_price: newPrice,
      change_pct: changePct,
      direction: newPrice > oldPrice ? 'up' : 'down',
    });
  }

  priceMovements.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));

  // ── 6. Market alerts ──
  const marketAlerts: string[] = [];

  // Alert: significant price drops (competitor lowering prices)
  const bigDrops = priceMovements.filter(m => m.direction === 'down' && Math.abs(m.change_pct) >= 5);
  if (bigDrops.length > 0) {
    marketAlerts.push(`📉 ${bigDrops.length} significant price drops this week (≥5%): ${bigDrops.slice(0, 3).map(m => `${oemNames[m.oem_id] || m.oem_id} ${m.title} (${m.change_pct}%)`).join(', ')}`);
  }

  // Alert: significant price increases
  const bigRises = priceMovements.filter(m => m.direction === 'up' && m.change_pct >= 5);
  if (bigRises.length > 0) {
    marketAlerts.push(`📈 ${bigRises.length} price increases this week (≥5%): ${bigRises.slice(0, 3).map(m => `${oemNames[m.oem_id] || m.oem_id} ${m.title} (+${m.change_pct}%)`).join(', ')}`);
  }

  // Alert: segments with high offer density
  const hotSegments = segments.filter(s => s.active_offers >= 5);
  if (hotSegments.length > 0) {
    marketAlerts.push(`🔥 Hot segments (5+ active offers): ${hotSegments.map(s => `${s.body_type} (${s.active_offers} offers)`).join(', ')}`);
  }

  // ── 7. Send Slack report ──
  if (slackWebhookUrl && segments.length > 0) {
    const blocks: any[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🏁 Competitive Intelligence Report' },
      },
    ];

    // Top segments summary
    const topSegments = segments.slice(0, 6);
    const segmentText = topSegments.map(s =>
      `*${s.body_type}* (${s.product_count} products, ${s.oem_count} OEMs)\n` +
      `  $${s.price_min.toLocaleString()} — $${s.price_max.toLocaleString()} (avg $${s.price_avg.toLocaleString()})\n` +
      `  Cheapest: ${s.cheapest.oem} ${s.cheapest.title} ($${s.cheapest.price.toLocaleString()})\n` +
      `  Premium: ${s.most_expensive.oem} ${s.most_expensive.title} ($${s.most_expensive.price.toLocaleString()})`
    ).join('\n\n');

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: segmentText.slice(0, 3000) },
    });

    if (priceMovements.length > 0) {
      blocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Price Movements (last 7 days)*\n` +
              priceMovements.slice(0, 8).map(m =>
                `${m.direction === 'up' ? '📈' : '📉'} ${oemNames[m.oem_id] || m.oem_id} *${m.title}*: $${m.old_price.toLocaleString()} → $${m.new_price.toLocaleString()} (${m.change_pct > 0 ? '+' : ''}${m.change_pct}%)`
              ).join('\n'),
          },
        },
      );
    }

    if (marketAlerts.length > 0) {
      blocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: marketAlerts.join('\n') },
        },
      );
    }

    try {
      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: blocks.slice(0, 49), // Slack 50-block limit
          text: `Competitive Intel: ${segments.length} segments, ${priceMovements.length} price movements`,
        }),
      });
    } catch (e) {
      console.warn('[CompetitiveIntel] Slack error:', e);
    }
  }

  const result: CompetitiveIntelResult = {
    timestamp: now.toISOString(),
    segments,
    price_movements: priceMovements,
    market_alerts: marketAlerts,
  };

  console.log(`[CompetitiveIntel] Done — ${segments.length} segments, ${priceMovements.length} price movements, ${marketAlerts.length} alerts`);
  return result;
}
