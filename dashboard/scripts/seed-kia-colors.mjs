#!/usr/bin/env node
/**
 * Enrich Kia AU variant_colors with 360 hero images and gallery from KWCMS CDN.
 *
 * Strategy:
 * 1. Scrape model pages → find all 360 render URLs (frame _00000 = hero)
 * 2. Color slug = parent directory of filename in the CDN path
 * 3. Match DB colors by slugified name
 * 4. For unmatched colors, CDN probe by replacing the color slug in a known URL
 * 5. Store hero_image_url and gallery_urls (6 key angles from 36 frames)
 *
 * Kia 360 CDN pattern:
 *   .../showroom/{folder}/{type}[/extra]/{color-slug}/{filename}_NNNNN.{ext}
 *   Frames: _00000 through _00035 (36 total)
 *
 * Run: cd dashboard/scripts && node seed-kia-colors.mjs
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const KIA_BASE = 'https://www.kia.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,image/webp,image/png,*/*',
};

const MODEL_PAGES = [
  'seltos', 'sportage', 'sorento', 'carnival',
  'ev6', 'ev9', 'cerato', 'picanto', 'stonic',
  'k4', 'ev5', 'ev3', 'ev4', 'tasman',
];

// DB model slug → CDN model page name
const SLUG_TO_CDN = {
  'carnival-hybrid': 'carnival',
  'sorento-hybrid': 'sorento',
  'sorento-plug-in-hybrid': 'sorento',
  'sportage-hybrid': 'sportage',
  'k4-hatch': 'k4',
  'k4-sedan': 'k4',
  'niro-ev': 'niro',
  'niro-hybrid': 'niro',
};

// EV6 page has no 360 renders in HTML, but CDN has them at ev6-pe/360vr/
// Manually inject the template so CDN probing works
const MANUAL_CDN_DATA = {
  'ev6': {
    templateUrl: KIA_BASE + '/content/dam/kwcms/au/en/images/showroom/ev6-pe/360vr/snow-white-pearl/Kia-ev6-gt-snow-white-pearl_00000.png',
    templateSlug: 'snow-white-pearl',
  },
};

// KWCMS CDN filename overrides — where directory slug differs from filename slug
// e.g. K4 uses British "grey" in directory but American "gray" in filename
const FILENAME_OVERRIDES = {
  'steel-grey': 'steel-gray',
  'interstellar-grey': 'interstellar-gray',
  'wave-blue': 'wavy-blue',
};

// Known render type/directory names to exclude from color slugs
const RENDER_TYPE_DIRS = new Set([
  'exterior', 'interior', '360vr', '360VR', 'exterior360',
  'Features', 'features', 'color-chip',
]);

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function safeFetch(url, timeout = 10000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: HEADERS });
    clearTimeout(t);
    return r;
  } catch { clearTimeout(t); return null; }
}

async function headCheck(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 5000);
  try {
    const r = await fetch(url, { method: 'HEAD', signal: c.signal, headers: HEADERS });
    clearTimeout(t);
    if (!r.ok) return false;
    const ct = r.headers.get('content-type') || '';
    const size = parseInt(r.headers.get('content-length') || '0');
    return ct.startsWith('image/') && size > 5000;
  } catch { clearTimeout(t); return false; }
}

function buildGalleryUrls(heroUrl) {
  // 6 key angles from 36 frames (every 60°)
  return [0, 6, 12, 18, 24, 30].map(i =>
    heroUrl.replace(/_00000\./, `_${String(i).padStart(5, '0')}.`)
  );
}

// ═══════════════════════════════════════════════════════
// Phase 1: Scrape model pages → discover 360 render URLs
// ═══════════════════════════════════════════════════════
console.log('=== Phase 1: Discover 360 renders from model pages ===\n');

// model → { heroMap: {colorSlug: url}, templateUrl: string, templateSlug: string }
const cdnData = {};

for (const model of MODEL_PAGES) {
  const url = `${KIA_BASE}/au/cars/${model}.html`;
  const r = await safeFetch(url, 15000);
  if (!r || !r.ok) { console.log(`  ❌ ${model}: ${r?.status || 'timeout'}`); continue; }
  const html = await r.text();

  // Find ALL _00000 frame URLs in the page (showroom CDN paths)
  const frameRegex = /(?:"|')(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"']*?_00000\.(?:png|webp|jpg))(?:"|')/gi;
  const heroMap = {};
  let m;

  while ((m = frameRegex.exec(html)) !== null) {
    const fullUrl = KIA_BASE + m[1];
    const pathParts = m[1].split('/');
    // Color slug = parent directory of the filename
    const colorSlug = pathParts[pathParts.length - 2].toLowerCase();

    // Skip render type directories that aren't colors
    if (RENDER_TYPE_DIRS.has(colorSlug)) continue;
    // Skip paths that look like feature images
    if (colorSlug.includes('feature') || colorSlug.includes('chip')) continue;

    if (!heroMap[colorSlug]) {
      heroMap[colorSlug] = fullUrl;
    }
  }

  // Pick best template URL for CDN probing (prefer non-two-tone, common color)
  let templateUrl = null;
  let templateSlug = null;
  const preferredColors = ['clear-white', 'snow-white-pearl', 'aurora-black-pearl', 'fusion-black', 'steel-grey'];
  for (const pref of preferredColors) {
    if (heroMap[pref]) { templateUrl = heroMap[pref]; templateSlug = pref; break; }
  }
  // Fallback: any non-two-tone entry
  if (!templateUrl) {
    const entry = Object.entries(heroMap).find(([s]) =>
      !s.includes('roof') && !s.includes('two-tone') && !s.includes('hatch') && !s.includes('sedan')
    );
    if (entry) { templateSlug = entry[0]; templateUrl = entry[1]; }
  }

  cdnData[model] = { heroMap, templateUrl, templateSlug };
  console.log(`  ✅ ${model}: ${Object.keys(heroMap).length} colors found`);
  for (const slug of Object.keys(heroMap)) {
    console.log(`     ${slug}`);
  }
  if (templateUrl) {
    console.log(`     template: ${templateSlug} → ...${templateUrl.split('/showroom/')[1]}`);
  }
}

// Inject manual CDN data for models where page scraping finds nothing
for (const [model, manual] of Object.entries(MANUAL_CDN_DATA)) {
  if (!cdnData[model] || (!cdnData[model].templateUrl && Object.keys(cdnData[model].heroMap).length === 0)) {
    cdnData[model] = { heroMap: {}, templateUrl: manual.templateUrl, templateSlug: manual.templateSlug };
    console.log(`  📌 ${model}: manual CDN template injected → ${manual.templateSlug}`);
  }
}

// ═══════════════════════════════════════════════════════
// Phase 2: Load DB data
// ═══════════════════════════════════════════════════════
console.log('\n=== Phase 2: Load DB data ===\n');

const { data: products } = await sb
  .from('products')
  .select('id, title, model_id, meta_json')
  .eq('oem_id', 'kia-au');
console.log(`  ${products.length} products`);

const { data: models } = await sb
  .from('vehicle_models')
  .select('id, slug, name')
  .eq('oem_id', 'kia-au');
console.log(`  ${models.length} models`);

const modelMap = Object.fromEntries(models.map(m => [m.id, m]));

// Load ALL Kia variant_colors
const productIds = products.map(p => p.id);
let allColors = [];
for (let i = 0; i < productIds.length; i += 100) {
  const batch = productIds.slice(i, i + 100);
  const { data } = await sb
    .from('variant_colors')
    .select('id, product_id, color_code, color_name, hero_image_url, gallery_urls, swatch_url')
    .in('product_id', batch);
  if (data) allColors = allColors.concat(data);
}
console.log(`  ${allColors.length} variant_colors`);

// Build product_id → CDN model key
const productToCdn = {};
for (const p of products) {
  const model = modelMap[p.model_id];
  if (!model) continue;
  const baseSlug = model.slug.replace(/-\d{4}$/, '');
  productToCdn[p.id] = SLUG_TO_CDN[baseSlug] || baseSlug;
}

// ═══════════════════════════════════════════════════════
// Phase 3: Match + CDN probe
// ═══════════════════════════════════════════════════════
console.log('\n=== Phase 3: Match colors & CDN probe ===\n');

// Cache: "model:colorSlug" → heroUrl | null (avoids duplicate probes)
const probeCache = new Map();
let matchedDirect = 0, matchedVariation = 0, matchedProbe = 0, noMatch = 0;
let updatedCount = 0, alreadyHad = 0;

// Group colors by (cdnModel, colorSlug) for efficient probing
const colorsByModel = new Map(); // cdnModel → [{vc, colorSlug}]
for (const vc of allColors) {
  const cdnModel = productToCdn[vc.product_id];
  if (!cdnModel) continue;
  const colorSlug = slugify(vc.color_name);
  if (!colorsByModel.has(cdnModel)) colorsByModel.set(cdnModel, new Map());
  const modelColors = colorsByModel.get(cdnModel);
  if (!modelColors.has(colorSlug)) modelColors.set(colorSlug, []);
  modelColors.get(colorSlug).push(vc);
}

for (const [cdnModel, colorMap] of colorsByModel) {
  const data = cdnData[cdnModel];
  if (!data) {
    // No CDN data for this model
    for (const vcs of colorMap.values()) noMatch += vcs.length;
    continue;
  }

  const { heroMap, templateUrl, templateSlug } = data;

  for (const [colorSlug, vcs] of colorMap) {
    // 1. Direct match from scraped data
    let heroUrl = heroMap[colorSlug];
    let matchType = 'direct';

    // 2. Variation matching
    if (!heroUrl) {
      const variations = [
        colorSlug.replace(/-pearl$/, ''),
        colorSlug.replace(/-metallic$/, ''),
        colorSlug.replace(/-matte$/, ''),
        colorSlug.replace(/-matt$/, ''),
        colorSlug + '-pearl',
        colorSlug + '-metallic',
      ];
      for (const v of variations) {
        if (v !== colorSlug && heroMap[v]) {
          heroUrl = heroMap[v];
          matchType = 'variation';
          break;
        }
      }
    }

    // 3. Partial match
    if (!heroUrl) {
      for (const [knownSlug, knownUrl] of Object.entries(heroMap)) {
        // Skip two-tone entries for matching
        if (knownSlug.includes('roof') || knownSlug.includes('two-tone')) continue;
        if (colorSlug.includes(knownSlug) || knownSlug.includes(colorSlug)) {
          heroUrl = knownUrl;
          matchType = 'partial';
          break;
        }
      }
    }

    // 4. CDN probe: replace color slug in template URL
    if (!heroUrl && templateUrl && templateSlug) {
      const cacheKey = `${cdnModel}:${colorSlug}`;
      if (probeCache.has(cacheKey)) {
        heroUrl = probeCache.get(cacheKey);
        if (heroUrl) matchType = 'probe-cached';
      } else {
        // Try the slugified name first, then variations
        const slugsToTry = [
          colorSlug,
          colorSlug.replace(/-pearl$/, ''),
          colorSlug.replace(/-metallic$/, ''),
        ];

        for (const slug of slugsToTry) {
          // Build probe URL — handle directory vs filename slug mismatches
          // Directory uses the slug as-is, filename may need an override
          const fileSlug = FILENAME_OVERRIDES[slug] || slug;
          const templateFileSlug = FILENAME_OVERRIDES[templateSlug] || templateSlug;
          let probeUrl;
          if (fileSlug !== slug) {
            // Split-replace: directory gets slug, filename gets fileSlug
            probeUrl = templateUrl
              .replace(new RegExp(`/${templateSlug}/`, 'g'), `/${slug}/`)
              .replace(new RegExp(templateFileSlug || templateSlug, 'g'), fileSlug);
          } else {
            probeUrl = templateUrl.replaceAll(templateSlug, slug);
          }
          if (probeUrl === templateUrl && slug !== colorSlug) continue; // No substitution happened (but allow exact template slug match)
          const valid = await headCheck(probeUrl);
          if (valid) {
            heroUrl = probeUrl;
            matchType = 'probe';
            console.log(`  🔍 ${cdnModel}/${colorSlug} → CDN probe hit (${slug})`);
            break;
          }
        }
        probeCache.set(cacheKey, heroUrl || null);
      }
    }

    // Update all variant_colors with this (model, colorSlug) combination
    if (heroUrl) {
      if (matchType === 'direct') matchedDirect += vcs.length;
      else if (matchType === 'variation' || matchType === 'partial') matchedVariation += vcs.length;
      else matchedProbe += vcs.length;

      const gallery = buildGalleryUrls(heroUrl);

      for (const vc of vcs) {
        // Skip if already has a valid 360 hero
        if (vc.hero_image_url && vc.hero_image_url.includes('_00000')) {
          alreadyHad++;
          continue;
        }
        const { error } = await sb.from('variant_colors')
          .update({ hero_image_url: heroUrl, gallery_urls: gallery })
          .eq('id', vc.id);
        if (!error) updatedCount++;
        else console.error(`  ❌ Update error ${vc.id}: ${error.message}`);
      }
    } else {
      noMatch += vcs.length;
    }
  }
}

// ═══════════════════════════════════════════════════════
// Phase 4: Swatch & metadata enrichment
// ═══════════════════════════════════════════════════════
console.log('\n=== Phase 4: Swatch & metadata enrichment ===\n');

let swatchUpdates = 0, typeUpdates = 0;
for (const product of products) {
  const mj = product.meta_json || {};
  const colours = mj.colours || [];
  if (!colours.length) continue;

  const { data: existingColors } = await sb
    .from('variant_colors')
    .select('id, color_code, color_name, swatch_url, color_type')
    .eq('product_id', product.id);
  if (!existingColors?.length) continue;

  for (const vc of existingColors) {
    const updates = {};
    const mjColor = colours.find(c => c.code === vc.color_code);

    if (!vc.swatch_url && mjColor?.swatch_url) {
      updates.swatch_url = mjColor.swatch_url;
      swatchUpdates++;
    }

    if (!vc.color_type || vc.color_type === 'metallic') {
      const name = (vc.color_name || '').toLowerCase();
      let newType = null;
      if (name.includes('pearl')) newType = 'pearl';
      else if (name.includes('matte') || name.includes('matt')) newType = 'matte';
      else if (name === 'clear white') newType = 'solid';
      if (newType && newType !== vc.color_type) {
        updates.color_type = newType;
        typeUpdates++;
      }
    }

    if (Object.keys(updates).length > 0) {
      await sb.from('variant_colors').update(updates).eq('id', vc.id);
    }
  }
}
console.log(`  Swatch updates: ${swatchUpdates}, type updates: ${typeUpdates}`);

// ═══════════════════════════════════════════════════════
// Phase 5: Verification
// ═══════════════════════════════════════════════════════
console.log('\n=== Phase 5: Verification ===\n');

const { count: total } = await sb.from('variant_colors')
  .select('id', { count: 'exact', head: true }).in('product_id', productIds);
const { count: withHero } = await sb.from('variant_colors')
  .select('id', { count: 'exact', head: true }).in('product_id', productIds)
  .not('hero_image_url', 'is', null);
const { count: withGallery } = await sb.from('variant_colors')
  .select('id', { count: 'exact', head: true }).in('product_id', productIds)
  .not('gallery_urls', 'is', null);
const { count: withSwatch } = await sb.from('variant_colors')
  .select('id', { count: 'exact', head: true }).in('product_id', productIds)
  .not('swatch_url', 'is', null);

console.log(`  Total Kia colors:    ${total}`);
console.log(`  With hero_image_url: ${withHero} (${((withHero/total)*100).toFixed(1)}%)`);
console.log(`  With gallery_urls:   ${withGallery} (${((withGallery/total)*100).toFixed(1)}%)`);
console.log(`  With swatch_url:     ${withSwatch} (${((withSwatch/total)*100).toFixed(1)}%)`);
console.log();
console.log(`  Matched direct:      ${matchedDirect}`);
console.log(`  Matched variation:   ${matchedVariation}`);
console.log(`  Matched CDN probe:   ${matchedProbe}`);
console.log(`  Already had 360:     ${alreadyHad}`);
console.log(`  No match:            ${noMatch}`);
console.log(`  DB updates:          ${updatedCount}`);

// Per-model breakdown
console.log('\n  Per-model coverage:');
for (const [cdnModel, colorMap] of colorsByModel) {
  let total = 0, matched = 0;
  for (const vcs of colorMap.values()) {
    total += vcs.length;
    if (vcs.some(vc => vc.hero_image_url)) matched += vcs.length;
  }
  // Re-check from DB for accuracy
  const modelProducts = products.filter(p => productToCdn[p.id] === cdnModel);
  const modelPids = modelProducts.map(p => p.id);
  if (modelPids.length === 0) continue;
  const { count: mTotal } = await sb.from('variant_colors')
    .select('id', { count: 'exact', head: true }).in('product_id', modelPids);
  const { count: mHero } = await sb.from('variant_colors')
    .select('id', { count: 'exact', head: true }).in('product_id', modelPids)
    .not('hero_image_url', 'is', null);
  console.log(`    ${cdnModel.padEnd(20)} ${mHero}/${mTotal} heroes (${((mHero/mTotal)*100).toFixed(0)}%)`);
}

// Samples
const { data: samples } = await sb.from('variant_colors')
  .select('color_code, color_name, hero_image_url, gallery_urls')
  .in('product_id', productIds)
  .not('hero_image_url', 'is', null)
  .limit(5);
console.log('\n  Samples:');
for (const s of (samples || [])) {
  const g = s.gallery_urls?.length || 0;
  console.log(`  ${(s.color_code||'?').padEnd(6)} ${s.color_name.padEnd(30)} gallery:${g}  ${s.hero_image_url?.split('/').slice(-2).join('/')}`);
}

// Show unmatched colors for debugging
console.log('\n  Unmatched colors (sample):');
const { data: unmatched } = await sb.from('variant_colors')
  .select('color_code, color_name, product_id')
  .in('product_id', productIds)
  .is('hero_image_url', null)
  .limit(15);
for (const u of (unmatched || [])) {
  const cdnModel = productToCdn[u.product_id] || '?';
  console.log(`  ${cdnModel.padEnd(15)} ${(u.color_code||'?').padEnd(6)} ${u.color_name}`);
}
