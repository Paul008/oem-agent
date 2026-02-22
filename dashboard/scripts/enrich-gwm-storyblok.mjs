/**
 * Enrich GWM AU variant_colors with real names + hero/gallery images from Storyblok CDN API.
 *
 * DB colors are hex-based (code="hex-efefef", name="Color #efefef") from HTML scraping.
 * Storyblok has real color names + high-res images per variant.
 * Match by hex value, then update color_name + hero_image_url + gallery_urls.
 *
 * Run: cd dashboard/scripts && node enrich-gwm-storyblok.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const TOKEN = 'rII785g9nG3hemzhYNQvQwtt'
const CV = '1771462289'
const BASE = 'https://api.storyblok.com/v2/cdn/stories'
const HEADERS = { 'Origin': 'https://www.gwmanz.com', 'Referer': 'https://www.gwmanz.com/' }
const OEM_ID = 'gwm-au'
const SB_MODELS = ['cannon', 'cannon-alpha', 'tank-300', 'tank-500', 'haval-h6', 'haval-jolion', 'haval-h6gt', 'haval-h7', 'ora']

async function fetchSB(slugPattern, page = 1) {
  const url = `${BASE}?cv=${CV}&by_slugs=${slugPattern}&language=au&per_page=100&page=${page}&token=${TOKEN}&version=published`
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) return null
  return r.json()
}

async function main() {
  console.log('=== GWM Storyblok Image Enrichment ===\n')

  // 1. Load DB data
  const { data: products } = await supabase
    .from('products').select('id, model_id, title, external_key').eq('oem_id', OEM_ID)
  const { data: models } = await supabase
    .from('vehicle_models').select('id, slug, name').eq('oem_id', OEM_ID)
  console.log(`DB: ${products.length} products, ${models.length} models`)

  const modelById = Object.fromEntries(models.map(m => [m.id, m]))

  let allColors = []
  for (let i = 0; i < products.length; i += 100) {
    const batch = products.slice(i, i + 100).map(p => p.id)
    const { data } = await supabase.from('variant_colors')
      .select('id, product_id, color_code, color_name, swatch_url, hero_image_url, gallery_urls')
      .in('product_id', batch)
    if (data) allColors = allColors.concat(data)
  }
  console.log(`DB: ${allColors.length} variant_colors\n`)

  // 2. Fetch Storyblok colour definitions → build hex → { name, uuid } map
  const colourStories = []
  for (let page = 1; page <= 5; page++) {
    const d = await fetchSB('car-configurator/colours/*', page)
    if (!d || !d.stories.length) break
    colourStories.push(...d.stories)
    if (d.stories.length < 100) break
  }
  console.log(`Storyblok colour definitions: ${colourStories.length}`)

  // uuid → { name, hex }
  const colourByUuid = {}
  for (const s of colourStories) {
    colourByUuid[s.uuid] = {
      name: s.content.name || s.name,
      hex: (s.content.hex || s.content.hex_code || '').toUpperCase(),
      slug: s.slug,
    }
  }

  // 3. Fetch all AU variants and build model→hex→images map
  // hexImagesMap: { modelSlug → { hexUpper → { name, hero, zoomed, proportional } } }
  const hexImagesMap = {}

  for (const sbModel of SB_MODELS) {
    const d = await fetchSB(`car-configurator/models/${sbModel}/au/*`)
    if (!d || !d.stories.length) { console.log(`  ${sbModel}: no AU data`); continue }
    if (!hexImagesMap[sbModel]) hexImagesMap[sbModel] = {}

    for (const s of d.stories) {
      const c = s.content

      // Process each colour entry: has { name, colour (uuid ref), images }
      for (const col of (c.colours || [])) {
        const colDef = colourByUuid[col.colour]
        if (!colDef) continue
        const hex = colDef.hex
        if (!hex) continue

        if (!hexImagesMap[sbModel][hex]) {
          hexImagesMap[sbModel][hex] = { name: col.name || colDef.name }
        }
        const entry = hexImagesMap[sbModel][hex]
        const img = col.images?.[0]?.filename
        if (img && !entry.hero) entry.hero = img
      }

      for (const col of (c.coloursZoomed || [])) {
        const colDef = colourByUuid[col.colour]
        if (!colDef) continue
        const hex = colDef.hex
        if (!hex || !hexImagesMap[sbModel][hex]) continue
        const img = col.images?.[0]?.filename
        if (img && !hexImagesMap[sbModel][hex].zoomed) hexImagesMap[sbModel][hex].zoomed = img
      }

      for (const col of (c.coloursProportional || [])) {
        const colDef = colourByUuid[col.colour]
        if (!colDef) continue
        const hex = colDef.hex
        if (!hex || !hexImagesMap[sbModel][hex]) continue
        const img = col.images?.[0]?.filename
        if (img && !hexImagesMap[sbModel][hex].proportional) hexImagesMap[sbModel][hex].proportional = img
      }
    }

    const count = Object.keys(hexImagesMap[sbModel]).length
    console.log(`  ${sbModel}: ${count} colors — ${Object.entries(hexImagesMap[sbModel]).map(([h, v]) => `${v.name}(${h})`).join(', ')}`)
  }

  // DB model slug → Storyblok model slug mapping
  // DB has: cannon, tank-300, tank-500, haval-h6, haval-jolion, ora, haval-h7, ute
  // Storyblok has: cannon, cannon-alpha, tank-300, tank-500, haval-h6, haval-jolion, haval-h6gt, haval-h7, ora
  // "ute" in DB may cover cannon-alpha products
  const modelSlugMap = {}
  for (const m of models) {
    // Direct matches
    if (hexImagesMap[m.slug]) {
      modelSlugMap[m.slug] = [m.slug]
    } else {
      modelSlugMap[m.slug] = []
    }
  }
  // "ute" might match cannon-alpha
  if (modelSlugMap['ute']) {
    modelSlugMap['ute'].push('cannon-alpha')
  }
  // cannon might also match cannon-alpha colors
  if (modelSlugMap['cannon']) {
    modelSlugMap['cannon'].push('cannon-alpha')
  }
  // haval-h6 might match haval-h6gt
  if (modelSlugMap['haval-h6']) {
    modelSlugMap['haval-h6'].push('haval-h6gt')
  }

  console.log('\nModel mapping:', JSON.stringify(modelSlugMap, null, 2))

  // 4. Match by hex and update
  let nameUpdated = 0, heroUpdated = 0, galleryUpdated = 0, noMatch = 0

  for (const vc of allColors) {
    const product = products.find(p => p.id === vc.product_id)
    if (!product || !product.model_id) { noMatch++; continue }

    const model = modelById[product.model_id]
    if (!model) { noMatch++; continue }

    // Extract hex from color_code like "hex-efefef"
    const hexMatch = vc.color_code?.match(/^hex-([0-9a-f]{6})$/i)
    if (!hexMatch) { noMatch++; continue }
    const dbHex = hexMatch[1].toUpperCase()

    // Try all mapped Storyblok models for this DB model
    const sbSlugs = modelSlugMap[model.slug] || [model.slug]
    let colorData = null
    for (const sbSlug of sbSlugs) {
      const mmap = hexImagesMap[sbSlug]
      if (mmap && mmap[dbHex]) {
        colorData = mmap[dbHex]
        break
      }
    }

    if (!colorData) { noMatch++; continue }

    const updates = {}

    // Update color_name from "Color #hex" to real name
    if (vc.color_name?.startsWith('Color #') && colorData.name) {
      updates.color_name = colorData.name
    }

    // Hero: prefer zoomed (2048x2048), then proportional, then original
    if (!vc.hero_image_url) {
      const heroUrl = colorData.zoomed || colorData.proportional || colorData.hero
      if (heroUrl) updates.hero_image_url = heroUrl
    }

    // Gallery: all available image angles
    if (!vc.gallery_urls) {
      const gallery = []
      if (colorData.hero) gallery.push(colorData.hero)
      if (colorData.zoomed) gallery.push(colorData.zoomed)
      if (colorData.proportional) gallery.push(colorData.proportional)
      if (gallery.length > 0) updates.gallery_urls = gallery
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('variant_colors').update(updates).eq('id', vc.id)
      if (!error) {
        if (updates.color_name) nameUpdated++
        if (updates.hero_image_url) heroUpdated++
        if (updates.gallery_urls) galleryUpdated++
      } else {
        console.error(`  Update error for ${vc.id}:`, error.message)
      }
    }
  }

  console.log(`\n=== ENRICHMENT COMPLETE ===`)
  console.log(`  Names updated: ${nameUpdated}`)
  console.log(`  Hero updated: ${heroUpdated}`)
  console.log(`  Gallery updated: ${galleryUpdated}`)
  console.log(`  No match: ${noMatch}`)
}

main().catch(err => { console.error(err); process.exit(1) })
