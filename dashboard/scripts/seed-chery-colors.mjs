#!/usr/bin/env node
/**
 * Seed Chery AU variant_colors from model page data-json attributes.
 * Each color has: name, car_image (hero render), colour_image (swatch).
 *
 * Run: node dashboard/scripts/seed-chery-colors.mjs
 */
import { createClient } from '@supabase/supabase-js'
import https from 'https'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'chery-au'
const BASE = 'https://cherymotor.com.au'

const MODEL_SLUGS = [
  'tiggo-4', 'tiggo-4-hybrid', 'tiggo-7', 'tiggo-7-super-hybrid',
  'tiggo-8-pro-max', 'tiggo-8-super-hybrid', 'tiggo-9-super-hybrid',
  'chery-c5', 'chery-e5', 'omoda-5', 'omoda-5-gt', 'omoda-e5', 'omoda-e5-ryi',
]

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' } }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(d))
    }).on('error', reject)
  })
}

function decodeEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#039;/g, "'")
}

function slugify(s) {
  return s.toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function deriveType(name) {
  const l = name.toLowerCase()
  if (l.includes('pearl')) return 'pearl'
  if (l.includes('metallic')) return 'metallic'
  return 'solid'
}

console.log('=== Chery AU Color Seed ===\n')

// Load products
const { data: products } = await supabase
  .from('products').select('id, title, model_id').eq('oem_id', OEM_ID)
const { data: models } = await supabase
  .from('vehicle_models').select('id, slug, name').eq('oem_id', OEM_ID)

const modelById = Object.fromEntries(models.map(m => [m.id, m]))
console.log(`${products.length} products, ${models.length} models\n`)

let totalColors = 0

for (const slug of MODEL_SLUGS) {
  const url = `${BASE}/models/${slug}`
  let html
  try {
    html = await fetchPage(url)
  } catch (e) {
    console.log(`ERR ${slug}: ${e.message}`)
    continue
  }

  // Extract all data-json color entries (attributes use &quot; for quotes)
  const colors = []
  let searchIdx = 0
  while (true) {
    const attrIdx = html.indexOf('data-json="', searchIdx)
    if (attrIdx < 0) break
    const start = attrIdx + 'data-json="'.length
    const end = html.indexOf('"', start)
    if (end < 0) break
    searchIdx = end + 1
    try {
      const raw = html.slice(start, end)
      const decoded = decodeEntities(raw)
      const json = JSON.parse(decoded)
      if (json.name && (json.car_image || json.colour_image)) {
        colors.push(json)
      }
    } catch { /* skip non-color data-json */ }
  }

  if (colors.length === 0) {
    console.log(`${slug}: no colors found`)
    continue
  }

  // Find all products for this model
  const model = models.find(mm => mm.slug === slug)
  if (!model) { console.log(`${slug}: no model in DB`); continue }
  const modelProducts = products.filter(p => p.model_id === model.id)
  if (!modelProducts.length) { console.log(`${slug}: no products in DB`); continue }

  // Upsert colors for each product of this model
  for (const product of modelProducts) {
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i]
      const name = c.name.replace(/\*$/, '').trim()
      const isPremium = c.name.includes('*')
      const heroUrl = c.car_image?.url ? BASE + c.car_image.url : null
      const swatchUrl = c.colour_image?.url ? BASE + c.colour_image.url : null

      const { error } = await supabase.from('variant_colors').upsert({
        product_id: product.id,
        color_code: slugify(name),
        color_name: name,
        color_type: deriveType(name),
        is_standard: !isPremium,
        swatch_url: swatchUrl,
        hero_image_url: heroUrl,
        sort_order: i,
      }, { onConflict: 'product_id,color_code' })

      if (!error) totalColors++
    }
  }

  console.log(`${slug}: ${colors.length} colors × ${modelProducts.length} products`)
}

console.log(`\n=== COMPLETE: ${totalColors} color rows inserted ===`)
