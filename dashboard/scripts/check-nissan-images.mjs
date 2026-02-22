#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

// Check what Nissan APIs we have
const { data: apis } = await supabase
  .from('discovered_apis')
  .select('url, data_type, notes')
  .eq('oem_id', 'nissan-au')
  .ilike('url', '%nissan%');

console.log('=== Nissan APIs ===');
for (const api of (apis || [])) {
  console.log(api.data_type, '|', api.url.substring(0, 130));
  if (api.notes) console.log('  ', api.notes.substring(0, 200));
  console.log();
}

// Check actual hero_image_url values (original, before media proxy)
const { data: colors } = await supabase
  .from('variant_colors')
  .select('color_name, swatch_url, hero_image_url, gallery_urls, product_id')
  .in('product_id', (
    await supabase.from('products').select('id').eq('oem_id', 'nissan-au').limit(5)
  ).data.map(p => p.id))
  .limit(5);

console.log('\n=== Sample Nissan variant_colors ===');
for (const c of (colors || [])) {
  console.log(c.color_name);
  console.log('  hero:', c.hero_image_url);
  console.log('  swatch:', c.swatch_url);
  if (c.gallery_urls) console.log('  gallery:', JSON.stringify(c.gallery_urls).substring(0, 200));
  console.log();
}
