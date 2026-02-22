#!/usr/bin/env node
// Seed KGM (formerly SsangYong) accessories from Payload CMS
// Source: payloadb.therefinerydesign.com/api/accessories
// Run: cd dashboard/scripts && node seed-kgm-accessories.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'kgm-au'
const PAYLOAD_BASE = 'https://payloadb.therefinerydesign.com'

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── 1. Fetch all accessories from Payload CMS ──
console.log('Fetching KGM accessories from Payload CMS...')
const res = await fetch(`${PAYLOAD_BASE}/api/accessories?limit=1000&depth=3`, {
  headers: {
    'Origin': 'https://www.kgm.com',
    'Referer': 'https://www.kgm.com/'
  }
})
if (!res.ok) { console.error('Fetch failed:', res.status); process.exit(1) }
const { docs, totalDocs } = await res.json()
console.log(`Fetched ${docs.length}/${totalDocs} accessories`)

// ── 2. Load existing KGM vehicle_models for join table ──
const { data: dbModels, error: modelsErr } = await supabase
  .from('vehicle_models')
  .select('id, slug, name')
  .eq('oem_id', OEM_ID)
if (modelsErr) { console.error('Failed to load models:', modelsErr.message); process.exit(1) }

// Map API model slugs to DB model records
// API uses: torres, musso-ev, actyon, musso, korando, rexton
// DB uses: torres, musso-ev-my26, actyon, musso-my26, korando, rexton-my26 (and MY24 variants)
const modelSlugMap = new Map()
for (const m of dbModels) {
  // Prefer MY26 models for the mapping, but also store base slug → model
  const baseSlug = m.slug.replace(/-my\d+$/, '')
  if (!modelSlugMap.has(baseSlug) || m.slug.includes('my26')) {
    modelSlugMap.set(baseSlug, m)
  }
}
console.log('Model slug map:', [...modelSlugMap.entries()].map(([k, v]) => `${k} → ${v.slug}`))

// ── 3. Delete existing KGM accessories (clean re-seed) ──
console.log('Deleting existing KGM accessories...')
const { error: delErr } = await supabase
  .from('accessories')
  .delete()
  .eq('oem_id', OEM_ID)
if (delErr) console.warn('Delete warning:', delErr.message)

// ── 4. Separate parents from children ──
const parents = docs.filter(d => !d.parent)
const children = docs.filter(d => d.parent)
console.log(`Parents: ${parents.length}, Children: ${children.length}`)

// ── 5. Build accessory rows ──
function buildRow(doc) {
  const name = doc.name || doc.title
  const slug = slugify(name)
  const imageUrl = doc.image?.url || doc.image?.filename
    ? `${PAYLOAD_BASE}${doc.image.url || `/api/media/file/${doc.image.filename}`}`
    : null

  const category = Array.isArray(doc.category) && doc.category.length > 0
    ? (typeof doc.category[0] === 'object' ? doc.category[0].title : String(doc.category[0]))
    : null

  const meta = {}
  if (doc.tags?.length) meta.tags = doc.tags.map(t => typeof t === 'object' ? t.name || t.title : t)
  if (doc.variants?.length) meta.variants = doc.variants
  if (doc.SubAccessories?.length) meta.sub_accessory_ids = doc.SubAccessories.map(s => typeof s === 'object' ? s.id : s)
  if (doc.conflicts?.length) meta.conflicts = doc.conflicts.map(c => typeof c === 'object' ? c.id : c)

  return {
    oem_id: OEM_ID,
    external_key: `kgm-acc-${doc.id}`,
    name,
    slug,
    part_number: doc.part_number || null,
    category,
    price: doc.price || null,
    description_html: doc.description_html || null,
    image_url: imageUrl,
    inc_fitting: doc.inc_fitting || 'none',
    parent_id: null, // set later for children
    meta_json: Object.keys(meta).length > 0 ? meta : {}
  }
}

// ── 6. Insert parent accessories ──
console.log('Inserting parent accessories...')
const parentRows = parents.map(buildRow)
const { data: insertedParents, error: parentErr } = await supabase
  .from('accessories')
  .upsert(parentRows, { onConflict: 'oem_id,external_key' })
  .select('id, external_key')
if (parentErr) { console.error('Parent insert error:', parentErr.message); process.exit(1) }
console.log(`Inserted ${insertedParents.length} parent accessories`)

// Build external_key → id map for parent lookups
const extKeyToId = new Map(insertedParents.map(r => [r.external_key, r.id]))

// Also build payload_id → db_id for children to find parents
const payloadIdToDbId = new Map()
parents.forEach(doc => {
  const extKey = `kgm-acc-${doc.id}`
  if (extKeyToId.has(extKey)) {
    payloadIdToDbId.set(doc.id, extKeyToId.get(extKey))
  }
})

// ── 7. Insert child accessories with parent_id ──
if (children.length > 0) {
  console.log('Inserting child accessories...')
  const childRows = children.map(doc => {
    const row = buildRow(doc)
    const parentPayloadId = typeof doc.parent === 'object' ? doc.parent.id : doc.parent
    row.parent_id = payloadIdToDbId.get(parentPayloadId) || null
    return row
  })

  const { data: insertedChildren, error: childErr } = await supabase
    .from('accessories')
    .upsert(childRows, { onConflict: 'oem_id,external_key' })
    .select('id, external_key')
  if (childErr) { console.error('Child insert error:', childErr.message); process.exit(1) }
  console.log(`Inserted ${insertedChildren.length} child accessories`)

  // Add to map
  insertedChildren.forEach(r => extKeyToId.set(r.external_key, r.id))
}

// ── 8. Populate accessory_models join table ──
console.log('Building accessory_models join table...')
const joinRows = []
for (const doc of docs) {
  const accId = extKeyToId.get(`kgm-acc-${doc.id}`)
  if (!accId) continue

  if (doc.models?.length > 0) {
    for (const m of doc.models) {
      const apiSlug = typeof m === 'object' ? m.slug : null
      if (!apiSlug) continue

      const dbModel = modelSlugMap.get(apiSlug)
      if (dbModel) {
        joinRows.push({ accessory_id: accId, model_id: dbModel.id })
      } else {
        console.warn(`  No DB model for API slug: ${apiSlug}`)
      }
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
  // Delete existing join rows for these accessories
  const accIds = [...new Set(uniqueJoinRows.map(r => r.accessory_id))]
  const { error: delJoinErr } = await supabase
    .from('accessory_models')
    .delete()
    .in('accessory_id', accIds)
  if (delJoinErr) console.warn('Join delete warning:', delJoinErr.message)

  // Insert in batches of 200
  for (let i = 0; i < uniqueJoinRows.length; i += 200) {
    const batch = uniqueJoinRows.slice(i, i + 200)
    const { error: joinErr } = await supabase
      .from('accessory_models')
      .insert(batch)
    if (joinErr) console.error(`Join insert error (batch ${i}):`, joinErr.message)
  }
  console.log(`Inserted ${uniqueJoinRows.length} accessory_models rows`)
} else {
  console.log('No accessory_models rows to insert')
}

// ── 9. Summary ──
const { count: accCount } = await supabase.from('accessories').select('*', { count: 'exact', head: true }).eq('oem_id', OEM_ID)
const { data: joinCount } = await supabase.from('accessory_models').select('accessory_id, accessories!inner(oem_id)').eq('accessories.oem_id', OEM_ID)

console.log('\n=== KGM Accessories Seed Summary ===')
console.log(`Accessories:      ${accCount}`)
console.log(`Accessory-Models: ${joinCount?.length || 0}`)
console.log(`Categories:       ${[...new Set(parentRows.concat(children.map(buildRow)).map(r => r.category).filter(Boolean))].join(', ')}`)
console.log(`Price range:      $${Math.min(...docs.filter(d => d.price).map(d => d.price))} – $${Math.max(...docs.filter(d => d.price).map(d => d.price))}`)
console.log(`With parent:      ${children.length}`)
console.log('Done!')
