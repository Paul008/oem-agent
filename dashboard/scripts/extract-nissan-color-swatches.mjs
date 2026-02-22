#!/usr/bin/env node

/**
 * Extract Nissan color data from CDN swatch images in configurator HTML
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
}

async function extractColorSwatches(url, modelName) {
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) return []

    const html = await res.text()

    // Extract all color swatch image URLs
    const swatchPattern = /https?:\/\/[^"'\s]+\/colors\/[^"'\s]+\/thumbs\/([A-Z0-9]+)\.(png|jpg)/gi
    const matches = [...html.matchAll(swatchPattern)]

    const colors = matches.map(m => ({
      code: m[1],
      imageUrl: m[0],
      model: modelName
    }))

    // Dedupe by code
    const unique = []
    const seen = new Set()

    for (const color of colors) {
      if (!seen.has(color.code)) {
        seen.add(color.code)
        unique.push(color)
      }
    }

    return unique

  } catch (err) {
    console.error(`Error fetching ${modelName}:`, err.message)
    return []
  }
}

async function main() {
  console.log('🎨 Extracting Nissan color swatches from configurator pages...\n')

  const models = [
    { name: 'Juke', url: 'https://www.nissan.com.au/vehicles/browse-range/juke/version-explorer/configurator/cfg.shtml/BAFz/AhpD7A/exterior-colour' },
    { name: 'Qashqai', url: 'https://www.nissan.com.au/vehicles/browse-range/qashqai/configurator.html' },
    { name: 'X-Trail', url: 'https://www.nissan.com.au/vehicles/browse-range/x-trail/build.html' },
    { name: 'Pathfinder', url: 'https://www.nissan.com.au/vehicles/browse-range/pathfinder/version-explorer/configurator-v3/cfg.shtml/BAFu/AkLD7A/exterior-colour' },
    { name: 'Navara', url: 'https://www.nissan.com.au/vehicles/browse-range/navara/build.html' },
    { name: 'Ariya', url: 'https://www.nissan.com.au/vehicles/browse-range/ariya/build.html' },
    { name: 'Patrol', url: 'https://www.nissan.com.au/vehicles/browse-range/patrol/build.html' }
  ]

  const allColors = []

  for (const model of models) {
    console.log(`\n📋 ${model.name}...`)
    const colors = await extractColorSwatches(model.url, model.name)

    if (colors.length > 0) {
      console.log(`   ✅ Found ${colors.length} color codes:`)
      colors.forEach(c => {
        console.log(`      ${c.code} - ${c.imageUrl}`)
        allColors.push(c)
      })
    } else {
      console.log(`   ⚠️  No color swatches found`)
    }
  }

  console.log(`\n\n${'='.repeat(70)}`)
  console.log('📊 SUMMARY')
  console.log('='.repeat(70))
  console.log(`Total unique color codes discovered: ${allColors.length}`)

  if (allColors.length > 0) {
    console.log(`\n🎨 Color Codes by Model:`)

    const byModel = {}
    allColors.forEach(c => {
      if (!byModel[c.model]) byModel[c.model] = []
      byModel[c.model].push(c.code)
    })

    Object.entries(byModel).forEach(([model, codes]) => {
      console.log(`\n   ${model}: ${codes.join(', ')}`)
    })

    console.log(`\n💡 Next Steps:`)
    console.log(`   1. Map color codes to color names (manual lookup or API)`)
    console.log(`   2. Download swatch images for each color`)
    console.log(`   3. Extract hex color values from swatches`)
    console.log(`   4. Match colors to product variants`)
    console.log(`   5. Seed variant_colors table`)
  }
}

main().catch(console.error)
