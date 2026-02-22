#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

// First get Kia products
const { data: products, error: prodErr } = await sb.from('products')
  .select('id, title, model_id')
  .eq('oem_id', 'kia-au');

if (prodErr) { console.error('Product error:', prodErr.message); process.exit(1); }
console.log(`Loaded ${products.length} Kia products`);

const productIds = products.map(p => p.id);

// Get colors for those products (variant_colors links via product_id, not oem_id)
const { data: colors, error: colErr } = await sb.from('variant_colors')
  .select('id, color_name, color_code, hero_image_url, swatch_url, product_id')
  .in('product_id', productIds)
  .order('color_name');

if (colErr) { console.error('Color error:', colErr.message); process.exit(1); }

const { data: models } = await sb.from('vehicle_models')
  .select('id, name, slug')
  .eq('oem_id', 'kia-au');

const modelMap = Object.fromEntries(models.map(m => [m.id, m]));
const prodMap = Object.fromEntries(products.map(p => [p.id, p]));

const total = colors.length;
const withHero = colors.filter(c => c.hero_image_url).length;
const withSwatch = colors.filter(c => c.swatch_url).length;
console.log('=== DB Stats ===');
console.log(`Total variant_colors: ${total}`);
console.log(`With hero_image_url: ${withHero}`);
console.log(`With swatch_url: ${withSwatch}`);

// Group by model slug
const byModel = {};
for (const c of colors) {
  const prod = prodMap[c.product_id];
  const model = prod ? modelMap[prod.model_id] : null;
  const slug = model?.slug || 'unknown';
  if (byModel[slug] === undefined) byModel[slug] = { colors: {}, count: 0, heroes: 0 };
  byModel[slug].count++;
  if (c.hero_image_url) byModel[slug].heroes++;
  // Track unique color names with their codes
  const key = c.color_name;
  if (byModel[slug].colors[key] === undefined) {
    byModel[slug].colors[key] = c.color_code;
  }
}

console.log('\n=== Colors by Model (slug: rows, unique colors, current heroes) ===');
for (const [slug, data] of Object.entries(byModel).sort((a,b) => a[0].localeCompare(b[0]))) {
  const uniqueCount = Object.keys(data.colors).length;
  console.log(`\n${slug} — ${data.count} rows, ${uniqueCount} unique colors, ${data.heroes} heroes`);
  for (const [name, code] of Object.entries(data.colors).sort((a,b) => a[0].localeCompare(b[0]))) {
    // Slugify the name for matching
    const nameSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    console.log(`  ${code.padEnd(6)} ${name.padEnd(35)} → ${nameSlug}`);
  }
}
