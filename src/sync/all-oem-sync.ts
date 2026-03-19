/**
 * All-OEM Data Sync
 *
 * Runs inside the Cloudflare Worker on the daily oem-data-sync cron.
 * Fetches colors, pricing, and variant data from OEM APIs that provide
 * structured data (not just HTML crawl).
 *
 * OEM-specific syncs:
 *   - Kia:        BYO pages → colors + 8-state driveaway pricing
 *   - Hyundai:    CGI configurator → colors + national pricing
 *   - Mazda:      /cars/ pages → colors + driveaway pricing
 *   - Mitsubishi: Magento GraphQL → colors + pricing + state driveaway
 *
 * Generic sync:
 *   - All OEMs:   Refresh variant_pricing from products.price_amount
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'] as const;

function allStates(amount: number | null) {
  if (!amount) return {};
  const row: Record<string, number> = {};
  for (const s of STATES) row[`driveaway_${s}`] = amount;
  return row;
}

function pf(v?: string | number | null): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return n > 0 && n < 999999 ? Math.round(n * 100) / 100 : null;
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface AllOemSyncResult {
  hyundai: { colors: number; pricing: number; errors: string[] };
  mazda: { colors: number; pricing: number; errors: string[] };
  mitsubishi: { colors: number; pricing: number; errors: string[] };
  generic_pricing: { oems: number; products: number };
}

// ============================================================================
// HYUNDAI — CGI Configurator embedded in model pages
// ============================================================================

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#34;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

interface HyundaiCgiData {
  fscSubGroups: Array<{
    subGroupName: string;
    variants: Array<{
      variantDescription: string;
      bodyType?: string;
      engineNTrans?: string;
      isElectric?: boolean;
      fscs: Array<{
        fscLowPrice?: number;
        fscHighPrice?: number;
        baseColours: Array<{
          code: string;
          name: string;
          hex?: string;
          exteriorImages?: Array<{ imageName: string; path: string }>;
        }>;
      }>;
    }>;
  }>;
}

const HYUNDAI_MODELS = [
  { slug: 'venue', url: '/au/en/cars/suvs/venue' },
  { slug: 'kona', url: '/au/en/cars/suvs/kona' },
  { slug: 'kona-electric', url: '/au/en/cars/eco/kona-electric' },
  { slug: 'tucson', url: '/au/en/cars/suvs/tucson' },
  { slug: 'santa-fe', url: '/au/en/cars/suvs/santa-fe' },
  { slug: 'palisade', url: '/au/en/cars/suvs/palisade' },
  { slug: 'i20-n', url: '/au/en/cars/sports-cars/i20-n' },
  { slug: 'i30-sedan', url: '/au/en/cars/small-cars/i30/sedan' },
  { slug: 'i30-n', url: '/au/en/cars/sports-cars/i30-n' },
  { slug: 'ioniq-5', url: '/au/en/cars/eco/ioniq5' },
  { slug: 'ioniq-6', url: '/au/en/cars/eco/ioniq6' },
  { slug: 'ioniq-9', url: '/au/en/cars/eco/ioniq9' },
  { slug: 'staria', url: '/au/en/cars/people-movers-and-commercial/staria' },
  { slug: 'inster', url: '/au/en/cars/eco/inster' },
];

function extractCgiData(html: string): HyundaiCgiData | null {
  const re = /data-src="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const decoded = decodeHtmlEntities(m[1]);
    if (!decoded.startsWith('{')) continue;
    try {
      const json = JSON.parse(decoded);
      if (json.fscSubGroups) return json;
    } catch { /* skip */ }
  }
  return null;
}

function deriveColorType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('pearl')) return 'pearl';
  if (lower.includes('metallic')) return 'metallic';
  if (lower.includes('mica')) return 'mica';
  if (lower.includes('matte')) return 'matte';
  return 'solid';
}

async function syncHyundai(supabase: SupabaseClient): Promise<AllOemSyncResult['hyundai']> {
  const result = { colors: 0, pricing: 0, errors: [] as string[] };
  const BASE = 'https://www.hyundai.com';
  const OEM_ID = 'hyundai-au';

  const { data: dbModels } = await supabase
    .from('vehicle_models').select('id, slug').eq('oem_id', OEM_ID);
  const { data: existingProducts } = await supabase
    .from('products').select('id, external_key').eq('oem_id', OEM_ID);

  const modelMap = Object.fromEntries((dbModels ?? []).map(m => [m.slug, m]));
  const productMap = Object.fromEntries((existingProducts ?? []).map(p => [p.external_key, p]));

  for (const mp of HYUNDAI_MODELS) {
    const model = modelMap[mp.slug];
    if (!model) continue;

    try {
      const res = await fetch(BASE + mp.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const cgi = extractCgiData(html);
      if (!cgi) continue;

      for (const sg of cgi.fscSubGroups) {
        for (const variant of sg.variants ?? []) {
          for (const fsc of variant.fscs ?? []) {
            if (!fsc.baseColours?.length) continue;
            const gradeName = variant.variantDescription || sg.subGroupName;
            const externalKey = `${OEM_ID}-${slugify(`${mp.slug}-${gradeName}`)}`;
            const existing = productMap[externalKey];
            if (!existing) continue;

            // Upsert colors
            const seenCodes = new Set<string>();
            for (const c of fsc.baseColours) {
              if (seenCodes.has(c.code)) continue;
              seenCodes.add(c.code);
              const front34 = c.exteriorImages?.find(i => i.imageName === 'front34ImageUrl');
              await supabase.from('variant_colors').upsert({
                product_id: existing.id,
                color_code: c.code,
                color_name: c.name,
                color_type: deriveColorType(c.name),
                hero_image_url: front34 ? BASE + front34.path : null,
              }, { onConflict: 'product_id,color_code' });
              result.colors++;
            }

            // Upsert pricing
            const driveaway = pf(fsc.fscLowPrice);
            if (driveaway) {
              await supabase.from('variant_pricing').upsert({
                product_id: existing.id,
                price_type: 'standard',
                rrp: driveaway,
                ...allStates(driveaway),
              }, { onConflict: 'product_id,price_type' });

              await supabase.from('products').update({
                price_amount: driveaway,
                price_type: 'driveaway',
                price_qualifier: 'Drive away estimate',
              }).eq('id', existing.id);
              result.pricing++;
            }
          }
        }
      }
    } catch (e) {
      result.errors.push(`${mp.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

// ============================================================================
// MAZDA — /cars/{model}/ pages with ReactDOM.hydrate JSON
// ============================================================================

const MAZDA_MODELS = [
  'bt-50', 'cx-3', 'cx-5', 'cx-60', 'cx-70', 'cx-80', 'cx-90', 'mazda2', 'mazda3', 'mx-5',
];

function extractBracketBlock(html: string, startIdx: number): string | null {
  let depth = 0;
  let pos = startIdx;
  while (pos < html.length) {
    if (html[pos] === '[') depth++;
    if (html[pos] === ']') { depth--; if (depth === 0) return html.slice(startIdx, pos + 1); }
    pos++;
  }
  return null;
}

async function syncMazda(supabase: SupabaseClient): Promise<AllOemSyncResult['mazda']> {
  const result = { colors: 0, pricing: 0, errors: [] as string[] };
  const BASE_URL = 'https://www.mazda.com.au';
  const OEM_ID = 'mazda-au';

  const { data: products } = await supabase
    .from('products').select('id, title, meta_json').eq('oem_id', OEM_ID);
  if (!products?.length) return result;

  for (const slug of MAZDA_MODELS) {
    try {
      const res = await fetch(`${BASE_URL}/cars/${slug}/`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' },
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Extract grade → price pairs
      const priceRe = /"type":"grade","name":"([^"]+)".*?"price":(\d+)/g;
      const gradePrices = new Map<string, number>();
      let pm: RegExpExecArray | null;
      while ((pm = priceRe.exec(html)) !== null) {
        if (!gradePrices.has(pm[1])) gradePrices.set(pm[1], parseInt(pm[2]));
      }

      // Extract colors per grade
      const gradePattern = /"type":"grade","name":"([^"]+)"/g;
      const bodyStyleMatches = [...html.matchAll(/"type":"bodyStyle","name":"([^"]+)"/g)];
      const bodyStylePositions = bodyStyleMatches.map(m => ({ name: m[1], index: m.index! }));
      const seen = new Set<string>();

      let gm: RegExpExecArray | null;
      while ((gm = gradePattern.exec(html)) !== null) {
        const gradeName = gm[1];
        const gradeIdx = gm.index;

        let bodyStyle = 'Default';
        let bestDist = Infinity;
        for (const bs of bodyStylePositions) {
          const dist = gradeIdx - bs.index;
          if (dist > 0 && dist < bestDist) { bestDist = dist; bodyStyle = bs.name; }
        }

        const key = `${bodyStyle}||${gradeName}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Match to product
        const product = products.find(p => p.meta_json?.grade === gradeName && p.title.toLowerCase().includes(slug.replace('mazda', 'mazda ')));
        if (!product) continue;

        // Update pricing
        const price = gradePrices.get(gradeName);
        if (price) {
          await supabase.from('variant_pricing').upsert({
            product_id: product.id, price_type: 'standard',
            rrp: price, ...allStates(price),
          }, { onConflict: 'product_id,price_type' });
          await supabase.from('products').update({
            price_amount: price, price_type: 'driveaway', price_qualifier: 'Drive away estimate',
          }).eq('id', product.id);
          result.pricing++;
        }

        // Extract and upsert colors
        const colorsIdx = html.indexOf('"colors":[', gradeIdx);
        if (colorsIdx < 0 || colorsIdx - gradeIdx > 200000) continue;
        const arrStr = extractBracketBlock(html, colorsIdx + 9);
        if (!arrStr) continue;

        try {
          const colors = JSON.parse(arrStr) as Array<{
            type: string; ref: string; name: string; priceDifference?: number;
            imageSrc?: string; icon?: string;
          }>;
          for (const c of colors.filter(c => c.type === 'color')) {
            const heroUrl = c.imageSrc ? (c.imageSrc.startsWith('http') ? c.imageSrc : BASE_URL + c.imageSrc) : null;
            const swatchUrl = c.icon ? (c.icon.startsWith('http') ? c.icon : BASE_URL + c.icon) : null;
            await supabase.from('variant_colors').upsert({
              product_id: product.id,
              color_code: c.ref,
              color_name: c.name,
              color_type: deriveColorType(c.name),
              swatch_url: swatchUrl,
              hero_image_url: heroUrl,
              price_delta: c.priceDifference || 0,
            }, { onConflict: 'product_id,color_code' });
            result.colors++;
          }
        } catch { /* skip malformed JSON */ }
      }
    } catch (e) {
      result.errors.push(`${slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

// ============================================================================
// MITSUBISHI — Magento 2 GraphQL
// ============================================================================

async function syncMitsubishi(supabase: SupabaseClient): Promise<AllOemSyncResult['mitsubishi']> {
  const result = { colors: 0, pricing: 0, errors: [] as string[] };
  const GQL = 'https://store.mitsubishi-motors.com.au/graphql';
  const OEM_ID = 'mitsubishi-au';

  try {
    const res = await fetch(GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          products(filter: { category_id: { eq: "31" } }, pageSize: 60) {
            items {
              sku name
              price_range { minimum_price { final_price { value } } }
              ... on ConfigurableProduct {
                configurable_options {
                  attribute_code
                  values { label value_index swatch_data { value ... on ImageSwatchData { thumbnail } } }
                }
                variants {
                  product { sku price_range { minimum_price { final_price { value } } } }
                  attributes { code label value_index }
                }
              }
            }
          }
        }`,
      }),
    });

    const data = await res.json() as { data?: { products: { items: any[] } }; errors?: any[] };
    if (data.errors || !data.data) {
      result.errors.push('GraphQL error');
      return result;
    }

    const items = data.data.products.items;
    const { data: dbProducts } = await supabase
      .from('products').select('id, meta_json').eq('oem_id', OEM_ID);

    const productBySku = Object.fromEntries(
      (dbProducts ?? []).map(p => [(p.meta_json as any)?.sku, p])
    );

    for (const item of items) {
      const basePrice = item.price_range?.minimum_price?.final_price?.value;
      if (!basePrice || basePrice >= 99990) continue;

      const product = productBySku[item.sku];
      if (!product) continue;

      // Extract colors
      for (const opt of item.configurable_options ?? []) {
        if (opt.attribute_code !== 'exterior_code') continue;
        for (const v of opt.values ?? []) {
          const swatchUrl = v.swatch_data?.thumbnail
            ? `https://store.mitsubishi-motors.com.au${v.swatch_data.thumbnail}`
            : null;
          await supabase.from('variant_colors').upsert({
            product_id: product.id,
            color_code: slugify(v.label),
            color_name: v.label,
            color_type: v.label.includes('Diamond') || v.label.includes('Mica') ? 'premium' : 'standard',
            swatch_url: swatchUrl,
          }, { onConflict: 'product_id,color_code' });
          result.colors++;
        }
      }

      // Update pricing
      await supabase.from('variant_pricing').upsert({
        product_id: product.id, price_type: 'standard',
        rrp: basePrice, ...allStates(basePrice),
      }, { onConflict: 'product_id,price_type' });
      await supabase.from('products').update({
        price_amount: basePrice, price_type: 'driveaway', price_qualifier: 'Drive away estimate',
      }).eq('id', product.id);
      result.pricing++;
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}

// ============================================================================
// GENERIC — Refresh variant_pricing from products.price_amount for all OEMs
// ============================================================================

async function syncGenericPricing(supabase: SupabaseClient): Promise<AllOemSyncResult['generic_pricing']> {
  const result = { oems: 0, products: 0 };

  // OEMs without dedicated sync — just ensure variant_pricing matches products
  const genericOems = [
    'ford-au', 'nissan-au', 'toyota-au', 'isuzu-au', 'subaru-au',
    'suzuki-au', 'volkswagen-au', 'gwm-au', 'gmsv-au', 'ldv-au',
    'gac-au', 'foton-au', 'kgm-au', 'chery-au',
  ];

  for (const oemId of genericOems) {
    const { data: products } = await supabase
      .from('products')
      .select('id, price_amount')
      .eq('oem_id', oemId)
      .not('price_amount', 'is', null);

    if (!products?.length) continue;

    let updated = 0;
    for (const p of products) {
      if (!p.price_amount || p.price_amount > 999999) continue;
      const { error } = await supabase.from('variant_pricing').upsert({
        product_id: p.id, price_type: 'standard',
        rrp: p.price_amount, ...allStates(p.price_amount),
      }, { onConflict: 'product_id,price_type' });
      if (!error) updated++;
    }

    if (updated > 0) {
      result.oems++;
      result.products += updated;
    }
  }

  return result;
}

// ============================================================================
// Main entry point
// ============================================================================

export async function executeAllOemSync(
  supabase: SupabaseClient,
): Promise<AllOemSyncResult> {
  console.log('[AllOemSync] Starting sync for Hyundai, Mazda, Mitsubishi + generic pricing');

  const [hyundai, mazda, mitsubishi, generic_pricing] = await Promise.all([
    syncHyundai(supabase).catch(e => ({ colors: 0, pricing: 0, errors: [String(e)] })),
    syncMazda(supabase).catch(e => ({ colors: 0, pricing: 0, errors: [String(e)] })),
    syncMitsubishi(supabase).catch(e => ({ colors: 0, pricing: 0, errors: [String(e)] })),
    syncGenericPricing(supabase).catch(() => ({ oems: 0, products: 0 })),
  ]);

  console.log(
    `[AllOemSync] Done — Hyundai: ${hyundai.colors}c/${hyundai.pricing}p, ` +
    `Mazda: ${mazda.colors}c/${mazda.pricing}p, ` +
    `Mitsubishi: ${mitsubishi.colors}c/${mitsubishi.pricing}p, ` +
    `Generic: ${generic_pricing.oems} OEMs/${generic_pricing.products} products`,
  );

  return { hyundai, mazda, mitsubishi, generic_pricing };
}
