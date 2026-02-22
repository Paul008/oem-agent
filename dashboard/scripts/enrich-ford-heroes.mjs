/**
 * Enrich Ford AU variant_colors with swatch + hero images from AEM colorizer.
 *
 * Ford AEM model pages embed colorizer JSON with:
 *   Swatch: /content/dam/Ford/au/nameplate/{model}/model/{grade}/colorizer-1/colorizer/colorized360buttons/{color-slug}/btn-{color-slug}.webp
 *   Hero:   /content/dam/Ford/au/nameplate/{model}/model/{grade}/colorizer-1/colorizer/360/{color-slug}/au-{grade}-{color-slug}-01.webp
 *
 * Run: cd dashboard/scripts && node enrich-ford-heroes.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const FORD_BASE = 'https://www.ford.com.au'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,*/*',
}
const OEM_ID = 'ford-au'

// Ford model slug → pages to scrape (discovered from /vehicles.html)
const MODEL_PAGES = {
  'ranger':          [
    '/showroom/trucks-and-vans/ranger.html',
    '/showroom/trucks-and-vans/ranger/xl.html',
    '/showroom/trucks-and-vans/ranger/xls.html',
    '/showroom/trucks-and-vans/ranger/xlt.html',
    '/showroom/trucks-and-vans/ranger/sport.html',
    '/showroom/trucks-and-vans/ranger/wildtrak.html',
    '/showroom/trucks-and-vans/ranger/super-duty.html',
    '/showroom/electric/phev/ranger.html',
  ],
  'ranger-raptor':   ['/showroom/trucks-and-vans/ranger-raptor.html'],
  'everest':         [
    '/showroom/suv/everest.html',
    '/showroom/suv/everest/ambiente.html',
    '/showroom/suv/everest/trend.html',
    '/showroom/suv/everest/sport.html',
    '/showroom/suv/everest/titanium.html',
    '/showroom/suv/everest/platinum.html',
  ],
  'mustang':         [
    '/showroom/cars/mustang.html',
    '/showroom/cars/mustang/ecoboost.html',
    '/showroom/cars/mustang/gt.html',
    '/showroom/cars/mustang/gt-convertible.html',
  ],
  'mustang-mach-e':  ['/showroom/electric/mach-e.html'],
  'puma':            ['/showroom/suv/puma.html', '/showroom/suvs-and-cars/puma.html'],
  'f-150':           ['/showroom/trucks-and-vans/f-150.html'],
  'transit':         ['/showroom/trucks-and-vans/transit.html'],
  'transit-custom':  [
    '/showroom/trucks-and-vans/transit/custom.html',
    '/showroom/trucks-and-vans/transit/custom/electric.html',
    '/showroom/trucks-and-vans/transit/custom/phev-trend.html',
  ],
  'e-transit':       ['/showroom/trucks-and-vans/transit/electric.html'],
  'e-transit-custom':['/showroom/trucks-and-vans/transit/custom/electric.html'],
  'tourneo':         ['/showroom/suvs-and-cars/tourneo.html'],
  'tourneo-custom':  ['/showroom/suvs-and-cars/tourneo/custom.html', '/showroom/suvs-and-cars/tourneo-custom.html'],
}

async function safeFetch(url) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 30000)
  try {
    const r = await fetch(url, { signal: c.signal, headers: HEADERS })
    clearTimeout(t)
    return r
  } catch { clearTimeout(t); return null }
}

function extractColorizer(html, modelName) {
  const results = {} // color-slug → { swatch, hero }

  // Use path-safe chars only (no [^"] which spans HTML entities)
  // Swatch: .../colorized360buttons/{color-slug}/btn-{color-slug}.webp
  const swatchRe = /\/content\/dam\/Ford\/au\/nameplate\/[a-zA-Z0-9/_-]+\/colorized360buttons\/([a-z0-9-]+)\/btn-[a-z0-9-]+\.webp/gi
  let m
  while ((m = swatchRe.exec(html)) !== null) {
    const slug = m[1]
    if (!results[slug]) results[slug] = {}
    results[slug].swatch = FORD_BASE + m[0]
  }

  // Hero: .../colorizer*/360/{color-slug}/au-{grade}-{color-slug}-01.webp
  const heroRe = /\/content\/dam\/Ford\/au\/nameplate\/[a-zA-Z0-9/_-]+\/360\/([a-z0-9-]+)\/[a-z0-9-]+-01\.webp/gi
  while ((m = heroRe.exec(html)) !== null) {
    const slug = m[1]
    if (!results[slug]) results[slug] = {}
    if (!results[slug].hero) results[slug].hero = FORD_BASE + m[0]
  }

  return results
}

async function seed() {
  console.log('=== Ford AU Image Enrichment ===\n')

  // Load Ford products + variant_colors
  const { data: products } = await supabase
    .from('products').select('id, model_id, title, external_key').eq('oem_id', OEM_ID)
  console.log(`Found ${products.length} Ford products`)

  const { data: models } = await supabase
    .from('vehicle_models').select('id, slug, name').eq('oem_id', OEM_ID)
  const modelMap = Object.fromEntries(models.map(m => [m.id, m.slug]))

  // Load all variant_colors needing images
  const productIds = products.map(p => p.id)
  let allColors = []
  for (let i = 0; i < productIds.length; i += 100) {
    const batch = productIds.slice(i, i + 100)
    const { data } = await supabase
      .from('variant_colors')
      .select('id, product_id, color_code, color_name, swatch_url, hero_image_url')
      .in('product_id', batch)
    if (data) allColors = allColors.concat(data)
  }

  const needsImages = allColors.filter(c => !c.swatch_url || !c.hero_image_url)
  console.log(`Total Ford variant_colors: ${allColors.length}, needing images: ${needsImages.length}`)

  // Scrape colorizer data from each model's grade pages
  const allColorizer = {} // model-slug → { color-slug → { swatch, hero } }
  let totalColors = 0

  for (const [modelSlug, pages] of Object.entries(MODEL_PAGES)) {
    const modelColors = {}

    for (const pagePath of pages) {
      const url = FORD_BASE + pagePath
      const r = await safeFetch(url)
      if (!r || !r.ok) continue
      const html = await r.text()
      const colors = extractColorizer(html, modelSlug)
      for (const [slug, data] of Object.entries(colors)) {
        if (!modelColors[slug]) modelColors[slug] = {}
        if (data.swatch && !modelColors[slug].swatch) modelColors[slug].swatch = data.swatch
        if (data.hero && !modelColors[slug].hero) modelColors[slug].hero = data.hero
      }
    }

    allColorizer[modelSlug] = modelColors
    const count = Object.keys(modelColors).length
    totalColors += count
    if (count > 0) {
      console.log(`  ${modelSlug}: ${count} colors — ${Object.keys(modelColors).join(', ')}`)
    } else {
      console.log(`  ${modelSlug}: no colorizer data found`)
    }
  }

  console.log(`\nTotal colorizer colors found: ${totalColors}`)

  // Match and update
  let swatchUpdated = 0, heroUpdated = 0, noMatch = 0

  for (const vc of needsImages) {
    const product = products.find(p => p.id === vc.product_id)
    if (!product || !product.model_id) { noMatch++; continue }

    const modelSlug = modelMap[product.model_id]
    if (!modelSlug) { noMatch++; continue }

    const modelColors = allColorizer[modelSlug]
    if (!modelColors) { noMatch++; continue }

    // Match by color_code (already slugified)
    const colorData = modelColors[vc.color_code]
    if (!colorData) { noMatch++; continue }

    const updates = {}
    if (colorData.swatch && !vc.swatch_url) {
      updates.swatch_url = colorData.swatch
    }
    if (colorData.hero && !vc.hero_image_url) {
      updates.hero_image_url = colorData.hero
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('variant_colors')
        .update(updates)
        .eq('id', vc.id)
      if (!error) {
        if (updates.swatch_url) swatchUpdated++
        if (updates.hero_image_url) heroUpdated++
      } else {
        console.error(`  Update error for ${vc.id}:`, error.message)
      }
    }
  }

  console.log(`\n=== ENRICHMENT COMPLETE ===`)
  console.log(`  Swatch updated: ${swatchUpdated}`)
  console.log(`  Hero updated: ${heroUpdated}`)
  console.log(`  No match: ${noMatch}`)
  console.log(`  Already had images: ${allColors.length - needsImages.length}`)
}

seed().catch(err => { console.error(err); process.exit(1) })
