#!/usr/bin/env node
// Seed Subaru accessories from Subaru Retailer API v1
// API: https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api/v1
// Auth: x-api-key header
// Flow: /models → /models/{id}/variants → /variants/{id}/accessories
// Run: cd dashboard/scripts && node seed-subaru-accessories.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'subaru-au'
const API_BASE = 'https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api/v1'
const API_KEY = 'w68ewXf97mnPODxXG6ZA4FKhP65wpUK576oLryW9'

const HEADERS = {
  'x-api-key': API_KEY,
  'Accept': 'application/json',
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── 1. Fetch models from API ──
console.log('Fetching Subaru models from API...')
const modelsRes = await fetch(`${API_BASE}/models/`, { headers: HEADERS })
if (!modelsRes.ok) { console.error(`Models API failed: ${modelsRes.status}`); process.exit(1) }
const apiModels = await modelsRes.json()
console.log(`Found ${apiModels.length} models in API`)

// Deduplicate models by name (API has duplicate entries like two "Impreza" and two "BRZ")
// Keep the most recent year for each model name
const modelsByName = new Map()
for (const m of apiModels) {
  const name = m.name.replace(/^All-new\s+/i, '')
  if (!modelsByName.has(name) || m.year > modelsByName.get(name).year) {
    modelsByName.set(name, m)
  }
}

console.log(`Unique models: ${modelsByName.size}`)

// ── 2. Ensure vehicle_models exist ──
console.log('\nEnsuring Subaru vehicle_models exist...')
const modelUpsertRows = [...modelsByName.entries()].map(([name, m]) => ({
  oem_id: OEM_ID,
  slug: slugify(name),
  name,
}))
const { data: upsertedModels, error: modelErr } = await supabase
  .from('vehicle_models')
  .upsert(modelUpsertRows, { onConflict: 'oem_id,slug' })
  .select('id, slug, name')
if (modelErr) { console.error('Model upsert error:', modelErr.message); process.exit(1) }
console.log(`Upserted ${upsertedModels.length} vehicle_models`)
const modelMap = new Map(upsertedModels.map(m => [m.slug, m]))

// ── 3. Fetch variants and accessories for each model ──
console.log('\nFetching variants and accessories...')
const allAccessories = new Map() // itemCode -> { acc, modelSlugs }

for (const [name, apiModel] of modelsByName) {
  const modelSlug = slugify(name)

  // Also check all API model entries for this name (in case different years have different accessories)
  const allModelEntries = apiModels.filter(m =>
    m.name.replace(/^All-new\s+/i, '') === name
  )

  for (const entry of allModelEntries) {
    const varRes = await fetch(`${API_BASE}/models/${entry.id}/variants`, { headers: HEADERS })
    if (!varRes.ok) continue
    const variants = await varRes.json()

    for (const variant of variants) {
      const accRes = await fetch(`${API_BASE}/variants/${variant.id}/accessories`, { headers: HEADERS })
      if (!accRes.ok) continue

      const data = await accRes.json()
      const accs = data.accessories || []

      for (const acc of accs) {
        const key = acc.itemCode
        if (!key) continue

        if (!allAccessories.has(key)) {
          allAccessories.set(key, { acc, modelSlugs: new Set([modelSlug]) })
        } else {
          allAccessories.get(key).modelSlugs.add(modelSlug)
        }
      }
    }
  }

  const count = [...allAccessories.values()].filter(a => a.modelSlugs.has(modelSlug)).length
  console.log(`  ${name}: ${count} unique accessories`)
}

console.log(`\nTotal unique accessories (by itemCode): ${allAccessories.size}`)

// ── 4. Delete existing Subaru accessories ──
console.log('Deleting existing Subaru accessories...')
const { error: delErr } = await supabase.from('accessories').delete().eq('oem_id', OEM_ID)
if (delErr) console.warn('Delete warning:', delErr.message)

// ── 5. Build and insert accessory rows ──
console.log('Inserting accessories...')
const rows = []
for (const [itemCode, { acc }] of allAccessories) {
  const price = acc.price || null
  if (!price || price <= 0) continue

  const meta = {}
  if (acc.priceFitted && acc.priceFitted !== acc.price) meta.price_fitted = acc.priceFitted
  if (acc.kitCode) meta.kit_code = acc.kitCode
  if (acc.genuineFlag !== null) meta.genuine = acc.genuineFlag
  if (acc.aftermarketFlag !== null) meta.aftermarket = acc.aftermarketFlag
  if (acc.eraCode) meta.era_code = acc.eraCode
  if (acc.disclaimers && acc.disclaimers.length > 0) meta.disclaimers = acc.disclaimers

  const incFitting = acc.priceFitted && acc.priceFitted > acc.price ? 'excludes' : 'none'

  rows.push({
    oem_id: OEM_ID,
    external_key: `subaru-${itemCode}`,
    name: acc.description,
    slug: slugify(acc.description),
    part_number: itemCode,
    category: acc.accessoryCategoryName || null,
    price,
    description_html: null,
    image_url: acc.imageSrc || null,
    inc_fitting: incFitting,
    parent_id: null,
    meta_json: Object.keys(meta).length > 0 ? meta : {},
  })
}

let insertedCount = 0
const extKeyToId = new Map()
for (let i = 0; i < rows.length; i += 200) {
  const batch = rows.slice(i, i + 200)
  const { data: inserted, error: insErr } = await supabase
    .from('accessories')
    .upsert(batch, { onConflict: 'oem_id,external_key' })
    .select('id, external_key')
  if (insErr) { console.error(`Insert error (batch ${i}):`, insErr.message); continue }
  insertedCount += inserted.length
  for (const r of inserted) extKeyToId.set(r.external_key, r.id)
}
console.log(`Inserted ${insertedCount} accessories`)

// ── 6. Build accessory_models join table ──
console.log('Building accessory_models join table...')
const joinRows = []
for (const [itemCode, { modelSlugs }] of allAccessories) {
  const accId = extKeyToId.get(`subaru-${itemCode}`)
  if (!accId) continue

  for (const slug of modelSlugs) {
    const model = modelMap.get(slug)
    if (model) joinRows.push({ accessory_id: accId, model_id: model.id })
  }
}

const seen = new Set()
const uniqueJoins = joinRows.filter(r => {
  const key = `${r.accessory_id}:${r.model_id}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

if (uniqueJoins.length > 0) {
  const accIds = [...new Set(uniqueJoins.map(r => r.accessory_id))]
  await supabase.from('accessory_models').delete().in('accessory_id', accIds)

  for (let i = 0; i < uniqueJoins.length; i += 200) {
    const batch = uniqueJoins.slice(i, i + 200)
    const { error: joinErr } = await supabase.from('accessory_models').insert(batch)
    if (joinErr) console.error(`Join error (batch ${i}):`, joinErr.message)
  }
  console.log(`Inserted ${uniqueJoins.length} accessory_models rows`)
}

// ── 7. Summary ──
const { count: accTotal } = await supabase.from('accessories').select('*', { count: 'exact', head: true }).eq('oem_id', OEM_ID)
const categories = [...new Set(rows.map(r => r.category).filter(Boolean))]
const prices = rows.map(r => r.price).filter(Boolean)

console.log('\n=== Subaru Accessories Seed Summary ===')
console.log(`Vehicle models:   ${upsertedModels.length}`)
console.log(`Accessories:      ${accTotal}`)
console.log(`Accessory-Models: ${uniqueJoins.length}`)
console.log(`Categories:       ${categories.join(', ')}`)
console.log(`Price range:      $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)
console.log('Done!')
