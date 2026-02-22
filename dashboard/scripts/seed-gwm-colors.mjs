/**
 * Seed GWM AU variant_colors from model page HTML scraping.
 * Colors are in server-rendered HTML:
 *   - Hex codes: button.model-range-select-colour__colour style="background:..., #{hex}"
 *   - Names: div.model-range__caption-colour text content
 *
 * Run: cd dashboard/scripts && node seed-gwm-colors.mjs
 */
import { createClient } from '@supabase/supabase-js'
import https from 'https'
import { JSDOM } from 'jsdom'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'gwm-au'

// Model slug → page URL mapping (discovered by probe)
const MODEL_PAGES = {
  'cannon':        '/au/models/ute/cannon/',
  'cannon-alpha':  '/au/models/ute/cannon-alpha/',
  'tank-300':      '/au/models/suv/tank-300/',
  'tank-500':      '/au/models/suv/tank-500/',
  'haval-h6':      '/au/models/suv/haval-h6/',
  'haval-jolion':  '/au/models/suv/haval-jolion/',
  'haval-h6gt':    '/au/models/suv/haval-h6gt/',
  'haval-h7':      '/au/models/suv/haval-h7/',
  'ora':           '/au/models/hatchback/ora/',
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGet(res.headers.location).then(resolve).catch(reject)
        return
      }
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ data, statusCode: res.statusCode }))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

function extractColors(html) {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  // Each "model-range-select-colour" div groups swatch buttons + caption
  const groups = doc.querySelectorAll('.model-range-select-colour')
  const seenNames = new Set()
  const colors = []

  // Also try individual buttons if no groups
  const buttons = doc.querySelectorAll('button.model-range-select-colour__colour')
  const captions = doc.querySelectorAll('div.model-range__caption-colour')

  // Strategy: pair buttons with captions by index within each group
  // Each group has N buttons (one per color) and 1 caption (showing selected color name)
  // We can also check the text content of other elements

  // Simpler: extract all unique hex codes and all unique color names
  const hexCodes = []
  for (const btn of buttons) {
    const style = btn.getAttribute('style') || ''
    const hexMatch = style.match(/#([0-9a-f]{6})/i)
    if (hexMatch) {
      hexCodes.push('#' + hexMatch[1].toLowerCase())
    }
  }

  const names = []
  for (const cap of captions) {
    const text = cap.textContent?.trim()
    if (text && text.length > 0 && text.length < 50) {
      names.push(text)
    }
  }

  // Dedupe names (captions repeat per variant section)
  const uniqueNames = [...new Set(names)]
  const uniqueHexes = [...new Set(hexCodes)]

  // If we have equal counts, pair them directly
  // Otherwise, pair by index within each group section
  if (uniqueNames.length > 0 && uniqueHexes.length > 0) {
    // Try to pair: each group has buttons and a caption
    // Groups typically show the same set of colors but with different selected state
    // The caption shows the "default selected" color name

    // Better approach: extract per-group
    const groupColors = []
    for (const group of groups) {
      const grpButtons = group.querySelectorAll('button.model-range-select-colour__colour')
      const grpCaption = group.querySelector('.model-range__caption-colour')
      const captionName = grpCaption?.textContent?.trim() || ''

      for (let i = 0; i < grpButtons.length; i++) {
        const style = grpButtons[i].getAttribute('style') || ''
        const hexMatch = style.match(/#([0-9a-f]{6})/i)
        const hex = hexMatch ? '#' + hexMatch[1].toLowerCase() : null
        const isSelected = grpButtons[i].className.includes('--selected')

        // If selected, the caption corresponds to this button
        if (isSelected && captionName && hex && !seenNames.has(captionName)) {
          // We know this hex = this name
          groupColors.push({ name: captionName, hex, selected: true })
          seenNames.add(captionName)
        }

        // Store hex for later
        if (hex && !groupColors.some(c => c.hex === hex)) {
          groupColors.push({ name: null, hex, selected: isSelected })
        }
      }
    }

    // Now we have some named colors (from selected state) and unnamed ones
    // Return what we have — we'll handle the unnamed ones as hex-only
    for (const c of groupColors) {
      if (c.name && !colors.some(x => x.name === c.name)) {
        colors.push({ name: c.name, hex: c.hex })
      }
    }

    // Add unnamed hex-only colors
    for (const c of groupColors) {
      if (!c.name && !colors.some(x => x.hex === c.hex)) {
        colors.push({ name: null, hex: c.hex })
      }
    }
  }

  // Fallback: if no groups matched, just return unique hex codes
  if (colors.length === 0) {
    for (const hex of uniqueHexes) {
      colors.push({ name: null, hex })
    }
  }

  return colors
}

async function seed() {
  console.log('=== GWM AU Variant Colors Seed ===\n')

  // Load existing GWM products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, external_key, model_id, title')
    .eq('oem_id', OEM_ID)
  if (prodErr) { console.error('Product fetch error:', prodErr.message); process.exit(1) }
  console.log(`Found ${products.length} GWM products`)

  // Load vehicle models for slug mapping
  const { data: models, error: modErr } = await supabase
    .from('vehicle_models')
    .select('id, slug, name')
    .eq('oem_id', OEM_ID)
  if (modErr) { console.error('Model fetch error:', modErr.message); process.exit(1) }
  console.log(`Found ${models.length} GWM vehicle models\n`)

  // Build model_id → model slug mapping
  const modelIdToSlug = {}
  for (const m of models) {
    modelIdToSlug[m.id] = m.slug
  }

  // Delete existing GWM variant_colors
  const productIds = products.map(p => p.id)
  if (productIds.length) {
    // Batch delete in chunks of 100 (Supabase limit)
    for (let i = 0; i < productIds.length; i += 100) {
      const batch = productIds.slice(i, i + 100)
      await supabase.from('variant_colors').delete().in('product_id', batch)
    }
    console.log('Deleted old GWM variant_colors\n')
  }

  // Scrape colors from each model page
  const modelColors = {} // model slug → [{ name, hex }]
  let totalScraped = 0

  for (const [slug, path] of Object.entries(MODEL_PAGES)) {
    const url = `https://www.gwmanz.com${path}`
    try {
      const { data: html, statusCode } = await httpsGet(url)
      if (statusCode !== 200) {
        console.log(`  ${slug}: HTTP ${statusCode}`)
        continue
      }

      const colors = extractColors(html)
      modelColors[slug] = colors
      totalScraped += colors.length
      console.log(`  ${slug}: ${colors.length} colors — ${colors.map(c => c.name || c.hex).join(', ')}`)
    } catch (err) {
      console.log(`  ${slug}: ERROR ${err.message}`)
    }
  }

  console.log(`\nTotal scraped: ${totalScraped} color entries across ${Object.keys(modelColors).length} models`)

  // Match model slugs to DB models and create variant_colors
  const colorRows = []
  let matched = 0, unmatched = 0

  for (const product of products) {
    // Find the model slug for this product
    const modelSlug = product.model_id ? modelIdToSlug[product.model_id] : null
    if (!modelSlug) { unmatched++; continue }

    // Normalize model slug to match our MODEL_PAGES keys
    // DB slugs may include year like "cannon-2025", strip that
    const baseSlug = modelSlug.replace(/-\d{4}$/, '')

    const colors = modelColors[baseSlug]
    if (!colors || colors.length === 0) { unmatched++; continue }

    matched++
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i]
      const colorName = c.name || `Color ${c.hex}`
      const colorCode = c.name
        ? c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        : c.hex.replace('#', 'hex-')

      colorRows.push({
        product_id: product.id,
        color_name: colorName,
        color_code: colorCode,
        color_type: null, // Not available from HTML
        is_standard: true,
        price_delta: 0,
        swatch_url: null, // CSS-rendered, no image
        hero_image_url: null,
        gallery_urls: null,
        sort_order: i,
      })
    }
  }

  console.log(`\nMatched ${matched} products, ${unmatched} unmatched`)
  console.log(`Inserting ${colorRows.length} variant_colors...`)

  // Insert in batches
  let inserted = 0
  for (let i = 0; i < colorRows.length; i += 500) {
    const batch = colorRows.slice(i, i + 500)
    const { data, error } = await supabase
      .from('variant_colors')
      .insert(batch)
      .select('id')
    if (error) {
      console.error(`Batch ${i / 500 + 1} error:`, error.message)
      console.error('Sample row:', JSON.stringify(batch[0], null, 2))
    } else {
      inserted += data.length
    }
  }

  console.log(`Inserted ${inserted} variant_colors`)

  // Summary
  console.log('\n=== GWM COLORS SEED COMPLETE ===')
  const byModel = {}
  for (const [slug, colors] of Object.entries(modelColors)) {
    byModel[slug] = colors.length
  }
  for (const [slug, count] of Object.entries(byModel)) {
    console.log(`  ${slug.padEnd(20)} ${count} unique colors`)
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${inserted} variant_colors inserted`)
}

seed().catch(err => { console.error(err); process.exit(1) })
