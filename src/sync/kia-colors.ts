/**
 * Kia AU Color Sync
 *
 * Fetches exterior color data from Kia's Build-Your-Own pages and pricing API,
 * then upserts into `variant_colors`. Designed to run inside the weekly
 * `oem-data-sync` cron job.
 *
 * Data sources:
 *  - BYO color page HTML  → color codes, swatch URLs, per-trim hero renders
 *  - BYO trim page HTML   → trim list (maps colors → products)
 *  - selectPriceByTrim API → premium paint price delta
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

// ============================================================================
// HTML extraction (proven regex from import-kia-full.mjs)
// ============================================================================

interface ExtractedColor {
  code: string;
  name: string;
  type: string;
  is_standard: boolean;
  swatch_url: string | null;
  hero_image_url: string | null;
}

/**
 * Extract color codes, swatch URLs, and BYO hero images from a BYO color page.
 *
 * HTML structure per color:
 *   <li class="color_l on" path="M3R" color="M3R">
 *     <a class="color_a" path="/content/dam/.../kia-seltos-byo-colours-s-mars-orange.webp" ...>
 *       <img src="/content/dam/.../excolorchip/Mars-Orange-M3R.gif" alt="Mars Orange">
 *     </a>
 *   </li>
 *
 * The <a> path is the per-trim, per-color vehicle render — the real hero image.
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

    // Swatch: <img src="...excolorchip/...">
    const swatchMatch = inner.match(/src="([^"]+)"/);
    const swatchUrl = swatchMatch ? `https://www.kia.com${swatchMatch[1]}` : null;

    // Hero: <a class="color_a" path="/content/dam/.../kia-{model}-byo-colours-{trim}-{color}.webp">
    const heroMatch = inner.match(/class="color_a"[^>]*path="(\/content\/dam\/[^"]+\.webp)"/);
    const heroUrl = heroMatch ? `https://www.kia.com${heroMatch[1]}` : null;

    colors.push({
      code,
      name: info.name,
      type: info.type,
      is_standard: STANDARD_COLORS.has(code),
      swatch_url: swatchUrl,
      hero_image_url: heroUrl,
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
}

/** BYO model slug → alternative prefixes used in product external_keys */
const MODEL_ALIASES: Record<string, string[]> = {
  'sportage-hev': ['sportage-hybrid'],
  'sorento-hybrid': ['sorento-hybrid-my25'],
};

/** Normalize BYO trim code to variations found in external_keys */
function trimVariants(trimCode: string): string[] {
  const lc = trimCode.toLowerCase();
  const variants = [lc];
  // GT-LINE → gtl (e.g. GT-LINE-HF → gtl-hf, but also gtline-hf)
  if (lc.includes('gt-line')) {
    variants.push(lc.replace('gt-line', 'gtl'));
    variants.push(lc.replace('gt-line', 'gtline'));
  }
  // GT → gt without hyphen (e.g. GT-AWD → gtawd)
  if (lc.startsWith('gt')) {
    variants.push(lc.replace(/-/g, ''));
  }
  return [...new Set(variants)];
}

function findProduct(
  productsByKey: Record<string, ProductRef>,
  model: string,
  trimCode: string,
): ProductRef | null {
  const lc = trimCode.toLowerCase();
  // Strip body-style suffix for models like ev4-sedan → ev4
  const modelShort = model.replace(/-(sedan|hatch)$/, '');
  // All model name variants to try
  const modelNames = [model];
  if (modelShort !== model) modelNames.push(modelShort);
  const aliases = MODEL_ALIASES[model] ?? [];
  modelNames.push(...aliases);

  // Generate candidates from all model names × trim variants
  const trims = trimVariants(trimCode);
  const candidates: string[] = [];
  for (const m of modelNames) {
    for (const t of trims) {
      candidates.push(`${m}-${t}`);
    }
    candidates.push(`${model}-${trimCode}`);
    candidates.push(`new-${model}-${lc}`);
    candidates.push(`${model}-my25-${lc}`);
  }
  // Tasman body-style variants
  for (const t of trims) {
    candidates.push(`tasman-dual-cab-pick-up-${t}`);
    candidates.push(`tasman-dual-cab-chassis-${t}`);
    candidates.push(`tasman-single-cab-chassis-${t}`);
  }

  for (const key of candidates) {
    if (productsByKey[key]) return productsByKey[key];
  }

  // Partial-match fallback: check all model name variants
  const modelBase = model.replace(/-my24|-my25/g, '');
  const allModelBases = [...new Set([modelBase, modelShort, ...aliases])];
  for (const t of trims) {
    for (const mb of allModelBases) {
      for (const [key, p] of Object.entries(productsByKey)) {
        if (key.includes(t) && key.includes(mb)) return p;
      }
    }
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
    .select('id, external_key, meta_json')
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
  // 2. For each model: fetch trim list, then fetch per-trim color pages
  //    (each trim has its own BYO hero renders with correct wheels/body kit)
  const modelEntries = Object.entries(KIA_MODELS);
  for (const group of batch(modelEntries, 5)) {
    const settled = await Promise.allSettled(
      group.map(async ([model, firstTrim]) => {
        // Fetch trim list first
        const trimHtml = await fetchText(
          `${KIA_BYO_BASE}.trim.${model}.html`,
        );
        const trims = extractTrims(trimHtml);

        if (trims.length === 0) {
          result.errors.push(`${model}: no trims extracted`);
          return;
        }

        // For each trim, fetch its specific color page (trim-accurate hero images)
        for (const trim of trims) {
          const product = findProduct(productsByKey, model, trim.code);
          if (!product) continue;

          let colors: ExtractedColor[];
          try {
            const colorHtml = await fetchText(
              `${KIA_BYO_BASE}.color.${model}.${trim.code}.html`,
            );
            colors = extractColors(colorHtml);
          } catch {
            // Fallback to first trim's color page if this trim's page fails
            try {
              const colorHtml = await fetchText(
                `${KIA_BYO_BASE}.color.${model}.${firstTrim}.html`,
              );
              colors = extractColors(colorHtml);
            } catch {
              result.errors.push(`${model}/${trim.code}: color page fetch failed`);
              continue;
            }
          }

          if (colors.length === 0) continue;

          const rows = colors.map((c, i) => ({
            product_id: product.id,
            color_code: c.code,
            color_name: c.name,
            color_type: c.type,
            is_standard: c.is_standard,
            price_delta: 0,
            swatch_url: c.swatch_url,
            hero_image_url: c.hero_image_url,
            gallery_urls: null,
            sort_order: i,
          }));

          const { error: upsertErr } = await supabase
            .from('variant_colors')
            .upsert(rows, { onConflict: 'product_id,color_code' });

          if (upsertErr) {
            result.errors.push(`${model}/${trim.code}: upsert failed — ${upsertErr.message}`);
          } else {
            result.colors_upserted += rows.length;
            result.hero_images_set += rows.filter(r => r.hero_image_url).length;
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

  // 4. Clean up dead model entries
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
