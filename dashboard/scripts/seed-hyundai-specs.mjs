#!/usr/bin/env node
/**
 * Seed Hyundai Australia product specs from the v3 Specifications API.
 *
 * API: GET https://www.hyundai.com/content/api/au/hyundai/v3/specifications?variantId={uuid}
 * Returns structured spec data grouped by category > subCategory > specification.
 * The variantId comes from each product's meta_json.variant_id (set by seed-hyundai-colors.mjs).
 *
 * Run: cd dashboard/scripts && node seed-hyundai-specs.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'hyundai-au'
const SPEC_API = 'https://www.hyundai.com/content/api/au/hyundai/v3/specifications'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/** Parse numeric value from a spec string like "90 kW @ 6,300 RPM" or "1591 cc" */
function parseNum(str) {
  if (!str || str === 'N/A') return null
  const m = str.replace(/,/g, '').match(/([\d.]+)/)
  return m ? parseFloat(m[1]) : null
}

/** Parse "X litres (Y cc)" → displacement_cc */
function parseDisplacementCc(str) {
  if (!str) return null
  const ccMatch = str.replace(/,/g, '').match(/(\d+)\s*cc/i)
  if (ccMatch) return parseInt(ccMatch[1], 10)
  // Try litres → cc: "1.6 litres"
  const litreMatch = str.match(/([\d.]+)\s*litre/i)
  if (litreMatch) return Math.round(parseFloat(litreMatch[1]) * 1000)
  return null
}

/** Parse "90 kW @ 6,300 RPM" → 90 */
function parsePowerKw(str) {
  if (!str) return null
  const m = str.match(/([\d.]+)\s*kW/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse "151 Nm @ 4,850 RPM" → 151 */
function parseTorqueNm(str) {
  if (!str) return null
  const m = str.replace(/,/g, '').match(/([\d.]+)\s*Nm/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse "800 kg" → 800 */
function parseKg(str) {
  if (!str) return null
  const m = str.replace(/,/g, '').match(/([\d.]+)\s*kg/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse "4040 mm" → 4040 */
function parseMm(str) {
  if (!str) return null
  const m = str.replace(/,/g, '').match(/([\d.]+)\s*mm/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse "45L" or "45 L" → 45 */
function parseLitres(str) {
  if (!str) return null
  const m = str.replace(/,/g, '').match(/([\d.]+)\s*L/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse "355 L" cargo → 355 */
function parseBootLitres(str) {
  if (!str) return null
  const m = str.replace(/,/g, '').match(/([\d.]+)\s*L/i)
  return m ? parseFloat(m[1]) : null
}

/** Count airbag types that are TRUE */
function countAirbags(specMap) {
  let count = 0
  const airbagSection = specMap['Airbags'] || {}
  for (const [key, val] of Object.entries(airbagSection)) {
    if (val === 'TRUE') {
      // Count each TRUE airbag type
      if (key.includes('Front airbags')) count += 2 // driver + passenger
      else if (key.includes('Side (thorax)')) count += 2
      else if (key.includes('Side Curtain Front')) count += 2
      else if (key.includes('Side curtain airbag - 2nd Row')) count += 2
      else count += 1
    }
  }
  return count || null
}

/** Parse gears from transmission description like "6 speed automatic" */
function parseGears(str) {
  if (!str) return null
  const m = str.match(/(\d+)\s*speed/i)
  return m ? parseInt(m[1], 10) : null
}

/** Derive fuel type from engine text or fuel type spec */
function deriveFuelType(engineLabel, fuelTypeSpec) {
  const text = ((engineLabel || '') + ' ' + (fuelTypeSpec || '')).toLowerCase()
  if (text.includes('electric') || text.includes('ev')) return 'Electric'
  if (text.includes('plug-in') || text.includes('phev')) return 'PHEV'
  if (text.includes('hybrid') || text.includes('hev')) return 'Hybrid'
  if (text.includes('diesel')) return 'Diesel'
  if (text.includes('petrol') || text.includes('mpi') || text.includes('gdi') || text.includes('ron')) return 'Petrol'
  return null
}

/** Derive drive type from variant label */
function deriveDrive(label) {
  if (!label) return null
  if (/\bAWD\b/i.test(label)) return 'AWD'
  if (/\b4WD\b/i.test(label)) return '4WD'
  if (/\bFWD\b/i.test(label)) return 'FWD'
  if (/\bRWD\b/i.test(label)) return 'RWD'
  return null
}

/** Derive transmission type from variant label */
function deriveTransType(label) {
  if (!label) return null
  const l = label.toLowerCase()
  if (l.includes('automatic') || l.includes('dct') || l.includes('ivt') || l.includes('8at') || l.includes('6at')) return 'Automatic'
  if (l.includes('manual')) return 'Manual'
  if (l.includes('single-speed') || l.includes('e-gmp')) return 'Automatic' // EV
  return 'Automatic'
}

/** Parse wheel size from spec like "15 x 6.0J +41" or "17 x 7.0J +45" */
function parseWheelSize(dimStr) {
  if (!dimStr) return null
  const m = dimStr.match(/(\d+)\s*x/)
  return m ? `${m[1]}"` : null
}

/**
 * Flatten the Hyundai spec API response into a map:
 *   { "Engine": { "Cylinder capacity": "1.6 litres (1591 cc)", ... }, "Weight": { ... } }
 */
function flattenSpecs(data) {
  const map = {}
  const specVersion = data.specVersion?.[0]
  if (!specVersion?.category) return map

  for (const cat of specVersion.category) {
    for (const sub of (cat.subCategory || [])) {
      const section = sub.name || 'Other'
      if (!map[section]) map[section] = {}
      for (const spec of (sub.specification || [])) {
        const val = spec.values?.[0]?.value || null
        map[section][spec.name] = val
      }
    }
  }
  return map
}

/**
 * Map flattened Hyundai specs to standardized specs_json schema
 */
function mapToStandardSpecs(specMap, variantLabel) {
  const engine = specMap['Engine'] || {}
  const trans = specMap['Transmission'] || {}
  const weight = specMap['Weight'] || {}
  const towing = specMap['Towing capacity'] || {}
  const fuel = specMap['Fuel consumption'] || {}
  const exterior = specMap['Exterior'] || {}
  const interior = specMap['Interior'] || {}
  const wheels = specMap['Wheels & tyres'] || specMap['Wheels & Tyres'] || {}

  const displacementCc = parseDisplacementCc(engine['Cylinder capacity'])
  const cylinders = parseNum(engine['Number of cylinders'])
  const powerKw = parsePowerKw(engine['Maximum Power'])
  const torqueNm = parseTorqueNm(engine['Maximum Torque'])
  const fuelType = deriveFuelType(variantLabel, engine['Fuel Type'])

  const transType = deriveTransType(variantLabel)
  const gears = parseGears(trans['Automatic'] || trans['Manual'])
  const drive = deriveDrive(variantLabel)

  const lengthMm = parseMm(exterior['Length'])
  const widthMm = parseMm(exterior['Width'])
  const heightMm = parseMm(exterior['Height'] || exterior['Height (with roof rails)'] || exterior['Height (without roof rails)'])
  const wheelbaseMm = parseMm(exterior['Wheelbase'])
  const kerbWeightKg = parseKg(weight['Kerb weight - lightest'])

  const fuelCombined = parseNum(fuel['Combined (L/100km)'])
  const co2 = parseNum(fuel['CO2 - combined (g/km)'])

  const brakedKg = parseKg(towing['Braked'])
  const unbrakedKg = parseKg(towing['Unbraked'])

  const seats = parseNum(specMap['Seating']?.['Height adjustable front head restraints'] ? null : null) // no direct seat count in API
  const bootLitres = parseBootLitres(interior['Cargo area - VDA'] || interior['Boot volume - VDA'])
  const fuelTankLitres = parseLitres(fuel['Fuel tank volume'])

  const airbags = countAirbags(specMap)

  const wheelDim = wheels['Wheel dimensions']
  const wheelSize = parseWheelSize(wheelDim)
  const wheelType = wheels['Wheel type'] || null

  const result = {}

  // Engine
  const engineObj = {}
  if (fuelType) engineObj.type = fuelType
  if (displacementCc) engineObj.displacement_cc = displacementCc
  if (cylinders) engineObj.cylinders = cylinders
  if (powerKw) engineObj.power_kw = powerKw
  if (torqueNm) engineObj.torque_nm = torqueNm
  if (Object.keys(engineObj).length) result.engine = engineObj

  // Transmission
  const transObj = {}
  if (transType) transObj.type = transType
  if (gears) transObj.gears = gears
  if (drive) transObj.drive = drive
  if (Object.keys(transObj).length) result.transmission = transObj

  // Dimensions
  const dimObj = {}
  if (lengthMm) dimObj.length_mm = lengthMm
  if (widthMm) dimObj.width_mm = widthMm
  if (heightMm) dimObj.height_mm = heightMm
  if (wheelbaseMm) dimObj.wheelbase_mm = wheelbaseMm
  if (kerbWeightKg) dimObj.kerb_weight_kg = kerbWeightKg
  if (Object.keys(dimObj).length) result.dimensions = dimObj

  // Performance
  const perfObj = {}
  if (fuelCombined) perfObj.fuel_combined_l100km = fuelCombined
  if (co2) perfObj.co2_gkm = co2
  if (Object.keys(perfObj).length) result.performance = perfObj

  // Towing
  const towObj = {}
  if (brakedKg) towObj.braked_kg = brakedKg
  if (unbrakedKg) towObj.unbraked_kg = unbrakedKg
  if (Object.keys(towObj).length) result.towing = towObj

  // Capacity
  const capObj = { doors: 5 } // All Hyundai AU models are 5-door
  if (bootLitres) capObj.boot_litres = bootLitres
  if (fuelTankLitres) capObj.fuel_tank_litres = fuelTankLitres
  if (Object.keys(capObj).length > 1 || bootLitres || fuelTankLitres) result.capacity = capObj

  // Safety
  const safeObj = {}
  safeObj.ancap_stars = 5 // All current Hyundai models have 5-star ANCAP
  if (airbags) safeObj.airbags = airbags
  result.safety = safeObj

  // Wheels
  const wheelObj = {}
  if (wheelSize) wheelObj.size = wheelSize
  if (wheelType) wheelObj.type = wheelType
  if (Object.keys(wheelObj).length) result.wheels = wheelObj

  return result
}

/* ── Main ─────────────────────────────────────────── */

console.log('=== Hyundai Australia Spec Seed ===\n')

// Step 1: Load all Hyundai products with variant IDs
const { data: products, error: prodErr } = await supabase
  .from('products')
  .select('id, external_key, title, variant_name, meta_json')
  .eq('oem_id', OEM_ID)

if (prodErr) {
  console.error('Error loading products:', prodErr.message)
  process.exit(1)
}

console.log(`Loaded ${products.length} Hyundai products`)

// Filter to products with variant IDs
const withVariantId = products.filter(p => p.meta_json?.variant_id)
const withoutVariantId = products.filter(p => !p.meta_json?.variant_id)
console.log(`  With variant_id: ${withVariantId.length}`)
console.log(`  Without variant_id: ${withoutVariantId.length} (will be skipped)`)

if (withoutVariantId.length > 0) {
  console.log('  Skipped products:', withoutVariantId.map(p => p.external_key).join(', '))
}

// Deduplicate by variant_id (some products share the same variant)
const variantMap = new Map()
for (const p of withVariantId) {
  const vid = p.meta_json.variant_id
  if (!variantMap.has(vid)) {
    variantMap.set(vid, [])
  }
  variantMap.get(vid).push(p)
}
console.log(`Unique variant IDs to fetch: ${variantMap.size}\n`)

// Step 2: Fetch specs for each unique variant
let fetched = 0
let failed = 0
let updated = 0
const updates = []

for (const [variantId, prods] of variantMap) {
  const label = prods[0].variant_name || prods[0].title
  try {
    const url = `${SPEC_API}?variantId=${variantId}`
    const res = await fetch(url, { headers: HEADERS })

    if (!res.ok) {
      console.log(`  FAIL ${res.status} for ${label} (${variantId})`)
      failed++
      continue
    }

    const data = await res.json()
    if (!data.specVersion?.length) {
      console.log(`  EMPTY specs for ${label}`)
      failed++
      continue
    }

    fetched++
    const specMap = flattenSpecs(data)
    const specsJson = mapToStandardSpecs(specMap, label)

    // Extract scalar fields for the products table
    const engineSize = specsJson.engine?.displacement_cc
      ? `${(specsJson.engine.displacement_cc / 1000).toFixed(1)}L`
      : null
    const cylinders = specsJson.engine?.cylinders || null
    const transmission = specsJson.transmission?.type || null
    const gears = specsJson.transmission?.gears || null
    const drive = specsJson.transmission?.drive || null
    const doors = specsJson.capacity?.doors || 5
    const seats = 5 // Default; Staria/Palisade may differ but API lacks explicit seat count

    for (const p of prods) {
      updates.push({
        id: p.id,
        specs_json: specsJson,
        engine_size: engineSize,
        cylinders,
        transmission,
        gears,
        drive,
        doors,
        seats,
      })
    }

    // Log a sample
    if (fetched <= 3) {
      console.log(`  SAMPLE ${label}:`)
      console.log(`    Engine: ${specsJson.engine?.displacement_cc}cc ${specsJson.engine?.cylinders}cyl ${specsJson.engine?.power_kw}kW/${specsJson.engine?.torque_nm}Nm`)
      console.log(`    Trans: ${specsJson.transmission?.type} ${specsJson.transmission?.gears}-speed ${specsJson.transmission?.drive}`)
      console.log(`    Dims: ${specsJson.dimensions?.length_mm}x${specsJson.dimensions?.width_mm}x${specsJson.dimensions?.height_mm}mm`)
      console.log(`    Fuel: ${specsJson.performance?.fuel_combined_l100km}L/100km CO2:${specsJson.performance?.co2_gkm}g/km`)
      console.log(`    Towing: ${specsJson.towing?.braked_kg}kg braked`)
      console.log(`    Wheels: ${specsJson.wheels?.size} ${specsJson.wheels?.type}`)
    }

  } catch (e) {
    console.log(`  ERROR for ${label}: ${e.message}`)
    failed++
  }

  await sleep(300) // Rate limit
}

console.log(`\nFetched: ${fetched}, Failed: ${failed}`)
console.log(`Products to update: ${updates.length}`)

// Step 3: Update products in Supabase
if (updates.length > 0) {
  console.log('\n=== Updating products ===')

  for (const u of updates) {
    const { error } = await supabase
      .from('products')
      .update({
        specs_json: u.specs_json,
        engine_size: u.engine_size,
        cylinders: u.cylinders,
        transmission: u.transmission,
        gears: u.gears,
        drive: u.drive,
        doors: u.doors,
        seats: u.seats,
      })
      .eq('id', u.id)

    if (error) {
      console.log(`  Error updating ${u.id}: ${error.message}`)
    } else {
      updated++
    }
  }
}

// Summary
console.log('\n=== HYUNDAI SPEC SEED COMPLETE ===')
console.log(`  Products with specs: ${updated} / ${products.length}`)
console.log(`  Unique variants fetched: ${fetched}`)
console.log(`  Failed: ${failed}`)

// Breakdown by spec coverage
const withEngine = updates.filter(u => u.specs_json.engine).length
const withDims = updates.filter(u => u.specs_json.dimensions).length
const withPerf = updates.filter(u => u.specs_json.performance).length
const withTowing = updates.filter(u => u.specs_json.towing).length
console.log(`  With engine specs: ${withEngine}`)
console.log(`  With dimensions: ${withDims}`)
console.log(`  With performance: ${withPerf}`)
console.log(`  With towing: ${withTowing}`)
