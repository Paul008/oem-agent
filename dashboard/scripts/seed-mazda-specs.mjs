#!/usr/bin/env node
/**
 * Seed Mazda Australia product specs from React hydration JSON on model pages.
 *
 * Each model page (e.g. https://www.mazda.com.au/cars/cx-5/) contains a large
 * <script> tag with React hydration data. Engine entries within that data have:
 *   fuelConsumption, maximumPower, maximumTorque, engineSize, engineName,
 *   transmissionType, transmissionDescription, drivetrain, fuelType,
 *   fuelTankCapacity, gradePrefix
 *
 * We extract these per engine variant and map to the standardized specs_json.
 *
 * Run: cd dashboard/scripts && node seed-mazda-specs.mjs
 */

import { createClient } from '@supabase/supabase-js'
import https from 'https'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'mazda-au'

// Map DB model slug to Mazda website URL slug
const MODELS = [
  { dbSlug: 'bt-50',   urlSlug: 'bt-50',  bodyType: 'Ute' },
  { dbSlug: 'cx-3',    urlSlug: 'cx-3',   bodyType: 'Small SUV' },
  { dbSlug: 'cx-5',    urlSlug: 'cx-5',   bodyType: 'Medium SUV' },
  { dbSlug: 'cx-60',   urlSlug: 'cx-60',  bodyType: 'Medium SUV' },
  { dbSlug: 'cx-70',   urlSlug: 'cx-70',  bodyType: 'Large SUV' },
  { dbSlug: 'cx-80',   urlSlug: 'cx-80',  bodyType: 'Large SUV' },
  { dbSlug: 'cx-90',   urlSlug: 'cx-90',  bodyType: 'Large SUV' },
  { dbSlug: 'mazda2',  urlSlug: 'mazda2', bodyType: 'Hatch' },
  { dbSlug: 'mazda3',  urlSlug: 'mazda3', bodyType: 'Hatch' },
  { dbSlug: 'mx-5',    urlSlug: 'mx-5',   bodyType: 'Convertible' },
]

/* ── Known Mazda model-level specs (dimensions, towing, safety) ── */
const MODEL_DIMS = {
  'mazda2':  { length_mm: 4065, width_mm: 1695, height_mm: 1500, wheelbase_mm: 2570, kerb_weight_kg: 1050, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 0, towing_unbraked: 0 },
  'mazda3':  { length_mm: 4460, width_mm: 1795, height_mm: 1435, wheelbase_mm: 2725, kerb_weight_kg: 1354, doors: 5, seats: 5, ancap_stars: 5, airbags: 7, towing_braked: 0, towing_unbraked: 0 },
  'cx-3':    { length_mm: 4275, width_mm: 1765, height_mm: 1550, wheelbase_mm: 2570, kerb_weight_kg: 1230, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 0, towing_unbraked: 0 },
  'cx-5':    { length_mm: 4575, width_mm: 1845, height_mm: 1680, wheelbase_mm: 2700, kerb_weight_kg: 1560, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 1800, towing_unbraked: 750 },
  'cx-60':   { length_mm: 4745, width_mm: 1890, height_mm: 1680, wheelbase_mm: 2870, kerb_weight_kg: 1770, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 2000, towing_unbraked: 750 },
  'cx-70':   { length_mm: 4860, width_mm: 1930, height_mm: 1690, wheelbase_mm: 2870, kerb_weight_kg: 1870, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 2000, towing_unbraked: 750 },
  'cx-80':   { length_mm: 4990, width_mm: 1890, height_mm: 1710, wheelbase_mm: 3120, kerb_weight_kg: 1930, doors: 5, seats: 7, ancap_stars: 5, airbags: 6, towing_braked: 2500, towing_unbraked: 750 },
  'cx-90':   { length_mm: 5100, width_mm: 1930, height_mm: 1745, wheelbase_mm: 3120, kerb_weight_kg: 2066, doors: 5, seats: 7, ancap_stars: 5, airbags: 6, towing_braked: 2500, towing_unbraked: 750 },
  'mx-5':    { length_mm: 3915, width_mm: 1735, height_mm: 1235, wheelbase_mm: 2310, kerb_weight_kg: 1075, doors: 2, seats: 2, ancap_stars: 5, airbags: 6, towing_braked: 0, towing_unbraked: 0 },
  'bt-50':   { length_mm: 5280, width_mm: 1870, height_mm: 1790, wheelbase_mm: 3125, kerb_weight_kg: 1910, doors: 4, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 3500, towing_unbraked: 750 },
}

/* ── Known Mazda engine specs by engine name / grade prefix ── */
const ENGINE_DETAILS = {
  // Skyactiv-G (Petrol)
  'skyactiv-g-1.5': { displacement_cc: 1496, cylinders: 4 },
  'skyactiv-g-2.0': { displacement_cc: 1998, cylinders: 4 },
  'skyactiv-g-2.5': { displacement_cc: 2488, cylinders: 4 },
  'skyactiv-g-2.5t': { displacement_cc: 2488, cylinders: 4 },
  // Skyactiv-D (Diesel)
  'skyactiv-d-1.8': { displacement_cc: 1759, cylinders: 4 },
  'skyactiv-d-3.3': { displacement_cc: 3283, cylinders: 6 },
  // e-Skyactiv (PHEV)
  'e-skyactiv-phev-2.5': { displacement_cc: 2488, cylinders: 4 },
  // e-Skyactiv X
  'e-skyactiv-x-2.0': { displacement_cc: 1998, cylinders: 4 },
  // BT-50 (Isuzu-sourced)
  'bt50-3.0d': { displacement_cc: 2999, cylinders: 4 },
  'bt50-2.2d': { displacement_cc: 2184, cylinders: 4 },
  // Skyactiv-G (Turbo) inline-6
  'skyactiv-g-3.3t': { displacement_cc: 3283, cylinders: 6 },
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

/** Parse "115kW @ 6,000rpm" → 115 */
function parsePowerKw(str) {
  if (!str) return null
  const m = str.replace(/,/g, '').match(/([\d.]+)\s*kW/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse "200Nm @ 4,000rpm" → 200 */
function parseTorqueNm(str) {
  if (!str) return null
  const m = str.replace(/,/g, '').match(/([\d.]+)\s*Nm/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse "6.9 l/100km" → 6.9 */
function parseFuelConsumption(str) {
  if (!str) return null
  const m = str.match(/([\d.]+)\s*l\/100/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse "56 litres" → 56 */
function parseTankLitres(str) {
  if (!str) return null
  const m = str.replace(/,/g, '').match(/([\d.]+)\s*litre/i)
  return m ? parseFloat(m[1]) : null
}

/** Parse "2.0l" → 2000, "2.5l Turbo" → 2500 */
function parseEngineSizeCc(str) {
  if (!str) return null
  const m = str.match(/([\d.]+)\s*l/i)
  return m ? Math.round(parseFloat(m[1]) * 1000) : null
}

/** Derive fuel type */
function deriveFuelType(fuelType, engineName) {
  const text = ((fuelType || '') + ' ' + (engineName || '')).toLowerCase()
  if (text.includes('phev') || text.includes('plug-in')) return 'PHEV'
  if (text.includes('hybrid') || text.includes('mhev') || text.includes('e-skyactiv')) return 'Hybrid'
  if (text.includes('diesel') || text.includes('skyactiv-d') || text.includes('skyactiv d')) return 'Diesel'
  if (text.includes('electric') || text.includes(' ev')) return 'Electric'
  return 'Petrol'
}

/** Find engine details (displacement, cylinders) from engine name and size */
function findEngineDetails(engineName, engineSize) {
  const name = (engineName || '').toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '')
  const size = (engineSize || '').toLowerCase().replace(/\s+/g, '')

  // BT-50 special case (Isuzu-sourced diesel)
  if (name.includes('bt-50') || name.includes('isuzu') || (size.startsWith('3.0') && name.includes('diesel'))) {
    return ENGINE_DETAILS['bt50-3.0d']
  }

  // Try matching by engine name + size
  const sizeNum = size.replace(/l.*/, '')
  const isDiesel = name.includes('skyactiv-d') || name.includes('skyactiv d') || name.includes('diesel')

  // BT-50 2.2L diesel
  if (size.startsWith('2.2') && isDiesel) {
    return ENGINE_DETAILS['bt50-2.2d']
  }
  const isTurbo = name.includes('turbo') || name.includes(' t')
  const isPHEV = name.includes('phev') || name.includes('e-skyactiv-phev')
  const isX = name.includes('skyactiv-x') || name.includes('skyactiv x')

  if (isPHEV) {
    const key = `e-skyactiv-phev-${sizeNum}`
    if (ENGINE_DETAILS[key]) return ENGINE_DETAILS[key]
  }
  if (isX) {
    const key = `e-skyactiv-x-${sizeNum}`
    if (ENGINE_DETAILS[key]) return ENGINE_DETAILS[key]
  }
  if (isDiesel) {
    const key = `skyactiv-d-${sizeNum}`
    if (ENGINE_DETAILS[key]) return ENGINE_DETAILS[key]
  }
  if (isTurbo) {
    const key = `skyactiv-g-${sizeNum}t`
    if (ENGINE_DETAILS[key]) return ENGINE_DETAILS[key]
  }
  const key = `skyactiv-g-${sizeNum}`
  if (ENGINE_DETAILS[key]) return ENGINE_DETAILS[key]

  // Fallback: if engine size includes "turbo" try turbo variant
  if (size.includes('turbo')) {
    const tKey = `skyactiv-g-${sizeNum}t`
    if (ENGINE_DETAILS[tKey]) return ENGINE_DETAILS[tKey]
  }

  // Last resort: match by displacement alone (derive from size string)
  const ccFromSize = parseEngineSizeCc(size + 'l')
  if (ccFromSize) {
    return { displacement_cc: ccFromSize, cylinders: ccFromSize > 3000 ? 6 : 4 }
  }

  return null
}

/** Approximate CO2 from fuel consumption (petrol: ~23.2 g/L, diesel: ~26.2 g/L) */
function estimateCo2(fuelL100km, fuelType) {
  if (!fuelL100km) return null
  const factor = fuelType === 'Diesel' ? 26.2 : 23.2
  return Math.round(fuelL100km * factor / 10) * 10 // round to nearest 10
}

/** Parse gears from transmission description like "6-Speed Automatic" */
function parseGears(str) {
  if (!str) return null
  const m = str.match(/(\d+)\s*-?\s*speed/i)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Extract engine spec data from the Mazda model page HTML.
 * Returns an array of engine objects with spec fields.
 */
function extractEngineData(html) {
  const engines = []
  const seen = new Set()

  // Find all occurrences of "fuelConsumption" which mark engine-level data blocks
  const re = /"fuelConsumption":"([^"]*)"/g
  let m
  while ((m = re.exec(html)) !== null) {
    const idx = m.index
    // Extract surrounding data in a ~2000 char window
    const start = Math.max(0, idx - 1000)
    const end = Math.min(html.length, idx + 1000)
    const window = html.substring(start, end)

    const fuel = m[1]
    const power = (window.match(/"maximumPower":"([^"]+)"/) || [])[1] || null
    const torque = (window.match(/"maximumTorque":"([^"]+)"/) || [])[1] || null
    const engineSize = (window.match(/"engineSize":"([^"]+)"/) || [])[1] || null
    const engineName = (window.match(/"engineName":"([^"]+)"/) || [])[1] || null
    const transType = (window.match(/"transmissionType":"([^"]+)"/) || [])[1] || null
    const transDesc = (window.match(/"transmissionDescription":"([^"]+)"/) || [])[1] || null
    const drivetrain = (window.match(/"drivetrain":"([^"]+)"/) || [])[1] || null
    const fuelType = (window.match(/"fuelType":"([^"]+)"/) || [])[1] || null
    const tankCapacity = (window.match(/"fuelTankCapacity":"([^"]+)"/) || [])[1] || null
    const gradePrefix = (window.match(/"gradePrefix":"([^"]+)"/) || [])[1] || null

    // Deduplicate by gradePrefix + engineSize + drivetrain
    const dedupeKey = `${gradePrefix}|${engineSize}|${drivetrain}|${fuel}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    engines.push({
      fuelConsumption: fuel,
      maximumPower: power,
      maximumTorque: torque,
      engineSize,
      engineName,
      transmissionType: transType,
      transmissionDescription: transDesc,
      drivetrain,
      fuelType,
      fuelTankCapacity: tankCapacity,
      gradePrefix,
    })
  }

  return engines
}

/**
 * Map Mazda engine data to standardized specs_json.
 */
function buildSpecsJson(eng, modelSlug) {
  const modelDims = MODEL_DIMS[modelSlug]
  const fuelTypeStr = deriveFuelType(eng.fuelType, eng.engineName)
  const powerKw = parsePowerKw(eng.maximumPower)
  const torqueNm = parseTorqueNm(eng.maximumTorque)
  const fuelCombined = parseFuelConsumption(eng.fuelConsumption)
  const tankLitres = parseTankLitres(eng.fuelTankCapacity)
  const co2 = estimateCo2(fuelCombined, fuelTypeStr)
  const gears = parseGears(eng.transmissionDescription)

  // Get displacement and cylinders from known specs
  const engineDetails = findEngineDetails(eng.engineName, eng.engineSize)
  const displacementCc = engineDetails?.displacement_cc || parseEngineSizeCc(eng.engineSize)
  const cylinders = engineDetails?.cylinders || null

  const result = {}

  // Engine
  const engineObj = { type: fuelTypeStr }
  if (displacementCc) engineObj.displacement_cc = displacementCc
  if (cylinders) engineObj.cylinders = cylinders
  if (powerKw) engineObj.power_kw = powerKw
  if (torqueNm) engineObj.torque_nm = torqueNm
  result.engine = engineObj

  // Transmission
  const transObj = {}
  transObj.type = eng.transmissionType === 'Manual' ? 'Manual' : 'Automatic'
  if (gears) transObj.gears = gears
  if (eng.drivetrain) {
    transObj.drive = eng.drivetrain.toUpperCase() === 'AWD' ? 'AWD' :
                     eng.drivetrain.toUpperCase() === '4WD' ? '4WD' :
                     eng.drivetrain.toUpperCase() === 'RWD' ? 'RWD' : 'FWD'
  } else {
    // Default drive based on model: CX-60/70/80/90 are RWD-based, others FWD
    const rwdModels = ['cx-60', 'cx-70', 'cx-80', 'cx-90']
    const fourWDModels = ['bt-50']
    if (rwdModels.includes(modelSlug)) transObj.drive = 'RWD'
    else if (fourWDModels.includes(modelSlug)) transObj.drive = '4WD'
    else transObj.drive = 'FWD'
  }
  result.transmission = transObj

  // Dimensions
  if (modelDims) {
    const dims = {}
    if (modelDims.length_mm) dims.length_mm = modelDims.length_mm
    if (modelDims.width_mm) dims.width_mm = modelDims.width_mm
    if (modelDims.height_mm) dims.height_mm = modelDims.height_mm
    if (modelDims.wheelbase_mm) dims.wheelbase_mm = modelDims.wheelbase_mm
    if (modelDims.kerb_weight_kg) dims.kerb_weight_kg = modelDims.kerb_weight_kg
    if (Object.keys(dims).length) result.dimensions = dims
  }

  // Performance
  if (fuelCombined) {
    const perf = { fuel_combined_l100km: fuelCombined }
    if (co2) perf.co2_gkm = co2
    result.performance = perf
  }

  // Towing
  if (modelDims && (modelDims.towing_braked > 0 || modelDims.towing_unbraked > 0)) {
    result.towing = {}
    if (modelDims.towing_braked > 0) result.towing.braked_kg = modelDims.towing_braked
    if (modelDims.towing_unbraked > 0) result.towing.unbraked_kg = modelDims.towing_unbraked
  }

  // Capacity
  if (modelDims) {
    const cap = {}
    cap.doors = modelDims.doors || 5
    cap.seats = modelDims.seats || 5
    if (tankLitres) cap.fuel_tank_litres = tankLitres
    result.capacity = cap
  }

  // Safety
  if (modelDims) {
    result.safety = {
      ancap_stars: modelDims.ancap_stars || 5,
      airbags: modelDims.airbags || 6,
    }
  }

  // Wheels (not available in hydration data, skip)

  return result
}

/**
 * Match a product to an engine entry by grade prefix and drivetrain.
 * Product external_key pattern: "mazda-cx-5-maxx" or "mazda-cx-5-touring-active"
 * Product meta_json.grade: "Maxx", "Touring", etc.
 */
function matchProductToEngine(product, engines, modelSlug) {
  const grade = product.meta_json?.grade || product.variant_name || ''
  const gradeLower = grade.toLowerCase()

  // Build a mapping of gradePrefix → engine info
  // Grade prefixes: G20 (2.0L base), G25 (2.5L), G35 (2.5T), etc.
  // Mazda naming convention: Maxx=G20, Maxx Sport=G25, Touring=G25, GT=G25, Akari=G25
  //   SP25=G25, Touring Active=G25/AWD, GT SP25T=G35

  if (engines.length === 0) return null
  if (engines.length === 1) return engines[0]

  // Try to match by looking for grade-specific keywords
  const isAWD = gradeLower.includes('awd') || gradeLower.includes('all-wheel')
  const isTurbo = gradeLower.includes('turbo') || gradeLower.includes('sp25t') || gradeLower.includes('g35')

  // For models with just one engine option per grade
  // Maxx → base engine (lowest power), GT/Azami → could be higher
  // For CX-5: Maxx=G20(2.0L FWD), others=G25(2.5L) or G35(2.5T)
  // For CX-60/70/80/90: mixed diesel/PHEV/petrol

  // Strategy: find the engine that best matches the product
  let bestMatch = null
  let bestScore = -1

  for (const eng of engines) {
    let score = 0
    const prefix = (eng.gradePrefix || '').toLowerCase()

    // Turbo matching
    if (isTurbo && eng.engineSize?.toLowerCase().includes('turbo')) score += 10
    if (!isTurbo && !eng.engineSize?.toLowerCase().includes('turbo')) score += 2

    // AWD matching
    if (isAWD && eng.drivetrain?.toUpperCase() === 'AWD') score += 10
    if (!isAWD && eng.drivetrain?.toUpperCase() === 'FWD') score += 2

    // Grade prefix matching
    // Lower grades (Maxx, Pure) → base engine; Higher grades → premium engine
    const baseGrades = ['maxx', 'pure', 'evolve']
    const isBaseGrade = baseGrades.some(g => gradeLower.includes(g))
    const isBaseEngine = prefix.endsWith('20') || prefix.startsWith('g20') || prefix.startsWith('d20')
    const isPremEngine = prefix.endsWith('35') || prefix.endsWith('50') || prefix.includes('turbo')

    if (isBaseGrade && isBaseEngine) score += 5
    if (!isBaseGrade && !isBaseEngine) score += 3

    // Diesel matching for diesel grades
    if (gradeLower.includes('diesel') && eng.fuelType?.toLowerCase() === 'diesel') score += 15
    if (!gradeLower.includes('diesel') && eng.fuelType?.toLowerCase() !== 'diesel') score += 2

    // PHEV matching
    if (gradeLower.includes('phev') && (eng.engineName || '').toLowerCase().includes('phev')) score += 15

    if (score > bestScore) {
      bestScore = score
      bestMatch = eng
    }
  }

  return bestMatch
}

/* ── Main ─────────────────────────────────────────── */

console.log('=== Mazda Australia Spec Seed ===\n')

// Step 1: Load all Mazda products
const { data: products, error: prodErr } = await supabase
  .from('products')
  .select('id, external_key, title, variant_name, variant_code, model_id, meta_json')
  .eq('oem_id', OEM_ID)

if (prodErr) {
  console.error('Error loading products:', prodErr.message)
  process.exit(1)
}
console.log(`Loaded ${products.length} Mazda products`)

// Load model map
const { data: models } = await supabase
  .from('vehicle_models')
  .select('id, slug, name')
  .eq('oem_id', OEM_ID)

const modelMap = new Map(models.map(m => [m.id, m]))
const modelBySlug = new Map(models.map(m => [m.slug, m]))
console.log(`Loaded ${models.length} Mazda models: ${models.map(m => m.slug).join(', ')}`)

// Step 2: Fetch engine data from each model page
const modelEngineData = new Map() // modelSlug → engine[]

for (const modelInfo of MODELS) {
  const url = `https://www.mazda.com.au/cars/${modelInfo.urlSlug}/`
  try {
    console.log(`\nFetching ${url}...`)
    const html = await fetchPage(url)
    console.log(`  Page length: ${html.length}`)

    const engines = extractEngineData(html)
    console.log(`  Engines found: ${engines.length}`)

    if (engines.length > 0) {
      modelEngineData.set(modelInfo.dbSlug, engines)
      for (const eng of engines) {
        console.log(`    ${eng.gradePrefix || '?'}: ${eng.engineSize || '?'} ${eng.fuelType || '?'} ${eng.drivetrain || '?'} - ${eng.fuelConsumption || '?'} - ${eng.maximumPower || '?'}/${eng.maximumTorque || '?'}`)
      }
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`)
  }

  await sleep(500)
}

// Step 3: Match products to engines and build specs
const updates = []
let matched = 0
let unmatched = 0

for (const product of products) {
  // Get model slug
  const model = product.model_id ? modelMap.get(product.model_id) : null
  const modelSlug = model?.slug || null

  if (!modelSlug) {
    unmatched++
    continue
  }

  const engines = modelEngineData.get(modelSlug) || []
  if (engines.length === 0) {
    unmatched++
    continue
  }

  // Match product to best engine
  const eng = matchProductToEngine(product, engines, modelSlug)
  if (!eng) {
    unmatched++
    continue
  }

  // Build specs
  const specsJson = buildSpecsJson(eng, modelSlug)

  // Extract scalar fields
  const engineSize = specsJson.engine?.displacement_cc
    ? `${(specsJson.engine.displacement_cc / 1000).toFixed(1)}L`
    : (eng.engineSize || null)
  const cylinders = specsJson.engine?.cylinders || null
  const transmission = specsJson.transmission?.type || null
  const gears = specsJson.transmission?.gears || null
  const drive = specsJson.transmission?.drive || null
  const doors = specsJson.capacity?.doors || 5
  const seats = specsJson.capacity?.seats || 5

  updates.push({
    id: product.id,
    specs_json: specsJson,
    engine_size: engineSize,
    cylinders,
    transmission,
    gears,
    drive,
    doors,
    seats,
  })
  matched++
}

console.log(`\nMatched: ${matched}, Unmatched: ${unmatched}`)

// Sample output
if (updates.length > 0) {
  console.log('\n=== Sample specs ===')
  for (const u of updates.slice(0, 5)) {
    const p = products.find(p => p.id === u.id)
    console.log(`  ${p.title}: ${u.engine_size || 'N/A'} ${u.cylinders || 'N/A'}cyl ${u.transmission} ${u.gears || 'N/A'}sp ${u.drive}`)
    console.log(`    Fuel: ${u.specs_json.performance?.fuel_combined_l100km || 'N/A'}L/100km`)
  }
}

// Step 4: Update products in Supabase
if (updates.length > 0) {
  console.log(`\n=== Updating ${updates.length} products ===`)

  let updated = 0
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

  console.log(`  Updated: ${updated}`)
}

// Summary
console.log('\n=== MAZDA SPEC SEED COMPLETE ===')
console.log(`  Products with specs: ${matched} / ${products.length}`)
const withEngine = updates.filter(u => u.specs_json.engine?.power_kw).length
const withDims = updates.filter(u => u.specs_json.dimensions).length
const withPerf = updates.filter(u => u.specs_json.performance).length
const withTowing = updates.filter(u => u.specs_json.towing).length
console.log(`  With engine power: ${withEngine}`)
console.log(`  With dimensions: ${withDims}`)
console.log(`  With fuel data: ${withPerf}`)
console.log(`  With towing: ${withTowing}`)

// Model coverage
const modelCoverage = {}
for (const u of updates) {
  const p = products.find(p => p.id === u.id)
  const ms = p.model_id ? modelMap.get(p.model_id)?.slug : 'unknown'
  if (!modelCoverage[ms]) modelCoverage[ms] = 0
  modelCoverage[ms]++
}
console.log('\n  Per model:')
for (const [slug, count] of Object.entries(modelCoverage).sort()) {
  console.log(`    ${slug.padEnd(15)} ${count} products`)
}
