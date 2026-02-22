#!/usr/bin/env node
// Probe OEM configurator APIs for color data
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

// Check discovered_apis for color-related endpoints
const { data: apis, error } = await sb.from('discovered_apis').select('oem_id,url,method,description').order('oem_id');
if (error) { console.log('DB error:', error.message); }
const byOem = {};
for (const a of (apis || [])) {
  if (!byOem[a.oem_id]) byOem[a.oem_id] = [];
  byOem[a.oem_id].push(a);
}

console.log('=== All discovered APIs by OEM ===');
for (const [oem, oemApis] of Object.entries(byOem)) {
  console.log(`\n${oem} (${oemApis.length} APIs):`);
  oemApis.forEach(a => console.log(`  ${(a.method || 'GET').padEnd(6)} ${a.url.substring(0, 120)}`));
}

// Now probe specific configurator APIs
console.log('\n\n=== Probing Hyundai configurator APIs ===');
const hyundaiEndpoints = [
  'https://www.hyundai.com/content/api/au/hyundai/v3/build-price',
  'https://www.hyundai.com/content/api/au/hyundai/v3/configurator',
  'https://www.hyundai.com/content/api/au/hyundai/v3/vehicle-config',
  'https://www.hyundai.com/content/api/au/hyundai/v3/colours',
  'https://www.hyundai.com/content/api/au/hyundai/v3/colors',
  'https://www.hyundai.com/content/api/au/hyundai/v3/model-data',
  'https://www.hyundai.com/content/api/au/hyundai/v3/models',
  'https://www.hyundai.com/content/api/au/hyundai/v3/range',
  'https://www.hyundai.com/content/api/au/hyundai/v3/specifications',
  'https://www.hyundai.com/content/api/au/hyundai/v3/specifications?modelId=tucson',
  'https://www.hyundai.com/content/api/au/hyundai/v3/models/tucson',
  'https://www.hyundai.com/content/api/au/hyundai/v3/build-price/tucson',
];

for (const url of hyundaiEndpoints) {
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('json')) {
      const d = await r.json();
      const keys = typeof d === 'object' ? Object.keys(d).join(', ') : typeof d;
      console.log(`  ✅ ${r.status} ${url.replace('https://www.hyundai.com/content/api/au/hyundai/v3/', '')}`);
      console.log(`     keys: ${keys}`);
      // If there are colors/colours, show structure
      const str = JSON.stringify(d);
      if (str.includes('color') || str.includes('colour')) {
        console.log('     ** Contains color data! **');
        console.log('     Sample:', str.substring(0, 300));
      }
    } else {
      console.log(`  ❌ ${r.status} ${url.replace('https://www.hyundai.com/content/api/au/hyundai/v3/', '')}`);
    }
  } catch (e) {
    console.log(`  ❌ ERR ${url.replace('https://www.hyundai.com/content/api/au/hyundai/v3/', '')} - ${e.message}`);
  }
}

console.log('\n\n=== Probing Kia configurator APIs ===');
const kiaEndpoints = [
  'https://www.kia.com/au/api/v1/vehicles',
  'https://www.kia.com/au/api/v1/models',
  'https://www.kia.com/api/v1/au/vehicles',
  'https://api.kia.com/au/vehicles',
  'https://www.kia.com/content/dam/kwp/au/en/configurator/data.json',
  'https://www.kia.com/au/service/configurator/models.json',
  'https://www.kia.com/au/cars/seltos/configurator.html',
];

for (const url of kiaEndpoints) {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'Accept': 'application/json, text/html' } });
    const ct = r.headers.get('content-type') || '';
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.status} ${url.replace('https://www.kia.com/', '')} [${ct.substring(0, 30)}]`);
    if (r.ok && ct.includes('json')) {
      const d = await r.json();
      console.log(`     keys: ${typeof d === 'object' ? Object.keys(d).join(', ') : typeof d}`);
    }
  } catch (e) {
    console.log(`  ❌ ERR ${url} - ${e.message}`);
  }
}

console.log('\n\n=== Probing Mazda configurator APIs ===');
const mazdaEndpoints = [
  'https://www.mazda.com.au/api/vehicle-data',
  'https://www.mazda.com.au/api/configurator',
  'https://www.mazda.com.au/api/build-and-price',
  'https://www.mazda.com.au/globalnavdata',
  'https://www.mazda.com.au/models/mazda-cx-5/build-and-price/',
  'https://www.mazda.com.au/api/models',
];

for (const url of mazdaEndpoints) {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'Accept': 'application/json, text/html' } });
    const ct = r.headers.get('content-type') || '';
    const redir = r.redirected ? ` → ${r.url}` : '';
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.status} ${url.replace('https://www.mazda.com.au/', '')} [${ct.substring(0, 30)}]${redir}`);
    if (r.ok && ct.includes('json')) {
      const d = await r.json();
      const str = JSON.stringify(d).substring(0, 300);
      console.log(`     ${str}`);
    }
  } catch (e) {
    console.log(`  ❌ ERR ${url} - ${e.message}`);
  }
}

console.log('\n\n=== Probing Suzuki model APIs ===');
const suzukiEndpoints = [
  'https://www.suzuki.com.au/api/vehicles',
  'https://www.suzuki.com.au/api/models',
  'https://www.suzuki.com.au/suzuki-finance-calculator-data.json',
  'https://d3c0jx0jn5ri0f.cloudfront.net/suzuki-finance-calculator-data.json',
];

for (const url of suzukiEndpoints) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const ct = r.headers.get('content-type') || '';
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.status} ${url.replace(/https:\/\/(www\.)?suzuki\.com\.au\//, '')} [${ct.substring(0, 30)}]`);
    if (r.ok && ct.includes('json')) {
      const d = await r.json();
      const str = JSON.stringify(d).substring(0, 200);
      console.log(`     ${str}`);
    }
  } catch (e) {
    console.log(`  ❌ ERR ${url} - ${e.message}`);
  }
}

console.log('\n\n=== Probing GWM/Haval APIs ===');
const gwmEndpoints = [
  'https://www.gwm.com.au/api/vehicles',
  'https://www.gwm.com.au/api/models',
  'https://www.haval.com.au/api/vehicles',
  'https://api.storyblok.com/v2/cdn/stories?starts_with=models&token=',
];

for (const url of gwmEndpoints) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const ct = r.headers.get('content-type') || '';
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.status} ${url} [${ct.substring(0, 30)}]`);
  } catch (e) {
    console.log(`  ❌ ERR ${url} - ${e.message}`);
  }
}

console.log('\n\n=== Probing Ford configurator APIs ===');
const fordEndpoints = [
  'https://www.ford.com.au/api/v1/vehicles',
  'https://www.ford.com.au/content/ford/au/en/models.model.json',
  'https://www.ford.com.au/showroom/build-and-price/',
  'https://shop.ford.com.au/build/',
  'https://bp.ford.com.au/build-price/',
];

for (const url of fordEndpoints) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const ct = r.headers.get('content-type') || '';
    const redir = r.redirected ? ` → ${r.url}` : '';
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.status} ${url.replace('https://www.ford.com.au/', '')} [${ct.substring(0, 30)}]${redir}`);
    if (r.ok && ct.includes('json')) {
      const d = await r.json();
      console.log(`     keys: ${typeof d === 'object' ? Object.keys(d).slice(0, 10).join(', ') : typeof d}`);
    }
  } catch (e) {
    console.log(`  ❌ ERR ${url} - ${e.message}`);
  }
}
