/**
 * Ford Australia — current Build & Price card sync via real browser render.
 *
 * Ford's current Builder renders some nameplates (notably Ranger/Everest) as
 * model cards with prices in the hydrated DOM, while plain fetch / static RSC
 * requests can return edge blocks or template-only payloads. This script visits
 * the Builder, reads the live cards, walks powertrain radios where present, and
 * upserts current product/pricing/image rows.
 *
 * Run:
 *   pnpm tsx scripts/populate-ford-builder-cards.ts --slug=ranger --apply
 *   pnpm tsx scripts/populate-ford-builder-cards.ts --apply
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { modelToUrlName, siblingSlugsFor } from './ford-url-map.ts';

const APPLY = process.argv.includes('--apply');
const SLUG_FILTER = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const POSTCODE = process.env.FORD_BUILDER_POSTCODE || '3000';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

type ModelRow = {
  id: string;
  name: string;
  slug: string;
  body_type: string | null;
  category: string | null;
  source_url: string | null;
};

type ProductRow = {
  id: string;
  title: string;
  model_id: string | null;
  external_key: string | null;
  variant_name: string | null;
  availability: string | null;
  meta_json: Record<string, unknown> | null;
  specs_json: Record<string, unknown> | null;
};

type BuilderCard = {
  cardTestId: string;
  trim: string;
  index: number;
  imageUrl: string | null;
  basePrice: number | null;
  powertrains: Array<{ code: string | null; name: string; price: number | null }>;
};

type BuilderVariant = {
  endpointSlug: string;
  endpointUrlName: string;
  sourceUrl: string;
  targetModel: ModelRow;
  trim: string;
  powertrainCode: string | null;
  powertrainName: string;
  driveaway: number;
  imageUrl: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/g, ' ')
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/g, ' ')
    .replace(/×/g, 'x')
    .replace(/\b4wd\b/g, '4x4')
    .replace(/\bfour wheel drive\b/g, '4x4')
    .replace(/\brwd\b/g, '4x2')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferFuelType(text: string): 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'electric' | null {
  const n = normalize(text);
  if (n.includes('plug-in hybrid') || n.includes('phev')) return 'phev';
  if (n.includes('hybrid')) return 'hybrid';
  if (n.includes('electric') || n.includes('ev ')) return 'electric';
  if (n.includes('diesel')) return 'diesel';
  if (n.includes('ecoboost') || n.includes('petrol')) return 'petrol';
  return null;
}

function inferTransmission(text: string): string | null {
  const m = normalize(text).match(/\b(\d+)\s*at\b/);
  if (m) return `${m[1]}AT`;
  if (/\bmanual\b/i.test(text)) return 'Manual';
  if (/\bauto(?:matic)?\b/i.test(text)) return 'Auto';
  return null;
}

function inferDrive(text: string): string | null {
  const n = normalize(text);
  if (n.includes('4x4') || n.includes('full-time 4x4') || n.includes('part-time 4x4')) return '4x4';
  if (n.includes('4x2')) return '4x2';
  if (n.includes('awd')) return 'AWD';
  return null;
}

function inferEngine(text: string): string | null {
  const litre = text.match(/\b\d\.\dL\b/i)?.[0] ?? null;
  const v6 = /\bV6\b/i.test(text) ? ' V6' : '';
  const turbo = /twin-turbo|bi-turbo|turbo|ecoboost/i.exec(text)?.[0] ?? '';
  const fuel = /diesel|petrol|ecoboost|electric|hybrid/i.exec(text)?.[0] ?? '';
  return [litre, v6.trim(), turbo, fuel].filter(Boolean).join(' ') || null;
}

function hasToken(text: string, token: string): boolean {
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

function powertrainMismatch(productTitle: string, powertrain: string): boolean {
  const p = normalize(productTitle);
  const b = normalize(powertrain);
  const pAt = p.match(/\b(\d+)at\b/)?.[1];
  const bAt = b.match(/\b(\d+)at\b/)?.[1];
  if (pAt && bAt && pAt !== bAt) return true;
  if (p.includes('manual') && !b.includes('manual')) return true;
  if (p.includes('v6') && !b.includes('v6')) return true;
  if (p.includes('ecoboost') && !b.includes('ecoboost')) return true;
  if (p.includes('bi-turbo') && !b.includes('bi-turbo')) return true;
  if (p.includes('turbo diesel') && !b.includes('turbo diesel')) return true;
  if ((p.includes('4x2') || p.includes('rwd')) && !(b.includes('4x2') || b.includes('rwd'))) return true;
  if ((p.includes('4x4') || p.includes('4wd')) && !(b.includes('4x4') || b.includes('4wd'))) return true;
  return false;
}

function scoreProductMatch(product: ProductRow, variant: BuilderVariant): number {
  const title = normalize(product.title);
  const trim = normalize(product.variant_name || variant.trim);
  const buildTrim = normalize(variant.trim);
  if (trim && trim !== buildTrim && !hasToken(title, buildTrim)) return -1;
  if (powertrainMismatch(product.title, variant.powertrainName)) return -1;

  let score = 0;
  if (normalize(product.variant_name) === buildTrim) score += 10;
  if (hasToken(title, buildTrim)) score += 5;

  const tokens = normalize(variant.powertrainName)
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 1 && !['the', 'with', 'and'].includes(t));
  for (const token of tokens) {
    if (hasToken(title, token)) score += 1;
  }
  return score;
}

function productTitle(model: ModelRow, trim: string, powertrainName: string): string {
  const base = normalize(model.name).endsWith(normalize(trim)) ? model.name : `${model.name} ${trim}`;
  return `${base} ${powertrainName}`.replace(/\s+/g, ' ').trim();
}

function launchOptions(): Parameters<typeof puppeteer.launch>[0] {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean) as string[];
  const executablePath = candidates.find((candidate) => existsSync(candidate));
  return {
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  };
}

async function scrapeCards(page: Page, urlName: string): Promise<BuilderCard[]> {
  const url = `https://www.ford.com.au/price/${urlName}?postalCode=${encodeURIComponent(POSTCODE)}&usageType=P`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  try {
    await page.waitForSelector('[data-testid^="trim-card-group-"][data-wers-id]', { timeout: 20_000 });
  } catch {
    return [];
  }
  await sleep(1_000);

  const baseCards = await page.evaluate(() => {
    const parseMoney = (text: string): number | null => {
      const m = text.match(/\$[\d,]+/);
      return m ? Number(m[0].replace(/[$,]/g, '')) : null;
    };
    const trimCards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="trim-card-group-"][data-wers-id]'));
    return trimCards.map((card, index) => {
      const cardTestId = card.getAttribute('data-testid') ?? '';
      const trim = card.getAttribute('data-wers-id')
        || card.querySelector('h2,h3,[role=heading]')?.textContent?.replace(/\s+/g, ' ').trim()
        || cardTestId.replace(/^trim-card-group-/, '').split('-AUS')[0];
      const imageUrl = card.querySelector<HTMLImageElement>('img[src*="gpas-cache.ford.com"]')?.src ?? null;
      const labels = Array.from(card.querySelectorAll<HTMLLabelElement>('label[data-testid^="radio-"]'));
      const paragraphTexts = Array.from(card.querySelectorAll('p'))
        .map((p) => p.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean);
      const fallbackPowertrain = paragraphTexts.find((text) =>
        /(diesel|ecoboost|electric|hybrid|petrol|4x2|4x4|4wd|rwd|\b\d\.\dL\b|\b\d+AT\b)/i.test(text)
        && !/\$|offer|from|estimated/i.test(text)
      ) ?? '';
      const powertrains = labels.length
        ? labels.map((label) => ({
            code: label.querySelector<HTMLInputElement>('input')?.value ?? null,
            name: label.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          })).filter((option) => option.name)
        : [{ code: null, name: fallbackPowertrain || trim }];
      return {
        cardTestId,
        trim,
        index,
        imageUrl,
        basePrice: parseMoney(card.textContent ?? ''),
        powertrains,
      };
    });
  });

  const cards: BuilderCard[] = [];
  for (const card of baseCards) {
    const powertrains: BuilderCard['powertrains'] = [];
    for (const option of card.powertrains) {
      if (option.code) {
        await page.evaluate(({ cardTestId, code }) => {
          const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="trim-card-group-"][data-wers-id]'));
          const card = cards.find((node) => node.getAttribute('data-testid') === cardTestId);
          const input = Array.from(card?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])
            .find((node) => node.value === code);
          if (!input) return;
          input.click();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, { cardTestId: card.cardTestId, code: option.code });
        await sleep(1_500);
      }
      const price = await page.evaluate(({ cardTestId }) => {
        const parseMoney = (text: string): number | null => {
          const m = text.match(/\$[\d,]+/);
          return m ? Number(m[0].replace(/[$,]/g, '')) : null;
        };
        const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="trim-card-group-"][data-wers-id]'));
        const card = cards.find((node) => node.getAttribute('data-testid') === cardTestId);
        return parseMoney(card?.textContent ?? '');
      }, { cardTestId: card.cardTestId });
      powertrains.push({ ...option, price: price ?? card.basePrice });
    }
    cards.push({ ...card, powertrains });
  }
  return cards;
}

function resolveTargetModel(endpointModel: ModelRow, trim: string, modelsBySlug: Map<string, ModelRow>): ModelRow {
  const candidates = [endpointModel.slug, ...siblingSlugsFor(endpointModel.slug)]
    .map((slug) => modelsBySlug.get(slug))
    .filter(Boolean) as ModelRow[];
  const trimSlug = slugify(trim);
  const sibling = candidates.find((model) => {
    if (model.slug === endpointModel.slug) return false;
    const tail = model.slug.split('-').pop() ?? model.slug;
    return trimSlug === tail || trimSlug.includes(tail);
  });
  return sibling ?? endpointModel;
}

async function upsertBuilderVariant(
  variant: BuilderVariant,
  productsByModelId: Map<string, ProductRow[]>,
  touchedProductIds: Set<string>
): Promise<'inserted' | 'updated' | 'dry-run'> {
  const existingForModel = productsByModelId.get(variant.targetModel.id) ?? [];
  const externalKey = `ford-au-builder-${variant.targetModel.slug}-${slugify(variant.trim)}-${slugify(variant.powertrainName)}`;
  const existingByKey = existingForModel.find((product) => product.external_key === externalKey);
  const scored = existingForModel
    .filter((product) => product.availability !== 'discontinued')
    .map((product) => ({ product, score: scoreProductMatch(product, variant) }))
    .filter((entry) => entry.score >= 14)
    .sort((a, b) => b.score - a.score);
  const matched = existingByKey ?? scored[0]?.product ?? null;

  const nowIso = new Date().toISOString();
  const title = productTitle(variant.targetModel, variant.trim, variant.powertrainName);
  const patch = {
    source_url: variant.sourceUrl,
    external_key: externalKey,
    title,
    body_type: variant.targetModel.body_type,
    fuel_type: inferFuelType(variant.powertrainName),
    availability: 'available',
    price_amount: variant.driveaway,
    price_currency: 'AUD',
    price_type: 'driveaway',
    price_raw_string: `$${Math.round(variant.driveaway).toLocaleString('en-AU')} driveaway`,
    variant_name: variant.trim,
    variant_code: variant.powertrainCode ?? slugify(`${variant.trim}-${variant.powertrainName}`),
    engine_desc: inferEngine(variant.powertrainName),
    transmission: inferTransmission(variant.powertrainName),
    drive: inferDrive(variant.powertrainName),
    drivetrain: inferDrive(variant.powertrainName),
    meta_json: {
      ...(matched?.meta_json ?? {}),
      source: 'ford_builder_browser',
      builder_source: 'ford_live_builder_card',
      builder_url_name: variant.endpointUrlName,
      builder_url: variant.sourceUrl,
      builder_trim: variant.trim,
      builder_powertrain_code: variant.powertrainCode,
      builder_powertrain_name: variant.powertrainName,
      builder_image_url: variant.imageUrl,
      builder_postcode: POSTCODE,
      builder_fetched_at: nowIso,
    },
    last_seen_at: nowIso,
    updated_at: nowIso,
  };

  if (!APPLY) {
    if (matched) touchedProductIds.add(matched.id);
    console.log(`  dry ${matched ? 'update' : 'insert'} ${variant.targetModel.slug}: ${title} → $${variant.driveaway.toLocaleString('en-AU')}`);
    return 'dry-run';
  }

  let productId: string | null = matched?.id ?? null;
  if (matched) {
    const { error } = await sb.from('products').update(patch).eq('id', matched.id);
    if (error) throw new Error(`update ${title}: ${error.message}`);
  } else {
    const { data, error } = await sb.from('products').insert({
      ...patch,
      oem_id: 'ford-au',
      model_id: variant.targetModel.id,
      cta_links: [],
      variants: [],
    }).select('id,title,model_id,external_key,variant_name,availability,meta_json,specs_json').single();
    if (error) throw new Error(`insert ${title}: ${error.message}`);
    productId = data.id;
    const arr = productsByModelId.get(variant.targetModel.id) ?? [];
    arr.push(data as ProductRow);
    productsByModelId.set(variant.targetModel.id, arr);
  }
  if (!productId) throw new Error(`No product id after upsert for ${title}`);
  touchedProductIds.add(productId);

  const pricingRow = {
    product_id: productId,
    price_type: 'driveaway',
    rrp: variant.driveaway,
    driveaway_nsw: variant.driveaway,
    driveaway_vic: variant.driveaway,
    driveaway_qld: variant.driveaway,
    driveaway_wa: variant.driveaway,
    driveaway_sa: variant.driveaway,
    driveaway_tas: variant.driveaway,
    driveaway_act: variant.driveaway,
    driveaway_nt: variant.driveaway,
    price_qualifier: `Ford Builder postcode ${POSTCODE}`,
    fetched_at: nowIso,
    effective_date: nowIso.slice(0, 10),
  };
  await sb.from('variant_pricing').delete().eq('product_id', productId).eq('price_type', 'driveaway');
  const { error: pricingError } = await sb.from('variant_pricing').insert(pricingRow);
  if (pricingError) throw new Error(`insert pricing ${title}: ${pricingError.message}`);

  if (variant.imageUrl) {
    const { error: colorError } = await sb.from('variant_colors').upsert({
      product_id: productId,
      color_code: 'builder-default',
      color_name: 'Builder Image',
      color_type: 'solid',
      is_standard: true,
      price_delta: 0,
      swatch_url: null,
      hero_image_url: variant.imageUrl,
      gallery_urls: [variant.imageUrl],
      sort_order: 0,
    }, { onConflict: 'product_id,color_code' });
    if (colorError) throw new Error(`upsert builder image ${title}: ${colorError.message}`);
  }

  console.log(`  ${matched ? 'updated' : 'inserted'} ${variant.targetModel.slug}: ${title} → $${variant.driveaway.toLocaleString('en-AU')}`);
  return matched ? 'updated' : 'inserted';
}

async function discontinueStale(
  endpointUrlName: string,
  modelIds: Set<string>,
  productsByModelId: Map<string, ProductRow[]>,
  touchedProductIds: Set<string>
): Promise<number> {
  const stale = [...modelIds].flatMap((modelId) => productsByModelId.get(modelId) ?? [])
    .filter((product) => product.availability !== 'discontinued')
    .filter((product) => !touchedProductIds.has(product.id));
  if (!stale.length) return 0;
  if (!APPLY) {
    console.log(`  dry discontinue ${stale.length} stale row(s) for /price/${endpointUrlName}`);
    return stale.length;
  }
  const nowIso = new Date().toISOString();
  const { error } = await sb.from('products')
    .update({ availability: 'discontinued', last_seen_at: nowIso, updated_at: nowIso })
    .in('id', stale.map((product) => product.id));
  if (error) throw new Error(`discontinue stale rows for /price/${endpointUrlName}: ${error.message}`);
  console.log(`  discontinued ${stale.length} stale row(s) for /price/${endpointUrlName}`);
  return stale.length;
}

async function main(): Promise<void> {
  const { data: allModels, error: modelError } = await sb.from('vehicle_models')
    .select('id,name,slug,body_type,category,source_url')
    .eq('oem_id', 'ford-au')
    .eq('is_active', true)
    .order('slug');
  if (modelError || !allModels?.length) throw new Error(modelError?.message ?? 'No Ford models found');

  const models = SLUG_FILTER ? allModels.filter((model) => model.slug === SLUG_FILTER) : allModels;
  if (!models.length) throw new Error(`No active Ford model matched slug=${SLUG_FILTER}`);

  const { data: allProducts, error: productError } = await sb.from('products')
    .select('id,title,model_id,external_key,variant_name,availability,meta_json,specs_json')
    .eq('oem_id', 'ford-au')
    .in('model_id', allModels.map((model) => model.id));
  if (productError) throw new Error(productError.message);

  const modelsBySlug = new Map((allModels as ModelRow[]).map((model) => [model.slug, model]));
  const productsByModelId = new Map<string, ProductRow[]>();
  for (const product of (allProducts ?? []) as ProductRow[]) {
    if (!product.model_id) continue;
    const arr = productsByModelId.get(product.model_id) ?? [];
    arr.push(product);
    productsByModelId.set(product.model_id, arr);
  }

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${SLUG_FILTER ? ` (slug=${SLUG_FILTER})` : ''}`);
  console.log(`Builder postcode: ${POSTCODE}`);
  console.log(`Models queued: ${models.length}`);

  const browser: Browser = await puppeteer.launch(launchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let inserted = 0;
  let updated = 0;
  let discontinued = 0;
  const processedUrlNames = new Set<string>();

  try {
    for (const model of models as ModelRow[]) {
      const urlName = modelToUrlName(model.slug);
      if (processedUrlNames.has(urlName)) {
        console.log(`\n[${model.name}] /price/${urlName} already processed via sibling`);
        continue;
      }
      processedUrlNames.add(urlName);

      console.log(`\n[${model.name}] visiting /price/${urlName}`);
      const cards = await scrapeCards(page, urlName);
      if (!cards.length) {
        console.log('  no Builder cards found; leaving existing rows unchanged');
        continue;
      }

      const touchedProductIds = new Set<string>();
      const touchedModelIds = new Set<string>();
      for (const card of cards) {
        for (const option of card.powertrains) {
          const driveaway = option.price ?? card.basePrice;
          if (!driveaway) continue;
          const targetModel = resolveTargetModel(model, card.trim, modelsBySlug);
          touchedModelIds.add(targetModel.id);
          const sourceUrl = `https://www.ford.com.au/price/${urlName}?postalCode=${encodeURIComponent(POSTCODE)}&usageType=P`;
          const result = await upsertBuilderVariant({
            endpointSlug: model.slug,
            endpointUrlName: urlName,
            sourceUrl,
            targetModel,
            trim: card.trim,
            powertrainCode: option.code,
            powertrainName: option.name,
            driveaway,
            imageUrl: card.imageUrl,
          }, productsByModelId, touchedProductIds);
          if (result === 'inserted') inserted++;
          if (result === 'updated') updated++;
        }
      }

      discontinued += await discontinueStale(urlName, touchedModelIds, productsByModelId, touchedProductIds);
    }
  } finally {
    await browser.close();
  }

  console.log('\n=== Summary ===');
  console.log(`Inserted:      ${inserted}`);
  console.log(`Updated:       ${updated}`);
  console.log(`Discontinued:  ${discontinued}`);
  console.log(APPLY ? 'Changes applied.' : 'Dry run — re-run with --apply to write.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
