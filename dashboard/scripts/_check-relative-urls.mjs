import { createClient } from '@supabase/supabase-js'
const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

let from = 0
const oemRelative = {}
while (true) {
  const { data } = await sb
    .from('variant_colors')
    .select('hero_image_url, swatch_url, products!inner(oem_id)')
    .range(from, from + 999)
  if (!data || data.length === 0) break
  for (const c of data) {
    const oem = c.products.oem_id
    const heroRel = c.hero_image_url && !c.hero_image_url.startsWith('http')
    const swatchRel = c.swatch_url && !c.swatch_url.startsWith('http')
    if (heroRel || swatchRel) {
      if (!oemRelative[oem]) oemRelative[oem] = { count: 0, heroSample: null, swatchSample: null }
      oemRelative[oem].count++
      if (!oemRelative[oem].heroSample && heroRel) oemRelative[oem].heroSample = c.hero_image_url
      if (!oemRelative[oem].swatchSample && swatchRel) oemRelative[oem].swatchSample = c.swatch_url
    }
  }
  from += 1000
}
console.log(JSON.stringify(oemRelative, null, 2))
