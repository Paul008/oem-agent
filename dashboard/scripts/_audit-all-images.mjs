import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const OEM_IDS = [
  'ford-au','gwm-au','hyundai-au','isuzu-au','kia-au','ldv-au',
  'mazda-au','mitsubishi-au','nissan-au','subaru-au','suzuki-au',
  'toyota-au','volkswagen-au','kgm-au'
];

console.log('=== Comprehensive Image Audit ===\n');

for (const oemId of OEM_IDS) {
  const { data: products } = await sb.from('products')
    .select('id').eq('oem_id', oemId);
  if (!products || products.length === 0) {
    console.log(`${oemId.padEnd(16)} 0 products — SKIPPED`);
    continue;
  }
  const pids = products.map(p => p.id);

  // Fetch all colors in batches (Supabase limit is 1000)
  let allColors = [];
  for (let i = 0; i < pids.length; i += 50) {
    const batch = pids.slice(i, i + 50);
    const { data } = await sb.from('variant_colors')
      .select('id, hero_image_url, swatch_url, gallery_urls')
      .in('product_id', batch);
    if (data) allColors.push(...data);
  }

  const total = allColors.length;
  if (total === 0) {
    console.log(`${oemId.padEnd(16)} ${products.length} products, 0 colors`);
    continue;
  }

  const heroes = allColors.filter(c => c.hero_image_url).length;
  const swatches = allColors.filter(c => c.swatch_url).length;
  const galleries = allColors.filter(c => c.gallery_urls?.length > 0).length;

  // Sample 5 hero URLs to check if they're actually working
  const heroSamples = allColors
    .filter(c => c.hero_image_url)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  let working = 0, broken = 0, brokenUrls = [];
  for (const s of heroSamples) {
    try {
      const r = await fetch(s.hero_image_url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(8000),
        redirect: 'follow'
      });
      if (r.ok) {
        working++;
      } else {
        broken++;
        brokenUrls.push(`${r.status} ${s.hero_image_url.substring(0, 80)}`);
      }
    } catch (e) {
      broken++;
      brokenUrls.push(`ERR ${s.hero_image_url.substring(0, 80)}`);
    }
  }

  const heroStatus = heroSamples.length === 0 ? 'N/A' : 
    broken === 0 ? '✅' : `❌ ${broken}/${heroSamples.length} broken`;

  console.log(`${oemId.padEnd(16)} ${String(total).padStart(4)} colors | hero: ${String(heroes).padStart(4)} (${(100*heroes/total).toFixed(0)}%) | swatch: ${String(swatches).padStart(4)} (${(100*swatches/total).toFixed(0)}%) | gallery: ${String(galleries).padStart(4)} (${(100*galleries/total).toFixed(0)}%) | sample: ${heroStatus}`);
  
  if (brokenUrls.length > 0) {
    for (const u of brokenUrls) console.log(`    BROKEN: ${u}`);
  }
}
