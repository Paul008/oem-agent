#!/usr/bin/env node
// Extract baseColours from the CGI Configurator data for Tucson

const HYUNDAI_BASE = 'https://www.hyundai.com';

function decodeHtmlEntities(str) {
  return str
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function extractCgiData(html) {
  // Find all data-src attributes and parse the CGI configurator one
  const dataSrcRegex = /data-src="([^"]+)"/g;
  let match;
  while ((match = dataSrcRegex.exec(html)) !== null) {
    const decoded = decodeHtmlEntities(match[1]);
    if (!decoded.startsWith('{')) continue;
    try {
      const json = JSON.parse(decoded);
      if (json.fscSubGroups) return json;
    } catch {}
  }
  return null;
}

// Fetch Tucson and extract full baseColours structure
const html = await fetch(HYUNDAI_BASE + '/au/en/cars/suvs/tucson', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
}).then(r => r.text());

const cgiData = extractCgiData(html);
if (!cgiData) {
  console.log('No CGI data found');
  process.exit(1);
}

console.log('=== Extracting Tucson baseColours ===\n');
console.log('Model:', cgiData.modelName);

// Iterate through all subgroups, variants, and fscs to get ALL colour data
const allColours = new Map(); // code -> { colours, variants }

for (const sg of cgiData.fscSubGroups) {
  console.log(`\nSubGroup: ${sg.subGroupName}`);

  for (const variant of (sg.variants || [])) {
    console.log(`  Variant: ${variant.variantName || variant.name || 'unnamed'}, ID: ${variant.variantId || 'N/A'}`);

    for (const fsc of (variant.fscs || [])) {
      console.log(`    FSC: ${fsc.fscName || 'unnamed'}`);

      if (fsc.baseColours) {
        console.log(`    baseColours: ${fsc.baseColours.length} colours`);
        for (const colour of fsc.baseColours) {
          console.log(`      Code: ${colour.code}`);
          console.log(`      Full structure:`, JSON.stringify(colour, null, 2).substring(0, 1000));

          // Track unique colours
          if (!allColours.has(colour.code)) {
            allColours.set(colour.code, { ...colour, variants: [] });
          }
          allColours.get(colour.code).variants.push(sg.subGroupName);
        }
      }

      // Also check for additionalColours or optionPack colours
      if (fsc.additionalColours) {
        console.log(`    additionalColours: ${fsc.additionalColours.length}`);
        for (const c of fsc.additionalColours) {
          console.log(`      Additional: ${JSON.stringify(c).substring(0, 300)}`);
        }
      }
    }
  }
}

console.log('\n=== Summary of unique colour codes ===');
for (const [code, data] of allColours) {
  console.log(`  ${code}: variants = ${[...new Set(data.variants)].join(', ')}`);
}

// Now check the full variant data structure
console.log('\n=== Full variant structure (first subgroup, first variant) ===');
const firstSg = cgiData.fscSubGroups[0];
if (firstSg.variants?.length) {
  const firstVariant = firstSg.variants[0];
  // Don't print fscs (too big), just keys
  const variantKeys = Object.keys(firstVariant);
  console.log('Variant keys:', variantKeys);
  for (const key of variantKeys) {
    if (key === 'fscs') continue;
    console.log(`  ${key}:`, JSON.stringify(firstVariant[key]).substring(0, 300));
  }
  if (firstVariant.fscs?.length) {
    const fscKeys = Object.keys(firstVariant.fscs[0]);
    console.log('\nFSC keys:', fscKeys);
    for (const key of fscKeys) {
      if (key === 'baseColours' || key === 'additionalColours' || key === 'optionPacks' || key === 'subGroupfeatures') continue;
      console.log(`  ${key}:`, JSON.stringify(firstVariant.fscs[0][key]).substring(0, 300));
    }
  }
}

// Look for the HEX color to swatch URL mapping
// The HEX colors we found earlier might map to the colour codes
console.log('\n=== Colour codes to names mapping ===');
// Check if colour objects have "name" or "colourName" fields
for (const [code, data] of allColours) {
  const keys = Object.keys(data).filter(k => k !== 'variants');
  console.log(`\n${code}:`);
  for (const k of keys) {
    const val = data[k];
    if (typeof val === 'string' && val.length < 200) {
      console.log(`  ${k}: ${val}`);
    } else if (Array.isArray(val)) {
      console.log(`  ${k}: [${val.length} items]`);
      if (val.length > 0 && val.length < 5) {
        val.forEach((item, i) => console.log(`    [${i}]:`, JSON.stringify(item).substring(0, 300)));
      }
    }
  }
}
