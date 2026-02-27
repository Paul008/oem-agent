#!/usr/bin/env node
/**
 * Update variant_colors hero/gallery images using portal_assets data.
 * Reads from portal_assets (populated by seed-kia-sesimi-assets.mjs),
 * so no Algolia key needed.
 *
 * Run: node dashboard/scripts/seed-kia-sesimi-colors.mjs
 * Dry run: node dashboard/scripts/seed-kia-sesimi-colors.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'kia-au'
const DRY_RUN = process.argv.includes('--dry-run')

// ═══════════════ MODEL NAME MAPPING ═══════════════
// Maps DB model slugs → Sesimi parsed_model names
const DB_MODEL_TO_SESIMI = {
  'carnival': 'carnival',
  'carnival-hybrid': 'carnival',
  'sorento': 'sorento',
  'sorento-hybrid': 'sorento',
  'sorento-plug-in-hybrid': 'sorento',
  'niro-ev': 'niro',
  'niro-hybrid': 'niro',
  'niro-hev': 'niro',
  'sportage': 'sportage',
  'sportage-hybrid': 'sportage',
  'sportage-facelift': 'sportage',
  'k4-hatch': 'k4',
  'k4-sedan': 'k4',
  'k4': 'k4',
  'cerato': 'cerato',
  'cerato-hatch': 'cerato',
  'cerato-sedan': 'cerato',
  'picanto': 'picanto',
  'stonic': 'stonic',
  'seltos': 'seltos',
  'tasman': 'tasman',
  'ev3': 'ev3',
  'ev5': 'ev5',
  'ev6': 'ev6',
  'ev9': 'ev9',
}

// ═══════════════ COLOR MATCHING ═══════════════

function slugifyColor(name) {
  return name
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '')       // strip parenthetical (e.g. "Blue (Premium)")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeColorForMatch(color) {
  return color
    .replace(/-metallic$/i, '')
    .replace(/-pearl$/i, '')
    .replace(/-mica$/i, '')
    .replace(/-premium$/i, '')
    .replace(/-special$/i, '')
}

function matchColor(dbColorName, assetColors) {
  const dbSlug = slugifyColor(dbColorName)
  const dbNorm = normalizeColorForMatch(dbSlug)

  // 1. Exact match
  if (assetColors.has(dbSlug)) return dbSlug

  // 2. Normalized match (strip -metallic, -pearl, etc.)
  for (const assetColor of assetColors.keys()) {
    if (normalizeColorForMatch(assetColor) === dbNorm) return assetColor
  }

  // 3. Partial: DB slug contains asset color or vice versa
  for (const assetColor of assetColors.keys()) {
    if (dbSlug.includes(assetColor) || assetColor.includes(dbSlug)) return assetColor
  }

  // 4. Word overlap: at least 2 shared words
  const dbWords = new Set(dbSlug.split('-').filter(w => w.length > 2))
  for (const assetColor of assetColors.keys()) {
    const assetWords = new Set(assetColor.split('-').filter(w => w.length > 2))
    let overlap = 0
    for (const w of dbWords) {
      if (assetWords.has(w)) overlap++
    }
    if (overlap >= 2) return assetColor
  }

  return null
}

// ═══════════════ MAIN ═══════════════

async function seed() {
  if (DRY_RUN) console.log('*** DRY RUN — no database writes ***\n')

  console.log('Sesimi Color Updater — Kia AU')
  console.log('═'.repeat(50))

  // 1. Load portal assets (3D renders only)
  console.log('\nLoading portal assets...')
  const PAGE = 1000
  const assets = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('portal_assets')
      .select('id, cdn_url, parsed_model, parsed_trim, parsed_color, parsed_angle')
      .eq('oem_id', OEM_ID)
      .eq('asset_type', 'IMAGE')
      .not('parsed_angle', 'is', null)
      .not('parsed_model', 'is', null)
      .range(from, from + PAGE - 1)

    if (error) { console.error('Portal assets error:', error.message); process.exit(1) }
    if (!data?.length) break
    assets.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log(`Loaded ${assets.length} render assets with parsed angle+model`)

  // 2. Group by model+color → { profile?, front?, rear?, side? }
  // Map: sesimiModel → color → angle → { cdn_url, asset_id }
  const assetMap = new Map()
  for (const a of assets) {
    if (!a.parsed_color || !a.parsed_angle) continue
    const model = a.parsed_model
    if (!assetMap.has(model)) assetMap.set(model, new Map())
    const colorMap = assetMap.get(model)
    if (!colorMap.has(a.parsed_color)) colorMap.set(a.parsed_color, {})
    colorMap.get(a.parsed_color)[a.parsed_angle] = {
      cdn_url: a.cdn_url,
      asset_id: a.id,
    }
  }

  console.log(`\nAsset map: ${assetMap.size} models`)
  for (const [model, colors] of assetMap) {
    console.log(`  ${model}: ${colors.size} colors`)
  }

  // 3. Load DB data: vehicle_models → products → variant_colors
  console.log('\nLoading Kia vehicle models...')
  const { data: models, error: mErr } = await supabase
    .from('vehicle_models')
    .select('id, slug, name')
    .eq('oem_id', OEM_ID)
  if (mErr) { console.error('Models error:', mErr.message); process.exit(1) }
  console.log(`Found ${models.length} Kia models`)

  const modelIds = models.map(m => m.id)
  console.log('Loading products...')
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, model_id, title, variant_name')
    .in('model_id', modelIds)
  if (pErr) { console.error('Products error:', pErr.message); process.exit(1) }
  console.log(`Found ${products.length} products`)

  const productIds = products.map(p => p.id)

  // Paginate variant_colors
  console.log('Loading variant_colors...')
  const allColors = []
  from = 0
  while (true) {
    const { data, error } = await supabase
      .from('variant_colors')
      .select('id, product_id, color_code, color_name, hero_image_url, gallery_urls, portal_asset_id, source_hero_url')
      .in('product_id', productIds)
      .range(from, from + PAGE - 1)
    if (error) { console.error('Colors error:', error.message); process.exit(1) }
    if (!data?.length) break
    allColors.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log(`Found ${allColors.length} variant_colors`)

  // Build product→model lookup
  const productToModel = new Map()
  for (const p of products) {
    const model = models.find(m => m.id === p.model_id)
    if (model) productToModel.set(p.id, model)
  }

  // 4. Match & update
  console.log('\nMatching colors to Sesimi renders...')
  let matched = 0
  let skipped = 0
  let notFound = 0
  let noSesimiModel = 0
  const updates = []
  const unmatchedLog = []

  for (const vc of allColors) {
    const model = productToModel.get(vc.product_id)
    if (!model) continue

    // Skip if already has Cloudinary hero from Sesimi
    if (vc.hero_image_url?.includes('cloudinary.com/mabx-eu-prod')) {
      skipped++
      continue
    }

    // Map DB model slug to Sesimi model name
    const sesimiModel = DB_MODEL_TO_SESIMI[model.slug]
    if (!sesimiModel) {
      noSesimiModel++
      continue
    }

    const colorMap = assetMap.get(sesimiModel)
    if (!colorMap) {
      noSesimiModel++
      continue
    }

    const matchedColor = matchColor(vc.color_name, colorMap)
    if (!matchedColor) {
      notFound++
      unmatchedLog.push(`  ${model.slug} / ${vc.color_name} (${vc.color_code})`)
      continue
    }

    const angles = colorMap.get(matchedColor)
    // Build gallery: [profile, front, rear, side] where available
    const galleryUrls = []
    const angleOrder = ['profile', 'front', 'rear', 'side']
    for (const angle of angleOrder) {
      if (angles[angle]) galleryUrls.push(angles[angle].cdn_url)
    }

    // Prefer profile as hero
    const heroAngle = angles.profile || angles.front || angles.side || angles.rear
    if (!heroAngle) continue

    updates.push({
      id: vc.id,
      hero_image_url: heroAngle.cdn_url,
      source_hero_url: heroAngle.cdn_url,
      gallery_urls: galleryUrls,
      portal_asset_id: heroAngle.asset_id,
    })
    matched++
  }

  console.log(`\nResults:`)
  console.log(`  Matched: ${matched}`)
  console.log(`  Skipped (already Cloudinary): ${skipped}`)
  console.log(`  No Sesimi model mapping: ${noSesimiModel}`)
  console.log(`  Color not found: ${notFound}`)

  if (unmatchedLog.length > 0 && unmatchedLog.length <= 30) {
    console.log(`\nUnmatched colors (${unmatchedLog.length}):`)
    unmatchedLog.forEach(l => console.log(l))
  } else if (unmatchedLog.length > 30) {
    console.log(`\nUnmatched colors: ${unmatchedLog.length} (showing first 30):`)
    unmatchedLog.slice(0, 30).forEach(l => console.log(l))
  }

  if (DRY_RUN) {
    console.log(`\n*** DRY RUN — would update ${updates.length} variant_colors ***`)
    if (updates.length > 0) {
      console.log('\nSample updates:')
      updates.slice(0, 5).forEach(u => {
        console.log(`  ${u.id}: hero=${u.hero_image_url.split('/').pop()}, gallery=${u.gallery_urls.length} angles`)
      })
    }
    return
  }

  // 5. Apply updates
  if (updates.length === 0) {
    console.log('\nNo updates to apply.')
    return
  }

  console.log(`\nApplying ${updates.length} updates...`)
  let applied = 0
  for (const u of updates) {
    const { error } = await supabase
      .from('variant_colors')
      .update({
        hero_image_url: u.hero_image_url,
        source_hero_url: u.source_hero_url,
        gallery_urls: u.gallery_urls,
        portal_asset_id: u.portal_asset_id,
      })
      .eq('id', u.id)

    if (error) {
      console.error(`  Update error for ${u.id}:`, error.message)
    } else {
      applied++
    }
    if (applied % 50 === 0) process.stdout.write(`\r  Updated: ${applied}/${updates.length}`)
  }

  console.log(`\r  Updated: ${applied}/${updates.length}`)

  // 6. Coverage report
  console.log('\n═══════════════ COVERAGE ═══════════════')
  const modelCoverage = {}
  for (const u of updates) {
    const vc = allColors.find(c => c.id === u.id)
    const model = productToModel.get(vc?.product_id)
    if (model) {
      modelCoverage[model.slug] = (modelCoverage[model.slug] || 0) + 1
    }
  }
  Object.entries(modelCoverage).sort((a, b) => b[1] - a[1]).forEach(([slug, count]) => {
    console.log(`  ${slug}: ${count} colors updated`)
  })
}

seed().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
