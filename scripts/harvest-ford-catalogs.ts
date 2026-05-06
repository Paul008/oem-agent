/**
 * Local prototype of the Ford catalog harvester.
 *
 * Navigates each active Ford vehicle_model's source_url in a headless browser,
 * clicks the first Build & Price call-to-action to transition into the
 * configurator, watches for Nukleus POSTs (imgservices.ford.com), and
 * extracts the catalog tuple from the first request body it sees.
 *
 * Persists to vehicle_models.meta_json.nukleus when --apply is passed.
 *
 * Once this reliably works end-to-end, the logic will be ported into the
 * Worker using src/utils/network-browser.ts (NetworkInterceptionBrowser).
 *
 * Run:   pnpm tsx scripts/harvest-ford-catalogs.ts [--slug=ranger] [--apply]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import puppeteer, { type Page, type HTTPRequest } from 'puppeteer';

const APPLY = process.argv.includes('--apply');
const SLUG_FILTER = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface HarvestedCodes {
  catalogId: string | null;
  nameplate: string | null;
  series: string[];
  bodyStyle: string[];
  powertrain: string[];
  vehicleColor: string[];
  wersCodes: string[];
  selectedFeatures: string[];
  baseSiteId: string;
  lang: string;
  nukleusEndpoints: string[];
  sampleConfigState: string | null;
  capturedAt: string;
}

function emptyHarvest(): HarvestedCodes {
  return {
    catalogId: null, nameplate: null,
    series: [], bodyStyle: [], powertrain: [], vehicleColor: [], wersCodes: [],
    selectedFeatures: [],
    baseSiteId: 'aus', lang: 'en_AU',
    nukleusEndpoints: [],
    sampleConfigState: null,
    capturedAt: new Date().toISOString(),
  };
}

function decodeConfigState(cs: string): any | null {
  if (!cs || typeof cs !== 'string') return null;
  const [b64] = cs.split(':');
  try { return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); } catch { return null; }
}

function harvestFromBody(codes: HarvestedCodes, body: any): void {
  if (!body || typeof body !== 'object') return;
  const filters = body.filters ?? {};
  if (filters.catalogId) codes.catalogId ??= String(filters.catalogId);
  if (filters.nameplate) codes.nameplate ??= String(filters.nameplate);
  if (filters.series) codes.series.push(String(filters.series));
  if (filters.bodyStyle) codes.bodyStyle.push(String(filters.bodyStyle));
  if (filters.powertrain) codes.powertrain.push(String(filters.powertrain));
  if (filters.vehicleColor) codes.vehicleColor.push(String(filters.vehicleColor));
  if (body.configState) {
    const decoded = decodeConfigState(body.configState);
    if (decoded) {
      if (decoded.catalogId) codes.catalogId ??= String(decoded.catalogId);
      const cfg = decoded.configuration ?? {};
      if (Array.isArray(cfg.wersCodes)) codes.wersCodes.push(...cfg.wersCodes.map(String));
      if (Array.isArray(decoded.selectedFeatures)) codes.selectedFeatures.push(...decoded.selectedFeatures.map(String));
      if (!codes.sampleConfigState) codes.sampleConfigState = body.configState;
    }
  }
}

function dedupe(codes: HarvestedCodes): HarvestedCodes {
  return {
    ...codes,
    series: [...new Set(codes.series)],
    bodyStyle: [...new Set(codes.bodyStyle)],
    powertrain: [...new Set(codes.powertrain)],
    vehicleColor: [...new Set(codes.vehicleColor)],
    wersCodes: [...new Set(codes.wersCodes)],
    selectedFeatures: [...new Set(codes.selectedFeatures)],
    nukleusEndpoints: [...new Set(codes.nukleusEndpoints)],
  };
}

async function tryClickConfigurator(page: Page): Promise<string | null> {
  // Click sequence: nameplate → body style → series → any "Continue" button
  return page.evaluate(`(() => {
    const visible = (el) => el && el.offsetParent !== null;
    const match = (t, res) => { const tt = (t || '').toLowerCase(); return res.some(r => r.test(tt)); };

    // Try direct "Build & Price" / "Configure" CTA first
    const ctas = Array.from(document.querySelectorAll('a, button, [role="button"]'));
    for (const el of ctas) {
      if (!visible(el)) continue;
      const t = (el.textContent || '').trim();
      if (match(t, [/build\\s*&\\s*price/i, /configure/i, /price\\s*&\\s*configure/i])) {
        el.click();
        return 'CTA: ' + t.slice(0, 60);
      }
    }
    return null;
  })()`) as any;
}

async function harvestOne(page: Page, slug: string, sourceUrl: string): Promise<HarvestedCodes> {
  const codes = emptyHarvest();
  const reqMap = new Map<string, any>();

  await page.setRequestInterception(true);
  const onRequest = (req: HTTPRequest) => {
    try {
      const u = req.url();
      if (/imgservices\.ford\.com|\/api\/buy\/nukleus\//.test(u)) {
        let body: any = null;
        const raw = req.postData();
        if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
        if (body) {
          reqMap.set(u + '|' + req.method(), body);
          harvestFromBody(codes, body);
          let pathname = u; try { pathname = new URL(u).pathname; } catch {}
          codes.nukleusEndpoints.push(`${req.method()} ${pathname}`);
        }
      }
    } catch { /* ignore */ }
    req.continue();
  };
  page.on('request', onRequest);

  console.log(`  navigate: ${sourceUrl}`);
  try {
    await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 60_000 });
  } catch (e: any) { console.log(`    nav err: ${e.message}`); }
  await new Promise((r) => setTimeout(r, 4000));

  if (!codes.catalogId) {
    const clicked = await tryClickConfigurator(page);
    console.log(`    click: ${clicked ?? '(nothing matched)'}`);
    if (clicked) {
      await new Promise((r) => setTimeout(r, 6000));
    }
  }

  // If still nothing, try navigating directly to /price/<Name>
  if (!codes.catalogId) {
    const name = slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
    const priceUrl = `https://www.ford.com.au/price/${name}`;
    console.log(`    try deep link: ${priceUrl}`);
    try { await page.goto(priceUrl, { waitUntil: 'networkidle2', timeout: 60_000 }); } catch {}
    await new Promise((r) => setTimeout(r, 6000));
    if (!codes.catalogId) {
      const clicked2 = await tryClickConfigurator(page);
      if (clicked2) { console.log(`    click2: ${clicked2}`); await new Promise((r) => setTimeout(r, 6000)); }
    }
  }

  page.off('request', onRequest);
  await page.setRequestInterception(false);

  return dedupe(codes);
}

async function main() {
  let q = s.from('vehicle_models').select('id, slug, name, source_url, is_active, meta_json').eq('oem_id', 'ford-au').eq('is_active', true);
  if (SLUG_FILTER) q = q.eq('slug', SLUG_FILTER);
  const { data: models, error } = await q.order('slug');
  if (error) throw error;
  console.log(`Harvesting catalogs for ${models!.length} nameplate(s)...\n`);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });

  // Warm Akamai session
  console.log('Warming Akamai session on ford.com.au...');
  try { await page.goto('https://www.ford.com.au/', { waitUntil: 'networkidle2', timeout: 60_000 }); } catch {}
  await new Promise((r) => setTimeout(r, 3000));

  const results: Array<{ slug: string; codes: HarvestedCodes }> = [];
  for (const m of models!) {
    console.log(`\n=== ${m.slug} (${m.name}) ===`);
    try {
      const codes = await harvestOne(page, m.slug, m.source_url);
      results.push({ slug: m.slug, codes });
      console.log(`  catalogId:  ${codes.catalogId ?? '(none)'}`);
      console.log(`  nameplate:  ${codes.nameplate ?? '(none)'}`);
      console.log(`  selected:   ${codes.selectedFeatures.join(', ') || '(none)'}`);
      console.log(`  wersCodes:  ${codes.wersCodes.length}`);
      console.log(`  endpoints:  ${codes.nukleusEndpoints.length}`);
    } catch (e: any) {
      console.log(`  err: ${e.message}`);
      results.push({ slug: m.slug, codes: emptyHarvest() });
    }
  }
  await browser.close();

  // Summary
  const withCatalog = results.filter((r) => r.codes.catalogId).length;
  console.log(`\n=== Summary: ${withCatalog}/${results.length} nameplates got a catalogId ===`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to persist to vehicle_models.meta_json.nukleus');
    return;
  }

  for (const r of results) {
    if (!r.codes.catalogId) { console.log(`  ${r.slug}: skipped (no catalog)`); continue; }
    const existing = models!.find((m) => m.slug === r.slug);
    const newMeta = { ...(existing?.meta_json ?? {}), nukleus: r.codes };
    const { error } = await s.from('vehicle_models').update({ meta_json: newMeta }).eq('id', existing!.id);
    if (error) console.log(`  ${r.slug}: ${error.message}`);
    else console.log(`  ${r.slug} ✓ saved`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
