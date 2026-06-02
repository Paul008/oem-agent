/**
 * Toyota Sync Apify Actor
 *
 * Uses Crawlee's PuppeteerCrawler with stealth plugins to bypass Cloudflare,
 * extract variant IDs from Toyota Australia's website, and call internal APIs
 * for specs/pricing/colours.
 */

import { Actor } from 'apify';
import { PuppeteerCrawler, Dataset, RequestQueue, Configuration } from 'crawlee';

const BASE_API = 'https://www.toyota.com.au/main/api/v1/toyotavehicles';
const BASE_URL = 'https://www.toyota.com.au';

// Model paths to skip
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

interface SyncResult {
  variantId: string;
  variantName: string;
  trims: Array<{
    trimId: string;
    trimName: string;
    trimCode: string;
    paints: Array<{
      colorCode: string;
      colorName: string;
      price: number | null;
      imageUrl: string | null;
      swatchUrl: string | null;
    }>;
  }>;
  specs: {
    bodyType: string;
    drivetrain: string;
    engineLitres: string;
    engineType: string;
    transmission: string;
    fuelConsumption: string;
    maxPowerKW: string;
    lengthMM: string;
    widthMM: string;
    heightMM: string;
  };
}

await Actor.init();

const input = await Actor.getInput() as {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  maxVariants?: number;
};

console.log('[ToyotaActor] Starting sync...');
console.log(`[ToyotaActor] Input: maxVariants=${input.maxVariants || 'unlimited'}`);

const requestQueue = await RequestQueue.open();
await requestQueue.addRequest({ url: `${BASE_URL}/all-vehicles`, uniqueKey: 'all-vehicles' });

const allVariantIds: string[] = [];
const syncResults: SyncResult[] = [];

const crawler = new PuppeteerCrawler({
  requestQueue,
  maxConcurrency: 1, // Be polite to Toyota
  requestHandlerTimeoutSecs: 120,
  launchContext: {
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    },
    useChrome: true,
  },
  browserPoolOptions: {
    useFingerprints: true,
    fingerprintOptions: {
      fingerprintGeneratorOptions: {
        browsers: ['chrome'],
        devices: ['desktop'],
        operatingSystems: ['macos'],
      },
    },
  },

  async requestHandler({ page, request, enqueueLinks }) {
    const url = request.url;
    console.log(`[ToyotaActor] Processing: ${url}`);

    if (url.includes('/all-vehicles')) {
      // Wait for React to render
      await page.evaluate(() => new Promise(r => setTimeout(r, 5000)));

      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href^="/"]'))
          .map((a: any) => a.getAttribute('href'))
          .filter((href: string) => href && /^\/[a-z0-9-]+\/?$/.test(href))
          .filter((href: string) => href !== '/')
          .map((href: string) => href.replace(/\/$/, ''));
      });

      const unique = [...new Set(links)].filter((p) => !EXCLUDED_PATHS.has(p));
      console.log(`[ToyotaActor] Found ${unique.length} model paths: ${unique.join(', ')}`);

      for (const path of unique) {
        await requestQueue.addRequest({
          url: `${BASE_URL}${path}`,
          uniqueKey: `model-${path}`,
        });
      }
      return;
    }

    // Model page — extract variant IDs
    await page.evaluate(() => new Promise(r => setTimeout(r, 4000)));

    const html = await page.content();
    const matches = html.match(/NMToyota[A-Za-z0-9]+/g);
    const uniqueIds = [...new Set(matches || [])] as string[];
    const variantIds = uniqueIds.filter((id) => id.length === 25);

    console.log(`[ToyotaActor] ${request.url}: ${variantIds.length} variants (${uniqueIds.length} total NM codes)`);

    for (const variantId of variantIds) {
      if (input.maxVariants && allVariantIds.length >= input.maxVariants) {
        console.log(`[ToyotaActor] Reached maxVariants limit: ${input.maxVariants}`);
        break;
      }

      if (allVariantIds.includes(variantId)) continue;
      allVariantIds.push(variantId);

      try {
        const result = await syncVariant(page, variantId);
        if (result) syncResults.push(result);
      } catch (e) {
        console.error(`[ToyotaActor] Failed to sync ${variantId}:`, e);
      }
    }
  },
});

await crawler.run();

// Save results to default Apify dataset
await Actor.pushData({
  syncedAt: new Date().toISOString(),
  variantsDiscovered: allVariantIds.length,
  variantsSynced: syncResults.length,
  results: syncResults,
});

console.log(`[ToyotaActor] Done. Synced ${syncResults.length}/${allVariantIds.length} variants.`);

await Actor.exit();

// ────────────────────────────── Helpers ──────────────────────────────

async function syncVariant(page: any, variantId: string): Promise<SyncResult | null> {
  console.log(`[ToyotaActor] Syncing variant: ${variantId}`);

  // Call variant API via browser's fetch (uses session cookies)
  const variantRes = await page.evaluate(
    async (vid: string, baseUrl: string) => {
      const res = await fetch(`${baseUrl}/range/grades/variants/${vid}`, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-AU,en;q=0.9',
        },
      });
      if (!res.ok) return null;
      return await res.json();
    },
    variantId,
    BASE_API,
  );

  if (!variantRes?.variant) {
    console.log(`[ToyotaActor] Variant API returned no data for ${variantId}`);
    return null;
  }

  const variant = variantRes.variant as VariantApiResponse['variant'];
  const trims: SyncResult['trims'] = [];

  for (const trim of variantRes.trims || []) {
    const trimRes = await page.evaluate(
      async (tid: string, baseUrl: string) => {
        const res = await fetch(`${baseUrl}/range/grades/variants/trims/${tid}?postcode=3000`, {
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-AU,en;q=0.9',
          },
        });
        if (!res.ok) return null;
        return await res.json();
      },
      trim.ID,
      BASE_API,
    );

    if (!trimRes?.paints) continue;

    const paints = trimRes.paints.map((paint: any) => ({
      colorCode: paint.BodyPaintCode,
      colorName: paint.BodyPaintDescription,
      price: parseFloat(paint.PricingOptions?.Driveaway_Price) || null,
      imageUrl: paint.Images?.[0] ? `https:${paint.Images[0].URL}` : null,
      swatchUrl: paint.BodyPaintSwatchImage ? `https:${paint.BodyPaintSwatchImage}` : null,
    }));

    trims.push({
      trimId: trim.ID,
      trimName: trim.Name,
      trimCode: trim.TrimCode,
      paints,
    });
  }

  return {
    variantId,
    variantName: variant.Name,
    trims,
    specs: {
      bodyType: variant.BodyType,
      drivetrain: variant.Drivetrain,
      engineLitres: variant.EngineLitres,
      engineType: variant.EngineType,
      transmission: variant.TransmissionType,
      fuelConsumption: variant.FuelConsumption,
      maxPowerKW: variant.MaxPowerKW,
      lengthMM: variant.LengthMM,
      widthMM: variant.WidthMM,
      heightMM: variant.HeightMM,
    },
  };
}
