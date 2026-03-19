#!/usr/bin/env node
/**
 * Enrich Mitsubishi AU variant_colors with hero images from AEM Assets API.
 *
 * AEM DAM structure:
 *   /api/assets/mmal/vehicles/{model}/{MY}/{seats}/{grade}/{drivetrain}/{fuel}/{trans}/{colour}/
 *     → 3 renders: 3-4-front, side, rear-left
 *
 * No auth required. Siren+JSON format.
 *
 * Run: node dashboard/scripts/enrich-mitsubishi-colors.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const AEM_BASE = 'https://www.mitsubishi-motors.com.au/api/assets/mmal'
const DAM_BASE = 'https://www.mitsubishi-motors.com.au/content/dam/mmal'

// Models to scan with their latest MY
const MODELS = [
  { slug: 'outlander', my: '25my' },
  { slug: 'triton', my: '25my' },
  { slug: 'eclipse-cross', my: '24my' },
  { slug: 'pajero-sport', my: '25my' },
  { slug: 'asx', my: '25my' },
]

async function fetchSiren(path) {
  try {
    const res = await fetch(`${AEM_BASE}/${path}.json`, { headers: { Accept: 'application/json' } })
    if (res.status !== 200) return null
    return await res.json()
  } catch { return null }
}

function getFolders(siren) {
  if (!siren?.entities) return []
  return siren.entities
    .filter(e => (e.class || [])[0] === 'assets/folder')
    .map(e => e.properties?.name)
    .filter(Boolean)
}

function getAssets(siren) {
  if (!siren?.entities) return []
  return siren.entities
    .filter(e => (e.class || [])[0] === 'assets/asset' && !e.properties?.contentFragment)
    .map(e => e.properties?.name)
    .filter(Boolean)
}

function slugToColorName(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Map AEM color folder names to DB color names
function normalizeColorSlug(slug) {
  return slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

console.log('=== Mitsubishi AEM Color Image Enrichment ===\n')

// Load all Mitsubishi colors
const { data: products } = await supabase
  .from('products')
  .select('id, title, meta_json')
  .eq('oem_id', 'mitsubishi-au')

const productIds = products.map(p => p.id)
const { data: colors } = await supabase
  .from('variant_colors')
  .select('id, product_id, color_name, color_code, hero_image_url')
  .in('product_id', productIds)

console.log(`DB: ${products.length} products, ${colors.length} colors`)
console.log(`Missing hero: ${colors.filter(c => !c.hero_image_url).length}\n`)

// Build a lookup: normalized-color-name → color rows
const colorsByName = new Map()
for (const c of colors) {
  const key = normalizeColorSlug(c.color_name)
  if (!colorsByName.has(key)) colorsByName.set(key, [])
  colorsByName.get(key).push(c)
}

// Also map DB product titles to products for grade matching
const productsByTitle = new Map()
for (const p of products) {
  productsByTitle.set(p.title.toLowerCase(), p)
}

let totalUpdated = 0
const colorImages = new Map() // colorSlug → { hero, gallery }

for (const model of MODELS) {
  console.log(`\n--- ${model.slug} (${model.my}) ---`)

  // Get seat/body configs
  const myData = await fetchSiren(`vehicles/${model.slug}/${model.my}`)
  if (!myData) { console.log('  No MY data'); continue }
  const configs = getFolders(myData)
  console.log(`  Configs: ${configs.join(', ')}`)

  for (const config of configs) {
    if (config === 'showroom' || config === 'double-range') continue

    // Get grades
    const configData = await fetchSiren(`vehicles/${model.slug}/${model.my}/${config}`)
    if (!configData) continue
    const grades = getFolders(configData)

    for (const grade of grades) {
      // Walk: grade → drivetrain → fuel → trans
      const gradeData = await fetchSiren(`vehicles/${model.slug}/${model.my}/${config}/${grade}`)
      if (!gradeData) continue
      const drivetrains = getFolders(gradeData)

      for (const dt of drivetrains) {
        const dtData = await fetchSiren(`vehicles/${model.slug}/${model.my}/${config}/${grade}/${dt}`)
        if (!dtData) continue
        const fuels = getFolders(dtData)

        for (const fuel of fuels) {
          const fuelData = await fetchSiren(`vehicles/${model.slug}/${model.my}/${config}/${grade}/${dt}/${fuel}`)
          if (!fuelData) continue
          const transmissions = getFolders(fuelData)

          for (const trans of transmissions) {
            const transData = await fetchSiren(`vehicles/${model.slug}/${model.my}/${config}/${grade}/${dt}/${fuel}/${trans}`)
            if (!transData) continue
            const folders = getFolders(transData)
            const colorFolders = folders.filter(f => !f.startsWith('dnd-'))

            if (colorFolders.length === 0) continue

            const basePath = `vehicles/${model.slug}/${model.my}/${config}/${grade}/${dt}/${fuel}/${trans}`

            for (const colorFolder of colorFolders) {
              const colorData = await fetchSiren(`${basePath}/${colorFolder}`)
              if (!colorData) continue
              const assets = getAssets(colorData)

              const heroAsset = assets.find(a => a.includes('3-4-front'))
              const sideAsset = assets.find(a => a.includes('side'))
              const rearAsset = assets.find(a => a.includes('rear'))

              if (!heroAsset) continue

              const damPath = `/content/dam/mmal/${basePath}/${colorFolder}`
              const heroUrl = `${DAM_BASE}/${basePath}/${colorFolder}/${heroAsset}`
              const gallery = [heroAsset, sideAsset, rearAsset]
                .filter(Boolean)
                .map(a => `${DAM_BASE}/${basePath}/${colorFolder}/${a}`)

              // Store best image per color (prefer most assets)
              const existing = colorImages.get(colorFolder)
              if (!existing || gallery.length > (existing.gallery?.length || 0)) {
                colorImages.set(colorFolder, { hero: heroUrl, gallery })
              }
            }

            if (colorFolders.length > 0) {
              console.log(`  ${grade}/${dt}/${fuel}/${trans}: ${colorFolders.length} colors`)
            }
          }
        }
      }
    }
    await sleep(100) // rate limit
  }
}

console.log(`\n=== Found renders for ${colorImages.size} unique colors ===\n`)

// Match AEM color folders to DB colors and update
for (const [colorSlug, images] of colorImages) {
  const dbColors = colorsByName.get(colorSlug)
  if (!dbColors) {
    // Try partial match
    let matched = false
    for (const [key, rows] of colorsByName) {
      if (key.includes(colorSlug) || colorSlug.includes(key)) {
        for (const c of rows) {
          if (c.hero_image_url) continue // already has hero
          const { error } = await supabase
            .from('variant_colors')
            .update({ hero_image_url: images.hero, gallery_urls: images.gallery })
            .eq('id', c.id)
          if (!error) totalUpdated++
        }
        matched = true
        break
      }
    }
    if (!matched) console.log(`  No DB match for AEM color: ${colorSlug}`)
    continue
  }

  for (const c of dbColors) {
    const { error } = await supabase
      .from('variant_colors')
      .update({ hero_image_url: images.hero, gallery_urls: images.gallery })
      .eq('id', c.id)
    if (!error) totalUpdated++
  }
}

// Verify final state
const { data: afterColors } = await supabase
  .from('variant_colors')
  .select('hero_image_url, gallery_urls')
  .in('product_id', productIds)

const withHero = afterColors.filter(c => c.hero_image_url).length
const withGallery = afterColors.filter(c => c.gallery_urls?.length > 0).length

console.log(`\n=== RESULTS ===`)
console.log(`  Colors updated: ${totalUpdated}`)
console.log(`  Hero images: ${withHero}/${afterColors.length} (${(100*withHero/afterColors.length).toFixed(1)}%)`)
console.log(`  Galleries: ${withGallery}/${afterColors.length}`)
console.log(`  AEM color renders found: ${colorImages.size}`)

// Show unmatched colors
const unmatchedDb = colors.filter(c => {
  const slug = normalizeColorSlug(c.color_name)
  return !colorImages.has(slug) && ![...colorImages.keys()].some(k => k.includes(slug) || slug.includes(k))
})
if (unmatchedDb.length) {
  const uniqueNames = [...new Set(unmatchedDb.map(c => c.color_name))].sort()
  console.log(`\n  DB colors without AEM renders (${uniqueNames.length}):`)
  for (const name of uniqueNames) console.log(`    ${name}`)
}
