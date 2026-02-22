#!/usr/bin/env node
/**
 * Extract Hyundai color data from HTML-encoded JSON in model pages.
 * Pattern: colourSwatchRef + name fields in embedded component JSON
 */

const HYUNDAI_BASE = 'https://www.hyundai.com';

const modelPages = [
  { name: 'Tucson', url: '/au/en/cars/suvs/tucson' },
  { name: 'Kona', url: '/au/en/cars/suvs/kona' },
  { name: 'Venue', url: '/au/en/cars/suvs/venue' },
  { name: 'Santa Fe', url: '/au/en/cars/suvs/santa-fe' },
  { name: 'Palisade', url: '/au/en/cars/suvs/palisade' },
  { name: 'i30 Sedan', url: '/au/en/cars/small-cars/i30/sedan' },
  { name: 'i30 N Line', url: '/au/en/cars/small-cars/i30/n-line' },
  { name: 'i30 N', url: '/au/en/cars/sports-cars/i30-n' },
  { name: 'i20 N', url: '/au/en/cars/sports-cars/i20-n' },
  { name: 'Ioniq 5', url: '/au/en/cars/eco/ioniq5' },
  { name: 'Ioniq 5 N', url: '/au/en/cars/eco/ioniq5n' },
  { name: 'Ioniq 6', url: '/au/en/cars/eco/ioniq6' },
  { name: 'Ioniq 9', url: '/au/en/cars/eco/ioniq9' },
  { name: 'Kona EV', url: '/au/en/cars/eco/kona-electric' },
  { name: 'Staria', url: '/au/en/cars/people-movers-and-commercial/staria' },
  { name: 'Santa Fe Hybrid', url: '/au/en/cars/suvs/santa-fe-hybrid' },
  { name: 'Kona Hybrid', url: '/au/en/cars/suvs/kona/konahybrid' },
];

function decodeHtmlEntities(str) {
  return str
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const allModels = {};

for (const model of modelPages) {
  const url = HYUNDAI_BASE + model.url;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.log(`\n❌ ${model.name}: ${r.status}`); continue; }
    const html = await r.text();

    const colors = [];

    // Method 1: Extract colourSwatchRef entries from HTML-encoded JSON
    // These appear in component data as &#34;colourSwatchRef&#34;:&#34;/path/to/swatch.png&#34;
    const decodedHtml = decodeHtmlEntities(html);

    // Find all colourSwatchRef + name pairs
    const swatchRegex = /"colourSwatchRef"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]+)"/g;
    let m;
    const seenSwatches = new Set();
    while ((m = swatchRegex.exec(decodedHtml)) !== null) {
      const swatchPath = m[1];
      const colorName = m[2];
      if (swatchPath.includes('exterior-swatch') && !seenSwatches.has(swatchPath)) {
        seenSwatches.add(swatchPath);
        colors.push({
          name: colorName,
          swatchUrl: HYUNDAI_BASE + swatchPath,
          source: 'colourSwatchRef',
        });
      }
    }

    // Also try reverse order: name then swatchRef
    const swatchRegex2 = /"name"\s*:\s*"([^"]+)"\s*[,}][\s\S]*?"colourSwatchRef"\s*:\s*"([^"]+)"/g;
    while ((m = swatchRegex2.exec(decodedHtml)) !== null) {
      const colorName = m[1];
      const swatchPath = m[2];
      if (swatchPath.includes('exterior-swatch') && !seenSwatches.has(swatchPath)) {
        seenSwatches.add(swatchPath);
        colors.push({
          name: colorName,
          swatchUrl: HYUNDAI_BASE + swatchPath,
          source: 'reversed',
        });
      }
    }

    // Method 2: Find all exterior swatch URLs with surrounding context
    const extSwatchRegex = /(\/content\/dam\/hyundai\/au\/en\/models\/pcm\/colours\/exterior-swatches\/[^"'\s<>]+\.(?:png|jpg|webp))/g;
    const extSwatchUrls = new Set();
    while ((m = extSwatchRegex.exec(decodedHtml)) !== null) {
      extSwatchUrls.add(m[1]);
    }

    // Method 3: Find color-name elements (Kona EV pattern)
    const colorNameRegex = /color-name"[^>]*>[\s\n]*([^<]+)</g;
    const colorNames = [];
    while ((m = colorNameRegex.exec(html)) !== null) {
      const name = m[1].trim();
      if (name && name.length > 2 && !colorNames.includes(name)) {
        colorNames.push(name);
      }
    }

    // Method 4: Look for color selector images (panoramic pattern)
    const csRegex = /\/content\/dam\/hyundai\/au\/en\/panoramic\/color-selector\/([^"'\s<>]+\.(?:png|jpg|webp))/g;
    const colorSelectors = [];
    while ((m = csRegex.exec(decodedHtml)) !== null) {
      colorSelectors.push({
        url: HYUNDAI_BASE + '/content/dam/hyundai/au/en/panoramic/color-selector/' + m[1],
        filename: m[1],
      });
    }

    // Method 5: Extract full JSON blocks with colourVariationList
    const varListRegex = /"colou?rVariationList"\s*:\s*(\[[\s\S]*?\](?=\s*[,}]))/g;
    while ((m = varListRegex.exec(decodedHtml)) !== null) {
      try {
        const list = JSON.parse(m[1]);
        for (const item of list) {
          if (item.colourSwatchRef && !seenSwatches.has(item.colourSwatchRef)) {
            seenSwatches.add(item.colourSwatchRef);
            colors.push({
              name: item.name || item.colourName || 'Unknown',
              swatchUrl: HYUNDAI_BASE + item.colourSwatchRef,
              heroImage: item.image ? HYUNDAI_BASE + item.image : null,
              source: 'colourVariationList',
            });
          }
        }
      } catch {}
    }

    // Method 6: Extract exterior colour variant data
    const extRegex = /"exteriorColou?r(?:List|s|Variation)"\s*:\s*(\[[\s\S]*?\](?=\s*[,}]))/g;
    while ((m = extRegex.exec(decodedHtml)) !== null) {
      try {
        const list = JSON.parse(m[1]);
        for (const item of list) {
          const sw = item.colourSwatchRef || item.swatchRef || item.swatch;
          const nm = item.name || item.colourName || item.label;
          const img = item.image || item.heroImage || item.vehicleImage;
          if (sw && !seenSwatches.has(sw)) {
            seenSwatches.add(sw);
            colors.push({
              name: nm || 'Unknown',
              swatchUrl: sw.startsWith('/') ? HYUNDAI_BASE + sw : sw,
              heroImage: img ? (img.startsWith('/') ? HYUNDAI_BASE + img : img) : null,
              source: 'exteriorColourList',
            });
          }
        }
      } catch {}
    }

    // Deduplicate colors by name
    const seen = new Set();
    const uniqueColors = [];
    for (const c of colors) {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        uniqueColors.push(c);
      }
    }

    allModels[model.name] = {
      colors: uniqueColors,
      extSwatchUrls: [...extSwatchUrls],
      colorNames,
      colorSelectors,
    };

    console.log(`\n✅ ${model.name}:`);
    if (uniqueColors.length) {
      console.log(`  Colors (${uniqueColors.length}):`);
      for (const c of uniqueColors) {
        const hero = c.heroImage ? ' 🖼️' : '';
        console.log(`    ${c.name.padEnd(25)} ${c.swatchUrl.split('/').pop()}${hero}`);
      }
    }
    if (extSwatchUrls.size > uniqueColors.length) {
      console.log(`  Additional swatch URLs (${extSwatchUrls.size - uniqueColors.length}):`);
      for (const u of [...extSwatchUrls].filter(u => !colors.find(c => c.swatchUrl.endsWith(u.split('/').pop())))) {
        console.log(`    ${u.split('/').pop()}`);
      }
    }
    if (colorNames.length && !uniqueColors.length) {
      console.log(`  Color names (${colorNames.length}): ${colorNames.join(', ')}`);
    }
    if (colorSelectors.length) {
      console.log(`  Color selectors (${colorSelectors.length}):`);
      for (const cs of colorSelectors) {
        console.log(`    ${cs.filename}`);
      }
    }
    if (!uniqueColors.length && !colorNames.length && !extSwatchUrls.size) {
      console.log(`  No color data found`);
    }
  } catch (e) {
    console.log(`\n❌ ${model.name}: ${e.message}`);
  }
}

// Summary
console.log('\n\n=== SUMMARY ===');
let total = 0;
for (const [name, data] of Object.entries(allModels)) {
  const count = data.colors.length || data.colorNames.length || 0;
  total += count;
  console.log(`${name.padEnd(20)} ${count} colors, ${data.extSwatchUrls.length} swatch URLs, ${data.colorSelectors.length} selectors`);
}
console.log(`Total: ${total} color entries`);
