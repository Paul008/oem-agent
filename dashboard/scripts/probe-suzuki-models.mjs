#!/usr/bin/env node
/**
 * Probe Suzuki model and build-and-price pages for color data
 */

const BASE = 'https://www.suzuki.com.au';
const MODEL_PAGES = [
  '/vehicles/hatch/swift-hybrid/',
  '/vehicles/hatch/swift-sport/',
  '/vehicles/suv/ignis/',
  '/vehicles/suv/fronx-hybrid/',
  '/vehicles/suv/vitara/',
  '/vehicles/suv/s-cross/',
  '/vehicles/4x4/jimny/',
];

async function main() {
  // Check model pages
  for (const path of MODEL_PAGES) {
    const model = path.split('/').filter(Boolean).pop();
    console.log(`\n=== ${model.toUpperCase()} ===`);
    try {
      const r = await fetch(BASE + path, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log(`  Status: ${r.status}`); continue; }
      const html = await r.text();
      console.log(`  Page: ${html.length} bytes`);

      // Color references
      const colorRefs = (html.match(/colou?r/gi) || []).length;
      console.log(`  Color refs: ${colorRefs}`);

      // Look for JSON or color data in script tags
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const s of scripts) {
        const text = s[1].trim();
        if (!text || text.length < 100) continue;
        const lower = text.toLowerCase();
        if ((lower.includes('colour') || lower.includes('color')) &&
            (lower.includes('name') || lower.includes('hex') || lower.includes('swatch') || lower.includes('image'))) {
          console.log(`  Color script (${text.length} chars):`);
          console.log(`    ${text.substring(0, 3000)}`);
          if (text.length > 3000) console.log('    ...(truncated)');
        }
      }

      // Swatch images
      const swatches = [...html.matchAll(/(?:src|data-src)="([^"]*(?:colou?r|swatch|paint|chip)[^"]*)"/gi)];
      const uniqueSwatches = [...new Set(swatches.map(m => m[1]))];
      if (uniqueSwatches.length > 0) {
        console.log(`  Swatch images: ${uniqueSwatches.length}`);
        uniqueSwatches.forEach(u => console.log(`    ${u}`));
      }

      // Data attributes for colors
      const dataAttrs = [...html.matchAll(/data-(?:colour|color|paint|swatch|hex|variant-colour)[^=]*="([^"]*)"/gi)];
      if (dataAttrs.length > 0) {
        console.log(`  Data attrs: ${dataAttrs.length}`);
        [...new Set(dataAttrs.map(m => m[0]))].slice(0, 20).forEach(a => console.log(`    ${a}`));
      }

      // Background hex colors
      const hexBg = [...html.matchAll(/background(?:-color)?:\s*#([0-9a-fA-F]{6})/gi)];
      if (hexBg.length > 0) {
        console.log(`  Hex backgrounds: ${[...new Set(hexBg.map(m => '#'+m[1]))].length}`);
        [...new Set(hexBg.map(m => '#'+m[1]))].forEach(h => console.log(`    ${h}`));
      }

      // Alt text with color names
      const altTexts = [...html.matchAll(/alt="([^"]*(?:pearl|metallic|white|black|blue|red|grey|silver|yellow|green|orange|brown|cosmic|mineral|fire|cool|celestial|jungle|arctic|turquoise|burgundy|champion)[^"]*)"/gi)];
      if (altTexts.length > 0) {
        console.log(`  Color alt texts: ${[...new Set(altTexts.map(m => m[1]))].length}`);
        [...new Set(altTexts.map(m => m[1]))].forEach(a => console.log(`    ${a}`));
      }

    } catch(e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // Check build-and-price pages which typically have configurator data
  console.log('\n\n=== Build and Price pages ===\n');
  for (const path of MODEL_PAGES) {
    const bpPath = path + 'build-and-price/';
    const model = path.split('/').filter(Boolean).pop();
    try {
      const r = await fetch(BASE + bpPath, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log(`  ${model} B&P: ${r.status}`); continue; }
      const html = await r.text();
      console.log(`  ${model} B&P: ${html.length} bytes`);

      // Look for color/variant data
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const s of scripts) {
        const text = s[1].trim();
        if (!text || text.length < 200) continue;
        const lower = text.toLowerCase();
        if ((lower.includes('colour') || lower.includes('color')) &&
            (lower.includes('{') && lower.includes('name'))) {
          console.log(`    Color data script (${text.length} chars):`);
          console.log(`    ${text.substring(0, 4000)}`);
          if (text.length > 4000) console.log('    ...(truncated)');
        }
      }

    } catch(e) {
      console.log(`  ${model} B&P: Error: ${e.message}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
