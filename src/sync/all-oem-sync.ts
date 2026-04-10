/**
 * All-OEM Data Sync
 *
 * Runs inside the Cloudflare Worker on the daily oem-data-sync cron.
 * Fetches colors, pricing, and variant data from OEM APIs that provide
 * structured data (not just HTML crawl).
 *
 * OEM-specific syncs:
 *   - Kia:        BYO pages → colors + 8-state driveaway pricing (separate kia-colors.ts)
 *   - Hyundai:    CGI configurator → colors + national pricing
 *   - Mazda:      /cars/ pages → colors + driveaway pricing
 *   - Mitsubishi: Magento GraphQL → colors + pricing + state driveaway
 *   - VW:         OneHub API → products, colors (4-angle), pricing, offers, brochures
 *
 * Generic sync:
 *   - All OEMs:   Refresh variant_pricing from products.price_amount
 *   - All OEMs:   Auto-fix offer images from variant_colors (fallback)
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
  volkswagen: { products: number; colors: number; pricing: number; offers: number; errors: string[] };
  foton: { products: number; colors: number; pricing: number; errors: string[] };
  generic_pricing: { oems: number; products: number };
  offer_images_fixed: number;
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
// VOLKSWAGEN — OneHub Offers API (complete range)
// ============================================================================

async function syncVolkswagen(supabase: SupabaseClient): Promise<AllOemSyncResult['volkswagen']> {
  const result = { products: 0, colors: 0, pricing: 0, offers: 0, errors: [] as string[] };
  const OEM_ID = 'volkswagen-au';
  const BASE_URL = 'https://www.volkswagen.com.au';

  try {
    // Find valid version (starts at 547, auto-increments)
    let version = 547;
    let data: any[] = [];
    for (let i = 0; i < 50; i++) {
      const res = await fetch(`${BASE_URL}/app/locals/get-onehub-offers?size=200&offset=0&dealer=30140&version=${version}&seperator=:`);
      const json = await res.json() as { status: string; data?: any[] };
      if (json.status === 'success' && json.data?.length) {
        data = json.data;
        break;
      }
      version++;
    }

    if (data.length === 0) {
      result.errors.push('No valid OneHub version found');
      return result;
    }

    // Ensure vehicle_models exist
    const { data: existingModels } = await supabase
      .from('vehicle_models').select('id, slug').eq('oem_id', OEM_ID);
    const modelMap: Record<string, { id: string }> = {};
    for (const m of existingModels ?? []) modelMap[m.slug] = m;

    for (const offer of data) {
      const p = offer.payload;
      if (!p?.model_family) continue;

      const modelSlug = slugify(p.model_family);
      const variantName = p.varient_name || '';
      const driveaway = pf(offer.mrdp);
      const rrp = pf(offer.mrrp);

      // Ensure model exists
      if (!modelMap[modelSlug]) {
        const { data: newModel } = await supabase
          .from('vehicle_models')
          .upsert({ oem_id: OEM_ID, slug: modelSlug, name: p.model_family, source_url: `${BASE_URL}/en/models/${modelSlug}.html` }, { onConflict: 'oem_id,slug' })
          .select('id').single();
        if (newModel) modelMap[modelSlug] = newModel;
      }
      if (!modelMap[modelSlug]) continue;

      // Upsert product
      const externalKey = `${OEM_ID}-${offer.model_code}`;
      const { data: prod } = await supabase.from('products').upsert({
        oem_id: OEM_ID,
        external_key: externalKey,
        title: `${p.model_name} ${variantName}`.trim(),
        model_id: modelMap[modelSlug].id,
        price_amount: driveaway || rrp,
        price_type: 'driveaway',
        price_qualifier: 'Manufacturer recommended driveaway price',
        variant_name: variantName,
        variant_code: offer.model_code,
        body_type: (p.body_shape || '').toLowerCase().includes('suv') ? 'suv' : (p.body_shape || '').toLowerCase().includes('hatch') ? 'hatch' : 'suv',
        fuel_type: (p.fuel_type || '').toLowerCase().includes('electric') ? 'electric' : 'petrol',
        engine_size: p.engine_capacity || null,
        transmission: p.transmission_desc || null,
        drive: p.driven_wheels || null,
        key_features: p.features || [],
        specs_json: { engine: { description: p.engine_capacity, power_kw: p.engine_power ? parseInt(p.engine_power) : null } },
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'oem_id,external_key' }).select('id').single();

      if (!prod) continue;
      result.products++;

      // Pricing
      if (driveaway) {
        await supabase.from('variant_pricing').upsert({
          product_id: prod.id, price_type: 'standard', rrp, ...allStates(driveaway),
        }, { onConflict: 'product_id,price_type' });
        result.pricing++;
      }

      // Colors
      const colours = p.colours || {};
      let sortOrder = 0;
      for (const [prcode, color] of Object.entries(colours) as [string, any][]) {
        await supabase.from('variant_colors').upsert({
          product_id: prod.id,
          color_code: prcode.replace(/\s/g, '-'),
          color_name: color.name || color.color,
          color_type: deriveColorType(color.name || ''),
          is_standard: color.is_default || parseInt(color.price) === 0,
          price_delta: parseInt(color.price) || 0,
          swatch_url: color.colour_tile || null,
          hero_image_url: color.images?.front || color.images?.right || null,
          gallery_urls: [color.images?.front, color.images?.right, color.images?.back, color.images?.left].filter(Boolean),
          sort_order: sortOrder++,
        }, { onConflict: 'product_id,color_code' });
        result.colors++;
      }
    }

    // Upsert offers (one per model family)
    const families = new Set<string>();
    for (const offer of data) {
      const p = offer.payload;
      if (!p?.model_family || families.has(p.model_family)) continue;
      families.add(p.model_family);

      await supabase.from('offers').upsert({
        oem_id: OEM_ID,
        external_key: `vw-onehub-${slugify(p.model_family)}`,
        title: `${p.model_family} — ${p.banner?.banner_heading || 'Driveaway Offer'}`,
        offer_type: 'driveaway_deal',
        price_amount: pf(offer.mrdp),
        applicable_models: [p.model_family],
        hero_image_r2_key: p.hero_image?.detail || p.hero_image?.listing || null,
        validity_start: p.banner?.banner_start_date || null,
        validity_end: p.banner?.banner_end_date || null,
        source_url: `${BASE_URL}/en/models/${slugify(p.model_family)}.html`,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'oem_id,external_key' });
      result.offers++;
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}

// ============================================================================
// FIX — Auto-fallback offer images from variant_colors
// ============================================================================

async function fixOfferImages(supabase: SupabaseClient): Promise<number> {
  const { data: noImg } = await supabase
    .from('offers')
    .select('id, oem_id, applicable_models')
    .is('hero_image_r2_key', null);

  let fixed = 0;
  for (const offer of noImg ?? []) {
    const models = offer.applicable_models || [];
    const modelName = models[0];
    if (!modelName) continue;

    // Try matching product by model name
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('oem_id', offer.oem_id)
      .ilike('title', `%${modelName}%`)
      .limit(1);

    if (!products?.length) continue;

    const { data: colors } = await supabase
      .from('variant_colors')
      .select('hero_image_url')
      .eq('product_id', products[0].id)
      .not('hero_image_url', 'is', null)
      .limit(1);

    if (colors?.[0]?.hero_image_url) {
      await supabase
        .from('offers')
        .update({ hero_image_r2_key: colors[0].hero_image_url })
        .eq('id', offer.id);
      fixed++;
    }
  }

  return fixed;
}

// ============================================================================
// FOTON — Custom Pricing API (state-specific RDP) + Vehicles API (MLP)
// ============================================================================

const FOTON_API_KEY = 'Cdl7SZbG-swkp-VvdV-mFw2-b4P6-dJh6L8TJ';
const FOTON_BASE = 'https://www.fotonaustralia.com.au';

// Model UUIDs from Foton's CMS — maps to customPriceSelector_model_id on each PDP
const FOTON_MODELS: { modelId: string; variantIds: string[] }[] = [
  {
    modelId: 'bf7daf18-0b3e-480f-a4d1-0a3dd0933038', // Tunland
    variantIds: ['V7-4x2', 'V7-4x4', 'V9-L-4x4', 'V9-S-4x4'],
  },
  {
    modelId: '04767f3d-5332-44d3-8b8b-785c5caba2cf', // Aumark S
    variantIds: [
      '5D15-MT-SWB-CAB-CHASSIS', '5D15-MT-SWB-Tipper', '5D15-AMT-SWB-CAB-CHASSIS', '5D15-AMT-SWB-Tipper',
      '5D15-MT-MWB-CAB-CHASSIS', '5D15-MT-MWB-Tipper', '5D15-AMT-MWB-CAB-CHASSIS', '5D15-AMT-MWB-Tipper',
      '6D15-MT-SWB-CAB-CHASSIS', '6D15-MT-SWB-Tipper', '6D15-AMT-SWB-CAB-CHASSIS', '6D15-AMT-SWB-Tipper',
      '6D15-MT-MWB-CAB-CHASSIS', '6D15-MT-MWB-Tipper', '6D15-AMT-MWB-CAB-CHASSIS', '6D15-AMT-MWB-Tipper',
      '8D15-MT-CAB-CHASSIS', '8D15-MT-Tipper', '8D15-AMT-CAB-CHASSIS', '8D15-AMT-Tipper',
      '9D15-MT-CAB-CHASSIS', '9D15-MT-Tipper', '9D15-AMT-CAB-CHASSIS', '9D15-AMT-Tipper',
    ],
  },
];

// Capital city postcodes used to get representative state driveaway prices
const STATE_POSTCODES: Record<string, string> = {
  nsw: '2000', vic: '3000', qld: '4000', wa: '6000',
  sa: '5000', tas: '7000', act: '2600', nt: '0800',
};

interface FotonVariantPrice {
  vehicleVariantId: string;
  variantName: string;
  mlp: number;
  vehicleDriveAwayPrice: number;
}

async function fetchFotonPricing(
  modelId: string, variantIds: string[], postCode: string,
): Promise<FotonVariantPrice[]> {
  const res = await fetch(`${FOTON_BASE}/api/v1/custompricing/vehicles`, {
    method: 'POST',
    headers: { 'Api-Key': FOTON_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ postCode, modelId, variantIds, colorIndex: 0 }),
  });
  if (!res.ok) return [];
  const data = await res.json() as { vehicleVariants?: FotonVariantPrice[] };
  return data.vehicleVariants ?? [];
}

// Foton color dot extraction — matches HTML like:
// <div class="colours_wrapper__colourDots__dot" label="FLARE WHITE" image="/media/..." style="background-color:#fff">
const FOTON_VARIANT_PATTERNS: Record<string, string> = {
  'v7-c-4x2': 'v7 c 4x2', 'v7-4x2': 'v7 c 4x2',
  'v7-c-4x4': 'v7 c 4x4', 'v7-4x4': 'v7 c 4x4',
  'v9-l-4x4': 'v9 l 4x4', 'v9-s-4x4': 'v9 s 4x4',
};

async function scrapeFotonColors(
  supabase: SupabaseClient,
  tunlandProducts: Array<{ id: string; title: string }>,
  html: string,
): Promise<number> {
  let count = 0;
  try {
    // Extract color dot elements with label, image, bg-color
    const dotRegex = /<div\s[^>]*colours_wrapper__colourDots__dot[^>]*>/gi;
    const dots = [...html.matchAll(dotRegex)];
    if (!dots.length) return 0;

    for (const [tag] of dots) {
      const label = tag.match(/\blabel="([^"]*)"/)?.[1];
      const image = tag.match(/\bimage="([^"]*)"/)?.[1];
      const bgHex = tag.match(/background-color:\s*([^;"]+)/)?.[1]?.trim();
      if (!label || !image) continue;

      // Detect variant from image URL
      const imgLower = image.toLowerCase();
      let variantKey: string | null = null;
      for (const [pattern, key] of Object.entries(FOTON_VARIANT_PATTERNS)) {
        if (imgLower.includes(pattern)) { variantKey = key; break; }
      }
      if (!variantKey) continue;
      const matchKey = variantKey;

      // Match to product by title
      const product = tunlandProducts.find(p => p.title.toLowerCase().includes(matchKey));
      if (!product) continue;

      const colorName = label.replace(/\*$/, '').trim();
      const isPremium = label.includes('*');
      const colorCode = colorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const { error } = await supabase.from('variant_colors').upsert({
        product_id: product.id,
        color_code: colorCode,
        color_name: colorName,
        color_type: isPremium ? 'premium' : 'solid',
        is_standard: !isPremium,
        price_delta: isPremium ? 690 : 0,
        swatch_url: bgHex || null,
        hero_image_url: `${FOTON_BASE}${image}?width=1920`,
      }, { onConflict: 'product_id,color_code' });

      if (!error) count++;
    }
  } catch (e) {
    console.warn('[syncFoton] Color scrape failed:', e);
  }
  return count;
}

async function scrapeFotonAumarkWhite(
  supabase: SupabaseClient,
  aumarkProducts: Array<{ id: string; title: string }>,
  html: string,
): Promise<number> {
  let count = 0;
  try {
    // Extract variant names and hero images in page order
    const variantNames = [...html.matchAll(/versionCar">([^<]+)</g)].map(m => m[1].trim().toLowerCase());
    const heroImages = [...html.matchAll(/showcase_container__iframe"[^>]*src="([^"]+)"/g)].map(m => `${FOTON_BASE}${m[1]}`);

    const variantToImage = new Map<string, string>();
    for (let i = 0; i < variantNames.length && i < heroImages.length; i++) {
      variantToImage.set(variantNames[i], heroImages[i]);
    }

    for (const product of aumarkProducts) {
      const heroUrl = variantToImage.get(product.title.toLowerCase()) || null;
      const { error } = await supabase.from('variant_colors').upsert({
        product_id: product.id,
        color_code: 'white',
        color_name: 'White',
        color_type: 'solid',
        is_standard: true,
        price_delta: 0,
        hero_image_url: heroUrl,
      }, { onConflict: 'product_id,color_code' });
      if (!error) count++;
    }
  } catch (e) {
    console.warn('[syncFoton] Aumark S color scrape failed:', e);
  }
  return count;
}

async function syncFotonBrochures(
  supabase: SupabaseClient,
  allProducts: Array<{ id: string; title: string }>,
  tunlandHtml: string,
  aumarkHtml: string,
): Promise<void> {
  try {

    // Extract variant→PDF from page HTML (variant name appears before its PDF link)
    function extractBrochureMap(html: string): Map<string, string> {
      const map = new Map<string, string>();
      const parts = html.split('versionCar">');
      for (let i = 1; i < parts.length; i++) {
        const name = parts[i].match(/^([^<]+)/)?.[1]?.trim().toLowerCase();
        const pdf = parts[i].match(/href="([^"]*\.pdf)"/)?.[1];
        if (name && pdf) {
          map.set(name, pdf.startsWith('http') ? pdf : `${FOTON_BASE}${pdf}`);
        }
      }
      return map;
    }

    const tunlandMap = extractBrochureMap(tunlandHtml);
    const aumarkMap = extractBrochureMap(aumarkHtml);

    // Also extract warranty/roadside PDFs
    const tunlandWarranty = tunlandHtml.match(/href="([^"]*roadside[^"]*\.pdf)"/i)?.[1];
    const aumarkWarranty = aumarkHtml.match(/href="([^"]*warranty[^"]*\.pdf)"/i)?.[1];

    for (const product of allProducts) {
      const title = product.title.toLowerCase();
      const isTunland = title.includes('tunland');
      const brochureUrl = isTunland
        ? tunlandMap.get(title.replace('tunland ', ''))
        : aumarkMap.get(title);
      if (!brochureUrl) continue;

      const ctaLinks: Array<{ label: string; url: string; type: string }> = [
        { label: isTunland ? 'Download Brochure' : 'Spec Sheet', url: brochureUrl, type: 'brochure' },
      ];
      const warrantyPdf = isTunland ? tunlandWarranty : aumarkWarranty;
      if (warrantyPdf) {
        const url = warrantyPdf.startsWith('http') ? warrantyPdf : `${FOTON_BASE}${warrantyPdf}`;
        ctaLinks.push({
          label: isTunland ? 'Roadside Assistance Program' : 'Warranty & Service Handbook',
          url, type: 'warranty',
        });
      }

      // Merge with existing cta_links — preserve non-brochure/warranty entries from other sources
      const { data: existing } = await supabase.from('products').select('cta_links').eq('id', product.id).single();
      const existingLinks = (existing?.cta_links as Array<{ label: string; url: string; type: string }>) || [];
      const otherLinks = existingLinks.filter(l => l.type !== 'brochure' && l.type !== 'warranty');
      await supabase.from('products').update({ cta_links: [...otherLinks, ...ctaLinks] }).eq('id', product.id);
    }

    // Refresh vehicle_models.brochure_url so PDF spec extraction stays unbroken
    // when Foton's Umbraco CMS rotates media filenames (same GUID, new filename).
    // Tunland: all variants share one full spec sheet. Aumark S: pick the 5D15
    // cab chassis variant to match the existing canonical convention.
    const modelBrochures: Record<string, string | undefined> = {
      'tunland': [...tunlandMap.values()][0],
      'aumark-s': aumarkMap.get('5d15 mt swb cab chassis') ?? [...aumarkMap.values()][0],
    };
    const { data: fotonModels } = await supabase
      .from('vehicle_models')
      .select('id, slug, brochure_url')
      .eq('oem_id', 'foton-au');
    for (const m of fotonModels ?? []) {
      const fresh = modelBrochures[m.slug as string];
      if (!fresh || fresh === m.brochure_url) continue;
      await supabase
        .from('vehicle_models')
        .update({ brochure_url: fresh, extracted_specs: null, extracted_specs_at: null })
        .eq('id', m.id);
      // Stale embeddings reference the old PDF — drop them so re-vectorize picks up the new one
      await supabase.from('pdf_embeddings').delete()
        .eq('source_id', m.id).eq('source_type', 'brochure');
      console.log(`[syncFoton] Refreshed brochure_url for ${m.slug}: ${fresh}`);
    }
  } catch (e) {
    console.warn('[syncFoton] Brochure scrape failed:', e);
  }
}

async function syncFoton(supabase: SupabaseClient): Promise<AllOemSyncResult['foton']> {
  const result = { products: 0, colors: 0, pricing: 0, errors: [] as string[] };
  const OEM_ID = 'foton-au';

  try {
    const { data: dbProducts } = await supabase
      .from('products').select('id, title, price_amount').eq('oem_id', OEM_ID);
    if (!dbProducts?.length) { result.errors.push('No Foton products in DB'); return result; }

    // Fetch both pages once, pass HTML to helpers (avoids duplicate fetches)
    const [tunlandRes, aumarkRes] = await Promise.all([
      fetch(`${FOTON_BASE}/ute/tunland/`).catch(() => null),
      fetch(`${FOTON_BASE}/trucks/series/aumark-s/`).catch(() => null),
    ]);
    const tunlandHtml = tunlandRes?.ok ? await tunlandRes.text() : '';
    const aumarkHtml = aumarkRes?.ok ? await aumarkRes.text() : '';

    // Sync Tunland colors from Foton website (8 colors per variant)
    const tunlandProducts = dbProducts.filter(p => p.title.toLowerCase().includes('tunland'));
    if (tunlandHtml) result.colors = await scrapeFotonColors(supabase, tunlandProducts, tunlandHtml);

    // Aumark S trucks come in white only — scrape hero images from the series page
    const aumarkProducts = dbProducts.filter(p => !p.title.toLowerCase().includes('tunland'));
    if (aumarkHtml) result.colors += await scrapeFotonAumarkWhite(supabase, aumarkProducts, aumarkHtml);

    // Sync brochure/spec sheet links from both pages
    if (tunlandHtml || aumarkHtml) await syncFotonBrochures(supabase, dbProducts, tunlandHtml, aumarkHtml);

    // Build a map from variant name → product id (normalise to match API response)
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const productByName = new Map(dbProducts.map(p => [normalise(p.title), p]));

    for (const model of FOTON_MODELS) {
      // Fetch pricing for all 8 states
      const stateData: Record<string, FotonVariantPrice[]> = {};
      for (const [state, postCode] of Object.entries(STATE_POSTCODES)) {
        stateData[state] = await fetchFotonPricing(model.modelId, model.variantIds, postCode);
      }

      // Use NSW as the canonical list of variants
      const nswVariants = stateData.nsw;
      if (!nswVariants?.length) {
        result.errors.push(`No pricing returned for model ${model.modelId}`);
        continue;
      }

      for (const variant of nswVariants) {
        const product = productByName.get(normalise(variant.variantName));
        if (!product) {
          result.errors.push(`No DB product for "${variant.variantName}"`);
          continue;
        }

        // Build state driveaway columns
        const driveaways: Record<string, number | null> = {};
        for (const state of STATES) {
          const sv = stateData[state]?.find(v => v.vehicleVariantId === variant.vehicleVariantId);
          driveaways[`driveaway_${state}`] = sv ? Math.round(sv.vehicleDriveAwayPrice) : null;
        }

        // Upsert variant_pricing with state-specific driveaway prices
        const { error } = await supabase.from('variant_pricing').upsert({
          product_id: product.id,
          price_type: 'standard',
          rrp: variant.mlp,
          ...driveaways,
        }, { onConflict: 'product_id,price_type' });

        if (error) { result.errors.push(`Pricing upsert error: ${error.message}`); continue; }
        result.pricing++;

        // Update product MLP if it changed
        if (product.price_amount !== variant.mlp) {
          await supabase.from('products').update({
            price_amount: variant.mlp, price_type: 'driveaway',
          }).eq('id', product.id);
          result.products++;
        }
      }
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
    'gac-au', 'kgm-au', 'chery-au', 'renault-au',
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
  console.log('[AllOemSync] Starting sync for Hyundai, Mazda, Mitsubishi, VW, Foton + generic pricing');

  const [hyundai, mazda, mitsubishi, volkswagen, foton, generic_pricing] = await Promise.all([
    syncHyundai(supabase).catch(e => ({ colors: 0, pricing: 0, errors: [String(e)] })),
    syncMazda(supabase).catch(e => ({ colors: 0, pricing: 0, errors: [String(e)] })),
    syncMitsubishi(supabase).catch(e => ({ colors: 0, pricing: 0, errors: [String(e)] })),
    syncVolkswagen(supabase).catch(e => ({ products: 0, colors: 0, pricing: 0, offers: 0, errors: [String(e)] })),
    syncFoton(supabase).catch(e => ({ products: 0, colors: 0, pricing: 0, errors: [String(e)] })),
    syncGenericPricing(supabase).catch(() => ({ oems: 0, products: 0 })),
  ]);

  // Fix any offers missing images (auto-fallback from variant_colors)
  const offer_images_fixed = await fixOfferImages(supabase).catch(() => 0);

  console.log(
    `[AllOemSync] Done — Hyundai: ${hyundai.colors}c/${hyundai.pricing}p, ` +
    `Mazda: ${mazda.colors}c/${mazda.pricing}p, ` +
    `Mitsubishi: ${mitsubishi.colors}c/${mitsubishi.pricing}p, ` +
    `VW: ${volkswagen.products}p/${volkswagen.colors}c/${volkswagen.offers}o, ` +
    `Foton: ${foton.products}p/${foton.colors}c/${foton.pricing} pricing, ` +
    `Generic: ${generic_pricing.oems} OEMs/${generic_pricing.products} products, ` +
    `Offer images fixed: ${offer_images_fixed}`,
  );

  return { hyundai, mazda, mitsubishi, volkswagen, foton, generic_pricing, offer_images_fixed };
}
