#!/usr/bin/env node
/**
 * Seed Chery Australia accessories from per-model accessory pages.
 * Pages: cherymotor.com.au/{model}-accessories
 * Structure: Drupal HTML with accessory cards containing name, price, image, category.
 *
 * Run: node dashboard/scripts/seed-chery-accessories.mjs
 */
import { createClient } from '@supabase/supabase-js'
import https from 'https'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'chery-au'
const BASE = 'https://cherymotor.com.au'

// Model slug → accessory page URL slug
const ACCESSORY_PAGES = [
  { modelSlug: 'tiggo-4', pageSlug: 'tiggo-4-accessories' },
  { modelSlug: 'tiggo-4-hybrid', pageSlug: 'tiggo-4-hybrid-accessories' },
  { modelSlug: 'tiggo-7', pageSlug: 'tiggo-7-accessories' },
  { modelSlug: 'tiggo-7-super-hybrid', pageSlug: 'tiggo-7-csh-accessories' },
  { modelSlug: 'tiggo-8-pro-max', pageSlug: 'tiggo-8-pro-max-accessories' },
  { modelSlug: 'tiggo-8-super-hybrid', pageSlug: 'tiggo-8-csh-accessories' },
  { modelSlug: 'tiggo-9-super-hybrid', pageSlug: 'tiggo-9-csh-accessories' },
  { modelSlug: 'chery-c5', pageSlug: 'chery-c5-accessories' },
  { modelSlug: 'chery-e5', pageSlug: 'chery-e5-accessories' },
]

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : BASE + res.headers.location
        return fetchPage(loc).then(resolve, reject)
      }
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(d))
    })
    req.on('error', reject)
  })
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
}

/**
 * Parse accessories from Chery Drupal HTML.
 * Structure: div.views-row containing accessory cards with:
 *   - h3 or title for name
 *   - price text (e.g. "$199.05 + fitment")
 *   - img for image
 *   - category heading (Interior, Exterior, Merchandise, Towing)
 */
function parseAccessories(html) {
  const accessories = []
  let currentCategory = 'General'

  // Find category sections and accessory items
  // Categories are typically h2/h3 headings before groups of items
  const categoryRe = /<h[23][^>]*>([^<]*(?:Interior|Exterior|Merchandise|Protection|Towing|Carrying|Styling|Technology|Safety|Storage)[^<]*)<\/h[23]>/gi
  const categoryPositions = []
  let cm
  while ((cm = categoryRe.exec(html)) !== null) {
    categoryPositions.push({ name: decodeEntities(cm[1]).trim(), index: cm.index })
  }

  // Find all accessory cards — look for price patterns + item names
  // Pattern: card/item div with a title and a price like $XX.XX
  const itemRe = /<(?:div|article)[^>]*class="[^"]*(?:views-row|field--name|acc|product|item)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi

  // Simpler approach: find all price occurrences and extract surrounding context
  const priceRe = /\$(\d{1,4}(?:\.\d{2})?)\s*(?:\+\s*fitment|\+ fitment|inc\. GST)?/g
  let pm
  while ((pm = priceRe.exec(html)) !== null) {
    const price = parseFloat(pm[1])
    if (price < 5 || price > 5000) continue // skip vehicle prices and tiny amounts

    // Look backwards for a heading/title (within 500 chars)
    const before = html.slice(Math.max(0, pm.index - 500), pm.index)

    // Find the nearest title/heading
    const titleMatches = [...before.matchAll(/<(?:h[234]|strong|b|span[^>]*class="[^"]*title)[^>]*>([^<]+)<\//g)]
    if (titleMatches.length === 0) continue

    const title = decodeEntities(titleMatches[titleMatches.length - 1][1]).trim()
    if (!title || title.length < 3 || title.length > 100) continue
    // Skip headings that are categories
    if (/^(Interior|Exterior|Merchandise|Towing|Protection|Accessories)$/i.test(title)) continue

    // Find nearest image
    const imgBefore = html.slice(Math.max(0, pm.index - 1000), pm.index + 200)
    const imgMatch = imgBefore.match(/src="([^"]*\/files\/[^"]*\.(jpg|png|webp)[^"]*)"/i)
    const imageUrl = imgMatch ? (imgMatch[1].startsWith('http') ? imgMatch[1] : BASE + imgMatch[1]).split('?')[0] : null

    // Determine category from nearest preceding category heading
    let category = 'General'
    for (const cp of categoryPositions) {
      if (cp.index < pm.index) category = cp.name
    }
    // Clean up category
    category = category.replace(/accessories/i, '').trim()
    if (!category) category = 'General'

    // Check for fitment
    const hasFitment = pm[0].includes('fitment')

    accessories.push({
      name: title,
      price,
      category,
      image_url: imageUrl,
      has_fitment: hasFitment,
    })
  }

  // Deduplicate by name
  const seen = new Set()
  return accessories.filter(a => {
    if (seen.has(a.name)) return false
    seen.add(a.name)
    return true
  })
}

async function seed() {
  console.log('=== Chery Australia Accessories Seed ===\n')

  // Load vehicle models
  const { data: models } = await supabase
    .from('vehicle_models').select('id, slug, name').eq('oem_id', OEM_ID)
  const modelMap = Object.fromEntries(models.map(m => [m.slug, m]))
  console.log(`${models.length} vehicle models loaded\n`)

  // Delete old accessories
  const { data: oldAcc } = await supabase
    .from('accessories').select('id').eq('oem_id', OEM_ID)
  if (oldAcc?.length) {
    const ids = oldAcc.map(a => a.id)
    for (let i = 0; i < ids.length; i += 50) {
      await supabase.from('accessory_models').delete().in('accessory_id', ids.slice(i, i + 50))
    }
    await supabase.from('accessories').delete().eq('oem_id', OEM_ID)
    console.log(`Deleted ${oldAcc.length} old accessories\n`)
  }

  let totalAccessories = 0
  let totalJoins = 0

  for (const page of ACCESSORY_PAGES) {
    const model = modelMap[page.modelSlug]
    if (!model) { console.log(`SKIP: no model for ${page.modelSlug}`); continue }

    const url = `${BASE}/${page.pageSlug}`
    let html
    try {
      html = await fetchPage(url)
    } catch (e) {
      console.log(`ERR ${page.pageSlug}: ${e.message}`)
      continue
    }

    const accessories = parseAccessories(html)
    if (accessories.length === 0) {
      console.log(`${page.modelSlug}: 0 accessories found`)
      continue
    }

    // Insert accessories
    for (const acc of accessories) {
      const externalKey = `${OEM_ID}-${page.modelSlug}-${slugify(acc.name)}`

      const { data: inserted, error } = await supabase
        .from('accessories')
        .upsert({
          oem_id: OEM_ID,
          external_key: externalKey,
          slug: slugify(acc.name),
          name: acc.name,
          price: acc.price,
          category: acc.category,
          image_url: acc.image_url,
        }, { onConflict: 'oem_id,external_key' })
        .select('id')
        .single()

      if (error) { console.log(`  ERR ${acc.name}: ${error.message}`); continue }
      totalAccessories++

      // Create accessory_model join
      const { error: joinErr } = await supabase
        .from('accessory_models')
        .upsert({
          accessory_id: inserted.id,
          model_id: model.id,
        }, { ignoreDuplicates: true })

      if (!joinErr) totalJoins++
    }

    console.log(`${page.modelSlug}: ${accessories.length} accessories`)
  }

  console.log(`\n=== COMPLETE ===`)
  console.log(`Accessories: ${totalAccessories}`)
  console.log(`Model joins: ${totalJoins}`)
}

seed().catch(err => { console.error(err); process.exit(1) })
