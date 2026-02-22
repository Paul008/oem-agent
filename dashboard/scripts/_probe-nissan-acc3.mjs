#!/usr/bin/env node
// Extract Nissan accessories from server-rendered HTML
// Elements: .accessory-name, .accessory-price, .accessory-part-number, .accessory-picture

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html',
}

const MODELS = [
  { name: 'Navara', slug: 'navara' },
  { name: 'X-Trail', slug: 'x-trail' },
  { name: 'Qashqai', slug: 'qashqai' },
  { name: 'Pathfinder', slug: 'pathfinder' },
  { name: 'Patrol', slug: 'patrol' },
  { name: 'Juke', slug: 'juke' },
  { name: 'Ariya', slug: 'ariya' },
]

const allAccessories = new Map()
const modelResults = []

for (const model of MODELS) {
  const url = `https://www.nissan.com.au/vehicles/browse-range/${model.slug}/accessories.html`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) { console.log(`  ${model.name}: ${res.status}`); continue }

  const html = await res.text()

  // Extract individual accessories
  // Pattern: <div class="accessory"> ... <span class="accessory-name">NAME</span> ... <span class="accessory-part-number">PART#</span> ... <span class="accessory-price">PRICE</span> ...
  const accessories = []

  // Find all accessory blocks
  const accBlockPattern = /<div[^>]*class="[^"]*\baccessory\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*\baccessory\b[^"]*"|<\/section|$)/g
  const blocks = [...html.matchAll(accBlockPattern)]

  for (const block of blocks) {
    const content = block[1]

    const nameMatch = content.match(/class="[^"]*accessory-name[^"]*"[^>]*>([\s\S]*?)<\//)
    const partMatch = content.match(/class="[^"]*accessory-part-number[^"]*"[^>]*>([\s\S]*?)<\//)
    const priceMatch = content.match(/class="[^"]*accessory-price[^"]*"[^>]*>([\s\S]*?)<\//)
    const imgMatch = content.match(/data-src="([^"]*)"/) || content.match(/src="([^"]*accessori[^"]*)"/)
    const descMatch = content.match(/class="[^"]*accessory-description[^"]*"[^>]*>([\s\S]*?)<\//)

    const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : null
    const partNumber = partMatch ? partMatch[1].replace(/<[^>]+>/g, '').trim() : null
    const priceText = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').trim() : null
    const image = imgMatch ? imgMatch[1] : null
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : null

    if (name && priceText) {
      // Parse price: "Fitted RRP: $101" or "$101" or "Fitted RRP: $3,891"
      const priceNum = parseFloat(priceText.replace(/[^0-9.]/g, ''))
      const isFitted = priceText.toLowerCase().includes('fitted')

      accessories.push({ name, partNumber, price: priceNum, isFitted, image, description })

      const key = partNumber || name
      if (!allAccessories.has(key)) {
        allAccessories.set(key, {
          name, partNumber, price: priceNum, isFitted, image, description,
          modelSlugs: new Set([model.slug])
        })
      } else {
        allAccessories.get(key).modelSlugs.add(model.slug)
      }
    }
  }

  // Also extract style packs
  const packPattern = /<div[^>]*class="[^"]*style-pack[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*style-pack\b|<\/section|$)/g
  const packs = [...html.matchAll(packPattern)]
  for (const pack of packs) {
    const content = pack[1]
    const nameMatch = content.match(/class="[^"]*style-pack-name[^"]*"[^>]*>([\s\S]*?)<\//)
    const priceMatch = content.match(/class="[^"]*style-pack-price[^"]*"[^>]*>([\s\S]*?)<\//)
    const descMatch = content.match(/class="[^"]*style-pack-description[^"]*"[^>]*>([\s\S]*?)<\//)
    const imgMatch = content.match(/data-src="([^"]*)"/)

    const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : null
    const priceText = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').trim() : null
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : null
    const image = imgMatch ? imgMatch[1] : null

    if (name && priceText) {
      const priceNum = parseFloat(priceText.replace(/[^0-9.]/g, ''))
      accessories.push({ name, partNumber: null, price: priceNum, isFitted: false, image, description, isPack: true })

      const key = `pack-${name}-${model.slug}`
      if (!allAccessories.has(key)) {
        allAccessories.set(key, {
          name, partNumber: null, price: priceNum, isFitted: false, image, description,
          isPack: true, modelSlugs: new Set([model.slug])
        })
      }
    }
  }

  console.log(`  ${model.name}: ${accessories.length} accessories (${blocks.length} blocks, ${packs.length} packs)`)
  modelResults.push({ model: model.name, count: accessories.length })
}

console.log(`\n=== Summary ===`)
console.log(`Models with data: ${modelResults.length}`)
console.log(`Unique accessories: ${allAccessories.size}`)

const prices = [...allAccessories.values()].map(a => a.price).filter(p => p > 0)
if (prices.length > 0) {
  console.log(`Price range: $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)
}

// Categories (from name patterns)
const categories = new Set()
for (const [, acc] of allAccessories) {
  if (acc.isPack) categories.add('Packs')
}
console.log(`Categories: ${[...categories].join(', ') || 'n/a (no category field in HTML)'}`)

// Sample
const sample = [...allAccessories.values()][0]
if (sample) {
  const { modelSlugs, ...rest } = sample
  console.log('\nSample:', JSON.stringify(rest, null, 2))
}

// Show per-model counts
console.log('\nPer model:')
for (const r of modelResults) {
  console.log(`  ${r.model}: ${r.count}`)
}
