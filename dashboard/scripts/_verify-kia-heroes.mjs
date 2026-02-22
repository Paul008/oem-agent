#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

// Get Kia product IDs first
const { data: products } = await sb.from('products').select('id').eq('oem_id', 'kia-au');
const pids = products.map(p => p.id);

// Check a sample of Kia hero URLs to verify they return real images
const { data: samples } = await sb.from('variant_colors')
  .select('id, color_name, hero_image_url')
  .in('product_id', pids)
  .not('hero_image_url', 'is', null)
  .like('hero_image_url', '%_00000%')
  .limit(20);

console.log('Verifying 20 random Kia hero URLs...\n');
let ok = 0, broken = 0;
for (const s of samples) {
  try {
    const r = await fetch(s.hero_image_url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const ct = r.headers.get('content-type') || '';
    const size = r.headers.get('content-length') || '?';
    if (r.ok && ct.startsWith('image/')) {
      console.log(`  ✅ ${s.color_name.padEnd(25)} ${ct.padEnd(15)} ${size}b`);
      ok++;
    } else {
      console.log(`  ❌ ${s.color_name.padEnd(25)} ${r.status} ${ct}`);
      broken++;
    }
  } catch (e) {
    console.log(`  ❌ ${s.color_name.padEnd(25)} ${e.message}`);
    broken++;
  }
}
console.log(`\nResult: ${ok}/20 OK, ${broken}/20 broken`);

// Check gallery frame _00006 for a sample (verify 360 works)
console.log('\nVerifying 360 gallery frames...');
const sample360 = samples.find(s => s.hero_image_url.includes('_00000'));
if (sample360) {
  const frame6 = sample360.hero_image_url.replace(/_00000\./, '_00006.');
  const frame12 = sample360.hero_image_url.replace(/_00000\./, '_00012.');
  const frame18 = sample360.hero_image_url.replace(/_00000\./, '_00018.');
  for (const [label, url] of [['_00006', frame6], ['_00012', frame12], ['_00018', frame18]]) {
    try {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      const ct = r.headers.get('content-type') || '';
      console.log(`  ${label}: ${r.ok && ct.startsWith('image/') ? '✅' : '❌'} ${r.status} ${ct}`);
    } catch (e) {
      console.log(`  ${label}: ❌ ${e.message}`);
    }
  }
}
