#!/usr/bin/env node
/**
 * Deep-probe Suzuki Australia for color data (WordPress site)
 */

const BASE = 'https://www.suzuki.com.au';

async function main() {
  // Try various URL patterns for Suzuki model pages
  const urlPatterns = [
    '/automobiles/swift/',
    '/automobiles/swift-sport/',
    '/automobiles/ignis/',
    '/automobiles/jimny/',
    '/automobiles/vitara/',
    '/automobiles/s-cross/',
    '/automobiles/fronx/',
    '/automobiles/swift-hybrid/',
    '/models/swift/',
    '/swift/',
    '/car/swift/',
    '/range/swift/',
  ];

  console.log('=== Finding correct Suzuki URL pattern ===\n');
  for (const p of urlPatterns) {
    try {
      const r = await fetch(BASE + p, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual' });
      const loc = r.headers.get('location') || '';
      console.log(`  ${p} -> ${r.status}${loc ? ' -> ' + loc : ''}`);
    } catch(e) {
      console.log(`  ${p} -> Error: ${e.message}`);
    }
  }

  // Try the homepage to find correct navigation
  console.log('\n=== Probing Suzuki homepage for model links ===\n');
  const homeR = await fetch(BASE + '/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const homeHtml = await homeR.text();
  console.log(`  Homepage: ${homeHtml.length} bytes`);

  // Find model links
  const modelLinks = [...homeHtml.matchAll(/href="([^"]*(?:swift|jimny|ignis|vitara|fronx|s-cross|baleno)[^"]*)"/gi)];
  const uniqueLinks = [...new Set(modelLinks.map(m => m[1]))];
  console.log(`  Model links: ${uniqueLinks.length}`);
  uniqueLinks.slice(0, 30).forEach(l => console.log(`    ${l}`));

  // Find correct model page and probe for colors
  // Try each unique model link
  const correctLinks = uniqueLinks.filter(l =>
    !l.includes('javascript') && !l.includes('#') &&
    (l.startsWith('/') || l.startsWith('http'))
  ).slice(0, 10);

  console.log('\n=== Probing model pages for color data ===\n');
  for (const link of correctLinks) {
    const fullUrl = link.startsWith('http') ? link : BASE + link;
    try {
      const r = await fetch(fullUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log(`  ${link} -> ${r.status}`); continue; }
      const html = await r.text();
      console.log(`  ${link} -> ${html.length} bytes`);

      // Check for color data
      const colorRefs = (html.match(/colou?r/gi) || []).length;
      if (colorRefs > 5) {
        console.log(`    ${colorRefs} color references`);

        // Look for inline JSON with colors
        const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
        for (const s of scripts) {
          const text = s[1].trim();
          if (!text || text.length < 100) continue;
          const lower = text.toLowerCase();
          if (lower.includes('colour') && (lower.includes('name') || lower.includes('image'))) {
            console.log(`    Color script (${text.length} chars):`);
            console.log(`      ${text.substring(0, 1500)}`);
            if (text.length > 1500) console.log('      ...(truncated)');
          }
        }

        // Data attributes
        const colorAttrs = [...html.matchAll(/data-(?:colou?r|variant|paint)[^=]*="([^"]*)"/gi)];
        if (colorAttrs.length > 0) {
          console.log(`    Color data attributes: ${colorAttrs.length}`);
          [...new Set(colorAttrs.map(m => m[0]))].slice(0, 10).forEach(a => console.log(`      ${a}`));
        }

        // Swatch images
        const swatches = [...html.matchAll(/(?:src|data-src)="([^"]*(?:colou?r|swatch|paint|chip)[^"]*)"/gi)];
        if (swatches.length > 0) {
          console.log(`    Swatch images: ${[...new Set(swatches.map(m => m[1]))].length}`);
          [...new Set(swatches.map(m => m[1]))].slice(0, 10).forEach(u => console.log(`      ${u}`));
        }

        // Background colors
        const hexColors = [...html.matchAll(/background(?:-color)?:\s*#([0-9a-fA-F]{6})/gi)];
        if (hexColors.length > 0) {
          console.log(`    Background hex colors: ${[...new Set(hexColors.map(m => '#'+m[1]))].length}`);
          [...new Set(hexColors.map(m => '#'+m[1]))].forEach(h => console.log(`      ${h}`));
        }

        // Alt text with color names
        const colorAlts = [...html.matchAll(/alt="([^"]*(?:colou?r|pearl|metallic|white|black|blue|red|grey|silver|green)[^"]*)"/gi)];
        if (colorAlts.length > 0) {
          console.log(`    Color alt texts: ${colorAlts.length}`);
          [...new Set(colorAlts.map(m => m[1]))].slice(0, 10).forEach(a => console.log(`      ${a}`));
        }
      }
    } catch(e) {
      console.log(`  ${link} -> Error: ${e.message}`);
    }
  }

  // Also check the finance calculator data for any color hints
  console.log('\n=== Checking finance calculator data for color info ===\n');
  try {
    const r = await fetch(BASE + '/suzuki-finance-calculator-data.json', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const data = await r.json();
      const str = JSON.stringify(data);
      if (str.toLowerCase().includes('colour') || str.toLowerCase().includes('color')) {
        console.log('  Finance data contains color references');
      } else {
        console.log('  Finance data: no color references');
      }
      // Show structure
      if (Array.isArray(data)) {
        console.log(`  Array of ${data.length} items`);
        if (data[0]) console.log(`  First item keys: ${Object.keys(data[0]).join(', ')}`);
      } else if (typeof data === 'object') {
        console.log(`  Keys: ${Object.keys(data).join(', ')}`);
      }
    }
  } catch(e) {
    console.log(`  Error: ${e.message}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
