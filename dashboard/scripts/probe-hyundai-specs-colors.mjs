#!/usr/bin/env node
/**
 * Extract color data from Hyundai specs API.
 * API: /content/api/au/hyundai/v3/specifications?variantId={GUID}
 * Variant GUIDs found in specifications page HTML.
 */

const BASE = 'https://www.hyundai.com';

// Step 1: Get variant IDs from specifications pages
const specPages = [
  { name: 'Tucson', url: '/au/en/cars/suvs/tucson/specifications' },
  { name: 'Kona', url: '/au/en/cars/suvs/kona/specifications' },
  { name: 'Venue', url: '/au/en/cars/suvs/venue/specifications' },
  { name: 'Santa Fe', url: '/au/en/cars/suvs/santa-fe/specifications' },
  { name: 'Palisade', url: '/au/en/cars/suvs/palisade/specifications' },
  { name: 'i30', url: '/au/en/cars/small-cars/i30/sedan/specifications' },
  { name: 'i30 N', url: '/au/en/cars/sports-cars/i30-n/specifications' },
  { name: 'i20 N', url: '/au/en/cars/sports-cars/i20-n/specifications' },
  { name: 'Ioniq 5', url: '/au/en/cars/eco/ioniq5/specifications' },
  { name: 'Ioniq 6', url: '/au/en/cars/eco/ioniq6/specifications' },
  { name: 'Ioniq 9', url: '/au/en/cars/eco/ioniq9/specifications' },
  { name: 'Kona Electric', url: '/au/en/cars/eco/kona-electric/specifications' },
  { name: 'Staria', url: '/au/en/cars/people-movers-and-commercial/staria/specifications' },
  { name: 'Santa Fe Hybrid', url: '/au/en/cars/suvs/santa-fe-hybrid/specifications' },
  { name: 'Kona Hybrid', url: '/au/en/cars/suvs/kona/konahybrid/specifications' },
  { name: 'Inster', url: '/au/en/cars/eco/inster/specifications' },
];

function decode(s) {
  return s.replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

// First, get one variant's specs to understand the full structure
console.log('=== Step 1: Fetch one full spec response to find color data ===\n');

const r = await fetch(BASE + '/content/api/au/hyundai/v3/specifications?variantId=A1279281-8DC8-4FBC-9507-E826D3B888EA', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
});
const data = await r.json();

// Walk the spec categories to find color-related ones
for (const version of data.specVersion || []) {
  for (const cat of version.category || []) {
    for (const sub of cat.subCategory || []) {
      const specNames = (sub.specification || []).map(s => s.name);
      const hasColor = specNames.some(n => /colou?r|paint|exterior/i.test(n));
      if (hasColor || /colou?r|exterior|paint/i.test(sub.name)) {
        console.log(`Category: ${sub.name}`);
        for (const spec of sub.specification || []) {
          if (/colou?r|paint/i.test(spec.name)) {
            console.log(`  Spec: ${spec.name}`);
            for (const val of spec.values || []) {
              console.log(`    ${val.grouping || ''}: ${val.value}`);
            }
          }
        }
      }
    }
  }
}

// Also search the raw JSON for color-related strings
const jsonStr = JSON.stringify(data);
const colorMatches = jsonStr.match(/"name":"[^"]*[Cc]olou?r[^"]*"/g) || [];
console.log('\nColor-named fields:', [...new Set(colorMatches)]);

const paintMatches = jsonStr.match(/"name":"[^"]*[Pp]aint[^"]*"/g) || [];
console.log('Paint-named fields:', [...new Set(paintMatches)]);

const exteriorMatches = jsonStr.match(/"name":"[^"]*[Ee]xterior[^"]*"/g) || [];
console.log('Exterior-named fields:', [...new Set(exteriorMatches)]);

// Show all subcategory names
console.log('\nAll subcategory names:');
for (const version of data.specVersion || []) {
  for (const cat of version.category || []) {
    for (const sub of cat.subCategory || []) {
      console.log(`  ${sub.name} (${(sub.specification||[]).length} specs)`);
    }
  }
}

// Step 2: Now extract variant IDs from all spec pages
console.log('\n\n=== Step 2: Extract variant IDs from all spec pages ===\n');

const allVariants = {};

for (const page of specPages) {
  try {
    const r = await fetch(BASE + page.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!r.ok) { console.log(`❌ ${page.name}: ${r.status}`); continue; }
    const html = await r.text();
    const decoded = decode(html);

    // Extract variant data from the specifications component
    const variantRegex = /"variantId"\s*:\s*"([A-F0-9-]+)"\s*,\s*"label"\s*:\s*"([^"]+)"\s*,\s*"variantGroup"\s*:\s*"([^"]+)"/g;
    const variants = [];
    let m;
    while ((m = variantRegex.exec(decoded)) !== null) {
      variants.push({
        variantId: m[1],
        label: m[2],
        variantGroup: m[3],
      });
    }

    if (variants.length > 0) {
      allVariants[page.name] = variants;
      console.log(`✅ ${page.name}: ${variants.length} variants`);
      for (const v of variants) {
        console.log(`   ${v.variantId.slice(0,8)}... ${v.variantGroup} - ${v.label}`);
      }
    } else {
      console.log(`⚠️  ${page.name}: no variants found in HTML`);
    }
  } catch (e) {
    console.log(`❌ ${page.name}: ${e.message}`);
  }
}

// Step 3: For each model, fetch one variant's specs and extract color data
console.log('\n\n=== Step 3: Fetch specs for each model ===\n');

for (const [modelName, variants] of Object.entries(allVariants)) {
  // Just fetch the first variant
  const v = variants[0];
  try {
    const r = await fetch(BASE + '/content/api/au/hyundai/v3/specifications?variantId=' + v.variantId, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (!r.ok) { console.log(`❌ ${modelName} specs: ${r.status}`); continue; }
    const data = await r.json();
    const jsonStr = JSON.stringify(data);

    // Find color specs
    let colorSpecs = [];
    for (const version of data.specVersion || []) {
      for (const cat of version.category || []) {
        for (const sub of cat.subCategory || []) {
          for (const spec of sub.specification || []) {
            if (/colou?r|paint/i.test(spec.name)) {
              const values = (spec.values || []).map(v => `${v.grouping}: ${v.value}`);
              colorSpecs.push({ name: spec.name, values });
            }
          }
        }
      }
    }

    if (colorSpecs.length > 0) {
      console.log(`✅ ${modelName}:`);
      for (const cs of colorSpecs) {
        console.log(`   ${cs.name}:`);
        for (const v of cs.values) {
          console.log(`     ${v}`);
        }
      }
    } else {
      console.log(`⚠️  ${modelName}: no color specs in API response`);
    }
  } catch (e) {
    console.log(`❌ ${modelName}: ${e.message}`);
  }
}
