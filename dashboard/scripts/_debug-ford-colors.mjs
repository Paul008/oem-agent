#!/usr/bin/env node
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const gpas = JSON.parse(fs.readFileSync('/Users/paulgiurin/Downloads/OEM-variants-main/data/ford/ford-color-guids.json', 'utf-8'));

// Check specific products
for (const title of ['Ranger XL', 'Ranger Wildtrak', 'Everest Sport', 'Mustang']) {
  const { data: prods } = await sb.from('products')
    .select('id, title')
    .eq('oem_id', 'ford-au')
    .ilike('title', `%${title}%`)
    .limit(1);
  if (prods.length === 0) continue;

  const { data: vc } = await sb.from('variant_colors')
    .select('color_name, color_code')
    .eq('product_id', prods[0].id);

  console.log(`${prods[0].title} — DB colors (${vc.length}):`);
  for (const c of vc) console.log(`  code=${(c.color_code || '?').padEnd(20)} name=${c.color_name}`);

  // Find matching GPAS
  for (const [k, v] of Object.entries(gpas.variants)) {
    const key = `${v.model.toLowerCase()} ${v.grade.toLowerCase()}`;
    if (key.includes(title.toLowerCase().replace('ford ', ''))) {
      console.log(`GPAS match: ${k} — colors (${v.colors.length}):`);
      for (const c of v.colors) console.log(`  code=${(c.paintCode || '?').padEnd(20)} name=${c.colorName}`);
      break;
    }
  }
  console.log();
}
