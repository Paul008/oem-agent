#!/usr/bin/env node
/**
 * Seed Subaru Australia variant colors (and products if missing) from Retailer API v1.
 *
 * Data source: /models → /models/{id}/variants (includes colourOptions[])
 * Each colourOption has: name, hexColourCode, colourCode, priceEffect,
 *   frontImageUrl, rearImageUrl, frontImageHighResUrl, rearImageHighResUrl
 *
 * Run: cd dashboard/scripts && node seed-subaru-colors.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'subaru-au'
const API_BASE = 'https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api/v1'
const API_KEY = 'w68ewXf97mnPODxXG6ZA4FKhP65wpUK576oLryW9'
const HEADERS = { 'x-api-key': API_KEY, Accept: 'application/json' }

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function deriveColorType(name) {
  const lower = name.toLowerCase()
  if (lower.includes('pearl')) return 'pearl'
  if (lower.includes('metallic')) return 'metallic'
  if (lower.includes('mica')) return 'mica'
  // Solid colors have priceEffect=0 typically, but also detect by name
  if (lower.includes('white') || lower.includes('red') || lower.includes('black')) {
    // Could still be pearl/metallic, caught above — this is fallback
    return 'solid'
  }
  return 'metallic' // default assumption for premium paints
}

// ── 1. Fetch all models from API ──
console.log('=== Step 1: Fetch Subaru models from API ===\n')

const modelsRes = await fetch(`${API_BASE}/models/`, { headers: HEADERS })
if (!modelsRes.ok) { console.error(`Models API failed: ${modelsRes.status}`); process.exit(1) }
const apiModels = await modelsRes.json()
console.log(`  API returned ${apiModels.length} model entries`)

// Deduplicate by name, keep latest year
const modelsByName = new Map()
for (const m of apiModels) {
  const name = m.name.replace(/^All-new\s+/i, '')
  if (!modelsByName.has(name) || m.year > modelsByName.get(name).year) {
    modelsByName.set(name, m)
  }
}
console.log(`  Unique models: ${modelsByName.size}`)

// ── 2. Ensure vehicle_models exist ──
console.log('\n=== Step 2: Upsert vehicle_models ===\n')

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
console.log(`  Upserted ${upsertedModels.length} vehicle_models`)
const modelMap = new Map(upsertedModels.map(m => [m.slug, m]))

// ── 3. Fetch all variants with colour data ──
console.log('\n=== Step 3: Fetch variants from API ===\n')

const allVariants = [] // { variant, modelName, modelSlug, apiModelId }

for (const [name, apiModel] of modelsByName) {
  const modelSlug = slugify(name)
  // Check all API entries for this model name (diff years may have diff variants)
  const entries = apiModels.filter(m =>
    m.name.replace(/^All-new\s+/i, '') === name
  )

  for (const entry of entries) {
    const varRes = await fetch(`${API_BASE}/models/${entry.id}/variants`, { headers: HEADERS })
    if (!varRes.ok) { console.log(`  ${name} (${entry.year}): API ${varRes.status}`); continue }
    const variants = await varRes.json()

    for (const v of variants) {
      // Skip duplicates (same fhiCode across model years)
      if (allVariants.some(av => av.variant.fhiCode === v.fhiCode)) continue
      allVariants.push({ variant: v, modelName: name, modelSlug, apiModelId: entry.id })
    }
  }
  const count = allVariants.filter(v => v.modelSlug === modelSlug).length
  console.log(`  ${name}: ${count} unique variants`)
}

console.log(`  Total unique variants: ${allVariants.length}`)

// ── 4. Ensure products exist for each variant ──
console.log('\n=== Step 4: Upsert products ===\n')

const productRows = []
for (const { variant: v, modelSlug } of allVariants) {
  const externalKey = `subaru-${slugify(v.seriesName || v.name)}`
  const model = modelMap.get(modelSlug)

  productRows.push({
    oem_id: OEM_ID,
    external_key: externalKey,
    title: v.name,
    subtitle: v.seriesName || null,
    body_type: v.bodyStyle || null,
    fuel_type: v.fuel || null,
    availability: 'available',
    price_amount: v.manufacturersListPrice || null,
    price_currency: 'AUD',
    price_type: 'mlp',
    drivetrain: v.name.toLowerCase().includes('awd') ? 'AWD' : null,
    variant_name: v.seriesName || v.name,
    variant_code: v.fhiCode || null,
    model_id: model?.id || null,
    source_url: 'https://www.subaru.com.au',
    meta_json: {
      source: 'retailer_api_v1',
      api_variant_id: v.id,
      api_model_id: v.vehicleModelId,
      transmission: v.transmission,
      engine_capacity: v.engineCapacity,
      cylinders: v.cylinders,
      year: v.year,
      is_hybrid: v.isHybrid,
      is_electric: v.isElectric,
      redbook_code: v.redbookCode,
      image_src: v.imageSrc,
    },
    last_seen_at: new Date().toISOString(),
  })
}

// Delete old products + related data
const { data: oldProducts } = await supabase
  .from('products')
  .select('id')
  .eq('oem_id', OEM_ID)
if (oldProducts?.length) {
  const oldIds = oldProducts.map(p => p.id)
  await supabase.from('variant_colors').delete().in('product_id', oldIds)
  await supabase.from('variant_pricing').delete().in('product_id', oldIds)
  await supabase.from('products').delete().eq('oem_id', OEM_ID)
  console.log(`  Deleted ${oldProducts.length} old products + related data`)
}

// Deduplicate product rows by title (DB has unique constraint on oem_id, title)
const seenTitles = new Set()
const dedupedProductRows = []
for (const row of productRows) {
  if (seenTitles.has(row.title)) {
    console.log(`  Skipping duplicate title: ${row.title}`)
    continue
  }
  seenTitles.add(row.title)
  dedupedProductRows.push(row)
}

// Insert products in batches
let insertedProdCount = 0
const prodLookup = new Map() // external_key → product_id
const titleToProductId = new Map() // title → product_id (for variant→product mapping)
for (let i = 0; i < dedupedProductRows.length; i += 200) {
  const batch = dedupedProductRows.slice(i, i + 200)
  const { data: inserted, error: insErr } = await supabase
    .from('products')
    .insert(batch)
    .select('id, external_key, title')
  if (insErr) { console.error(`Product insert error (batch ${i}):`, insErr.message); continue }
  insertedProdCount += inserted.length
  for (const p of inserted) {
    prodLookup.set(p.external_key, p.id)
    titleToProductId.set(p.title, p.id)
  }
}
console.log(`  Upserted ${insertedProdCount} products`)

// ── 5. Build and insert variant_colors ──
console.log('\n=== Step 5: Insert variant_colors ===\n')

const colorRows = []
const seenColorKeys = new Set() // product_id:color_code dedupe
let variantsWithColors = 0
let variantsWithoutColors = 0

for (const { variant: v } of allVariants) {
  // Look up product by title (handles deduped variants)
  const productId = titleToProductId.get(v.name)
  if (!productId) continue

  const colours = v.colourOptions || []
  if (colours.length === 0) {
    variantsWithoutColors++
    continue
  }
  variantsWithColors++

  for (let idx = 0; idx < colours.length; idx++) {
    const c = colours[idx]
    const colorCode = c.colourCode || slugify(c.name)
    const dedupeKey = `${productId}:${colorCode}`
    if (seenColorKeys.has(dedupeKey)) continue
    seenColorKeys.add(dedupeKey)

    const isStandard = (c.priceEffect || 0) === 0
    const colorType = deriveColorType(c.name)

    // hero_image_url = front high-res render
    const heroUrl = c.frontImageHighResUrl || c.frontImageUrl || null
    const notAvail = 'photo-not-avail'

    // Build gallery from all available images (skip "not available" placeholders)
    const gallery = [
      c.frontImageUrl,
      c.rearImageUrl,
      c.sideImageUrl,
      c.directFrontImageUrl,
      c.directRearImageUrl,
      c.frontImageHighResUrl,
      c.rearImageHighResUrl,
    ].filter(u => u && !u.includes(notAvail))

    colorRows.push({
      product_id: productId,
      color_code: colorCode,
      color_name: c.name,
      color_type: colorType,
      is_standard: isStandard,
      price_delta: c.priceEffect || 0,
      swatch_url: null, // API has no swatch images — hex code in meta_json
      hero_image_url: heroUrl && !heroUrl.includes(notAvail) ? heroUrl : null,
      gallery_urls: gallery.length > 0 ? gallery : [],
      sort_order: idx,
    })
  }
}

console.log(`  Variants with colors: ${variantsWithColors}`)
console.log(`  Variants without colors: ${variantsWithoutColors}`)
console.log(`  Total color rows to insert: ${colorRows.length}`)

// Insert in batches
let insertedColorCount = 0
for (let i = 0; i < colorRows.length; i += 200) {
  const batch = colorRows.slice(i, i + 200)
  const { data: inserted, error: insErr } = await supabase
    .from('variant_colors')
    .insert(batch)
    .select('id')
  if (insErr) { console.error(`Color insert error (batch ${i}):`, insErr.message); continue }
  insertedColorCount += inserted.length
}
console.log(`  Inserted ${insertedColorCount} variant_colors`)

// ── 6. Insert variant_pricing ──
console.log('\n=== Step 6: Insert variant_pricing ===\n')

const pricingRows = []
const seenPricingKeys = new Set()
for (const { variant: v } of allVariants) {
  const productId = titleToProductId.get(v.name)
  if (!productId || !v.manufacturersListPrice) continue

  const pricingKey = `${productId}:mlp`
  if (seenPricingKeys.has(pricingKey)) continue
  seenPricingKeys.add(pricingKey)

  pricingRows.push({
    product_id: productId,
    price_type: 'mlp',
    rrp: v.manufacturersListPrice,
    fetched_at: new Date().toISOString(),
  })
}

if (pricingRows.length > 0) {
  for (let i = 0; i < pricingRows.length; i += 200) {
    const batch = pricingRows.slice(i, i + 200)
    const { error: priceErr } = await supabase.from('variant_pricing').insert(batch)
    if (priceErr) console.error(`Pricing error (batch ${i}):`, priceErr.message)
  }
  console.log(`  Inserted ${pricingRows.length} pricing rows`)
} else {
  console.log('  No pricing data available')
}

// ── 7. Verification & Summary ──
console.log('\n=== Summary ===\n')

const { count: totalProducts } = await supabase
  .from('products')
  .select('*', { count: 'exact', head: true })
  .eq('oem_id', OEM_ID)

const prodIds = [...prodLookup.values()]
const { count: totalColors } = await supabase
  .from('variant_colors')
  .select('*', { count: 'exact', head: true })
  .in('product_id', prodIds)

const { count: withHero } = await supabase
  .from('variant_colors')
  .select('*', { count: 'exact', head: true })
  .in('product_id', prodIds)
  .not('hero_image_url', 'is', null)

const { count: withPriceDelta } = await supabase
  .from('variant_colors')
  .select('*', { count: 'exact', head: true })
  .in('product_id', prodIds)
  .gt('price_delta', 0)

const uniqueColorNames = [...new Set(colorRows.map(c => c.color_name))]
const priceDeltas = colorRows.map(c => c.price_delta).filter(d => d > 0)

console.log(`  Vehicle models:       ${upsertedModels.length}`)
console.log(`  Products (variants):  ${totalProducts}`)
console.log(`  Variant colors:       ${totalColors}`)
console.log(`  With hero_image_url:  ${withHero}`)
console.log(`  With price_delta > 0: ${withPriceDelta}`)
console.log(`  Unique color names:   ${uniqueColorNames.length}`)
if (priceDeltas.length > 0) {
  console.log(`  Price delta range:    $${Math.min(...priceDeltas)} - $${Math.max(...priceDeltas)}`)
}
console.log(`  Pricing rows:         ${pricingRows.length}`)

// Sample colors
const { data: samples } = await supabase
  .from('variant_colors')
  .select('color_code, color_name, color_type, is_standard, price_delta, hero_image_url')
  .in('product_id', prodIds)
  .limit(10)

console.log('\n  Sample colors:')
for (const s of (samples || [])) {
  const hero = s.hero_image_url ? 'hero' : '    '
  const std = s.is_standard ? 'STD' : '   '
  console.log(`    ${(s.color_code || '?').padEnd(5)} ${std} $${String(s.price_delta || 0).padStart(5)} ${(s.color_type || '?').padEnd(9)} ${hero} ${s.color_name}`)
}

console.log('\nDone!')
