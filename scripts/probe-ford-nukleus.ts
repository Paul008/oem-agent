/**
 * Phase 0 discovery (round 2): capture ALL JSON/.data traffic on Ford's
 * Build & Price flow. Broader filter than round 1 — don't assume Nukleus
 * is the only interesting endpoint.
 *
 * Strategy: visit the canonical configurator entry point, wait long enough
 * for SPA hydration, then click the first vehicle tile and capture any
 * follow-up traffic.
 */

import puppeteer, { type Page, type HTTPRequest, type HTTPResponse } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

interface Hit {
  stage: string;
  method: string;
  url: string;
  status: number;
  reqBody: any;
  resBody: any;
  size: number;
  contentType: string;
}

// Broader filter: any JSON-ish response, any .data file, any third-party API
function isInteresting(url: string, contentType: string): boolean {
  if (contentType.includes('json')) return true;
  if (/\.data($|\?)/.test(url)) return true;
  if (/imgservices\.ford\.com|api\.ford\.com|\/nukleus\/|\/api\//.test(url)) return true;
  // Ignore obvious noise
  if (/adobedtm|omtrdc|demdex|mpulse|akstat|lpsnmedia|liveperson|brightcove|ads\.|tpc\.|taboola|doubleclick|facebook\.com|google-analytics|googletagmanager|imgservices\.ford\.com\/status/.test(url)) return false;
  return false;
}

function isNoise(url: string): boolean {
  return /adobedtm|omtrdc|demdex|mpulse|akstat|lpsnmedia|liveperson|brightcove|ads\.|tpc\.|taboola|doubleclick|facebook\.com|google-analytics|googletagmanager|_bm\/|fordapa\.tt|edge\.api|sfid|analytics|adsrvr|^https:\/\/c\.go-mpulse/.test(url);
}

async function capture(page: Page, stage: string, sink: Hit[], reqMap: Map<string, any>) {
  // Attach listeners (idempotent — caller re-registers per stage if needed)
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1280, height: 900 });

  const hits: Hit[] = [];
  let stage = 'init';
  const reqMap = new Map<string, { headers: Record<string, string>; body: any }>();

  await page.setRequestInterception(true);
  page.on('request', (req: HTTPRequest) => {
    try {
      const u = req.url();
      if (!isNoise(u)) {
        let body: any = null;
        const raw = req.postData();
        if (raw) { try { body = JSON.parse(raw); } catch { body = raw.slice(0, 500); } }
        reqMap.set(u + '|' + req.method(), { headers: req.headers(), body });
      }
    } catch { /* ignore */ }
    req.continue();
  });

  page.on('response', async (res: HTTPResponse) => {
    const u = res.url();
    if (isNoise(u)) return;
    const ct = res.headers()['content-type'] || '';
    if (!isInteresting(u, ct)) return;
    try {
      const buf = await res.buffer();
      let resBody: any = null;
      const text = buf.toString('utf8');
      try { resBody = JSON.parse(text); } catch { resBody = text.slice(0, 300); }
      const req = reqMap.get(u + '|' + res.request().method()) ?? { body: null };
      hits.push({
        stage,
        method: res.request().method(),
        url: u,
        status: res.status(),
        reqBody: req.body,
        resBody,
        size: buf.length,
        contentType: ct,
      });
    } catch { /* ignore */ }
  });

  console.log('\nStage: warm / load build-and-price/select-a-vehicle/');
  stage = 'select-a-vehicle';
  try {
    await page.goto('https://www.ford.com.au/build-and-price/select-a-vehicle/', { waitUntil: 'networkidle2', timeout: 60_000 });
  } catch (e: any) { console.log('  nav err:', e.message); }
  await new Promise((r) => setTimeout(r, 8000));
  console.log(`  ${hits.filter(h => h.stage === 'select-a-vehicle').length} hits after load`);

  console.log('\nStage: click first vehicle tile (Ranger)');
  stage = 'click-ranger';
  try {
    const clicked = await page.evaluate(() => {
      const selectors = [
        'a[href*="ranger" i]', 'a[href*="Ranger"]',
        '[data-nameplate="ranger" i]',
        'button', '.vehicle-tile', '.nameplate-card',
      ];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
        for (const el of els) {
          const t = (el.textContent || '').toLowerCase();
          if (t.includes('ranger') && !t.includes('raptor') && el.offsetParent) {
            el.click();
            return el.tagName + ' ' + sel + ' :: ' + t.slice(0, 80);
          }
        }
      }
      return null;
    });
    console.log('  clicked:', clicked ?? '(nothing matched)');
  } catch (e: any) { console.log('  click err:', e.message); }
  await new Promise((r) => setTimeout(r, 8000));
  console.log(`  ${hits.filter(h => h.stage === 'click-ranger').length} hits`);

  console.log('\nStage: probe /price/Ranger directly (may redirect)');
  stage = 'price-ranger';
  try {
    await page.goto('https://www.ford.com.au/price/Ranger', { waitUntil: 'networkidle2', timeout: 60_000 });
  } catch (e: any) { console.log('  nav err:', e.message); }
  await new Promise((r) => setTimeout(r, 10_000));
  console.log(`  landed at: ${page.url()}`);
  console.log(`  ${hits.filter(h => h.stage === 'price-ranger').length} hits`);

  await browser.close();

  // Summarize
  const byHost = new Map<string, number>();
  const byPath = new Map<string, number>();
  for (const h of hits) {
    try {
      const u = new URL(h.url);
      byHost.set(u.hostname, (byHost.get(u.hostname) ?? 0) + 1);
      byPath.set(`${h.method} ${u.hostname}${u.pathname}`, (byPath.get(`${h.method} ${u.hostname}${u.pathname}`) ?? 0) + 1);
    } catch { /* ignore */ }
  }
  console.log('\n=== Host frequency ===');
  for (const [h, c] of [...byHost.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c.toString().padStart(3)}  ${h}`);
  console.log('\n=== Top endpoints (method + path) ===');
  for (const [p, c] of [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${c.toString().padStart(3)}  ${p}`);

  // Write raw log
  const outDir = path.resolve(__dirname, '..', 'docs');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'ford-nukleus-probe-round2.json');
  fs.writeFileSync(outFile, JSON.stringify(hits, null, 2));
  console.log(`\nRaw log: ${outFile}  (${hits.length} hits)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
