#!/usr/bin/env node
/**
 * Seed Subaru Australia vehicle specs from Retailer API v1.
 * Data source: /variants/{id}/specs — rich structured spec groups
 * Also uses variant-level fields: engineCapacity, cylinders, fuel, transmission, bodyStyle, cO2, tareWeight
 *
 * The /specs endpoint returns specGroups[] and featureGroups[] with detailed spec items.
 * Spec groups include: Engine, Performance, Transmission, Measurement, Wheels and Tyres, etc.
 *
 * Run: cd dashboard/scripts && node seed-subaru-specs.mjs
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

/** Parse numeric value from spec string, stripping units */
function parseNum(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)/)
  if (!m) return null
  return parseFloat(m[1].replace(/,/g, ''))
}

/** Parse power from "115kW@6000rpm" or "115kW" */
function parsePower(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)\s*kW/i)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

/** Parse torque from "196Nm@4000rpm" */
function parseTorque(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)\s*Nm/i)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

/** Find spec item value in spec groups */
function findSpecValue(specGroups, groupName, itemNamePattern) {
  const group = specGroups.find(g => g.name.toLowerCase().includes(groupName.toLowerCase()))
  if (!group) return null
  const item = group.specItems?.find(i => {
    if (typeof itemNamePattern === 'string') {
      return i.name.toLowerCase().includes(itemNamePattern.toLowerCase())
    }
    return itemNamePattern.test(i.name)
  })
  return item?.value || null
}

/** Find feature item value in feature groups */
function findFeatureValue(featureGroups, groupName, itemNamePattern) {
  const group = featureGroups.find(g => g.name.toLowerCase().includes(groupName.toLowerCase()))
  if (!group) return null
  const item = group.featureItems?.find(i => {
    if (typeof itemNamePattern === 'string') {
      return i.name.toLowerCase().includes(itemNamePattern.toLowerCase())
    }
    return itemNamePattern.test(i.name)
  })
  return item?.value || null
}

/** Map Subaru spec data to standardized specs_json schema */
function mapSubaruSpecs(variant, specData) {
  const specGroups = specData.specGroups || []
  const featureGroups = specData.featureGroups || []

  const specs = {}

  // === ENGINE ===
  const displacement = variant.engineCapacity || parseNum(findSpecValue(specGroups, 'Engine', 'Capacity'))
  const cylinders = variant.cylinders || null
  const powerKw = parsePower(findSpecValue(specGroups, 'Performance', /maximum power/i))
  const torqueNm = parseTorque(findSpecValue(specGroups, 'Performance', /maximum torque/i))

  // Determine engine type from fuel and hybrid/electric flags
  let engineType = variant.fuel || 'Petrol'
  if (variant.isElectric) engineType = 'Electric'
  else if (variant.isHybrid) engineType = 'Hybrid'

  if (displacement || cylinders || powerKw || torqueNm) {
    specs.engine = {}
    specs.engine.type = engineType
    if (displacement) specs.engine.displacement_cc = displacement
    if (cylinders) specs.engine.cylinders = cylinders
    if (powerKw) specs.engine.power_kw = powerKw
    if (torqueNm) specs.engine.torque_nm = torqueNm
  }

  // === TRANSMISSION ===
  const transType = variant.transmission || null
  // Try to extract gears from spec data
  const transGroup = specGroups.find(g => g.name.toLowerCase().includes('transmission'))
  let gears = null
  if (transGroup) {
    // Look for gear ratio items to count gears, or CVT
    const isCVT = transGroup.specItems?.some(i =>
      i.name.toLowerCase().includes('cvt') || i.value?.toLowerCase().includes('cvt')
    ) || transType?.toLowerCase().includes('cvt')
    if (!isCVT) {
      // Count forward gear ratio items or extract from name
      const gearItems = transGroup.specItems?.filter(i => /^\d(st|nd|rd|th)$/.test(i.name.trim())) || []
      if (gearItems.length > 0) gears = gearItems.length
    }
  }
  // Check for manual gears
  if (transType?.toLowerCase().includes('manual')) {
    const gearMatch = transType.match(/(\d)\s*-?\s*speed/i)
    if (gearMatch) gears = parseInt(gearMatch[1])
  }

  // Determine drive type
  const hasAWD = variant.name?.toLowerCase().includes('awd') ||
    findSpecValue(specGroups, 'all-wheel', 'automatic') ||
    specGroups.some(g => g.name.toLowerCase().includes('all-wheel'))
  // BRZ is RWD (rear-wheel drive), Solterra is AWD, rest check for explicit AWD
  const modelLower = (variant.modelName || '').toLowerCase()
  let drive = 'AWD' // Subaru default
  if (modelLower === 'brz') drive = 'RWD'
  else if (hasAWD) drive = 'AWD'
  else if (variant.isElectric) drive = 'AWD' // Solterra is AWD

  if (transType || drive) {
    specs.transmission = {}
    if (transType) {
      // Normalize transmission type
      if (transType.toLowerCase().includes('cvt') || transType.toLowerCase().includes('lineartronic')) {
        specs.transmission.type = 'CVT'
      } else if (transType.toLowerCase().includes('automatic') || transType.toLowerCase().includes('auto')) {
        specs.transmission.type = 'Automatic'
      } else if (transType.toLowerCase().includes('manual')) {
        specs.transmission.type = 'Manual'
      } else {
        specs.transmission.type = transType
      }
    }
    if (gears) specs.transmission.gears = gears
    specs.transmission.drive = drive
  }

  // === DIMENSIONS ===
  const lengthMm = parseNum(findSpecValue(specGroups, 'Measurement', 'overall length'))
  const widthMm = parseNum(findSpecValue(specGroups, 'Measurement', 'overall width'))
  const heightMm = parseNum(findSpecValue(specGroups, 'Measurement', 'overall height'))
  const wheelbaseMm = parseNum(findSpecValue(specGroups, 'Measurement', 'wheelbase'))
  const kerbWeightVal = findSpecValue(specGroups, 'Measurement', 'kerb weight')
  const kerbWeightKg = parseNum(kerbWeightVal) || (variant.tareWeight ? variant.tareWeight + 30 : null)

  if (lengthMm || widthMm || heightMm || wheelbaseMm || kerbWeightKg) {
    specs.dimensions = {}
    if (lengthMm) specs.dimensions.length_mm = lengthMm
    if (widthMm) specs.dimensions.width_mm = widthMm
    if (heightMm) specs.dimensions.height_mm = heightMm
    if (wheelbaseMm) specs.dimensions.wheelbase_mm = wheelbaseMm
    if (kerbWeightKg) specs.dimensions.kerb_weight_kg = kerbWeightKg
  }

  // === PERFORMANCE ===
  const fuelCombined = parseNum(findSpecValue(specGroups, 'Performance', /fuel consumption.*combined/i))
    || variant.combFuelCycle || null
  const co2Val = findSpecValue(specGroups, 'Performance', /co.?2.*combined/i)
  const co2 = parseNum(co2Val) || variant.cO2 || null

  if (fuelCombined || co2) {
    specs.performance = {}
    if (fuelCombined) specs.performance.fuel_combined_l100km = fuelCombined
    if (co2) specs.performance.co2_gkm = co2
  }

  // === TOWING ===
  // Subaru doesn't always list towing in spec API, use known values
  const towingByModel = {
    'forester': { braked_kg: 1800, unbraked_kg: 600 },
    'outback': { braked_kg: 2000, unbraked_kg: 750 },
    'wrx': { braked_kg: 1400, unbraked_kg: 450 },
    'brz': { braked_kg: 0, unbraked_kg: 0 },
    'crosstrek': { braked_kg: 1500, unbraked_kg: 600 },
    'impreza': { braked_kg: 1200, unbraked_kg: 450 },
    'solterra': { braked_kg: 750, unbraked_kg: 750 },
  }
  const modelName = variant.modelName?.toLowerCase() || ''
  const towData = towingByModel[modelName]
  if (towData && towData.braked_kg > 0) {
    specs.towing = { ...towData }
  }

  // === CAPACITY ===
  const seatingVal = findSpecValue(specGroups, 'Measurement', 'seating capacity')
  const seats = parseNum(seatingVal) || 5
  const cargoVal = findSpecValue(specGroups, 'Measurement', /cargo volume/i)
  let bootLitres = null
  if (cargoVal) {
    // "291/883 (1278 to ceiling)" — take first number (seats up)
    bootLitres = parseNum(cargoVal)
  }
  const fuelTankVal = findSpecValue(specGroups, 'Engine', 'fuel tank capacity')
  const fuelTankLitres = parseNum(fuelTankVal)

  // Determine doors based on body style
  const bodyStyle = variant.bodyStyle?.toLowerCase() || ''
  const doors = bodyStyle.includes('sedan') ? 4 : 5

  if (seats || bootLitres || fuelTankLitres) {
    specs.capacity = { doors }
    if (seats) specs.capacity.seats = seats
    if (bootLitres) specs.capacity.boot_litres = bootLitres
    if (fuelTankLitres) specs.capacity.fuel_tank_litres = fuelTankLitres
  }

  // === SAFETY ===
  const ancapVal = findFeatureValue(featureGroups, 'Safety Rating', /ancap safety rating/i)
  const ancapStars = ancapVal?.toLowerCase().includes('yes') ? 5 : parseNum(ancapVal)
  // Count airbags from the airbag feature description
  const airbagItem = featureGroups
    .flatMap(g => g.featureItems || [])
    .find(i => i.name.toLowerCase().includes('airbag') && i.value === 'Yes')
  let airbags = null
  if (airbagItem) {
    // "SRS airbags - dual front, dual front side, dual curtain, driver's knee, far side, and front passenger seat cushion"
    // Count the listed types
    const parts = airbagItem.name.split(',').length + (airbagItem.name.includes(' and ') ? 1 : 0)
    // Subaru typically has 8 airbags
    airbags = parts >= 6 ? 8 : parts >= 4 ? 7 : 6
  }

  if (ancapStars || airbags) {
    specs.safety = {}
    if (ancapStars) specs.safety.ancap_stars = ancapStars
    if (airbags) specs.safety.airbags = airbags
  }

  // === WHEELS ===
  const wheelSizeVal = findSpecValue(specGroups, 'Wheels', 'Wheels')
  const wheelRim = findSpecValue(specGroups, 'Wheels', 'Rim size')
  let wheelSize = null
  if (wheelSizeVal) {
    const m = wheelSizeVal.match(/(\d+)/)
    if (m) wheelSize = m[1] + '"'
  } else if (wheelRim) {
    const m = wheelRim.match(/(\d+)/)
    if (m) wheelSize = m[1] + '"'
  }
  // Determine wheel type from features
  const has17Alloy = findFeatureValue(featureGroups, 'Exterior', '17" alloy wheels')
  const has18Alloy = findFeatureValue(featureGroups, 'Exterior', '18" alloy wheels')
  const wheelType = (has17Alloy === 'Yes' || has18Alloy === 'Yes') ? 'Alloy' : 'Alloy'

  if (wheelSize) {
    specs.wheels = { size: wheelSize, type: wheelType }
  }

  return specs
}

/** Extract scalar product fields from specs */
function extractScalarFields(specs) {
  const scalars = {}
  if (specs.engine?.displacement_cc) {
    scalars.engine_size = (specs.engine.displacement_cc / 1000).toFixed(1) + 'L'
  }
  if (specs.engine?.cylinders) scalars.cylinders = specs.engine.cylinders
  if (specs.transmission?.type) scalars.transmission = specs.transmission.type
  if (specs.transmission?.gears) scalars.gears = specs.transmission.gears
  if (specs.transmission?.drive) scalars.drive = specs.transmission.drive
  if (specs.capacity?.doors) scalars.doors = specs.capacity.doors
  if (specs.capacity?.seats) scalars.seats = specs.capacity.seats
  return scalars
}

async function seed() {
  console.log('=== Subaru Specs Seed ===\n')

  // 1. Fetch models from Subaru API
  console.log('Step 1: Fetching models from Subaru Retailer API...')
  const modelsRes = await fetch(`${API_BASE}/models/`, { headers: HEADERS })
  if (!modelsRes.ok) { console.error('Models API failed:', modelsRes.status); process.exit(1) }
  const apiModels = await modelsRes.json()
  console.log(`  Found ${apiModels.length} model entries`)

  // Deduplicate by name
  const modelsByName = new Map()
  for (const m of apiModels) {
    const name = m.name.replace(/^All-new\s+/i, '')
    if (!modelsByName.has(name) || m.year > modelsByName.get(name).year) {
      modelsByName.set(name, m)
    }
  }
  console.log(`  Unique models: ${modelsByName.size}`)

  // 2. Fetch all variants with spec data
  console.log('\nStep 2: Fetching variants and specs from API...')
  const variantSpecs = new Map() // variant.name → { variant, specData }
  let totalVariants = 0
  let specsFound = 0
  let specsFailed = 0

  for (const [name, apiModel] of modelsByName) {
    // Fetch variants for all model entries with this name
    const allEntries = apiModels.filter(m => m.name.replace(/^All-new\s+/i, '') === name)

    const seenFhiCodes = new Set()
    for (const entry of allEntries) {
      const varRes = await fetch(`${API_BASE}/models/${entry.id}/variants`, { headers: HEADERS })
      if (!varRes.ok) continue
      const variants = await varRes.json()

      for (const v of variants) {
        if (seenFhiCodes.has(v.fhiCode)) continue
        seenFhiCodes.add(v.fhiCode)
        totalVariants++

        // Fetch specs for this variant
        try {
          const specRes = await fetch(`${API_BASE}/variants/${v.id}/specs`, { headers: HEADERS })
          if (specRes.ok) {
            const specData = await specRes.json()
            variantSpecs.set(v.name, { variant: v, specData })
            specsFound++
          } else {
            // Store variant without spec data — still use variant-level fields
            variantSpecs.set(v.name, { variant: v, specData: { specGroups: [], featureGroups: [] } })
            specsFailed++
          }
        } catch (e) {
          variantSpecs.set(v.name, { variant: v, specData: { specGroups: [], featureGroups: [] } })
          specsFailed++
        }
      }
    }
    console.log(`  ${name}: ${seenFhiCodes.size} variants`)
  }

  console.log(`  Total variants: ${totalVariants}`)
  console.log(`  Specs fetched OK: ${specsFound}`)
  console.log(`  Specs failed: ${specsFailed}`)

  // 3. Fetch existing Subaru products from Supabase
  console.log('\nStep 3: Fetching existing Subaru products...')
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, external_key, title, subtitle, variant_name, meta_json')
    .eq('oem_id', OEM_ID)
  if (prodErr) { console.error('Product fetch error:', prodErr.message); process.exit(1) }
  console.log(`  Found ${products.length} products`)

  // 4. Match products to variants and update specs
  console.log('\nStep 4: Updating products with specs...\n')

  let updatedCount = 0
  let noMatchCount = 0
  const specsSummary = []

  for (const product of products) {
    // Match by product title (which is variant name from seed-subaru-colors.mjs)
    let matched = variantSpecs.get(product.title)

    // Try variant_name
    if (!matched && product.variant_name) {
      matched = variantSpecs.get(product.variant_name)
    }

    // Try subtitle
    if (!matched && product.subtitle) {
      matched = variantSpecs.get(product.subtitle)
    }

    // Try meta_json.api_variant_id to match by ID
    if (!matched && product.meta_json?.api_variant_id) {
      for (const [, data] of variantSpecs) {
        if (data.variant.id === product.meta_json.api_variant_id) {
          matched = data
          break
        }
      }
    }

    if (!matched) {
      noMatchCount++
      console.log(`  [SKIP] No match: "${product.title}"`)
      continue
    }

    const { variant, specData } = matched
    const specs = mapSubaruSpecs(variant, specData)

    if (Object.keys(specs).length === 0) {
      noMatchCount++
      continue
    }

    const scalars = extractScalarFields(specs)

    const updateData = {
      specs_json: specs,
      ...scalars,
    }

    const { error: updateErr } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', product.id)

    if (updateErr) {
      console.error(`  ERROR updating "${product.title}":`, updateErr.message)
      continue
    }

    updatedCount++
    specsSummary.push({
      title: product.title,
      engine: specs.engine?.displacement_cc ? `${specs.engine.displacement_cc}cc ${specs.engine.power_kw || '?'}kW` : 'n/a',
      trans: specs.transmission?.type || '?',
      drive: specs.transmission?.drive || '?',
      fuel: specs.performance?.fuel_combined_l100km ? `${specs.performance.fuel_combined_l100km}L/100km` : '?',
    })

    console.log(`  [OK] ${product.title} (${specs.engine?.displacement_cc || '?'}cc, ${specs.transmission?.drive || '?'})`)
  }

  // 5. Summary
  console.log('\n=== SUBARU SPECS SEED COMPLETE ===')
  console.log(`  Total products:     ${products.length}`)
  console.log(`  Updated with specs: ${updatedCount}`)
  console.log(`  No match:           ${noMatchCount}`)

  if (specsSummary.length > 0) {
    console.log('\n  Specs summary:')
    for (const s of specsSummary) {
      console.log(`    ${s.title.padEnd(45)} ${s.engine.padEnd(20)} ${s.trans.padEnd(12)} ${s.drive.padEnd(5)} ${s.fuel}`)
    }
  }

  // Verify
  const { data: withSpecs } = await supabase
    .from('products')
    .select('id, title, specs_json')
    .eq('oem_id', OEM_ID)
    .not('specs_json', 'is', null)
  console.log(`\n  Products with specs_json in DB: ${withSpecs?.length || 0}/${products.length}`)
}

seed().catch(err => { console.error(err); process.exit(1) })
