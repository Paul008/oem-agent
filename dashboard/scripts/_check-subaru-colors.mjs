import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

// First, discover product columns
const { data: sample, error: sErr } = await sb.from('products').select('*').eq('oem_id', 'subaru-au').limit(1);
if (sErr) { console.error('Sample error:', sErr); process.exit(1); }
console.log('Product columns:', Object.keys(sample[0]));

// Get Subaru products
const { data: products, error: pErr } = await sb.from('products').select('id, external_key').eq('oem_id', 'subaru-au');
if (pErr) { console.error('Products error:', pErr); process.exit(1); }
const pids = products.map(p => p.id);
console.log(`Products: ${products.length}`);

// Get Subaru colors with image stats
const { data: colors, error: cErr } = await sb.from('variant_colors')
  .select('id, color_name, swatch_url, hero_image_url, gallery_urls, product_id')
  .in('product_id', pids);
if (cErr) { console.error('Colors error:', cErr); process.exit(1); }

console.log(`\nTotal colors: ${colors.length}`);

let swatch = 0, hero = 0, gallery = 0, noHero = [];
for (const c of colors) {
  if (c.swatch_url) swatch++;
  if (c.hero_image_url) hero++;
  if (c.gallery_urls && c.gallery_urls.length > 0) gallery++;
  else noHero.push(c);
}
console.log(`Swatch: ${swatch}, Hero: ${hero}, Gallery: ${gallery}`);

// Show sample with hero
const withHero = colors.filter(c => c.hero_image_url);
console.log('\nSample heroes:');
for (const c of withHero.slice(0, 5)) {
  console.log(`  ${c.color_name}: ${c.hero_image_url}`);
}

// Show sample without hero
const noHeroColors = colors.filter(c => !c.hero_image_url);
console.log(`\nColors without hero (${noHeroColors.length}):`);
for (const c of noHeroColors.slice(0, 5)) {
  console.log(`  ${c.color_name} (product_id: ${c.product_id})`);
}

// Verify a few hero URLs actually work
console.log('\nVerifying 5 random hero URLs...');
for (const c of withHero.slice(0, 5)) {
  try {
    const r = await fetch(c.hero_image_url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const ct = r.headers.get('content-type') || '';
    console.log(`  ${r.ok ? '✅' : '❌'} ${c.color_name}: ${r.status} ${ct}`);
  } catch (e) {
    console.log(`  ❌ ${c.color_name}: ${e.message}`);
  }
}
