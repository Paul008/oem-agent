#!/usr/bin/env node
/**
 * Extract color data from Hyundai AU model pages.
 * Colors are embedded as HTML-encoded JSON in page components.
 */

const HYUNDAI_BASE = 'https://www.hyundai.com';

const modelPages = [
  { name: 'Tucson', slug: 'tucson', url: '/au/en/cars/suvs/tucson' },
  { name: 'Kona', slug: 'kona', url: '/au/en/cars/suvs/kona' },
  { name: 'Venue', slug: 'venue', url: '/au/en/cars/suvs/venue' },
  { name: 'Santa Fe', slug: 'santa-fe', url: '/au/en/cars/suvs/santa-fe' },
  { name: 'Palisade', slug: 'palisade', url: '/au/en/cars/suvs/palisade' },
  { name: 'i30', slug: 'i30', url: '/au/en/cars/small-cars/i30/sedan' },
  { name: 'i30 N', slug: 'i30-n', url: '/au/en/cars/sports-cars/i30-n' },
  { name: 'i20 N', slug: 'i20-n', url: '/au/en/cars/sports-cars/i20-n' },
  { name: 'Ioniq 5', slug: 'ioniq-5', url: '/au/en/cars/eco/ioniq5' },
  { name: 'Ioniq 5 N', slug: 'ioniq-5-n', url: '/au/en/cars/eco/ioniq5n' },
  { name: 'Ioniq 6', slug: 'ioniq-6', url: '/au/en/cars/eco/ioniq6' },
  { name: 'Ioniq 9', slug: 'ioniq-9', url: '/au/en/cars/eco/ioniq9' },
  { name: 'Kona Electric', slug: 'kona-electric', url: '/au/en/cars/eco/kona-electric' },
  { name: 'Staria', slug: 'staria', url: '/au/en/cars/people-movers-and-commercial/staria' },
  { name: 'Santa Fe Hybrid', slug: 'santa-fe-hybrid', url: '/au/en/cars/suvs/santa-fe-hybrid' },
  { name: 'Kona Hybrid', slug: 'kona-hybrid', url: '/au/en/cars/suvs/kona/konahybrid' },
  { name: 'Inster', slug: 'inster', url: '/au/en/cars/eco/inster' },
  { name: 'Sonata N Line', slug: 'sonata-n-line', url: '/au/en/cars/mid-size/sonata-n-line' },
];

function decodeHtmlEntities(str) {
  return str
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const allResults = {};

for (const model of modelPages) {
  const url = HYUNDAI_BASE + model.url;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    });
    if (!r.ok) { console.log(`\n❌ ${model.name}: ${r.status}`); continue; }
    const html = await r.text();
    const decoded = decodeHtmlEntities(html);

    const colors = [];
    const seenSwatches = new Set();
    let m;

    // Method 1: colourVariationList JSON blocks
    const varListRegex = /"colou?rVariationList"\s*:\s*(\[[\s\S]*?\](?=\s*[,}]))/g;
    while ((m = varListRegex.exec(decoded)) !== null) {
      try {
        const list = JSON.parse(m[1]);
        for (const item of list) {
          const sw = item.colourSwatchRef || '';
          if (sw && !seenSwatches.has(sw)) {
            seenSwatches.add(sw);
            colors.push({
              name: item.name || item.colourName || 'Unknown',
              swatchUrl: sw.startsWith('/') ? HYUNDAI_BASE + sw : sw,
              heroImage: item.image ? (item.image.startsWith('/') ? HYUNDAI_BASE + item.image : item.image) : null,
              source: 'colourVariationList',
            });
          }
        }
      } catch {}
    }

    // Method 2: colourSwatchRef + name pairs
    const swatchNameRegex = /"colourSwatchRef"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]+)"/g;
    while ((m = swatchNameRegex.exec(decoded)) !== null) {
      const sw = m[1];
      if (sw.includes('exterior-swatch') && !seenSwatches.has(sw)) {
        seenSwatches.add(sw);
        colors.push({
          name: m[2],
          swatchUrl: HYUNDAI_BASE + sw,
          heroImage: null,
          source: 'swatchRef+name',
        });
      }
    }

    // Method 3: Reverse order name + colourSwatchRef
    const nameSwatchRegex = /"name"\s*:\s*"([^"]+)"[\s\S]*?"colourSwatchRef"\s*:\s*"([^"]+)"/g;
    while ((m = nameSwatchRegex.exec(decoded)) !== null) {
      const sw = m[2];
      if (sw.includes('exterior-swatch') && !seenSwatches.has(sw)) {
        seenSwatches.add(sw);
        colors.push({
          name: m[1],
          swatchUrl: HYUNDAI_BASE + sw,
          heroImage: null,
          source: 'name+swatchRef',
        });
      }
    }

    // Method 4: exteriorColour* lists
    const extRegex = /"exteriorColou?r(?:List|s|Variation)"\s*:\s*(\[[\s\S]*?\](?=\s*[,}]))/g;
    while ((m = extRegex.exec(decoded)) !== null) {
      try {
        const list = JSON.parse(m[1]);
        for (const item of list) {
          const sw = item.colourSwatchRef || item.swatchRef || item.swatch || '';
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

    // Method 5: Find all exterior swatch file references
    const allSwatchRegex = /\/content\/dam\/hyundai\/au\/en\/models\/pcm\/colours\/exterior-swatches\/([^"'\s<>]+\.(?:png|jpg|webp))/g;
    const extraSwatches = [];
    while ((m = allSwatchRegex.exec(decoded)) !== null) {
      const fullPath = '/content/dam/hyundai/au/en/models/pcm/colours/exterior-swatches/' + m[1];
      if (!seenSwatches.has(fullPath)) {
        seenSwatches.add(fullPath);
        extraSwatches.push(m[1]);
      }
    }

    // Method 6: panoramic color selector images
    const panRegex = /\/content\/dam\/hyundai\/au\/en\/panoramic\/color-selector\/([^"'\s<>]+\.(?:png|jpg|webp))/g;
    const panoramicSelectors = [];
    while ((m = panRegex.exec(decoded)) !== null) {
      panoramicSelectors.push(m[1]);
    }

    // Method 7: Look for vehicle render images per color
    // Pattern: /content/dam/hyundai/au/en/models/{model}/gallery/{color}/...
    const renderRegex = /\/content\/dam\/hyundai\/au\/en\/models\/([^"'\s]+?)\/(?:gallery|renders?|exterior|colours?)\/([^"'\s]+\.(?:png|jpg|webp))/g;
    const renders = [];
    while ((m = renderRegex.exec(decoded)) !== null) {
      renders.push({ path: m[0], file: m[2] });
    }

    // Dedupe by name
    const seen = new Set();
    const uniqueColors = [];
    for (const c of colors) {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        uniqueColors.push(c);
      }
    }

    allResults[model.name] = {
      slug: model.slug,
      colors: uniqueColors,
      extraSwatches,
      panoramicSelectors: [...new Set(panoramicSelectors)],
      renders: renders.slice(0, 10),
    };

    console.log(`\n✅ ${model.name} (${(html.length/1024).toFixed(0)}KB):`);
    if (uniqueColors.length) {
      console.log(`  Colors (${uniqueColors.length}):`);
      for (const c of uniqueColors) {
        const hero = c.heroImage ? ' 🖼️' : '';
        console.log(`    ${c.name.padEnd(25)} ${c.swatchUrl.split('/').pop()}${hero}`);
      }
    }
    if (extraSwatches.length) {
      console.log(`  Extra swatches (${extraSwatches.length}): ${extraSwatches.join(', ')}`);
    }
    if (panoramicSelectors.length) {
      console.log(`  Panoramic selectors (${panoramicSelectors.length}): ${panoramicSelectors.slice(0,3).join(', ')}`);
    }
    if (renders.length) {
      console.log(`  Renders (${renders.length}): ${renders.slice(0,3).map(r => r.file).join(', ')}`);
    }
    if (!uniqueColors.length && !extraSwatches.length && !panoramicSelectors.length) {
      console.log(`  No color data found`);
    }
  } catch (e) {
    console.log(`\n❌ ${model.name}: ${e.message}`);
  }
}

// Summary
console.log('\n\n=== SUMMARY ===');
let total = 0;
for (const [name, data] of Object.entries(allResults)) {
  const count = data.colors.length;
  total += count;
  console.log(`${name.padEnd(20)} ${count} colors, ${data.extraSwatches.length} extra swatches, ${data.panoramicSelectors.length} panoramic, ${data.renders.length} renders`);
}
console.log(`Total: ${total} color entries`);
