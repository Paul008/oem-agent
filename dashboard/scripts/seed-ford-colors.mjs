#!/usr/bin/env node
/**
 * Ford variant_colors replacement via GPAS reference data
 *
 * Source: OEM-variants-main/data/ford/ford-variant-data.json (primary, 52 variants)
 *       + OEM-variants-main/data/ford/ford-color-guids.json  (fallback, 86 variants)
 * Strategy: Delete existing colors, insert correct GPAS colors
 * with swatches, heroes, and multi-angle galleries.
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const PROXY_BASE = 'https://oem-agent.adme-dev.workers.dev/media/ford-au/';

function encodeUrl(url) {
  return Buffer.from(url).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function proxyUrl(url) {
  if (!url) return null;
  return PROXY_BASE + encodeUrl(url);
}

function norm(s) {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ').toLowerCase().trim();
}

function deriveColorType(name) {
  const n = name.toLowerCase();
  if (n.includes('pearl')) return 'pearl';
  if (n.includes('metallic') || n.includes('mica')) return 'metallic';
  if (n.includes('matte')) return 'matte';
  return 'solid';
}

// ── Load reference data (both sources) ────────────────────────────────────
const VDATA_PATH = '/Users/paulgiurin/Downloads/OEM-variants-main/data/ford/ford-variant-data.json';
const GUIDS_PATH = '/Users/paulgiurin/Downloads/OEM-variants-main/data/ford/ford-color-guids.json';

const vdata = JSON.parse(fs.readFileSync(VDATA_PATH, 'utf-8'));
const guids = JSON.parse(fs.readFileSync(GUIDS_PATH, 'utf-8'));

console.log('=== Ford Color Replacement (Combined Sources) ===\n');
console.log(`variant-data: ${vdata.variants.length} variants, ${vdata.metadata.totalColors} colors`);
console.log(`color-guids:  ${Object.keys(guids.variants).length} variants, ${guids.metadata.totalColors} colors\n`);

// ── Build unified lookup: model → grade → {colors[], source} ──────────────
// Prefer variant-data (cleaner, more gallery) but fall back to guids
const modelMap = new Map(); // model → Map(grade → {colors, source, galleryCount})

// Normalize a color entry to unified format
function normalizeVdataColor(vc) {
  return {
    colorName: vc.exterior_colour_name,
    paintCode: vc.exterior_colour_code,
    premiumPrice: vc.colour_price_additional || 0,
    heroUrl: vc.main_photo_url,
    swatchUrl: vc.swatch_image_url,
    galleryUrls: vc.photos || [],
  };
}

function normalizeGuidsColor(gc) {
  const gallery = (gc.galleryImages || []).map(gi => gi.fullUrl).filter(Boolean);
  return {
    colorName: gc.colorName,
    paintCode: gc.paintCode,
    premiumPrice: gc.premiumPrice || 0,
    heroUrl: gc.imageUrl,
    swatchUrl: gc.swatchUrl,
    galleryUrls: gallery,
  };
}

function addToMap(model, grade, colors, source) {
  if (!modelMap.has(model)) modelMap.set(model, new Map());
  const gradeMap = modelMap.get(model);
  const existing = gradeMap.get(grade);
  // Prefer more gallery images, then more colors
  const maxGallery = Math.max(0, ...colors.map(c => c.galleryUrls.length));
  const existingMax = existing ? Math.max(0, ...existing.colors.map(c => c.galleryUrls.length)) : 0;
  if (!existing || maxGallery > existingMax || (maxGallery === existingMax && colors.length > existing.colors.length)) {
    gradeMap.set(grade, { colors, source });
  }
}

// Load variant-data first (primary)
for (const v of vdata.variants) {
  const model = norm(v.model);
  const grade = norm(v.badge);
  const colors = v.variants.map(normalizeVdataColor);
  addToMap(model, grade, colors, 'vdata');
}

// Load guids as fallback
for (const [, v] of Object.entries(guids.variants)) {
  const model = norm(v.model);
  const grade = norm(v.grade);
  const colors = v.colors.map(normalizeGuidsColor);
  addToMap(model, grade, colors, 'guids');
}

// ── Matching logic ────────────────────────────────────────────────────────

// DB title → { model, grade } extraction
const MODEL_NAMES = [
  'Ranger Super Duty', 'Ranger Hybrid', 'Transit Custom PHEV',
  'Transit Custom', 'Tourneo Custom', 'Mustang Mach-E',
  'E-Transit Custom', 'E-Transit', 'Transit Bus', 'Transit Cab Chassis',
  'Transit Van', 'Ranger', 'Everest', 'Mustang', 'Tourneo', 'Transit', 'F-150', 'Puma',
];

function parseProductTitle(title) {
  const clean = title.replace(/^Ford\s+/i, '').trim();
  for (const model of MODEL_NAMES) {
    if (clean.toLowerCase().startsWith(model.toLowerCase())) {
      const grade = clean.slice(model.length).trim();
      return { model: norm(model), grade: norm(grade) };
    }
  }
  return { model: norm(clean), grade: '' };
}

// Grade aliases: DB grade → reference grade
const GRADE_ALIASES = {
  'gt fastback': 'gt',
  'gt convertible': 'gt',
  'dark horse': 'gt',       // Closest Mustang match
  'wildtrak': 'wildtrak',
  'stormtrak': 'stormtrak',
  'super duty xl': 'super duty',
  'super duty xlt': 'super duty xlt',
};

// Model aliases: DB model → reference model
const MODEL_ALIASES = {
  'tourneo custom': 'tourneo',
  'transit custom phev': 'transit custom',
  'e transit custom': 'transit custom',
  'e transit': 'transit custom',         // Best available match
  'transit bus': 'transit custom',
  'transit cab chassis': 'transit custom',
  'transit van': 'transit custom',
};

function findVariant(rawModel, rawGrade) {
  // Try direct model match first
  let model = rawModel;
  let grade = rawGrade;

  // Apply model aliases
  if (MODEL_ALIASES[model]) model = MODEL_ALIASES[model];

  const gradeMap = modelMap.get(model);
  if (!gradeMap) return null;

  // Apply grade aliases
  if (GRADE_ALIASES[grade]) grade = GRADE_ALIASES[grade];

  // Direct grade match
  if (grade && gradeMap.has(grade)) return gradeMap.get(grade);

  // "Active" in DB → "Active" in ref (Tourneo)
  if (grade && gradeMap.has(grade.split(/\s+/).pop())) {
    return gradeMap.get(grade.split(/\s+/).pop());
  }

  // Prefix match: "sport van" starts with "sport"
  if (grade) {
    for (const [refGrade, entry] of gradeMap) {
      if (grade.startsWith(refGrade) || refGrade.startsWith(grade)) return entry;
    }
    // Single word match
    for (const w of grade.split(/\s+/)) {
      if (w.length > 2 && gradeMap.has(w)) return gradeMap.get(w);
    }
  }

  // Fallback: most colors with best gallery
  let best = null, bestScore = 0;
  for (const entry of gradeMap.values()) {
    const maxGallery = Math.max(0, ...entry.colors.map(c => c.galleryUrls.length));
    const score = entry.colors.length * 100 + maxGallery;
    if (score > bestScore) { best = entry; bestScore = score; }
  }
  return best;
}

// ── Load DB data ──────────────────────────────────────────────────────────
const { data: products } = await sb.from('products')
  .select('id, title, external_key, variant_name')
  .eq('oem_id', 'ford-au');

console.log(`DB products: ${products.length}\n`);

// ── Process each product ──────────────────────────────────────────────────
let matchedProducts = 0, unmatchedProducts = 0, totalDeleted = 0, totalInserted = 0;
const unmatched = [];

for (const product of products) {
  const { model, grade } = parseProductTitle(product.title);
  const entry = findVariant(model, grade);

  if (!entry) {
    unmatchedProducts++;
    unmatched.push({ title: product.title, key: `${model}|${grade}` });
    continue;
  }

  matchedProducts++;

  // Delete existing variant_colors for this product
  const { data: existing } = await sb.from('variant_colors')
    .select('id')
    .eq('product_id', product.id);

  if (existing && existing.length > 0) {
    const { error: delErr } = await sb.from('variant_colors')
      .delete()
      .eq('product_id', product.id);
    if (delErr) {
      console.log(`  ERROR deleting colors for ${product.title}: ${delErr.message}`);
      continue;
    }
    totalDeleted += existing.length;
  }

  // Insert new colors
  const newColors = entry.colors.map((c, idx) => {
    const gallery = [...c.galleryUrls];
    // Ensure hero is first in gallery
    if (c.heroUrl && !gallery.includes(c.heroUrl)) {
      gallery.unshift(c.heroUrl);
    }

    return {
      product_id: product.id,
      color_code: c.paintCode || c.colorName.toLowerCase().replace(/\s+/g, '-'),
      color_name: c.colorName,
      color_type: deriveColorType(c.colorName),
      is_standard: c.premiumPrice === 0,
      price_delta: c.premiumPrice,
      swatch_url: c.swatchUrl ? proxyUrl(c.swatchUrl) : null,
      hero_image_url: c.heroUrl ? proxyUrl(c.heroUrl) : null,
      gallery_urls: gallery.length > 0 ? gallery.map(u => proxyUrl(u)) : [],
      sort_order: idx,
    };
  });

  if (newColors.length > 0) {
    const { error: insErr } = await sb.from('variant_colors').insert(newColors);
    if (insErr) {
      console.log(`  ERROR inserting ${newColors.length} colors for ${product.title}: ${insErr.message}`);
    } else {
      totalInserted += newColors.length;
      console.log(`  ${product.title.padEnd(45)} ${String(existing?.length || 0).padStart(2)} → ${String(newColors.length).padStart(2)} colors (${newColors[0].gallery_urls.length} gallery) [${entry.source}]`);
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────
console.log('\n=== Results ===\n');
console.log(`  Products matched:   ${matchedProducts}/${products.length}`);
console.log(`  Products unmatched: ${unmatchedProducts}`);
console.log(`  Colors deleted:     ${totalDeleted}`);
console.log(`  Colors inserted:    ${totalInserted}`);

if (unmatched.length > 0) {
  console.log('\n  Unmatched products:');
  for (const u of unmatched) {
    console.log(`    ${u.title.padEnd(45)} key: ${u.key}`);
  }
}

// ── Verify coverage ──────────────────────────────────────────────────────
const { data: allColors } = await sb.from('variant_colors')
  .select('hero_image_url, gallery_urls, swatch_url')
  .in('product_id', products.map(p => p.id));

const heroCount = allColors.filter(c => c.hero_image_url).length;
const galleryCount = allColors.filter(c => c.gallery_urls?.length > 0).length;
const swatchCount = allColors.filter(c => c.swatch_url).length;

console.log(`\n=== Post-update coverage ===`);
console.log(`  Total:            ${allColors.length}`);
console.log(`  Hero:             ${heroCount} (${(100*heroCount/allColors.length).toFixed(1)}%)`);
console.log(`  Gallery:          ${galleryCount} (${(100*galleryCount/allColors.length).toFixed(1)}%)`);
console.log(`  Swatch:           ${swatchCount} (${(100*swatchCount/allColors.length).toFixed(1)}%)`);

const gallerySizes = allColors.filter(c => c.gallery_urls?.length > 0).map(c => c.gallery_urls.length);
if (gallerySizes.length > 0) {
  console.log(`  Gallery sizes:    min=${Math.min(...gallerySizes)} max=${Math.max(...gallerySizes)} avg=${(gallerySizes.reduce((a,b)=>a+b)/gallerySizes.length).toFixed(1)}`);
}
