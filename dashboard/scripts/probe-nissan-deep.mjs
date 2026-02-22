#!/usr/bin/env node
/**
 * Deep-probe Nissan colours pages and configurator for color data
 */

const BASE = 'https://www.nissan.com.au';

// Models with their configurator shtml URLs (found in earlier probe)
const MODELS = {
  qashqai: { slug: 'qashqai' },
  'x-trail': { slug: 'x-trail' },
  pathfinder: { slug: 'pathfinder' },
  patrol: { slug: 'patrol' },
  navara: { slug: 'navara' },
  juke: { slug: 'juke' },
  ariya: { slug: 'ariya' },
  z: { slug: 'z' },
};

async function main() {
  // Strategy 1: Check colour pages
  console.log('=== Strategy 1: /colours.html pages ===\n');
  for (const [model, info] of Object.entries(MODELS)) {
    const url = `${BASE}/vehicles/browse-range/${info.slug}/colours.html`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log(`  ${model}: ${r.status}`); continue; }
      const html = await r.text();
      console.log(`  ${model}: ${html.length} bytes`);

      // Look for color swatches
      const swatches = [...html.matchAll(/(?:data-colou?r-name|data-colou?r-code|aria-label)[^=]*="([^"]*)"/gi)];
      if (swatches.length > 0) {
        console.log(`    Data attributes: ${swatches.length}`);
        [...new Set(swatches.map(m => m[0].substring(0, 100)))].slice(0, 20).forEach(s => console.log(`      ${s}`));
      }

      // Look for JSON data in script tags
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const s of scripts) {
        const text = s[1].trim();
        if (!text || text.length < 100) continue;
        if (text.toLowerCase().includes('colour') || text.toLowerCase().includes('exterior')) {
          if (text.includes('{') && (text.includes('name') || text.includes('code'))) {
            console.log(`    Color script (${text.length} chars):`);
            console.log(`    ${text.substring(0, 2000)}`);
            if (text.length > 2000) console.log('    ...(truncated)');
          }
        }
      }

      // Look for image patterns with color info
      const colorImgs = [...html.matchAll(/(?:src|data-src)="([^"]*(?:colou?r|swatch|chip|paint|exterior)[^"]*)"/gi)];
      const uniqueImgs = [...new Set(colorImgs.map(m => m[1]))];
      if (uniqueImgs.length > 0) {
        console.log(`    Color images: ${uniqueImgs.length}`);
        uniqueImgs.slice(0, 10).forEach(u => console.log(`      ${u}`));
      }

    } catch(e) {
      console.log(`  ${model}: Error: ${e.message}`);
    }
  }

  // Strategy 2: Check AEM content API for color data
  console.log('\n=== Strategy 2: AEM content APIs ===\n');
  for (const [model, info] of Object.entries(MODELS)) {
    // Try buildPriceEntry pattern
    const bpUrl = `${BASE}/content/nissan_prod/en_AU/index/vehicles/browse-range/${info.slug}/dam/jcr:content/root/buildpriceentry.buildPriceEntry.json`;
    try {
      const r = await fetch(bpUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      console.log(`  ${model} buildPriceEntry: ${r.status}`);
      if (r.ok) {
        const data = await r.json();
        console.log(`    Keys: ${Object.keys(data).join(', ')}`);
        const str = JSON.stringify(data);
        if (str.toLowerCase().includes('colour') || str.toLowerCase().includes('color')) {
          console.log(`    Contains color data:`);
          console.log(`    ${str.substring(0, 1000)}`);
        }
      }
    } catch(e) {
      console.log(`  ${model} buildPriceEntry: Error`);
    }
  }

  // Strategy 3: Try browse-range page for inline model data
  console.log('\n=== Strategy 3: Browse-range inline data ===\n');
  const xtrailUrl = `${BASE}/vehicles/browse-range/x-trail.html`;
  const r = await fetch(xtrailUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();

  // Extract all color-related HTML sections
  const colorSections = [...html.matchAll(/class="[^"]*(?:colour|color|paint|swatch)[^"]*"[^>]*>[\s\S]{0,2000}/gi)];
  console.log(`  X-Trail color sections: ${colorSections.length}`);
  colorSections.slice(0, 5).forEach((m, i) => {
    console.log(`\n  Section ${i+1}:`);
    console.log(`    ${m[0].substring(0, 500)}`);
  });

  // Search for background styles that represent color swatches
  const bgStyles = [...html.matchAll(/style="[^"]*background(?:-color)?:\s*([^;"]+)[^"]*"[^>]*(?:data-[^=]*="([^"]*)")?/gi)];
  console.log(`\n  Background styles: ${bgStyles.length}`);
  bgStyles.slice(0, 20).forEach(m => {
    console.log(`    bg: ${m[1].substring(0, 80)} ${m[2] || ''}`);
  });

  // Look for noscript/img with color names in alt text
  const colorAlts = [...html.matchAll(/alt="([^"]*(?:colou?r|pearl|metallic|mica|white|black|silver|grey|blue|red|brown)[^"]*)"/gi)];
  console.log(`\n  Image alts with color names: ${colorAlts.length}`);
  [...new Set(colorAlts.map(m => m[1]))].slice(0, 20).forEach(a => console.log(`    ${a}`));
}

main().catch(e => { console.error(e); process.exit(1); });
