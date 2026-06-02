/**
 * Toyota Browser Sync
 *
 * Two modes:
 *   1. Local: uses @cloudflare/puppeteer (blocked by Cloudflare challenge)
 *   2. Apify: uses Apify actor with stealth browser (recommended for production)
 *
 * Discovery uses Toyota's public TDP NavCategory API; variant and trim detail
 * still come from Toyota Australia's protected `/main/api/v1/toyotavehicles`
 * endpoints inside a browser/actor session.
 */

import type { BrowserWorker } from '@cloudflare/puppeteer';
import type { SupabaseClient } from '@supabase/supabase-js';
import puppeteer from '@cloudflare/puppeteer';
import { runApifyActor } from './apify-client';

const BASE_API = 'https://www.toyota.com.au/main/api/v1/toyotavehicles';
const BASE_URL = 'https://www.toyota.com.au';
const NAV_CATEGORY_API = 'https://app.toyotainventory.com.au/api/NavCategory';
const OEM_ID = 'toyota-au';
const APIFY_ACTOR_ID = 'czkjXRsKOAC7ixeIA'; // Published Apify actor
const DEFAULT_TOYOTA_DEALER_ID = '36948'; // Werribee Toyota, from the TDP/NavCategory reference
const TOYOTA_PRICING_POSTCODE = '3030';

const EXCLUDED_PATHS = new Set([
  '/news', '/offers', '/about', '/contact', '/privacy', '/terms', '/cookie',
  '/search', '/fleet', '/service', '/finance', '/corporate', '/certified',
  '/accessories', '/parts', '/book', '/test-drive', '/find-a-dealer',
  '/brochure', '/config', '/trade-in', '/careers', '/sitemap', '/api',
  '/main', '/_next', '/static', '/assets', '/images', '/fonts', '/js', '/css',
  '/used-vehicles', '/membership', '/gazoo-racing', '/discover',
  '/all-vehicles', '/cars', '/suvs-4wds', '/utes-and-vans',
  '/gr-performance', '/family-cars', '/owners', '/privacy-cookies',
]);

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
  };
  trims: Array<{
    ID: string;
    Name: string;
    TrimCode: string;
  }>;
  success: boolean;
}

interface TrimApiResponse {
  trim?: {
    ID: string;
    Name: string;
    TrimImage?: string;
    TrimCode?: string;
    TrimDescription?: string;
    VariantID?: string;
  };
  paints: Array<{
    ID: string;
    Name: string;
    BodyPaintDescription?: string;
    BodyPaintCode?: string;
    BodyPaintSwatchImage?: string;
    BodyPaintSwatchHex?: string;
    MaterialCode?: string;
    PricingOptions: {
      Driveaway_Price: string;
      Driveaway_Price_Disclaimer?: string | null;
      IsValid?: boolean;
    };
    Images: Array<{
      URL: string;
      ResolutionString: string;
      FileType?: string;
    }>;
  }>;
  success: boolean;
}

export interface ToyotaSyncResult {
  variantsDiscovered: number;
  variantsProcessed: number;
  variantsSynced: number;
  productsCreated: number;
  productsUpdated: number;
  colorsUpserted: number;
  errors: string[];
}

interface ToyotaPaint {
  colorCode: string;
  colorName: string;
  price: number | null;
  imageUrl: string | null;
  swatchUrl: string | null;
  galleryUrls: string[];
}

interface ToyotaUpsertCounts {
  productsCreated: number;
  productsUpdated: number;
  colorsUpserted: number;
  productsSynced: number;
}

function parsePrice(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 999999 ? Math.round(n * 100) / 100 : null;
}

function toyotaUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^https?:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${BASE_URL}${trimmed}`;
  return trimmed;
}

function imageFromToyotaImages(images?: Array<{ URL?: string; ResolutionString?: string }>): string | null {
  if (!images?.length) return null;
  const preferred = images.find(image => image.ResolutionString === '907x510')
    ?? images.find(image => image.ResolutionString?.includes('907'))
    ?? images[0];
  return toyotaUrl(preferred.URL);
}

function galleryFromToyotaImages(images?: Array<{ URL?: string; ResolutionString?: string }>): string[] {
  if (!images?.length) return [];
  return [...new Set(images.map(image => toyotaUrl(image.URL)).filter((url): url is string => Boolean(url)))];
}

function urlFromUnknownImage(image: unknown): string | null {
  if (typeof image === 'string') return toyotaUrl(image);
  if (!image || typeof image !== 'object') return null;
  const obj = image as { URL?: string; url?: string; imageUrl?: string };
  return toyotaUrl(obj.URL ?? obj.url ?? obj.imageUrl);
}

function galleryFromUnknownImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return [...new Set(images.map(urlFromUnknownImage).filter((url): url is string => Boolean(url)))];
}

function modelPathFromToyotaNavUrl(url?: string | null): string | null {
  if (!url) return null;
  let path = String(url).trim();
  if (!path) return null;
  try {
    if (/^https?:/i.test(path)) path = new URL(path).pathname;
  } catch { /* keep original path */ }

  path = path.split('?')[0].split('#')[0].replace(/\/+$/, '');
  const match = path.match(/^\/new-vehicles\/([^/]+)/i);
  const slug = match?.[1] ?? path.match(/^\/([^/]+)$/)?.[1];
  if (!slug) return null;
  const modelPath = `/${slug.toLowerCase()}`;
  if (!/^\/[a-z0-9-]+$/.test(modelPath)) return null;
  if (EXCLUDED_PATHS.has(modelPath)) return null;
  return modelPath;
}

interface ToyotaNavGrade {
  url?: string;
}

interface ToyotaNavModelGroup {
  url?: string | null;
  grades?: ToyotaNavGrade[];
}

interface ToyotaNavVehicle {
  title?: string;
  url?: string;
  modelgroups?: ToyotaNavModelGroup[];
}

interface ToyotaNavCategory {
  title?: string;
  vehicles?: ToyotaNavVehicle[];
}

function collectToyotaNavModelPaths(data: unknown): string[] {
  const paths = new Set<string>();
  for (const category of (Array.isArray(data) ? data : []) as ToyotaNavCategory[]) {
    for (const vehicle of category.vehicles ?? []) {
      const vehiclePath = modelPathFromToyotaNavUrl(vehicle.url);
      if (vehiclePath) paths.add(vehiclePath);
      for (const group of vehicle.modelgroups ?? []) {
        const groupPath = modelPathFromToyotaNavUrl(group.url);
        if (groupPath) paths.add(groupPath);
        for (const grade of group.grades ?? []) {
          const gradePath = modelPathFromToyotaNavUrl(grade.url);
          if (gradePath) paths.add(gradePath);
        }
      }
    }
  }
  return [...paths].sort();
}

async function fetchToyotaNavModelPaths(dealerId = DEFAULT_TOYOTA_DEALER_ID): Promise<string[]> {
  const res = await fetch(`${NAV_CATEGORY_API}?dealerid=${encodeURIComponent(dealerId)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (!res.ok) throw new Error(`Toyota NavCategory HTTP ${res.status}`);
  return collectToyotaNavModelPaths(await res.json());
}

function normalizeActorPaint(paint: any): ToyotaPaint {
  const rawImages = Array.isArray(paint.Images) ? paint.Images : paint.images;
  const galleryUrls = Array.isArray(paint.galleryUrls)
    ? paint.galleryUrls.map(toyotaUrl).filter((url: string | null): url is string => Boolean(url))
    : galleryFromUnknownImages(rawImages);
  const imageUrl = toyotaUrl(paint.imageUrl ?? paint.heroImageUrl)
    ?? urlFromUnknownImage(Array.isArray(rawImages) ? rawImages[0] : null)
    ?? imageFromToyotaImages(Array.isArray(paint.Images) ? paint.Images : undefined)
    ?? galleryUrls[0]
    ?? null;
  const swatchUrl = toyotaUrl(paint.swatchUrl ?? paint.BodyPaintSwatchImage ?? paint.bodyPaintSwatchImage)
    ?? paint.BodyPaintSwatchHex
    ?? paint.swatchHex
    ?? null;
  const colorCode = String(
    paint.colorCode
      ?? paint.BodyPaintCode
      ?? paint.bodyPaintCode
      ?? paint.colour_code
      ?? paint.colour_material_code
      ?? paint.MaterialCode
      ?? paint.materialCode
      ?? paint.ID
      ?? '',
  ).trim();
  const colorName = String(
    paint.colorName
      ?? paint.BodyPaintDescription
      ?? paint.bodyPaintDescription
      ?? paint.colour_name
      ?? paint.Name
      ?? colorCode,
  ).trim();

  return {
    colorCode,
    colorName,
    price: parsePrice(paint.price ?? paint.PricingOptions?.Driveaway_Price),
    imageUrl,
    swatchUrl,
    galleryUrls,
  };
}

function titleWithTrim(variantName: string, trimName?: string | null): string {
  const base = String(variantName || '').trim();
  const trim = String(trimName || '').trim();
  if (!trim) return base;
  if (base.toLowerCase().includes(trim.toLowerCase())) return base;
  return `${base} ${trim}`.replace(/\s+/g, ' ').trim();
}

function externalKeyForTrim(variantId: string, trimCode?: string | null, trimId?: string | null): string {
  const trimKey = String(trimCode || trimId || 'base')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${OEM_ID}-${variantId}-${trimKey || 'base'}`;
}

function minPaintPrice(paints: ToyotaPaint[]): number | null {
  const prices = paints.map((paint) => paint.price).filter((price): price is number => typeof price === 'number' && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function priceDelta(price: number | null, basePrice: number | null): number {
  if (!price || !basePrice) return 0;
  return Math.max(0, Math.round((price - basePrice) * 100) / 100);
}

async function upsertToyotaPricing(supabase: SupabaseClient, productId: string, driveawayVic: number | null): Promise<boolean> {
  if (!driveawayVic) return false;
  const { error } = await supabase.from('variant_pricing').upsert({
    product_id: productId,
    price_type: 'standard',
    driveaway_vic: driveawayVic,
    price_qualifier: `VIC driveaway estimate (postcode ${TOYOTA_PRICING_POSTCODE})`,
    source_url: BASE_URL,
    fetched_at: new Date().toISOString(),
    effective_date: new Date().toISOString().slice(0, 10),
  }, { onConflict: 'product_id,price_type' });
  if (error) throw new Error(`pricing ${productId}: ${error.message}`);
  return true;
}

// ────────────────────────────── Apify Mode ──────────────────────────────

export interface ApifySyncOptions {
  token: string;
  actorId?: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  dealerId?: string;
}

export async function runToyotaSyncViaApify(options: ApifySyncOptions): Promise<ToyotaSyncResult> {
  const { token, actorId = APIFY_ACTOR_ID, supabaseUrl, supabaseServiceRoleKey, dealerId = DEFAULT_TOYOTA_DEALER_ID } = options;

  console.log('[ToyotaSync] Starting Apify actor run...');
  const discoveryErrors: string[] = [];
  const modelUrls = await fetchToyotaNavModelPaths(dealerId).catch((error) => {
    discoveryErrors.push(`NavCategory discovery: ${error instanceof Error ? error.message : String(error)}`);
    return [] as string[];
  });

  const apifyResult = await runApifyActor({
    token,
    actorId,
    input: modelUrls.length
      ? {
        modelUrls,
        modelPaths: modelUrls,
        toyotaNavDealerId: dealerId,
        toyotaNavSource: NAV_CATEGORY_API,
      }
      : {},
    timeoutSecs: 600,
    pollIntervalSecs: 15,
  });

  console.log(`[ToyotaSync] Apify run complete. Dataset items: ${apifyResult.items.length}`);

  // The actor returns a single dataset item with all results
  const datasetItem = apifyResult.items[0] as any;
  if (!datasetItem?.results) {
    return {
      variantsDiscovered: 0,
      variantsProcessed: 0,
      variantsSynced: 0,
      productsCreated: 0,
      productsUpdated: 0,
      colorsUpserted: 0,
      errors: [...discoveryErrors, 'No results returned from Apify actor'],
    };
  }

  const syncResults = datasetItem.results as any[];
  const result: ToyotaSyncResult = {
    variantsDiscovered: datasetItem.variantsDiscovered || syncResults.length,
    variantsProcessed: syncResults.length,
    variantsSynced: 0,
    productsCreated: 0,
    productsUpdated: 0,
    colorsUpserted: 0,
    errors: [...discoveryErrors],
  };

  // Upsert to Supabase
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const item of syncResults) {
    try {
      const upsertResult = await upsertProductFromSyncResult(supabase, item);
      result.productsCreated += upsertResult.productsCreated;
      result.productsUpdated += upsertResult.productsUpdated;
      result.colorsUpserted += upsertResult.colorsUpserted;
      if (upsertResult.productsSynced > 0) result.variantsSynced++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`upsert ${item.variantId}: ${msg}`);
    }
  }

  return result;
}

async function upsertProductFromSyncResult(supabase: SupabaseClient, item: any): Promise<ToyotaUpsertCounts> {
  const variantId = item.variantId;
  if (!variantId) throw new Error('missing variantId');

  const specsJson: Record<string, any> = {
    dimensions: {
      length_mm: parseInt(item.specs?.lengthMM, 10) || null,
      width_mm: parseInt(item.specs?.widthMM, 10) || null,
      height_mm: parseInt(item.specs?.heightMM, 10) || null,
    },
    engine: {
      type: item.specs?.engineType,
      size: item.specs?.engineLitres ? `${item.specs.engineLitres}L` : null,
    },
    transmission: {
      type: item.specs?.transmission,
    },
    drivetrain: {
      type: item.specs?.drivetrain,
    },
    performance: {
      fuel_combined_l100km: parseFloat(item.specs?.fuelConsumption) || null,
      power_kw: parseInt(item.specs?.maxPowerKW, 10) || null,
    },
  };

  const counts: ToyotaUpsertCounts = {
    productsCreated: 0,
    productsUpdated: 0,
    colorsUpserted: 0,
    productsSynced: 0,
  };

  const trims = item.trims || [];
  if (!trims.length) throw new Error(`no trims for ${variantId}`);

  for (const trim of trims) {
    const paints: ToyotaPaint[] = (trim.paints || [])
      .map(normalizeActorPaint)
      .filter((paint: ToyotaPaint) => paint.colorCode && paint.colorName);

    const basePrice = minPaintPrice(paints);
    const trimLabel = trim.trimName || trim.trimCode || trim.trimId || null;
    const title = titleWithTrim(item.variantName, trimLabel);
    const externalKey = externalKeyForTrim(variantId, trim.trimCode, trim.trimId);
    const heroImageUrl = paints.find((paint) => paint.imageUrl)?.imageUrl || null;

    const product: Record<string, any> = {
      oem_id: OEM_ID,
      external_key: externalKey,
      title,
      variant_name: trimLabel,
      variant_code: trim.trimCode || trim.trimId || null,
      body_type: item.specs?.bodyType,
      fuel_type: item.specs?.engineType,
      availability: 'available',
      specs_json: specsJson,
      engine_size: item.specs?.engineLitres ? `${item.specs.engineLitres}L` : null,
      transmission: item.specs?.transmission,
      drive: item.specs?.drivetrain,
      drivetrain: item.specs?.drivetrain,
      last_seen_at: new Date().toISOString(),
    };

    if (heroImageUrl) product.primary_image_r2_key = heroImageUrl;
    if (basePrice) {
      product.price_amount = basePrice;
      product.price_currency = 'AUD';
      product.price_type = 'driveaway';
      product.price_qualifier = `VIC driveaway estimate (postcode ${TOYOTA_PRICING_POSTCODE})`;
    }

    const { data: existing, error: findError } = await supabase
      .from('products')
      .select('id')
      .eq('oem_id', OEM_ID)
      .eq('external_key', externalKey)
      .maybeSingle();
    if (findError) throw new Error(`find ${externalKey}: ${findError.message}`);

    let productId: string;

    if (existing) {
      const { error } = await supabase.from('products').update(product).eq('id', existing.id);
      if (error) throw new Error(`update ${externalKey}: ${error.message}`);
      productId = existing.id;
      counts.productsUpdated++;
    } else {
      const { data: inserted, error } = await supabase
        .from('products')
        .insert(product)
        .select('id')
        .single();
      if (error) throw new Error(`insert ${externalKey}: ${error.message}`);
      productId = inserted!.id;
      counts.productsCreated++;
    }

    await upsertToyotaPricing(supabase, productId, basePrice);

    let sortOrder = 0;
    for (const paint of paints) {
      const { error } = await supabase.from('variant_colors').upsert({
        product_id: productId,
        color_code: paint.colorCode,
        color_name: paint.colorName,
        price_delta: priceDelta(paint.price, basePrice),
        is_standard: priceDelta(paint.price, basePrice) === 0,
        swatch_url: paint.swatchUrl,
        hero_image_url: paint.imageUrl,
        gallery_urls: paint.galleryUrls,
        sort_order: sortOrder++,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,color_code' });
      if (error) throw new Error(`color ${externalKey}/${paint.colorCode}: ${error.message}`);
      counts.colorsUpserted++;
    }

    counts.productsSynced++;
  }

  return counts;
}

// ────────────────────────────── Local Mode (Cloudflare Browser) ──────────────────────────────

export async function executeToyotaBrowserSync(
  browserWorker: BrowserWorker,
  supabase: SupabaseClient,
): Promise<ToyotaSyncResult> {
  const sync = new ToyotaBrowserSync(browserWorker, supabase);
  return sync.sync();
}

class ToyotaBrowserSync {
  private browser: any = null;
  private page: any = null;

  constructor(
    private browserWorker: BrowserWorker,
    private supabase: SupabaseClient,
  ) {}

  async sync(): Promise<ToyotaSyncResult> {
    const result: ToyotaSyncResult = {
      variantsDiscovered: 0,
      variantsProcessed: 0,
      variantsSynced: 0,
      productsCreated: 0,
      productsUpdated: 0,
      colorsUpserted: 0,
      errors: [],
    };

    try {
      await this.launchBrowser();

      console.log('[ToyotaSync] Discovering models...');
      const modelUrls = await this.discoverModelUrls();
      console.log(`[ToyotaSync] Found ${modelUrls.length} models`);

      const allVariantIds: string[] = [];
      for (const modelUrl of modelUrls) {
        try {
          const ids = await this.extractVariantIds(modelUrl);
          allVariantIds.push(...ids);
          console.log(`[ToyotaSync] ${modelUrl}: ${ids.length} variants`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`extract ${modelUrl}: ${msg}`);
        }
      }

      const uniqueVariantIds = [...new Set(allVariantIds)];
      result.variantsDiscovered = uniqueVariantIds.length;

      for (let i = 0; i < uniqueVariantIds.length; i++) {
        const variantId = uniqueVariantIds[i];
        console.log(`[ToyotaSync] [${i + 1}/${uniqueVariantIds.length}] ${variantId}`);

        try {
          const variantData = await this.fetchVariant(variantId);
          if (!variantData?.variant) {
            result.errors.push(`variant ${variantId}: no data`);
            continue;
          }

          let syncedTrims = 0;
          for (const trim of variantData.trims || []) {
            const trimDetail = await this.fetchTrim(trim.ID);
            const upsertResult = await this.upsertProduct(variantData.variant, trim, trimDetail);
            if (upsertResult.created) result.productsCreated++;
            if (upsertResult.updated) result.productsUpdated++;
            result.colorsUpserted += upsertResult.colorsUpserted;
            syncedTrims++;
          }
          if (syncedTrims > 0) result.variantsSynced++;

          result.variantsProcessed++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`sync ${variantId}: ${msg}`);
        }
      }
    } finally {
      await this.closeBrowser();
    }

    return result;
  }

  private async launchBrowser() {
    this.browser = await puppeteer.launch(this.browserWorker);
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    );
  }

  private async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  private async discoverModelUrls(): Promise<string[]> {
    const navModelUrls = await fetchToyotaNavModelPaths().catch((error) => {
      console.warn(`[ToyotaSync] NavCategory discovery failed: ${error instanceof Error ? error.message : String(error)}`);
      return [] as string[];
    });
    if (navModelUrls.length) {
      console.log(`[ToyotaSync] NavCategory discovered ${navModelUrls.length} model paths`);
      return navModelUrls;
    }

    await this.page.goto(`${BASE_URL}/all-vehicles`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await this.page.evaluate(() => new Promise(r => setTimeout(r, 3000)));

    const links = await this.page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('a[href^="/"]'));
      return all
        .map((a: any) => a.getAttribute('href') || '')
        .filter((href: string) => href && /^\/[a-z0-9-]+\/?$/.test(href))
        .filter((href: string) => href !== '/')
        .map((href: string) => href.replace(/\/$/, ''));
    });

    const unique = [...new Set(links as string[])];
    return unique.filter((p) => !EXCLUDED_PATHS.has(p));
  }

  private async extractVariantIds(modelPath: string): Promise<string[]> {
    await this.page.goto(`${BASE_URL}${modelPath}`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await this.page.evaluate(() => new Promise(r => setTimeout(r, 4000)));

    const html = await this.page.content();
    const matches = html.match(/NMToyota[A-Za-z0-9]+/g) || [];
    const unique = [...new Set(matches)];
    return unique.filter((id): id is string => typeof id === 'string' && id.length === 25);
  }

  private async fetchVariant(variantId: string): Promise<VariantApiResponse | null> {
    const result = await this.page.evaluate(
      async (vid: string, baseUrl: string) => {
        try {
          const res = await fetch(`${baseUrl}/range/grades/variants/${vid}`, {
            headers: {
              Accept: 'application/json, text/plain, */*',
              'Accept-Language': 'en-AU,en;q=0.9',
            },
          });
          if (!res.ok) return { error: true, status: res.status };
          return await res.json();
        } catch {
          return { error: true };
        }
      },
      variantId,
      BASE_API,
    );

    if (result.error) return null;
    return result as VariantApiResponse;
  }

  private async fetchTrim(trimId: string): Promise<TrimApiResponse | null> {
    const result = await this.page.evaluate(
      async (tid: string, baseUrl: string, postcode: string) => {
        try {
          const res = await fetch(
            `${baseUrl}/range/grades/variants/trims/${tid}?postcode=${postcode}`,
            {
              headers: {
                Accept: 'application/json, text/plain, */*',
                'Accept-Language': 'en-AU,en;q=0.9',
              },
            },
          );
          if (!res.ok) return { error: true, status: res.status };
          return await res.json();
        } catch {
          return { error: true };
        }
      },
      trimId,
      BASE_API,
      TOYOTA_PRICING_POSTCODE,
    );

    if (result.error) return null;
    return result as TrimApiResponse;
  }

  private async upsertProduct(
    variant: VariantApiResponse['variant'],
    trim?: VariantApiResponse['trims'][0],
    trimDetail?: TrimApiResponse | null,
  ) {
    const trimLabel = trim?.Name || trim?.TrimCode || trim?.ID || null;
    const title = titleWithTrim(variant.Name, trimLabel);
    const externalKey = externalKeyForTrim(variant.ID, trim?.TrimCode, trim?.ID);

    const specsJson = {
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

    const paints: ToyotaPaint[] = (trimDetail?.paints || []).map((paint) => ({
      colorCode: paint.BodyPaintCode || paint.MaterialCode || paint.ID,
      colorName: paint.BodyPaintDescription || paint.Name,
      price: parsePrice(paint.PricingOptions?.Driveaway_Price),
      swatchUrl: toyotaUrl(paint.BodyPaintSwatchImage) ?? paint.BodyPaintSwatchHex ?? null,
      imageUrl: imageFromToyotaImages(paint.Images),
      galleryUrls: galleryFromToyotaImages(paint.Images),
    })).filter((paint) => paint.colorCode && paint.colorName);

    const heroImageUrl = paints.find((paint) => paint.imageUrl)?.imageUrl ?? null;
    const minPrice = minPaintPrice(paints);

    const product: Record<string, any> = {
      oem_id: OEM_ID,
      external_key: externalKey,
      title,
      variant_name: trimLabel,
      variant_code: trim?.TrimCode || trim?.ID || null,
      body_type: variant.BodyType,
      fuel_type: variant.EngineType,
      availability: 'available',
      specs_json: specsJson,
      engine_size: variant.EngineLitres ? `${variant.EngineLitres}L` : null,
      transmission: variant.TransmissionType,
      drive: variant.Drivetrain,
      drivetrain: variant.Drivetrain,
      last_seen_at: new Date().toISOString(),
    };

    if (heroImageUrl) product.primary_image_r2_key = heroImageUrl;
    if (minPrice) {
      product.price_amount = minPrice;
      product.price_currency = 'AUD';
      product.price_type = 'driveaway';
      product.price_qualifier = `VIC driveaway estimate (postcode ${TOYOTA_PRICING_POSTCODE})`;
    }

    const { data: existing, error: findError } = await this.supabase
      .from('products')
      .select('id')
      .eq('oem_id', OEM_ID)
      .eq('external_key', externalKey)
      .maybeSingle();
    if (findError) throw new Error(`Find failed: ${findError.message}`);

    let productId: string;

    if (existing) {
      productId = existing.id;
      const { error } = await this.supabase.from('products').update(product).eq('id', existing.id);
      if (error) throw new Error(`Update failed: ${error.message}`);
    } else {
      const { data: inserted, error } = await this.supabase
        .from('products')
        .insert(product)
        .select('id')
        .single();
      if (error) throw new Error(`Insert failed: ${error.message}`);
      productId = inserted!.id;
    }

    await upsertToyotaPricing(this.supabase, productId, minPrice);

    let colorsUpserted = 0;
    let sortOrder = 0;
    for (const paint of paints) {
      const delta = priceDelta(paint.price, minPrice);
      const { error } = await this.supabase.from('variant_colors').upsert({
        product_id: productId,
        color_code: paint.colorCode,
        color_name: paint.colorName,
        price_delta: delta,
        is_standard: delta === 0,
        swatch_url: paint.swatchUrl,
        hero_image_url: paint.imageUrl,
        gallery_urls: paint.galleryUrls,
        sort_order: sortOrder++,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,color_code' });
      if (error) throw new Error(`Color upsert failed: ${error.message}`);
      colorsUpserted++;
    }

    return { created: !existing, updated: !!existing, colorsUpserted };
  }
}
