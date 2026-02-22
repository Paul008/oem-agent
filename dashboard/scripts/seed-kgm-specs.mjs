#!/usr/bin/env node
/**
 * Seed KGM Australia vehicle specs from Payload CMS feature-sets.
 * Data source: /feature-sets?depth=3 — each feature-set has features[] with title/value pairs
 * covering engine, dimensions, towing, capacity, transmission, safety, performance, etc.
 *
 * Maps KGM feature-set features to standardized specs_json schema and updates products table.
 *
 * Run: cd dashboard/scripts && node seed-kgm-specs.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'kgm-au'
const BASE = 'https://payloadb.therefinerydesign.com/api'
const HEADERS = {
  Accept: 'application/json',
  Origin: 'https://kgm.com.au',
  Referer: 'https://kgm.com.au/',
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Parse a numeric value from a string, stripping units */
function parseNum(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)/)
  if (!m) return null
  return parseFloat(m[1].replace(/,/g, ''))
}

/** Parse power "110kW @ 5,500rpm" or "110kW" → kw number */
function parsePower(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)\s*kW/i)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

/** Parse torque "220Nm @ 2,400~4,200rpm" or "220Nm" → nm number */
function parseTorque(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)\s*Nm/i)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

/** Parse displacement from "1498cc" or "2.0-litre" etc */
function parseDisplacement(val) {
  if (!val) return null
  // Try cc format first
  const ccMatch = val.match(/([\d,]+)\s*cc/i)
  if (ccMatch) return parseInt(ccMatch[1].replace(/,/g, ''))
  // Try litre format: "1.5-litre" → 1500
  const litreMatch = val.match(/([\d.]+)\s*-?\s*litre/i)
  if (litreMatch) return Math.round(parseFloat(litreMatch[1]) * 1000)
  return null
}

/** Parse cylinders from "4 cylinders in-line" or "4" */
function parseCylinders(val) {
  if (!val) return null
  const m = val.match(/(\d+)\s*cyl/i)
  if (m) return parseInt(m[1])
  const m2 = val.match(/^(\d+)$/)
  if (m2) return parseInt(m2[1])
  return null
}

/** Parse weight from "1793kg" */
function parseWeight(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)\s*kg/i)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

/** Parse mm dimension from "4740mm" */
function parseMm(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)\s*mm/i)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

/** Parse litres from "50L" or "668L" */
function parseLitres(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)\s*L/i)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

/** Parse fuel consumption "5.5L/100km" */
function parseFuel(val) {
  if (!val) return null
  const m = val.match(/([\d.]+)\s*L\/100/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse CO2 "127 g/km" */
function parseCo2(val) {
  if (!val) return null
  const m = val.match(/([\d,.]+)\s*g\/km/i)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

/** Parse wheel size from "20-inch diamond cut alloy" → '20"' */
function parseWheelSize(val) {
  if (!val) return null
  const m = val.match(/(\d+)\s*-?\s*inch/i)
  return m ? m[1] + '"' : null
}

/** Parse gears from transmission string */
function parseGears(val) {
  if (!val) return null
  const m = val.match(/(\d+)\s*-?\s*speed/i)
  return m ? parseInt(m[1]) : null
}

/** Map a feature-set's features array to standardized specs_json */
function mapFeaturesToSpecs(features) {
  const lookup = new Map()
  for (const f of features) {
    if (f.value) lookup.set(f.title, f.value)
  }

  const get = (title) => lookup.get(title) || null

  // Engine
  const engineType = get('Engine') || get('Motor')
  const displacement = parseDisplacement(get('Capacity') || get('Engine'))
  const configVal = get('Configuration')
  const cylinders = parseCylinders(configVal)
  const powerKw = parsePower(get('Maximum power'))
  const torqueNm = parseTorque(get('Maximum torque'))

  // Derive fuel type from engine description
  let fuelType = 'Petrol'
  if (engineType) {
    const lower = engineType.toLowerCase()
    if (lower.includes('diesel')) fuelType = 'Diesel'
    else if (lower.includes('electric') || lower.includes('ev')) fuelType = 'Electric'
    else if (lower.includes('hybrid')) fuelType = 'Hybrid'
  }

  // Transmission
  const transVal = get('Transmission') || get('Gearbox')
  let transType = null
  if (transVal) {
    const tl = transVal.toLowerCase()
    if (tl.includes('auto') || tl.includes('dct') || tl.includes('dht') || tl.includes('cvt')) transType = 'Automatic'
    else if (tl.includes('manual')) transType = 'Manual'
    else transType = transVal
  }
  const gears = parseGears(transVal)
  const driveVal = get('Drivetrain') || get('Drive')
  let drive = null
  if (driveVal) {
    const dl = driveVal.toLowerCase()
    if (dl.includes('awd') || dl.includes('all wheel') || dl.includes('all-wheel')) drive = 'AWD'
    else if (dl.includes('4x4') || dl.includes('4wd') || dl.includes('part-time 4x4')) drive = '4WD'
    else if (dl.includes('fwd') || dl.includes('front wheel') || dl.includes('front-wheel')) drive = 'FWD'
    else if (dl.includes('rwd') || dl.includes('rear wheel') || dl.includes('rear-wheel')) drive = 'RWD'
    else drive = driveVal
  }

  // Dimensions
  const lengthMm = parseMm(get('Overall length'))
  const widthMm = parseMm(get('Overall width'))
  const heightMm = parseMm(get('Overall height'))
  const wheelbaseMm = parseMm(get('Wheelbase'))
  const kerbWeightKg = parseWeight(get('Kerb weight'))

  // Performance
  const fuelCombined = parseFuel(get('Combined fuel consumption*') || get('Combined fuel consumption') || get('Fuel consumption (combined)'))
  const co2 = parseCo2(get('CO2 emissions') || get('CO2'))

  // Towing
  const brakedKg = parseWeight(get('Towing capacity (braked)'))
  const unbrakedKg = parseWeight(get('Towing capacity (unbraked)'))

  // Capacity
  const seatsVal = get('Seats')
  const seats = seatsVal ? parseInt(seatsVal) : null
  const bootLitres = parseLitres(get('Cargo volume (seats up, second row)') || get('Cargo volume'))
  const fuelTankLitres = parseLitres(get('Fuel tank capacity'))

  // Safety
  const airbagsVal = get('Airbags')
  const airbags = airbagsVal ? parseInt(airbagsVal) : null

  // Wheels
  const wheelsVal = get('Wheels') || get('Wheel size')
  const wheelSize = parseWheelSize(wheelsVal)
  const wheelType = wheelsVal?.toLowerCase().includes('alloy') ? 'Alloy'
    : wheelsVal?.toLowerCase().includes('steel') ? 'Steel' : 'Alloy'

  // Build specs_json
  const specs = {}

  if (displacement || cylinders || powerKw || torqueNm) {
    specs.engine = {}
    if (fuelType) specs.engine.type = fuelType
    if (displacement) specs.engine.displacement_cc = displacement
    if (cylinders) specs.engine.cylinders = cylinders
    if (powerKw) specs.engine.power_kw = powerKw
    if (torqueNm) specs.engine.torque_nm = torqueNm
  }

  if (transType || gears || drive) {
    specs.transmission = {}
    if (transType) specs.transmission.type = transType
    if (gears) specs.transmission.gears = gears
    if (drive) specs.transmission.drive = drive
  }

  if (lengthMm || widthMm || heightMm || wheelbaseMm || kerbWeightKg) {
    specs.dimensions = {}
    if (lengthMm) specs.dimensions.length_mm = lengthMm
    if (widthMm) specs.dimensions.width_mm = widthMm
    if (heightMm) specs.dimensions.height_mm = heightMm
    if (wheelbaseMm) specs.dimensions.wheelbase_mm = wheelbaseMm
    if (kerbWeightKg) specs.dimensions.kerb_weight_kg = kerbWeightKg
  }

  if (fuelCombined || co2) {
    specs.performance = {}
    if (fuelCombined) specs.performance.fuel_combined_l100km = fuelCombined
    if (co2) specs.performance.co2_gkm = co2
  }

  if (brakedKg || unbrakedKg) {
    specs.towing = {}
    if (brakedKg) specs.towing.braked_kg = brakedKg
    if (unbrakedKg) specs.towing.unbraked_kg = unbrakedKg
  }

  if (seats || bootLitres || fuelTankLitres) {
    specs.capacity = {}
    specs.capacity.doors = 5 // All KGM models are 5-door
    if (seats) specs.capacity.seats = seats
    if (bootLitres) specs.capacity.boot_litres = bootLitres
    if (fuelTankLitres) specs.capacity.fuel_tank_litres = fuelTankLitres
  }

  if (airbags) {
    specs.safety = { airbags }
  }

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
  console.log('=== KGM Specs Seed ===\n')

  // 1. Fetch all feature-sets from Payload CMS
  console.log('Step 1: Fetching feature-sets from Payload CMS...')
  const fsRes = await fetch(`${BASE}/feature-sets?limit=100&depth=3`, { headers: HEADERS })
  if (!fsRes.ok) { console.error('Feature-sets API failed:', fsRes.status); process.exit(1) }
  const fsData = await fsRes.json()
  const featureSets = fsData.docs
  console.log(`  Found ${featureSets.length} feature-sets`)

  // 2. Fetch grades to map feature-sets to products
  console.log('\nStep 2: Fetching grades from Payload CMS...')
  const gradesRes = await fetch(`${BASE}/grades?limit=100&depth=2`, { headers: HEADERS })
  const gradesData = await gradesRes.json()
  const grades = gradesData.docs
  console.log(`  Found ${grades.length} grades`)

  // 3. Build grade-name to feature-set mapping
  // Each feature-set has a name that matches a grade name
  const fsMap = new Map() // feature-set name → features[]
  for (const fs of featureSets) {
    if (fs.features?.length > 0) {
      fsMap.set(fs.name, fs.features)
    }
  }
  console.log(`  Feature-sets with features: ${fsMap.size}`)

  // 4. Fetch existing KGM products from Supabase
  console.log('\nStep 3: Fetching existing KGM products...')
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, external_key, title, subtitle, variant_code')
    .eq('oem_id', OEM_ID)
  if (prodErr) { console.error('Product fetch error:', prodErr.message); process.exit(1) }
  console.log(`  Found ${products.length} products`)

  // 5. Map each product to its feature-set and generate specs
  console.log('\nStep 4: Mapping products to feature-sets and generating specs...\n')

  let updatedCount = 0
  let skippedCount = 0
  let noMatchCount = 0
  const specsSummary = []

  for (const product of products) {
    // Try to find matching feature-set by grade name
    // Product title is like "Actyon K60 Hybrid", feature-set name is "Actyon K60 Hybrid"
    // Also try product.title directly, or just the subtitle
    let features = null
    let matchedFsName = null

    // Try direct title match
    if (fsMap.has(product.title)) {
      features = fsMap.get(product.title)
      matchedFsName = product.title
    }
    // Try subtitle
    if (!features && product.subtitle && fsMap.has(product.subtitle)) {
      features = fsMap.get(product.subtitle)
      matchedFsName = product.subtitle
    }
    // Try partial match: find feature-set whose name starts with or contains the product title
    if (!features) {
      for (const [fsName, fsFeatures] of fsMap) {
        if (fsName === product.title || product.title.startsWith(fsName) || fsName.startsWith(product.title)) {
          features = fsFeatures
          matchedFsName = fsName
          break
        }
      }
    }
    // Try matching by grade name from the grade objects
    if (!features) {
      const matchingGrade = grades.find(g => g.name === product.title || g.title === product.subtitle)
      if (matchingGrade) {
        // Find feature-set that references this grade
        for (const fs of featureSets) {
          const fsGrades = (fs.grades || []).map(g => typeof g === 'object' ? g.name : g)
          if (fsGrades.includes(matchingGrade.name)) {
            features = fs.features
            matchedFsName = fs.name
            break
          }
        }
      }
    }

    if (!features || features.length === 0) {
      noMatchCount++
      continue
    }

    // Map features to specs_json
    const specs = mapFeaturesToSpecs(features)
    if (Object.keys(specs).length === 0) {
      skippedCount++
      continue
    }

    // Extract scalar fields
    const scalars = extractScalarFields(specs)

    // Update product
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
      fsName: matchedFsName,
      engine: specs.engine?.displacement_cc ? `${specs.engine.displacement_cc}cc ${specs.engine.power_kw || '?'}kW` : 'n/a',
      drive: specs.transmission?.drive || '?',
      weight: specs.dimensions?.kerb_weight_kg || '?',
    })

    console.log(`  [OK] ${product.title} ← ${matchedFsName} (${features.length} features)`)
  }

  // 6. Summary
  console.log('\n=== KGM SPECS SEED COMPLETE ===')
  console.log(`  Total products:    ${products.length}`)
  console.log(`  Updated with specs: ${updatedCount}`)
  console.log(`  No feature match:  ${noMatchCount}`)
  console.log(`  Skipped (empty):   ${skippedCount}`)

  if (specsSummary.length > 0) {
    console.log('\n  Specs summary:')
    for (const s of specsSummary) {
      console.log(`    ${s.title.padEnd(40)} ${s.engine.padEnd(20)} ${s.drive.padEnd(5)} ${s.weight}kg`)
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
