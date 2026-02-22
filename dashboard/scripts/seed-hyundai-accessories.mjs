#!/usr/bin/env node
// Seed Hyundai accessories from Hyundai AU content API
// API: https://www.hyundai.com/content/api/au/hyundai/v3/accessories?groupId={groupId}
// GroupIds scraped from model-series-id attribute on accessories pages
// Run: cd dashboard/scripts && node seed-hyundai-accessories.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'hyundai-au'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

const MODELS = [
  { name: 'Tucson', slug: 'tucson', groupId: '990EEC2C-4AFE-4AD2-B016-73BCD2EB5B44' },
  { name: 'Kona', slug: 'kona', groupId: '9F6AA9F2-17C6-4148-B47B-1054467C933B' },
  { name: 'Venue', slug: 'venue', groupId: '4AEAFF7A-088F-4686-AE85-CEF84E83D8EE' },
  { name: 'Santa Fe', slug: 'santa-fe', groupId: 'B58EB7A1-CD96-435C-A728-8E7748FE7520' },
  { name: 'Palisade', slug: 'palisade', groupId: 'A15B22F2-30DE-4B8C-8A95-9E814662ECDD' },
  { name: 'i30', slug: 'i30', groupId: 'C4994B0D-A89D-4113-B6CD-B5D9352512C3' },
  { name: 'Staria', slug: 'staria', groupId: 'E14E5076-A170-4F6C-86EF-AEF77027B46A' },
  { name: 'IONIQ 5', slug: 'ioniq-5', groupId: 'CEE198AD-36C7-4E69-8E42-C2F820ACB52C' },
  { name: 'IONIQ 6', slug: 'ioniq-6', groupId: 'BDB8DA98-DE63-469E-975D-98B1A4456A55' },
  { name: 'IONIQ 9', slug: 'ioniq-9', groupId: '57AF0708-2D36-44A6-8602-61722012CD83' },
  { name: 'INSTER', slug: 'inster', groupId: '239CF2F7-51F5-4FE0-9403-BE5FE9320FE4' },
  { name: 'i30 N', slug: 'i30-n', groupId: '4B33C06F-8A64-410C-9D29-06A298FA3845' },
  { name: 'i30 Sedan', slug: 'i30-sedan', groupId: 'C75B991C-28A9-41B2-8E39-FD0D09D96D06' },
  { name: 'i20 N', slug: 'i20-n', groupId: 'D327F7E7-499D-46FC-9A07-D4752979306A' },
  { name: 'Sonata N Line', slug: 'sonata-n-line', groupId: 'E80DB876-4426-4EC1-B7A2-4021BC5140DB' },
]

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function parsePrice(val) {
  if (val === null || val === undefined || val === 'null' || val === '') return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

// ── 1. Ensure vehicle_models exist ──
console.log('Ensuring Hyundai vehicle_models exist...')
const modelUpsertRows = MODELS.map(m => ({ oem_id: OEM_ID, slug: m.slug, name: m.name }))
const { data: upsertedModels, error: modelErr } = await supabase
  .from('vehicle_models')
  .upsert(modelUpsertRows, { onConflict: 'oem_id,slug' })
  .select('id, slug, name')
if (modelErr) { console.error('Model upsert error:', modelErr.message); process.exit(1) }
console.log(`Upserted ${upsertedModels.length} vehicle_models`)
const modelMap = new Map(upsertedModels.map(m => [m.slug, m]))

// ── 2. Fetch accessories from Hyundai API ──
console.log('\nFetching accessories from Hyundai API...')
const allAccessories = new Map() // accessoryId -> { acc, modelSlugs }

for (const model of MODELS) {
  const url = `https://www.hyundai.com/content/api/au/hyundai/v3/accessories?groupId=${model.groupId}`
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) { console.log(`  ${model.name}: HTTP ${res.status}`); continue }

    const data = await res.json()
    const accs = data.accessories || []
    const packs = data.accessoryPacks || []

    // Process regular accessories
    for (const acc of accs) {
      const key = acc.accessoryId
      if (!key) continue
      if (!allAccessories.has(key)) {
        allAccessories.set(key, { acc, modelSlugs: new Set([model.slug]), isPack: false })
      } else {
        allAccessories.get(key).modelSlugs.add(model.slug)
      }
    }

    // Process packs as accessories too
    for (const pack of packs) {
      const key = pack.accessoryId || pack.packId
      if (!key) continue
      if (!allAccessories.has(key)) {
        allAccessories.set(key, { acc: pack, modelSlugs: new Set([model.slug]), isPack: true })
      } else {
        allAccessories.get(key).modelSlugs.add(model.slug)
      }
    }

    console.log(`  ${model.name}: ${accs.length} accessories, ${packs.length} packs`)
  } catch (e) {
    console.log(`  ${model.name}: ERROR - ${e.message}`)
  }
}

console.log(`\nTotal unique accessories: ${allAccessories.size}`)

// ── 3. Delete existing Hyundai accessories ──
console.log('Deleting existing Hyundai accessories...')
const { error: delErr } = await supabase.from('accessories').delete().eq('oem_id', OEM_ID)
if (delErr) console.warn('Delete warning:', delErr.message)

// ── 4. Build and insert accessory rows ──
console.log('Inserting accessories...')
const rows = []
for (const [accId, { acc, isPack }] of allAccessories) {
  const price = parsePrice(acc.rrpIncFitment) || parsePrice(acc.price)
  if (!price || price <= 0) continue

  const name = acc.partName || acc.packName || acc.name
  if (!name) continue

  const imageUrl = acc.image
    ? (acc.image.startsWith('http') ? acc.image : `https://www.hyundai.com${acc.image}`)
    : null

  const meta = {}
  if (acc.modelSeriesId) meta.model_series_id = acc.modelSeriesId
  if (acc.isFeature) meta.is_featured = true
  if (acc.fitmentRequired) meta.fitment_required = true
  if (acc.fitmentTime && acc.fitmentTime !== '0') meta.fitment_time = acc.fitmentTime
  if (acc.fleetPriceIncGstIncFitment) meta.fleet_price = acc.fleetPriceIncGstIncFitment
  if (isPack) {
    meta.is_pack = true
    if (acc.savings) meta.savings = parsePrice(acc.savings)
    if (acc.accessories) meta.included_accessories = acc.accessories.map(a => a.accessoryId).filter(Boolean)
  }
  if (acc.variants && acc.variants.length > 0) meta.variant_ids = acc.variants
  if (acc.forTowing) meta.for_towing = true

  const incFitting = acc.fitmentRequired ? 'includes' : 'none'

  rows.push({
    oem_id: OEM_ID,
    external_key: `hyundai-${accId}`,
    name,
    slug: slugify(name),
    part_number: acc.partNumber || null,
    category: acc.category || null,
    price,
    description_html: acc.description || null,
    image_url: imageUrl,
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
for (const [accId, { modelSlugs }] of allAccessories) {
  const dbAccId = extKeyToId.get(`hyundai-${accId}`)
  if (!dbAccId) continue

  for (const slug of modelSlugs) {
    const model = modelMap.get(slug)
    if (model) joinRows.push({ accessory_id: dbAccId, model_id: model.id })
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
const categories = [...new Set(rows.map(r => r.category).filter(Boolean))]
const prices = rows.map(r => r.price).filter(Boolean)

console.log('\n=== Hyundai Accessories Seed Summary ===')
console.log(`Vehicle models:   ${upsertedModels.length}`)
console.log(`Accessories:      ${accTotal}`)
console.log(`Accessory-Models: ${uniqueJoins.length}`)
console.log(`Categories:       ${categories.join(', ')}`)
console.log(`Price range:      $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)
console.log('Done!')
