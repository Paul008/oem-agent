#!/usr/bin/env node
/**
 * Seed Hyundai Australia variant colors from CGI Configurator data.
 * Color data is embedded in data-src attributes as HTML-encoded JSON with:
 *   fscSubGroups[] → variants[] → fscs[] → baseColours[]
 * Each baseColour has: code, name, hex, exteriorImages[] (8 renders)
 *
 * Run: cd dashboard/scripts && node seed-hyundai-colors.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'hyundai-au'
const BASE = 'https://www.hyundai.com'

// All Hyundai AU model pages — slug matches vehicle_models.slug
const MODEL_PAGES = [
  { slug: 'venue',            url: '/au/en/cars/suvs/venue' },
  { slug: 'kona',             url: '/au/en/cars/suvs/kona' },
  { slug: 'kona-hybrid',      url: '/au/en/cars/suvs/kona/konahybrid' },
  { slug: 'kona-electric',    url: '/au/en/cars/eco/kona-electric' },
  { slug: 'tucson',           url: '/au/en/cars/suvs/tucson' },
  { slug: 'santa-fe',         url: '/au/en/cars/suvs/santa-fe' },
  { slug: 'santa-fe-hybrid',  url: '/au/en/cars/suvs/santa-fe-hybrid' },
  { slug: 'palisade',         url: '/au/en/cars/suvs/palisade' },
  { slug: 'i20-n',            url: '/au/en/cars/sports-cars/i20-n' },
  { slug: 'i30',              url: '/au/en/cars/small-cars/i30' },
  { slug: 'i30-sedan',        url: '/au/en/cars/small-cars/i30/sedan' },
  { slug: 'i30-n',            url: '/au/en/cars/sports-cars/i30-n' },
  { slug: 'ioniq-5',          url: '/au/en/cars/eco/ioniq5' },
  { slug: 'ioniq-5-n',        url: '/au/en/cars/eco/ioniq5n' },
  { slug: 'ioniq-6',          url: '/au/en/cars/eco/ioniq6' },
  { slug: 'ioniq-9',          url: '/au/en/cars/eco/ioniq9' },
  { slug: 'staria',           url: '/au/en/cars/people-movers-and-commercial/staria' },
  { slug: 'inster',           url: '/au/en/cars/eco/inster' },
]

/* ── Helpers ─────────────────────────────────────────── */

function decodeHtmlEntities(str) {
  return str
    .replace(/&#34;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
}

function extractCgiData(html) {
  const re = /data-src="([^"]+)"/g
  let m
  while ((m = re.exec(html)) !== null) {
    const decoded = decodeHtmlEntities(m[1])
    if (!decoded.startsWith('{')) continue
    try {
      const json = JSON.parse(decoded)
      if (json.fscSubGroups) return json
    } catch {}
  }
  return null
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function getImageByType(images, type) {
  const img = images?.find(i => i.imageName === type)
  return img ? BASE + img.path : null
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/* ── Main ─────────────────────────────────────────── */

console.log('=== Hyundai Australia Color Seed ===\n')

// Step 1: Load existing vehicle_models
const { data: dbModels } = await supabase
  .from('vehicle_models')
  .select('id, slug, name')
  .eq('oem_id', OEM_ID)
console.log(`Loaded ${dbModels.length} existing models: ${dbModels.map(m => m.slug).join(', ')}\n`)

const modelMap = Object.fromEntries(dbModels.map(m => [m.slug, m]))

// Step 2: Fetch each model page and extract CGI data
const allProducts = []
const allColors = []
let modelsProcessed = 0
let modelsWithData = 0

for (const mp of MODEL_PAGES) {
  const model = modelMap[mp.slug]
  if (!model) {
    console.log(`⚠️  ${mp.slug}: no matching vehicle_model in DB, skipping`)
    continue
  }

  const url = BASE + mp.url
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    })
    if (!res.ok) {
      console.log(`❌ ${mp.slug}: HTTP ${res.status}`)
      continue
    }
    const html = await res.text()
    const cgi = extractCgiData(html)

    if (!cgi) {
      console.log(`⚠️  ${mp.slug}: no CGI configurator data found`)
      continue
    }

    modelsProcessed++
    let modelColorCount = 0
    const modelGrades = []

    for (const sg of cgi.fscSubGroups) {
      for (const variant of (sg.variants || [])) {
        for (const fsc of (variant.fscs || [])) {
          if (!fsc.baseColours?.length) continue

          // Build product name from variant description
          const gradeName = variant.variantDescription || sg.subGroupName || cgi.modelName
          const productSlug = slugify(`${mp.slug}-${gradeName}`)
          const externalKey = `${OEM_ID}-${productSlug}`

          modelGrades.push(gradeName)
          allProducts.push({
            oem_id: OEM_ID,
            model_id: model.id,
            external_key: externalKey,
            title: `${model.name} ${gradeName}`,
            variant_name: gradeName,
            body_type: variant.bodyType || null,
            meta_json: {
              variant_id: variant.variantId,
              fsc_id: fsc.fscId,
              engine: variant.engineNTrans,
              is_electric: variant.isElectric || false,
              price_low: fsc.fscLowPrice,
              price_high: fsc.fscHighPrice,
            }
          })

          for (const colour of fsc.baseColours) {
            const front34 = getImageByType(colour.exteriorImages, 'front34ImageUrl')
            const front = getImageByType(colour.exteriorImages, 'frontImageUrl')
            const rear34 = getImageByType(colour.exteriorImages, 'rear34ImageUrl')
            const side = getImageByType(colour.exteriorImages, 'sideImageUrl')

            allColors.push({
              product_key: externalKey,
              color_name: colour.name,
              color_code: colour.code,
              hex_code: colour.hex || null,
              color_type: deriveColorType(colour.name),
              swatch_url: null, // CGI data doesn't include swatch
              hero_image_url: front34 || front,
              gallery_urls: [front, front34, rear34, side].filter(Boolean),
            })
            modelColorCount++
          }
        }
      }
    }

    if (modelColorCount > 0) {
      modelsWithData++
      const uniqueGrades = [...new Set(modelGrades)]
      console.log(`✅ ${mp.slug}: ${modelColorCount} colors across ${uniqueGrades.length} grades`)
      console.log(`   Grades: ${uniqueGrades.join(', ')}`)
    } else {
      console.log(`⚠️  ${mp.slug}: CGI data found but no baseColours`)
    }

  } catch (e) {
    console.log(`❌ ${mp.slug}: ${e.message}`)
  }

  await sleep(500) // rate limit
}

function deriveColorType(name) {
  const lower = (name || '').toLowerCase()
  if (lower.includes('pearl')) return 'pearl'
  if (lower.includes('metallic')) return 'metallic'
  if (lower.includes('mica')) return 'mica'
  if (lower.includes('matte')) return 'matte'
  return 'solid'
}

console.log(`\nModels processed: ${modelsProcessed}, with color data: ${modelsWithData}`)
console.log(`Products to insert: ${allProducts.length}`)
console.log(`Colors to insert: ${allColors.length}`)

if (allProducts.length === 0) {
  console.log('\nNo data to insert. Exiting.')
  process.exit(0)
}

// Step 3: Delete old Hyundai products
console.log('\n=== Step 3: Clean existing Hyundai products ===')
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
  console.log('  No existing products to clean')
}

// Step 4: Insert products
console.log('\n=== Step 4: Insert products ===')

// Deduplicate products by external_key (same grade may appear across subgroups)
const productsByKey = new Map()
for (const p of allProducts) {
  if (!productsByKey.has(p.external_key)) {
    productsByKey.set(p.external_key, p)
  }
}
const uniqueProducts = [...productsByKey.values()]

const { data: insertedProducts, error: prodErr } = await supabase
  .from('products')
  .insert(uniqueProducts)
  .select('id, external_key')

if (prodErr) {
  console.error('Product insert error:', prodErr)
  process.exit(1)
}
console.log(`  Inserted ${insertedProducts.length} products`)

const productIdMap = Object.fromEntries(insertedProducts.map(p => [p.external_key, p.id]))

// Step 5: Insert variant_colors
console.log('\n=== Step 5: Insert variant_colors ===')

const colorRows = []
const seenKeys = new Set()

for (const c of allColors) {
  const productId = productIdMap[c.product_key]
  if (!productId) continue

  // Deduplicate: same product + same color code
  const dedupeKey = `${productId}:${c.color_code}`
  if (seenKeys.has(dedupeKey)) continue
  seenKeys.add(dedupeKey)

  colorRows.push({
    product_id: productId,
    color_name: c.color_name,
    color_code: c.color_code,
    color_type: c.color_type,
    is_standard: true,
    swatch_url: c.swatch_url,
    hero_image_url: c.hero_image_url,
    gallery_urls: c.gallery_urls,
    price_delta: 0, // No price data in CGI
  })
}

// Insert in batches of 200
for (let i = 0; i < colorRows.length; i += 200) {
  const batch = colorRows.slice(i, i + 200)
  const { error } = await supabase.from('variant_colors').insert(batch)
  if (error) {
    console.error(`  Batch ${i / 200 + 1} error:`, error)
  }
}
console.log(`  Inserted ${colorRows.length} variant_colors`)

// Summary
console.log('\n=== HYUNDAI COLOR SEED COMPLETE ===')
console.log(`  Models with data: ${modelsWithData}`)
console.log(`  Products created: ${insertedProducts.length}`)
console.log(`  Colors inserted:  ${colorRows.length}`)
console.log(`  With hero_image:  ${colorRows.filter(c => c.hero_image_url).length}`)
console.log(`  With gallery:     ${colorRows.filter(c => c.gallery_urls?.length).length}`)

const uniqueColors = [...new Set(colorRows.map(c => c.color_name))]
console.log(`\n  Unique colors (${uniqueColors.length}):`)
for (const name of uniqueColors.sort()) {
  const count = colorRows.filter(c => c.color_name === name).length
  const hex = colorRows.find(c => c.color_name === name)?.hex_code || ''
  console.log(`    ${name.padEnd(30)} ${hex.padEnd(10)} ${count} variants`)
}
