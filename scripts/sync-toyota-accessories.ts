/**
 * Toyota Accessories Sync
 *
 * Crawls toyota.com.au per-model accessories pages with real Chrome
 * (bypasses bot management) and upserts the Toyota Genuine Accessories
 * catalog into `accessories` + `accessory_models`.
 *
 * Toyota AU publishes NO accessory pricing publicly ("Contact your local
 * Dealer for availability and pricing") — rows are catalog-only:
 * name, description, image, popular flag, per-model linkage.
 *
 * Run: npx tsx scripts/sync-toyota-accessories.ts
 */
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OEM_ID = 'toyota-au';

const slugify = (value: string) =>
  value.toLowerCase().replace(/\[.*?\]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface ExtractedAccessory {
  name: string;
  description: string;
  image: string | null;
  popular: boolean;
}

// NOTE: passed to page.evaluate as a STRING — tsx/esbuild injects a __name
// helper into serialized functions that doesn't exist in the page context.
const EXTRACT_SCRIPT = `(() => {
    const clean = (t) => t.replace(/\\s+/g, ' ').trim();
    const results = [];
    const seen = new Set();
    // Each accessory card carries an "ASK YOUR LOCAL DEALER" CTA.
    const ctas = Array.from(document.querySelectorAll('a, button')).filter(
      (el) => /ask your (local )?dealer/i.test(el.textContent || '')
    );
    for (const cta of ctas) {
      let card = cta;
      let heading = null;
      for (let i = 0; i < 8 && card; i++) {
        card = card.parentElement;
        if (!card) break;
        heading = card.querySelector('h2, h3, h4, h5, [class*="title"], [class*="heading"], strong');
        if (heading && clean(heading.textContent || '').length > 2) break;
      }
      if (!card || !heading) continue;
      const name = clean(heading.textContent || '').replace(/\\[.*?\\]\\s*$/, '').trim();
      if (!name || name.length > 90 || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const paragraphs = Array.from(card.querySelectorAll('p'))
        .map((p) => clean(p.textContent || ''))
        .filter((t) => t.length > 30 && !/ask your/i.test(t));
      const cardText = clean(card.textContent || '');
      let cardImage = null;
      for (const i of Array.from(card.querySelectorAll('img'))) {
        const s = (i.currentSrc || i.getAttribute('src') || i.getAttribute('data-src') || '');
        if (s && !s.includes('/icons/') && !s.split('?')[0].endsWith('.svg')) { cardImage = s.startsWith('http') ? s : (location.origin + s); break; }
      }
      results.push({
        name,
        description: paragraphs[0] || '',
        image: cardImage,
        popular: /\\bPOPULAR\\b/.test(cardText.slice(0, 200)),
      });
    }
    // Image backfill: cards often keep their image in a sibling column the
    // card-walk misses, but page images carry accessory names as alt text.
    const imgSrc = (i) => {
      let src = i.currentSrc || i.getAttribute('src') || i.getAttribute('data-src') || '';
      if (!src) {
        const srcset = i.getAttribute('srcset') || i.getAttribute('data-srcset') ||
          (i.closest('picture')?.querySelector('source')?.getAttribute('srcset')) || '';
        src = srcset.split(',')[0]?.trim().split(' ')[0] || '';
      }
      return src;
    };
    const altMap = {};
    document.querySelectorAll('img').forEach((i) => {
      const src = imgSrc(i);
      const alt = clean(i.alt || '').toLowerCase();
      if (!src || !alt || alt.length < 4) return;
      if (src.includes('global-navigation') || src.includes('/icons/') || src.split('?')[0].endsWith('.svg')) return;
      if (!altMap[alt]) altMap[alt] = src.startsWith('http') ? src : (location.origin + src);
    });
    const altKeys = Object.keys(altMap);
    for (const item of results) {
      if (item.image && !item.image.endsWith('.svg')) continue;
      const n = item.name.toLowerCase();
      const hit = altMap[n] ? n : altKeys.find((k) => k.includes(n) || n.includes(k));
      if (hit) item.image = altMap[typeof hit === 'string' && altMap[hit] ? hit : n] || altMap[hit];
    }
    // Personalise-only pages (Camry/Yaris/Fortuner) render the 360 configurator
    // with no catalog — signal it so the caller can log a clean skip.
    const bodyText = clean(document.body.innerText || '').slice(0, 4000);
    const personaliseOnly = results.length === 0 && /PERSONALISE/.test(bodyText) && /BUILD AND PRICE/.test(bodyText);
    return { results, personaliseOnly };
  })()`;

async function extractAccessories(page: any): Promise<{ results: ExtractedAccessory[]; personaliseOnly: boolean }> {
  return await page.evaluate(EXTRACT_SCRIPT) as { results: ExtractedAccessory[]; personaliseOnly: boolean };
}

async function main() {
  const limitModels = process.argv.includes('--limit') ? 2 : Infinity;

  const { data: models, error } = await supabase
    .from('vehicle_models')
    .select('id, slug, name, source_url')
    .eq('oem_id', OEM_ID)
    .eq('is_active', true);
  if (error) throw error;

  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

  // Map DB slugs to site paths where they differ
  const PATH_OVERRIDES: Record<string, string> = {
    'bz4x': 'bz4x-ev', 'bz4x-touring': 'bz4x-touring',
    'landcruiser-300': 'landcruiser-300', 'landcruiser-70': 'landcruiser-70',
    'prado': 'prado', 'corolla-hatch': 'corolla', 'corolla-sedan': 'corolla-sedan',
    'supra': 'gr-supra',
  };

  let totalUpserts = 0;
  let modelsDone = 0;
  for (const model of models || []) {
    if (modelsDone >= limitModels) break;
    const path = PATH_OVERRIDES[model.slug] || model.slug;
    const url = `https://www.toyota.com.au/${path}/accessories`;
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      if (!resp || resp.status() >= 400 || /404|page not found/i.test(await page.title())) {
        console.log(`  [skip] ${model.slug}: ${resp?.status()} ${url}`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 2000));
      // Stepwise scroll so lazy-loaded card images resolve before extraction
      for (let step = 0; step <= 8; step++) {
        await page.evaluate(`window.scrollTo(0, document.body.scrollHeight * ${step} / 8)`);
        await new Promise((r) => setTimeout(r, 600));
      }
      await new Promise((r) => setTimeout(r, 1500));

      // Expand collapsed accordions/tabs so card panels (and their images) mount.
      for (let round = 0; round < 3; round++) {
        const clicked = await page.evaluate(`(() => {
          const triggers = Array.from(document.querySelectorAll('[aria-expanded="false"], [role="tab"][aria-selected="false"]'))
            .filter((el) => el.closest('main, [class*="accessor"], [id*="accessor"]') || true)
            .slice(0, 15);
          triggers.forEach((el) => { try { el.click(); } catch {} });
          return triggers.length;
        })()`);
        await new Promise((r) => setTimeout(r, 1200));
        if (!clicked) break;
      }
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await new Promise((r) => setTimeout(r, 1500));

      const { results: items, personaliseOnly } = await extractAccessories(page);
      if (personaliseOnly) {
        console.log(`  [skip-personalise] ${model.slug}: accessories live in the 360 configurator only`);
        continue;
      }
      const withImages = items.filter((i) => i.image).length;
      console.log(`[${model.slug}] ${items.length} accessories (${withImages} with images) from ${url}`);

      for (const item of items) {
        const externalKey = slugify(item.name);
        if (!externalKey) continue;
        const { data: acc, error: accError } = await supabase
          .from('accessories')
          .upsert({
            oem_id: OEM_ID,
            external_key: externalKey,
            name: item.name,
            slug: externalKey,
            category: item.popular ? 'Popular' : 'Genuine Accessories',
            price: null, // Toyota AU publishes no public accessory pricing
            description_html: item.description ? `<p>${item.description}</p>` : null,
            image_url: item.image,
            inc_fitting: 'none',
            meta_json: { source: 'toyota.com.au', popular: item.popular, lastSeenAt: new Date().toISOString() },
          }, { onConflict: 'oem_id,external_key' })
          .select('id')
          .single();
        if (accError || !acc) { console.warn(`    upsert failed for ${item.name}:`, accError?.message); continue; }
        await supabase.from('accessory_models').upsert(
          { accessory_id: acc.id, model_id: model.id },
          { onConflict: 'accessory_id,model_id' },
        );
        totalUpserts++;
      }
      modelsDone++;
    } catch (e: any) {
      console.warn(`  [error] ${model.slug}: ${e.message}`);
    }
  }

  await browser.close();
  console.log(`\n=== Done === models: ${modelsDone}, accessory links upserted: ${totalUpserts}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
