/**
 * Phase 0 (final attempt): load /showroom/<cat>/<model>/ pages and extract
 * variant/pricing data from the rendered DOM. Showroom pages are fully
 * server-rendered — if variant cards are in the HTML, we can skip Nukleus.
 */

import puppeteer from 'puppeteer';

const TARGETS = [
  { slug: 'everest', url: 'https://www.ford.com.au/showroom/suv/everest/' },
  { slug: 'ranger', url: 'https://www.ford.com.au/showroom/trucks-and-vans/ranger/' },
  { slug: 'transit-van', url: 'https://www.ford.com.au/showroom/trucks-and-vans/transit/van/' },
];

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  // Warm Akamai
  await page.goto('https://www.ford.com.au/', { waitUntil: 'networkidle2', timeout: 60_000 });

  for (const t of TARGETS) {
    console.log(`\n=== ${t.url} ===`);
    try {
      await page.goto(t.url, { waitUntil: 'networkidle2', timeout: 60_000 });
    } catch (e: any) { console.log('  nav err:', e.message); continue; }
    await new Promise((r) => setTimeout(r, 3000));

    const found = await page.evaluate(`(() => {
      const priceMatches = (document.body.innerText.match(/\\$\\s?[0-9]{2,3}[, ]?[0-9]{3}/g) || []).slice(0, 30);
      const candidateSelectors = [
        '[class*="variant" i]', '[class*="trim" i]', '[class*="series" i]',
        '[class*="model-card" i]', '[class*="vehicle-card" i]',
        '[class*="nameplate" i]', '[data-variant]', '[data-series]',
        'article', 'section'
      ];
      const hits = [];
      for (const sel of candidateSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length && els.length < 40) {
          hits.push({ selector: sel, count: els.length, sample: (els[0].textContent || '').slice(0, 120) });
        }
      }
      const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => (s.textContent || '').slice(0, 300));
      const windowKeys = Object.keys(window).filter(k => /^_|state|data|config|catalog|variants|series|ford/i.test(k)).slice(0, 20);
      return {
        title: document.title,
        url: location.href,
        pricesOnPage: priceMatches,
        selectorHits: hits.slice(0, 12),
        jsonLdCount: jsonLd.length,
        jsonLdSamples: jsonLd.slice(0, 2),
        windowKeys,
        hasNextData: !!document.getElementById('__NEXT_DATA__'),
        bodyLen: document.body.innerHTML.length
      };
    })()`) as any;

    console.log(`  title: ${found.title}`);
    console.log(`  landed: ${found.url}`);
    console.log(`  body HTML: ${found.bodyLen} bytes`);
    console.log(`  prices on page: ${found.pricesOnPage.length ? found.pricesOnPage.join(', ') : '(none)'}`);
    console.log(`  JSON-LD blocks: ${found.jsonLdCount}`);
    if (found.jsonLdSamples.length) console.log(`    sample: ${found.jsonLdSamples[0]}`);
    console.log(`  __NEXT_DATA__: ${found.hasNextData}`);
    console.log(`  interesting window keys: ${found.windowKeys.join(', ') || '(none)'}`);
    console.log(`  selector hits:`);
    for (const h of found.selectorHits) console.log(`    ${h.count.toString().padStart(3)} × ${h.selector}  ::  ${h.sample?.replace(/\s+/g, ' ').slice(0, 100)}`);
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
