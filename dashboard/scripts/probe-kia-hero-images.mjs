#!/usr/bin/env node
/**
 * Probe Kia AU hero images - Phase 2: Extract 360VR spin data from model pages.
 *
 * Key finding from Phase 1: Each model page has an AngularJS 360VR viewer
 * with hundreds of inline image references following the pattern:
 *   /content/dam/kwcms/au/en/images/showroom/{model-folder}/{360VR|360vr|exterior360|exterior}/{color-slug}/Kia-{model}-{grade}-{color}_NNNNN.{ext}
 *
 * Frame _00000 is the front-facing hero shot. We extract that per color per model.
 *
 * Additionally: the Seltos page references a global KWCMS CDN path (gt/en) with
 * different color chips, suggesting a shared Kia CMS colour catalogue.
 */

const KIA_BASE = 'https://www.kia.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*',
};

const models = [
  'seltos', 'sportage', 'sorento', 'carnival',
  'ev6', 'ev9', 'cerato', 'picanto', 'stonic', 'rio',
  'k4', 'ev5', 'ev3'
];

async function safeFetch(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: HEADERS });
    clearTimeout(t);
    return r;
  } catch { clearTimeout(t); return null; }
}

// ═══════════════════════════════════════════════════════
// Extract color→hero mapping from each model page
// ═══════════════════════════════════════════════════════

const allModelColors = {};
let totalHeroes = 0;

for (const model of models) {
  const url = `${KIA_BASE}/au/cars/${model}.html`;
  const r = await safeFetch(url);
  if (!r || !r.ok) { console.log(`❌ ${model}: ${r?.status || 'timeout'}`); continue; }
  const html = await r.text();

  // Extract ALL 360VR / exterior image references from inline scripts and HTML
  // Pattern: /content/dam/kwcms/au/en/images/showroom/{folder}/{type}/{color-slug}/{filename}_NNNNN.{ext}
  const auRenderRegex = /\/content\/dam\/kwcms\/au\/en\/images\/showroom\/([^/]+)\/(?:360VR|360vr|exterior360|exterior)\/([^/]+)\/([^"'\s<>]+_(\d{5})\.(png|webp|jpg))/gi;

  const colorRenders = {}; // colorSlug → { heroUrl, folderName, grade, frameCount, ext }
  let m;
  while ((m = auRenderRegex.exec(html)) !== null) {
    const folder = m[1];       // e.g. "sportage-pe", "seltos"
    const colorSlug = m[2];    // e.g. "clear-white"
    const filename = m[3];     // e.g. "Kia-sportage-gt-clear-white_00000.png"
    const frameNum = m[4];     // e.g. "00000"
    const ext = m[5];

    if (!colorRenders[colorSlug]) {
      colorRenders[colorSlug] = { folder, frames: new Set(), ext, filename: null, heroUrl: null };
    }
    colorRenders[colorSlug].frames.add(frameNum);

    // Capture frame 00000 as the hero
    if (frameNum === '00000') {
      colorRenders[colorSlug].heroUrl = `${KIA_BASE}/content/dam/kwcms/au/en/images/showroom/${folder}/${m[0].match(/360VR|360vr|exterior360|exterior/i)?.[0] || 'exterior360'}/${colorSlug}/${filename}`;
      colorRenders[colorSlug].filename = filename;
    }
  }

  // Re-extract more carefully: get the full path for frame 00000
  const hero00Regex = /"(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"]*?\/(?:360VR|360vr|exterior360|exterior)\/([^/]+)\/[^"]*?_00000\.(?:png|webp|jpg))"/gi;
  while ((m = hero00Regex.exec(html)) !== null) {
    const fullPath = m[1];
    const colorSlug = m[2];
    if (!colorRenders[colorSlug]) {
      colorRenders[colorSlug] = { folder: '', frames: new Set(['00000']), ext: '', filename: null, heroUrl: null };
    }
    colorRenders[colorSlug].heroUrl = KIA_BASE + fullPath;
  }

  // Also check for the global (gt/en) colour chips — these are swatch images in the 360VR viewer
  const gtChipRegex = /\/content\/dam\/kwcms\/gt\/en\/images\/showroom\/([^/]+)\/Features\/360vr\/Exterior\/color-chip\/([^"'\s<>]+)\.(jpg|png|webp)/gi;
  const gtChips = {};
  while ((m = gtChipRegex.exec(html)) !== null) {
    const modelFolder = m[1]; // e.g. "Seltos_SP2_23my"
    const chipFilename = m[2]; // e.g. "PlutonBlue_PLU_FusionBlack_FSB_F1A" or "PlutonBlue_PLU"
    const ext = m[3];

    // Parse color code from filename: last segment after _ that's 2-4 uppercase chars
    const parts = chipFilename.split('_');
    // Could be: ColorName_CODE or ColorName_CODE_SecondColor_CODE_TwoToneCode
    if (parts.length >= 2) {
      const code = parts[1]; // First color code
      gtChips[chipFilename] = {
        code,
        modelFolder,
        url: `${KIA_BASE}/content/dam/kwcms/gt/en/images/showroom/${modelFolder}/Features/360vr/Exterior/color-chip/${chipFilename}.${ext}`,
        isTwoTone: parts.length > 3
      };
    }
  }

  allModelColors[model] = { colorRenders, gtChips };

  const heroCount = Object.values(colorRenders).filter(v => v.heroUrl).length;
  totalHeroes += heroCount;
  console.log(`\n✅ ${model}: ${Object.keys(colorRenders).length} AU color renders, ${heroCount} with hero (_00000)`);
  for (const [slug, data] of Object.entries(colorRenders)) {
    const frames = data.frames.size;
    const hero = data.heroUrl ? '🖼️' : '  ';
    console.log(`  ${hero} ${slug.padEnd(35)} ${frames} frames  ${data.heroUrl?.split('/').slice(-1)[0] || '(no hero frame)'}`);
  }

  if (Object.keys(gtChips).length) {
    console.log(`  GT chips (global CMS): ${Object.keys(gtChips).length}`);
    for (const [name, data] of Object.entries(gtChips)) {
      console.log(`    ${data.code.padEnd(6)} ${name}${data.isTwoTone ? ' (two-tone)' : ''}`);
    }
  }
}

// ═══════════════════════════════════════════════════════
// Try alternative 360VR path patterns for models with no AU renders
// ═══════════════════════════════════════════════════════
console.log('\n\n═══ Verify hero URLs exist (HEAD requests) ═══\n');

let verified = 0, failed = 0;
for (const [model, data] of Object.entries(allModelColors)) {
  for (const [slug, renderData] of Object.entries(data.colorRenders)) {
    if (!renderData.heroUrl) continue;
    const r = await safeFetch(renderData.heroUrl);
    if (r && r.ok) {
      const size = r.headers.get('content-length') || '?';
      const ct = r.headers.get('content-type') || '?';
      console.log(`  ✅ ${model}/${slug}: ${ct} ${size}b`);
      verified++;
    } else {
      console.log(`  ❌ ${model}/${slug}: ${r?.status || 'timeout'} — ${renderData.heroUrl}`);
      failed++;
    }
  }
}
console.log(`\nVerified: ${verified}, Failed: ${failed}`);

// ═══════════════════════════════════════════════════════
// For models with only 1 color in AU, probe CDN for other colors
// ═══════════════════════════════════════════════════════
console.log('\n\n═══ CDN probing: guess other color paths from known patterns ═══\n');

// Known color slugs from our DB / common Kia palette
const knownColorSlugs = [
  'clear-white', 'snow-white-pearl', 'aurora-black-pearl', 'gravity-grey',
  'steel-grey', 'glacier-white-pearl', 'interstellar-grey', 'yacht-blue',
  'runway-red', 'fusion-black', 'silky-silver', 'dawning-red',
  'moonscape', 'ocean-blue', 'cityscape-green', 'smoke-blue',
  'mineral-blue', 'adventurine-green', 'flare-red', 'sand-beige',
  'ceramic-grey', 'ceramic-silver', 'volcanic-sand-brown', 'pluton-blue',
  'matcha-green', 'urban-grey', 'intrepid-green', 'aurora-grey-pearl',
  'shale-grey', 'mars-orange', 'neptune-blue', 'expedition-green',
  'sunset-red', 'deep-blue', 'sporty-blue', 'iceberg-green'
];

// For each model, try known colors not already found
for (const [model, data] of Object.entries(allModelColors)) {
  const foundSlugs = new Set(Object.keys(data.colorRenders));
  if (foundSlugs.size === 0) continue; // No pattern to follow

  // Get the folder and render type from an existing color
  const sample = Object.values(data.colorRenders)[0];
  if (!sample?.heroUrl) continue;

  // Extract the path pattern from the known hero URL
  const pathMatch = sample.heroUrl.match(/\/content\/dam\/kwcms\/au\/en\/images\/showroom\/([^/]+)\/(360VR|360vr|exterior360|exterior)\//i);
  if (!pathMatch) continue;
  const [, folder, renderType] = pathMatch;

  // Extract grade from filename pattern: Kia-{model}-{grade}-{color}_00000.{ext}
  const nameMatch = sample.filename?.match(/Kia-([^_]+?)-([\w-]+)-[\w-]+_00000/i);
  const grade = nameMatch ? nameMatch[2] : 'gt';
  const ext = sample.ext || 'png';

  const toProbe = knownColorSlugs.filter(s => !foundSlugs.has(s));
  let foundNew = 0;

  for (const colorSlug of toProbe) {
    // Try multiple filename conventions
    const patterns = [
      `Kia-${model}-${grade}-${colorSlug}_00000.${ext}`,
      `Kia-${model}-${grade}-${colorSlug}_00000.webp`,
      `Kia-${model}-${grade}-${colorSlug}_00000.png`,
      `kia-${model}-${grade}-${colorSlug}_00000.webp`,
      `kia-${model}-${grade}-${colorSlug}_00000.png`,
      `Kia-${model}-GT-${colorSlug}_00000.png`,
      `Kia-${model}-GT-${colorSlug}_00000.webp`,
    ];

    for (const filename of patterns) {
      const testUrl = `${KIA_BASE}/content/dam/kwcms/au/en/images/showroom/${folder}/${renderType}/${colorSlug}/${filename}`;
      const r = await safeFetch(testUrl);
      if (r && r.ok) {
        const size = r.headers.get('content-length');
        if (size && parseInt(size) > 5000) { // Real image, not error page
          console.log(`  ✅ ${model}/${colorSlug}: FOUND (${size}b) — ${filename}`);
          if (!data.colorRenders[colorSlug]) {
            data.colorRenders[colorSlug] = { folder, frames: new Set(['00000']), ext, filename, heroUrl: testUrl };
          }
          foundNew++;
          totalHeroes++;
          break;
        }
      }
    }
  }
  if (foundNew) console.log(`  ${model}: +${foundNew} new colors via CDN probing`);
}

// ═══════════════════════════════════════════════════════
// FINAL SUMMARY
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('═══ FINAL SUMMARY ═══');
console.log('═══════════════════════════════════════════════════════\n');

let grandTotal = 0;
for (const [model, data] of Object.entries(allModelColors)) {
  const heroes = Object.entries(data.colorRenders)
    .filter(([, v]) => v.heroUrl)
    .map(([slug, v]) => ({ slug, url: v.heroUrl }));
  grandTotal += heroes.length;

  console.log(`${model} (${heroes.length} hero images):`);
  for (const h of heroes) {
    console.log(`  ${h.slug.padEnd(35)} ${h.url.split('/').slice(-2).join('/')}`);
  }
}

console.log(`\nGrand total hero images: ${grandTotal}`);
console.log('\nURL pattern: /content/dam/kwcms/au/en/images/showroom/{folder}/{type}/{color-slug}/{filename}_00000.{ext}');
console.log('Match strategy: color_name → slugify → color-slug in URL path');
console.log('\nRender types found:');
console.log('  360VR     — sportage-pe, sorento (full 360 spin with 36 frames)');
console.log('  360vr     — stonic, ev3 (case variation)');
console.log('  exterior  — sorento, ev5');
console.log('  exterior360 — seltos (two-tone)');
