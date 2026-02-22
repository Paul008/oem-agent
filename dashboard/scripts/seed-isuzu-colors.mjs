#!/usr/bin/env node
/**
 * Seed Isuzu Australia variant colors (and products if missing) from
 * RangeAPI + BuildandQuote/GetCarColours API.
 *
 * Colour data from GetCarColours includes:
 *   - ColourType.Name (display name)
 *   - ColourType.ColourImage.Src (swatch URL)
 *   - ColourType.Price (price delta as string)
 *   - ColourType.FilterKey (slug identifier)
 *   - DesktopImages.Desktop.Src (hero render)
 *   - DesktopImages.DesktopRetina.Src (hi-res hero)
 *
 * Run: cd dashboard/scripts && node seed-isuzu-colors.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'isuzu-au'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.isuzuute.com.au/build-and-quote',
  Origin: 'https://www.isuzuute.com.au',
}

const RANGE_SOURCES = [
  { model: 'D-MAX', slug: 'd-max', dsId: '%7B58ED1496-0A3E-4C26-84B5-4A9A766BF139%7D' },
  { model: 'MU-X',  slug: 'mu-x',  dsId: '%7BC91E66BB-1837-4DA2-AB7F-D0041C9384D7%7D' },
]

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function buildCarName(model, carRawName) {
  // The Isuzu API expects carNames WITHOUT the + symbol
  let clean = carRawName.replace(/\s*\(\d+\.\d+L\)\s*/g, '').trim()
  clean = clean.replace(/\s*-\s*High Ride/g, '-High-Ride')
  clean = clean.replace(/\s+/g, '-')
  // Keep + in the carName for uniqueness (it's our key),
  // but build a separate API-safe name for fetching
  return `${model}-${clean}`
}

function apiCarName(carName) {
  // API doesn't recognize + so strip it for the fetch URL
  return carName.replace(/\+/g, '')
}

function deriveColorType(name) {
  const lower = (name || '').toLowerCase()
  if (lower.includes('pearl')) return 'pearl'
  if (lower.includes('metallic')) return 'metallic'
  if (lower.includes('mica')) return 'mica'
  if (lower.includes('white') && !lower.includes('pearl')) return 'solid'
  return 'metallic'
}

function parseGradeFromCarName(carName) {
  // e.g. "D-MAX-4x4-X-TERRAIN-Crew-Cab-Ute" → grade "X-TERRAIN", drive "4x4", cabin "Crew Cab", body "Ute"
  const parts = carName.split('-')
  // Remove model prefix (D-MAX or MU-X)
  const modelEnd = parts[0] === 'D' ? 2 : 2 // D-MAX or MU-X
  return parts.slice(modelEnd).join('-')
}

// ── 1. Ensure vehicle_models exist ──
console.log('=== Step 1: Upsert vehicle_models ===\n')

const modelRows = RANGE_SOURCES.map(s => ({ oem_id: OEM_ID, slug: s.slug, name: s.model }))
const { data: upsertedModels, error: modelErr } = await supabase
  .from('vehicle_models')
  .upsert(modelRows, { onConflict: 'oem_id,slug' })
  .select('id, slug, name')
if (modelErr) { console.error('Model upsert error:', modelErr.message); process.exit(1) }
console.log(`  Upserted ${upsertedModels.length} vehicle_models`)
const modelMap = new Map(upsertedModels.map(m => [m.slug, m]))

// ── 2. Fetch Range data + GetCarColours for every variant ──
console.log('\n=== Step 2: Fetch variant colours from API ===\n')

// Store: carName → { modelSlug, rangeCar, colours[], rawName }
const variantData = new Map()

for (const src of RANGE_SOURCES) {
  const url = `https://www.isuzuute.com.au/isuzuapi/RangeAPI/GetRangeData?dataSourceId=${src.dsId}`
  const rangeRes = await fetch(url, { headers: HEADERS })
  if (!rangeRes.ok) { console.log(`  Range ${src.model} failed: ${rangeRes.status}`); continue }
  const rangeData = await rangeRes.json()

  const cars = (rangeData.Cars || []).filter(c => !c.Name.includes('2.2L'))
  console.log(`  ${src.model}: ${cars.length} variants (excl 2.2L)`)

  for (const car of cars) {
    const carName = buildCarName(src.model, car.Name)

    // Fetch colours
    const colUrl = `https://www.isuzuute.com.au/isuzuapi/BuildandQuote/GetCarColours?carName=${encodeURIComponent(apiCarName(carName))}`
    try {
      const r = await fetch(colUrl, { headers: HEADERS })
      const text = await r.text()
      if (text === 'null' || text === '') {
        console.log(`    ${carName}: no data`)
        variantData.set(carName, { modelSlug: src.slug, rangeCar: car, colours: [], rawName: car.Name })
        continue
      }
      const data = JSON.parse(text)
      const colours = data.Colours || []
      variantData.set(carName, { modelSlug: src.slug, rangeCar: car, colours, rawName: car.Name })
      console.log(`    ${carName}: ${colours.length} colours`)
    } catch (e) {
      console.log(`    ${carName}: ERROR ${e.message}`)
      variantData.set(carName, { modelSlug: src.slug, rangeCar: car, colours: [], rawName: car.Name })
    }
  }
}

console.log(`\n  Total variants: ${variantData.size}`)

// ── 3. Delete old Isuzu products + related data ──
console.log('\n=== Step 3: Clean existing data ===\n')

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
} else {
  console.log('  No old products to delete')
}

// ── 4. Build and insert products for each variant ──
console.log('\n=== Step 4: Insert products ===\n')

const productRows = []
for (const [carName, { modelSlug, rangeCar, rawName }] of variantData) {
  const model = modelMap.get(modelSlug)
  const externalKey = `isuzu-${slugify(carName)}`

  // Parse variant info from car name
  const is4x4 = carName.includes('4x4')
  const drivetrain = is4x4 ? '4WD' : '2WD'

  productRows.push({
    oem_id: OEM_ID,
    external_key: externalKey,
    title: `${model.name} ${rawName}`.replace(/\s*\(\d+\.\d+L\)\s*/g, '').trim(),
    subtitle: rawName,
    body_type: carName.includes('Ute') ? 'Ute' : carName.includes('Chassis') ? 'Chassis' : 'SUV',
    fuel_type: 'Diesel',
    availability: 'available',
    price_amount: rangeCar.Price || null,
    price_currency: 'AUD',
    price_type: rangeCar.Price ? 'rrp' : null,
    drivetrain,
    variant_name: rawName,
    variant_code: carName,
    model_id: model?.id || null,
    source_url: `https://www.isuzuute.com.au/${modelSlug}`,
    meta_json: {
      source: 'range_api',
      car_name: carName,
      range_car: {
        name: rangeCar.Name,
        price: rangeCar.Price,
        drive_type: is4x4 ? '4x4' : '4x2',
      },
    },
    last_seen_at: new Date().toISOString(),
  })
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

let insertedProdCount = 0
const prodLookup = new Map() // external_key → product_id
for (let i = 0; i < dedupedProductRows.length; i += 200) {
  const batch = dedupedProductRows.slice(i, i + 200)
  const { data: inserted, error: insErr } = await supabase
    .from('products')
    .insert(batch)
    .select('id, external_key')
  if (insErr) { console.error(`Product insert error (batch ${i}):`, insErr.message); continue }
  insertedProdCount += inserted.length
  for (const p of inserted) prodLookup.set(p.external_key, p.id)
}
console.log(`  Upserted ${insertedProdCount} products`)

// ── 5. Build and insert variant_colors ──
console.log('\n=== Step 5: Insert variant_colors ===\n')

const colorRows = []
const seenColorKeys = new Set() // product_id:color_code dedupe
let variantsWithColors = 0
let variantsWithoutColors = 0

for (const [carName, { colours }] of variantData) {
  const externalKey = `isuzu-${slugify(carName)}`
  const productId = prodLookup.get(externalKey)
  if (!productId) continue

  if (colours.length === 0) {
    variantsWithoutColors++
    continue
  }
  variantsWithColors++

  for (let idx = 0; idx < colours.length; idx++) {
    const c = colours[idx]
    const ct = c.ColourType || {}
    const displayName = ct.Name || c.ItemName || 'Unknown'
    const price = parseFloat(ct.Price) || 0
    const isStandard = price === 0
    const colorCode = ct.FilterKey || slugify(displayName)
    const dedupeKey = `${productId}:${colorCode}`
    if (seenColorKeys.has(dedupeKey)) continue
    seenColorKeys.add(dedupeKey)
    const colorType = deriveColorType(displayName)

    // Swatch from ColourType.ColourImage
    const swatchUrl = ct.ColourImage?.Src || null

    // Hero image from DesktopImages
    const heroUrl = c.DesktopImages?.DesktopRetina?.Src
      || c.DesktopImages?.Desktop?.Src
      || null

    // Gallery: front + rear from desktop images
    const gallery = []
    if (c.DesktopImages?.Desktop?.Src) gallery.push(c.DesktopImages.Desktop.Src)
    if (c.DesktopImages?.DesktopRetina?.Src) gallery.push(c.DesktopImages.DesktopRetina.Src)
    if (c.DesktopImages?.RearView?.Src) gallery.push(c.DesktopImages.RearView.Src)
    if (c.DesktopImages?.RearViewRetina?.Src) gallery.push(c.DesktopImages.RearViewRetina.Src)

    colorRows.push({
      product_id: productId,
      color_code: colorCode,
      color_name: displayName,
      color_type: colorType,
      is_standard: isStandard,
      price_delta: price,
      swatch_url: swatchUrl,
      hero_image_url: heroUrl,
      gallery_urls: gallery.length > 0 ? gallery : [],
      sort_order: idx,
    })
  }
}

console.log(`  Variants with colours: ${variantsWithColors}`)
console.log(`  Variants without colours: ${variantsWithoutColors}`)
console.log(`  Total colour rows to insert: ${colorRows.length}`)

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

// ── 6. Verification & Summary ──
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

const { count: withSwatch } = await supabase
  .from('variant_colors')
  .select('*', { count: 'exact', head: true })
  .in('product_id', prodIds)
  .not('swatch_url', 'is', null)

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
console.log(`  Variant colours:      ${totalColors}`)
console.log(`  With swatch_url:      ${withSwatch}`)
console.log(`  With hero_image_url:  ${withHero}`)
console.log(`  With price_delta > 0: ${withPriceDelta}`)
console.log(`  Unique colour names:  ${uniqueColorNames.length}`)
if (priceDeltas.length > 0) {
  console.log(`  Price delta range:    $${Math.min(...priceDeltas)} - $${Math.max(...priceDeltas)}`)
}

// By model breakdown
for (const src of RANGE_SOURCES) {
  const modelVars = [...variantData.entries()].filter(([, v]) => v.modelSlug === src.slug)
  const modelColorCount = modelVars.reduce((sum, [, v]) => sum + v.colours.length, 0)
  console.log(`\n  ${src.model}:`)
  console.log(`    Variants:  ${modelVars.length}`)
  console.log(`    Colour rows: ${colorRows.filter(c => {
    const ek = `isuzu-${slugify([...variantData.entries()].find(([cn, v]) => v.modelSlug === src.slug && v.colours.length > 0)?.[0] || '')}`
    return true // simplified — count from source data
  }).length > 0 ? modelColorCount : 0}`)
}

// Sample colours
const { data: samples } = await supabase
  .from('variant_colors')
  .select('color_code, color_name, color_type, is_standard, price_delta, swatch_url, hero_image_url')
  .in('product_id', prodIds)
  .not('swatch_url', 'is', null)
  .limit(10)

console.log('\n  Sample colours:')
for (const s of (samples || [])) {
  const hero = s.hero_image_url ? 'hero' : '    '
  const swatch = s.swatch_url ? 'swatch' : '      '
  const std = s.is_standard ? 'STD' : '   '
  console.log(`    ${(s.color_code || '?').padEnd(25)} ${std} $${String(s.price_delta || 0).padStart(5)} ${(s.color_type || '?').padEnd(9)} ${swatch} ${hero} ${s.color_name}`)
}

console.log('\nDone!')
