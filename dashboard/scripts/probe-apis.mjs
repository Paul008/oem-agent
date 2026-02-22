#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

for (const oem of ['gwm-au', 'nissan-au', 'suzuki-au']) {
  const { data, error } = await sb.from('discovered_apis').select('*').eq('oem_id', oem);
  if (error) { console.log(`${oem} error: ${error.message}`); continue; }
  console.log(`=== ${oem} discovered APIs (${(data||[]).length}) ===`);
  if (data && data[0]) console.log('  Columns:', Object.keys(data[0]).join(', '));
  (data||[]).forEach(d => console.log(`  ${JSON.stringify(d)}`));
  console.log('');
}

const { data: models } = await sb.from('vehicle_models').select('slug,name,source_url,configurator_url').eq('oem_id', 'suzuki-au');
console.log('=== Suzuki models ===');
models.forEach(m => console.log(`  ${m.slug} | ${m.name} | ${m.source_url}`));

// Also check nissan models
const { data: nModels } = await sb.from('vehicle_models').select('slug,name,source_url').eq('oem_id', 'nissan-au');
console.log('\n=== Nissan models ===');
nModels.forEach(m => console.log(`  ${m.slug} | ${m.name} | ${m.source_url}`));

// GWM models
const { data: gModels } = await sb.from('vehicle_models').select('slug,name,source_url').eq('oem_id', 'gwm-au');
console.log('\n=== GWM models ===');
gModels.forEach(m => console.log(`  ${m.slug} | ${m.name} | ${m.source_url}`));
