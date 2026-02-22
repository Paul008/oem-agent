#!/usr/bin/env node
// Probe Subaru Retailer API with discovered API key
// API: https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api/v1
// Key: w68ewXf97mnPODxXG6ZA4FKhP65wpUK576oLryW9

const API_BASE = 'https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api/v1'
const API_KEY = 'w68ewXf97mnPODxXG6ZA4FKhP65wpUK576oLryW9'

const HEADERS = {
  'x-api-key': API_KEY,
  'Accept': 'application/json',
  'Content-Type': 'application/json',
}

// Step 1: Get models
console.log('=== Fetching models ===')
const modelsRes = await fetch(`${API_BASE}/models/`, { headers: HEADERS })
console.log(`Models: ${modelsRes.status}`)
if (!modelsRes.ok) { console.log(await modelsRes.text()); process.exit(1) }

const models = await modelsRes.json()
console.log(`Found ${models.length} models`)
for (const m of models) {
  console.log(`  ${m.id || m.modelId}: ${m.name || m.modelName}`)
}

// Step 2: Get variants for each model
console.log('\n=== Fetching variants ===')
const allVariants = []
for (const model of models) {
  const modelId = model.id || model.modelId
  const varUrl = `${API_BASE}/models/${modelId}/variants`
  const varRes = await fetch(varUrl, { headers: HEADERS })
  if (!varRes.ok) { console.log(`  ${modelId}: HTTP ${varRes.status}`); continue }

  const variants = await varRes.json()
  console.log(`  ${model.name || model.modelName}: ${variants.length} variants`)
  for (const v of variants) {
    allVariants.push({ ...v, _modelId: modelId, _modelName: model.name || model.modelName })
  }
}
console.log(`Total variants: ${allVariants.length}`)

// Step 3: Get accessories for first few variants to see structure
console.log('\n=== Sampling accessories ===')
const sampleVariants = allVariants.slice(0, 3)
let sampleAcc = null
for (const v of sampleVariants) {
  const variantId = v.id || v.variantId
  const accUrl = `${API_BASE}/variants/${variantId}/accessories`
  const accRes = await fetch(accUrl, { headers: HEADERS })
  if (!accRes.ok) { console.log(`  Variant ${variantId}: HTTP ${accRes.status}`); continue }

  const accs = await accRes.json()
  console.log(`  ${v._modelName} / ${v.name || v.variantName}: ${accs.length} accessories`)
  if (accs.length > 0 && !sampleAcc) sampleAcc = accs[0]
}

if (sampleAcc) {
  console.log('\nSample accessory keys:', Object.keys(sampleAcc).join(', '))
  console.log(JSON.stringify(sampleAcc, null, 2).substring(0, 2000))
}

// Step 4: Get accessories for ALL variants for count
console.log('\n=== Full accessory count ===')
const allAccessories = new Map()
let totalRaw = 0
for (const v of allVariants) {
  const variantId = v.id || v.variantId
  const accUrl = `${API_BASE}/variants/${variantId}/accessories`
  try {
    const accRes = await fetch(accUrl, { headers: HEADERS })
    if (!accRes.ok) continue
    const accs = await accRes.json()
    totalRaw += accs.length
    for (const acc of accs) {
      const key = acc.id || acc.accessoryId || acc.partNumber
      if (key && !allAccessories.has(key)) {
        allAccessories.set(key, { ...acc, _variantId: variantId, _modelName: v._modelName })
      }
    }
  } catch {}
}

console.log(`Total raw accessory-variant: ${totalRaw}`)
console.log(`Unique accessories: ${allAccessories.size}`)

// Price range
const prices = [...allAccessories.values()]
  .map(a => parseFloat(a.price || a.rrp || 0))
  .filter(p => p > 0)
if (prices.length > 0) {
  console.log(`Price range: $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)
}
