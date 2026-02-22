/**
 * Seed GWM AU accessories from Storyblok CDN API.
 *
 * Each model has accessories at car-configurator/models/{model}/accessories/**
 * Each accessory has: code, name, price, description, image, categories
 *
 * Run: cd dashboard/scripts && node seed-gwm-accessories.mjs
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

// Storyblok model slugs → DB model slugs
const SB_TO_DB = {
  'cannon': 'cannon',
  'cannon-alpha': 'cannon', // cannon-alpha not in DB, group under cannon
  'tank-300': 'tank-300',
  'tank-500': 'tank-500',
  'haval-h6': 'haval-h6',
  'haval-jolion': 'haval-jolion',
  'haval-h6gt': 'haval-h6', // h6gt not in DB, group under h6
  'haval-h7': 'haval-h7',
  'ora': 'ora',
}

async function fetchSB(slugPattern, page = 1) {
  const url = `${BASE}?cv=${CV}&by_slugs=${slugPattern}&language=au&per_page=100&page=${page}&token=${TOKEN}&version=published`
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) return null
  return r.json()
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function main() {
  console.log('=== GWM AU Accessories Seed (Storyblok) ===\n')

  // Load DB models
  const { data: models } = await supabase
    .from('vehicle_models').select('id, slug, name').eq('oem_id', OEM_ID)
  const modelBySlug = Object.fromEntries(models.map(m => [m.slug, m]))
  console.log(`DB models: ${models.length}`)

  // Fetch accessories from all Storyblok models
  const accMap = new Map() // external_key → { acc data, modelIds }
  const SB_MODELS = Object.keys(SB_TO_DB)

  for (const sbModel of SB_MODELS) {
    // Paginate
    let allStories = []
    for (let page = 1; page <= 5; page++) {
      const d = await fetchSB(`car-configurator/models/${sbModel}/accessories/**`, page)
      if (!d || !d.stories.length) break
      allStories = allStories.concat(d.stories)
      if (d.stories.length < 100) break
    }

    const dbSlug = SB_TO_DB[sbModel]
    const dbModel = modelBySlug[dbSlug]

    for (const s of allStories) {
      const c = s.content
      const code = c.code || s.slug.toUpperCase()
      const extKey = `gwm-au-${code}`

      if (!accMap.has(extKey)) {
        // Determine category from path
        const pathParts = s.full_slug.split('/')
        const catIdx = pathParts.indexOf('accessories')
        const category = catIdx >= 0 && pathParts[catIdx + 1] !== s.slug
          ? pathParts[catIdx + 1]
          : 'general'

        accMap.set(extKey, {
          oem_id: OEM_ID,
          external_key: extKey,
          name: c.name || s.name,
          slug: slugify(c.name || s.name),
          description_html: typeof c.description === 'string' ? c.description : '',
          part_number: code,
          price: c.price ? parseFloat(c.price) : null,
          category: category.charAt(0).toUpperCase() + category.slice(1),
          image_url: c.image?.filename || null,
          meta_json: {
            storyblok_slug: s.full_slug,
            grades: s.name.replace(code, '').replace(/[()]/g, '').trim(),
          },
          modelIds: new Set(),
        })
      }

      if (dbModel) {
        accMap.get(extKey).modelIds.add(dbModel.id)
      }
    }

    console.log(`  ${sbModel} → ${dbSlug}: ${allStories.length} accessories`)
  }

  console.log(`\nUnique accessories: ${accMap.size}`)

  // Upsert accessories
  const accRows = []
  const joinRows = []

  for (const [extKey, acc] of accMap) {
    const { modelIds, ...row } = acc
    row.modelIds = undefined
    accRows.push(row)
  }

  // Delete old GWM accessories and insert new
  const { error: delErr } = await supabase.from('accessory_models').delete().eq('accessory_id',
    // Need to get accessory IDs first
    'dummy') // Can't do this simply, let's use a different approach

  // Upsert accessories
  const { data: upserted, error: upsertErr } = await supabase
    .from('accessories')
    .upsert(accRows.map(r => {
      const { modelIds, ...rest } = r
      return rest
    }), { onConflict: 'oem_id,external_key' })
    .select('id, external_key')

  if (upsertErr) {
    console.error('Upsert error:', upsertErr.message)
    return
  }
  console.log(`Upserted ${upserted.length} accessories`)

  // Build join rows
  const extKeyToId = Object.fromEntries(upserted.map(a => [a.external_key, a.id]))

  for (const [extKey, acc] of accMap) {
    const accId = extKeyToId[extKey]
    if (!accId) continue
    for (const modelId of acc.modelIds) {
      joinRows.push({ accessory_id: accId, model_id: modelId })
    }
  }

  // Delete old join rows for GWM accessories
  const accIds = upserted.map(a => a.id)
  for (let i = 0; i < accIds.length; i += 100) {
    const batch = accIds.slice(i, i + 100)
    await supabase.from('accessory_models').delete().in('accessory_id', batch)
  }

  // Insert new join rows
  if (joinRows.length > 0) {
    for (let i = 0; i < joinRows.length; i += 500) {
      const batch = joinRows.slice(i, i + 500)
      const { error } = await supabase.from('accessory_models').insert(batch)
      if (error) console.error('Join insert error:', error.message)
    }
  }

  console.log(`Inserted ${joinRows.length} accessory_models joins`)

  // Price stats
  const prices = accRows.filter(r => r.price).map(r => r.price)
  if (prices.length) {
    console.log(`\nPrices: $${Math.min(...prices).toFixed(2)} – $${Math.max(...prices).toFixed(2)}`)
  }

  console.log('\n=== DONE ===')
}

main().catch(err => { console.error(err); process.exit(1) })
