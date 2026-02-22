#!/usr/bin/env node
// Probe Subaru API for color/variant data structure
const API_BASE = 'https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api/v1';
const API_KEY = 'w68ewXf97mnPODxXG6ZA4FKhP65wpUK576oLryW9';
const HEADERS = { 'x-api-key': API_KEY, 'Accept': 'application/json' };

// Fetch models
const modelsRes = await fetch(`${API_BASE}/models/`, { headers: HEADERS });
const models = await modelsRes.json();
console.log('Models:', models.length);
for (const m of models) console.log('  ', m.id, m.name, m.year);

// Dedupe
const byName = new Map();
for (const m of models) {
  const name = m.name.replace(/^All-new\s+/i, '');
  if (!byName.has(name) || m.year > byName.get(name).year) byName.set(name, m);
}

// Explore variants for first model
const [firstName, firstModel] = [...byName.entries()][0];
console.log('\nExploring model:', firstName, 'id:', firstModel.id);

const varRes = await fetch(`${API_BASE}/models/${firstModel.id}/variants`, { headers: HEADERS });
const variants = await varRes.json();
console.log('Variants:', variants.length);
if (variants.length > 0) {
  console.log('Variant keys:', Object.keys(variants[0]));
  console.log('First variant:', JSON.stringify(variants[0], null, 2));
}

// Try colour-specific endpoints
const firstVar = variants[0];
if (firstVar) {
  console.log('\n--- Probing variant endpoints ---');
  const endpoints = [
    `/variants/${firstVar.id}/colours`,
    `/variants/${firstVar.id}/colors`,
    `/variants/${firstVar.id}`,
    `/models/${firstModel.id}/colours`,
    `/models/${firstModel.id}/colors`,
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${API_BASE}${ep}`, { headers: HEADERS });
      const text = await r.text();
      console.log(`\n${ep}: ${r.status} (${text.length} bytes)`);
      if (r.ok && text.length < 5000) console.log(text);
      else if (r.ok) console.log(text.substring(0, 500) + '...');
    } catch (e) {
      console.log(`${ep}: ERROR ${e.message}`);
    }
  }
}

// Check if variant itself has colour data
if (firstVar) {
  console.log('\n--- Full variant detail ---');
  const vRes = await fetch(`${API_BASE}/variants/${firstVar.id}`, { headers: HEADERS });
  if (vRes.ok) {
    const vData = await vRes.json();
    console.log('Detail keys:', Object.keys(vData));
    console.log(JSON.stringify(vData, null, 2).substring(0, 3000));
  }
}
