/**
 * Scrape each active Ford showroom page to find the real full-range
 * brochure PDF URL (not the sub-variant spec sheets currently in
 * vehicle_models.brochure_url).
 *
 * Writes output to /tmp/ford-brochures-scraped.json for review.
 */

import puppeteer from 'puppeteer';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: models } = await s
    .from('vehicle_models')
    .select('slug, name, source_url, brochure_url')
    .eq('oem_id', 'ford-au')
    .eq('is_active', true)
    .not('source_url', 'is', null)
    .order('slug');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });
  console.log('Warming session...');
  await page.goto('https://www.ford.com.au/', { waitUntil: 'networkidle2' });

  const results: any[] = [];
  for (const m of models!) {
    console.log(`\n=== ${m.slug} → ${m.source_url} ===`);
    try {
      await page.goto(m.source_url!, { waitUntil: 'networkidle2', timeout: 60_000 });
      await new Promise(r => setTimeout(r, 3000));
      const pdfs: string[] = await page.evaluate(`(() => {
        var out = new Set();
        var links = document.querySelectorAll('a[href*=".pdf"], a[href*="brochure" i], a[href*="specs" i]');
        for (var i = 0; i < links.length; i++) {
          var href = links[i].getAttribute('href') || '';
          if (href.indexOf('.pdf') !== -1) {
            var abs = href.indexOf('http') === 0 ? href : new URL(href, location.href).href;
            out.add(abs);
          }
        }
        // Also mine inline strings
        var html = document.documentElement.outerHTML;
        var pat = /https?:\\/\\/[^\"' \\n<>()]+\\.pdf/g;
        var m; while ((m = pat.exec(html)) !== null) out.add(m[0]);
        return Array.from(out);
      })()`) as string[];
      console.log(`  found ${pdfs.length} PDFs`);
      for (const p of pdfs.slice(0, 10)) console.log(`    ${p}`);
      results.push({ slug: m.slug, name: m.name, source_url: m.source_url, current_brochure: m.brochure_url, scraped_pdfs: pdfs });
    } catch (e: any) {
      console.log(`  err: ${e.message}`);
      results.push({ slug: m.slug, name: m.name, source_url: m.source_url, current_brochure: m.brochure_url, scraped_pdfs: [], err: e.message });
    }
  }
  await browser.close();
  fs.writeFileSync('/tmp/ford-brochures-scraped.json', JSON.stringify(results, null, 2));
  console.log(`\nOutput → /tmp/ford-brochures-scraped.json (${results.length} models)`);
}
main().catch(e => { console.error(e); process.exit(1); });
