#!/usr/bin/env node
/**
 * Enrich Mitsubishi Australia variant_colors with hero_image_url from AEM Assets API.
 *
 * The AEM DAM stores per-colour CGI renders at:
 *   /content/dam/mmal/vehicles/{model}/{MY}/{body-config}/{grade}/{drivetrain}/{fuel}/{trans}/{colour}/
 *     dnd-{model}-{my}-{body-config}-{grade}-{drivetrain}-{fuel}-{trans}-{colour}-3-4-front.png
 *
 * Strategy:
 *   1. Walk AEM Assets API to build an index of all grade paths → colour folders
 *   2. Query Supabase for all mitsubishi-au variant_colors (joined with products)
 *   3. Map each product to its AEM grade path using title/grade/body-type matching
 *   4. For each colour, find the matching AEM colour folder and extract the 3/4-front render
 *   5. Update variant_colors.hero_image_url in Supabase
 *
 * Run: cd dashboard/scripts && node enrich-mitsubishi-heroes.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const AEM_BASE = 'https://www.mitsubishi-motors.com.au/api/assets/mmal'
const DAM_BASE = 'https://www.mitsubishi-motors.com.au/content/dam/mmal'
const OEM_ID = 'mitsubishi-au'

// ─── AEM Siren+JSON helpers ───────────────────────────────────────
async function fetchSiren(path) {
  const url = `${AEM_BASE}/${path}.json`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status !== 200) return null
    return await res.json()
  } catch { return null }
}

function sirenEntities(siren) {
  if (!siren?.entities) return []
  return siren.entities.map(e => ({
    name: e.properties?.name || 'unknown',
    isFolder: (e.class || [])[0] === 'assets/folder',
    isAsset: (e.class || [])[0] === 'assets/asset',
  }))
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Models where grade sits directly under MY (no body-config level)
const FLAT_MODELS = new Set(['eclipse-cross', 'asx'])

// ─── Step 1: Build AEM grade index ───────────────────────────────
// Walk the AEM tree for each model+MY to discover all available grade paths
// and the colour folders at each leaf level.

/**
 * @typedef {Object} AemGradeEntry
 * @property {string} path - Full AEM path from vehicles/ onward (up to trans level)
 * @property {string} model - AEM model slug (e.g. "outlander")
 * @property {string} my - Model year slug (e.g. "25my")
 * @property {string} bodyConfig - Body configuration (e.g. "5-seats", "double-cab-pick-up")
 * @property {string} grade - Grade slug (e.g. "es", "gsr", "plug-in-hybrid-ev-aspire")
 * @property {string} drivetrain - Drivetrain (e.g. "awd", "2wd", "4wd")
 * @property {string} fuel - Fuel type (e.g. "unleaded", "diesel", "plug-in-hybrid-ev")
 * @property {string} trans - Transmission (e.g. "automatic")
 * @property {string[]} colours - Available colour folder names (slugified)
 */

async function buildAemIndex() {
  console.log('Building AEM Assets index...')

  /** @type {AemGradeEntry[]} */
  const index = []

  // Models and their current model years in the database
  // Include both 25my and 24my where products exist at those model years
  const modelDefs = [
    { aem: 'outlander',     mys: ['25my', '24my'] },
    { aem: 'triton',        mys: ['25my'] },
    { aem: 'pajero-sport',  mys: ['25my'] },
    { aem: 'eclipse-cross', mys: ['24my'] },
    { aem: 'asx',           mys: ['25my'] },
  ]

  for (const modelDef of modelDefs) {
    const isFlat = FLAT_MODELS.has(modelDef.aem)

    for (const my of modelDef.mys) {
      const myPath = `vehicles/${modelDef.aem}/${my}`
      const myData = await fetchSiren(myPath)
      if (!myData) continue

      if (isFlat) {
        // FLAT MODELS (Eclipse Cross, ASX):
        // Hierarchy: MY → grade → drivetrain → fuel → trans → {colour folders}
        // No body-config level between MY and grade.
        const grades = sirenEntities(myData).filter(e => e.isFolder)
        for (const g of grades) {
          if (['showroom', 'coming-soon', 'campaign', 'temp'].includes(g.name)) continue

          const gPath = `${myPath}/${g.name}`
          const gData = await fetchSiren(gPath)
          if (!gData) continue

          const drivetrains = sirenEntities(gData).filter(e => e.isFolder)
          for (const dt of drivetrains) {
            const dtPath = `${gPath}/${dt.name}`
            const dtData = await fetchSiren(dtPath)
            if (!dtData) continue

            const fuels = sirenEntities(dtData).filter(e => e.isFolder)
            for (const f of fuels) {
              const fPath = `${dtPath}/${f.name}`
              const fData = await fetchSiren(fPath)
              if (!fData) continue

              const transes = sirenEntities(fData).filter(e => e.isFolder)
              for (const t of transes) {
                const tPath = `${fPath}/${t.name}`
                const tData = await fetchSiren(tPath)
                if (!tData) continue

                const items = sirenEntities(tData)
                const colourFolders = items.filter(e => e.isFolder).map(e => e.name)

                index.push({
                  path: tPath,
                  model: modelDef.aem,
                  my,
                  bodyConfig: null,
                  grade: g.name,
                  drivetrain: dt.name,
                  fuel: f.name,
                  trans: t.name,
                  colours: colourFolders,
                })
              }
            }
          }
        }
      } else {
        // NESTED MODELS (Outlander, Triton, Pajero Sport):
        // Hierarchy: MY → bodyConfig → grade → drivetrain → fuel → trans → {colour folders}
        const bodyConfigs = sirenEntities(myData).filter(e => e.isFolder)
        for (const bc of bodyConfigs) {
          if (['showroom', 'double-range', 'coming-soon', 'campaign'].includes(bc.name)) continue

          const bcPath = `${myPath}/${bc.name}`
          const bcData = await fetchSiren(bcPath)
          if (!bcData) continue

          const grades = sirenEntities(bcData).filter(e => e.isFolder)
          for (const g of grades) {
            const gPath = `${bcPath}/${g.name}`
            const gData = await fetchSiren(gPath)
            if (!gData) continue

            const drivetrains = sirenEntities(gData).filter(e => e.isFolder)
            for (const dt of drivetrains) {
              const dtPath = `${gPath}/${dt.name}`
              const dtData = await fetchSiren(dtPath)
              if (!dtData) continue

              const fuels = sirenEntities(dtData).filter(e => e.isFolder)
              for (const f of fuels) {
                const fPath = `${dtPath}/${f.name}`
                const fData = await fetchSiren(fPath)
                if (!fData) continue

                const transes = sirenEntities(fData).filter(e => e.isFolder)
                for (const t of transes) {
                  const tPath = `${fPath}/${t.name}`
                  const tData = await fetchSiren(tPath)
                  if (!tData) continue

                  const items = sirenEntities(tData)
                  const colourFolders = items.filter(e => e.isFolder).map(e => e.name)

                  index.push({
                    path: tPath,
                    model: modelDef.aem,
                    my,
                    bodyConfig: bc.name,
                    grade: g.name,
                    drivetrain: dt.name,
                    fuel: f.name,
                    trans: t.name,
                    colours: colourFolders,
                  })
                }
              }
            }
          }
        }
      }
      console.log(`  ${modelDef.aem}/${my}: indexed ${index.filter(e => e.model === modelDef.aem && e.my === my).length} grade paths`)
    }
  }

  console.log(`  Total: ${index.length} AEM grade paths`)
  return index
}

// ─── Step 2: Map Magento products to AEM paths ──────────────────
// The mapping uses product title, grade name, body type, and fuel type
// to find the matching AEM grade path.

/**
 * Mapping rules from Magento product data to AEM path components:
 *
 * MODEL:
 *   Title starts with family name → AEM model slug
 *   "Outlander" → "outlander"
 *   "Eclipse Cross" → "eclipse-cross"
 *   "Pajero Sport" → "pajero-sport"
 *
 * GRADE:
 *   Magento grade (subtitle) → AEM grade slug
 *   "ES" → "es", "GSR" → "gsr", "GLS" → "gls"
 *   "GLX+" → "glx-plus"
 *   "GLX-R" → "glx-r"
 *   "ASPIRE" → "aspire" (but PHEV Aspire → "plug-in-hybrid-ev-aspire")
 *   "EXCEED TOURER" → "exceed-tourer" (but PHEV → "plug-in-hybrid-ev-exceed-tourer")
 *   "LS Black Edition" → "ls-black-edition"
 *   "GSR Special Edition" → "gsr-special-edition"
 *   "GSR plus Roll Top Accessory Pack" → "gsr-plus-roll-top-accessory-pack"
 *   "GSR plus Electric Roll Top Accessory Pack" → "gsr-plus-electric-roll-top-accessory-pack"
 *
 * BODY CONFIG:
 *   Outlander/Eclipse Cross/Pajero Sport:
 *     5-seats or 7-seats determined by SKU prefix or grade
 *   Triton:
 *     body_type "Pick Up" → "double-cab-pick-up" / "club-cab-pick-up"
 *     body_type "Cab Chassis" → "double-cab-cab-chassis" / "club-cab-cab-chassis" / "single-cab-cab-chassis"
 *     SKU encoding: MV3=single-cab, MV4=double-cab, MV5=club-cab, MV6=double-cab(2wd?)
 *
 * DRIVETRAIN:
 *   Outlander petrol: "awd" or "2wd" (from SKU — M=2wd, all others awd?)
 *   Outlander PHEV: always "awd"
 *   Triton: "4wd" or "2wd"
 *   Pajero Sport: "4wd"
 *   Eclipse Cross: "awd" or "2wd"
 *   ASX: "2wd"
 *
 * FUEL:
 *   "Petrol" → "unleaded"
 *   "Diesel" → "diesel"
 *   "PHEV" → "plug-in-hybrid-ev"
 *
 * TRANSMISSION: always "automatic" for all current models
 */

// SKU decode tables
// Triton SKU prefixes: MV{cab}{drivetrain/trans}
// MV3 = single cab, MV4 = double cab, MV5 = club cab, MV6 = double cab (2wd variants?)
const TRITON_CAB_MAP = {
  'MV3': { cabType: 'single-cab' },
  'MV4': { cabType: 'double-cab' },
  'MV5': { cabType: 'club-cab' },
  'MV6': { cabType: 'double-cab' },
}

// Triton SKU character after cab prefix encodes drivetrain+trans
// W=4wd manual?, S=4wd auto?, X=4wd auto, Z=4wd auto, V=4wd auto
// Actually from data: all Triton 25my are "4wd" except MV6 which is 2wd
const TRITON_DRIVE_MAP = {
  'MV3W': '4wd',
  'MV4W': '4wd',  // GLX pick up 4wd
  'MV4S': '4wd',  // GLX+ pick up
  'MV4X': '4wd',  // GLS
  'MV4V': '4wd',  // GLX-R
  'MV4Z': '4wd',  // GSR
  'MV5W': '4wd',  // club cab GLX
  'MV6W': '2wd',  // double cab GLX 2wd
}

// Outlander SKU prefixes
// ZM2 = Outlander petrol 2wd, ZM4 = Outlander petrol AWD
// ZM9 = Outlander PHEV (always AWD)
const OUTLANDER_DRIVE_MAP = {
  'ZM2': '2wd',
  'ZM4': 'awd',
  'ZM9': 'awd',
}

// Outlander seat config: determined by grade
// 5-seats: ES (2wd), PHEV ES, PHEV Aspire, Exceed, Exceed Tourer
// 7-seats: ES (awd), LS, LS Black Edition, Aspire, PHEV Exceed, PHEV Exceed Tourer, PHEV GSR
// Actually this needs to be checked against AEM data

// Eclipse Cross drive map
// YB9 = Eclipse Cross PHEV (always AWD)
// Without YB9 = petrol (check body_type)
const EC_DRIVE_MAP = {
  'YB9': 'awd',
}

function getAemModel(title) {
  if (title.startsWith('Outlander')) return 'outlander'
  if (title.startsWith('Triton')) return 'triton'
  if (title.startsWith('Pajero Sport')) return 'pajero-sport'
  if (title.startsWith('Eclipse Cross')) return 'eclipse-cross'
  if (title.startsWith('ASX')) return 'asx'
  return null
}

function getAemMy(sku) {
  const year = parseInt(sku.split('-')[1])
  if (!year) return null
  // AEM uses short MY format: 2025 → 25my, 2024 → 24my
  return `${String(year).slice(2)}my`
}

function getAemFuel(fuelType) {
  if (fuelType === 'PHEV') return 'plug-in-hybrid-ev'
  if (fuelType === 'Diesel') return 'diesel'
  return 'unleaded'
}

function getAemGrade(grade, fuelType) {
  // Pre-process special grade names before slugifying
  // "GLX+" → "GLX Plus" so slugify produces "glx-plus" instead of "glx"
  let preprocessed = grade
    .replace(/\bGLX\+/i, 'GLX Plus')

  const slugGrade = slugify(preprocessed)

  if (fuelType === 'PHEV') {
    return `plug-in-hybrid-ev-${slugGrade}`
  }
  return slugGrade
}

function getTritonBodyConfig(sku, bodyType) {
  const prefix = sku.substring(0, 3)
  const cabInfo = TRITON_CAB_MAP[prefix]
  if (!cabInfo) return null

  const bodySlug = bodyType === 'Pick Up' ? 'pick-up' : 'cab-chassis'
  return `${cabInfo.cabType}-${bodySlug}`
}

function getTritonDrivetrain(sku) {
  const prefix = sku.substring(0, 4)
  return TRITON_DRIVE_MAP[prefix] || '4wd'
}

function getOutlanderDrivetrain(sku) {
  const prefix = sku.substring(0, 3)
  return OUTLANDER_DRIVE_MAP[prefix] || 'awd'
}

function getOutlanderSeats(sku, grade, fuelType) {
  const drivetrain = getOutlanderDrivetrain(sku)

  // Petrol Outlander:
  // 2wd (ZM2) = always 5-seats in AEM
  // awd (ZM4) = 7-seats for LS, LS Black Edition, Aspire; 5-seats for ES, Exceed, Exceed Tourer
  if (fuelType !== 'PHEV') {
    if (drivetrain === '2wd') {
      // ZM2 = 2wd, check AEM: ES has both 5-seats/2wd and 7-seats/2wd
      // Actually from AEM data: 5-seats has es/2wd and 7-seats has es/2wd too
      // We need to match based on what exists in AEM.
      // For ZM2M45 (ES 2wd): appears in both 5-seats and 7-seats
      // For ZM2M46 (ES 2wd): same SKU pattern but different...
      // Let's check: ZM2M45 vs ZM2M46 — last digits differ
      // Actually M45 and M46 likely encode seat count: 45=5-seat, 46=7-seat
      return null // will try both
    }
    // AWD petrol
    const normalizedGrade = slugify(grade)
    if (['ls', 'ls-black-edition', 'aspire'].includes(normalizedGrade)) return '7-seats'
    if (['exceed-tourer'].includes(normalizedGrade)) return '5-seats'
    if (['exceed'].includes(normalizedGrade)) return '5-seats'
    if (['es'].includes(normalizedGrade)) return '7-seats' // AWD ES is 7-seats
    return null // try both
  }

  // PHEV Outlander: always AWD
  const normalizedGrade = slugify(grade)
  if (['es', 'aspire'].includes(normalizedGrade)) return '5-seats'
  if (['exceed', 'exceed-tourer', 'gsr'].includes(normalizedGrade)) return '7-seats'
  return null
}

function getEcDrivetrain(sku, fuelType) {
  if (fuelType === 'PHEV') return 'awd'
  // Petrol Eclipse Cross: check sku
  // YB9 = PHEV
  if (sku.startsWith('YB9')) return 'awd'
  return '2wd'
}

function getPajeroSportSeats(grade) {
  const g = slugify(grade)
  if (g === 'glx') return '5-seats'
  return '7-seats' // GLS, GSR, Exceed are all 7-seats
}

/**
 * For a given product, produce candidate AEM grade paths to search.
 * Returns an array because some products may match multiple paths (e.g. different seat configs).
 */
function getCandidateAemPaths(product) {
  const { external_key: sku, title, subtitle: grade, body_type: bodyType, fuel_type: fuelType } = product
  const model = getAemModel(title)
  const my = getAemMy(sku)
  const fuel = getAemFuel(fuelType)
  const aemGrade = getAemGrade(grade, fuelType)

  if (!model || !my) return []

  const candidates = []

  if (model === 'outlander') {
    const drivetrain = getOutlanderDrivetrain(sku)
    const seats = getOutlanderSeats(sku, grade, fuelType)
    if (seats) {
      candidates.push({ model, my, bodyConfig: seats, grade: aemGrade, drivetrain, fuel, trans: 'automatic' })
    } else {
      // Try both seat configs
      candidates.push({ model, my, bodyConfig: '5-seats', grade: aemGrade, drivetrain, fuel, trans: 'automatic' })
      candidates.push({ model, my, bodyConfig: '7-seats', grade: aemGrade, drivetrain, fuel, trans: 'automatic' })
    }
  } else if (model === 'triton') {
    const bodyConfig = getTritonBodyConfig(sku, bodyType)
    const drivetrain = getTritonDrivetrain(sku)
    if (bodyConfig) {
      candidates.push({ model, my, bodyConfig, grade: aemGrade, drivetrain, fuel, trans: 'automatic' })
      // Fallback: if 2wd, also try 4wd (AEM may only have 4wd renders)
      if (drivetrain === '2wd') {
        candidates.push({ model, my, bodyConfig, grade: aemGrade, drivetrain: '4wd', fuel, trans: 'automatic' })
      }
      // Also try manual for single-cab GLX
      if (bodyConfig.startsWith('single-cab') && aemGrade === 'glx') {
        candidates.push({ model, my, bodyConfig, grade: aemGrade, drivetrain, fuel, trans: 'manual' })
      }
    }
  } else if (model === 'pajero-sport') {
    const seats = getPajeroSportSeats(grade)
    candidates.push({ model, my, bodyConfig: seats, grade: aemGrade, drivetrain: '4wd', fuel, trans: 'automatic' })
  } else if (model === 'eclipse-cross') {
    const drivetrain = getEcDrivetrain(sku, fuelType)
    candidates.push({ model, my, bodyConfig: null, grade: aemGrade, drivetrain, fuel, trans: 'automatic' })
  } else if (model === 'asx') {
    candidates.push({ model, my, bodyConfig: null, grade: aemGrade, drivetrain: '2wd', fuel, trans: 'automatic' })
  }

  return candidates
}

/**
 * Build the AEM path string from candidate components.
 */
function buildAemPath(c) {
  if (c.bodyConfig) {
    return `vehicles/${c.model}/${c.my}/${c.bodyConfig}/${c.grade}/${c.drivetrain}/${c.fuel}/${c.trans}`
  }
  // Eclipse Cross / ASX: grade is directly under MY (no body config)
  return `vehicles/${c.model}/${c.my}/${c.grade}/${c.drivetrain}/${c.fuel}/${c.trans}`
}

/**
 * Match a product's candidate paths against the AEM index.
 * Returns the first matching AemGradeEntry or null.
 * Also tries adjacent model years as fallback (e.g. 24my product → 25my AEM).
 */
function findAemEntry(product, aemIndex) {
  const candidates = getCandidateAemPaths(product)

  // First pass: exact MY match
  for (const c of candidates) {
    const expectedPath = buildAemPath(c)
    const entry = aemIndex.find(e => e.path === expectedPath)
    if (entry) return entry
  }

  // Second pass: try adjacent MY as fallback (24my ↔ 25my)
  const myFallback = { '24my': '25my', '25my': '24my' }
  for (const c of candidates) {
    const altMy = myFallback[c.my]
    if (!altMy) continue
    const altPath = buildAemPath({ ...c, my: altMy })
    const entry = aemIndex.find(e => e.path === altPath)
    if (entry) return entry
  }

  return null
}

// ─── Step 3: Resolve hero image URL for each colour ─────────────
// The AEM 3/4-front render follows the naming pattern:
//   dnd-{model}-{my}-{...path}-{colour}-3-4-front.png
// We check the colour folder for an asset matching "*3-4-front*"

async function findHeroImage(aemEntry, colourSlug) {
  // Check if this colour exists in the AEM entry
  if (!aemEntry.colours.includes(colourSlug)) return null

  const colourPath = `${aemEntry.path}/${colourSlug}`
  const data = await fetchSiren(colourPath)
  if (!data) return null

  const items = sirenEntities(data)
  // Find the 3/4-front render (prefer dnd-* naming, fall back to any 3-4-front)
  const frontAsset = items.find(e => e.isAsset && e.name.includes('3-4-front'))
    || items.find(e => e.isAsset && e.name.includes('front'))

  if (!frontAsset) return null

  return `${DAM_BASE}/${colourPath}/${frontAsset.name}`
}

// ─── Main execution ──────────────────────────────────────────────
async function main() {
  console.log('='.repeat(70))
  console.log('MITSUBISHI AUSTRALIA — HERO IMAGE ENRICHMENT')
  console.log('='.repeat(70))

  // 1. Build AEM index
  const aemIndex = await buildAemIndex()

  // 2. Query all mitsubishi-au variant_colors with product info
  console.log('\nQuerying variant_colors...')
  const { data: rows, error } = await supabase
    .from('variant_colors')
    .select('id, color_name, color_code, hero_image_url, product_id, products!inner(id, external_key, title, subtitle, body_type, fuel_type, meta_json)')
    .eq('products.oem_id', OEM_ID)

  if (error) {
    console.error('Supabase query error:', error.message)
    process.exit(1)
  }

  console.log(`  ${rows.length} variant_colors to process`)
  const needsUpdate = rows.filter(r => !r.hero_image_url)
  console.log(`  ${needsUpdate.length} without hero_image_url`)

  // 3. Match products to AEM entries
  console.log('\nMatching products to AEM paths...')
  const productMap = new Map()
  let matched = 0
  let unmatched = 0

  for (const row of rows) {
    const product = row.products
    const sku = product.external_key

    if (!productMap.has(sku)) {
      const aemEntry = findAemEntry(product, aemIndex)
      productMap.set(sku, aemEntry)
      if (aemEntry) {
        matched++
      } else {
        unmatched++
        console.log(`  MISS: ${sku} | ${product.title} (${product.subtitle})`)
      }
    }
  }
  console.log(`  Matched: ${matched}, Unmatched: ${unmatched}`)

  // 4. Resolve hero images and update
  console.log('\nResolving hero images from AEM...')
  const updates = []
  const misses = []
  let fetched = 0

  for (const row of needsUpdate) {
    const product = row.products
    const sku = product.external_key
    const aemEntry = productMap.get(sku)

    if (!aemEntry) {
      misses.push({ id: row.id, sku, colour: row.color_name, reason: 'no AEM path' })
      continue
    }

    const colourSlug = row.color_code // Already slugified in the DB
    const heroUrl = await findHeroImage(aemEntry, colourSlug)
    fetched++

    if (fetched % 20 === 0) {
      console.log(`  Progress: ${fetched}/${needsUpdate.length} colours checked...`)
    }

    if (heroUrl) {
      updates.push({ id: row.id, hero_image_url: heroUrl })
    } else {
      misses.push({ id: row.id, sku, colour: row.color_name, colourSlug, reason: 'no image in AEM folder' })
    }
  }

  console.log(`\n  Found: ${updates.length} hero images`)
  console.log(`  Missed: ${misses.length} colours`)

  // 5. Batch update Supabase
  if (updates.length > 0) {
    console.log(`\nUpdating ${updates.length} variant_colors in Supabase...`)
    let updated = 0

    for (const u of updates) {
      const { error: updateErr } = await supabase
        .from('variant_colors')
        .update({ hero_image_url: u.hero_image_url })
        .eq('id', u.id)

      if (updateErr) {
        console.error(`  Update error for id=${u.id}:`, updateErr.message)
      } else {
        updated++
      }
    }
    console.log(`  Updated: ${updated}/${updates.length}`)
  }

  // 6. Summary
  console.log('\n' + '='.repeat(70))
  console.log('ENRICHMENT SUMMARY')
  console.log('='.repeat(70))
  console.log(`  Total variant_colors:  ${rows.length}`)
  console.log(`  Hero images found:     ${updates.length}`)
  console.log(`  Misses:                ${misses.length}`)
  console.log(`  Products matched:      ${matched}/${matched + unmatched}`)

  if (misses.length > 0) {
    console.log('\nMISSED COLOURS:')
    for (const m of misses) {
      console.log(`  ${m.sku} | ${m.colour} (${m.colourSlug || 'N/A'}) — ${m.reason}`)
    }
  }

  // Show sample URLs
  if (updates.length > 0) {
    console.log('\nSAMPLE HERO IMAGE URLs:')
    for (const u of updates.slice(0, 10)) {
      const row = rows.find(r => r.id === u.id)
      console.log(`  ${row.products.title} | ${row.color_name}`)
      console.log(`    ${u.hero_image_url}`)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
