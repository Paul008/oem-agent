import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://nnihmdmsglkxpmilmjjc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc');

// Test brochure URLs reachability (sample 15 across different OEMs)
console.log('=== BROCHURE URL REACHABILITY (sample 15) ===');
const { data: brochures } = await sb.from('vehicle_models').select('oem_id, slug, brochure_url').not('brochure_url', 'is', null);
// Pick 1-2 per OEM
const byOem = {};
for (const m of brochures) { if (!byOem[m.oem_id]) byOem[m.oem_id] = []; byOem[m.oem_id].push(m); }
const sample = [];
for (const [oem, models] of Object.entries(byOem)) {
  sample.push(models[0]);
  if (models.length > 3) sample.push(models[Math.floor(models.length/2)]);
}

for (const m of sample.slice(0, 15)) {
  try {
    const res = await fetch(m.brochure_url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }, signal: AbortSignal.timeout(10000) });
    const ct = res.headers.get('content-type') || '';
    const ok = res.ok ? 'OK' : res.status;
    const isPdf = ct.includes('pdf') ? 'PDF' : ct.split(';')[0].substring(0, 20);
    console.log('  ' + String(ok).padEnd(5) + isPdf.padEnd(22) + m.oem_id + '/' + m.slug);
  } catch(e) { console.log('  ERR  ' + e.message.substring(0, 40).padEnd(22) + m.oem_id + '/' + m.slug); }
}

// Specs schema consistency
console.log('\n=== SPECS SCHEMA CONSISTENCY ===');
const oems = ['ford-au','gwm-au','hyundai-au','isuzu-au','kia-au','kgm-au','mazda-au','mitsubishi-au','nissan-au','subaru-au','suzuki-au','toyota-au','volkswagen-au'];
for (const oem of oems) {
  const { data: prods } = await sb.from('products').select('specs_json').eq('oem_id', oem).not('specs_json', 'is', null).limit(5);
  if (!prods || prods.length === 0) continue;
  const cats = new Set();
  for (const p of prods) Object.keys(p.specs_json).forEach(k => cats.add(k));
  const expected = ['capacity','dimensions','engine','performance','safety','towing','transmission','wheels'];
  const missing = expected.filter(e => !cats.has(e));
  const extra = [...cats].filter(c => !expected.includes(c));
  let status = '';
  if (missing.length) status += ' MISSING:[' + missing.join(',') + ']';
  if (extra.length) status += ' EXTRA:[' + extra.join(',') + ']';
  if (!status) status = ' ALL 8 categories';
  console.log('  ' + oem.padEnd(18) + status);
}

// Duplicate external_keys check (VW has nulls)
console.log('\n=== NULL EXTERNAL_KEY CHECK ===');
const { data: nullKeys } = await sb.from('products').select('id, oem_id, title').is('external_key', null);
if (nullKeys && nullKeys.length > 0) {
  console.log('  ' + nullKeys.length + ' products with NULL external_key:');
  for (const p of nullKeys) console.log('    ' + p.oem_id + ': ' + p.title);
} else {
  console.log('  None');
}

// Check for specs with string values where numbers expected
console.log('\n=== TYPE CONSISTENCY IN SPECS ===');
let typeIssues = 0;
const { data: allSpecs } = await sb.from('products').select('oem_id, title, specs_json').not('specs_json', 'is', null);
for (const p of allSpecs) {
  const s = p.specs_json;
  // Check numeric fields
  const numFields = [
    ['engine', 'displacement_cc'], ['engine', 'cylinders'], ['engine', 'power_kw'], ['engine', 'torque_nm'],
    ['transmission', 'gears'], ['dimensions', 'length_mm'], ['dimensions', 'width_mm'], ['dimensions', 'height_mm'],
    ['performance', 'fuel_combined_l100km'], ['towing', 'braked_kg'], ['capacity', 'seats'], ['capacity', 'doors']
  ];
  for (const [cat, field] of numFields) {
    if (s[cat] && s[cat][field] !== undefined && s[cat][field] !== null) {
      if (typeof s[cat][field] === 'string') {
        typeIssues++;
        if (typeIssues <= 5) console.log('  STRING value: ' + p.oem_id + ' ' + p.title + '.' + cat + '.' + field + ' = "' + s[cat][field] + '"');
      }
    }
  }
}
console.log('  Total type issues: ' + typeIssues);

// Check for missing engine on non-EV products
console.log('\n=== MISSING ENGINE ON NON-EV PRODUCTS ===');
const { data: noEngine } = await sb.from('products').select('oem_id, title, fuel_type, specs_json').not('specs_json', 'is', null);
let missingEngineNonEv = 0;
for (const p of noEngine) {
  if (!p.specs_json.engine && p.fuel_type !== 'Electric' && p.fuel_type !== 'BEV') {
    missingEngineNonEv++;
    console.log('  ' + p.oem_id + ': ' + p.title + ' (fuel=' + (p.fuel_type || 'null') + ')');
  }
}
console.log('  Total: ' + missingEngineNonEv);
