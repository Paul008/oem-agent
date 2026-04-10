#!/usr/bin/env node
/**
 * Seed Isuzu Australia vehicle specs from Range API tags + known spec data.
 *
 * Isuzu only has 2 models (D-MAX, MU-X) with well-documented specs.
 * The Compare API returns feature names but NOT per-grade numeric values.
 * The Range API provides engine size (3.0L/2.2L), drivetrain, transmission, cabin type from tags.
 *
 * Strategy: Use Range API tags for variant-specific info (engine, drive, transmission, cabin)
 * combined with known published Isuzu spec data for the two engine variants.
 *
 * Run: cd dashboard/scripts && node seed-isuzu-specs.mjs
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
  Referer: 'https://www.isuzuute.com.au/',
  Origin: 'https://www.isuzuute.com.au',
}

const RANGE_SOURCES = [
  { model: 'D-MAX', slug: 'd-max', dsId: '%7B58ED1496-0A3E-4C26-84B5-4A9A766BF139%7D' },
  { model: 'MU-X', slug: 'mu-x', dsId: '%7BC91E66BB-1837-4DA2-AB7F-D0041C9384D7%7D' },
]

// Known Isuzu engine specs (from official Isuzu spec sheets)
// Source: 25.5MY Isuzu D-MAX / MU-X Vehicle Specifications PDFs
const ENGINE_SPECS = {
  '3.0L': {
    type: 'Diesel',
    displacement_cc: 2999,
    cylinders: 4,
    power_kw: 140,
    torque_nm: 450,
  },
  '2.2L': {
    type: 'Diesel',
    displacement_cc: 2199,
    cylinders: 4,
    power_kw: 100,
    torque_nm: 320,
  },
}

// Known Isuzu transmission specs
const TRANSMISSION_SPECS = {
  '3.0L_automatic': { type: 'Automatic', gears: 8 },
  '3.0L_manual': { type: 'Manual', gears: 6 },
  '2.2L_automatic': { type: 'Automatic', gears: 6 },
  '2.2L_manual': { type: 'Manual', gears: 6 },
}

// Known Isuzu D-MAX dimensions by body type (mm) - from published specs
// These vary by cab type and drive
const DMAX_DIMENSIONS = {
  // Crew Cab Ute
  'crew-cab_ute_4x4': { length_mm: 5265, width_mm: 1870, height_mm: 1790, wheelbase_mm: 3125, kerb_weight_kg: 2090 },
  'crew-cab_ute_4x2': { length_mm: 5265, width_mm: 1870, height_mm: 1735, wheelbase_mm: 3125, kerb_weight_kg: 1910 },
  // Crew Cab Chassis
  'crew-cab_chassis_4x4': { length_mm: 5325, width_mm: 1870, height_mm: 1790, wheelbase_mm: 3125, kerb_weight_kg: 1960 },
  'crew-cab_chassis_4x2': { length_mm: 5325, width_mm: 1870, height_mm: 1735, wheelbase_mm: 3125, kerb_weight_kg: 1780 },
  // Space Cab Chassis
  'space-cab_chassis_4x4': { length_mm: 5295, width_mm: 1870, height_mm: 1790, wheelbase_mm: 3125, kerb_weight_kg: 1910 },
  'space-cab_chassis_4x2': { length_mm: 5295, width_mm: 1870, height_mm: 1735, wheelbase_mm: 3125, kerb_weight_kg: 1730 },
  // Single Cab Chassis
  'single-cab_chassis_4x4': { length_mm: 5295, width_mm: 1870, height_mm: 1775, wheelbase_mm: 3125, kerb_weight_kg: 1850 },
  'single-cab_chassis_4x2': { length_mm: 5295, width_mm: 1870, height_mm: 1735, wheelbase_mm: 3125, kerb_weight_kg: 1690 },
}

// Known Isuzu MU-X dimensions
const MUX_DIMENSIONS = {
  '4x4': { length_mm: 4850, width_mm: 1870, height_mm: 1870, wheelbase_mm: 2855, kerb_weight_kg: 2120 },
  '4x2': { length_mm: 4850, width_mm: 1870, height_mm: 1825, wheelbase_mm: 2855, kerb_weight_kg: 1940 },
}

// Known Isuzu D-MAX towing (braked/unbraked kg) by drive type
const DMAX_TOWING = {
  '4x4': { braked_kg: 3500, unbraked_kg: 750 },
  '4x2': { braked_kg: 3500, unbraked_kg: 750 },
}

// Known Isuzu MU-X towing
const MUX_TOWING = {
  '4x4': { braked_kg: 3500, unbraked_kg: 750 },
  '4x2': { braked_kg: 3500, unbraked_kg: 750 },
}

// Known fuel consumption (combined L/100km) by engine + drive
const FUEL_CONSUMPTION = {
  'd-max_3.0L_4x4_automatic': { fuel_combined_l100km: 8.0, co2_gkm: 211 },
  'd-max_3.0L_4x2_automatic': { fuel_combined_l100km: 7.5, co2_gkm: 197 },
  'd-max_3.0L_4x4_manual': { fuel_combined_l100km: 7.7, co2_gkm: 203 },
  'd-max_3.0L_4x2_manual': { fuel_combined_l100km: 7.2, co2_gkm: 189 },
  'd-max_2.2L_4x4_automatic': { fuel_combined_l100km: 7.3, co2_gkm: 192 },
  'd-max_2.2L_4x2_automatic': { fuel_combined_l100km: 7.0, co2_gkm: 184 },
  'd-max_2.2L_4x4_manual': { fuel_combined_l100km: 7.0, co2_gkm: 184 },
  'd-max_2.2L_4x2_manual': { fuel_combined_l100km: 6.8, co2_gkm: 179 },
  'mu-x_3.0L_4x4_automatic': { fuel_combined_l100km: 8.3, co2_gkm: 219 },
  'mu-x_3.0L_4x2_automatic': { fuel_combined_l100km: 7.7, co2_gkm: 203 },
  'mu-x_2.2L_4x4_automatic': { fuel_combined_l100km: 7.5, co2_gkm: 197 },
  'mu-x_2.2L_4x2_automatic': { fuel_combined_l100km: 7.2, co2_gkm: 189 },
}

// Known capacity
const DMAX_CAPACITY = {
  'crew-cab_ute': { doors: 4, seats: 5, fuel_tank_litres: 76 },
  'crew-cab_chassis': { doors: 4, seats: 5, fuel_tank_litres: 76 },
  'space-cab_chassis': { doors: 4, seats: 5, fuel_tank_litres: 76 },
  'single-cab_chassis': { doors: 2, seats: 2, fuel_tank_litres: 76 },
}

const MUX_CAPACITY = { doors: 5, seats: 7, boot_litres: 878, fuel_tank_litres: 80 }

// Wheel specs by grade
const WHEEL_SPECS = {
  'x-terrain': { size: '18"', type: 'Alloy' },
  'ls-u+': { size: '18"', type: 'Alloy' },
  'ls-u': { size: '18"', type: 'Alloy' },
  'x-rider': { size: '18"', type: 'Alloy' },
  'sx': { size: '17"', type: 'Steel' },
  'ls-t': { size: '18"', type: 'Alloy' },
  'default': { size: '17"', type: 'Alloy' },
}

function slugify(str) {
  // Preserve "+" for trim disambiguation (LS-U vs LS-U+, X-Terrain vs X-Terrain+)
  return str
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Extract tag value from Range API car tags */
function getTag(tags, filterKey) {
  const tag = tags?.find(t => t.FilterKey === filterKey)
  if (!tag?.FilterItems?.length) return null
  return tag.FilterItems[0]
}

/** Get Isuzu grade slug from variant name */
function getGradeSlug(name) {
  const lower = name.toLowerCase()
  if (lower.includes('x-terrain')) return 'x-terrain'
  if (lower.includes('ls-u+')) return 'ls-u+'
  if (lower.includes('ls-u')) return 'ls-u'
  if (lower.includes('ls-t')) return 'ls-t'
  if (lower.includes('x-rider')) return 'x-rider'
  if (lower.includes('sx')) return 'sx'
  return 'default'
}

function getCabinType(name) {
  const lower = name.toLowerCase()
  if (lower.includes('crew cab')) return 'crew-cab'
  if (lower.includes('space cab')) return 'space-cab'
  if (lower.includes('single cab')) return 'single-cab'
  return 'crew-cab'
}

function getBodyType(name) {
  const lower = name.toLowerCase()
  if (lower.includes('chassis')) return 'chassis'
  if (lower.includes('ute')) return 'ute'
  return 'suv'
}

/** Build specs_json for an Isuzu variant using range API tags + known specs */
function buildIsuzuSpecs(modelSlug, carName, tags) {
  const engineTag = getTag(tags, 'engine')
  const driveTag = getTag(tags, 'drive-train')
  const transTag = getTag(tags, 'transmission')
  const cabinTag = getTag(tags, 'cabin-type')

  const engineKey = engineTag?.Key || '3.0L'
  const driveKey = driveTag?.Key || '4x4'
  const transKey = transTag?.Key || 'automatic'
  const cabinKey = cabinTag?.Key || 'crew-cab'
  const bodyKey = getBodyType(carName)
  const gradeKey = getGradeSlug(carName)

  const specs = {}

  // Engine
  const engineData = ENGINE_SPECS[engineKey]
  if (engineData) {
    specs.engine = { ...engineData }
  }

  // Transmission
  const transData = TRANSMISSION_SPECS[`${engineKey}_${transKey}`]
  if (transData) {
    specs.transmission = {
      ...transData,
      drive: driveKey === '4x4' ? '4WD' : '2WD',
    }
  }

  // Dimensions
  if (modelSlug === 'd-max') {
    const dimKey = `${cabinKey}_${bodyKey}_${driveKey}`
    const dimData = DMAX_DIMENSIONS[dimKey]
    if (dimData) {
      specs.dimensions = { ...dimData }
    }
  } else {
    const dimData = MUX_DIMENSIONS[driveKey]
    if (dimData) {
      specs.dimensions = { ...dimData }
    }
  }

  // Performance (fuel consumption)
  const fuelKey = `${modelSlug}_${engineKey}_${driveKey}_${transKey}`
  const fuelData = FUEL_CONSUMPTION[fuelKey]
  if (fuelData) {
    specs.performance = { ...fuelData }
  }

  // Towing
  if (modelSlug === 'd-max') {
    const towData = DMAX_TOWING[driveKey]
    if (towData) specs.towing = { ...towData }
  } else {
    const towData = MUX_TOWING[driveKey]
    if (towData) specs.towing = { ...towData }
  }

  // Capacity
  if (modelSlug === 'd-max') {
    const capKey = `${cabinKey}_${bodyKey}`
    const capData = DMAX_CAPACITY[capKey]
    if (capData) specs.capacity = { ...capData }
  } else {
    specs.capacity = { ...MUX_CAPACITY }
  }

  // Safety - All Isuzu models have 5-star ANCAP, 8 airbags
  specs.safety = { ancap_stars: 5, airbags: 8 }

  // Wheels
  const wheelData = WHEEL_SPECS[gradeKey] || WHEEL_SPECS['default']
  specs.wheels = { ...wheelData }

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
  console.log('=== Isuzu Specs Seed ===\n')

  // 1. Fetch range data for both models to get per-variant tags
  console.log('Step 1: Fetching range data from Isuzu API...')
  const variantSpecs = new Map() // carName → { modelSlug, specs, tags }

  for (const src of RANGE_SOURCES) {
    const url = `https://www.isuzuute.com.au/isuzuapi/RangeAPI/GetRangeData?dataSourceId=${src.dsId}`
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) {
      console.error(`  Range API ${src.model} failed: ${res.status}`)
      continue
    }
    const data = await res.json()
    const cars = data.Cars || []
    console.log(`  ${src.model}: ${cars.length} variants from Range API`)

    for (const car of cars) {
      const specs = buildIsuzuSpecs(src.slug, car.Name, car.Tags)
      variantSpecs.set(car.Name, { modelSlug: src.slug, specs, tags: car.Tags })
    }
  }

  console.log(`  Total variants with specs: ${variantSpecs.size}`)

  // 2. Fetch existing Isuzu products from Supabase
  console.log('\nStep 2: Fetching existing Isuzu products...')
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, external_key, title, subtitle, variant_name, variant_code, meta_json')
    .eq('oem_id', OEM_ID)
  if (prodErr) { console.error('Product fetch error:', prodErr.message); process.exit(1) }
  console.log(`  Found ${products.length} products`)

  // 3. Match products to variants and update specs
  console.log('\nStep 3: Updating products with specs...\n')

  let updatedCount = 0
  let noMatchCount = 0
  const specsSummary = []

  for (const product of products) {
    // Try to match by variant_name (subtitle field from seed-isuzu-colors.mjs)
    const variantName = product.variant_name || product.subtitle || ''
    let matched = null
    let matchedName = null

    // Direct match by variant name
    if (variantSpecs.has(variantName)) {
      matched = variantSpecs.get(variantName)
      matchedName = variantName
    }

    // Try matching by cleaned-up name
    if (!matched) {
      const cleanName = variantName.replace(/\s*\(\d+\.\d+L\)\s*/g, '').trim()
      if (variantSpecs.has(cleanName)) {
        matched = variantSpecs.get(cleanName)
        matchedName = cleanName
      }
    }

    // Try matching by car_name in meta_json
    if (!matched && product.meta_json?.car_name) {
      // The car_name in meta is like "D-MAX-4x4-X-TERRAIN-Crew-Cab-Ute"
      // Range API Name is like "4x4 X-TERRAIN Crew Cab Ute"
      for (const [name, data] of variantSpecs) {
        const normalized = `${data.modelSlug === 'd-max' ? 'D-MAX' : 'MU-X'}-${name.replace(/\s+/g, '-')}`
        if (product.meta_json.car_name === normalized) {
          matched = data
          matchedName = name
          break
        }
      }
    }

    // Try partial match on title
    if (!matched) {
      for (const [name, data] of variantSpecs) {
        // Remove engine spec from name for matching
        const cleanRangeName = name.replace(/\s*\(\d+\.\d+L\)\s*/g, '').trim()
        const titleModel = data.modelSlug === 'd-max' ? 'D-MAX' : 'MU-X'
        const fullName = `${titleModel} ${cleanRangeName}`
        if (product.title === fullName || product.title.includes(cleanRangeName)) {
          matched = data
          matchedName = name
          break
        }
      }
    }

    if (!matched) {
      noMatchCount++
      console.log(`  [SKIP] No match: "${product.title}"`)
      continue
    }

    const specs = matched.specs
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
      engine: `${specs.engine?.displacement_cc || '?'}cc ${specs.engine?.power_kw || '?'}kW`,
      drive: specs.transmission?.drive || '?',
      trans: `${specs.transmission?.gears || '?'}-spd ${specs.transmission?.type || '?'}`,
    })

    console.log(`  [OK] ${product.title} ← "${matchedName}"`)
  }

  // 4. Summary
  console.log('\n=== ISUZU SPECS SEED COMPLETE ===')
  console.log(`  Total products:     ${products.length}`)
  console.log(`  Updated with specs: ${updatedCount}`)
  console.log(`  No match:           ${noMatchCount}`)

  if (specsSummary.length > 0) {
    console.log('\n  Specs summary:')
    for (const s of specsSummary) {
      console.log(`    ${s.title.padEnd(50)} ${s.engine.padEnd(18)} ${s.trans.padEnd(16)} ${s.drive}`)
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
