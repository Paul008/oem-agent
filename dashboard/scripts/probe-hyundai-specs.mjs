#!/usr/bin/env node
const BASE = 'https://www.hyundai.com';

const tryUrls = [
  '/au/en/cars/suvs/tucson/specifications',
  '/au/en/cars/suvs/tucson/colours',
  '/au/en/cars/suvs/tucson/colour',
  '/au/en/cars/suvs/tucson/design',
  '/au/en/cars/suvs/tucson.specifications.html',
  '/au/en/cars/suvs/tucson/specifications.html',
  '/au/en/cars/suvs/tucson/colours.html',
  '/au/en/cars/suvs/santa-fe/specifications',
  '/au/en/cars/suvs/santa-fe/colours',
  '/au/en/cars/eco/ioniq5/specifications',
  '/au/en/cars/eco/ioniq5/colours',
  '/au/en/cars/suvs/kona/specifications',
  '/au/en/cars/suvs/kona/colours',
];

function decode(s) {
  return s.replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

for (const path of tryUrls) {
  try {
    const r = await fetch(BASE + path, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow'
    });
    const size = r.headers.get('content-length') || '?';

    if (r.ok) {
      const html = await r.text();
      const decoded = decode(html);
      const swatchCount = (decoded.match(/exterior-swatch/gi) || []).length;
      const colorRefCount = (decoded.match(/colou?rSwatchRef/gi) || []).length;
      const variantCount = (decoded.match(/variantId/gi) || []).length;
      const modelSeriesId = decoded.match(/model-series-id="([^"]+)"/);

      console.log(`✅ ${path} (${(html.length/1024).toFixed(0)}KB) swatches:${swatchCount} colorRefs:${colorRefCount} variants:${variantCount}`);
      if (modelSeriesId) console.log(`   model-series-id: ${modelSeriesId[1]}`);

      if (colorRefCount > 2) {
        console.log(`   ** HAS COLOR DATA! **`);
        const nameRegex = /"colou?rSwatchRef"\s*:\s*"([^"]+)"/g;
        let m;
        while ((m = nameRegex.exec(decoded)) !== null) {
          console.log(`     swatch: ${m[1].split('/').pop()}`);
        }
      }

      // Check for color-specific sections
      if (swatchCount > 0) {
        const swatchUrlRegex = /\/content\/dam\/hyundai\/au\/en\/models\/pcm\/colours\/exterior-swatches\/([^"'\s<>]+)/g;
        const swatches = new Set();
        let m;
        while ((m = swatchUrlRegex.exec(decoded)) !== null) swatches.add(m[1]);
        if (swatches.size > 0) {
          console.log(`   Swatch files (${swatches.size}): ${[...swatches].join(', ')}`);
        }
      }
    } else {
      console.log(`❌ ${r.status} ${path}`);
    }
  } catch (e) {
    console.log(`ERR ${path}: ${e.message}`);
  }
}

// Also try the DXP content API with different paths
console.log('\n=== DXP Content API probes ===');
const apiPaths = [
  '/content/api/au/hyundai/v3/specifications?modelSeriesId=TUCSON',
  '/content/api/au/hyundai/v3/grades?modelSeriesId=TUCSON',
  '/content/api/au/hyundai/v3/colours?modelSeriesId=TUCSON',
  '/content/api/au/hyundai/v3/exterior-colours?modelSeriesId=TUCSON',
  '/content/api/au/hyundai/v3/model?modelSeriesId=TUCSON',
  '/content/api/au/hyundai/v3/configuration?modelSeriesId=TUCSON',
  // Try with different IDs
  '/content/api/au/hyundai/v3/specifications?modelSeriesId=tucson',
  '/content/api/au/hyundai/v3/specifications?groupId=6405',
  '/content/api/au/hyundai/v3/specifications?groupId=6436',
];

for (const path of apiPaths) {
  try {
    const r = await fetch(BASE + path, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (r.ok) {
      const text = await r.text();
      console.log(`✅ ${path} (${text.length}B)`);
      console.log(`   ${text.slice(0, 300)}`);
    } else {
      console.log(`❌ ${r.status} ${path}`);
    }
  } catch (e) {
    console.log(`ERR ${path}: ${e.message}`);
  }
}
