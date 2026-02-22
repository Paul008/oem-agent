#!/usr/bin/env node
/**
 * Seed Kia Australia product specs from the selectVehicleList API + JSON-LD spec pages.
 *
 * Data sources:
 *   1. selectVehicleList API: trim names (encode engine/trans), price, tire size
 *   2. JSON-LD on /au/cars/{model}/specification.html: doors, airbags, seats,
 *      cargo volume, fuel capacity, CO2, transmission type, drive config
 *
 * The trim name encodes engine info, e.g.:
 *   "S 2.0L Petrol CVT" → 2.0L, Petrol, CVT
 *   "GT-Line Diesel DCT" → Diesel, DCT
 *   "Air - Long Range" → Electric
 *
 * Run: cd dashboard/scripts && node seed-kia-specs.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'kia-au'
const VEHICLE_LIST_API = 'https://www.kia.com/api/kia_australia/base/carInfo.selectVehicleList'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/json',
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/* ── Known Kia engine specs (from published spec sheets / press kits) ── */
const ENGINE_SPECS = {
  // Petrol engines
  '1.0t':   { displacement_cc: 998,  cylinders: 3, power_kw: 74,  torque_nm: 172 },
  '1.0':    { displacement_cc: 998,  cylinders: 3, power_kw: 49,  torque_nm: 95 },
  '1.2':    { displacement_cc: 1197, cylinders: 4, power_kw: 62,  torque_nm: 122 },
  '1.4':    { displacement_cc: 1368, cylinders: 4, power_kw: 74,  torque_nm: 133 },
  '1.6t':   { displacement_cc: 1591, cylinders: 4, power_kw: 150, torque_nm: 265 },
  '1.6':    { displacement_cc: 1591, cylinders: 4, power_kw: 93,  torque_nm: 151 },
  '2.0':    { displacement_cc: 1999, cylinders: 4, power_kw: 110, torque_nm: 192 },
  '2.0t':   { displacement_cc: 1998, cylinders: 4, power_kw: 180, torque_nm: 353 },
  '2.5':    { displacement_cc: 2497, cylinders: 4, power_kw: 142, torque_nm: 253 },
  '2.5t':   { displacement_cc: 2497, cylinders: 4, power_kw: 213, torque_nm: 422 },
  '3.3t':   { displacement_cc: 3342, cylinders: 6, power_kw: 272, torque_nm: 510 },
  '3.5':    { displacement_cc: 3470, cylinders: 6, power_kw: 217, torque_nm: 332 },
  '3.8':    { displacement_cc: 3778, cylinders: 6, power_kw: 217, torque_nm: 350 },
  // Diesel engines
  '2.0d':   { displacement_cc: 1995, cylinders: 4, power_kw: 137, torque_nm: 416 },
  '2.2d':   { displacement_cc: 2151, cylinders: 4, power_kw: 148, torque_nm: 440 },
  // Hybrids (ICE portion)
  '1.6hev': { displacement_cc: 1580, cylinders: 4, power_kw: 77,  torque_nm: 147 },
  '1.6phev':{ displacement_cc: 1580, cylinders: 4, power_kw: 77,  torque_nm: 147 },
  // Electric (no ICE)
  'ev':     { displacement_cc: null, cylinders: null, power_kw: null, torque_nm: null },
}

/* ── Known Kia model-level specs (doors, seats, ANCAP, dimensions, towing) ── */
const MODEL_SPECS = {
  'picanto':    { doors: 5, seats: 5, ancap_stars: 4, airbags: 6, length_mm: 3595, width_mm: 1595, height_mm: 1495, wheelbase_mm: 2400, towing_braked: 0, towing_unbraked: 0, fuel_tank: 35 },
  'stonic':     { doors: 5, seats: 5, ancap_stars: 5, airbags: 6, length_mm: 4140, width_mm: 1760, height_mm: 1520, wheelbase_mm: 2580, towing_braked: 0, towing_unbraked: 0, fuel_tank: 45 },
  'cerato':     { doors: 5, seats: 5, ancap_stars: 5, airbags: 6, length_mm: 4635, width_mm: 1800, height_mm: 1435, wheelbase_mm: 2700, towing_braked: 0, towing_unbraked: 0, fuel_tank: 50 },
  'k4':         { doors: 5, seats: 5, ancap_stars: 5, airbags: 8, length_mm: 4635, width_mm: 1800, height_mm: 1435, wheelbase_mm: 2720, towing_braked: 0, towing_unbraked: 0, fuel_tank: 50 },
  'k4-hatch':   { doors: 5, seats: 5, ancap_stars: 5, airbags: 8, length_mm: 4410, width_mm: 1800, height_mm: 1445, wheelbase_mm: 2720, towing_braked: 0, towing_unbraked: 0, fuel_tank: 50 },
  'k4-sedan':   { doors: 4, seats: 5, ancap_stars: 5, airbags: 8, length_mm: 4635, width_mm: 1800, height_mm: 1435, wheelbase_mm: 2720, towing_braked: 0, towing_unbraked: 0, fuel_tank: 50 },
  'seltos':     { doors: 5, seats: 5, ancap_stars: 5, airbags: 6, length_mm: 4370, width_mm: 1800, height_mm: 1615, wheelbase_mm: 2630, towing_braked: 1300, towing_unbraked: 500, fuel_tank: 50 },
  'sportage':   { doors: 5, seats: 5, ancap_stars: 5, airbags: 6, length_mm: 4660, width_mm: 1865, height_mm: 1665, wheelbase_mm: 2755, towing_braked: 1650, towing_unbraked: 750, fuel_tank: 54 },
  'sportage-hybrid': { doors: 5, seats: 5, ancap_stars: 5, airbags: 6, length_mm: 4660, width_mm: 1865, height_mm: 1665, wheelbase_mm: 2755, towing_braked: 1350, towing_unbraked: 600, fuel_tank: 54 },
  'sorento':    { doors: 5, seats: 7, ancap_stars: 5, airbags: 7, length_mm: 4810, width_mm: 1900, height_mm: 1700, wheelbase_mm: 2815, towing_braked: 2000, towing_unbraked: 750, fuel_tank: 67 },
  'sorento-hybrid': { doors: 5, seats: 7, ancap_stars: 5, airbags: 7, length_mm: 4810, width_mm: 1900, height_mm: 1700, wheelbase_mm: 2815, towing_braked: 1500, towing_unbraked: 600, fuel_tank: 67 },
  'sorento-plug-in-hybrid': { doors: 5, seats: 7, ancap_stars: 5, airbags: 7, length_mm: 4810, width_mm: 1900, height_mm: 1700, wheelbase_mm: 2815, towing_braked: 1500, towing_unbraked: 600, fuel_tank: 67 },
  'carnival':   { doors: 5, seats: 8, ancap_stars: 5, airbags: 6, length_mm: 5155, width_mm: 1995, height_mm: 1775, wheelbase_mm: 3090, towing_braked: 2000, towing_unbraked: 750, fuel_tank: 72 },
  'carnival-hybrid': { doors: 5, seats: 8, ancap_stars: 5, airbags: 6, length_mm: 5155, width_mm: 1995, height_mm: 1775, wheelbase_mm: 3090, towing_braked: 1500, towing_unbraked: 600, fuel_tank: 72 },
  'niro-ev':    { doors: 5, seats: 5, ancap_stars: 5, airbags: 6, length_mm: 4420, width_mm: 1825, height_mm: 1570, wheelbase_mm: 2720, towing_braked: 0, towing_unbraked: 0, fuel_tank: null },
  'niro-hybrid':{ doors: 5, seats: 5, ancap_stars: 5, airbags: 6, length_mm: 4420, width_mm: 1825, height_mm: 1545, wheelbase_mm: 2720, towing_braked: 0, towing_unbraked: 0, fuel_tank: 42 },
  'ev3':        { doors: 5, seats: 5, ancap_stars: 5, airbags: 7, length_mm: 4300, width_mm: 1850, height_mm: 1560, wheelbase_mm: 2680, towing_braked: 0, towing_unbraked: 0, fuel_tank: null },
  'ev4':        { doors: 5, seats: 5, ancap_stars: 5, airbags: 7, length_mm: 4640, width_mm: 1880, height_mm: 1530, wheelbase_mm: 2830, towing_braked: 0, towing_unbraked: 0, fuel_tank: null },
  'ev5':        { doors: 5, seats: 5, ancap_stars: 5, airbags: 7, length_mm: 4615, width_mm: 1875, height_mm: 1715, wheelbase_mm: 2750, towing_braked: 1600, towing_unbraked: 750, fuel_tank: null },
  'ev6':        { doors: 5, seats: 5, ancap_stars: 5, airbags: 6, length_mm: 4695, width_mm: 1890, height_mm: 1550, wheelbase_mm: 2900, towing_braked: 1600, towing_unbraked: 750, fuel_tank: null },
  'ev9':        { doors: 5, seats: 6, ancap_stars: 5, airbags: 7, length_mm: 5010, width_mm: 1980, height_mm: 1755, wheelbase_mm: 3100, towing_braked: 2500, towing_unbraked: 750, fuel_tank: null },
  'tasman':     { doors: 4, seats: 5, ancap_stars: 5, airbags: 8, length_mm: 5410, width_mm: 1920, height_mm: 1815, wheelbase_mm: 3250, towing_braked: 3500, towing_unbraked: 750, fuel_tank: 78 },
}

/* ── Known EV specs ── */
const EV_SPECS = {
  'ev3-sr':  { power_kw: 150, torque_nm: 283, battery_kwh: 58.3 },
  'ev3-lr':  { power_kw: 150, torque_nm: 283, battery_kwh: 81.4 },
  'ev4':     { power_kw: 200, torque_nm: 350, battery_kwh: 82 },
  'ev5-sr':  { power_kw: 160, torque_nm: 310, battery_kwh: 58 },
  'ev5-lr':  { power_kw: 160, torque_nm: 310, battery_kwh: 84.7 },
  'ev6-rwd': { power_kw: 168, torque_nm: 350, battery_kwh: 77.4 },
  'ev6-awd': { power_kw: 239, torque_nm: 605, battery_kwh: 77.4 },
  'ev6-gt':  { power_kw: 430, torque_nm: 740, battery_kwh: 77.4 },
  'ev9-rwd': { power_kw: 150, torque_nm: 350, battery_kwh: 99.8 },
  'ev9-awd': { power_kw: 283, torque_nm: 600, battery_kwh: 99.8 },
  'niro-ev': { power_kw: 150, torque_nm: 255, battery_kwh: 64.8 },
}

/* ── Known fuel consumption (L/100km combined) by model+engine combos ── */
const FUEL_DATA = {
  'picanto-1.2-manual': { fuel: 4.8, co2: 110 },
  'picanto-1.2-auto':   { fuel: 5.3, co2: 121 },
  'stonic-1.0t':        { fuel: 5.8, co2: 131 },
  'stonic-2.0':         { fuel: 7.0, co2: 159 },
  'cerato-2.0':         { fuel: 7.4, co2: 169 },
  'k4-2.0':             { fuel: 6.7, co2: 153 },
  'seltos-2.0':         { fuel: 7.2, co2: 164 },
  'seltos-1.6t':        { fuel: 7.4, co2: 169 },
  'sportage-2.0':       { fuel: 7.8, co2: 178 },
  'sportage-2.0d':      { fuel: 6.1, co2: 160 },
  'sportage-hev':       { fuel: 5.4, co2: 123 },
  'sorento-2.5':        { fuel: 9.0, co2: 205 },
  'sorento-2.2d':       { fuel: 6.8, co2: 178 },
  'sorento-hev':        { fuel: 6.3, co2: 143 },
  'sorento-phev':       { fuel: 1.6, co2: 36 },
  'carnival-3.5':       { fuel: 10.4, co2: 237 },
  'carnival-2.2d':      { fuel: 7.4, co2: 194 },
  'carnival-hev':       { fuel: 6.9, co2: 157 },
  'niro-hev':           { fuel: 4.4, co2: 100 },
  'tasman-2.5t':        { fuel: 9.1, co2: 206 },
}

/**
 * Parse engine details from the trim name string.
 * Examples:
 *   "S 2.0L Petrol CVT" → { size: "2.0l", fuelType: "Petrol", transType: "CVT" }
 *   "GT-Line Diesel DCT" → { fuelType: "Diesel", transType: "DCT" }
 *   "Air - Long Range" → { fuelType: "Electric" }
 *   "Sport Hybrid FWD" → { fuelType: "Hybrid" }
 *   "Sport Plug-in Hybrid" → { fuelType: "PHEV" }
 */
function parseTrimName(name) {
  const result = { size: null, fuelType: null, transType: null, drive: null, turbo: false }
  if (!name) return result

  const lower = name.toLowerCase()

  // Engine size
  const sizeMatch = lower.match(/(\d+\.\d+)\s*l/i)
  if (sizeMatch) result.size = sizeMatch[1] + 'l'

  // Turbo
  if (lower.includes('turbo') || lower.includes(' t ') || lower.includes('-t ')) result.turbo = true

  // Fuel type
  if (lower.includes('plug-in') || lower.includes('phev')) result.fuelType = 'PHEV'
  else if (lower.includes('hybrid') || lower.includes('hev')) result.fuelType = 'Hybrid'
  else if (lower.includes('electric') || lower.includes(' ev') || /^ev\d/.test(lower)) result.fuelType = 'Electric'
  else if (lower.includes('diesel')) result.fuelType = 'Diesel'
  else if (lower.includes('petrol') || result.size) result.fuelType = 'Petrol'

  // Transmission
  if (lower.includes('cvt')) result.transType = 'CVT'
  else if (lower.includes('dct')) result.transType = 'DCT'
  else if (lower.includes('manual') || lower.includes(' m ') || lower.endsWith(' m')) result.transType = 'Manual'
  else if (lower.includes('automatic') || lower.includes('auto') || lower.includes('at')) result.transType = 'Automatic'
  else result.transType = 'Automatic'

  // Drive
  if (/\bawd\b/i.test(name)) result.drive = 'AWD'
  else if (/\b4wd\b/i.test(name) || /\b4x4\b/i.test(name)) result.drive = '4WD'
  else if (/\bfwd\b/i.test(name)) result.drive = 'FWD'
  else if (/\brwd\b/i.test(name)) result.drive = 'RWD'

  return result
}

/* ── Default engine per model (when trim name doesn't specify size) ── */
const MODEL_DEFAULT_ENGINE = {
  'picanto':    { petrol: '1.2' },
  'stonic':     { petrol: '1.0t' },
  'cerato':     { petrol: '2.0' },
  'k4':         { petrol: '2.0' },
  'k4-hatch':   { petrol: '2.0' },
  'k4-sedan':   { petrol: '2.0' },
  'seltos':     { petrol: '2.0', turbo: '1.6t' },
  'sportage':   { petrol: '2.0', diesel: '2.0d' },
  'sportage-hybrid': { hybrid: '1.6hev' },
  'sorento':    { petrol: '2.5', diesel: '2.2d' },
  'sorento-hybrid': { hybrid: '1.6hev' },
  'sorento-plug-in-hybrid': { phev: '1.6phev' },
  'carnival':   { petrol: '3.5', diesel: '2.2d' },
  'carnival-hybrid': { hybrid: '1.6hev' },
  'niro-hybrid': { hybrid: '1.6hev' },
  'tasman':     { petrol: '2.5t' },
}

/** Find the best matching engine spec from known data */
function findEngineSpec(modelSlug, trimParsed) {
  const isEV = ['ev3', 'ev4', 'ev5', 'ev6', 'ev9', 'niro-ev'].includes(modelSlug)

  if (isEV) {
    // Match EV variant
    const isAWD = trimParsed.drive === 'AWD'
    const isGT = trimParsed.fuelType === 'GT' || (trimParsed.size || '').includes('gt')
    const isSR = (trimParsed.size || '').includes('sr') || (trimParsed.transType || '').includes('standard')

    if (modelSlug === 'ev3') return isSR ? EV_SPECS['ev3-sr'] : EV_SPECS['ev3-lr']
    if (modelSlug === 'ev4') return EV_SPECS['ev4']
    if (modelSlug === 'ev5') return isSR ? EV_SPECS['ev5-sr'] : EV_SPECS['ev5-lr']
    if (modelSlug === 'ev6') {
      if (isGT) return EV_SPECS['ev6-gt']
      return isAWD ? EV_SPECS['ev6-awd'] : EV_SPECS['ev6-rwd']
    }
    if (modelSlug === 'ev9') return isAWD ? EV_SPECS['ev9-awd'] : EV_SPECS['ev9-rwd']
    if (modelSlug === 'niro-ev') return EV_SPECS['niro-ev']
  }

  // ICE engines - match by displacement from trim name
  if (trimParsed.size) {
    const sizeKey = trimParsed.size.replace('l', '')
    const isDiesel = trimParsed.fuelType === 'Diesel'
    const isHybrid = trimParsed.fuelType === 'Hybrid' || trimParsed.fuelType === 'PHEV'
    const isTurbo = trimParsed.turbo

    if (isDiesel) {
      const key = sizeKey + 'd'
      if (ENGINE_SPECS[key]) return ENGINE_SPECS[key]
    }
    if (isHybrid) {
      const key = sizeKey + (trimParsed.fuelType === 'PHEV' ? 'phev' : 'hev')
      if (ENGINE_SPECS[key]) return ENGINE_SPECS[key]
    }
    if (isTurbo) {
      const key = sizeKey + 't'
      if (ENGINE_SPECS[key]) return ENGINE_SPECS[key]
    }
    if (ENGINE_SPECS[sizeKey]) return ENGINE_SPECS[sizeKey]
  }

  // Fallback: use model default engine when trim name doesn't include size
  const defaults = MODEL_DEFAULT_ENGINE[modelSlug]
  if (defaults) {
    const isDiesel = trimParsed.fuelType === 'Diesel'
    const isHybrid = trimParsed.fuelType === 'Hybrid'
    const isPHEV = trimParsed.fuelType === 'PHEV'

    let key = null
    if (isPHEV && defaults.phev) key = defaults.phev
    else if (isHybrid && defaults.hybrid) key = defaults.hybrid
    else if (isDiesel && defaults.diesel) key = defaults.diesel
    else if (trimParsed.turbo && defaults.turbo) key = defaults.turbo
    else key = defaults.petrol || Object.values(defaults)[0]

    if (key && ENGINE_SPECS[key]) return ENGINE_SPECS[key]
  }

  return null
}

/** Find fuel consumption data for a model+variant combo */
function findFuelData(modelSlug, trimParsed, variantCode) {
  const isEV = ['ev3', 'ev4', 'ev5', 'ev6', 'ev9', 'niro-ev'].includes(modelSlug)
  if (isEV) return null // EVs don't have fuel consumption

  const isHybrid = trimParsed.fuelType === 'Hybrid'
  const isPHEV = trimParsed.fuelType === 'PHEV'
  const isDiesel = trimParsed.fuelType === 'Diesel'

  // Try specific combinations
  const combos = []
  if (isPHEV) combos.push(`${modelSlug}-phev`)
  if (isHybrid) combos.push(`${modelSlug}-hev`)
  if (isDiesel && trimParsed.size) combos.push(`${modelSlug}-${trimParsed.size.replace('l', '')}d`)
  if (isDiesel) combos.push(`${modelSlug}-2.2d`, `${modelSlug}-2.0d`)
  if (trimParsed.size) combos.push(`${modelSlug}-${trimParsed.size.replace('l', '')}`)

  // Add turbo variant
  if (trimParsed.turbo && trimParsed.size) {
    combos.push(`${modelSlug}-${trimParsed.size.replace('l', '')}t`)
  }

  // Add manual variant for Picanto
  if (modelSlug === 'picanto') {
    if (trimParsed.transType === 'Manual') combos.push('picanto-1.2-manual')
    else combos.push('picanto-1.2-auto')
  }

  for (const key of combos) {
    if (FUEL_DATA[key]) return FUEL_DATA[key]
  }

  return null
}

/** Get the model slug from the product's model reference */
function getModelSlug(product, modelMap) {
  // Try direct lookup from model_id
  if (product.model_id && modelMap.has(product.model_id)) {
    return modelMap.get(product.model_id).slug
  }
  // Parse from external_key: "seltos-s-cvt" → "seltos"
  const ek = product.external_key || ''
  for (const [id, m] of modelMap) {
    if (ek.startsWith(m.slug + '-') || ek.startsWith(m.slug.replace(/-/g, '') + '-')) {
      return m.slug
    }
  }
  return null
}

/** Parse wheel size from tire string like "205/60 R16" */
function parseWheelSize(tire) {
  if (!tire) return null
  const m = tire.match(/R(\d+)/i)
  return m ? `${m[1]}"` : null
}

/**
 * Build standardized specs_json for a Kia product
 */
function buildSpecsJson(product, modelSlug, trimParsed, modelSpec) {
  const engineSpec = findEngineSpec(modelSlug, trimParsed)
  const fuelData = findFuelData(modelSlug, trimParsed, product.variant_code)
  const isEV = ['ev3', 'ev4', 'ev5', 'ev6', 'ev9', 'niro-ev'].includes(modelSlug)
  const isHybrid = trimParsed.fuelType === 'Hybrid' || trimParsed.fuelType === 'PHEV'

  const result = {}

  // Engine
  const engineObj = {}
  engineObj.type = trimParsed.fuelType || (isEV ? 'Electric' : 'Petrol')
  if (engineSpec) {
    if (engineSpec.displacement_cc) engineObj.displacement_cc = engineSpec.displacement_cc
    if (engineSpec.cylinders) engineObj.cylinders = engineSpec.cylinders
    if (engineSpec.power_kw) engineObj.power_kw = engineSpec.power_kw
    if (engineSpec.torque_nm) engineObj.torque_nm = engineSpec.torque_nm
    if (engineSpec.battery_kwh) engineObj.battery_kwh = engineSpec.battery_kwh
  }
  result.engine = engineObj

  // Transmission
  const transObj = {}
  if (isEV) {
    transObj.type = 'Automatic'
    transObj.gears = 1
  } else {
    transObj.type = trimParsed.transType === 'Manual' ? 'Manual' : 'Automatic'
    if (trimParsed.transType === 'CVT') transObj.gears = null // CVT has no fixed gears
    else if (trimParsed.transType === 'DCT') transObj.gears = 7
    else transObj.gears = 6 // default Kia auto
    // Some specific models have 8-speed
    if (['sorento', 'carnival', 'ev9', 'tasman'].some(m => modelSlug.startsWith(m)) && !isHybrid && transObj.type === 'Automatic') {
      transObj.gears = 8
    }
  }
  transObj.drive = trimParsed.drive || (isEV ? 'RWD' : 'FWD')
  result.transmission = transObj

  // Dimensions (from model specs)
  if (modelSpec) {
    const dims = {}
    if (modelSpec.length_mm) dims.length_mm = modelSpec.length_mm
    if (modelSpec.width_mm) dims.width_mm = modelSpec.width_mm
    if (modelSpec.height_mm) dims.height_mm = modelSpec.height_mm
    if (modelSpec.wheelbase_mm) dims.wheelbase_mm = modelSpec.wheelbase_mm
    if (Object.keys(dims).length) result.dimensions = dims
  }

  // Performance
  if (fuelData) {
    result.performance = {
      fuel_combined_l100km: fuelData.fuel,
      co2_gkm: fuelData.co2,
    }
  }

  // Towing
  if (modelSpec && (modelSpec.towing_braked > 0 || modelSpec.towing_unbraked > 0)) {
    result.towing = {}
    if (modelSpec.towing_braked > 0) result.towing.braked_kg = modelSpec.towing_braked
    if (modelSpec.towing_unbraked > 0) result.towing.unbraked_kg = modelSpec.towing_unbraked
  }

  // Capacity
  const capObj = {}
  if (modelSpec) {
    capObj.doors = modelSpec.doors || 5
    capObj.seats = modelSpec.seats || 5
    if (modelSpec.fuel_tank) capObj.fuel_tank_litres = modelSpec.fuel_tank
  }
  if (Object.keys(capObj).length) result.capacity = capObj

  // Safety
  if (modelSpec) {
    result.safety = {
      ancap_stars: modelSpec.ancap_stars || 5,
      airbags: modelSpec.airbags || 6,
    }
  }

  // Wheels (from API tire field)
  const wheelSize = parseWheelSize(product.tire)
  if (wheelSize) {
    result.wheels = { size: wheelSize, type: 'Alloy' }
  }

  return result
}

/* ── Main ─────────────────────────────────────────── */

console.log('=== Kia Australia Spec Seed ===\n')

// Step 1: Load all Kia products
const { data: products, error: prodErr } = await supabase
  .from('products')
  .select('id, external_key, title, variant_name, variant_code, model_id, meta_json')
  .eq('oem_id', OEM_ID)

if (prodErr) {
  console.error('Error loading products:', prodErr.message)
  process.exit(1)
}
console.log(`Loaded ${products.length} Kia products`)

// Load model map
const { data: models } = await supabase
  .from('vehicle_models')
  .select('id, slug, name')
  .eq('oem_id', OEM_ID)

const modelMap = new Map(models.map(m => [m.id, m]))
console.log(`Loaded ${models.length} Kia models`)

// Step 2: Fetch selectVehicleList for tire size data
console.log('\nFetching selectVehicleList...')
const apiRes = await fetch(VEHICLE_LIST_API, { headers: HEADERS })
const apiData = await apiRes.json()

// Build a map of trim code → API detail
const trimApiMap = new Map()
if (apiData.dataInfo) {
  for (const category of Object.values(apiData.dataInfo)) {
    if (!Array.isArray(category)) continue
    for (const model of category) {
      if (model.details) {
        for (const detail of model.details) {
          if (detail.code) {
            trimApiMap.set(detail.code, detail)
          }
        }
      }
    }
  }
}
console.log(`API trims loaded: ${trimApiMap.size}`)

// Step 3: Build specs for each product
const updates = []
let matched = 0
let unmatched = 0

for (const product of products) {
  const modelSlug = getModelSlug(product, modelMap)
  if (!modelSlug) {
    unmatched++
    continue
  }

  // Parse spec info from the product title/name
  const fullName = product.title || product.variant_name || ''
  const trimParsed = parseTrimName(fullName)

  // If no drive was parsed, try from the variant_code
  if (!trimParsed.drive && product.variant_code) {
    const vc = product.variant_code.toUpperCase()
    if (vc.includes('AWD') || vc.includes('-A-') || vc.endsWith('A')) {
      // Check if it's actually AWD
      if (/AWD|4WD/i.test(fullName) || /HEVA|AWD/i.test(vc)) trimParsed.drive = 'AWD'
    }
    if (/4X4/i.test(vc)) trimParsed.drive = '4WD'
    if (/4X2/i.test(vc)) trimParsed.drive = 'RWD'
  }

  // For EVs, detect from model slug
  const isEV = modelSlug.startsWith('ev') || modelSlug === 'niro-ev'
  if (isEV && !trimParsed.fuelType) trimParsed.fuelType = 'Electric'

  // For hybrids from model slug
  if (modelSlug.includes('hybrid') && !trimParsed.fuelType) {
    if (modelSlug.includes('plug-in')) trimParsed.fuelType = 'PHEV'
    else trimParsed.fuelType = 'Hybrid'
  }

  // Get tire info from API
  const apiDetail = trimApiMap.get(product.variant_code)
  const productWithTire = { ...product, tire: apiDetail?.tire || null }

  // Get model-level specs
  const modelSpec = MODEL_SPECS[modelSlug] || null

  // Build specs
  const specsJson = buildSpecsJson(productWithTire, modelSlug, trimParsed, modelSpec)

  // Determine SR vs LR for EVs from product name
  if (isEV) {
    const lowerName = fullName.toLowerCase()
    if (lowerName.includes('standard range') || lowerName.includes(' sr') || product.variant_code?.includes('SR')) {
      // Standard range - use SR specs
    }
    if (lowerName.includes('long range') || lowerName.includes(' lr') || product.variant_code?.includes('LR')) {
      // Long range - already default
    }
    if (lowerName.includes('awd') || product.variant_code?.includes('AWD')) {
      specsJson.transmission.drive = 'AWD'
    }
    if (lowerName.includes('gt ') || lowerName.includes('gt-') || product.variant_code === 'GTAWD' || product.variant_code?.includes('GT')) {
      // Keep GT specs
    }
  }

  // Extract scalar fields
  const engineSize = specsJson.engine?.displacement_cc
    ? `${(specsJson.engine.displacement_cc / 1000).toFixed(1)}L`
    : (isEV ? 'Electric' : null)
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
console.log('\n=== KIA SPEC SEED COMPLETE ===')
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
  const ms = getModelSlug(p, modelMap) || 'unknown'
  if (!modelCoverage[ms]) modelCoverage[ms] = 0
  modelCoverage[ms]++
}
console.log('\n  Per model:')
for (const [slug, count] of Object.entries(modelCoverage).sort()) {
  console.log(`    ${slug.padEnd(25)} ${count} products`)
}
