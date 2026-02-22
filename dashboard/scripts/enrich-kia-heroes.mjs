/**
 * Enrich Kia AU variant_colors with hero images from 360VR CDN.
 *
 * The Kia KWCMS CDN hosts 360-degree spin renders at:
 *   /content/dam/kwcms/au/en/images/showroom/{folder}/{type}/{color-slug}/{filename}_00000.{ext}
 *
 * Strategy: For each model page, extract 360VR image references (frame _00000 = hero).
 * Then match color-slug to our existing variant_colors.color_code and update hero_image_url.
 *
 * Run: cd dashboard/scripts && node enrich-kia-heroes.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const KIA_BASE = 'https://www.kia.com'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*',
}

const OEM_ID = 'kia-au'

const MODELS = [
  'seltos', 'sportage', 'sorento', 'carnival',
  'ev6', 'ev9', 'cerato', 'picanto', 'stonic', 'rio',
  'k4', 'ev5', 'ev3'
]

async function safeFetch(url) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 15000)
  try {
    const r = await fetch(url, { signal: c.signal, headers: HEADERS })
    clearTimeout(t)
    return r
  } catch { clearTimeout(t); return null }
}

async function seed() {
  console.log('=== Kia AU Hero Image Enrichment ===\n')

  // Load Kia products and their variant_colors
  const { data: products } = await supabase
    .from('products')
    .select('id, model_id, title')
    .eq('oem_id', OEM_ID)
  console.log(`Found ${products.length} Kia products`)

  // Load vehicle models
  const { data: models } = await supabase
    .from('vehicle_models')
    .select('id, slug, name')
    .eq('oem_id', OEM_ID)

  // model_id → model slug
  const modelIdToSlug = {}
  for (const m of models) {
    modelIdToSlug[m.id] = m.slug
    // Also store base name like "seltos" from "seltos-2025"
    modelIdToSlug[m.id + '_base'] = m.slug.replace(/-\d{4}$/, '')
  }

  // Load variant_colors without hero images
  const productIds = products.map(p => p.id)
  let allColors = []
  for (let i = 0; i < productIds.length; i += 100) {
    const batch = productIds.slice(i, i + 100)
    const { data } = await supabase
      .from('variant_colors')
      .select('id, product_id, color_code, color_name, hero_image_url')
      .in('product_id', batch)
    if (data) allColors = allColors.concat(data)
  }

  const needsHero = allColors.filter(c => !c.hero_image_url)
  console.log(`Total Kia variant_colors: ${allColors.length}, needing hero: ${needsHero.length}`)

  // Build product_id → model base slug
  // Map DB model slugs to CDN model page names
  const slugToCdnModel = {
    'carnival-hybrid': 'carnival', 'carnival': 'carnival',
    'sorento-hybrid': 'sorento', 'sorento-plug-in-hybrid': 'sorento', 'sorento': 'sorento',
    'k4-hatch': 'k4', 'k4-sedan': 'k4',
    'niro-ev': 'niro', 'niro-hybrid': 'niro',
  }
  const productModelSlug = {}
  for (const p of products) {
    const baseSlug = p.model_id ? (modelIdToSlug[p.model_id + '_base'] || '') : ''
    productModelSlug[p.id] = slugToCdnModel[baseSlug] || baseSlug
  }

  function slugify(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  // Scrape hero images from each model page
  const heroMap = {} // model → { colorSlug → heroUrl }
  let totalHeroes = 0

  for (const model of MODELS) {
    const url = `${KIA_BASE}/au/cars/${model}.html`
    const r = await safeFetch(url)
    if (!r || !r.ok) { console.log(`  ${model}: ${r?.status || 'timeout'}`); continue }
    const html = await r.text()

    // Extract frame _00000 hero URLs
    const heroRegex = /"(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"]*?\/(?:360VR|360vr|exterior360|exterior)\/([^/]+)\/[^"]*?_00000\.(?:png|webp|jpg))"/gi
    const modelHeroes = {}
    let m
    while ((m = heroRegex.exec(html)) !== null) {
      const fullPath = m[1]
      const colorSlug = m[2]
      if (!modelHeroes[colorSlug]) {
        modelHeroes[colorSlug] = KIA_BASE + fullPath
      }
    }

    heroMap[model] = modelHeroes
    const count = Object.keys(modelHeroes).length
    totalHeroes += count
    console.log(`  ${model}: ${count} hero images — ${Object.keys(modelHeroes).join(', ')}`)
  }

  console.log(`\nTotal heroes found: ${totalHeroes}`)

  // Match and update variant_colors
  let updated = 0
  let noMatch = 0

  for (const vc of needsHero) {
    const modelSlug = productModelSlug[vc.product_id] || ''
    if (!modelSlug) { noMatch++; continue }

    // Match by slugified color_name (DB has manufacturer codes as color_code)
    const modelHeroes = heroMap[modelSlug]
    if (!modelHeroes) { noMatch++; continue }

    const nameSlug = slugify(vc.color_name)
    let heroUrl = modelHeroes[nameSlug]

    // Try common variations if exact match fails
    if (!heroUrl) {
      // Try without -pearl suffix
      heroUrl = modelHeroes[nameSlug.replace(/-pearl$/, '')]
    }
    if (!heroUrl) {
      // Try with -pearl suffix
      heroUrl = modelHeroes[nameSlug + '-pearl']
    }

    if (heroUrl) {
      const { error } = await supabase
        .from('variant_colors')
        .update({ hero_image_url: heroUrl })
        .eq('id', vc.id)
      if (!error) updated++
      else console.error(`  Update error for ${vc.id}:`, error.message)
    } else {
      noMatch++
    }
  }

  console.log(`\n=== ENRICHMENT COMPLETE ===`)
  console.log(`  Updated: ${updated} hero images`)
  console.log(`  No match: ${noMatch}`)
  console.log(`  Already had hero: ${allColors.length - needsHero.length}`)
}

seed().catch(err => { console.error(err); process.exit(1) })
