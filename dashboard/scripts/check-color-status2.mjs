import { createClient } from '@supabase/supabase-js'
const s = createClient('https://nnihmdmsglkxpmilmjjc.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc')

// Paginate products
let allProducts = []
let page = 0
while (true) {
  const { data } = await s.from('products').select('id, oem_id').range(page * 1000, (page + 1) * 1000 - 1)
  if (!data || data.length === 0) break
  allProducts = allProducts.concat(data)
  if (data.length < 1000) break
  page++
}
const prodMap = Object.fromEntries(allProducts.map(p => [p.id, p.oem_id]))

// Paginate variant_colors
let colors = []
page = 0
while (true) {
  const { data } = await s.from('variant_colors').select('product_id, swatch_url, hero_image_url, gallery_urls').range(page * 1000, (page + 1) * 1000 - 1)
  if (!data || data.length === 0) break
  colors = colors.concat(data)
  if (data.length < 1000) break
  page++
}
const stats = {}
for (const c of colors) {
  const oem = prodMap[c.product_id] || 'unknown'
  if (!stats[oem]) stats[oem] = { total: 0, swatch: 0, hero: 0, gallery: 0 }
  stats[oem].total++
  if (c.swatch_url) stats[oem].swatch++
  if (c.hero_image_url) stats[oem].hero++
  if (c.gallery_urls && c.gallery_urls.length > 0) stats[oem].gallery++
}

console.log('variant_colors by OEM (after seeding):')
console.log('OEM'.padEnd(20), 'Total'.padStart(6), 'Swatch'.padStart(8), 'Hero'.padStart(8), 'Gallery'.padStart(8))
console.log('-'.repeat(52))
let totals = { total: 0, swatch: 0, hero: 0, gallery: 0 }
for (const [oem, st] of Object.entries(stats).sort((a, b) => b[1].total - a[1].total)) {
  console.log(oem.padEnd(20), String(st.total).padStart(6), String(st.swatch).padStart(8), String(st.hero).padStart(8), String(st.gallery).padStart(8))
  totals.total += st.total; totals.swatch += st.swatch; totals.hero += st.hero; totals.gallery += st.gallery
}
console.log('-'.repeat(52))
console.log('TOTAL'.padEnd(20), String(totals.total).padStart(6), String(totals.swatch).padStart(8), String(totals.hero).padStart(8), String(totals.gallery).padStart(8))
console.log(`\nSwatch coverage: ${(totals.swatch/totals.total*100).toFixed(1)}%`)
console.log(`Hero coverage:   ${(totals.hero/totals.total*100).toFixed(1)}%`)
console.log(`Gallery coverage: ${(totals.gallery/totals.total*100).toFixed(1)}%`)
