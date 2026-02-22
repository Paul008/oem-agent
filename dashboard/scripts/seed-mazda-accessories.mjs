#!/usr/bin/env node
// Seed Mazda accessories from inline React hydration data on model pages
// Source: www.mazda.com.au/accessories/find-accessories/{model}/
// Run: cd dashboard/scripts && node seed-mazda-accessories.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'mazda-au'
const MAZDA_BASE = 'https://www.mazda.com.au'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// Models with accessory pages (CX-8 and MX-30 have no accessory data)
const MODELS = [
  { slug: 'mazda2', name: 'Mazda2', url: `${MAZDA_BASE}/accessories/find-accessories/mazda2/` },
  { slug: 'mazda3', name: 'Mazda3', url: `${MAZDA_BASE}/accessories/find-accessories/mazda3/` },
  { slug: 'cx-3', name: 'CX-3', url: `${MAZDA_BASE}/accessories/find-accessories/cx-3/` },
  { slug: 'cx-5', name: 'CX-5', url: `${MAZDA_BASE}/accessories/find-accessories/cx-5/` },
  { slug: 'cx-60', name: 'CX-60', url: `${MAZDA_BASE}/accessories/find-accessories/cx-60/` },
  { slug: 'cx-70', name: 'CX-70', url: `${MAZDA_BASE}/accessories/find-accessories/cx-70/` },
  { slug: 'cx-80', name: 'CX-80', url: `${MAZDA_BASE}/accessories/find-accessories/cx-80/` },
  { slug: 'cx-90', name: 'CX-90', url: `${MAZDA_BASE}/accessories/find-accessories/cx-90/` },
  { slug: 'mx-5', name: 'MX-5', url: `${MAZDA_BASE}/accessories/find-accessories/mx-5/` },
  { slug: 'bt-50', name: 'BT-50', url: `${MAZDA_BASE}/accessories/find-accessories/bt-50/` },
]

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── 1. Ensure Mazda vehicle_models exist ──
console.log('Ensuring Mazda vehicle_models exist...')
const modelUpsertRows = MODELS.map(m => ({
  oem_id: OEM_ID,
  slug: m.slug,
  name: m.name,
}))
const { data: upsertedModels, error: modelErr } = await supabase
  .from('vehicle_models')
  .upsert(modelUpsertRows, { onConflict: 'oem_id,slug' })
  .select('id, slug, name')
if (modelErr) { console.error('Model upsert error:', modelErr.message); process.exit(1) }
console.log(`Upserted ${upsertedModels.length} vehicle_models`)

// Build slug → model id map
const modelMap = new Map(upsertedModels.map(m => [m.slug, m]))

// ── 2. Fetch accessories from each model page ──
console.log('\nFetching accessories from model pages...')
const allAccessories = [] // { raw, modelSlug }

for (const model of MODELS) {
  const res = await fetch(model.url, { headers: HEADERS })
  if (!res.ok) { console.log(`  ❌ ${model.slug}: ${res.status}`); continue }

  const html = await res.text()
  let accessories = null

  // Extract from React hydration: find "accessories":[ and bracket-match
  const accArrayPattern = /"accessories"\s*:\s*\[/g
  let match
  while ((match = accArrayPattern.exec(html)) !== null) {
    const startIdx = match.index + match[0].length - 1
    let depth = 1
    let i = startIdx + 1
    const maxLen = Math.min(startIdx + 500000, html.length)
    while (depth > 0 && i < maxLen) {
      if (html[i] === '[') depth++
      else if (html[i] === ']') depth--
      i++
    }
    if (depth === 0) {
      try {
        const parsed = JSON.parse(html.substring(startIdx, i))
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) {
          accessories = parsed
          break
        }
      } catch { /* try next match */ }
    }
  }

  if (accessories && accessories.length > 0) {
    console.log(`  ✅ ${model.slug}: ${accessories.length} accessories`)
    for (const acc of accessories) {
      allAccessories.push({ raw: acc, modelSlug: model.slug })
    }
  } else {
    console.log(`  ⚠️ ${model.slug}: no accessories found`)
  }
}

console.log(`\nTotal raw items: ${allAccessories.length}`)

// ── 3. Deduplicate by partNumber (same accessory can appear on multiple models) ──
const byPartNumber = new Map() // partNumber → { row, modelSlugs }

for (const { raw, modelSlug } of allAccessories) {
  const pn = raw.partNumber
  if (!pn) continue

  if (byPartNumber.has(pn)) {
    byPartNumber.get(pn).modelSlugs.add(modelSlug)
    continue
  }

  const imageUrl = raw.imageSrc
    ? (raw.imageSrc.startsWith('http') ? raw.imageSrc : `${MAZDA_BASE}${raw.imageSrc}`)
    : null

  const meta = {}
  if (raw.type) meta.type = raw.type
  if (raw.isPack) meta.is_pack = true
  if (raw.quantityRequired && raw.quantityRequired > 1) meta.quantity_required = raw.quantityRequired
  if (raw.conflictingAccessoryTypes) meta.conflicts = raw.conflictingAccessoryTypes
  if (raw.requiresAccessoryTypes) meta.requires = raw.requiresAccessoryTypes
  if (raw.disclaimer) meta.disclaimer = raw.disclaimer
  // Grade/body style compatibility from nameplate
  if (raw.nameplate?.children?.length > 0) {
    meta.body_styles = raw.nameplate.children.map(c => c.name)
    // Collect grade restrictions
    const grades = raw.nameplate.children.flatMap(bs =>
      (bs.children || []).map(g => g.name)
    ).filter(Boolean)
    if (grades.length > 0) meta.grades = [...new Set(grades)]
  }

  byPartNumber.set(pn, {
    row: {
      oem_id: OEM_ID,
      external_key: `mazda-${pn}`,
      name: raw.name,
      slug: slugify(raw.name),
      part_number: pn,
      category: raw.category || null,
      price: raw.price || null,
      description_html: raw.description || null,
      image_url: imageUrl,
      inc_fitting: 'none',
      parent_id: null,
      meta_json: Object.keys(meta).length > 0 ? meta : {},
    },
    modelSlugs: new Set([modelSlug]),
  })
}

const uniqueCount = byPartNumber.size
console.log(`Unique accessories (by partNumber): ${uniqueCount}`)

// ── 4. Delete existing Mazda accessories (clean re-seed) ──
console.log('Deleting existing Mazda accessories...')
const { error: delErr } = await supabase
  .from('accessories')
  .delete()
  .eq('oem_id', OEM_ID)
if (delErr) console.warn('Delete warning:', delErr.message)

// ── 5. Insert accessories in batches ──
console.log('Inserting accessories...')
const rows = [...byPartNumber.values()].map(v => v.row)
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
for (const [pn, { modelSlugs }] of byPartNumber.entries()) {
  const accId = extKeyToId.get(`mazda-${pn}`)
  if (!accId) continue

  for (const slug of modelSlugs) {
    const model = modelMap.get(slug)
    if (model) {
      joinRows.push({ accessory_id: accId, model_id: model.id })
    }
  }
}

// Deduplicate
const seen = new Set()
const uniqueJoinRows = joinRows.filter(r => {
  const key = `${r.accessory_id}:${r.model_id}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

if (uniqueJoinRows.length > 0) {
  const accIds = [...new Set(uniqueJoinRows.map(r => r.accessory_id))]
  const { error: delJoinErr } = await supabase
    .from('accessory_models')
    .delete()
    .in('accessory_id', accIds)
  if (delJoinErr) console.warn('Join delete warning:', delJoinErr.message)

  for (let i = 0; i < uniqueJoinRows.length; i += 200) {
    const batch = uniqueJoinRows.slice(i, i + 200)
    const { error: joinErr } = await supabase
      .from('accessory_models')
      .insert(batch)
    if (joinErr) console.error(`Join insert error (batch ${i}):`, joinErr.message)
  }
  console.log(`Inserted ${uniqueJoinRows.length} accessory_models rows`)
}

// ── 7. Summary ──
const { count: accTotal } = await supabase
  .from('accessories')
  .select('*', { count: 'exact', head: true })
  .eq('oem_id', OEM_ID)

const categories = [...new Set(rows.map(r => r.category).filter(Boolean))]
const prices = rows.map(r => r.price).filter(Boolean)

console.log('\n=== Mazda Accessories Seed Summary ===')
console.log(`Vehicle models:   ${upsertedModels.length}`)
console.log(`Accessories:      ${accTotal}`)
console.log(`Accessory-Models: ${uniqueJoinRows.length}`)
console.log(`Categories:       ${categories.join(', ')}`)
console.log(`Price range:      $${Math.min(...prices)} – $${Math.max(...prices)}`)
console.log('Done!')
