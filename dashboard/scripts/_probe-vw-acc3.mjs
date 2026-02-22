#!/usr/bin/env node
// Probe VW e-catalogue Nuxt app for accessory data

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// Categories from the main page
const CATEGORIES = [
  { name: 'Sport & Design', id: '160985513' },
  { name: 'Transport', id: '160985549' },
  { name: 'Comfort & Protection', id: '160985565' },
  { name: 'Communication', id: '160988427' },
  { name: 'Wheels', id: '160988447' },
  { name: 'E-Charging', id: '160988463' },
  { name: 'Lifestyle', id: '198280310' },
]

// 1. Fetch a category page and extract Nuxt data
console.log('=== Fetching Sport & Design category page ===')
const catUrl = 'https://volkswagen-genuine-accessories.com/au/en/c/sport-and-design/160985513/'
const res = await fetch(catUrl, { headers: HEADERS })
const html = await res.text()
console.log(`Status: ${res.status}, Size: ${html.length}`)

// Extract __NUXT__ data
const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*\(function\(([^)]*)\)\{return\s*([\s\S]*?)\}\(([\s\S]*?)\)\)<\/script>/)
if (nuxtMatch) {
  // The Nuxt data is often compressed as a function with arguments
  console.log(`Nuxt data found: params="${nuxtMatch[1].substring(0, 100)}"`)
  console.log(`Body length: ${nuxtMatch[2].length}`)
  console.log(`Args length: ${nuxtMatch[3].length}`)

  // Try to evaluate it
  try {
    const fn = new Function(nuxtMatch[1], `return ${nuxtMatch[2]}`)
    const args = nuxtMatch[3].split(',').map(a => {
      a = a.trim()
      if (a === 'void 0') return undefined
      if (a === 'null') return null
      if (a === 'true') return true
      if (a === 'false') return false
      if (a.startsWith('"') || a.startsWith("'")) return a.slice(1, -1)
      if (!isNaN(Number(a))) return Number(a)
      return a
    })
    const nuxtData = fn(...args)
    console.log('\nNuxt state keys:', Object.keys(nuxtData))

    // Deep explore for products
    function findProducts(obj, path = '', results = []) {
      if (!obj || typeof obj !== 'object') return results
      if (Array.isArray(obj)) {
        obj.forEach((item, i) => findProducts(item, `${path}[${i}]`, results))
      } else {
        if (obj.price || obj.priceValue || obj.name) {
          results.push({ path, item: { name: obj.name, price: obj.price || obj.priceValue, code: obj.code || obj.id, sku: obj.sku } })
        }
        for (const [key, val] of Object.entries(obj)) {
          if (typeof val === 'object') findProducts(val, `${path}.${key}`, results)
        }
      }
      return results
    }

    const products = findProducts(nuxtData)
    console.log(`\nProducts found: ${products.length}`)
    for (const p of products.slice(0, 15)) {
      console.log(`  ${p.path}: ${JSON.stringify(p.item)}`)
    }

    // Also look for any data property that's an array of items
    function findArrays(obj, path = '', results = []) {
      if (!obj || typeof obj !== 'object') return results
      if (Array.isArray(obj) && obj.length > 2) {
        const first = obj[0]
        if (first && typeof first === 'object' && (first.name || first.title || first.code || first.partNumber)) {
          results.push({ path, count: obj.length, sample: JSON.stringify(first).substring(0, 200) })
        }
      } else if (typeof obj === 'object') {
        for (const [key, val] of Object.entries(obj)) {
          if (typeof val === 'object') findArrays(val, `${path}.${key}`, results)
        }
      }
      return results
    }

    const arrays = findArrays(nuxtData)
    console.log(`\nProduct-like arrays: ${arrays.length}`)
    for (const a of arrays) {
      console.log(`  ${a.path} (${a.count} items): ${a.sample}`)
    }

  } catch (e) {
    console.log(`Error evaluating Nuxt data: ${e.message}`)
    // Fallback: search raw text for product-like patterns
    const rawData = nuxtMatch[2] + nuxtMatch[3]
    const pricePattern = /price['"]*\s*:\s*(\d+(?:\.\d+)?)/g
    const prices = [...rawData.matchAll(pricePattern)].map(m => parseFloat(m[1]))
    console.log(`Raw price values: ${prices.length}`)
    const uniquePrices = [...new Set(prices)].sort((a, b) => a - b)
    console.log(`Unique prices: ${uniquePrices.slice(0, 20).join(', ')}`)
  }
} else {
  // Try simpler __NUXT__ pattern
  const simpleMatch = html.match(/window\.__NUXT__\s*=\s*([\s\S]*?)<\/script>/)
  if (simpleMatch) {
    console.log(`Simple Nuxt data found (${simpleMatch[1].length} chars)`)
    // Extract prices from raw text
    const prices = [...simpleMatch[1].matchAll(/price['"]*\s*[:=]\s*['"]?(\d+(?:\.\d+)?)/g)]
    console.log(`Prices in Nuxt data: ${prices.length}`)
    for (const p of prices.slice(0, 10)) console.log(`  ${p[1]}`)
  } else {
    console.log('No __NUXT__ data found')
  }
}

// 2. Check for API calls in the page's JavaScript
console.log('\n=== Looking for API endpoints in JS bundles ===')
// Find JS bundle URLs
const scriptSrcs = [...html.matchAll(/src="([^"]*\.js[^"]*)"/g)].map(m => m[1])
console.log(`JS bundles: ${scriptSrcs.length}`)

// Look for API patterns in the first few bundles
for (const src of scriptSrcs.slice(0, 3)) {
  const fullUrl = src.startsWith('http') ? src : `https://volkswagen-genuine-accessories.com${src}`
  try {
    const r = await fetch(fullUrl, { headers: HEADERS })
    if (!r.ok) continue
    const js = await r.text()
    // Find API endpoints
    const apiMatches = [...js.matchAll(/["'](\/api\/[^"']+|https?:\/\/[^"']*api[^"']*|\/rest\/[^"']+|\/graphql[^"']*)/g)]
    if (apiMatches.length > 0) {
      console.log(`  ${src.split('/').pop()}: ${apiMatches.length} API refs`)
      for (const m of apiMatches.slice(0, 10)) console.log(`    ${m[1]}`)
    }
    // Also check for OCC (SAP Commerce Cloud) patterns
    const occMatches = [...js.matchAll(/occ|commerce|hybris|spartacus/gi)]
    if (occMatches.length > 0) {
      console.log(`  ${src.split('/').pop()}: ${occMatches.length} SAP Commerce/OCC refs`)
    }
  } catch (e) {
    // skip
  }
}

// 3. Try common SAP Commerce Cloud / OCC API patterns
console.log('\n=== SAP Commerce Cloud API patterns ===')
const occUrls = [
  '/occ/v2/au/products/search?query=*&pageSize=50',
  '/rest/v2/au/products/search?query=*&pageSize=50',
  '/api/products?market=au&lang=en&pageSize=50',
  '/api/v1/products?pageSize=50&lang=en',
  '/api/v1/categories/160985513/products',
  '/api/categories/160985513/products',
]
for (const path of occUrls) {
  try {
    const r = await fetch(`https://volkswagen-genuine-accessories.com${path}`, {
      headers: { ...HEADERS, Accept: 'application/json' }
    })
    const text = r.ok ? await r.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${path}: ${r.status}${isJson ? ` JSON (${text.length})` : ''}`)
    if (isJson && text.length < 1000) console.log(`    ${text.substring(0, 500)}`)
  } catch (e) {
    console.log(`  ${path}: ${e.message}`)
  }
}

// 4. Check the Nuxt payload API (Nuxt 3 pattern)
console.log('\n=== Nuxt payload endpoints ===')
const payloadUrls = [
  '/_payload.json',
  '/au/en/_payload.json',
  '/au/en/c/sport-and-design/160985513/_payload.json',
  '/api/__nuxt_island/page',
]
for (const path of payloadUrls) {
  try {
    const r = await fetch(`https://volkswagen-genuine-accessories.com${path}`, {
      headers: { ...HEADERS, Accept: 'application/json' }
    })
    const text = r.ok ? await r.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${path}: ${r.status}${isJson ? ` JSON (${text.length})` : ` (${text.length} bytes)`}`)
    if (isJson && text.length < 1000) console.log(`    ${text.substring(0, 500)}`)
  } catch (e) {
    console.log(`  ${path}: ${e.message}`)
  }
}
