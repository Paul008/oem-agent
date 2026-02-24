/**
 * Seed GMSV AU variant_colors for the full 7-vehicle lineup.
 * Also creates missing GMSV products if they don't exist yet.
 *
 * Sources:
 *   Trucks & SUV (HTML scraping from GMSV AU):
 *   - https://www.gmspecialtyvehicles.com/au-en/chevrolet/trucks/silverado-ltz-premium
 *   - https://www.gmspecialtyvehicles.com/au-en/chevrolet/trucks/silverado-zr2
 *   - https://www.gmspecialtyvehicles.com/au-en/chevrolet/trucks/silverado-2500hd
 *   - https://www.gmspecialtyvehicles.com/au-en/gmc/yukon-denali
 *
 *   Corvettes (Chevrolet US colorizer JSON API — GMSV AU pages have no colorizer):
 *   - https://www.chevrolet.com/performance/corvette/stingray
 *   - https://www.chevrolet.com/performance/corvette/e-ray
 *   - https://www.chevrolet.com/performance/corvette/z06
 *
 * Run: cd dashboard/scripts && node seed-gmsv-colors.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'gmsv-au'
const GMSV_BASE = 'https://www.gmspecialtyvehicles.com'
const CHEVY_BASE = 'https://www.chevrolet.com'

// ── Full GMSV AU lineup (7 vehicles) ──────────────────────────────────
const VEHICLE_PAGES = [
  // Pickup Trucks
  {
    slug: 'silverado-ltz-premium',
    title: 'Silverado LTZ Premium',
    url: '/au-en/chevrolet/trucks/silverado-ltz-premium',
    subBrand: 'chevrolet',
    bodyType: 'Ute',
    source: 'gmsv-html',
  },
  {
    slug: 'silverado-zr2',
    title: 'Silverado ZR2',
    url: '/au-en/chevrolet/trucks/silverado-zr2',
    subBrand: 'chevrolet',
    bodyType: 'Ute',
    source: 'gmsv-html',
    // ZR2 has no per-color jellies — use this generic hero for all colors
    fallbackHero: `${GMSV_BASE}/content/dam/chevrolet/oc/au/en/index/portablenavigation/2025/trucks/02-images/2025-silverado-zr2-rapid-blue.png?imwidth=960`,
  },
  {
    slug: 'silverado-2500hd',
    title: 'Silverado 2500 HD',
    url: '/au-en/chevrolet/trucks/silverado-2500hd',
    subBrand: 'chevrolet',
    bodyType: 'Ute',
    source: 'gmsv-html',
  },
  // SUVs
  {
    slug: 'yukon-denali',
    title: 'Yukon Denali',
    url: '/au-en/gmc/yukon-denali',
    subBrand: 'gmc',
    bodyType: 'SUV',
    source: 'gmsv-html',
  },
  // Sportscars (colors from Chevrolet US colorizer API)
  {
    slug: 'corvette-stingray',
    title: 'Corvette Stingray',
    url: '/au-en/chevrolet/corvette/stingray',
    subBrand: 'chevrolet',
    bodyType: 'Sports Car',
    source: 'chevy-api',
    colorizerPath: '/content/gm/api/services/colorizerContent?path=%2Fcontent%2Fdam%2Fchevrolet%2Fna%2Fus%2Fenglish%2Findex%2FPerformance%2F2026-corvette-stingray%2Fcolorizer%2F2026-stingray-colorizer',
    chipBase: '/content/dam/chevrolet/na/us/english/index/Performance/2026-corvette-stingray/colorizer',
  },
  {
    slug: 'corvette-e-ray',
    title: 'Corvette E-Ray',
    url: '/au-en/chevrolet/corvette/e-ray',
    subBrand: 'chevrolet',
    bodyType: 'Sports Car',
    source: 'chevy-api',
    colorizerPath: '/content/gm/api/services/colorizerContent?path=%2Fcontent%2Fdam%2Fchevrolet%2Fna%2Fus%2Fenglish%2Findex%2FPerformance%2F2026-corvette-eray%2Fcolorizer%2F2026-eray-colorizer',
    chipBase: '/content/dam/chevrolet/na/us/english/index/Performance/2026-corvette-eray/colorizer',
  },
  {
    slug: 'corvette-z06',
    title: 'Corvette Z06',
    url: '/au-en/chevrolet/corvette/z06',
    subBrand: 'chevrolet',
    bodyType: 'Sports Car',
    source: 'chevy-api',
    colorizerPath: '/content/gm/api/services/colorizerContent?path=%2Fcontent%2Fdam%2Fchevrolet%2Fna%2Fus%2Fenglish%2Findex%2FPerformance%2F2026-corvette-z06%2Fcolorizer%2F2026-corvette-z06-colorizer',
    chipBase: '/content/dam/chevrolet/na/us/english/index/Performance/2026-corvette-z06/colorizer',
  },
]

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

// ── Helpers ───────────────────────────────────────────────────────────

function titleCase(name) {
  return name
    .replace(/^NEW\s+/i, '') // strip "NEW " prefix from US site
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function extractGmCode(filename) {
  const upper = filename.match(/^([A-Z0-9]{2,3})\.(png|jpg)$/i)
  if (upper) return upper[1].toUpperCase()
  const named = filename.match(/^([a-z0-9]{2,3})-/i)
  if (named) return named[1].toUpperCase()
  const model = filename.match(/^\d{2}ch-([a-z0-9]{2,3})/i)
  if (model) return model[1].toUpperCase()
  return null
}

function classifyColor(name) {
  const lower = name.toLowerCase()
  if (lower.includes('tricoat')) return 'tricoat'
  if (lower.includes('tintcoat')) return 'tintcoat'
  if (lower.includes('metallic')) return 'metallic'
  return 'solid'
}

/** Match a jelly image URL to a color name or GM code */
function findJellyUrl(jellyTags, colorName, gmCode) {
  const lower = colorName.toLowerCase()
  const slugHyphen = lower.replace(/[^a-z0-9]+/g, '-')
  const slugConcat = lower.replace(/[^a-z0-9]+/g, '')
  const gmCodeLower = (gmCode || '').toLowerCase()

  for (const [tag] of jellyTags) {
    const src = tag.match(/\bsrc="([^"]*)"/)?.[1]
    if (!src) continue
    const srcLower = src.toLowerCase()
    const jellyAlt = (tag.match(/\balt="([^"]*)"/)?.[1] || '').toLowerCase()

    if (srcLower.includes(slugConcat) || srcLower.includes(slugHyphen)) {
      return src.startsWith('http') ? src : `${GMSV_BASE}${src}`
    }
    if (jellyAlt && (jellyAlt.includes(lower) || jellyAlt.startsWith(lower.split(' ')[0]))) {
      if (srcLower.includes('jelly') || srcLower.includes('colorizer')) {
        return src.startsWith('http') ? src : `${GMSV_BASE}${src}`
      }
    }
    if (gmCodeLower && srcLower.includes(`-${gmCodeLower}-`) && srcLower.includes('jelly')) {
      return src.startsWith('http') ? src : `${GMSV_BASE}${src}`
    }
  }
  return null
}

// ── Data fetchers ─────────────────────────────────────────────────────

/** Fetch colors from GMSV AU HTML (trucks + SUV) */
async function fetchGmsvHtmlColors(vehicle) {
  const url = `${GMSV_BASE}${vehicle.url}`
  console.log(`  Fetching ${url}...`)

  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) { console.error(`    HTTP ${res.status} — skipping`); return [] }
  const html = await res.text()
  console.log(`    Page size: ${(html.length / 1024).toFixed(0)} KB`)

  const chipRegex = /<img\s[^>]*(?:colorizer-chips|\/chips\/|25ch-)[^>]*>/gi
  const chipTags = [...html.matchAll(chipRegex)]

  const jellyRegex = /<img\s[^>]*(?:jelly|colorizer\/(?!chip))[^>]*\.(?:png|jpg)[^>]*>/gi
  const jellyTags = [...html.matchAll(jellyRegex)].filter(([tag]) => {
    const src = (tag.match(/\bsrc="([^"]*)"/)?.[1] || '').split('/').pop() || ''
    // Exclude chip detail/texture images (e.g. 25ch-gxd-189x199.jpg)
    if (/\d+ch-[a-z0-9]+[-_]?\d+x\d+/i.test(src)) return false
    return true
  })

  console.log(`    Chip tags: ${chipTags.length}, Jelly tags: ${jellyTags.length}`)

  const colors = []
  const seenNames = new Set()

  for (const [tag] of chipTags) {
    const alt = tag.match(/\balt="([^"]*)"/)?.[1]
    const src = tag.match(/\bsrc="([^"]*)"/)?.[1]
    if (!alt || !src) continue

    const altCodeMatch = alt.match(/\(([A-Z0-9]{2,3})\)\s*$/i)
    const cleanAlt = alt.replace(/\s*\([A-Z0-9]{2,3}\)\s*$/i, '').trim()

    const normName = titleCase(cleanAlt)
    if (seenNames.has(normName)) continue
    seenNames.add(normName)

    const filename = src.split('/').pop() || ''
    const gmCode = altCodeMatch ? altCodeMatch[1].toUpperCase() : extractGmCode(filename)

    let jellyUrl = findJellyUrl(jellyTags, normName, gmCode)
    // Fallback: use vehicle's generic hero if no per-color jelly
    if (!jellyUrl && vehicle.fallbackHero) jellyUrl = vehicle.fallbackHero

    colors.push({ name: normName, gmCode, swatchUrl: src.startsWith('http') ? src : `${GMSV_BASE}${src}`, heroUrl: jellyUrl })
  }

  const heroCount = colors.filter(c => c.heroUrl).length
  console.log(`    Found ${colors.length} colors (${heroCount} with hero): ${colors.map(c => `${c.name} (${c.gmCode})${c.heroUrl ? ' +hero' : ''}`).join(', ')}`)
  return colors
}

/** Fetch colors from Chevrolet US colorizer API (Corvettes) */
async function fetchChevyApiColors(vehicle) {
  const apiUrl = `${CHEVY_BASE}${vehicle.colorizerPath}`
  console.log(`  Fetching Chevy API for ${vehicle.title}...`)

  const res = await fetch(apiUrl, { headers: { 'User-Agent': UA } })
  if (!res.ok) { console.error(`    API HTTP ${res.status} — skipping`); return [] }

  const json = await res.json()
  const trims = json?.data?.colorizerModelByPath?.item?.trims || []
  if (!trims.length) { console.error(`    No trims in API response`); return [] }

  // Use the first trim's exterior colors (all trims share the same palette)
  const trim = trims[0]
  const exteriors = trim.exteriors || []
  console.log(`    Trim: ${trim.trimId}, ${exteriors.length} exterior colors`)

  const colors = []
  for (const ext of exteriors) {
    const name = titleCase(ext.name)
    const gmCode = (ext.rpoId || '').toUpperCase()
    const isPremium = (ext.disclosure?.html || '').toLowerCase().includes('extra cost')

    // Chip URL from Chevrolet CDN
    const chipPath = ext.chipImgUrl?._path
    const swatchUrl = chipPath ? `${CHEVY_BASE}${chipPath}` : null

    // Hero: flipbook frame 001 (front 3/4 view)
    const flipbookFormat = ext.flipbook?.desktopImagePathFormat
    let heroUrl = null
    if (flipbookFormat) {
      // API returns {framenumber} placeholder — replace with 001 (3-digit format)
      const framePath = flipbookFormat.replace('{framenumber}', '001')
      heroUrl = `${CHEVY_BASE}${framePath}`
    }

    colors.push({ name, gmCode, swatchUrl, heroUrl, isPremium })
  }

  const heroCount = colors.filter(c => c.heroUrl).length
  console.log(`    Found ${colors.length} colors (${heroCount} with hero flipbook): ${colors.map(c => `${c.name} (${c.gmCode})${c.heroUrl ? ' +hero' : ''}`).join(', ')}`)
  return colors
}

/** Dispatch to the right fetcher based on vehicle source */
async function fetchVehicleColors(vehicle) {
  if (vehicle.source === 'chevy-api') return fetchChevyApiColors(vehicle)
  return fetchGmsvHtmlColors(vehicle)
}

// ── Product management ────────────────────────────────────────────────

async function ensureProducts(vehicles) {
  const { data: existing, error: fetchErr } = await supabase
    .from('products')
    .select('id, external_key, title')
    .eq('oem_id', OEM_ID)
  if (fetchErr) { console.error('Product fetch error:', fetchErr.message); process.exit(1) }

  console.log(`\nExisting GMSV products: ${existing.length}`)
  for (const p of existing) console.log(`  ${p.title} (${p.external_key})`)

  const products = [...existing]
  for (const v of vehicles) {
    const match = existing.find(p => {
      const s = `${p.external_key || ''} ${p.title || ''}`.toLowerCase()
      return s.includes(v.slug) || s.includes(v.title.toLowerCase())
    })
    if (match) continue

    console.log(`  Creating product: ${v.title}`)
    const { data: created, error: createErr } = await supabase
      .from('products')
      .insert({
        oem_id: OEM_ID,
        external_key: `gmsv-${v.slug}`,
        title: v.title,
        body_type: v.bodyType,
        source_url: `${GMSV_BASE}${v.url}`,
        last_seen_at: new Date().toISOString(),
      })
      .select('id, external_key, title')
      .single()
    if (createErr) {
      console.error(`  Failed to create ${v.title}:`, createErr.message)
    } else {
      products.push(created)
      console.log(`  Created: ${created.title} (${created.id})`)
    }
  }

  return products
}

function matchProduct(products, vehicle) {
  const slug = vehicle.slug.toLowerCase()
  const title = vehicle.title.toLowerCase()
  return products.find(p => {
    const s = `${p.external_key || ''} ${p.title || ''}`.toLowerCase()
    return s.includes(slug) || s.includes(title)
  })
}

// ── Main seed ─────────────────────────────────────────────────────────

async function seed() {
  console.log('Fetching GMSV vehicle color data (7 vehicles)...\n')

  const allColorData = []
  for (const vehicle of VEHICLE_PAGES) {
    const colors = await fetchVehicleColors(vehicle)
    allColorData.push({ vehicle, colors })
  }

  const totalColors = allColorData.reduce((sum, d) => sum + d.colors.length, 0)
  console.log(`\nTotal colors extracted: ${totalColors} across ${VEHICLE_PAGES.length} vehicles`)

  const products = await ensureProducts(VEHICLE_PAGES)
  console.log(`\nTotal GMSV products: ${products.length}`)

  // Delete existing GMSV variant_colors
  const productIds = products.map(p => p.id)
  if (productIds.length) {
    const { error: delErr } = await supabase
      .from('variant_colors')
      .delete()
      .in('product_id', productIds)
    if (delErr) console.error('Delete error:', delErr.message)
    else console.log('Deleted old GMSV variant_colors')
  }

  // Build color rows
  const colorRows = []
  let skipped = 0
  let matched = 0

  for (const { vehicle, colors } of allColorData) {
    const product = matchProduct(products, vehicle)
    if (!product) {
      console.warn(`  No product match for ${vehicle.slug} — skipping ${colors.length} colors`)
      skipped += colors.length
      continue
    }
    console.log(`  Matched ${vehicle.slug} → ${product.title} (${product.id})`)

    for (let i = 0; i < colors.length; i++) {
      const c = colors[i]
      matched++
      colorRows.push({
        product_id: product.id,
        color_name: c.name,
        color_code: c.gmCode?.toLowerCase() || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        color_type: classifyColor(c.name),
        is_standard: !c.isPremium,
        price_delta: 0,
        swatch_url: c.swatchUrl,
        hero_image_url: c.heroUrl,
        gallery_urls: null,
        sort_order: i,
      })
    }
  }

  console.log(`\nInserting ${colorRows.length} variant_colors (matched ${matched}, skipped ${skipped})...`)

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

  console.log(`\n=== GMSV COLORS SEED COMPLETE ===`)
  console.log(`  Inserted: ${inserted} color rows`)
  console.log(`  Matched: ${matched}`)
  console.log(`  Skipped: ${skipped}`)

  console.log('\nBy vehicle:')
  for (const { vehicle, colors } of allColorData) {
    const product = matchProduct(products, vehicle)
    const count = product ? colorRows.filter(r => r.product_id === product.id).length : 0
    const heroCount = product ? colorRows.filter(r => r.product_id === product.id && r.hero_image_url).length : 0
    console.log(`  ${vehicle.title.padEnd(25)} ${count} colors (${heroCount} with hero)`)
  }

  const types = {}
  for (const r of colorRows) {
    types[r.color_type || 'unknown'] = (types[r.color_type || 'unknown'] || 0) + 1
  }
  console.log('\nBy type:')
  for (const [t, c] of Object.entries(types)) {
    console.log(`  ${t.padEnd(20)} ${c}`)
  }
}

seed().catch(err => { console.error(err); process.exit(1) })
