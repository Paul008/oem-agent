/**
 * Fetch and seed KGM Australia vehicle data from Payload CMS.
 * Grades endpoint is primary source — contains pricing, colours, and variant packs.
 * Run: node dashboard/scripts/seed-kgm-products.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const BASE = 'https://payloadb.therefinerydesign.com/api'
const OEM_ID = 'kgm-au'
const HEADERS = {
  Accept: 'application/json',
  Origin: 'https://kgm.com.au',
  Referer: 'https://kgm.com.au/',
}

// Model metadata (body type, category) — not available from API
const MODEL_META = {
  'Musso EV MY26': { body_type: 'Ute', category: 'ute' },
  'Musso MY26':    { body_type: 'Ute', category: 'ute' },
  'Musso MY24':    { body_type: 'Ute', category: 'ute' },
  'Rexton MY26':   { body_type: 'SUV', category: 'suv' },
  'Rexton MY24':   { body_type: 'SUV', category: 'suv' },
  'Actyon':        { body_type: 'SUV', category: 'suv' },
  'Torres':        { body_type: 'SUV', category: 'suv' },
  'Korando':       { body_type: 'SUV', category: 'suv' },
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function extractModelYear(modelName) {
  const match = modelName.match(/MY(\d{2})/)
  if (match) return 2000 + Number(match[1])
  return 2025 // default for models without MY designation
}

/**
 * Match a grade to its parent model by name prefix.
 * Grade names include the model prefix (e.g. "Musso MY26 Ultimate" → "Musso MY26").
 * For grades without MY (e.g. "Musso Ultimate"), match to the MY24 model.
 */
function matchGradeToModel(gradeName, models) {
  // Sort by name length descending — longest match first
  const sorted = [...models].sort((a, b) => b.name.length - a.name.length)

  // Pass 1: exact prefix match with model.name
  for (const m of sorted) {
    if (gradeName === m.name || gradeName.startsWith(m.name + ' ')) return m
  }

  // Pass 2: prefix match with model.title (for grades without MY year suffix)
  // Prefer the older (MY24) model when multiple titles match
  const titleSorted = [...models]
    .filter(m => m.title && (gradeName === m.title || gradeName.startsWith(m.title + ' ')))
    .sort((a, b) => a.name.length - b.name.length) // shorter name = simpler/older model

  if (titleSorted.length > 0) {
    // Prefer MY24 over MY26 for grades without explicit MY in name
    return titleSorted.find(m => m.name.includes('MY24')) || titleSorted[0]
  }

  return null
}

function deriveFuelType(grades) {
  const sources = new Set()
  for (const g of grades) {
    if (g.power_source) sources.add(g.power_source)
  }
  if (sources.has('electric')) return 'Electric'
  if (sources.has('hybrid')) return 'Hybrid'
  if (sources.has('diesel')) return 'Diesel'
  if (sources.has('petrol')) return 'Petrol'
  return null
}

function deriveDrivetrain(gradeName) {
  const lower = gradeName.toLowerCase()
  if (lower.includes('awd') || lower.includes('4wd') || lower.includes('allgrip')) return 'AWD'
  if (lower.includes('2wd')) return '2WD'
  if (lower.includes('4x4')) return '4WD'
  return null
}

async function seed() {
  // 1. Fetch models and grades from Payload CMS
  console.log('Fetching KGM models...')
  const modelsRes = await fetch(`${BASE}/models?limit=100&depth=2`, { headers: HEADERS })
  const modelsData = await modelsRes.json()
  const models = modelsData.docs
  console.log(`  Found ${models.length} models`)

  console.log('Fetching KGM grades (depth=3 for colours)...')
  const gradesRes = await fetch(`${BASE}/grades?limit=100&depth=3`, { headers: HEADERS })
  const gradesData = await gradesRes.json()
  const grades = gradesData.docs
  console.log(`  Found ${grades.length} grades`)

  // 2. Map grades to models
  const gradesByModel = new Map() // model.id → grade[]
  for (const g of grades) {
    const model = matchGradeToModel(g.name, models)
    if (!model) {
      console.warn(`  WARNING: Could not match grade "${g.name}" to any model`)
      continue
    }
    if (!gradesByModel.has(model.id)) gradesByModel.set(model.id, [])
    gradesByModel.get(model.id).push(g)
  }

  // 3. Seed vehicle_models
  const modelRows = models.map(m => {
    const meta = MODEL_META[m.name] || { body_type: 'SUV', category: 'suv' }
    const modelGrades = gradesByModel.get(m.id) || []
    const fuelType = deriveFuelType(modelGrades)

    return {
      oem_id: OEM_ID,
      slug: slugify(m.name),
      name: m.title || m.name,
      body_type: meta.body_type,
      category: meta.category,
      model_year: extractModelYear(m.name),
      is_active: true,
      configurator_url: `https://kgm.com.au/models/configurator`,
      source_url: `https://kgm.com.au/models/${slugify(m.title || m.name)}`,
      meta_json: {
        fuel_type: fuelType,
        source: 'payload_cms',
        payload_model_id: m.id,
        full_name: m.name,
        starting_price: m.price,
        grade_count: modelGrades.length,
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

  // Build model ID lookup: slug → supabase UUID
  const modelLookup = {}
  for (const m of modelData) {
    modelLookup[m.slug] = m.id
  }

  // 4. Delete old KGM products + related data
  console.log('\nDeleting old KGM products...')
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

  // 5. Build product rows from grades
  const productRows = []
  const gradeModelSlug = new Map() // grade.id → model slug (for lookups)

  for (const model of models) {
    const modelSlug = slugify(model.name)
    const modelId = modelLookup[modelSlug] || null
    const modelGrades = gradesByModel.get(model.id) || []
    const meta = MODEL_META[model.name] || { body_type: 'SUV', category: 'suv' }

    for (const g of modelGrades) {
      gradeModelSlug.set(g.id, modelSlug)
      const gradeSlug = slugify(g.title || g.name)
      const externalKey = `kgm-${modelSlug}-${gradeSlug}`
      const variantPacks = (g.variants || []).map(v => {
        const vData = typeof v === 'object' ? v : { id: v }
        return { name: vData.title || vData.name, price: vData.price }
      }).filter(v => v.name)

      productRows.push({
        oem_id: OEM_ID,
        external_key: externalKey,
        source_url: `https://kgm.com.au/models/configurator`,
        title: g.name,
        subtitle: g.title,
        body_type: meta.body_type,
        fuel_type: g.power_source || null,
        availability: 'available',
        price_amount: g.price || null,
        price_currency: 'AUD',
        price_type: 'rrp',
        drivetrain: deriveDrivetrain(g.name),
        variant_name: g.title,
        variant_code: String(g.id),
        model_id: modelId,
        meta_json: {
          source: 'payload_cms_grades',
          payload_grade_id: g.id,
          power_source: g.power_source,
          variant_packs: variantPacks.length > 0 ? variantPacks : undefined,
          year_discount: g.year_discount || undefined,
        },
        last_seen_at: new Date().toISOString(),
      })
    }
  }

  console.log(`\nSeeding ${productRows.length} products...`)
  const { data: prodData, error: prodErr } = await supabase
    .from('products')
    .insert(productRows)
    .select('id, external_key, title, price_amount')
  if (prodErr) { console.error('Product error:', prodErr.message); process.exit(1) }
  console.log(`  Inserted ${prodData.length} products`)

  // Build product ID lookup: external_key → supabase UUID
  const prodLookup = {}
  for (const p of prodData) {
    prodLookup[p.external_key] = p.id
  }

  // 6. Seed variant_colors from grade colours
  const colorRows = []
  for (const model of models) {
    const modelSlug = slugify(model.name)
    const modelGrades = gradesByModel.get(model.id) || []

    for (const g of modelGrades) {
      const gradeSlug = slugify(g.title || g.name)
      const externalKey = `kgm-${modelSlug}-${gradeSlug}`
      const productId = prodLookup[externalKey]
      if (!productId) continue

      for (const c of (g.colours || [])) {
        const colorCode = slugify(c.title || 'unknown')
        const swatchUrl = c.icon?.url || c.icon?.sizes?.thumbnail?.url || null
        const heroUrl = c.car_image?.url || c.car_image?.sizes?.medium?.url || null

        colorRows.push({
          product_id: productId,
          color_code: colorCode,
          color_name: c.title,
          color_type: c.price === 0 ? 'solid' : 'metallic',
          is_standard: c.price === 0,
          price_delta: c.price || 0,
          swatch_url: swatchUrl,
          hero_image_url: heroUrl,
          sort_order: colorRows.filter(r => r.product_id === productId).length,
        })
      }
    }
  }

  if (colorRows.length > 0) {
    console.log(`\nSeeding ${colorRows.length} variant colours...`)
    const { data: colorData, error: colorErr } = await supabase
      .from('variant_colors')
      .insert(colorRows)
      .select('id')
    if (colorErr) console.error('Colour error:', colorErr.message)
    else console.log(`  Inserted ${colorData.length} colour rows`)
  }

  // 7. Seed variant_pricing (national RRP — no per-state driveaway)
  const pricingRows = []
  for (const p of prodData) {
    if (!p.price_amount) continue
    pricingRows.push({
      product_id: p.id,
      price_type: 'rrp',
      rrp: p.price_amount,
      // KGM provides national RRP only, no per-state driveaway
      fetched_at: new Date().toISOString(),
    })
  }

  if (pricingRows.length > 0) {
    console.log(`\nSeeding ${pricingRows.length} pricing rows (national RRP)...`)
    const { data: priceData, error: priceErr } = await supabase
      .from('variant_pricing')
      .insert(pricingRows)
      .select('id')
    if (priceErr) console.error('Pricing error:', priceErr.message)
    else console.log(`  Inserted ${priceData.length} pricing rows`)
  }

  // 8. Summary
  console.log('\n=== KGM SEED COMPLETE ===')
  console.log(`  Models:   ${modelData.length}`)
  console.log(`  Products: ${prodData.length}`)
  console.log(`  Colours:  ${colorRows.length}`)
  console.log(`  Pricing:  ${pricingRows.length}`)

  console.log('\n  By model:')
  for (const model of models) {
    const modelGrades = gradesByModel.get(model.id) || []
    const colorCount = modelGrades.reduce((sum, g) => sum + (g.colours?.length || 0), 0)
    console.log(`    ${model.name}: ${modelGrades.length} grades, ${colorCount} colour options`)
  }
}

seed().catch(err => { console.error(err); process.exit(1) })
