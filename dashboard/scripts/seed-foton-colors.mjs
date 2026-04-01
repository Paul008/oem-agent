/**
 * Seed Foton AU variant_colors from the Tunland vehicle page.
 * Source: https://www.fotonaustralia.com.au/ute/tunland/
 *
 * Tunland: 8 exterior colors × 4 variants = up to 32 color rows.
 * Aumark S trucks: no color data on their pages.
 *
 * Color data is embedded as HTML data attributes on color dot elements:
 *   <div class="colours_wrapper__colourDots__dot"
 *        label="FLARE WHITE" image="/media/.../image.png"
 *        style="background-color:#ffffff">
 *
 * Variant identified from image URL filename (v7-c-4x2, v9-l-4x4, etc.).
 *
 * Run: cd dashboard/scripts && node seed-foton-colors.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'foton-au'
const BASE_URL = 'https://www.fotonaustralia.com.au'
const TUNLAND_URL = `${BASE_URL}/ute/tunland/`

// Map image URL substring → variant identifier (order matters: more specific first)
const VARIANT_MAP = {
  'v7-c-4x2': 'V7 C 4x2',
  'v7-4x2': 'V7 C 4x2',
  'v7-c-4x4': 'V7 C 4x4',
  'v7-4x4': 'V7 C 4x4',
  'v9-l-4x4': 'V9 L 4x4',
  'v9-s-4x4': 'V9 S 4x4',
}

function detectVariant(imageUrl) {
  const url = imageUrl.toLowerCase()
  for (const [pattern, variant] of Object.entries(VARIANT_MAP)) {
    if (url.includes(pattern)) return variant
  }
  return null
}

function matchProduct(products, variant) {
  // Products are "Tunland V7 C 4x2", "Tunland V9 L 4x4" etc.
  // Variant strings are "V7 C 4x2", "V9 L 4x4" etc.
  const v = variant.toLowerCase()
  return products.find(p => {
    const title = (p.title || '').toLowerCase()
    return title.includes(v)
  })
}

async function fetchColorDots() {
  console.log(`Fetching ${TUNLAND_URL}...`)
  const res = await fetch(TUNLAND_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status} from Foton`)
  const html = await res.text()
  console.log(`  Page size: ${(html.length / 1024).toFixed(0)} KB`)

  // Extract color dot elements — they have class "colours_wrapper__colourDots__dot"
  // with label, image, and style attributes
  const dotTagRegex = /<div\s[^>]*colours_wrapper__colourDots__dot[^>]*>/gi
  const tags = [...html.matchAll(dotTagRegex)]

  if (tags.length === 0) {
    console.error('  WARNING: No color dot elements found — page structure may have changed')
    return []
  }
  console.log(`  Found ${tags.length} color dot elements`)

  const entries = []
  for (const [tag] of tags) {
    const label = tag.match(/\blabel="([^"]*)"/)?.[1]
    const image = tag.match(/\bimage="([^"]*)"/)?.[1]
    const bgMatch = tag.match(/background-color:\s*([^;"]+)/)?.[1]

    if (!label || !image) continue

    const colorName = label.replace(/\*$/, '').trim()
    const isPremium = label.includes('*')
    const variant = detectVariant(image)

    entries.push({
      colorName,
      hex: bgMatch?.trim() || null,
      isPremium,
      priceDelta: isPremium ? 690 : 0,
      heroUrl: `${BASE_URL}${image}`,
      variant,
    })
  }

  return entries
}

async function seed() {
  const colorDots = await fetchColorDots()
  if (!colorDots.length) {
    console.error('No colors extracted — aborting')
    process.exit(1)
  }

  // Group by variant
  const byVariant = {}
  for (const dot of colorDots) {
    const v = dot.variant || 'unknown'
    if (!byVariant[v]) byVariant[v] = []
    byVariant[v].push(dot)
  }
  console.log(`\nVariants found: ${Object.keys(byVariant).join(', ')}`)
  for (const [v, dots] of Object.entries(byVariant)) {
    console.log(`  ${v}: ${dots.length} colors (${dots.map(d => d.colorName).join(', ')})`)
  }

  // Load existing Foton products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, external_key, title')
    .eq('oem_id', OEM_ID)
  if (prodErr) { console.error('Product fetch error:', prodErr.message); process.exit(1) }
  console.log(`\nFound ${products.length} existing Foton products:`)
  for (const p of products) {
    console.log(`  ${p.title} (${p.external_key})`)
  }

  if (!products.length) {
    console.error('\nNo Foton products in DB — run an import first')
    process.exit(1)
  }

  // Delete existing Foton variant_colors
  const productIds = products.map(p => p.id)
  const { error: delErr } = await supabase
    .from('variant_colors')
    .delete()
    .in('product_id', productIds)
  if (delErr) console.error('Delete error:', delErr.message)
  else console.log('\nDeleted old Foton variant_colors')

  // Build color rows — deduplicate by product + color name
  // Multiple drivetrain variants (V7 4x2/4x4, V9 L/S) map to same product,
  // so merge hero images into gallery_urls
  const colorMap = new Map() // key: `${productId}::${colorName}`
  let skipped = 0
  let matched = 0

  for (const dot of colorDots) {
    if (!dot.variant) { skipped++; continue }

    const product = matchProduct(products, dot.variant)
    if (!product) { skipped++; continue }
    matched++

    const key = `${product.id}::${dot.colorName}`
    if (colorMap.has(key)) {
      // Add this variant's hero image to gallery
      const existing = colorMap.get(key)
      if (dot.heroUrl && !existing.allHeroUrls.includes(dot.heroUrl)) {
        existing.allHeroUrls.push(dot.heroUrl)
      }
    } else {
      colorMap.set(key, {
        product_id: product.id,
        color_name: dot.colorName,
        color_code: dot.colorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        color_type: dot.isPremium ? 'premium' : 'solid',
        is_standard: !dot.isPremium,
        price_delta: dot.priceDelta,
        swatch_url: null,
        hero_image_url: dot.heroUrl,
        allHeroUrls: [dot.heroUrl],
        sort_order: byVariant[dot.variant]?.indexOf(dot) ?? 0,
      })
    }
  }

  // Finalize: move additional hero URLs into gallery_urls
  const colorRows = []
  for (const entry of colorMap.values()) {
    const { allHeroUrls, ...row } = entry
    row.gallery_urls = allHeroUrls.length > 1 ? allHeroUrls : null
    colorRows.push(row)
  }

  console.log(`\nInserting ${colorRows.length} variant_colors (matched ${matched}, skipped ${skipped})...`)

  // Insert in batches
  let inserted = 0
  for (let i = 0; i < colorRows.length; i += 500) {
    const batch = colorRows.slice(i, i + 500)
    const { data, error } = await supabase
      .from('variant_colors')
      .insert(batch)
      .select('id')
    if (error) {
      console.error(`Batch error:`, error.message)
      console.error('Sample row:', JSON.stringify(batch[0], null, 2))
    } else {
      inserted += data.length
    }
  }

  console.log(`\n=== FOTON COLORS SEED COMPLETE ===`)
  console.log(`  Inserted: ${inserted} color rows`)
  console.log(`  Variants matched: ${matched}`)
  console.log(`  Skipped: ${skipped}`)

  // Summary by color
  const byColor = {}
  for (const r of colorRows) {
    byColor[r.color_name] = (byColor[r.color_name] || 0) + 1
  }
  console.log('\nBy color:')
  for (const [name, count] of Object.entries(byColor)) {
    const row = colorRows.find(r => r.color_name === name)
    console.log(`  ${name.padEnd(20)} ${count} variants  ${row.is_standard ? '(standard)' : `(+$${row.price_delta})`}`)
  }
}

seed().catch(err => { console.error(err); process.exit(1) })
