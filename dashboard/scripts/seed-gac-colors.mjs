/**
 * Seed GAC Australia variant_colors from API + HTML scraping.
 *
 * Sources:
 *   AION V: showroom/vehicle/query/optional API (7 colors with swatch + hero)
 *   EMZOOM: HTML-embedded CDN image URLs (7 colors with hero images)
 *   M8 PHEV: HTML-embedded CDN image URLs (2 colors with hero images)
 *
 * Run: node dashboard/scripts/seed-gac-colors.mjs
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'gac-au'
const API_BASE = 'https://eu-www-api.gacgroup.com/gateway/v1/www/api'
const APP_ID = 'fe-official'
const SIGN_SECRET = 'fe-official-450etarvpz'
const CDN = 'https://eu-www-resouce-cdn.gacgroup.com/static/AU/tenant/cms/common'

// ── GAC API helpers ──────────────────────────────────────────────────

function gacHeaders(method, body) {
  const timestamp = String(Date.now())
  const requestId = crypto.randomUUID()
  const parts = []
  if (method === 'post' && body !== undefined) parts.push('body' + (JSON.stringify(body) || ''))
  parts.push('fnc-app-id' + APP_ID)
  parts.push('fnc-requestId' + requestId)
  parts.push('fnc-timestamp' + timestamp)
  parts.sort()
  const sig = crypto.createHmac('sha256', SIGN_SECRET).update(parts.join('')).digest('hex').toUpperCase()
  return { 'fnc-app-id': APP_ID, 'fnc-requestId': requestId, 'fnc-timestamp': timestamp, sig, locale: 'en', region: 'AU', 'Content-Type': 'application/json', Accept: 'application/json' }
}

async function gacPost(url, body) {
  const headers = gacHeaders('post', body)
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  return resp.json()
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// ── Color data sources ───────────────────────────────────────────────

/** Fetch AION V colors from the optional API + panorama images */
async function fetchAionVColors() {
  console.log('  Fetching AION V colors from API...')
  const optData = await gacPost(`${API_BASE}/showroom/vehicle/query/optional`, { vehStyleId: 10, opCategoryType: 'color' })
  const colors = optData.data?.list || []

  const result = []
  for (const color of colors) {
    // Get hero image from panorama endpoint
    let heroUrl = null
    try {
      const panoData = await gacPost(`${API_BASE}/showroom/vehicle/query/panorama`, { vehStyleId: 10, colorOptionalId: color.optionalId })
      heroUrl = panoData.data?.list?.[0]?.picUrl || null
    } catch { /* skip */ }

    result.push({
      name: color.name,
      swatchUrl: color.selectPicUrl || null,
      heroUrl,
      isStandard: color.name === 'Arctic White', // White is standard per T&Cs
      priceDelta: color.name === 'Arctic White' ? 0 : 600, // $600 surcharge for non-white
    })
  }
  return result
}

/** EMZOOM colors from HTML-embedded CDN URLs */
function getEmzoomColors() {
  return [
    {
      name: 'White',
      swatchUrl: null,
      heroUrl: `${CDN}/202601/1769045691607-白色.webp`,
      isStandard: true,
      priceDelta: 0,
    },
    {
      name: 'Silver',
      swatchUrl: null,
      heroUrl: `${CDN}/202601/1769047348538-银灰.webp`,
      isStandard: false,
      priceDelta: 600,
    },
    {
      name: 'Light Grey',
      swatchUrl: null,
      heroUrl: `${CDN}/202601/1769047396637-浅灰.webp`,
      isStandard: false,
      priceDelta: 600,
    },
    {
      name: 'Graphene Grey',
      swatchUrl: null,
      heroUrl: `${CDN}/202601/1769047533165-深灰.webp`,
      isStandard: false,
      priceDelta: 600,
    },
    {
      name: 'Black',
      swatchUrl: null,
      heroUrl: `${CDN}/202601/1769047619905-黑色.webp`,
      isStandard: false,
      priceDelta: 600,
    },
    {
      name: 'Galaxy Lilac',
      swatchUrl: `${CDN}/202601/1769047695385-车型颜色-紫色.webp`,
      heroUrl: `${CDN}/202601/1769047700672-m-紫色.webp`,
      isStandard: false,
      priceDelta: 600,
    },
    {
      name: 'Red',
      swatchUrl: null,
      heroUrl: `${CDN}/202601/1769047749118-红色.webp`,
      isStandard: false,
      priceDelta: 600,
    },
  ]
}

/** M8 PHEV colors from HTML-embedded CDN URLs */
function getM8PhevColors() {
  return [
    {
      name: 'White',
      swatchUrl: null,
      heroUrl: `${CDN}/202601/1769049166815-白色.webp`,
      isStandard: true,
      priceDelta: 0,
    },
    {
      name: 'Black',
      swatchUrl: null,
      heroUrl: `${CDN}/202601/1769049213124-黑色.webp`,
      isStandard: false,
      priceDelta: 1200, // M8 PHEV has $1,200 surcharge per T&Cs
    },
  ]
}

// ── Main seed ────────────────────────────────────────────────────────

async function seed() {
  console.log('=== GAC Australia Variant Colors Seed ===\n')

  // Load existing GAC products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, external_key, model_id, title')
    .eq('oem_id', OEM_ID)
  if (prodErr) { console.error('Product fetch error:', prodErr.message); process.exit(1) }
  console.log(`Found ${products.length} GAC products`)

  // Load vehicle models for slug mapping
  const { data: models, error: modErr } = await supabase
    .from('vehicle_models')
    .select('id, slug, name')
    .eq('oem_id', OEM_ID)
  if (modErr) { console.error('Model fetch error:', modErr.message); process.exit(1) }
  console.log(`Found ${models.length} GAC vehicle models\n`)

  // Build model_id → slug lookup
  const modelIdToSlug = {}
  for (const m of models) modelIdToSlug[m.id] = m.slug

  // Delete existing GAC variant_colors
  const productIds = products.map(p => p.id)
  if (productIds.length) {
    for (let i = 0; i < productIds.length; i += 100) {
      const batch = productIds.slice(i, i + 100)
      await supabase.from('variant_colors').delete().in('product_id', batch)
    }
    console.log('Deleted old GAC variant_colors\n')
  }

  // Fetch colors per model
  const modelColorData = {
    'aion-v': await fetchAionVColors(),
    'emzoom': getEmzoomColors(),
    'm8-phev': getM8PhevColors(),
  }

  for (const [slug, colors] of Object.entries(modelColorData)) {
    console.log(`  ${slug}: ${colors.length} colors — ${colors.map(c => c.name).join(', ')}`)
  }

  // Build color rows: each product gets all colors for its model
  const colorRows = []
  let matched = 0, unmatched = 0

  for (const product of products) {
    const modelSlug = product.model_id ? modelIdToSlug[product.model_id] : null
    if (!modelSlug) { unmatched++; continue }

    const colors = modelColorData[modelSlug]
    if (!colors || colors.length === 0) { unmatched++; continue }

    matched++
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i]
      colorRows.push({
        product_id: product.id,
        color_name: c.name,
        color_code: slugify(c.name),
        color_type: classifyColor(c.name),
        is_standard: c.isStandard,
        price_delta: c.priceDelta,
        swatch_url: c.swatchUrl,
        hero_image_url: c.heroUrl,
        gallery_urls: null,
        sort_order: i,
      })
    }
  }

  console.log(`\nMatched ${matched} products, ${unmatched} unmatched`)
  console.log(`Inserting ${colorRows.length} variant_colors...`)

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

  console.log(`Inserted ${inserted} variant_colors`)

  // Summary
  console.log('\n=== GAC COLORS SEED COMPLETE ===')
  console.log('\nBy model:')
  for (const [slug, colors] of Object.entries(modelColorData)) {
    const modelProducts = products.filter(p => modelIdToSlug[p.model_id] === slug)
    const rowCount = colorRows.filter(r => modelProducts.some(p => p.id === r.product_id)).length
    const heroCount = colorRows.filter(r => modelProducts.some(p => p.id === r.product_id) && r.hero_image_url).length
    console.log(`  ${slug.padEnd(15)} ${colors.length} colors × ${modelProducts.length} variants = ${rowCount} rows (${heroCount} with hero)`)
  }
  console.log(`  ${'TOTAL'.padEnd(15)} ${inserted} variant_colors inserted`)
}

function classifyColor(name) {
  const lower = name.toLowerCase()
  if (lower.includes('metallic')) return 'metallic'
  if (lower.includes('pearl')) return 'pearl'
  if (lower.includes('holographic') || lower.includes('galaxy')) return 'metallic'
  return 'solid'
}

seed().catch(err => { console.error(err); process.exit(1) })
