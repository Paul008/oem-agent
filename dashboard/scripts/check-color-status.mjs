/**
 * Check variant_colors data status across OEMs.
 * Columns: color_code, color_name, color_type, is_standard, price_delta,
 *          swatch_url, hero_image_url, gallery_urls, sort_order
 * Run: node dashboard/scripts/check-color-status.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

// Fetch all variant_colors with OEM join
const { data: colors, error } = await supabase
  .from('variant_colors')
  .select(`
    id, color_code, color_name, color_type, is_standard, price_delta,
    swatch_url, hero_image_url, gallery_urls, sort_order,
    product:products!inner(
      id, external_key,
      model:vehicle_models!inner(id, name, oem_id)
    )
  `)

if (error) { console.error('Error:', error); process.exit(1) }

// === 1. Count by OEM ===
console.log('=== 1. variant_colors count by OEM ===\n')

const countByOem = {}
for (const c of colors) {
  const oem = c.product.model.oem_id
  countByOem[oem] = (countByOem[oem] || 0) + 1
}

const sorted = Object.entries(countByOem).sort((a, b) => b[1] - a[1])
console.log('OEM'.padEnd(20), 'Total'.padStart(8))
console.log('-'.repeat(28))
for (const [oem, count] of sorted) {
  console.log(oem.padEnd(20), String(count).padStart(8))
}
console.log('-'.repeat(28))
console.log('TOTAL'.padEnd(20), String(colors.length).padStart(8))

// === 2. Image URL status by OEM ===
console.log('\n=== 2. Image URL status by OEM ===\n')

// Track swatch_url and hero_image_url separately
const stats = {}
for (const c of colors) {
  const oem = c.product.model.oem_id
  if (!stats[oem]) stats[oem] = { swatch: 0, noSwatch: 0, hero: 0, noHero: 0, hasGallery: 0 }
  if (c.swatch_url) stats[oem].swatch++; else stats[oem].noSwatch++
  if (c.hero_image_url) stats[oem].hero++; else stats[oem].noHero++
  if (c.gallery_urls && c.gallery_urls.length > 0) stats[oem].hasGallery++
}

console.log(
  'OEM'.padEnd(18),
  'Swatch'.padStart(8), 'NoSwtch'.padStart(8),
  'Hero'.padStart(8), 'NoHero'.padStart(8),
  'Gallery'.padStart(8)
)
console.log('-'.repeat(58))
let totSwatch = 0, totNoSwatch = 0, totHero = 0, totNoHero = 0, totGallery = 0
for (const [oem] of sorted) {
  const s = stats[oem]
  totSwatch += s.swatch; totNoSwatch += s.noSwatch
  totHero += s.hero; totNoHero += s.noHero; totGallery += s.hasGallery
  console.log(
    oem.padEnd(18),
    String(s.swatch).padStart(8), String(s.noSwatch).padStart(8),
    String(s.hero).padStart(8), String(s.noHero).padStart(8),
    String(s.hasGallery).padStart(8)
  )
}
console.log('-'.repeat(58))
console.log(
  'TOTAL'.padEnd(18),
  String(totSwatch).padStart(8), String(totNoSwatch).padStart(8),
  String(totHero).padStart(8), String(totNoHero).padStart(8),
  String(totGallery).padStart(8)
)

// === 3. Sample rows with any image URL populated ===
console.log('\n=== 3. Sample rows with swatch_url populated ===\n')
const withSwatch = colors.filter(c => c.swatch_url)
for (const s of withSwatch.slice(0, 8)) {
  console.log({
    oem: s.product.model.oem_id,
    model: s.product.model.name,
    color_name: s.color_name,
    color_code: s.color_code,
    color_type: s.color_type,
    swatch_url: s.swatch_url,
  })
}

console.log('\n=== 4. Sample rows with hero_image_url populated ===\n')
const withHero = colors.filter(c => c.hero_image_url)
if (withHero.length === 0) {
  console.log('No rows with hero_image_url found.')
} else {
  for (const s of withHero.slice(0, 8)) {
    console.log({
      oem: s.product.model.oem_id,
      model: s.product.model.name,
      color_name: s.color_name,
      hero_image_url: s.hero_image_url,
    })
  }
}

console.log('\n=== 5. Sample rows with gallery_urls populated ===\n')
const withGallery = colors.filter(c => c.gallery_urls && c.gallery_urls.length > 0)
if (withGallery.length === 0) {
  console.log('No rows with gallery_urls found.')
} else {
  for (const s of withGallery.slice(0, 5)) {
    console.log({
      oem: s.product.model.oem_id,
      model: s.product.model.name,
      color_name: s.color_name,
      gallery_count: s.gallery_urls.length,
      gallery_urls: s.gallery_urls.slice(0, 3),
    })
  }
}
