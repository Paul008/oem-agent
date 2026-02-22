/**
 * Fetch, clean and seed Mitsubishi Australia vehicle data from their Magento 2 GraphQL API.
 * Normalizes family names, filters placeholder prices, maps body types, extracts colours.
 * Run: node dashboard/scripts/seed-mitsubishi-products.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const GQL = 'https://store.mitsubishi-motors.com.au/graphql'
const OEM_ID = 'mitsubishi-au'

// -------------------------------------------------------------------
// 1. Fetch raw data from Mitsubishi GraphQL
// -------------------------------------------------------------------
async function fetchProducts() {
  const query = `{
    products(filter: { category_id: { eq: "31" } }, pageSize: 60) {
      total_count
      items {
        sku name url_key
        categories { name id }
        price_range { minimum_price { final_price { value } } }
        ... on ConfigurableProduct {
          configurable_options {
            attribute_code label
            values { label value_index swatch_data { value } }
          }
          variants {
            product {
              sku name
              price_range { minimum_price { final_price { value } } }
            }
            attributes { code label value_index }
          }
        }
      }
    }
  }`
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  return data.data.products.items
}

async function fetchOffers() {
  const query = `{
    offers(priceGroup: PRIVATE) {
      items {
        title offer_id family category
        vehicle { sku name fuel_type drive_type transmission model_year }
        price {
          label value disclaimer
          nsw { label value } vic { label value }
          qld { label value } wa { label value }
          sa { label value } nt { label value }
          act { label value } tas { label value }
        }
        image seats short_description
        disclaimers { marker text }
      }
    }
  }`
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  return data.data.offers.items
}

// -------------------------------------------------------------------
// 2. Clean & normalize
// -------------------------------------------------------------------
const FAMILY_META = {
  'ASX':                          { body_type: 'SUV',  category: 'suv',    fuel: 'Petrol' },
  'Eclipse Cross':                { body_type: 'SUV',  category: 'phev',   fuel: 'PHEV' },
  'Eclipse Cross Plug-in Hybrid EV': { body_type: 'SUV', category: 'phev', fuel: 'PHEV' },
  'Outlander':                    { body_type: 'SUV',  category: 'suv',    fuel: 'Petrol' },
  'Outlander Plug-in Hybrid EV':  { body_type: 'SUV',  category: 'phev',  fuel: 'PHEV' },
  'Pajero Sport':                 { body_type: 'SUV',  category: 'suv',    fuel: 'Diesel' },
  'Triton':                       { body_type: 'Ute',  category: 'ute',    fuel: 'Diesel' },
}

function normalizeFamily(rawFamily) {
  if (rawFamily.includes('Plug-in Hybrid EV')) {
    return rawFamily.replace(' Plug-in Hybrid EV', '') + ' PHEV'
  }
  return rawFamily
}

function cleanGrade(name) {
  return name.replace('Plug-in Hybrid EV ', '')
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function cleanProduct(item) {
  const price = item.price_range.minimum_price.final_price.value
  if (price >= 99990) return null // placeholder price

  const cats = item.categories.filter(c => c.name !== 'Vehicles')
  const rawFamily = cats[0]?.name || 'Unknown'
  const subCat = cats[1]?.name || null
  const meta = FAMILY_META[rawFamily] || { body_type: 'Unknown', category: 'unknown', fuel: 'Unknown' }

  const family = normalizeFamily(rawFamily)
  const grade = cleanGrade(item.name)
  const year = parseInt(item.sku.split('-')[1]) || 2025
  const fuel = meta.fuel

  // Triton body type from category
  let bodyDetail = null
  if (rawFamily === 'Triton' && subCat) {
    bodyDetail = subCat // "Pick Up" or "Cab Chassis"
  }

  // Build display name: "Outlander ES" or "Triton Pick Up GLX"
  const displayName = bodyDetail
    ? `${family} ${bodyDetail} ${grade}`
    : `${family} ${grade}`

  // Extract colours from configurable_options
  const colours = []
  for (const opt of item.configurable_options || []) {
    if (opt.attribute_code === 'exterior_code') {
      for (const v of opt.values) {
        colours.push({
          name: v.label,
          swatch: v.swatch_data?.value
            ? `https://store.mitsubishi-motors.com.au/media/catalog/product${v.swatch_data.value}`
            : null,
        })
      }
    }
  }

  // Extract interiors
  const interiors = []
  for (const opt of item.configurable_options || []) {
    if (opt.attribute_code === 'interior_code') {
      for (const v of opt.values) {
        interiors.push(v.label)
      }
    }
  }

  // Extract per-variant pricing (colour affects price)
  const variantPrices = []
  for (const v of item.variants || []) {
    const vPrice = v.product.price_range.minimum_price.final_price.value
    if (vPrice >= 99990) continue
    const colourAttr = v.attributes.find(a => a.code === 'exterior_code')
    variantPrices.push({
      sku: v.product.sku,
      price: vPrice,
      colour: colourAttr?.label || null,
    })
  }

  return {
    sku: item.sku,
    family,
    rawFamily,
    grade,
    displayName,
    year,
    fuel,
    bodyType: meta.body_type,
    bodyDetail,
    category: meta.category,
    price,
    colours,
    interiors,
    variantPrices,
    variantCount: variantPrices.length,
  }
}

// -------------------------------------------------------------------
// 3. Seed to database
// -------------------------------------------------------------------
async function seed() {
  console.log('Fetching Mitsubishi products...')
  const [rawProducts, rawOffers] = await Promise.all([fetchProducts(), fetchOffers()])
  console.log(`  Raw: ${rawProducts.length} products, ${rawOffers.length} offers`)

  // Clean products
  const products = rawProducts.map(cleanProduct).filter(Boolean)
  console.log(`  Clean: ${products.length} products (${rawProducts.length - products.length} placeholder prices removed)`)

  // Build family set for vehicle_models
  const familyMap = new Map()
  for (const p of products) {
    const key = `${p.family}-${p.year}`
    if (!familyMap.has(key)) {
      familyMap.set(key, {
        family: p.family,
        year: p.year,
        bodyType: p.bodyType,
        category: p.category,
        fuel: p.fuel,
      })
    }
  }

  // --- Seed vehicle_models ---
  const models = [...familyMap.values()].map(f => ({
    oem_id: OEM_ID,
    slug: slugify(`${f.family}-${f.year}`),
    name: f.family,
    body_type: f.bodyType,
    category: f.category,
    model_year: f.year,
    is_active: true,
    configurator_url: 'https://www.mitsubishi-motors.com.au/buy/build-your-own',
    meta_json: { fuel_type: f.fuel, source: 'graphql_store' },
  }))

  console.log(`\nSeeding ${models.length} vehicle models...`)
  const { data: modelData, error: modelErr } = await supabase
    .from('vehicle_models')
    .upsert(models, { onConflict: 'oem_id,slug', ignoreDuplicates: false })
    .select('id, slug, name, model_year')
  if (modelErr) { console.error('Model error:', modelErr.message); process.exit(1) }
  console.log(`  Upserted ${modelData.length} models`)

  // Build model ID lookup
  const modelLookup = {}
  for (const m of modelData) {
    modelLookup[`${m.name}-${m.model_year}`] = m.id
  }

  // --- Delete old Mitsubishi products (garbage data with no external_key) ---
  console.log('\nDeleting old Mitsubishi products...')
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

  // --- Seed products ---
  const productRows = products.map(p => ({
    oem_id: OEM_ID,
    external_key: p.sku,
    source_url: `https://store.mitsubishi-motors.com.au/${p.sku.toLowerCase()}`,
    title: p.displayName,
    subtitle: p.grade,
    body_type: p.bodyDetail || p.bodyType,
    fuel_type: p.fuel,
    availability: 'available',
    price_amount: p.price,
    price_currency: 'AUD',
    price_type: 'rrp',
    drivetrain: p.bodyDetail || null,
    variant_name: p.grade,
    variant_code: p.sku,
    model_id: modelLookup[`${p.family}-${p.year}`] || null,
    meta_json: {
      source: 'mitsubishi_graphql',
      raw_family: p.rawFamily,
      interiors: p.interiors,
      variant_count: p.variantCount,
    },
    last_seen_at: new Date().toISOString(),
  }))

  console.log(`\nSeeding ${productRows.length} products...`)
  const { data: prodData, error: prodErr } = await supabase
    .from('products')
    .insert(productRows)
    .select('id, external_key, title, price_amount')
  if (prodErr) { console.error('Product error:', prodErr.message); process.exit(1) }
  console.log(`  Upserted ${prodData.length} products`)

  // Build product ID lookup
  const prodLookup = {}
  for (const p of prodData) {
    prodLookup[p.external_key] = p.id
  }

  // --- Seed variant_colors ---
  const colorRows = []
  for (const p of products) {
    const productId = prodLookup[p.sku]
    if (!productId) continue
    for (let i = 0; i < p.colours.length; i++) {
      const c = p.colours[i]
      // Find price delta from variants
      const basePrice = p.price
      const colourVariant = p.variantPrices.find(v => v.colour === c.name)
      const priceDelta = colourVariant ? colourVariant.price - basePrice : 0

      colorRows.push({
        product_id: productId,
        color_name: c.name,
        color_code: slugify(c.name),
        color_type: c.name.includes('Diamond') || c.name.includes('Mica') ? 'premium' : 'standard',
        is_standard: priceDelta === 0,
        price_delta: priceDelta,
        swatch_url: c.swatch,
        sort_order: i,
      })
    }
  }

  if (colorRows.length > 0) {
    console.log(`\nSeeding ${colorRows.length} colour options...`)
    // Delete existing colours for these products first to avoid duplicates
    const productIds = [...new Set(colorRows.map(c => c.product_id))]
    await supabase.from('variant_colors').delete().in('product_id', productIds)
    const { data: colorData, error: colorErr } = await supabase
      .from('variant_colors')
      .insert(colorRows)
      .select('id')
    if (colorErr) console.error('Color error:', colorErr.message)
    else console.log(`  Inserted ${colorData.length} colours`)
  }

  // --- Seed variant_pricing (state driveaway from offers) ---
  const pricingRows = []
  const seenPricingKeys = new Set()
  for (const offer of rawOffers) {
    const sku = offer.vehicle.sku
    const productId = prodLookup[sku]
    if (!productId) continue

    // Deduplicate: same SKU can appear in multiple offers
    const pricingKey = `${productId}:driveaway`
    if (seenPricingKeys.has(pricingKey)) continue
    seenPricingKeys.add(pricingKey)

    const product = products.find(p => p.sku === sku)
    if (!product) continue

    pricingRows.push({
      product_id: productId,
      price_type: 'driveaway',
      rrp: product.price,
      driveaway_nsw: offer.price.nsw?.value || null,
      driveaway_vic: offer.price.vic?.value || null,
      driveaway_qld: offer.price.qld?.value || null,
      driveaway_wa: offer.price.wa?.value || null,
      driveaway_sa: offer.price.sa?.value || null,
      driveaway_tas: offer.price.tas?.value || null,
      driveaway_act: offer.price.act?.value || null,
      driveaway_nt: offer.price.nt?.value || null,
      fetched_at: new Date().toISOString(),
    })
  }

  if (pricingRows.length > 0) {
    console.log(`\nSeeding ${pricingRows.length} pricing rows (state driveaway)...`)
    const pricingProductIds = [...new Set(pricingRows.map(p => p.product_id))]
    await supabase.from('variant_pricing').delete().in('product_id', pricingProductIds)
    const { data: priceData, error: priceErr } = await supabase
      .from('variant_pricing')
      .insert(pricingRows)
      .select('id')
    if (priceErr) console.error('Pricing error:', priceErr.message)
    else console.log(`  Inserted ${priceData.length} pricing rows`)
  }

  // --- Summary ---
  console.log('\n=== MITSUBISHI SEED COMPLETE ===')
  console.log(`  Models:   ${modelData.length}`)
  console.log(`  Products: ${prodData.length}`)
  console.log(`  Colours:  ${colorRows.length}`)
  console.log(`  Pricing:  ${pricingRows.length}`)

  // Show by family
  const byFamily = {}
  for (const p of products) {
    byFamily[p.family] = (byFamily[p.family] || 0) + 1
  }
  console.log('\n  By family:')
  for (const [f, c] of Object.entries(byFamily).sort()) {
    console.log(`    ${f}: ${c} variants`)
  }
}

seed().catch(err => { console.error(err); process.exit(1) })
