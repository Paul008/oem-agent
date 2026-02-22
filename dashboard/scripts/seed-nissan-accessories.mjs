#!/usr/bin/env node
// Seed Nissan accessories from server-rendered HTML on accessories pages
// Two page templates:
//   1. "Structured" (Navara, Qashqai): .accessory-name, .accessory-price, .accessory-part-number
//   2. "Rich-text" (X-Trail, Pathfinder, Patrol, Juke, Ariya): <h3> headings + "Fitted RRP: $X" in content
// Run: cd dashboard/scripts && node seed-nissan-accessories.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'nissan-au'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html',
}

const MODELS = [
  { name: 'Navara', slug: 'navara' },
  { name: 'X-Trail', slug: 'x-trail' },
  { name: 'Qashqai', slug: 'qashqai' },
  { name: 'Pathfinder', slug: 'pathfinder' },
  { name: 'Patrol', slug: 'patrol' },
  { name: 'Juke', slug: 'juke' },
  { name: 'Ariya', slug: 'ariya' },
]

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function cleanHtml(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── 1. Ensure vehicle_models exist ──
console.log('Ensuring Nissan vehicle_models exist...')
const modelUpsertRows = MODELS.map(m => ({ oem_id: OEM_ID, slug: m.slug, name: m.name }))
const { data: upsertedModels, error: modelErr } = await supabase
  .from('vehicle_models')
  .upsert(modelUpsertRows, { onConflict: 'oem_id,slug' })
  .select('id, slug, name')
if (modelErr) { console.error('Model upsert error:', modelErr.message); process.exit(1) }
console.log(`Upserted ${upsertedModels.length} vehicle_models`)
const modelMap = new Map(upsertedModels.map(m => [m.slug, m]))

// ── 2. Fetch and extract accessories from each model page ──
console.log('\nFetching accessories from Nissan model pages...')
const allAccessories = new Map() // key -> { name, partNumber, price, isFitted, isPack, modelSlugs }

for (const model of MODELS) {
  const url = `https://www.nissan.com.au/vehicles/browse-range/${model.slug}/accessories.html`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) { console.log(`  ${model.name}: HTTP ${res.status}`); continue }
  const html = await res.text()

  let count = 0

  // Strategy 1: Structured template (.accessory-name + .accessory-price pairs)
  const nameMatches = [...html.matchAll(/class="[^"]*accessory-name[^"]*"[^>]*>([\s\S]*?)<\//g)]
  const priceMatches = [...html.matchAll(/class="[^"]*accessory-price[^"]*"[^>]*>([\s\S]*?)<\//g)]
  const partMatches = [...html.matchAll(/class="[^"]*accessory-part-number[^"]*"[^>]*>([\s\S]*?)<\//g)]

  if (nameMatches.length > 0 && nameMatches.length === priceMatches.length) {
    for (let i = 0; i < nameMatches.length; i++) {
      const name = cleanHtml(nameMatches[i][1])
      const priceText = cleanHtml(priceMatches[i][1])
      const partRaw = partMatches[i] ? cleanHtml(partMatches[i][1]) : null
      const partNumber = partRaw ? partRaw.replace(/^Part\s*(?:number|#|no\.?):\s*/i, '').trim() : null

      const priceNum = parseFloat(priceText.replace(/[^0-9.]/g, ''))
      const isFitted = priceText.toLowerCase().includes('fitted')

      if (name && priceNum > 0 && priceNum < 50000) {
        const key = partNumber || `${name}|${priceNum}`
        if (!allAccessories.has(key)) {
          allAccessories.set(key, { name, partNumber, price: priceNum, isFitted, isPack: false, modelSlugs: new Set([model.slug]) })
        } else {
          allAccessories.get(key).modelSlugs.add(model.slug)
        }
        count++
      }
    }
  }

  // Strategy 2: Rich-text template — find all "Fitted RRP: $X" and associate with nearest heading
  // This catches items on pages without accessory-name class AND additional items on structured pages
  const fittedPattern = /Fitted RRP:\s*\$([0-9,]+)/g
  let fMatch
  while ((fMatch = fittedPattern.exec(html)) !== null) {
    const priceStr = fMatch[1].replace(/,/g, '')
    const price = parseFloat(priceStr)
    if (price <= 0 || price > 50000) continue

    // Look back for the nearest heading or name
    const before = html.substring(Math.max(0, fMatch.index - 1500), fMatch.index)

    // Try <h3> heading first
    let name = null
    const h3Match = before.match(/.*<h[3456][^>]*>\s*<span>([^<]+)<\/span>/s)
    if (h3Match) name = cleanHtml(h3Match[1])

    // Try image-card-heading
    if (!name) {
      const cardMatch = before.match(/.*class="[^"]*image-card-heading[^"]*"[^>]*>([^<]+)/s)
      if (cardMatch) name = cleanHtml(cardMatch[1])
    }

    // Try content within the same content block (for items like "TRUNK UPPER FINISHER (KE7916R050)")
    if (!name) {
      const boldMatch = before.match(/.*<b>([A-Z][^<]{3,60})<\/b>/s)
      if (boldMatch) name = cleanHtml(boldMatch[1])
    }

    if (!name) continue

    // Extract part number from nearby context
    const surrounding = html.substring(Math.max(0, fMatch.index - 500), Math.min(html.length, fMatch.index + 200))
    const partFromContext = surrounding.match(/(?:Part\s*(?:number|#|no\.?):?\s*)?([A-Z][A-Z0-9]{5,15}(?:AU)?)/i)
    // Also check for part number in parentheses within the name
    const partInName = name.match(/\(([A-Z][A-Z0-9]{5,15}(?:AU)?)\)/)
    let partNumber = partInName?.[1] || null
    if (!partNumber && partFromContext) {
      // Verify it looks like a real part number (not just a random word)
      const candidate = partFromContext[1]
      if (/^[A-Z][A-Z0-9]{4,}/.test(candidate) && candidate !== name.toUpperCase()) {
        partNumber = candidate
      }
    }

    // Clean name (remove part number in parens if present)
    const cleanName = name.replace(/\s*\([A-Z][A-Z0-9]+\)\s*$/, '').trim()

    const isPack = cleanName.toLowerCase().includes('pack')
    const key = partNumber || `${cleanName}|${price}`

    // Skip if already found via Strategy 1 (avoid dupes on Navara/Qashqai)
    if (!allAccessories.has(key)) {
      allAccessories.set(key, { name: cleanName, partNumber, price, isFitted: true, isPack, modelSlugs: new Set([model.slug]) })
      count++
    } else {
      allAccessories.get(key).modelSlugs.add(model.slug)
    }
  }

  // Strategy 3: Style pack sections (for structured pages)
  const packNameMatches = [...html.matchAll(/class="[^"]*style-pack-name[^"]*"[^>]*>([\s\S]*?)<\//g)]
  const packPriceMatches = [...html.matchAll(/class="[^"]*style-pack-price[^"]*"[^>]*>([\s\S]*?)<\//g)]
  const packDescMatches = [...html.matchAll(/class="[^"]*style-pack-description[^"]*"[^>]*>([\s\S]*?)<\//g)]

  const packCount = Math.min(packNameMatches.length, packPriceMatches.length)
  for (let i = 0; i < packCount; i++) {
    const name = cleanHtml(packNameMatches[i][1])
    const priceText = cleanHtml(packPriceMatches[i][1])
    const desc = packDescMatches[i] ? cleanHtml(packDescMatches[i][1]) : null
    const price = parseFloat(priceText.replace(/[^0-9.]/g, ''))

    if (name && price > 0 && price < 50000) {
      const key = `pack-${slugify(name)}-${model.slug}`
      if (!allAccessories.has(key)) {
        allAccessories.set(key, { name, partNumber: null, price, isFitted: true, isPack: true, description: desc, modelSlugs: new Set([model.slug]) })
        count++
      }
    }
  }

  console.log(`  ${model.name}: ${count} items`)
}

console.log(`\nTotal unique accessories: ${allAccessories.size}`)

// ── 3. Delete existing Nissan accessories ──
console.log('Deleting existing Nissan accessories...')
const { error: delErr } = await supabase.from('accessories').delete().eq('oem_id', OEM_ID)
if (delErr) console.warn('Delete warning:', delErr.message)

// ── 4. Build and insert accessory rows ──
console.log('Inserting accessories...')
const rows = []
const usedExtKeys = new Set()
for (const [key, acc] of allAccessories) {
  if (!acc.price || acc.price <= 0) continue

  const meta = {}
  if (acc.isPack) meta.is_pack = true
  if (acc.description) meta.description = acc.description

  // Ensure unique external_key
  let extKey = `nissan-${acc.partNumber || slugify(acc.name)}`
  if (usedExtKeys.has(extKey)) {
    extKey = `nissan-${slugify(acc.name)}-${Math.round(acc.price)}`
  }
  if (usedExtKeys.has(extKey)) {
    extKey = `nissan-${slugify(key)}`
  }
  usedExtKeys.add(extKey)

  rows.push({
    oem_id: OEM_ID,
    external_key: extKey,
    name: acc.name,
    slug: slugify(acc.name),
    part_number: acc.partNumber || null,
    category: acc.isPack ? 'Packs' : null,
    price: acc.price,
    description_html: acc.description || null,
    image_url: null, // No reliable image URLs from HTML extraction
    inc_fitting: acc.isFitted ? 'includes' : 'none',
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
// Build reverse map from acc data to inserted IDs
const accKeyToId = new Map()
for (const [extKey, id] of extKeyToId) {
  accKeyToId.set(extKey, id)
}

const joinRows = []
// Match rows array indices to allAccessories entries
let rowIdx = 0
for (const [key, acc] of allAccessories) {
  if (!acc.price || acc.price <= 0) continue
  const row = rows[rowIdx++]
  if (!row) continue
  const accId = extKeyToId.get(row.external_key)
  if (!accId) continue

  for (const slug of acc.modelSlugs) {
    const model = modelMap.get(slug)
    if (model) joinRows.push({ accessory_id: accId, model_id: model.id })
  }
}

const seen = new Set()
const uniqueJoins = joinRows.filter(r => {
  const k = `${r.accessory_id}:${r.model_id}`
  if (seen.has(k)) return false
  seen.add(k)
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

console.log('\n=== Nissan Accessories Seed Summary ===')
console.log(`Vehicle models:   ${upsertedModels.length}`)
console.log(`Accessories:      ${accTotal}`)
console.log(`Accessory-Models: ${uniqueJoins.length}`)
console.log(`Price range:      $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)
console.log('Done!')
