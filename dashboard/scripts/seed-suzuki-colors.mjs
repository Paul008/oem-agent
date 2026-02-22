/**
 * Seed Suzuki AU variant_colors from the finance calculator JSON.
 * Source: https://www.suzuki.com.au/suzuki-finance-calculator-data.json
 *
 * Each variant has paintColour[] with: name, hex, twoToned, secondHex,
 * type (Solid/Premium Metallic/Two-Tone Metallic), extraCost per state,
 * image with responsive sizes (default 636x346, large-up 932x507).
 *
 * Run: cd dashboard/scripts && node seed-suzuki-colors.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const DATA_URL = 'https://www.suzuki.com.au/suzuki-finance-calculator-data.json'
const OEM_ID = 'suzuki-au'

async function seed() {
  console.log('Fetching Suzuki finance calculator data...')
  const res = await fetch(DATA_URL)
  const raw = await res.json()
  const models = raw.models
  console.log(`  Found ${models.length} models`)

  // Load existing Suzuki products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, external_key')
    .eq('oem_id', OEM_ID)
  if (prodErr) { console.error('Product fetch error:', prodErr.message); process.exit(1) }
  console.log(`  Found ${products.length} existing products`)

  const prodLookup = Object.fromEntries(products.map(p => [p.external_key, p.id]))

  // Delete existing Suzuki variant_colors
  const productIds = products.map(p => p.id)
  if (productIds.length) {
    const { error: delErr } = await supabase
      .from('variant_colors')
      .delete()
      .in('product_id', productIds)
    if (delErr) console.error('Delete error:', delErr.message)
    else console.log('  Deleted old Suzuki variant_colors')
  }

  // Build color rows
  const colorRows = []
  let skipped = 0

  for (const model of models) {
    for (const variant of model.modelVariants) {
      const colors = variant.paintColours || []
      if (!colors.length) continue

      // Determine transmissions for this variant (same logic as products seed)
      const nswPrices = variant.price?.NSW || variant.price?.ACT || {}
      const transmissions = Object.keys(nswPrices)

      for (const trans of transmissions) {
        const extKey = `suzuki-${variant.variantID}-${trans}`
        const productId = prodLookup[extKey]
        if (!productId) {
          skipped++
          continue
        }

        for (let i = 0; i < colors.length; i++) {
          const c = colors[i]

          // Use NSW extra cost as the primary price_delta
          const priceDelta = c.extraCost?.NSW || 0

          // Hero image from default size
          const heroUrl = c.image?.sizes?.default?.src || null
          // Large image for gallery
          const largeUrl = c.image?.sizes?.['large-up']?.src || null
          const galleryUrls = largeUrl ? [largeUrl] : []

          // Map Suzuki type to our color_type
          let colorType = null
          if (c.type === 'Solid') colorType = 'solid'
          else if (c.type === 'Premium Metallic') colorType = 'metallic'
          else if (c.type === 'Two-Tone Metallic') colorType = 'two-tone'
          else if (c.type) colorType = c.type.toLowerCase()

          colorRows.push({
            product_id: productId,
            color_name: c.name,
            color_code: c.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || null,
            color_type: colorType,
            is_standard: priceDelta === 0,
            price_delta: priceDelta,
            swatch_url: null,
            hero_image_url: heroUrl,
            gallery_urls: galleryUrls.length ? galleryUrls : null,
            sort_order: i,
          })
        }
      }
    }
  }

  console.log(`\nInserting ${colorRows.length} variant_colors (skipped ${skipped} unmatched products)...`)

  // Insert in batches of 500
  let inserted = 0
  for (let i = 0; i < colorRows.length; i += 500) {
    const batch = colorRows.slice(i, i + 500)
    const { data, error } = await supabase
      .from('variant_colors')
      .insert(batch)
      .select('id')
    if (error) {
      console.error(`Batch ${i / 500 + 1} error:`, error.message)
      // Log first failing row for debugging
      console.error('Sample row:', JSON.stringify(batch[0], null, 2))
    } else {
      inserted += data.length
    }
  }

  console.log(`  Inserted ${inserted} variant_colors`)

  // Summary by model
  console.log('\n=== SUZUKI COLORS SEED COMPLETE ===')
  const byModel = {}
  for (const model of models) {
    let count = 0
    for (const variant of model.modelVariants) {
      const colors = variant.paintColours || []
      const transmissions = Object.keys(variant.price?.NSW || variant.price?.ACT || {})
      count += colors.length * transmissions.length
    }
    byModel[model.model] = count
  }

  for (const [name, count] of Object.entries(byModel)) {
    console.log(`  ${name.padEnd(20)} ${count} color rows`)
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${inserted} inserted`)

  // Show color type breakdown
  const types = {}
  for (const r of colorRows) {
    types[r.color_type || 'unknown'] = (types[r.color_type || 'unknown'] || 0) + 1
  }
  console.log('\nBy type:')
  for (const [t, c] of Object.entries(types)) {
    console.log(`  ${t.padEnd(20)} ${c}`)
  }

  // Show price delta range
  const deltas = colorRows.filter(r => r.price_delta > 0).map(r => r.price_delta)
  if (deltas.length) {
    console.log(`\nPremium colors: ${deltas.length} rows, $${Math.min(...deltas)}–$${Math.max(...deltas)}`)
  }
}

seed().catch(err => { console.error(err); process.exit(1) })
