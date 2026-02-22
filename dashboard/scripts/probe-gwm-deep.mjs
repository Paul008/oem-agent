#!/usr/bin/env node
/**
 * Deep-probe GWM for color data from Storyblok Nuxt payload
 */

const BASE = 'https://www.gwmanz.com';
const MODEL_PAGES = {
  cannon: '/au/models/ute/cannon/',
  'cannon-alpha': '/au/models/ute/cannon-alpha/',
  'haval-jolion': '/au/models/suv/haval-jolion/',
  'haval-h6': '/au/models/suv/haval-h6/',
  'haval-h6gt': '/au/models/suv/haval-h6gt/',
  'tank-300': '/au/models/suv/tank-300/',
  'tank-500': '/au/models/suv/tank-500/',
  ora: '/au/models/hatchback/ora/',
};

async function extractNuxtPayload(html) {
  // Find the __NUXT_DATA__ script (Nuxt 3 uses a JSON array payload)
  const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch(e) {
      return null;
    }
  }
  return null;
}

function findColorData(payload) {
  if (!Array.isArray(payload)) return null;

  // Search the payload array for color-related strings and objects
  const colorIndices = [];
  const results = [];

  for (let i = 0; i < payload.length; i++) {
    const item = payload[i];
    if (typeof item === 'string') {
      const lower = item.toLowerCase();
      if (lower.includes('colour') || lower.includes('color_swatch') ||
          lower === 'exterior_colours' || lower === 'interior_colours' ||
          lower === 'colours' || lower === 'color_name' || lower === 'color_code' ||
          lower === 'swatch' || lower === 'paint') {
        colorIndices.push({ idx: i, value: item });
      }
    }
  }

  return colorIndices;
}

function resolveStoryblokRef(payload, idx) {
  if (idx === undefined || idx === null || idx >= payload.length) return undefined;
  const item = payload[idx];
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null) return item;
  if (Array.isArray(item)) {
    // ShallowReactive or plain arrays
    if (item[0] === 'ShallowReactive') return resolveStoryblokRef(payload, item[1]);
    return item.map(v => typeof v === 'number' ? resolveStoryblokRef(payload, v) : v);
  }
  if (typeof item === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(item)) {
      result[k] = resolveStoryblokRef(payload, v);
    }
    return result;
  }
  return item;
}

async function main() {
  for (const [model, path] of Object.entries(MODEL_PAGES)) {
    console.log(`\n=== ${model.toUpperCase()} ===`);
    try {
      const r = await fetch(BASE + path, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log(`  Status: ${r.status}`); continue; }
      const html = await r.text();
      console.log(`  Page: ${html.length} bytes`);

      const payload = await extractNuxtPayload(html);
      if (!payload) { console.log('  No Nuxt payload found'); continue; }
      console.log(`  Nuxt payload: ${payload.length} items`);

      // Find color-related entries
      const colorEntries = findColorData(payload);
      console.log(`  Color-related entries: ${colorEntries.length}`);
      colorEntries.forEach(e => console.log(`    [${e.idx}] = "${e.value}"`));

      // Look for colour-swatch or similar patterns near model-range data
      // Search for "model-range" or "ModelRange" components
      const rangeIndices = [];
      for (let i = 0; i < payload.length; i++) {
        const item = payload[i];
        if (typeof item === 'string' &&
            (item === 'ModelRange' || item === 'model_range' ||
             item === 'ModelRangeSelect' || item === 'model-range-select-colour')) {
          rangeIndices.push({ idx: i, value: item });
        }
      }
      console.log(`  Range components: ${rangeIndices.length}`);
      rangeIndices.forEach(e => console.log(`    [${e.idx}] = "${e.value}"`));

      // Search for gradient patterns (from HTML we saw background:linear-gradient with color swatches)
      const gradientIndices = [];
      for (let i = 0; i < payload.length; i++) {
        const item = payload[i];
        if (typeof item === 'string' && item.includes('linear-gradient')) {
          gradientIndices.push({ idx: i, value: item.substring(0, 200) });
        }
      }
      console.log(`  Gradient entries: ${gradientIndices.length}`);
      gradientIndices.slice(0, 5).forEach(e => console.log(`    [${e.idx}] = "${e.value}"`));

      // Search for hex color patterns (#XXXXXX)
      const hexIndices = [];
      for (let i = 0; i < payload.length; i++) {
        const item = payload[i];
        if (typeof item === 'string' && /^#[0-9a-fA-F]{6}$/.test(item)) {
          hexIndices.push({ idx: i, value: item });
        }
      }
      console.log(`  Hex color values: ${hexIndices.length}`);
      hexIndices.forEach(e => console.log(`    [${e.idx}] = "${e.value}"`));

      // Look for Storyblok image URLs (a.storyblok.com) that might be swatches
      const swatchImages = [];
      for (let i = 0; i < payload.length; i++) {
        const item = payload[i];
        if (typeof item === 'string' && item.includes('storyblok.com') &&
            (item.includes('swatch') || item.includes('colour') || item.includes('color'))) {
          swatchImages.push({ idx: i, value: item });
        }
      }
      console.log(`  Storyblok swatch images: ${swatchImages.length}`);
      swatchImages.forEach(e => console.log(`    [${e.idx}] = "${e.value}"`));

    } catch(e) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
