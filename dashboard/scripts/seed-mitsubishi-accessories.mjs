#!/usr/bin/env node
// Seed Mitsubishi accessories from Magento 2 GraphQL
// Source: store.mitsubishi-motors.com.au/graphql (category 133)
// Run: cd dashboard/scripts && node seed-mitsubishi-accessories.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'mitsubishi-au'
const GRAPHQL_URL = 'https://store.mitsubishi-motors.com.au/graphql'

// Map Magento subcategory IDs → vehicle_model slugs
// Top-level subcategories of cat 133 determine model assignment
const CATEGORY_MODEL_MAP = {
  461: ['triton-2025'],                  // Triton 25MY Accessories
  464: ['triton-2025'],                  // Triton 25MY Pick Up
  467: ['triton-2025'],                  // Triton 25MY Cab Chassis
  506: ['pajero-sport-2025'],            // Pajero Sport 25MY
  430: ['outlander-2025', 'outlander-phev-2024'], // Outlander 24MY (both powertrains still current)
  482: ['outlander-2025'],               // Outlander 24MY Unleaded
  485: ['outlander-phev-2024'],          // Outlander 24MY PHEV
  518: ['outlander-2025'],               // Outlander 25MY
  524: ['outlander-2025'],               // Outlander 25MY Unleaded
  530: ['outlander-phev-2024'],          // Outlander 25MY PHEV (maps to PHEV model)
  439: ['eclipse-cross-2024'],           // Eclipse Cross 24MY
  494: ['eclipse-cross-2024'],           // Eclipse Cross 24MY PHEV
  536: ['asx-2025'],                     // ASX 25MY
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function gql(query) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  if (!res.ok) throw new Error(`GraphQL fetch failed: ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(`GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`)
  return json.data
}

// ── 1. Fetch all accessories from category 133 with pagination ──
console.log('Fetching Mitsubishi accessories from Magento GraphQL...')
let page = 1
const pageSize = 50
const allItems = []

while (true) {
  const data = await gql(`{
    products(filter: { category_id: { eq: "133" } }, pageSize: ${pageSize}, currentPage: ${page}) {
      total_count
      page_info { current_page total_pages }
      items {
        id
        sku
        name
        url_key
        price_range {
          minimum_price {
            final_price { value currency }
          }
        }
        categories { id name }
        image { url label }
        description { html }
        short_description { html }
      }
    }
  }`)

  const products = data.products
  if (!products?.items?.length) break

  allItems.push(...products.items)
  console.log(`  Page ${page}/${products.page_info.total_pages}: ${products.items.length} items`)

  if (page >= products.page_info.total_pages) break
  page++
}
console.log(`Fetched ${allItems.length} accessories total`)

// ── 2. Load existing vehicle_models for join table ──
const { data: dbModels, error: modelsErr } = await supabase
  .from('vehicle_models')
  .select('id, slug, name')
  .eq('oem_id', OEM_ID)
if (modelsErr) { console.error('Failed to load models:', modelsErr.message); process.exit(1) }

const modelSlugToId = new Map(dbModels.map(m => [m.slug, m.id]))
console.log('DB models:', dbModels.map(m => m.slug).join(', '))

// ── 3. Delete existing Mitsubishi accessories (clean re-seed) ──
console.log('Deleting existing Mitsubishi accessories...')
const { error: delErr } = await supabase
  .from('accessories')
  .delete()
  .eq('oem_id', OEM_ID)
if (delErr) console.warn('Delete warning:', delErr.message)

// ── 4. Build accessory rows ──
const accessoryRows = allItems.map(item => {
  const price = item.price_range?.minimum_price?.final_price?.value || null
  const descHtml = item.description?.html || item.short_description?.html || null

  // Determine category from the most specific subcategory
  const catIds = (item.categories || []).map(c => parseInt(c.id))
  let category = null
  // Try to find the deepest subcategory name (not "Accessories" which is 133)
  for (const cat of item.categories || []) {
    if (parseInt(cat.id) !== 133 && cat.name !== 'Accessories') {
      // Use the first model-specific category found
      category = cat.name.replace(/\s*\d+MY\s*/, ' ').replace(/Accessories$/, '').trim()
      break
    }
  }

  return {
    oem_id: OEM_ID,
    external_key: item.sku,
    name: item.name,
    slug: item.url_key || slugify(item.name),
    part_number: item.sku,
    category,
    price,
    description_html: descHtml,
    image_url: item.image?.url || null,
    inc_fitting: 'none',
    parent_id: null,
    meta_json: {
      magento_id: item.id,
      category_ids: catIds.filter(id => id !== 133),
    }
  }
})

// ── 5. Insert accessories in batches ──
console.log('Inserting accessories...')
const insertedMap = new Map() // sku → id

for (let i = 0; i < accessoryRows.length; i += 100) {
  const batch = accessoryRows.slice(i, i + 100)
  const { data: inserted, error: insErr } = await supabase
    .from('accessories')
    .upsert(batch, { onConflict: 'oem_id,external_key' })
    .select('id, external_key')
  if (insErr) { console.error(`Insert error (batch ${i}):`, insErr.message); process.exit(1) }
  inserted.forEach(r => insertedMap.set(r.external_key, r.id))
}
console.log(`Inserted ${insertedMap.size} accessories`)

// ── 6. Build accessory_models join table ──
console.log('Building accessory_models join table...')
const joinRows = []
const seen = new Set()

for (const item of allItems) {
  const accId = insertedMap.get(item.sku)
  if (!accId) continue

  // Determine which vehicle_models this accessory maps to based on its categories
  const modelSlugs = new Set()
  for (const cat of item.categories || []) {
    const catId = parseInt(cat.id)
    const slugs = CATEGORY_MODEL_MAP[catId]
    if (slugs) slugs.forEach(s => modelSlugs.add(s))
  }

  for (const slug of modelSlugs) {
    const modelId = modelSlugToId.get(slug)
    if (!modelId) {
      console.warn(`  No DB model for slug: ${slug}`)
      continue
    }
    const key = `${accId}:${modelId}`
    if (!seen.has(key)) {
      seen.add(key)
      joinRows.push({ accessory_id: accId, model_id: modelId })
    }
  }
}

if (joinRows.length > 0) {
  // Delete existing join rows
  const accIds = [...new Set(joinRows.map(r => r.accessory_id))]
  for (let i = 0; i < accIds.length; i += 200) {
    const batch = accIds.slice(i, i + 200)
    await supabase.from('accessory_models').delete().in('accessory_id', batch)
  }

  // Insert in batches
  for (let i = 0; i < joinRows.length; i += 200) {
    const batch = joinRows.slice(i, i + 200)
    const { error: joinErr } = await supabase.from('accessory_models').insert(batch)
    if (joinErr) console.error(`Join insert error (batch ${i}):`, joinErr.message)
  }
  console.log(`Inserted ${joinRows.length} accessory_models rows`)
} else {
  console.log('No accessory_models rows to insert')
}

// ── 7. Summary ──
const { count: accCount } = await supabase.from('accessories').select('*', { count: 'exact', head: true }).eq('oem_id', OEM_ID)
const { data: joinData } = await supabase.from('accessory_models').select('accessory_id, accessories!inner(oem_id)').eq('accessories.oem_id', OEM_ID)

const categories = [...new Set(accessoryRows.map(r => r.category).filter(Boolean))]

console.log('\n=== Mitsubishi Accessories Seed Summary ===')
console.log(`Accessories:      ${accCount}`)
console.log(`Accessory-Models: ${joinData?.length || 0}`)
console.log(`Categories:       ${categories.join(', ')}`)
console.log(`Price range:      $${Math.min(...accessoryRows.filter(r => r.price).map(r => r.price))} – $${Math.max(...accessoryRows.filter(r => r.price).map(r => r.price))}`)
console.log(`Models mapped:    ${[...new Set(joinRows.map(r => r.model_id))].length}`)
console.log('Done!')
