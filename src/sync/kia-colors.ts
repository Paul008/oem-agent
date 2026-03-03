/**
 * Kia AU Color Sync
 *
 * Fetches exterior color data from Kia's Build-Your-Own pages and pricing API,
 * then upserts into `variant_colors`. Also enriches with 360 hero images from
 * the KWCMS CDN. Designed to run inside the weekly `oem-data-sync` cron job.
 *
 * Data sources:
 *  - BYO color page HTML  → color codes, swatch URLs
 *  - BYO trim page HTML   → trim list (maps colors → products)
 *  - selectPriceByTrim API → premium paint price delta
 *  - Model pages HTML      → 360 render URLs (hero images + gallery)
 *  - KWCMS CDN HEAD probes → verify render URLs for unmatched colors
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Color Master Table — 43 codes from Kia AU BYO (2024-2026 range)
// ============================================================================

const COLOR_MAP: Record<string, { name: string; type: string }> = {
  '4SS': { name: 'Silky Silver', type: 'metallic' },
  'A2G': { name: 'Adventurous Green', type: 'metallic' },
  'ABP': { name: 'Aurora Black Pearl', type: 'pearl' },
  'ACW': { name: 'Honeydew', type: 'solid' },
  'ACX': { name: 'Yacht Blue', type: 'metallic' },
  'AG3': { name: 'Matcha Green', type: 'metallic' },
  'AG9': { name: 'Interstellar Grey', type: 'metallic' },
  'AGT': { name: 'Interstellar Grey', type: 'metallic' },
  'B3A': { name: 'Neptune Blue', type: 'metallic' },
  'B4U': { name: 'Gravity Blue', type: 'metallic' },
  'BB2': { name: 'Vesta Blue', type: 'metallic' },
  'BEG': { name: 'Signal Red', type: 'solid' },
  'BN4': { name: 'Volcanic Sand Brown', type: 'metallic' },
  'C4S': { name: 'Ceramic Grey', type: 'metallic' },
  'C7A': { name: 'Wolf Grey', type: 'metallic' },
  'C7R': { name: 'Flare Red', type: 'metallic' },
  'CGE': { name: 'Cityscape Green', type: 'metallic' },
  'CR5': { name: 'Runway Red', type: 'metallic' },
  'D2U': { name: 'Astra Blue', type: 'metallic' },
  'DFG': { name: 'Pebble Grey', type: 'matte' },
  'DM4': { name: 'Honeydew', type: 'solid' },
  'DU3': { name: 'Yacht Blue', type: 'metallic' },
  'EBB': { name: 'Frost Blue', type: 'metallic' },
  'EBD': { name: 'Shale Grey', type: 'metallic' },
  'FSB': { name: 'Fusion Black', type: 'metallic' },
  'GLB': { name: 'Glacier', type: 'matte' },
  'HRB': { name: 'Heritage Blue', type: 'metallic' },
  'IEG': { name: 'Iceberg Green', type: 'metallic' },
  'ISG': { name: 'Ivory Silver', type: 'metallic' },
  'KCS': { name: 'Sparkling Silver', type: 'metallic' },
  'KDG': { name: 'Gravity Grey', type: 'metallic' },
  'KLG': { name: 'Steel Grey', type: 'metallic' },
  'M3R': { name: 'Mars Orange', type: 'metallic' },
  'M4B': { name: 'Mineral Blue', type: 'metallic' },
  'M7G': { name: 'Astro Grey', type: 'metallic' },
  'M9Y': { name: 'Milky Beige', type: 'metallic' },
  'NNB': { name: 'Starry Night Black', type: 'pearl' },
  'OVR': { name: 'Magma Red', type: 'metallic' },
  'P2M': { name: 'Panthera Metal', type: 'metallic' },
  'PLU': { name: 'Pluton Blue', type: 'metallic' },
  'R4R': { name: 'Fiery Red', type: 'metallic' },
  'SPB': { name: 'Sporty Blue', type: 'metallic' },
  'SWP': { name: 'Snow White Pearl', type: 'pearl' },
  'TCT': { name: 'Terracotta', type: 'metallic' },
  'UD':  { name: 'Clear White', type: 'solid' },
  'WVB': { name: 'Wave Blue', type: 'metallic' },
};

/** Clear White is the only standard (no-cost) color across Kia AU */
const STANDARD_COLORS = new Set(['UD']);

// ============================================================================
// Model → first trim code (used to load the BYO color page)
// ============================================================================

const KIA_MODELS: Record<string, string> = {
  'carnival': 'KA4PESP',
  'carnival-hybrid': 'SHEV',
  'ev3': 'AIR-SR',
  'ev4-sedan': 'AIR',
  'ev5': 'AIR-SR',
  'ev6': 'AIR-SR',
  'ev6-my24': 'AIR',
  'ev9': 'AIR',
  'k4-hatch': 'S',
  'k4-sedan': 'S',
  'niro-ev': 'SG2-EV-S',
  'niro-hybrid': 'SG2-HEV-S',
  'picanto': 'SP-M',
  'seltos': 'S-CVT',
  'sorento': 'S-P',
  'sorento-hybrid': 'MQ4PEHFS',
  'sorento-plug-in-hybrid': 'PHEV-A-S',
  'sportage': 'S-P',
  'sportage-hev': 'S-HF',
  'stonic': 'S',
  'stonic-my25': 'S',
  'tasman': 'DCPUS4x2',
  'tasman-dcc': 'DCCS-GPAT',
  'tasman-scc': 'S4X2-GPAT',
};

/** Models removed from BYO — clean up their variant_colors rows */
const DEAD_MODELS = ['cerato'];

const KIA_BYO_BASE = 'https://www.kia.com/au/shopping-tools/build-and-price';
const KIA_PRICING_API = 'https://www.kia.com/api/kia_australia/common/trimPrice.selectPriceByTrim';
const KIA_BASE = 'https://www.kia.com';

// ============================================================================
// 360 Hero Image CDN configuration (ported from seed-kia-colors.mjs)
// ============================================================================

/** Model pages to scrape for 360 render discovery */
const CDN_MODEL_PAGES = [
  'seltos', 'sportage', 'sorento', 'carnival',
  'ev6', 'ev9', 'picanto', 'stonic',
  'k4', 'ev5', 'ev3', 'ev4', 'tasman', 'niro',
];

/** DB model slug → CDN model page name (many-to-one) */
const SLUG_TO_CDN: Record<string, string> = {
  'carnival-hybrid': 'carnival',
  'sorento-hybrid': 'sorento',
  'sorento-plug-in-hybrid': 'sorento',
  'sportage-hev': 'sportage',
  'k4-hatch': 'k4',
  'k4-sedan': 'k4',
  'niro-ev': 'niro',
  'niro-hybrid': 'niro',
  'ev6-my24': 'ev6',
  'stonic-my25': 'stonic',
};

/** Manual CDN data for models where page scraping finds no 360 renders */
const MANUAL_CDN_DATA: Record<string, { templateUrl: string; templateSlug: string }> = {
  'ev6': {
    templateUrl: KIA_BASE + '/content/dam/kwcms/au/en/images/showroom/ev6-pe/360vr/snow-white-pearl/Kia-ev6-gt-snow-white-pearl_00000.png',
    templateSlug: 'snow-white-pearl',
  },
};

/** KWCMS CDN filename overrides — where directory slug differs from filename slug */
const FILENAME_OVERRIDES: Record<string, string> = {
  'steel-grey': 'steel-gray',
  'interstellar-grey': 'interstellar-gray',
  'wave-blue': 'wavy-blue',
};

/** Known render type directories to exclude from color slug detection */
const RENDER_TYPE_DIRS = new Set([
  'exterior', 'interior', '360vr', '360VR', 'exterior360',
  'Features', 'features', 'color-chip',
]);

// ============================================================================
// HTML extraction (proven regex from import-kia-full.mjs)
// ============================================================================

interface ExtractedColor {
  code: string;
  name: string;
  type: string;
  is_standard: boolean;
  swatch_url: string | null;
}

/**
 * Extract color codes and swatch URLs from a BYO color page's HTML.
 * The page uses <li class="color_l..." path="CODE" color="CODE"> elements.
 */
export function extractColors(html: string): ExtractedColor[] {
  const flat = html.replace(/\n/g, ' ');
  const re = /<li\s+class="color_l[^"]*"\s*path="([A-Z0-9]+)"\s*color="[A-Z0-9]+"[^>]*>([\s\S]*?)<\/li>/g;
  const colors: ExtractedColor[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(flat)) !== null) {
    const code = m[1];
    const inner = m[2];
    const info = COLOR_MAP[code] ?? { name: `Unknown (${code})`, type: 'unknown' };
    const swatchMatch = inner.match(/src="([^"]+)"/);
    const swatchUrl = swatchMatch ? `https://www.kia.com${swatchMatch[1]}` : null;

    colors.push({
      code,
      name: info.name,
      type: info.type,
      is_standard: STANDARD_COLORS.has(code),
      swatch_url: swatchUrl,
    });
  }

  return colors;
}

interface Trim {
  code: string;
  name: string;
}

/** Extract trim codes from BYO trim page HTML */
function extractTrims(html: string): Trim[] {
  const re = /label[^>]*path="([^"]*)"[^>]*>([^<]*)/g;
  const trims: Trim[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    trims.push({ code: m[1], name: m[2].trim() });
  }
  return trims;
}

// ============================================================================
// Product matching (ported from import-kia-full.mjs:500-523)
// ============================================================================

interface ProductRef {
  id: string;
  external_key: string | null;
  meta_json: Record<string, unknown> | null;
  model_id: string | null;
}

function findProduct(
  productsByKey: Record<string, ProductRef>,
  model: string,
  trimCode: string,
): ProductRef | null {
  const lc = trimCode.toLowerCase();
  const candidates = [
    `${model}-${lc}`,
    `${model}-${trimCode}`,
    `new-${model}-${lc}`,
    `${model}-my25-${lc}`,
    `tasman-dual-cab-pick-up-${lc}`,
    `tasman-dual-cab-chassis-${lc}`,
    `tasman-single-cab-chassis-${lc}`,
  ];

  for (const key of candidates) {
    if (productsByKey[key]) return productsByKey[key];
  }

  // Partial-match fallback
  const modelBase = model.replace(/-my24|-my25/g, '');
  for (const [key, p] of Object.entries(productsByKey)) {
    if (key.includes(lc) && key.includes(modelBase)) return p;
  }
  return null;
}

// ============================================================================
// Main pipeline
// ============================================================================

export interface KiaColorSyncResult {
  models_processed: number;
  colors_upserted: number;
  price_deltas_set: number;
  hero_images_set: number;
  dead_entries_removed: number;
  errors: string[];
}

/** Batch an array into groups of `size` */
function batch<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** HEAD-check a CDN URL — returns true if it's a real image >5KB */
async function headCheck(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return false;
    const ct = r.headers.get('content-type') || '';
    const size = parseInt(r.headers.get('content-length') || '0');
    return ct.startsWith('image/') && size > 5000;
  } catch {
    return false;
  }
}

/** Build 6-angle gallery from a hero URL (every 60 from 36 frames) */
function buildGalleryUrls(heroUrl: string): string[] {
  return [0, 6, 12, 18, 24, 30].map(i =>
    heroUrl.replace(/_00000\./, `_${String(i).padStart(5, '0')}.`),
  );
}

interface CdnModelData {
  heroMap: Record<string, string>;
  templateUrl: string | null;
  templateSlug: string | null;
}

/** Scrape a Kia model page for 360 render _00000 frame URLs */
function extractCdnHeroes(html: string): CdnModelData {
  const frameRe = /(?:"|')(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"']*?_00000\.(?:png|webp|jpg))(?:"|')/gi;
  const heroMap: Record<string, string> = {};
  let m: RegExpExecArray | null;

  while ((m = frameRe.exec(html)) !== null) {
    const fullUrl = KIA_BASE + m[1];
    const parts = m[1].split('/');
    const colorSlug = parts[parts.length - 2].toLowerCase();
    if (RENDER_TYPE_DIRS.has(colorSlug)) continue;
    if (colorSlug.includes('feature') || colorSlug.includes('chip')) continue;
    if (!heroMap[colorSlug]) heroMap[colorSlug] = fullUrl;
  }

  // Pick template URL for CDN probing (prefer common colors)
  let templateUrl: string | null = null;
  let templateSlug: string | null = null;
  for (const pref of ['clear-white', 'snow-white-pearl', 'aurora-black-pearl', 'fusion-black', 'steel-grey']) {
    if (heroMap[pref]) { templateUrl = heroMap[pref]; templateSlug = pref; break; }
  }
  if (!templateUrl) {
    const entry = Object.entries(heroMap).find(([s]) =>
      !s.includes('roof') && !s.includes('two-tone') && !s.includes('hatch') && !s.includes('sedan'),
    );
    if (entry) { templateSlug = entry[0]; templateUrl = entry[1]; }
  }

  return { heroMap, templateUrl, templateSlug };
}

/** Try to find a hero URL for a color slug via direct match, variation, partial, or CDN probe */
async function resolveHeroUrl(
  colorSlug: string,
  data: CdnModelData,
  probeCache: Map<string, string | null>,
  cacheKey: string,
): Promise<string | null> {
  const { heroMap, templateUrl, templateSlug } = data;

  // 1. Direct match
  if (heroMap[colorSlug]) return heroMap[colorSlug];

  // 2. Variation matching (strip/add suffix)
  const variations = [
    colorSlug.replace(/-pearl$/, ''),
    colorSlug.replace(/-metallic$/, ''),
    colorSlug.replace(/-matte$/, ''),
    colorSlug + '-pearl',
    colorSlug + '-metallic',
  ];
  for (const v of variations) {
    if (v !== colorSlug && heroMap[v]) return heroMap[v];
  }

  // 3. Partial match
  for (const [knownSlug, knownUrl] of Object.entries(heroMap)) {
    if (knownSlug.includes('roof') || knownSlug.includes('two-tone')) continue;
    if (colorSlug.includes(knownSlug) || knownSlug.includes(colorSlug)) return knownUrl;
  }

  // 4. CDN probe — replace color slug in template URL and HEAD check
  if (!templateUrl || !templateSlug) return null;
  if (probeCache.has(cacheKey)) return probeCache.get(cacheKey) ?? null;

  const slugsToTry = [
    colorSlug,
    colorSlug.replace(/-pearl$/, ''),
    colorSlug.replace(/-metallic$/, ''),
  ];

  for (const slug of slugsToTry) {
    const fileSlug = FILENAME_OVERRIDES[slug] || slug;
    const templateFileSlug = FILENAME_OVERRIDES[templateSlug] || templateSlug;
    let probeUrl: string;
    if (fileSlug !== slug) {
      probeUrl = templateUrl
        .replace(new RegExp(`/${templateSlug}/`, 'g'), `/${slug}/`)
        .replace(new RegExp(templateFileSlug, 'g'), fileSlug);
    } else {
      probeUrl = templateUrl.replaceAll(templateSlug, slug);
    }
    if (probeUrl === templateUrl && slug !== templateSlug) continue;
    if (await headCheck(probeUrl)) {
      probeCache.set(cacheKey, probeUrl);
      return probeUrl;
    }
  }

  probeCache.set(cacheKey, null);
  return null;
}

export async function executeKiaColorSync(
  supabase: SupabaseClient,
): Promise<KiaColorSyncResult> {
  const result: KiaColorSyncResult = {
    models_processed: 0,
    colors_upserted: 0,
    price_deltas_set: 0,
    hero_images_set: 0,
    dead_entries_removed: 0,
    errors: [],
  };

  // 1. Load all kia-au products, index by external_key
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, external_key, meta_json, model_id')
    .eq('oem_id', 'kia-au');

  if (prodErr || !products) {
    result.errors.push(`Failed to load products: ${prodErr?.message ?? 'no data'}`);
    return result;
  }

  const productsByKey: Record<string, ProductRef> = {};
  for (const p of products) {
    if (p.external_key) productsByKey[p.external_key] = p;
  }

  console.log(`[KiaColorSync] Loaded ${products.length} Kia AU products`);

  // Track which products have a standard (solid) color — determines price_delta logic
  const productsWithStandardColor = new Set<string>();

  // 2. Process models in batches of 5 to avoid hammering Kia servers
  const modelEntries = Object.entries(KIA_MODELS);
  for (const group of batch(modelEntries, 5)) {
    const settled = await Promise.allSettled(
      group.map(async ([model, firstTrim]) => {
        // Fetch BYO color page
        const colorHtml = await fetchText(
          `${KIA_BYO_BASE}.color.${model}.${firstTrim}.html`,
        );
        const colors = extractColors(colorHtml);

        if (colors.length === 0) {
          result.errors.push(`${model}: no colors extracted`);
          return;
        }

        // Fetch BYO trim page
        const trimHtml = await fetchText(
          `${KIA_BYO_BASE}.trim.${model}.html`,
        );
        const trims = extractTrims(trimHtml);

        if (trims.length === 0) {
          result.errors.push(`${model}: no trims extracted`);
          return;
        }

        // For each trim, find matching product and upsert colors
        for (const trim of trims) {
          const product = findProduct(productsByKey, model, trim.code);
          if (!product) continue;

          const rows = colors.map((c, i) => ({
            product_id: product.id,
            color_code: c.code,
            color_name: c.name,
            color_type: c.type,
            is_standard: c.is_standard,
            price_delta: 0,
            swatch_url: c.swatch_url,
            hero_image_url: null as string | null,
            sort_order: i,
          }));

          const { error: upsertErr } = await supabase
            .from('variant_colors')
            .upsert(rows, { onConflict: 'product_id,color_code' });

          if (upsertErr) {
            result.errors.push(`${model}/${trim.code}: upsert failed — ${upsertErr.message}`);
          } else {
            result.colors_upserted += rows.length;
          }

          if (colors.some(c => c.is_standard)) {
            productsWithStandardColor.add(product.id);
          }
        }

        result.models_processed++;
      }),
    );

    // Log rejected promises
    for (const s of settled) {
      if (s.status === 'rejected') {
        result.errors.push(`Model batch error: ${String(s.reason)}`);
      }
    }
  }

  // 3. Fetch pricing API per car_key to get premium paint delta
  const carKeys = new Set<string>();
  for (const p of products) {
    const ck = (p.meta_json as Record<string, unknown> | null)?.car_key;
    if (typeof ck === 'string') carKeys.add(ck);
  }

  for (const carKey of carKeys) {
    try {
      const res = await fetch(
        `${KIA_PRICING_API}?regionCode=NSW&modelCode=${carKey}`,
      );
      const data = (await res.json()) as {
        dataInfo?: Array<{
          trimInfo: Array<{
            trimCode: string;
            priceOfferNSW?: string;
            premiumOfferPriceNSW?: string;
          }>;
        }>;
      };

      if (!data.dataInfo?.length) continue;

      for (const t of data.dataInfo[0].trimInfo) {
        const premNSW = parseFloat(t.premiumOfferPriceNSW ?? '');
        const stdNSW = parseFloat(t.priceOfferNSW ?? '');
        const delta = premNSW && stdNSW ? premNSW - stdNSW : 0;
        if (delta <= 0) continue;

        // Find the product for this trim
        const product = products.find(
          p =>
            (p.meta_json as Record<string, unknown> | null)?.car_key === carKey &&
            (p.meta_json as Record<string, unknown> | null)?.grade_code === t.trimCode,
        );
        if (!product || !productsWithStandardColor.has(product.id)) continue;

        const { error: deltaErr } = await supabase
          .from('variant_colors')
          .update({ price_delta: Math.round(delta * 100) / 100 })
          .eq('product_id', product.id)
          .eq('is_standard', false);

        if (!deltaErr) {
          result.price_deltas_set++;
        }
      }
    } catch (e) {
      result.errors.push(`Pricing ${carKey}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 4. Enrich with 360 hero images from KWCMS CDN
  console.log('[KiaColorSync] Phase 4: Hero image enrichment');

  // 4a. Load vehicle_models to map product → CDN model key
  const { data: vehicleModels } = await supabase
    .from('vehicle_models')
    .select('id, slug')
    .eq('oem_id', 'kia-au');

  const modelSlugById: Record<string, string> = {};
  if (vehicleModels) {
    for (const vm of vehicleModels) modelSlugById[vm.id] = vm.slug;
  }

  // Build product_id → CDN model key
  const productToCdn: Record<string, string> = {};
  for (const p of products) {
    if (!p.model_id) continue;
    const slug = modelSlugById[p.model_id];
    if (!slug) continue;
    const baseSlug = slug.replace(/-\d{4}$/, '');
    productToCdn[p.id] = SLUG_TO_CDN[baseSlug] || baseSlug;
  }

  // 4b. Scrape model pages for 360 render URLs
  const cdnData: Record<string, CdnModelData> = {};
  for (const modelGroup of batch(CDN_MODEL_PAGES, 5)) {
    const settled = await Promise.allSettled(
      modelGroup.map(async (model) => {
        try {
          const html = await fetchText(`${KIA_BASE}/au/cars/${model}.html`);
          cdnData[model] = extractCdnHeroes(html);
        } catch {
          // Model page not found — skip
        }
      }),
    );
    for (const s of settled) {
      if (s.status === 'rejected') {
        result.errors.push(`CDN scrape error: ${String(s.reason)}`);
      }
    }
  }

  // Inject manual CDN data for models where page scraping finds nothing
  for (const [model, manual] of Object.entries(MANUAL_CDN_DATA)) {
    if (!cdnData[model] || (!cdnData[model].templateUrl && Object.keys(cdnData[model].heroMap).length === 0)) {
      cdnData[model] = { heroMap: {}, templateUrl: manual.templateUrl, templateSlug: manual.templateSlug };
    }
  }

  // 4c. Load variant_colors that need hero images
  const productIds = products.map(p => p.id);
  interface VcRow { id: string; product_id: string; color_name: string; hero_image_url: string | null }
  let allVc: VcRow[] = [];
  for (const chunk of batch(productIds, 100)) {
    const { data } = await supabase
      .from('variant_colors')
      .select('id, product_id, color_name, hero_image_url')
      .in('product_id', chunk);
    if (data) allVc = allVc.concat(data as VcRow[]);
  }

  // 4d. Match colors to CDN URLs and update
  const probeCache = new Map<string, string | null>();
  // Group by (cdnModel, colorSlug) for efficient matching
  const colorsByModel = new Map<string, Map<string, VcRow[]>>();
  for (const vc of allVc) {
    const cdnModel = productToCdn[vc.product_id];
    if (!cdnModel) continue;
    const colorSlug = slugify(vc.color_name);
    if (!colorsByModel.has(cdnModel)) colorsByModel.set(cdnModel, new Map());
    const modelColors = colorsByModel.get(cdnModel)!;
    if (!modelColors.has(colorSlug)) modelColors.set(colorSlug, []);
    modelColors.get(colorSlug)!.push(vc);
  }

  for (const [cdnModel, colorMap] of colorsByModel) {
    const data = cdnData[cdnModel];
    if (!data) continue;

    for (const [colorSlug, vcs] of colorMap) {
      const cacheKey = `${cdnModel}:${colorSlug}`;
      const heroUrl = await resolveHeroUrl(colorSlug, data, probeCache, cacheKey);
      if (!heroUrl) continue;

      const gallery = buildGalleryUrls(heroUrl);

      for (const vc of vcs) {
        // Skip if already has a valid 360 hero
        if (vc.hero_image_url && vc.hero_image_url.includes('_00000')) continue;

        const { error } = await supabase
          .from('variant_colors')
          .update({ hero_image_url: heroUrl, gallery_urls: gallery })
          .eq('id', vc.id);

        if (!error) result.hero_images_set++;
      }
    }
  }

  // 5. Clean up dead model entries
  for (const slug of DEAD_MODELS) {
    const { data: deadModels } = await supabase
      .from('vehicle_models')
      .select('id')
      .eq('oem_id', 'kia-au')
      .eq('slug', slug);

    if (!deadModels?.length) continue;

    const modelIds = deadModels.map(m => m.id);

    // Find products belonging to dead models
    const { data: deadProducts } = await supabase
      .from('products')
      .select('id')
      .in('model_id', modelIds);

    if (!deadProducts?.length) continue;

    const deadProductIds = deadProducts.map(p => p.id);

    const { count, error: delErr } = await supabase
      .from('variant_colors')
      .delete({ count: 'exact' })
      .in('product_id', deadProductIds);

    if (delErr) {
      result.errors.push(`Dead cleanup ${slug}: ${delErr.message}`);
    } else {
      result.dead_entries_removed += count ?? 0;
    }
  }

  console.log(
    `[KiaColorSync] Done — ${result.models_processed} models, ` +
    `${result.colors_upserted} colors, ${result.hero_images_set} heroes, ` +
    `${result.price_deltas_set} deltas, ${result.dead_entries_removed} dead removed, ` +
    `${result.errors.length} errors`,
  );

  return result;
}
