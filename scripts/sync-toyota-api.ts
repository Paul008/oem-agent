/**
 * Toyota API Sync Script
 *
 * Uses Puppeteer with real Chrome to bypass Cloudflare,
 * then calls Toyota's internal API to fetch full product data.
 *
 * Requirements: Google Chrome must be installed at:
 *   /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
 *
 * Run: npx tsx scripts/sync-toyota-api.ts
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

    if (result.error) {
      console.warn(`  Variant API error: ${result.status}`);
      return null;
    }
    return result as VariantApiResponse;
  } catch (err) {
    console.warn(`  Variant API exception: ${err}`);
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

    if (result.error) {
      console.warn(`  Trim API error: ${result.status}`);
      return null;
    }
    return result as TrimApiResponse;
  } catch (err) {
    console.warn(`  Trim API exception: ${err}`);
    return null;
  }
}

async function refreshSession(page: any, modelSlug: string) {
  console.log(`  [Session] Refreshing via /${modelSlug}`);
  await page.goto(`https://www.toyota.com.au/${modelSlug}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await new Promise(r => setTimeout(r, 3000));
}

async function upsertVariantProduct(
  oemId: string,
  variant: VariantApiResponse['variant'],
  trim: VariantApiResponse['trims'][0],
  trimDetail: TrimApiResponse | null
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
  };

  if (heroImageUrl) {
    product.primary_image_r2_key = heroImageUrl;
  }

  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('oem_id', oemId)
    .eq('external_key', externalKey)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('products').update(product).eq('id', existing.id);
    if (error) console.error(`  Update error: ${error.message}`);
    else console.log(`  ✅ Updated: ${title}`);
  } else {
    const { error } = await supabase.from('products').insert(product);
    if (error) console.error(`  Insert error: ${error.message}`);
    else console.log(`  ✅ Created: ${title}`);
  }

  if (trimDetail?.paints) {
    for (const paint of trimDetail.paints) {
      const colorCode = paint.BodyPaintCode;
      const colorName = paint.BodyPaintDescription;
      const price = parseFloat(paint.PricingOptions?.Driveaway_Price) || null;
      const swatchUrl = paint.BodyPaintSwatchImage ? `https:${paint.BodyPaintSwatchImage}` : null;
      const heroUrl = paint.Images?.[0] ? `https:${paint.Images[0].URL}` : null;

      const { data: existingColor } = await supabase
        .from('variant_colors')
        .select('id')
        .eq('product_id', existing?.id)
        .eq('color_code', colorCode)
        .maybeSingle();

      const colorData = {
        product_id: existing?.id,
        color_code: colorCode,
        color_name: colorName,
        price_amount: price,
        swatch_url: swatchUrl,
        hero_image_url: heroUrl,
        updated_at: new Date().toISOString(),
      };

      if (existingColor) {
        await supabase.from('variant_colors').update(colorData).eq('id', existingColor.id);
      } else if (existing?.id) {
        await supabase.from('variant_colors').insert(colorData);
      }
    }
  }
}

async function main() {
  console.log('=== Toyota API Sync ===');

  const { data: products } = await supabase
    .from('products')
    .select('external_key, title')
    .eq('oem_id', 'toyota-au')
    .not('external_key', 'is', null);

  const variantIds = [...new Set((products || []).map((p: any) => p.external_key?.replace(/^toyota-au-/, '') || ''))].filter(Boolean);
  console.log(`Found ${variantIds.length} unique variant IDs`);

  const browser = await createBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );

  let processed = 0;
  let errors = 0;

  for (const variantId of variantIds) {
    console.log(`\n[${++processed}/${variantIds.length}] ${variantId}`);

    if (processed % 5 === 1) {
      await refreshSession(page, 'hilux');
    }

    const variantData = await fetchVariant(page, variantId);
    if (!variantData || !variantData.variant) {
      errors++;
      continue;
    }

    for (const trim of variantData.trims || []) {
      const trimDetail = await fetchTrim(page, trim.ID);
      await upsertVariantProduct('toyota-au', variantData.variant, trim, trimDetail);
    }
  }

  await browser.close();
  console.log(`\n=== Done: ${processed} variants, ${errors} errors ===`);
}

main().catch(console.error);
