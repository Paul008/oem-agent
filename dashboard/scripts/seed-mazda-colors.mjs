/**
 * Fetch and seed Mazda Australia color data from /cars/ pages.
 * Each model page contains a MiniConfigurator (or equivalent) with:
 *   nameplate > bodyStyle[] > grade[] > colors[]
 * Also creates products (one per bodyStyle + grade) and links to vehicle_models.
 *
 * Run: node dashboard/scripts/seed-mazda-colors.mjs
 */
import { createClient } from '@supabase/supabase-js'
import https from 'https'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'mazda-au'
const BASE_URL = 'https://www.mazda.com.au'

// Mazda model slugs (DB slug → /cars/ URL slug)
// DB models: bt-50, cx-3, cx-5, cx-60, cx-70, cx-80, cx-90, mazda2, mazda3, mx-5
// Additional models found on site: cx-30, cx-6e, mazda-6e
const MODELS = [
  { dbSlug: 'bt-50',   carsSlug: 'bt-50' },
  { dbSlug: 'cx-3',    carsSlug: 'cx-3' },
  { dbSlug: 'cx-5',    carsSlug: 'cx-5' },
  { dbSlug: 'cx-60',   carsSlug: 'cx-60' },
  { dbSlug: 'cx-70',   carsSlug: 'cx-70' },
  { dbSlug: 'cx-80',   carsSlug: 'cx-80' },
  { dbSlug: 'cx-90',   carsSlug: 'cx-90' },
  { dbSlug: 'mazda2',  carsSlug: 'mazda2' },
  { dbSlug: 'mazda3',  carsSlug: 'mazda3' },
  { dbSlug: 'mx-5',    carsSlug: 'mx-5' },
]

/* ── Helpers ─────────────────────────────────────────── */

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' } }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/**
 * Extract a bracket-delimited block (array or object) from HTML starting at startIdx.
 * startIdx must point to the opening bracket character.
 */
function extractBracketBlock(html, startIdx, openChar = '[', closeChar = ']') {
  let depth = 0
  let pos = startIdx
  while (pos < html.length) {
    if (html[pos] === openChar) depth++
    if (html[pos] === closeChar) {
      depth--
      if (depth === 0) return html.slice(startIdx, pos + 1)
    }
    pos++
  }
  return null
}

/**
 * Derive color_type from color name.
 */
function deriveColorType(name) {
  const lower = (name || '').toLowerCase()
  if (lower.includes('metallic')) return 'metallic'
  if (lower.includes('mica')) return 'mica'
  if (lower.includes('pearl')) return 'pearl'
  if (lower.includes('matte')) return 'matte'
  if (lower.includes('premium')) return 'premium'
  return 'solid'
}

/**
 * Prefix relative Mazda URLs with the base domain.
 */
function fullUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return BASE_URL + path
}

/* ── Page Parser ─────────────────────────────────────── */

/**
 * Parse grade/color data from a Mazda /cars/ page.
 * Returns array of { bodyStyle, gradeName, colors[] }
 *
 * The page has multiple nameplate repetitions (for different configurator views).
 * We only want the first occurrence of each bodyStyle + grade combination.
 */
function parseModelPage(html) {
  const results = []
  const seen = new Set()

  // Collect all bodyStyle positions for global nearest-preceding lookup
  const bodyStyleMatches = [...html.matchAll(/"type":"bodyStyle","name":"([^"]+)"/g)]
  const bodyStylePositions = bodyStyleMatches.map(m => ({ name: m[1], index: m.index }))

  // Find all "type":"grade" entries
  const gradePattern = /"type":"grade","name":"([^"]+)"/g
  let match

  while ((match = gradePattern.exec(html)) !== null) {
    const gradeName = match[1]
    const gradeIdx = match.index

    // Find nearest PRECEDING bodyStyle (globally, not windowed)
    let bodyStyle = 'Default'
    let bestDist = Infinity
    for (const bs of bodyStylePositions) {
      const dist = gradeIdx - bs.index
      if (dist > 0 && dist < bestDist) {
        bestDist = dist
        bodyStyle = bs.name
      }
    }

    // Deduplicate: only process first occurrence of each bodyStyle + grade
    const key = `${bodyStyle}||${gradeName}`
    if (seen.has(key)) continue
    seen.add(key)

    // Find the "colors":[ array after this grade
    const colorsIdx = html.indexOf('"colors":[', gradeIdx)
    if (colorsIdx < 0 || colorsIdx - gradeIdx > 200000) continue

    const arrStr = extractBracketBlock(html, colorsIdx + 9) // skip past "colors":
    if (!arrStr) continue

    try {
      const colors = JSON.parse(arrStr)
      results.push({
        bodyStyle,
        gradeName,
        colors: colors.filter(c => c.type === 'color').map(c => ({
          ref: c.ref,
          name: c.name,
          priceDifference: c.priceDifference || 0,
          hex: c.hex || [],
          imageSrc: c.imageSrc,
          icon: c.icon,
          isDefault: c.default || false,
        })),
      })
    } catch {
      console.warn(`  WARNING: Failed to parse colors for ${gradeName}`)
    }
  }

  return results
}

/* ── Main Seed ───────────────────────────────────────── */

async function seed() {
  console.log('=== Mazda Australia Color Seed ===\n')

  // 1. Load existing vehicle_models for mazda-au
  const { data: dbModels, error: modelsErr } = await supabase
    .from('vehicle_models')
    .select('id, slug, name')
    .eq('oem_id', OEM_ID)
  if (modelsErr) { console.error('Model fetch error:', modelsErr.message); process.exit(1) }

  const modelLookup = {}
  for (const m of dbModels) {
    modelLookup[m.slug] = m
  }
  console.log(`Loaded ${dbModels.length} existing models: ${dbModels.map(m => m.slug).join(', ')}`)

  // 2. Delete old Mazda products and related colors/pricing
  console.log('\nDeleting old Mazda products...')
  const { data: oldProducts } = await supabase
    .from('products')
    .select('id')
    .eq('oem_id', OEM_ID)
  if (oldProducts?.length) {
    const oldIds = oldProducts.map(p => p.id)
    // Delete in batches to avoid issues with large IN clauses
    for (let i = 0; i < oldIds.length; i += 50) {
      const batch = oldIds.slice(i, i + 50)
      await supabase.from('variant_colors').delete().in('product_id', batch)
      await supabase.from('variant_pricing').delete().in('product_id', batch)
    }
    await supabase.from('products').delete().eq('oem_id', OEM_ID)
    console.log(`  Deleted ${oldProducts.length} old products + related data`)
  } else {
    console.log('  No old products to delete')
  }

  // 3. Fetch each model page and parse grade/color data
  const allProducts = []   // { model, bodyStyle, gradeName, externalKey, colors[] }

  for (const model of MODELS) {
    const dbModel = modelLookup[model.dbSlug]
    if (!dbModel) {
      console.warn(`  SKIP: No DB model for slug "${model.dbSlug}"`)
      continue
    }

    const url = `${BASE_URL}/cars/${model.carsSlug}/`
    console.log(`\nFetching ${dbModel.name} (${url})...`)

    let html
    try {
      html = await fetchPage(url)
    } catch (err) {
      console.error(`  ERROR fetching ${url}: ${err.message}`)
      continue
    }

    const grades = parseModelPage(html)
    console.log(`  Found ${grades.length} body-style × grade combinations`)

    for (const g of grades) {
      const bodySlug = slugify(g.bodyStyle)
      const gradeSlug = slugify(g.gradeName)
      // External key pattern: mazda-{model}-{bodyStyle}-{grade}
      // If only one body style, omit it for cleaner keys
      const hasMultipleBodyStyles = new Set(grades.map(x => x.bodyStyle)).size > 1
      const externalKey = hasMultipleBodyStyles
        ? `mazda-${model.dbSlug}-${bodySlug}-${gradeSlug}`
        : `mazda-${model.dbSlug}-${gradeSlug}`

      allProducts.push({
        model: dbModel,
        carsSlug: model.carsSlug,
        bodyStyle: g.bodyStyle,
        gradeName: g.gradeName,
        externalKey,
        colors: g.colors,
        hasMultipleBodyStyles,
      })

      console.log(`    ${g.bodyStyle} > ${g.gradeName}: ${g.colors.length} colors`)
    }
  }

  if (allProducts.length === 0) {
    console.log('\nNo products to seed. Exiting.')
    return
  }

  // 4. Insert products
  const productRows = allProducts.map(p => ({
    oem_id: OEM_ID,
    external_key: p.externalKey,
    source_url: `${BASE_URL}/cars/${p.carsSlug}/`,
    title: `${p.model.name} ${p.gradeName}`,
    subtitle: p.hasMultipleBodyStyles ? p.bodyStyle : null,
    body_type: p.bodyStyle,
    availability: 'available',
    price_currency: 'AUD',
    variant_name: p.gradeName,
    variant_code: slugify(p.gradeName),
    model_id: p.model.id,
    meta_json: {
      source: 'mazda_cars_page',
      body_style: p.bodyStyle,
      grade: p.gradeName,
      color_count: p.colors.length,
    },
    last_seen_at: new Date().toISOString(),
  }))

  console.log(`\nInserting ${productRows.length} products...`)
  const { data: prodData, error: prodErr } = await supabase
    .from('products')
    .insert(productRows)
    .select('id, external_key, title')
  if (prodErr) { console.error('Product insert error:', prodErr.message); process.exit(1) }
  console.log(`  Inserted ${prodData.length} products`)

  // Build product lookup: external_key → id
  const prodLookup = {}
  for (const p of prodData) {
    prodLookup[p.external_key] = p.id
  }

  // 5. Insert variant_colors
  const colorRows = []
  for (const p of allProducts) {
    const productId = prodLookup[p.externalKey]
    if (!productId) continue

    for (let i = 0; i < p.colors.length; i++) {
      const c = p.colors[i]
      colorRows.push({
        product_id: productId,
        color_code: c.ref,
        color_name: c.name,
        color_type: deriveColorType(c.name),
        is_standard: c.priceDifference === 0,
        price_delta: c.priceDifference,
        swatch_url: fullUrl(c.icon),
        hero_image_url: fullUrl(c.imageSrc),
        gallery_urls: [],
        sort_order: i,
      })
    }
  }

  console.log(`\nInserting ${colorRows.length} variant colors...`)
  // Insert in batches (Supabase has row limits)
  let insertedColors = 0
  for (let i = 0; i < colorRows.length; i += 200) {
    const batch = colorRows.slice(i, i + 200)
    const { data: cData, error: cErr } = await supabase
      .from('variant_colors')
      .insert(batch)
      .select('id')
    if (cErr) {
      console.error(`  Batch ${i}-${i + batch.length} error:`, cErr.message)
    } else {
      insertedColors += cData.length
    }
  }
  console.log(`  Inserted ${insertedColors} color rows`)

  // 6. Summary
  console.log('\n=== MAZDA COLOR SEED COMPLETE ===')
  console.log(`  Models processed: ${MODELS.length}`)
  console.log(`  Products created: ${prodData.length}`)
  console.log(`  Colors inserted:  ${insertedColors}`)

  // Per-model breakdown
  console.log('\n  By model:')
  const modelGroups = new Map()
  for (const p of allProducts) {
    const key = p.model.name
    if (!modelGroups.has(key)) modelGroups.set(key, { products: 0, colors: 0, bodyStyles: new Set() })
    const g = modelGroups.get(key)
    g.products++
    g.colors += p.colors.length
    g.bodyStyles.add(p.bodyStyle)
  }
  for (const [name, stats] of modelGroups) {
    console.log(`    ${name}: ${stats.products} products, ${stats.colors} colors, body styles: ${[...stats.bodyStyles].join(', ')}`)
  }

  // Color palette summary (unique colors across all models)
  const uniqueColors = new Map()
  for (const p of allProducts) {
    for (const c of p.colors) {
      if (!uniqueColors.has(c.ref)) {
        uniqueColors.set(c.ref, { name: c.name, type: deriveColorType(c.name), models: new Set() })
      }
      uniqueColors.get(c.ref).models.add(p.model.name)
    }
  }
  console.log(`\n  Unique colors: ${uniqueColors.size}`)
  for (const [ref, info] of [...uniqueColors.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`    ${ref} ${info.name} (${info.type}) — ${info.models.size} models`)
  }
}

seed().catch(err => { console.error(err); process.exit(1) })
