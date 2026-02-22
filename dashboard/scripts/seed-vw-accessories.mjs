#!/usr/bin/env node
// Seed VW (Volkswagen Australia) accessories from e-catalogue GraphQL API
// Source: volkswagen-genuine-accessories.com/au/api/graphql/
// Auth: Bearer token from auto-issued accessToken cookie (guest session)
// Schema: Product→variations(Item) with price(Money{amount,currencyCode})
// Product listing: ProductSearchResult.entries[].product via category tree

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'volkswagen-au'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
}

// ── 1. Get auth token ──────────────────────────────────────────────────────
console.log('=== Getting VW e-catalogue access token ===')
const pageRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/', { headers: HEADERS })
const setCookies = pageRes.headers.getSetCookie?.() || []
let accessToken = null
let cookieParts = []
for (const c of setCookies) {
  const [nameVal] = c.split(';')
  cookieParts.push(nameVal)
  if (nameVal.startsWith('accessToken=')) accessToken = nameVal.replace('accessToken=', '')
}
if (!accessToken) { console.error('Failed to get accessToken'); process.exit(1) }
console.log('Token: yes')

const GQL_URL = 'https://volkswagen-genuine-accessories.com/au/api/graphql/'
const gqlHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Authorization: `Bearer ${accessToken}`,
  Cookie: cookieParts.join('; '),
  Origin: 'https://volkswagen-genuine-accessories.com',
  Referer: 'https://volkswagen-genuine-accessories.com/au/en/',
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: gqlHeaders,
    body: JSON.stringify({ query, variables })
  })
  return res.json()
}

// ── 2. Fetch full category tree ────────────────────────────────────────────
console.log('\n=== Fetching category tree ===')
const TOP_CATEGORIES = [
  { name: 'Sport & Design', id: '160985513' },
  { name: 'Transport', id: '160985549' },
  { name: 'Comfort & Protection', id: '160985565' },
  { name: 'Communication', id: '160988427' },
  { name: 'Wheels', id: '160988447' },
  { name: 'E-Charging', id: '160988463' },
  { name: 'Lifestyle', id: '198280310' },
]

// Collect all leaf category IDs (subcategories with products)
const allCategories = []
for (const topCat of TOP_CATEGORIES) {
  const result = await gql(`{
    core_category(id: "${topCat.id}") {
      id name
      children { id name children { id name } }
    }
  }`)
  const cat = result.data?.core_category
  if (!cat) continue

  // Add the top category itself
  allCategories.push({ id: cat.id, name: cat.name, parent: null })

  for (const child of cat.children || []) {
    allCategories.push({ id: child.id, name: child.name, parent: cat.name })
    for (const grandchild of child.children || []) {
      allCategories.push({ id: grandchild.id, name: grandchild.name, parent: child.name })
    }
  }
}

console.log(`Found ${allCategories.length} categories`)

// ── 3. Fetch all products from each top-level category ─────────────────────
console.log('\n=== Fetching products from categories ===')
const allProducts = new Map()  // dedup by product ID
const productCategories = new Map()  // product ID → category name

const PRODUCT_QUERY = `query GetFullCategory($coreCategoryId: ID!, $paging: SearchPaging!, $filter: CategorySearchFilter!) {
  core_category(id: $coreCategoryId) {
    id name
    products(paging: $paging, filter: $filter) {
      ... on ProductSearchResult {
        totalCount
        entries {
          product {
            id
            name
            shortDescription
            differentiatingFeature
            variations {
              id
              sku
              shortDescription
              price { amount currencyCode }
              images { url }
              link { url }
              availability { available status }
            }
          }
        }
      }
    }
  }
}`

for (const topCat of TOP_CATEGORIES) {
  // First get totalCount
  const countResult = await gql(PRODUCT_QUERY, {
    coreCategoryId: topCat.id,
    paging: { offset: 0, limit: 1 },
    filter: {}
  })
  const totalCount = countResult.data?.core_category?.products?.totalCount || 0
  if (totalCount === 0) {
    console.log(`  ${topCat.name}: 0 products`)
    continue
  }

  // Paginate through all products
  let offset = 0
  const PAGE_SIZE = 50
  let catNewCount = 0

  while (offset < totalCount) {
    const result = await gql(PRODUCT_QUERY, {
      coreCategoryId: topCat.id,
      paging: { offset, limit: PAGE_SIZE },
      filter: {}
    })

    const entries = result.data?.core_category?.products?.entries || []
    for (const entry of entries) {
      const product = entry.product
      if (!product || allProducts.has(product.id)) continue
      allProducts.set(product.id, product)
      productCategories.set(product.id, topCat.name)
      catNewCount++
    }

    offset += PAGE_SIZE
    if (entries.length < PAGE_SIZE) break
  }

  console.log(`  ${topCat.name}: ${totalCount} total, ${catNewCount} new unique`)
}

console.log(`\nTotal unique products: ${allProducts.size}`)

// ── 4. Map products to vehicle models via search suggest ────────────────────
// The e-catalogue doesn't have car model associations on products.
// We can't determine which accessories fit which VW models from the API.
// Products are categorized by type (Sport & Design, Transport, etc.) not by model.
// We'll store all accessories with category info and skip model mapping.

// ── 5. Build accessory rows ────────────────────────────────────────────────
console.log('\n=== Building accessory rows ===')
const accessoryRows = []

for (const [productId, product] of allProducts) {
  // Use the first variation for price/image (most products have 1 variation)
  const primaryVariation = product.variations?.[0]
  const price = primaryVariation?.price?.amount || null
  const sku = primaryVariation?.sku || null
  const imageUrl = primaryVariation?.images?.[0]?.url || null
  const category = productCategories.get(productId) || null
  const link = primaryVariation?.link?.url
    ? `https://volkswagen-genuine-accessories.com${primaryVariation.link.url}`
    : null

  // Store additional variations in meta_json
  const extraVariations = (product.variations || []).slice(1).map(v => ({
    sku: v.sku,
    price: v.price?.amount,
    shortDescription: v.shortDescription,
    imageUrl: v.images?.[0]?.url,
  })).filter(v => v.sku)

  const meta = {}
  if (product.differentiatingFeature) meta.differentiatingFeature = product.differentiatingFeature
  if (extraVariations.length > 0) meta.additionalVariations = extraVariations
  if (link) meta.link = link

  const slug = (product.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  accessoryRows.push({
    oem_id: OEM_ID,
    external_key: productId,
    name: product.name,
    slug,
    part_number: sku,
    category,
    price,
    description_html: product.shortDescription || null,
    image_url: imageUrl,
    inc_fitting: 'none',
    meta_json: Object.keys(meta).length > 0 ? meta : null,
  })
}

console.log(`Built ${accessoryRows.length} accessory rows`)

// Price stats
const prices = accessoryRows.filter(r => r.price).map(r => r.price)
if (prices.length > 0) {
  console.log(`Prices: $${Math.min(...prices).toFixed(2)} – $${Math.max(...prices).toFixed(2)} (${prices.length} with price)`)
}

// Category breakdown
const catCounts = {}
for (const row of accessoryRows) {
  catCounts[row.category || 'uncategorized'] = (catCounts[row.category || 'uncategorized'] || 0) + 1
}
for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`)
}

// ── 6. Upsert accessories ──────────────────────────────────────────────────
console.log('\n=== Upserting accessories ===')

// Delete existing VW accessories
const { error: delErr } = await supabase
  .from('accessories')
  .delete()
  .eq('oem_id', OEM_ID)
if (delErr) console.error('Delete error:', delErr.message)

// Insert in batches of 200
let inserted = 0
for (let i = 0; i < accessoryRows.length; i += 200) {
  const batch = accessoryRows.slice(i, i + 200)
  const { error } = await supabase.from('accessories').insert(batch)
  if (error) {
    console.error(`Insert error at batch ${i}:`, error.message)
  } else {
    inserted += batch.length
  }
}
console.log(`Inserted ${inserted} accessories`)

// ── 7. Verify ──────────────────────────────────────────────────────────────
console.log('\n=== Verification ===')
const { data: accCount } = await supabase
  .from('accessories')
  .select('id', { count: 'exact', head: true })
  .eq('oem_id', OEM_ID)
console.log(`VW accessories in DB: ${accCount}`)

const { count: totalAcc } = await supabase
  .from('accessories')
  .select('id', { count: 'exact', head: true })
console.log(`Total accessories in DB: ${totalAcc}`)

const { count: totalJoins } = await supabase
  .from('accessory_models')
  .select('id', { count: 'exact', head: true })
console.log(`Total accessory_models in DB: ${totalJoins}`)

// Note: VW e-catalogue doesn't associate accessories with car models
// so we don't populate accessory_models for VW
console.log('\nNote: VW e-catalogue has no car model associations.')
console.log('Accessories are categorized by type (Sport & Design, Transport, etc.).')
console.log('No accessory_models rows created for VW.')
