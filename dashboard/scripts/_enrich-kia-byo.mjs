#!/usr/bin/env node
/**
 * Kia BYO fallback enrichment — fill missing heroes with Build & Price images.
 * Only updates colors that currently have NO hero_image_url.
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

// Load Kia BYO color data
const byoData = JSON.parse(fs.readFileSync(
  '/Users/paulgiurin/Downloads/OEM-variants-main/data/kia/colors.json', 'utf-8'
));

// Build BYO lookup: model-slug + color-code → vehicleImgSrc
// Some trims have different vehicle images; pick one (prefer higher trim for better-looking renders)
const byoLookup = new Map(); // key: "modelSlug|colorCode" → vehicleImgSrc
const byoByName = new Map(); // key: "modelSlug|colorName" → vehicleImgSrc

for (const model of byoData.models) {
  for (const trim of model.trims) {
    for (const color of trim.colors) {
      const codeKey = `${model.modelSlug}|${color.colorCode}`;
      const nameKey = `${model.modelSlug}|${color.colorName.toLowerCase().trim()}`;
      // Always overwrite - later trims (higher grades) tend to have better renders
      if (color.vehicleImgSrc) {
        byoLookup.set(codeKey, color.vehicleImgSrc);
        byoByName.set(nameKey, color.vehicleImgSrc);
      }
      // Also store swatch
      if (color.colorImgSrc) {
        const swatchKey = `swatch|${codeKey}`;
        byoLookup.set(swatchKey, color.colorImgSrc);
      }
    }
  }
}

console.log(`BYO lookup: ${byoLookup.size} entries\n`);

// Load Kia products + models
const { data: products } = await sb.from('products')
  .select('id, title, model_id')
  .eq('oem_id', 'kia-au');

const { data: models } = await sb.from('vehicle_models')
  .select('id, slug, name')
  .eq('oem_id', 'kia-au');

const modelById = new Map(models.map(m => [m.id, m]));

// Mapping: DB model slug → BYO model slugs (BYO has more specific slugs)
const MODEL_SLUG_MAP = {
  'carnival': ['carnival', 'carnival-hybrid'],
  'sorento': ['sorento', 'sorento-hybrid', 'sorento-plug-in-hybrid'],
  'sportage': ['sportage'],
  'seltos': ['seltos'],
  'ev6': ['ev6'],
  'ev9': ['ev9'],
  'ev3': ['ev3'],
  'ev5': ['ev5'],
  'picanto': ['picanto'],
  'stonic': ['stonic'],
  'k4': [], // BYO might use "cerato"
  'niro': ['niro-ev', 'niro-hybrid'],
  'tasman': ['tasman'],
  'ev4': [], // Might not be in BYO
};

// Get colors without heroes
let totalMissing = 0, filled = 0;
const pids = products.map(p => p.id);
const { data: missing } = await sb.from('variant_colors')
  .select('id, color_name, color_code, hero_image_url, swatch_url, product_id')
  .in('product_id', pids)
  .is('hero_image_url', null);

console.log(`Colors without hero: ${missing.length}\n`);

for (const color of missing) {
  const product = products.find(p => p.id === color.product_id);
  if (!product) continue;
  const model = modelById.get(product.model_id);
  if (!model) continue;

  const byoSlugs = MODEL_SLUG_MAP[model.slug] || [model.slug];

  // Try matching by code first, then name
  let vehicleUrl = null;
  let swatchUrl = null;
  for (const slug of byoSlugs) {
    if (!vehicleUrl && color.color_code) {
      vehicleUrl = byoLookup.get(`${slug}|${color.color_code}`);
      swatchUrl = byoLookup.get(`swatch|${slug}|${color.color_code}`);
    }
    if (!vehicleUrl) {
      vehicleUrl = byoByName.get(`${slug}|${color.color_name.toLowerCase().trim()}`);
    }
  }

  if (!vehicleUrl) {
    totalMissing++;
    continue;
  }

  // Verify URL works
  try {
    const r = await fetch(vehicleUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (!r.ok) { totalMissing++; continue; }
  } catch { totalMissing++; continue; }

  const update = { hero_image_url: vehicleUrl };
  if (swatchUrl && !color.swatch_url) update.swatch_url = swatchUrl;

  const { error } = await sb.from('variant_colors').update(update).eq('id', color.id);
  if (!error) {
    filled++;
    console.log(`  ✅ ${model.slug.padEnd(12)} ${color.color_code?.padEnd(6) || '?     '} ${color.color_name}`);
  }
}

console.log(`\nFilled: ${filled}, Still missing: ${totalMissing}`);

// Final coverage
const { data: all } = await sb.from('variant_colors')
  .select('hero_image_url')
  .in('product_id', pids);
const withHero = all.filter(c => c.hero_image_url).length;
console.log(`\nKia hero coverage: ${withHero}/${all.length} (${(100*withHero/all.length).toFixed(1)}%)`);
