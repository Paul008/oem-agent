/**
 * Fetch and seed Suzuki Australia vehicle data from the finance calculator JSON.
 * Static JSON at suzuki.com.au/suzuki-finance-calculator-data.json
 * Run: node dashboard/scripts/seed-suzuki-products.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const DATA_URL = 'https://www.suzuki.com.au/suzuki-finance-calculator-data.json'
const OEM_ID = 'suzuki-au'

// Model metadata not in the JSON
const MODEL_META = {
  'Swift Hybrid':  { body_type: 'Hatch',     category: 'hatch',   fuel: 'Hybrid' },
  'Swift Sport':   { body_type: 'Hatch',     category: 'hatch',   fuel: 'Petrol' },
  'Fronx Hybrid':  { body_type: 'SUV',       category: 'suv',     fuel: 'Hybrid' },
  'Ignis':         { body_type: 'Hatch',     category: 'hatch',   fuel: 'Petrol' },
  'Vitara':        { body_type: 'SUV',       category: 'suv',     fuel: 'Petrol' },
  'S-CROSS':       { body_type: 'SUV',       category: 'suv',     fuel: 'Petrol' },
  'Jimny':         { body_type: 'SUV',       category: 'suv',     fuel: 'Petrol' },
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function extractGrade(variantName, modelName) {
  // Remove model name prefix to get just the grade
  // e.g. "Swift Hybrid GLX" → "GLX", "Jimny Lite" → "Lite"
  let grade = variantName
  if (variantName.startsWith(modelName + ' ')) {
    grade = variantName.slice(modelName.length + 1)
  }
  return grade || variantName
}

async function seed() {
  console.log('Fetching Suzuki finance calculator data...')
  const res = await fetch(DATA_URL)
  const raw = await res.json()
  const models = raw.models
  console.log(`  Found ${models.length} models`)

  // --- Seed vehicle_models ---
  const modelRows = models.map(m => {
    const meta = MODEL_META[m.model] || { body_type: 'Unknown', category: 'unknown', fuel: 'Unknown' }
    return {
      oem_id: OEM_ID,
      slug: slugify(`${m.model}-2025`),
      name: m.model,
      body_type: meta.body_type,
      category: meta.category,
      model_year: 2025,
      is_active: true,
      configurator_url: `https://www.suzuki.com.au/models/${slugify(m.model)}`,
      meta_json: {
        fuel_type: meta.fuel,
        source: 'finance_calculator_json',
        model_id: m.modelID,
        logo_url: m.logo?.sizes?.default?.src || null,
        image_url: m.image?.sizes?.default?.src || null,
      },
    }
  })

  console.log(`\nSeeding ${modelRows.length} vehicle models...`)
  const { data: modelData, error: modelErr } = await supabase
    .from('vehicle_models')
    .upsert(modelRows, { onConflict: 'oem_id,slug', ignoreDuplicates: false })
    .select('id, slug, name, model_year')
  if (modelErr) { console.error('Model error:', modelErr.message); process.exit(1) }
  console.log(`  Upserted ${modelData.length} models`)

  // Build model ID lookup
  const modelLookup = {}
  for (const m of modelData) {
    modelLookup[`${m.name}-${m.model_year}`] = m.id
  }

  // --- Delete old Suzuki products ---
  console.log('\nDeleting old Suzuki products...')
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

  // --- Build products from variants ---
  const productRows = []
  for (const model of models) {
    const meta = MODEL_META[model.model] || { body_type: 'Unknown', category: 'unknown', fuel: 'Unknown' }
    const modelId = modelLookup[`${model.model}-2025`] || null

    for (const variant of model.modelVariants) {
      // Get NSW automatic price as the primary price (most common)
      const nswPrices = variant.price?.NSW || variant.price?.ACT || {}
      const transmissions = Object.keys(nswPrices)
      const primaryTrans = transmissions.includes('automatic') ? 'automatic' : transmissions[0]
      const primaryPrice = nswPrices[primaryTrans]?.price || 0

      const grade = extractGrade(variant.variant, model.model)
      const hasManual = transmissions.includes('manual')
      const hasAuto = transmissions.includes('automatic')

      let transmission = 'Automatic'
      if (hasManual && hasAuto) transmission = 'Manual/Automatic'
      else if (hasManual) transmission = 'Manual'

      // For models with both manual and auto at different prices, create one product per transmission
      for (const trans of transmissions) {
        const price = nswPrices[trans]?.price || 0
        const transLabel = trans === 'automatic' ? 'Auto' : 'Manual'
        const needsTransSuffix = transmissions.length > 1

        productRows.push({
          oem_id: OEM_ID,
          external_key: `suzuki-${variant.variantID}-${trans}`,
          source_url: `https://www.suzuki.com.au/models/${slugify(model.model)}`,
          title: needsTransSuffix ? `${variant.variant} ${transLabel}` : variant.variant,
          subtitle: grade,
          body_type: meta.body_type,
          fuel_type: meta.fuel,
          availability: 'available',
          price_amount: price,
          price_currency: 'AUD',
          price_type: 'driveaway',
          drivetrain: variant.variant.includes('ALLGRIP') ? 'AWD' : '2WD',
          variant_name: grade,
          variant_code: `${variant.variantID}-${trans}`,
          model_id: modelId,
          meta_json: {
            source: 'suzuki_finance_calculator',
            model_id: model.modelID,
            variant_id: variant.variantID,
            transmission: trans,
            has_gfv: true,
          },
          last_seen_at: new Date().toISOString(),
        })
      }
    }
  }

  console.log(`\nSeeding ${productRows.length} products...`)
  const { data: prodData, error: prodErr } = await supabase
    .from('products')
    .insert(productRows)
    .select('id, external_key, title, price_amount')
  if (prodErr) { console.error('Product error:', prodErr.message); process.exit(1) }
  console.log(`  Inserted ${prodData.length} products`)

  // Build product ID lookup
  const prodLookup = {}
  for (const p of prodData) {
    prodLookup[p.external_key] = p.id
  }

  // --- Seed variant_pricing (state driveaway) ---
  const pricingRows = []
  for (const model of models) {
    for (const variant of model.modelVariants) {
      const nswPrices = variant.price?.NSW || {}
      const transmissions = Object.keys(nswPrices)

      for (const trans of transmissions) {
        const key = `suzuki-${variant.variantID}-${trans}`
        const productId = prodLookup[key]
        if (!productId) continue

        pricingRows.push({
          product_id: productId,
          price_type: 'driveaway',
          rrp: variant.price?.NSW?.[trans]?.price || null,
          driveaway_nsw: variant.price?.NSW?.[trans]?.price || null,
          driveaway_vic: variant.price?.VIC?.[trans]?.price || null,
          driveaway_qld: variant.price?.QLD?.[trans]?.price || null,
          driveaway_wa: variant.price?.WA?.[trans]?.price || null,
          driveaway_sa: variant.price?.SA?.[trans]?.price || null,
          driveaway_tas: variant.price?.TAS?.[trans]?.price || null,
          driveaway_act: variant.price?.ACT?.[trans]?.price || null,
          driveaway_nt: variant.price?.NT?.[trans]?.price || null,
          fetched_at: new Date().toISOString(),
        })
      }
    }
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
  console.log('\n=== SUZUKI SEED COMPLETE ===')
  console.log(`  Models:   ${modelData.length}`)
  console.log(`  Products: ${prodData.length}`)
  console.log(`  Pricing:  ${pricingRows.length}`)

  // Show by model
  console.log('\n  By model:')
  for (const model of models) {
    const count = model.modelVariants.reduce((sum, v) => {
      return sum + Object.keys(v.price?.NSW || v.price?.ACT || {}).length
    }, 0)
    console.log(`    ${model.model}: ${count} product rows`)
  }
}

seed().catch(err => { console.error(err); process.exit(1) })
