#!/usr/bin/env node
// Parse VW e-catalogue Nuxt payload for accessory data

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'application/json',
}

// 1. Fetch the root payload
console.log('=== Fetching root _payload.json ===')
const res = await fetch('https://volkswagen-genuine-accessories.com/_payload.json', { headers: HEADERS })
const text = await res.text()
console.log(`Status: ${res.status}, Size: ${text.length}`)

// Try JSON parse
try {
  const data = JSON.parse(text)
  console.log(`Root type: ${typeof data}, isArray: ${Array.isArray(data)}`)
  if (Array.isArray(data)) {
    console.log(`Array length: ${data.length}`)
    // Nuxt3 payload format: array of [metadata, ...data_entries]
    for (let i = 0; i < Math.min(3, data.length); i++) {
      const item = data[i]
      console.log(`  [${i}]: ${typeof item}${typeof item === 'object' ? ` keys=${Object.keys(item || {}).slice(0, 10).join(',')}` : ` = ${String(item).substring(0, 100)}`}`)
    }
  } else if (typeof data === 'object') {
    console.log(`Object keys: ${Object.keys(data).slice(0, 20).join(', ')}`)
  }

  // Deep search for product-like structures
  function findProductData(obj, path = '', depth = 0, results = []) {
    if (depth > 10 || results.length > 50) return results
    if (!obj || typeof obj !== 'object') return results

    if (Array.isArray(obj)) {
      for (let i = 0; i < Math.min(obj.length, 100); i++) {
        findProductData(obj[i], `${path}[${i}]`, depth + 1, results)
      }
    } else {
      // Check if this looks like a product
      const keys = Object.keys(obj)
      const hasPrice = keys.some(k => k.toLowerCase().includes('price'))
      const hasName = keys.some(k => k === 'name' || k === 'title' || k === 'label' || k === 'description')
      const hasCode = keys.some(k => k === 'code' || k === 'id' || k === 'sku' || k === 'partNumber')

      if (hasPrice && (hasName || hasCode)) {
        results.push({
          path,
          name: obj.name || obj.title || obj.label,
          price: obj.price || obj.priceValue || obj.formattedPrice,
          code: obj.code || obj.id || obj.sku || obj.partNumber,
          keys: keys.slice(0, 15)
        })
      }

      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'object') {
          findProductData(val, `${path}.${key}`, depth + 1, results)
        }
      }
    }
    return results
  }

  const products = findProductData(data)
  console.log(`\nProduct-like objects found: ${products.length}`)
  for (const p of products.slice(0, 20)) {
    console.log(`  ${p.path}: ${p.name || 'no-name'} | ${p.price || 'no-price'} | ${p.code || 'no-code'} | keys: ${p.keys.join(',')}`)
  }

  // Also search for strings that look like accessory names
  const allStrings = []
  function collectStrings(obj, depth = 0) {
    if (depth > 8) return
    if (typeof obj === 'string' && obj.length > 5 && obj.length < 100) {
      allStrings.push(obj)
    } else if (Array.isArray(obj)) {
      obj.forEach(item => collectStrings(item, depth + 1))
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(val => collectStrings(val, depth + 1))
    }
  }
  collectStrings(data)

  // Filter for accessory-like names
  const accKeywords = ['mat', 'bar', 'rack', 'liner', 'wheel', 'dash', 'cam', 'protection', 'carrier', 'alloy', 'tow', 'cargo', 'roof', 'step', 'guard', 'canopy', 'spoiler', 'stripe', 'pedal', 'mudflap', 'charger']
  const accNames = allStrings.filter(s => accKeywords.some(k => s.toLowerCase().includes(k)))
  console.log(`\nAccessory-like strings: ${accNames.length}`)
  for (const n of [...new Set(accNames)].slice(0, 30)) {
    console.log(`  ${n}`)
  }

} catch (e) {
  console.log(`JSON parse failed: ${e.message}`)
  // Try extracting from raw text
  console.log('\n=== Raw text analysis ===')
  // Find price patterns
  const prices = [...text.matchAll(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/g)]
  console.log(`Price fields: ${prices.length}`)
  const uniquePrices = [...new Set(prices.map(p => p[1]))].sort((a, b) => parseFloat(a) - parseFloat(b))
  console.log(`Unique prices: ${uniquePrices.join(', ')}`)

  // Find name patterns
  const names = [...text.matchAll(/"name"\s*:\s*"([^"]+)"/g)]
  console.log(`\nName fields: ${names.length}`)
  for (const n of names.slice(0, 20)) console.log(`  ${n[1]}`)
}

// 2. Also fetch the Sport & Design category payload
console.log('\n\n=== Fetching Sport & Design category payload ===')
const catRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/c/sport-and-design/160985513/_payload.json', { headers: HEADERS })
const catText = await catRes.text()
console.log(`Status: ${catRes.status}, Size: ${catText.length}`)

// Quick check - search for price-like patterns
const catPrices = [...catText.matchAll(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/g)]
console.log(`Price fields: ${catPrices.length}`)
const catNames = [...catText.matchAll(/"name"\s*:\s*"([^"]{5,80})"/g)]
console.log(`Name fields: ${catNames.length}`)
for (const n of catNames.slice(0, 20)) console.log(`  ${n[1]}`)

// Check for formattedPrice or any dollar amounts
const dollarAmounts = [...catText.matchAll(/\$\s?[\d,]+(?:\.\d{2})?/g)]
console.log(`\nDollar amounts: ${dollarAmounts.length}`)
for (const d of [...new Set(dollarAmounts.map(m => m[0]))].slice(0, 20)) console.log(`  ${d}`)
