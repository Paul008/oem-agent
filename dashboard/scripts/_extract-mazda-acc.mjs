#!/usr/bin/env node
// Extract Mazda accessories from React hydration props (Koala.App)
// Data is embedded as: ReactDOM.hydrate(React.createElement(Koala.App, {props...}))

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
}

const MODELS = [
  { slug: 'mazda2', url: 'https://www.mazda.com.au/accessories/find-accessories/mazda2/' },
  { slug: 'mazda3', url: 'https://www.mazda.com.au/accessories/find-accessories/mazda3/' },
  { slug: 'cx-3', url: 'https://www.mazda.com.au/accessories/find-accessories/cx-3/' },
  { slug: 'cx-5', url: 'https://www.mazda.com.au/accessories/find-accessories/cx-5/' },
  { slug: 'cx-8', url: 'https://www.mazda.com.au/accessories/find-accessories/cx-8/' },
  { slug: 'cx-60', url: 'https://www.mazda.com.au/accessories/find-accessories/cx-60/' },
  { slug: 'cx-70', url: 'https://www.mazda.com.au/accessories/find-accessories/cx-70/' },
  { slug: 'cx-80', url: 'https://www.mazda.com.au/accessories/find-accessories/cx-80/' },
  { slug: 'cx-90', url: 'https://www.mazda.com.au/accessories/find-accessories/cx-90/' },
  { slug: 'mx-5', url: 'https://www.mazda.com.au/accessories/find-accessories/mx-5/' },
  { slug: 'bt-50', url: 'https://www.mazda.com.au/accessories/find-accessories/bt-50/' },
  { slug: 'mx-30', url: 'https://www.mazda.com.au/accessories/find-accessories/mx-30/' },
]

let totalAccessories = 0
const allCategories = new Set()
const allPartNumbers = new Set()
const modelData = []
let sampleItem = null

for (const model of MODELS) {
  const res = await fetch(model.url, { headers: HEADERS })
  if (!res.ok) { console.log(`❌ ${model.slug}: ${res.status}`); continue }

  const html = await res.text()

  // Strategy 1: Extract from Koala.App React hydration props
  // Pattern: ReactDOM.hydrate(React.createElement(Koala.App, {JSON_PROPS}), ...)
  let accessories = null

  // Find the accessories array in the hydration JSON
  // The JSON is huge — use a targeted approach to find "accessories":[ blocks
  const accArrayPattern = /"accessories"\s*:\s*\[/g
  let match
  while ((match = accArrayPattern.exec(html)) !== null) {
    const startIdx = match.index + match[0].length - 1 // at the [
    // Find matching ] by counting brackets
    let depth = 1
    let i = startIdx + 1
    const maxLen = Math.min(startIdx + 500000, html.length)
    while (depth > 0 && i < maxLen) {
      if (html[i] === '[') depth++
      else if (html[i] === ']') depth--
      i++
    }
    if (depth === 0) {
      const jsonStr = html.substring(startIdx, i)
      try {
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) {
          accessories = parsed
          break
        }
      } catch {
        // Try with relaxed parsing — sometimes has trailing content
      }
    }
  }

  // Strategy 2: Extract individual accessory objects via regex
  if (!accessories) {
    const itemPattern = /\{"name":"([^"]+)","partNumber":"([^"]+)","priceText":"([^"]+)","category":"([^"]+)"/g
    const items = []
    let m
    while ((m = itemPattern.exec(html)) !== null) {
      items.push({ name: m[1], partNumber: m[2], priceText: m[3], category: m[4] })
    }
    if (items.length > 0) accessories = items
  }

  // Strategy 3: Broader regex for accessory-like objects
  if (!accessories) {
    const broadPattern = /\{"name":"([^"]{3,60})","(?:partNumber|sku)":"([^"]+)"[^}]*?"(?:priceText|price)":"?([^",}]+)"?[^}]*?"category":"([^"]+)"/g
    const items = []
    let m
    while ((m = broadPattern.exec(html)) !== null) {
      items.push({ name: m[1], partNumber: m[2], priceText: m[3], category: m[4] })
    }
    if (items.length > 0) accessories = items
  }

  if (accessories && accessories.length > 0) {
    console.log(`✅ ${model.slug}: ${accessories.length} accessories`)
    modelData.push({ slug: model.slug, count: accessories.length, items: accessories })
    totalAccessories += accessories.length

    if (!sampleItem) sampleItem = accessories[0]

    for (const acc of accessories) {
      if (acc.partNumber) allPartNumbers.add(acc.partNumber)
      if (acc.category) allCategories.add(acc.category)
    }
  } else {
    // Debug: show what patterns exist
    const accMentions = (html.match(/"accessories"/g) || []).length
    const partNums = (html.match(/"partNumber"/g) || []).length
    const priceTexts = (html.match(/"priceText"/g) || []).length
    console.log(`🔍 ${model.slug}: "accessories" x${accMentions}, "partNumber" x${partNums}, "priceText" x${priceTexts} [${html.length} bytes]`)

    // Show a snippet around first "partNumber" occurrence
    if (partNums > 0) {
      const idx = html.indexOf('"partNumber"')
      const snippet = html.substring(Math.max(0, idx - 100), idx + 200)
      console.log(`   Snippet: ...${snippet.replace(/\n/g, '').substring(0, 250)}...`)
    }
  }
}

console.log('\n=== Summary ===')
console.log(`Total accessories: ${totalAccessories}`)
console.log(`Unique part numbers: ${allPartNumbers.size}`)
console.log(`Categories: ${[...allCategories].join(', ')}`)
console.log(`Models with data:`, modelData.map(m => `${m.slug}(${m.count})`).join(', '))

if (sampleItem) {
  console.log('\nSample item:')
  console.log(JSON.stringify(sampleItem, null, 2).substring(0, 1500))
}

// Show all keys from sample
if (sampleItem) {
  console.log('\nAll keys:', Object.keys(sampleItem).join(', '))
}
