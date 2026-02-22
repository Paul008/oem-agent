#!/usr/bin/env node
/**
 * Extract Suzuki color data from finance calculator JSON and website
 */

const BASE = 'https://www.suzuki.com.au';

async function main() {
  // Check finance calculator data more thoroughly
  console.log('=== Finance calculator data ===\n');
  const r = await fetch(BASE + '/suzuki-finance-calculator-data.json', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await r.json();

  if (data.models && Array.isArray(data.models)) {
    for (const model of data.models) {
      console.log(`\n--- ${model.modelName || model.name || 'Unknown'} ---`);
      console.log(`  Keys: ${Object.keys(model).join(', ')}`);

      // Check for colors in all keys
      const str = JSON.stringify(model);
      if (str.toLowerCase().includes('colour') || str.toLowerCase().includes('color')) {
        // Find color keys
        for (const [key, val] of Object.entries(model)) {
          const valStr = JSON.stringify(val);
          if (valStr.toLowerCase().includes('colour') || valStr.toLowerCase().includes('color')) {
            console.log(`  Color key: ${key}`);
            if (Array.isArray(val)) {
              console.log(`    Array of ${val.length} items`);
              if (val[0]) console.log(`    First: ${JSON.stringify(val[0]).substring(0, 300)}`);
            } else {
              console.log(`    Value: ${valStr.substring(0, 300)}`);
            }
          }
        }
      }

      // Check variants for color info
      if (model.variants) {
        for (const variant of model.variants.slice(0, 2)) {
          console.log(`  Variant: ${variant.variantName || variant.name}`);
          const vStr = JSON.stringify(variant);
          if (vStr.toLowerCase().includes('colour') || vStr.toLowerCase().includes('color')) {
            for (const [key, val] of Object.entries(variant)) {
              const vs = JSON.stringify(val);
              if (vs.toLowerCase().includes('colour') || vs.toLowerCase().includes('color')) {
                console.log(`    Color key: ${key} = ${vs.substring(0, 300)}`);
              }
            }
          }
        }
      }
    }
  }

  // Try WordPress REST API
  console.log('\n\n=== WordPress REST API ===\n');
  const wpPaths = [
    '/wp-json/wp/v2/posts',
    '/wp-json/wp/v2/pages',
    '/wp-json/wp/v2/pages?search=swift',
    '/wp-json/wp/v2/pages?search=colour',
    '/wp-json/wp/v2/types',
    '/wp-json/wp/v2/',
    '/wp-json/',
  ];
  for (const p of wpPaths) {
    try {
      const r = await fetch(BASE + p, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      console.log(`  ${p} -> ${r.status}`);
      if (r.ok && p === '/wp-json/') {
        const data = await r.json();
        console.log(`    Namespaces: ${JSON.stringify(data.namespaces || [])}`);
        console.log(`    Routes (sample): ${Object.keys(data.routes || {}).slice(0, 10).join(', ')}`);
      }
    } catch(e) {
      console.log(`  ${p} -> Error: ${e.message}`);
    }
  }

  // Try Suzuki Drupal-style URLs
  console.log('\n=== Drupal/alternative URL patterns ===\n');
  const altPaths = [
    '/home/',
    '/automobile/swift/',
    '/automobile/swift-sport/',
    '/automobile/jimny/',
    '/car-range/',
    '/our-cars/',
    '/vehicles/',
    '/range/',
    '/suzuki-range/',
  ];
  for (const p of altPaths) {
    try {
      const r = await fetch(BASE + p, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual' });
      const loc = r.headers.get('location') || '';
      console.log(`  ${p} -> ${r.status}${loc ? ' -> ' + loc : ''} (${r.ok ? (await r.text()).length + 'b' : ''})`);
    } catch(e) {
      console.log(`  ${p} -> Error`);
    }
  }

  // Check the homepage HTML more carefully for model page links
  console.log('\n=== Homepage links ===\n');
  const homeR = await fetch(BASE + '/home/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (homeR.ok) {
    const html = await homeR.text();
    console.log(`  Homepage (/home/): ${html.length} bytes`);

    // Get ALL unique internal links
    const allLinks = [...html.matchAll(/href="(\/[^"]+)"/g)];
    const uniqueLinks = [...new Set(allLinks.map(m => m[1]))];
    console.log(`  Unique internal links: ${uniqueLinks.length}`);
    uniqueLinks.forEach(l => console.log(`    ${l}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
