#!/usr/bin/env node
// Extract Kia color data from model pages - swatch images, color names, codes
// Pattern: <img src="/content/dam/kwcms/au/en/images/shopping-tools/byo/excolorchip/{name}.{ext}" alt="{Color Name}">

const KIA_BASE = 'https://www.kia.com';
const models = [
  'seltos', 'sportage', 'sorento', 'carnival', 'stinger',
  'ev6', 'ev9', 'cerato', 'picanto', 'stonic', 'rio', 'k4', 'ev5', 'ev3'
];

const allColors = {};

for (const model of models) {
  const url = `${KIA_BASE}/au/cars/${model}.html`;
  try {
    const r = await fetch(url);
    if (!r.ok) { console.log(`❌ ${model}: ${r.status}`); continue; }
    const html = await r.text();

    // Extract color chips with their alt text (color name) from BYO section
    const chipRegex = /<img\s+src="(\/content\/dam\/kwcms\/au\/en\/images\/shopping-tools\/byo\/excolorchip\/[^"]+)"\s+alt="([^"]+)"/g;
    const colors = [];
    let m;
    while ((m = chipRegex.exec(html)) !== null) {
      const swatchPath = m[1];
      const colorName = m[2];
      // Extract code from filename: e.g. "fusion-black-FSB.gif" → "FSB"
      const filename = swatchPath.split('/').pop().replace(/\.(gif|jpg|png|webp)$/, '');
      const codeParts = filename.match(/-([A-Z0-9]{2,4})$/);
      const colorCode = codeParts ? codeParts[1] : filename;
      colors.push({ colorName, colorCode, swatchUrl: KIA_BASE + swatchPath, filename });
    }

    // Also check for "color-chip/" pattern (Seltos uses this)
    const chipRegex2 = /color-chip\/([^"'<>\s]+)/g;
    while ((m = chipRegex2.exec(html)) !== null) {
      const filename = m[1].replace(/\.(gif|jpg|png|webp)$/, '');
      // Parse: ColorName_Code.ext e.g. "SnowWhitePearl_SWP.jpg"
      const parts = filename.split('_');
      const code = parts[parts.length - 1];
      // Check if already found via first regex
      if (!colors.find(c => c.colorCode === code)) {
        colors.push({
          colorName: parts.slice(0, -1).join(' ').replace(/([A-Z])/g, ' $1').trim(),
          colorCode: code,
          swatchUrl: `${KIA_BASE}/au/cars/${model}/color-chip/${m[1]}`,
          filename: m[1]
        });
      }
    }

    // Look for 360 VR or car render images per color
    // Pattern: onclick="dtmDataLayer.internal_link= 'conversion|cars|360 vr view|{Color Name}'"
    const vrRegex = /360 vr view\|([^'"]+)/gi;
    const vrColors = new Set();
    while ((m = vrRegex.exec(html)) !== null) {
      vrColors.add(m[1].trim());
    }

    // Look for car image URLs (exterior renders)
    const renderRegex = /src="(\/content\/dam\/kwcms\/au\/en\/images\/[^"]*(?:exterior|360|gallery)[^"]*\.(?:jpg|png|webp))"/gi;
    const renders = [];
    while ((m = renderRegex.exec(html)) !== null) {
      renders.push(KIA_BASE + m[1]);
    }

    // Deduplicate colors
    const uniqueColors = [];
    const seen = new Set();
    for (const c of colors) {
      const key = c.colorCode + '|' + c.colorName;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueColors.push(c);
      }
    }

    allColors[model] = { colors: uniqueColors, vrColors: [...vrColors], renders: [...new Set(renders)].slice(0, 5) };
    console.log(`✅ ${model}: ${uniqueColors.length} colors, ${vrColors.size} VR colors, ${renders.length} renders`);
    for (const c of uniqueColors) {
      console.log(`   ${c.colorCode.padEnd(6)} ${c.colorName.padEnd(35)} ${c.swatchUrl.split('/').pop()}`);
    }
    if (vrColors.size) console.log(`   VR:`, [...vrColors].join(', '));
    if (renders.length) console.log(`   Render sample:`, renders[0]);
  } catch (e) {
    console.log(`❌ ${model}: ${e.message}`);
  }
}

// Summary
console.log('\n=== SUMMARY ===');
let totalColors = 0;
for (const [model, data] of Object.entries(allColors)) {
  totalColors += data.colors.length;
  console.log(`${model}: ${data.colors.length} colors`);
}
console.log(`Total unique color entries: ${totalColors}`);
