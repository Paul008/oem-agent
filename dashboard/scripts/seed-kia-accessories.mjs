#!/usr/bin/env node
// Seed Kia accessories from JSON-LD structured data on model accessory pages
// URL pattern: https://www.kia.com/au/cars/{model}/accessories.html
// Run: cd dashboard/scripts && node seed-kia-accessories.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'kia-au'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

const MODELS = [
  { name: 'K4', slug: 'k4' },
  { name: 'Cerato', slug: 'cerato' },
  { name: 'Stonic', slug: 'stonic' },
  { name: 'Seltos', slug: 'seltos' },
  { name: 'Sportage', slug: 'sportage' },
  { name: 'Sorento', slug: 'sorento' },
  { name: 'EV3', slug: 'ev3' },
  { name: 'EV5', slug: 'ev5' },
  { name: 'EV6', slug: 'ev6' },
  { name: 'EV9', slug: 'ev9' },
  { name: 'Carnival', slug: 'carnival' },
  { name: 'Picanto', slug: 'picanto' },
]

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── 1. Ensure vehicle_models exist ──
console.log('Ensuring Kia vehicle_models exist...')
const modelUpsertRows = MODELS.map(m => ({ oem_id: OEM_ID, slug: m.slug, name: m.name }))
const { data: upsertedModels, error: modelErr } = await supabase
  .from('vehicle_models')
  .upsert(modelUpsertRows, { onConflict: 'oem_id,slug' })
  .select('id, slug, name')
if (modelErr) { console.error('Model upsert error:', modelErr.message); process.exit(1) }
console.log(`Upserted ${upsertedModels.length} vehicle_models`)
const modelMap = new Map(upsertedModels.map(m => [m.slug, m]))

// ── 2. Fetch accessories from each model page ──
console.log('\nFetching accessories from Kia model pages...')
const allAccessories = new Map() // name -> { acc, modelSlugs }

for (const model of MODELS) {
  const url = `https://www.kia.com/au/cars/${model.slug}/accessories.html`
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow' })
    if (!res.ok) { console.log(`  ${model.name}: HTTP ${res.status}`); continue }

    const html = await res.text()

    // Extract JSON-LD blocks
    const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]

    for (const block of jsonLdBlocks) {
      try {
        const data = JSON.parse(block[1])
        const products = []
        if (data['@type'] === 'Product') products.push(data)
        if (Array.isArray(data)) products.push(...data.filter(d => d['@type'] === 'Product'))
        if (data['@graph']) products.push(...data['@graph'].filter(d => d['@type'] === 'Product'))

        for (const product of products) {
          const name = product.name
          if (!name) continue

          const price = parseFloat(product.offers?.price) || null
          const imageUrl = product.image || null

          // Extract additional properties
          const props = {}
          if (Array.isArray(product.additionalProperty)) {
            for (const prop of product.additionalProperty) {
              if (prop.name === 'Installation') props.installation = prop.value
              if (prop.name === 'Compatible Car Model') props.compatible_model = prop.value
            }
          }

          // Use name as dedupe key since JSON-LD doesn't have part numbers
          const key = `${name}|${price}`
          if (!allAccessories.has(key)) {
            allAccessories.set(key, {
              name,
              description: product.description || null,
              price,
              image_url: imageUrl,
              installation: props.installation || null,
              modelSlugs: new Set([model.slug]),
            })
          } else {
            allAccessories.get(key).modelSlugs.add(model.slug)
          }
        }
      } catch {}
    }

    const count = [...allAccessories.values()].filter(a => a.modelSlugs.has(model.slug)).length
    console.log(`  ${model.name}: found accessories (running total unique: ${allAccessories.size})`)
  } catch (e) {
    console.log(`  ${model.name}: ${e.message}`)
  }
}

console.log(`\nTotal unique accessories: ${allAccessories.size}`)

// ── 3. Delete existing Kia accessories ──
console.log('Deleting existing Kia accessories...')
const { error: delErr } = await supabase.from('accessories').delete().eq('oem_id', OEM_ID)
if (delErr) console.warn('Delete warning:', delErr.message)

// ── 4. Build and insert accessory rows ──
console.log('Inserting accessories...')
const rows = []
let idx = 0
for (const [key, acc] of allAccessories) {
  if (!acc.price || acc.price <= 0) continue

  const incFitting = acc.installation === 'PART & FITMENT' ? 'includes'
    : acc.installation === 'PART ONLY' ? 'excludes'
    : 'none'

  const meta = {}
  if (acc.installation) meta.installation_type = acc.installation

  rows.push({
    oem_id: OEM_ID,
    external_key: `kia-${slugify(acc.name)}-${idx++}`,
    name: acc.name,
    slug: slugify(acc.name),
    part_number: null, // JSON-LD doesn't provide part numbers
    category: null, // JSON-LD doesn't provide categories
    price: acc.price,
    description_html: acc.description || null,
    image_url: acc.image_url,
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

// ── 5. Build accessory_models join table ──
console.log('Building accessory_models join table...')
const joinRows = []
idx = 0
for (const [key, acc] of allAccessories) {
  if (!acc.price || acc.price <= 0) { idx++; continue }
  const extKey = `kia-${slugify(acc.name)}-${idx++}`
  const accId = extKeyToId.get(extKey)
  if (!accId) continue

  for (const slug of acc.modelSlugs) {
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

// ── 6. Summary ──
const { count: accTotal } = await supabase.from('accessories').select('*', { count: 'exact', head: true }).eq('oem_id', OEM_ID)
const prices = rows.map(r => r.price).filter(Boolean)

console.log('\n=== Kia Accessories Seed Summary ===')
console.log(`Vehicle models:   ${upsertedModels.length}`)
console.log(`Accessories:      ${accTotal}`)
console.log(`Accessory-Models: ${uniqueJoins.length}`)
console.log(`Price range:      $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)
console.log('Done!')
