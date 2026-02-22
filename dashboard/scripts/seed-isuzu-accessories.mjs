#!/usr/bin/env node
// Seed Isuzu accessories from BuildandQuote/GetCarColours API
// Source: www.isuzuute.com.au/isuzuapi/BuildandQuote/GetCarColours?carName={variant}
// Run: cd dashboard/scripts && node seed-isuzu-accessories.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'isuzu-au'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.isuzuute.com.au/build-and-quote',
  'Origin': 'https://www.isuzuute.com.au',
}

const RANGE_SOURCES = [
  { model: 'D-MAX', slug: 'd-max', dsId: '%7B58ED1496-0A3E-4C26-84B5-4A9A766BF139%7D' },
  { model: 'MU-X', slug: 'mu-x', dsId: '%7BC91E66BB-1837-4DA2-AB7F-D0041C9384D7%7D' },
]

const CATEGORY_MAP = {
  'AccessoriesExteriorFrontAndSide': 'Exterior Front & Side',
  'AccessoriesExteriorRear': 'Exterior Rear',
  'AccessoriesRoofAndInterior': 'Roof & Interior',
  'GenuineTrayBodies': 'Genuine Tray Bodies',
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function buildCarName(model, name) {
  let clean = name.replace(/\s*\(\d+\.\d+L\)\s*/g, '').trim()
  clean = clean.replace(/\s*-\s*High Ride/g, '-High-Ride')
  clean = clean.replace(/\s+/g, '-')
  clean = clean.replace(/\+/g, '')
  return `${model}-${clean}`
}

// ── 1. Ensure vehicle_models exist ──
console.log('Ensuring Isuzu vehicle_models exist...')
const modelRows = RANGE_SOURCES.map(s => ({ oem_id: OEM_ID, slug: s.slug, name: s.model }))
const { data: upsertedModels, error: modelErr } = await supabase
  .from('vehicle_models')
  .upsert(modelRows, { onConflict: 'oem_id,slug' })
  .select('id, slug, name')
if (modelErr) { console.error('Model upsert error:', modelErr.message); process.exit(1) }
console.log(`Upserted ${upsertedModels.length} vehicle_models`)
const modelMap = new Map(upsertedModels.map(m => [m.slug, m]))

// ── 2. Get variant names from Range API and fetch accessories ──
console.log('\nFetching accessories from Isuzu API...')
const allAccessories = new Map() // ItemId -> { acc, modelSlug, variants }

for (const src of RANGE_SOURCES) {
  const url = `https://www.isuzuute.com.au/isuzuapi/RangeAPI/GetRangeData?dataSourceId=${src.dsId}`
  const rangeRes = await fetch(url, { headers: HEADERS })
  if (!rangeRes.ok) { console.log(`  Range ${src.model} failed: ${rangeRes.status}`); continue }
  const rangeData = await rangeRes.json()

  const carNames = new Set()
  for (const car of rangeData.Cars || []) {
    if (car.Name.includes('2.2L')) continue // skip 2.2L dupes
    carNames.add(buildCarName(src.model, car.Name))
  }

  console.log(`  ${src.model}: ${carNames.size} variants`)

  for (const carName of carNames) {
    const accUrl = `https://www.isuzuute.com.au/isuzuapi/BuildandQuote/GetCarColours?carName=${encodeURIComponent(carName)}`
    const r = await fetch(accUrl, { headers: HEADERS })
    const text = await r.text()
    if (text === 'null' || text === '') continue

    try {
      const data = JSON.parse(text)
      for (const [apiCat, displayCat] of Object.entries(CATEGORY_MAP)) {
        if (!Array.isArray(data[apiCat])) continue
        for (const acc of data[apiCat]) {
          if (!allAccessories.has(acc.ItemId)) {
            allAccessories.set(acc.ItemId, { acc, category: displayCat, modelSlug: src.slug, variants: [carName] })
          } else {
            const existing = allAccessories.get(acc.ItemId)
            existing.variants.push(carName)
            // If same accessory appears on both D-MAX and MU-X, track both
            if (existing.modelSlug !== src.slug) {
              existing.modelSlug = `${existing.modelSlug},${src.slug}`
            }
          }
        }
      }
    } catch {}
  }
}

console.log(`\nTotal unique accessories: ${allAccessories.size}`)

// ── 3. Delete existing Isuzu accessories ──
console.log('Deleting existing Isuzu accessories...')
const { error: delErr } = await supabase.from('accessories').delete().eq('oem_id', OEM_ID)
if (delErr) console.warn('Delete warning:', delErr.message)

// ── 4. Build and insert accessory rows ──
console.log('Inserting accessories...')
const rows = []
for (const [itemId, { acc, category }] of allAccessories) {
  const imageUrl = acc.DesktopImages?.Desktop?.Src || acc.CardImage?.Src || null
  const meta = {}
  if (acc.AccessoryType?.Type) meta.type = acc.AccessoryType.Type
  if (acc.Subtitle) meta.subtitle = acc.Subtitle
  if (acc.Weight) meta.weight = acc.Weight
  if (acc.ExcludeInBuildAndQuote) meta.exclude_build_quote = true
  if (acc.MarkAsFromPrice) meta.from_price = true
  if (acc.RelatedAccessories) meta.related = acc.RelatedAccessories
  if (acc.PrimaryGroupName) meta.group = acc.PrimaryGroupName

  rows.push({
    oem_id: OEM_ID,
    external_key: `isuzu-${acc.Id || itemId.replace(/[{}]/g, '')}`,
    name: acc.Name || acc.ItemName,
    slug: slugify(acc.Name || acc.ItemName),
    part_number: acc.PartNumber || null,
    category,
    price: parseFloat(acc.Price) || null,
    description_html: acc.Description || null,
    image_url: imageUrl,
    inc_fitting: 'none',
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
for (const [itemId, { acc, modelSlug }] of allAccessories) {
  const extKey = `isuzu-${acc.Id || itemId.replace(/[{}]/g, '')}`
  const accId = extKeyToId.get(extKey)
  if (!accId) continue

  // Map to model(s) — some accessories span both D-MAX and MU-X
  const slugs = modelSlug.split(',')
  for (const slug of slugs) {
    const model = modelMap.get(slug.trim())
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
const categories = [...new Set(rows.map(r => r.category))]
const prices = rows.map(r => r.price).filter(Boolean)

console.log('\n=== Isuzu Accessories Seed Summary ===')
console.log(`Vehicle models:   ${upsertedModels.length}`)
console.log(`Accessories:      ${accTotal}`)
console.log(`Accessory-Models: ${uniqueJoins.length}`)
console.log(`Categories:       ${categories.join(', ')}`)
console.log(`Price range:      $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)
console.log('Done!')
