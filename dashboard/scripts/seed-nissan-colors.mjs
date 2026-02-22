#!/usr/bin/env node
/**
 * Seed Nissan Australia variant_colors from version-explorer JSON endpoints.
 *
 * Data source: AEM version-explorer at
 *   /content/nissan_prod/en_AU/index/vehicles/browse-range/{slug}/version-explorer/jcr:content/core.versionexplorerdata.json
 *
 * Hero/gallery images: Nissan Helios Media Server (render-on-demand)
 *   https://ms-prd.apn.mediaserver.heliosnissan.net/iris/iris?fabric=G&paint={code}&vehicle={code}&sa={spec}&...
 *
 * Swatch images: AEM DAM icon thumbnails from version-explorer
 *
 * Colors are at model level (not grade-specific), so every product under a model_code
 * gets the full color palette.
 *
 * Navara MY26 (code 30316) is on a separate Storyblok microsite (navara.nissan.com.au)
 * with color names + hex values scraped from ColorPicker radio inputs.
 *
 * Run: cd dashboard/scripts && node seed-nissan-colors.mjs
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const OEM_ID = 'nissan-au';
const NISSAN_DAM = 'https://www.nissan.com.au';
const HELIOS_BASE = 'https://ms-prd.apn.mediaserver.heliosnissan.net/iris/iris';

// AEM version-explorer models: slug -> { modelCode, helios config }
// Helios vehicle codes and SA strings from OEM-variants project
const AEM_MODELS = [
  { slug: 'qashqai',     modelCode: '30128', helios: { vehicle: '8_J12', sa: '1_T,2_DZ,4_A,5_R,6_D,7_W,11_U,12_M,13_A,14_,15_,16_,17_,18_,2025,,AU,PE_ON' } },
  { slug: 'x-trail',     modelCode: '30145', helios: { vehicle: '8_T33', sa: '1_T,2_CJ,4_A,5_R,6_B,7_W,11_E,12_M,13_A,14_,15_,16_,17_,18_,2025,,AU,PE_ON' } },
  { slug: 'new-x-trail', modelCode: '70049', helios: { vehicle: '8_T33', sa: '1_T,2_CJ,4_A,5_R,6_B,7_W,11_E,12_M,13_A,14_,15_,16_,17_,18_,2026,,AU,PE_ON' } },
  { slug: 'navara',      modelCode: '29299', helios: { vehicle: '8_D23', sa: '1_C,2_TS,4_N,5_R,6_Q,7_L,11_I,12_M,13_T,14_,15_,16_B,17_,18_,2021,,AU,PE_ON' } },
  { slug: 'pathfinder',  modelCode: '29652', helios: { vehicle: '8_R53', sa: '1_T,2_LJ,4_A,5_R,6_C,7_2,11_D,12_M,13_8,14_B,15_,16_,17_,18_,2022,,AU,PE_ON' } },
  { slug: 'patrol',      modelCode: '30170', helios: { vehicle: '8_Y62', sa: '1_T,2_PK,4_N,5_R,6_D,7_L,11_E,12_M,13_8,14_,15_,16_,17_,18_,2025,,AU,PE_ON' } },
  { slug: 'ariya',       modelCode: '30179', helios: { vehicle: '8_FE0', sa: '1_T,2_SG,4_A,5_R,6_C,7_9,11_3,12_M,13_A,14_,15_,16_,17_,18_B,2025,,AU,PE_ON' } },
  { slug: 'Z',           modelCode: '30273', helios: { vehicle: '8_Z34', sa: '1_G,2_LV,4_A,5_R,6_W,7_Y,11_Z,12_M,13_A,14_,15_,16_,17_,18_,2025,,AU,PE_ON' } },
  { slug: 'juke',        modelCode: '30304', helios: { vehicle: '8_F16', sa: '1_F,2_RN,4_A,5_R,6_T,7_L,11_U,12_M,13_A,14_A,15_,16_,17_,18_J,2024,,AU,PE_ON' } },
];

// Navara MY26 (Storyblok microsite) - scraped from navara.nissan.com.au ColorPicker inputs
const NAVARA_MY26_COLORS = [
  { name: 'Boulder Grey',     hexCode: '#4A4D4E' },
  { name: 'Summit Silver',    hexCode: '#A7A9AC' },
  { name: 'Horizon Blue',     hexCode: '#1A3B66' },
  { name: 'Blizzard White',   hexCode: '#F9F9FB' },
  { name: 'Outback Red',      hexCode: '#A31621' },
  { name: 'Alpine White',     hexCode: '#F9F9F9' },
  { name: 'Midnight Black',   hexCode: '#0F0F0F' },
  { name: 'Kimberley Orange', hexCode: '#E38B2D' },
];

// Navara MY26 Helios config
const NAVARA_MY26_HELIOS = { vehicle: '8_D27', sa: '' };

/* ── Helpers ─────────────────────────────────────────── */

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Derive color type from name */
function deriveColorType(name) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('two-tone') || lower.includes('two tone') || lower.includes('with') && lower.includes('roof')) return 'Two-Tone';
  if (lower.includes('pearl')) return 'Pearl';
  if (lower.includes('metallic') || lower.includes('mica')) return 'Metallic';
  if (lower.includes('solid white') || lower === 'solid white') return 'Solid';
  if (lower.includes('ivory') || lower.includes('moonstone') || lower.includes('glacier')) return 'Pearl';
  if (lower.includes('gun') || lower.includes('brilliant') || lower.includes('champagne') ||
      lower.includes('diamond') || lower.includes('ceramic') || lower.includes('platinum') ||
      lower.includes('twilight') || lower.includes('caspian') || lower.includes('rosewood') ||
      lower.includes('bayside') || lower.includes('aurora') || lower.includes('deep ocean') ||
      lower.includes('scarlet') || lower.includes('magnetic') || lower.includes('iconic') ||
      lower.includes('onyx') || lower.includes('stealth') || lower.includes('desert') ||
      lower.includes('copper') || lower.includes('slate')) return 'Metallic';
  if (lower.includes('black star') || lower.includes('black obsidian') || lower.includes('burning')) return 'Metallic';
  if (lower.includes('boulder') || lower.includes('summit') || lower.includes('horizon') ||
      lower.includes('outback') || lower.includes('kimberley')) return 'Metallic';
  if (lower.includes('blizzard') || lower.includes('alpine')) return 'Solid';
  if (lower.includes('midnight')) return 'Metallic';
  if (lower.includes('sunset')) return 'Metallic';
  return 'Metallic'; // default for unknown Nissan colors (most are metallic)
}

/** Determine if a color is standard (no extra cost) or premium */
function isStandardColor(name) {
  const lower = (name || '').toLowerCase();
  if (lower === 'solid white' || lower === 'alpine white' || lower === 'blizzard white') return true;
  return false;
}

/** Build Helios hero image URL (front 3/4 view, high-res) */
function buildHeliosHeroUrl(vehicle, paint, sa) {
  return `${HELIOS_BASE}?fabric=G&paint=${paint}&vehicle=${vehicle}&sa=${sa || ''}&width=2000&client=nis&brand=nisglo&pov=E01,cgd&quality=90&y=-1000&bkgnd=white`;
}

/** Build Helios gallery URLs (multiple exterior angles) */
function buildHeliosGalleryUrls(vehicle, paint, sa) {
  // Use 6 key angles instead of all 36 for storage efficiency
  const angles = ['E01', 'E06', 'E12', 'E18', 'E24', 'E30'];
  return angles.map(pov =>
    `${HELIOS_BASE}?fabric=G&paint=${paint}&vehicle=${vehicle}&sa=${sa || ''}&width=1000&client=nis&brand=nisglo&pov=${pov},cgd&quality=80&y=-1000&bkgnd=white`
  );
}

/** Validate that a Helios URL returns an actual image (not an error) */
async function validateHeliosUrl(url) {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    const contentType = resp.headers.get('content-type') || '';
    return resp.ok && contentType.startsWith('image/');
  } catch {
    return false;
  }
}

/** Get swatch URL from icon path */
function getSwatchUrl(colour) {
  if (!colour.icon) return null;
  return NISSAN_DAM + colour.icon;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Main ─────────────────────────────────────────── */

console.log('=== Nissan Australia Color Seed (Helios) ===\n');

// Step 1: Load existing products
console.log('--- Step 1: Load existing Nissan products ---');
const { data: products, error: prodErr } = await supabase
  .from('products')
  .select('id, external_key, title, meta_json')
  .eq('oem_id', OEM_ID)
  .not('external_key', 'is', null);

if (prodErr) { console.error('Product query error:', prodErr.message); process.exit(1); }
console.log(`  Loaded ${products.length} Nissan products\n`);

// Group products by model_code
const productsByModelCode = {};
for (const p of products) {
  const mc = p.meta_json?.model_code;
  if (!mc) continue;
  if (!productsByModelCode[mc]) productsByModelCode[mc] = [];
  productsByModelCode[mc].push(p);
}
console.log('  Products by model_code:');
for (const [mc, prods] of Object.entries(productsByModelCode)) {
  console.log(`    ${mc}: ${prods.length} products (${prods.map(p => p.meta_json?.grade).join(', ')})`);
}

// Build helios lookup by model_code
const heliosByModelCode = {};
for (const model of AEM_MODELS) {
  heliosByModelCode[model.modelCode] = model.helios;
}
// Juke: version-explorer returns 30113 but products use 30304
heliosByModelCode['30304'] = heliosByModelCode['30304'] || AEM_MODELS.find(m => m.slug === 'juke').helios;
heliosByModelCode['30316'] = NAVARA_MY26_HELIOS;

// Step 2: Delete existing Nissan variant_colors
console.log('\n--- Step 2: Clean existing Nissan variant_colors ---');
const productIds = products.map(p => p.id);
if (productIds.length > 0) {
  const { error: delErr, count: delCount } = await supabase
    .from('variant_colors')
    .delete({ count: 'exact' })
    .in('product_id', productIds);
  if (delErr) console.error('  Delete error:', delErr.message);
  else console.log(`  Deleted ${delCount || 0} existing variant_colors`);
}

// Step 3: Fetch AEM version-explorer color data for each model
console.log('\n--- Step 3: Fetch color data from version-explorer ---');
const BASE_URL = 'https://www.nissan.com.au/content/nissan_prod/en_AU/index/vehicles/browse-range';

const colorsByModelCode = {};

for (const model of AEM_MODELS) {
  const url = `${BASE_URL}/${model.slug}/version-explorer/jcr:content/core.versionexplorerdata.json`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.log(`  ${model.slug}: HTTP ${resp.status}`);
      continue;
    }
    const data = await resp.json();
    const actualModelCode = data.general?.modelCode;
    const colours = data.exteriorColours?.colours || [];

    const mc = actualModelCode || model.modelCode;
    colorsByModelCode[mc] = colours;

    console.log(`  ${model.slug} (code=${mc}): ${colours.length} colours`);
    for (const c of colours) {
      console.log(`    ${c.key} - ${c.name}`);
    }
  } catch (err) {
    console.log(`  ${model.slug}: ERROR ${err.message}`);
  }
  await sleep(300);
}

// Add Navara MY26 (30316) manually
console.log('\n  Navara MY26 (code=30316): 8 colours (Storyblok microsite)');
const navMy26Colours = NAVARA_MY26_COLORS.map((c, i) => ({
  key: slugify(c.name),
  name: c.name,
  hexCode: c.hexCode,
  icon: null,
  _isStoryblok: true,
}));
colorsByModelCode['30316'] = navMy26Colours;
for (const c of navMy26Colours) {
  console.log(`    ${c.key} - ${c.name} (${c.hexCode})`);
}

// Handle Juke model code mismatch: version-explorer returns 30113 but products have 30304
if (colorsByModelCode['30113'] && !colorsByModelCode['30304']) {
  console.log('\n  Remapping Juke colors: 30113 -> 30304 (version-explorer vs product model codes)');
  colorsByModelCode['30304'] = colorsByModelCode['30113'];
  delete colorsByModelCode['30113'];
}

// Step 4: Validate Helios for one color per model
console.log('\n--- Step 4: Validate Helios renders per model ---');
const heliosValidated = {};

for (const [modelCode, colours] of Object.entries(colorsByModelCode)) {
  const helios = heliosByModelCode[modelCode];
  if (!helios || !helios.vehicle) {
    console.log(`  ${modelCode}: no Helios config, skipping validation`);
    heliosValidated[modelCode] = false;
    continue;
  }

  // Test with first color's paint code
  const testPaint = colours[0]?.key;
  if (!testPaint) {
    heliosValidated[modelCode] = false;
    continue;
  }

  const testUrl = buildHeliosHeroUrl(helios.vehicle, testPaint, helios.sa);
  const valid = await validateHeliosUrl(testUrl);
  heliosValidated[modelCode] = valid;
  console.log(`  ${modelCode} (paint=${testPaint}): ${valid ? 'OK' : 'FAILED (will use swatch fallback)'}`);
  await sleep(200);
}

// Step 5: Build variant_colors rows
console.log('\n--- Step 5: Build variant_colors rows ---');

const colorRows = [];
let heliosCount = 0;
let fallbackCount = 0;

for (const [modelCode, colours] of Object.entries(colorsByModelCode)) {
  const prods = productsByModelCode[modelCode];
  if (!prods || prods.length === 0) {
    console.log(`  Model code ${modelCode}: no matching products in DB, skipping`);
    continue;
  }

  const helios = heliosByModelCode[modelCode];
  const useHelios = heliosValidated[modelCode] && helios?.vehicle;

  for (const product of prods) {
    for (let i = 0; i < colours.length; i++) {
      const colour = colours[i];
      const paintCode = colour.key; // AEM paint code (e.g., KAD, NBL)
      const hexCode = (colour.hexCode || '').replace(/^#?/, '#');

      let heroUrl = null;
      let galleryUrls = null;

      if (useHelios && paintCode && !colour._isStoryblok) {
        heroUrl = buildHeliosHeroUrl(helios.vehicle, paintCode, helios.sa);
        galleryUrls = buildHeliosGalleryUrls(helios.vehicle, paintCode, helios.sa);
        heliosCount++;
      } else {
        fallbackCount++;
      }

      colorRows.push({
        product_id: product.id,
        color_code: slugify(colour.name),
        color_name: colour.name.replace(/\s*[\u2070-\u209f\u00b9\u00b2\u00b3]+\s*$/g, '').replace(/\(\d+\)/g, '').replace(/\u207d[^\u207e]*\u207e/g, '').trim(),
        color_type: deriveColorType(colour.name),
        is_standard: isStandardColor(colour.name),
        price_delta: 0,
        swatch_url: colour._isStoryblok ? null : getSwatchUrl(colour),
        hero_image_url: heroUrl,
        gallery_urls: galleryUrls,
        sort_order: i,
      });
    }
  }

  console.log(`  Model code ${modelCode}: ${colours.length} colours x ${prods.length} products = ${colours.length * prods.length} rows (${useHelios ? 'Helios' : 'no renders'})`);
}

console.log(`\n  Total variant_colors to insert: ${colorRows.length}`);
console.log(`  Helios renders: ${heliosCount}, No renders: ${fallbackCount}`);

// Step 6: Insert in batches
console.log('\n--- Step 6: Insert variant_colors ---');

let insertedCount = 0;
const BATCH_SIZE = 200;

for (let i = 0; i < colorRows.length; i += BATCH_SIZE) {
  const batch = colorRows.slice(i, i + BATCH_SIZE);
  const { error } = await supabase.from('variant_colors').insert(batch);
  if (error) {
    console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
    if (error.message.includes('duplicate')) {
      const dup = batch[0];
      console.error(`    First row: product_id=${dup.product_id}, color_code=${dup.color_code}`);
    }
  } else {
    insertedCount += batch.length;
  }
}

console.log(`  Inserted ${insertedCount} of ${colorRows.length} variant_colors`);

// Step 7: Verification
console.log('\n--- Step 7: Verification ---');

const { count: totalColors } = await supabase
  .from('variant_colors')
  .select('id', { count: 'exact', head: true })
  .in('product_id', productIds);

const { count: withSwatch } = await supabase
  .from('variant_colors')
  .select('id', { count: 'exact', head: true })
  .in('product_id', productIds)
  .not('swatch_url', 'is', null);

const { count: withHero } = await supabase
  .from('variant_colors')
  .select('id', { count: 'exact', head: true })
  .in('product_id', productIds)
  .not('hero_image_url', 'is', null);

const { count: withGallery } = await supabase
  .from('variant_colors')
  .select('id', { count: 'exact', head: true })
  .in('product_id', productIds)
  .not('gallery_urls', 'is', null);

console.log(`  Total Nissan variant_colors: ${totalColors}`);
console.log(`  With swatch_url:     ${withSwatch} (${totalColors ? ((withSwatch/totalColors)*100).toFixed(1) : 0}%)`);
console.log(`  With hero_image_url: ${withHero} (${totalColors ? ((withHero/totalColors)*100).toFixed(1) : 0}%)`);
console.log(`  With gallery_urls:   ${withGallery} (${totalColors ? ((withGallery/totalColors)*100).toFixed(1) : 0}%)`);

// Sample output
const { data: samples } = await supabase
  .from('variant_colors')
  .select('color_code, color_name, color_type, is_standard, swatch_url, hero_image_url, sort_order, product_id')
  .in('product_id', productIds)
  .order('sort_order')
  .limit(10);

console.log('\n  Sample rows:');
for (const s of (samples || [])) {
  const product = products.find(p => p.id === s.product_id);
  const swatch = s.swatch_url ? 'swatch' : '      ';
  const hero = s.hero_image_url ? 'hero' : '    ';
  const std = s.is_standard ? 'STD' : '   ';
  console.log(`    [${s.sort_order}] ${s.color_code.padEnd(40)} ${s.color_type.padEnd(10)} ${std} ${swatch} ${hero} | ${product?.title}`);
}

// Sample hero URL for manual verification
const sampleWithHero = (samples || []).find(s => s.hero_image_url);
if (sampleWithHero) {
  console.log('\n  Sample Helios hero URL (verify in browser):');
  console.log(`  ${sampleWithHero.hero_image_url}`);
}

// Count by model
console.log('\n  Colors per model code:');
for (const [mc, prods] of Object.entries(productsByModelCode)) {
  const pids = prods.map(p => p.id);
  const { count } = await supabase
    .from('variant_colors')
    .select('id', { count: 'exact', head: true })
    .in('product_id', pids);
  const modelName = prods[0]?.title?.replace(/\s+(ST|SL|Ti|P4X|NISMO|Z|N-DESIGN|Advance|Engage|Evolve|N-Sport).*$/, '') || mc;
  console.log(`    ${mc} (${modelName}): ${count} colors`);
}

console.log('\n=== NISSAN COLOR SEED COMPLETE ===');
