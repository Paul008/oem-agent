/**
 * Toyota Full Discovery + Sync
 *
 * 1. Crawls /all-vehicles to find all model pages
 * 2. Visits each model page and extracts variant IDs (NM codes)
 * 3. Calls variant API for each discovered ID
 * 4. Calls trim API for colours/pricing/images
 * 5. Upserts products + variant colours
 *
 * Uses real Chrome to bypass Cloudflare.
 */

import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_API = 'https://www.toyota.com.au/main/api/v1/toyotavehicles';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Known non-model paths to exclude
const EXCLUDED_PATHS = new Set([
  '/news', '/offers', '/about', '/contact', '/privacy', '/terms', '/cookie',
  '/search', '/fleet', '/service', '/finance', '/corporate', '/certified',
  '/accessories', '/parts', '/book', '/test-drive', '/find-a-dealer',
  '/brochure', '/config', '/trade-in', '/careers', '/sitemap', '/api',
  '/main', '/_next', '/static', '/assets', '/images', '/fonts', '/js', '/css',
  '/used-vehicles', '/membership', '/gazoo-racing', '/discover',
  '/all-vehicles', '/cars', '/suvs-4wds', '/utes-and-vans',
  '/gr-performance', '/family-cars',
]);

const OEM_ID = 'toyota-au';

interface ModelRow {
  id: string;
  slug: string;
  name: string;
  source_url: string | null;
}

// toyota.com.au path segment -> vehicle_models.slug, for the handful of models
// whose public URL differs from our DB slug (mirror of the accessories sync's
// PATH_OVERRIDES, reversed).
const SITE_PATH_TO_SLUG: Record<string, string> = {
  'bz4x-ev': 'bz4x',
  'gr-supra': 'supra',
  corolla: 'corolla-hatch',
};

// Titles that read like a listed model but are a separate (unlisted) model.
// Never link these during backfill — a NULL is better than a wrong link.
const BACKFILL_SKIP_PATTERNS: RegExp[] = [/(?:^| )bz4x touring(?: |$)/];

const normText = (s: string) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const normPath = (p: string) =>
  (p || '')
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/[?#].*$/, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();

async function loadModels(): Promise<ModelRow[]> {
  const { data, error } = await supabase
    .from('vehicle_models')
    .select('id, slug, name, source_url')
    .eq('oem_id', OEM_ID);
  if (error) throw error;
  return (data as ModelRow[]) || [];
}

// Resolve the model page path a variant was discovered on (e.g. "/corolla-hatch")
// to a vehicle_models.id. Authoritative source of model linkage.
function buildPathResolver(models: ModelRow[]) {
  const bySlug = new Map<string, string>();
  const bySourcePath = new Map<string, string>();
  for (const m of models) {
    bySlug.set(m.slug.toLowerCase(), m.id);
    if (m.source_url) bySourcePath.set(normPath(m.source_url), m.id);
  }
  return (modelUrl: string): string | null => {
    const path = normPath(modelUrl);
    if (!path) return null;
    const mapped = SITE_PATH_TO_SLUG[path];
    if (mapped && bySlug.has(mapped)) return bySlug.get(mapped)!;
    if (bySlug.has(path)) return bySlug.get(path)!;
    if (bySourcePath.has(path)) return bySourcePath.get(path)!;
    return null;
  };
}

// Best-effort model match from a product title. Used only to backfill rows the
// crawl can no longer reach. Longest phrase wins; only confident, word-boundary
// matches link.
function buildTitleResolver(models: ModelRow[]) {
  const phrases: Array<{ p: string; id: string }> = [];
  for (const m of models) {
    phrases.push({ p: normText(m.name), id: m.id });
    if (normText(m.slug) !== normText(m.name)) phrases.push({ p: normText(m.slug), id: m.id });
  }
  // Toyota naming quirks not covered by name/slug.
  const ALIASES: Record<string, string> = { 'landcruiser wagon': 'landcruiser-300' };
  for (const [alias, slug] of Object.entries(ALIASES)) {
    const m = models.find((x) => x.slug === slug);
    if (m) phrases.push({ p: normText(alias), id: m.id });
  }
  phrases.sort((a, b) => b.p.length - a.p.length);
  return (title: string): string | null => {
    const t = normText(title);
    if (BACKFILL_SKIP_PATTERNS.some((re) => re.test(t))) return null;
    for (const { p, id } of phrases) {
      if (!p) continue;
      const re = new RegExp(`(?:^| )${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`);
      if (re.test(t)) return id;
    }
    return null;
  };
}

// Link toyota-au products that still have a NULL model_id and whose title
// confidently matches a model. Idempotent; safe to run repeatedly.
async function backfillModelIds(models: ModelRow[]): Promise<number> {
  const resolveTitle = buildTitleResolver(models);
  const { data: rows, error } = await supabase
    .from('products')
    .select('id, title')
    .eq('oem_id', OEM_ID)
    .is('model_id', null)
    .not('external_key', 'is', null);
  if (error) {
    console.error(`[Backfill] load error: ${error.message}`);
    return 0;
  }

  let linked = 0;
  for (const row of rows || []) {
    const modelId = resolveTitle(row.title || '');
    if (!modelId) continue;
    const { error: upErr } = await supabase
      .from('products')
      .update({ model_id: modelId, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (upErr) {
      console.error(`[Backfill] update error for "${row.title}": ${upErr.message}`);
      continue;
    }
    linked++;
  }
  console.log(`[Backfill] linked ${linked}/${(rows || []).length} NULL-model_id products by title`);
  return linked;
}

interface VariantApiResponse {
  variant: {
    ID: string;
    Name: string;
    BodyType: string;
    Drivetrain: string;
    EngineLitres: string;
    EngineType: string;
    FuelConsumption: string;
    MaxPowerKW: string;
    TransmissionType: string;
    LengthMM: string;
    WidthMM: string;
    HeightMM: string;
    HasEnhancementPack: boolean;
    HasSpecialOffers: boolean;
    VariantOrder: number;
    TrimOrdering: string;
    IsDataValid: boolean;
  };
  trims: Array<{
    ID: string;
    Name: string;
    TrimImage: string;
    SSN: string;
    TrimDescription: string;
    TrimOrder: number;
    TrimCode: string;
    IsDataValid: boolean;
  }>;
  success: boolean;
}

interface TrimApiResponse {
  trim: {
    ID: string;
    Name: string;
    TrimImage: string;
    SSN: string;
    TrimDescription: string;
    TrimOrder: number;
    TrimCode: string;
    VariantID: string;
    PaintOrdering: string;
  };
  paints: Array<{
    ID: string;
    Name: string;
    BodyPaintDescription: string;
    BodyPaintCode: string;
    BodyPaintSwatchImage: string;
    BodyPaintSwatchHex: string;
    MaterialCode: string;
    PricingOptions: {
      Driveaway_Price: string;
      Driveaway_Price_Disclaimer: string | null;
      IsValid: boolean;
    };
    Images: Array<{
      URL: string;
      ResolutionString: string;
      FileType: string;
    }>;
  }>;
  success: boolean;
}

async function createBrowser() {
  return puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

async function discoverModelUrls(page: any): Promise<string[]> {
  console.log('[Discovery] Navigating to /all-vehicles');
  await page.goto('https://www.toyota.com.au/all-vehicles', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await new Promise(r => setTimeout(r, 5000));

  const links = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a[href^="/"]'));
    return allLinks
      .map(a => ({
        href: a.getAttribute('href') || '',
        text: (a as HTMLElement).innerText.trim(),
      }))
      .filter(l => l.href && l.href.match(/^\/[a-z0-9-]+\/?$/))
      .filter(l => l.href !== '/')
      .filter((l, i, arr) => arr.findIndex(t => t.href === l.href) === i);
  });

  const modelUrls = links
    .filter((l: any) => !EXCLUDED_PATHS.has(l.href.replace(/\/$/, '')))
    .map((l: any) => l.href.replace(/\/$/, ''));

  console.log(`[Discovery] Found ${modelUrls.length} model URLs`);
  return modelUrls;
}

async function extractVariantIds(page: any, modelUrl: string): Promise<string[]> {
  const url = `https://www.toyota.com.au${modelUrl}`;
  console.log(`  [Extract] ${url}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));

    const html = await page.content();
    const matches = html.match(/NMToyota[A-Za-z0-9]+/g);
    const unique = [...new Set(matches || [])];

    // Filter to actual variant IDs (length 25 = 'NMToyota' + 17 char code)
    // Trim+paint combinations are length 32 ('NMToyota' + 17 + 4 trim + 3 paint)
    const variants = unique.filter((id: string) => id.length === 25);

    console.log(`    Found ${variants.length} variant IDs (${unique.length} total NM codes)`);
    return variants;
  } catch (err) {
    console.warn(`    Error: ${err}`);
    return [];
  }
}

async function fetchVariant(page: any, variantId: string): Promise<VariantApiResponse | null> {
  try {
    const result = await page.evaluate(async (vid: string, baseUrl: string) => {
      const res = await fetch(`${baseUrl}/range/grades/variants/${vid}`, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-AU,en;q=0.9',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        },
      });
      if (!res.ok) return { status: res.status, error: true };
      return await res.json();
    }, variantId, BASE_API);

    if (result.error) return null;
    return result as VariantApiResponse;
  } catch {
    return null;
  }
}

async function fetchTrim(page: any, trimId: string): Promise<TrimApiResponse | null> {
  try {
    const result = await page.evaluate(async (tid: string, baseUrl: string) => {
      const res = await fetch(`${baseUrl}/range/grades/variants/trims/${tid}?postcode=3000`, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-AU,en;q=0.9',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        },
      });
      if (!res.ok) return { status: res.status, error: true };
      return await res.json();
    }, trimId, BASE_API);

    if (result.error) return null;
    return result as TrimApiResponse;
  } catch {
    return null;
  }
}

async function upsertProductFromApi(
  oemId: string,
  variant: VariantApiResponse['variant'],
  trim?: VariantApiResponse['trims'][0],
  trimDetail?: TrimApiResponse | null,
  modelId?: string | null
) {
  const title = variant.Name;
  const rawVariantId = variant.ID;
  const externalKey = `toyota-au-${rawVariantId}`;

  const specsJson: Record<string, any> = {
    dimensions: {
      length_mm: parseInt(variant.LengthMM, 10) || null,
      width_mm: parseInt(variant.WidthMM, 10) || null,
      height_mm: parseInt(variant.HeightMM, 10) || null,
    },
    engine: {
      type: variant.EngineType,
      size: variant.EngineLitres ? `${variant.EngineLitres}L` : null,
    },
    transmission: {
      type: variant.TransmissionType,
    },
    drivetrain: {
      type: variant.Drivetrain,
    },
    performance: {
      fuel_combined_l100km: parseFloat(variant.FuelConsumption) || null,
      power_kw: parseInt(variant.MaxPowerKW, 10) || null,
    },
  };

  let heroImageUrl: string | null = null;
  if (trimDetail?.paints?.[0]?.Images?.length > 0) {
    const highRes = trimDetail.paints[0].Images.find((i: any) => i.ResolutionString === '907x510');
    heroImageUrl = highRes ? `https:${highRes.URL}` : `https:${trimDetail.paints[0].Images[0].URL}`;
  }

  // Get min price from trim paints
  const minPrice = trimDetail?.paints
    ?.map((p: any) => parseFloat(p.PricingOptions?.Driveaway_Price))
    .filter((p: number) => !isNaN(p) && p > 0)
    .sort((a: number, b: number) => a - b)[0];

  const product: Record<string, any> = {
    oem_id: oemId,
    external_key: externalKey,
    title,
    variant_name: trim?.Name || null,
    variant_code: trim?.TrimCode || null,
    body_type: variant.BodyType,
    fuel_type: variant.EngineType,
    availability: 'available',
    specs_json: specsJson,
    engine_size: variant.EngineLitres ? `${variant.EngineLitres}L` : null,
    transmission: variant.TransmissionType,
    drive: variant.Drivetrain,
    drivetrain: variant.Drivetrain,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    price_currency: 'AUD',
    price_type: 'driveaway',
  };

  // Only set when resolved — never overwrite an existing good link with NULL.
  if (modelId) {
    product.model_id = modelId;
  }

  if (heroImageUrl) {
    product.primary_image_r2_key = heroImageUrl;
  }

  if (minPrice) {
    product.price_amount = minPrice;
  }

  let productId: string | null = null;

  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('oem_id', oemId)
    .eq('external_key', externalKey)
    .maybeSingle();

  if (existing) {
    productId = existing.id;
    const { error } = await supabase.from('products').update(product).eq('id', existing.id);
    if (error) console.error(`    Update error: ${error.message}`);
    else console.log(`    ✅ Updated: ${title}`);
  } else {
    const { data: inserted, error } = await supabase.from('products').insert(product).select('id').single();
    if (error) {
      console.error(`    Insert error: ${error.message}`);
    } else {
      productId = inserted!.id;
      console.log(`    ✅ Created: ${title}`);
    }
  }

  // Upsert colours
  if (trimDetail?.paints && productId) {
    for (const paint of trimDetail.paints) {
      const { data: existingColor } = await supabase
        .from('variant_colors')
        .select('id')
        .eq('product_id', productId)
        .eq('color_code', paint.BodyPaintCode)
        .maybeSingle();

      const colorData = {
        product_id: productId,
        color_code: paint.BodyPaintCode,
        color_name: paint.BodyPaintDescription,
        price_delta: parseFloat(paint.PricingOptions?.Driveaway_Price) || 0,
        swatch_url: paint.BodyPaintSwatchImage ? `https:${paint.BodyPaintSwatchImage}` : null,
        hero_image_url: paint.Images?.[0] ? `https:${paint.Images[0].URL}` : null,
      };

      if (existingColor) {
        const { error } = await supabase.from('variant_colors').update(colorData).eq('id', existingColor.id);
        if (error) console.error(`      Color update error: ${error.message}`);
      } else {
        const { error } = await supabase.from('variant_colors').insert(colorData);
        if (error) console.error(`      Color insert error: ${error.message}`);
        else console.log(`      🎨 Color: ${paint.BodyPaintDescription}`);
      }
    }
  }
}

async function main() {
  const backfillOnly = process.argv.includes('--backfill-only');
  const limitArg = process.argv.indexOf('--limit');
  const modelLimit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) || Infinity : Infinity;

  console.log('=== Toyota Full Discovery + Sync ===\n');

  // Model linkage is resolved from the source model page slug (authoritative),
  // so load the catalog up front and reuse it for the backfill sweep.
  const models = await loadModels();
  const resolvePath = buildPathResolver(models);
  console.log(`[Models] loaded ${models.length} ${OEM_ID} vehicle_models`);

  if (backfillOnly) {
    const linked = await backfillModelIds(models);
    console.log(`\n=== Backfill-only done: ${linked} products linked ===`);
    return;
  }

  const browser = await createBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );

  // Phase 1: Discover model URLs
  let modelUrls = await discoverModelUrls(page);
  if (modelLimit !== Infinity) {
    modelUrls = modelUrls.slice(0, modelLimit);
    console.log(`[Discovery] --limit ${modelLimit}: crawling ${modelUrls.length} model pages`);
  }

  // Phase 2: Extract variant IDs, remembering which model page each was found
  // on so the resulting product can be linked to its vehicle_models row.
  const variantModelId = new Map<string, string | null>();
  for (const modelUrl of modelUrls) {
    const variants = await extractVariantIds(page, modelUrl);
    const modelId = resolvePath(modelUrl);
    if (!modelId) {
      console.warn(`    [model_id] no vehicle_models match for ${modelUrl} — its variants stay unlinked`);
    }
    for (const v of variants) {
      // First model page a variant appears on wins.
      if (!variantModelId.has(v)) variantModelId.set(v, modelId);
    }
  }

  const uniqueVariantIds = [...variantModelId.keys()];
  console.log(`\n[Discovery] Total unique variant IDs: ${uniqueVariantIds.length}`);

  // Phase 3: Sync each variant
  let processed = 0;
  let errors = 0;

  for (const variantId of uniqueVariantIds) {
    console.log(`\n[${++processed}/${uniqueVariantIds.length}] ${variantId}`);

    // Refresh session every 5 requests
    if (processed % 5 === 1) {
      await page.goto('https://www.toyota.com.au/hilux', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
      await new Promise(r => setTimeout(r, 3000));
    }

    const variantData = await fetchVariant(page, variantId);
    if (!variantData || !variantData.variant) {
      errors++;
      continue;
    }

    const modelId = variantModelId.get(variantId) ?? null;

    // Sync each trim as a separate product (or just the variant with first trim)
    for (const trim of variantData.trims || []) {
      const trimDetail = await fetchTrim(page, trim.ID);
      await upsertProductFromApi(OEM_ID, variantData.variant, trim, trimDetail, modelId);
    }
  }

  await browser.close();

  // Phase 4: Sweep any remaining NULL model_id rows the crawl couldn't reach.
  const linked = await backfillModelIds(models);

  console.log(`\n=== Done ===`);
  console.log(`Variants processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Backfill-linked: ${linked}`);
}

main().catch(console.error);
