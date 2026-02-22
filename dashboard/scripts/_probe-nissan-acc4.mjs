#!/usr/bin/env node
// Extract Nissan accessories from HTML — improved extraction

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

for (const model of MODELS) {
  const url = `https://www.nissan.com.au/vehicles/browse-range/${model.slug}/accessories.html`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) { console.log(`  ${model.name}: ${res.status}`); continue }
  const html = await res.text()

  // Debug: check what classes exist
  const accClasses = [...html.matchAll(/class="([^"]*(?:accessor|pack|product)[^"]*)"/gi)]
  const uniqueClasses = [...new Set(accClasses.map(m => m[1]))]

  // Strategy 1: Extract from accessory-name/accessory-price pairs
  // Find all accessory-name elements and then look nearby for price/part-number
  const nameMatches = [...html.matchAll(/class="[^"]*accessory-name[^"]*"[^>]*>([\s\S]*?)<\//g)]
  const partMatches = [...html.matchAll(/class="[^"]*accessory-part-number[^"]*"[^>]*>([\s\S]*?)<\//g)]
  const priceMatches = [...html.matchAll(/class="[^"]*accessory-price[^"]*"[^>]*>([\s\S]*?)<\//g)]

  // Strategy 2: Find accessory sections by looking for the card structure
  // Some pages might use different class naming
  const nameMatches2 = [...html.matchAll(/class="[^"]*(?:item-name|product-name|acc-name)[^"]*"[^>]*>([\s\S]*?)<\//g)]
  const priceMatches2 = [...html.matchAll(/class="[^"]*(?:item-price|product-price|acc-price)[^"]*"[^>]*>([\s\S]*?)<\//g)]

  // Strategy 3: Look for img + text patterns in accessory sections
  const accSectionPattern = /class="[^"]*\baccessory\b[^"]*"[\s\S]*?(?=class="[^"]*\baccessory\b[^"]*"|<\/section|<\/div>\s*<\/div>\s*<\/div>\s*<\/section)/g
  const sections = [...html.matchAll(accSectionPattern)]

  // Strategy 4: Extract individual accessory items by looking at the HTML structure more carefully
  // Pattern: the accessory element wraps name, part-number, price, description, image
  const itemPattern = /(<(?:div|li|article)[^>]*class="[^"]*\baccessory\b[^"]*"[^>]*>)([\s\S]*?)(<\/(?:div|li|article)>)/g

  // Use the name/price parallel arrays approach
  const accessories = []
  const minLen = Math.min(nameMatches.length, priceMatches.length)
  for (let i = 0; i < minLen; i++) {
    const name = nameMatches[i][1].replace(/<[^>]+>/g, '').trim()
    const priceText = priceMatches[i][1].replace(/<[^>]+>/g, '').trim()
    const partNumber = partMatches[i] ? partMatches[i][1].replace(/<[^>]+>/g, '').trim() : null

    // Parse price - handle "Fitted RRP: $101" and "$101"
    const priceClean = priceText.replace(/.*\$/s, '').replace(/[^\d.]/g, '')
    const price = parseFloat(priceClean)
    const isFitted = priceText.toLowerCase().includes('fitted')

    if (name && price > 0 && price < 100000) {
      accessories.push({ name, partNumber, price, isFitted })

      const key = partNumber || name
      if (!allAccessories.has(key)) {
        allAccessories.set(key, {
          name, partNumber: partNumber ? partNumber.replace(/^Part number:\s*/i, '') : null,
          price, isFitted, modelSlugs: new Set([model.slug])
        })
      } else {
        allAccessories.get(key).modelSlugs.add(model.slug)
      }
    }
  }

  // Style packs
  const packNameMatches = [...html.matchAll(/class="[^"]*style-pack-name[^"]*"[^>]*>([\s\S]*?)<\//g)]
  const packPriceMatches = [...html.matchAll(/class="[^"]*style-pack-price[^"]*"[^>]*>([\s\S]*?)<\//g)]
  const packDescMatches = [...html.matchAll(/class="[^"]*style-pack-description[^"]*"[^>]*>([\s\S]*?)<\//g)]

  const packCount = Math.min(packNameMatches.length, packPriceMatches.length)
  for (let i = 0; i < packCount; i++) {
    const name = packNameMatches[i][1].replace(/<[^>]+>/g, '').trim()
    const priceText = packPriceMatches[i][1].replace(/<[^>]+>/g, '').trim()
    const desc = packDescMatches[i] ? packDescMatches[i][1].replace(/<[^>]+>/g, '').trim() : null

    const priceClean = priceText.replace(/.*\$/s, '').replace(/[^\d.]/g, '')
    const price = parseFloat(priceClean)

    if (name && price > 0 && price < 100000) {
      accessories.push({ name, price, isPack: true })
      const key = `pack-${name}-${model.slug}`
      if (!allAccessories.has(key)) {
        allAccessories.set(key, {
          name, partNumber: null, price, isFitted: false, isPack: true,
          description: desc, modelSlugs: new Set([model.slug])
        })
      }
    }
  }

  console.log(`  ${model.name}: ${accessories.length} items (${nameMatches.length} names, ${priceMatches.length} prices, ${packCount} packs)`)
  if (accessories.length === 0 && uniqueClasses.length > 0) {
    console.log(`    Classes found: ${uniqueClasses.slice(0, 5).join(', ')}`)
    // Check for alternative name patterns
    const altNames = [...html.matchAll(/class="([^"]*name[^"]*)"/gi)].slice(0, 10)
    console.log(`    Name-like classes: ${altNames.map(m => m[1]).join(', ')}`)
    const altPrices = [...html.matchAll(/class="([^"]*price[^"]*)"/gi)].slice(0, 10)
    console.log(`    Price-like classes: ${altPrices.map(m => m[1]).join(', ')}`)
  }
}

console.log(`\n=== Summary ===`)
console.log(`Unique accessories: ${allAccessories.size}`)
const prices = [...allAccessories.values()].map(a => a.price).filter(p => p > 0)
if (prices.length > 0) {
  console.log(`Price range: $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)
}

// Sample
const samples = [...allAccessories.values()].slice(0, 3)
for (const s of samples) {
  const { modelSlugs, ...rest } = s
  console.log(`\n  ${rest.name}: $${rest.price} (models: ${[...modelSlugs].join(',')})`)
}
