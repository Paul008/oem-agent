#!/usr/bin/env node
// Probe VW accessories data sources

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': '*/*',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// Models from the model-specific-accessories page
const MODELS = [
  'id-buzz-accessories',
  'id-buzz-cargo-accessories',
  'id4-accessories',
  'id5-accessories',
  'golf-accessories',
  'polo-accessories',
  'tiguan-accessories',
  't-roc-accessories',
  'amarok-accessories',
  'touareg-accessories',
  't-cross-accessories',
  'tayron-accessories',
  'arteon-accessories',
  'passat-wagon-accessories',
  'multivan-accessories',
  'golf-r-accessories',
  'golf-gti-accessories',
  'polo-gti-accessories',
]

// 1. Probe each model's .model.json endpoint
console.log('=== Model JSON endpoints ===')
let accTotal = 0
for (const model of MODELS) {
  const url = `https://www.volkswagen.com.au/en/owners-service/accessories/${model}.model.json`
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) { console.log(`  ${model}: ${res.status}`); continue }
    const text = await res.text()

    // Count accessory-like items
    const priceMatches = text.match(/price|rrp|\$\d/gi) || []
    const nameMatches = text.match(/accessory|accessor/gi) || []
    const partMatches = text.match(/part.?number|sku|part.?no/gi) || []

    // Look for content slider sections (these contain the accessories)
    const sliderMatches = text.match(/contentSliderSection/gi) || []

    // Look for headlineText entries (accessory names)
    const headlines = [...text.matchAll(/"headlineText"\s*:\s*"([^"]+)"/g)]
    const items = headlines.map(m => m[1]).filter(h => h.length > 3 && h.length < 100)

    console.log(`  ${model}: ${res.status} (${text.length} bytes) - ${items.length} items, ${priceMatches.length} price refs, ${partMatches.length} part refs`)
    if (items.length > 0) {
      console.log(`    Items: ${items.slice(0, 5).join(', ')}${items.length > 5 ? '...' : ''}`)
      accTotal += items.length
    }
  } catch (e) {
    console.log(`  ${model}: ${e.message}`)
  }
}
console.log(`\nTotal items across all models: ${accTotal}`)

// 2. Check the e-catalogue site
console.log('\n=== E-catalogue site ===')
const ecatUrls = [
  'https://volkswagen-genuine-accessories.com/au/en/',
  'https://volkswagen-genuine-accessories.com/au/en/api/products',
  'https://volkswagen-genuine-accessories.com/au/en/id-buzz',
  'https://volkswagen-genuine-accessories.com/api/v1/products?market=au',
  'https://volkswagen-genuine-accessories.com/api/products?locale=en-AU',
]
for (const url of ecatUrls) {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json, text/html' }, redirect: 'follow' })
    const text = res.ok ? await res.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${url.replace('https://volkswagen-genuine-accessories.com', '')}: ${res.status}${isJson ? ` JSON (${text.length})` : ` (${text.length} bytes)`}`)
    if (isJson && text.length < 2000) console.log(`    ${text.substring(0, 500)}`)
    if (!isJson && res.ok) {
      // Check for prices, part numbers in HTML
      const prices = text.match(/\$[\d,]+(?:\.\d{2})?/g) || []
      const partNums = text.match(/\b[A-Z0-9]{3,4}\s*\d{3}\s*\d{3}\b/g) || []  // VW part number format
      console.log(`    Prices found: ${prices.length}, Part numbers: ${partNums.length}`)
      if (prices.length > 0) console.log(`    Sample prices: ${prices.slice(0, 5).join(', ')}`)
    }
  } catch (e) {
    console.log(`  ${url}: ${e.message}`)
  }
}

// 3. Try fetching the VW AU accessories HTML pages for JSON-LD or structured data
console.log('\n=== VW AU HTML pages (checking for JSON-LD / structured data) ===')
const htmlUrls = [
  'https://www.volkswagen.com.au/en/owners-service/accessories/tiguan-accessories.html',
  'https://www.volkswagen.com.au/en/owners-service/accessories/amarok-accessories.html',
]
for (const url of htmlUrls) {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: 'text/html' } })
    if (!res.ok) { console.log(`  ${url.split('/').pop()}: ${res.status}`); continue }
    const html = await res.text()

    // Check for JSON-LD
    const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    console.log(`  ${url.split('/').pop()}: ${html.length} bytes, ${jsonLd.length} JSON-LD blocks`)

    // Check for prices
    const prices = [...html.matchAll(/\$[\d,]+(?:\.\d{2})?/g)]
    console.log(`    Prices in HTML: ${prices.length}`)
    if (prices.length > 0) console.log(`    Samples: ${[...new Set(prices.map(p => p[0]))].slice(0, 10).join(', ')}`)

    // Check for structured accessory data
    const accNames = [...html.matchAll(/"headlineText"\s*:\s*"([^"]+)"/g)]
    console.log(`    Accessory headline items: ${accNames.length}`)

    // Check for any API calls in the JS
    const fetchCalls = [...html.matchAll(/fetch\s*\(\s*['"]([^'"]+)['"]/g)]
    const apiCalls = fetchCalls.filter(m => m[1].includes('api') || m[1].includes('.json'))
    if (apiCalls.length > 0) console.log(`    API calls: ${apiCalls.map(m => m[1]).join(', ')}`)

    // Check for Scene7 image patterns
    const scene7 = [...html.matchAll(/scene7\.com[^"'\s]*/g)]
    console.log(`    Scene7 images: ${scene7.length}`)
  } catch (e) {
    console.log(`  ${url}: ${e.message}`)
  }
}

// 4. Try the DXP/Sitecore-style API patterns
console.log('\n=== DXP API patterns ===')
const dxpUrls = [
  'https://www.volkswagen.com.au/en/owners-service/accessories.model.json',
  'https://www.volkswagen.com.au/en/owners-service/accessories/tiguan-accessories._jcr_content.json',
  'https://www.volkswagen.com.au/en/owners-service/accessories/tiguan-accessories.infinity.json',
  'https://www.volkswagen.com.au/content/dam/vw-au/accessories/accessories-catalogue.json',
  'https://www.volkswagen.com.au/apps/dcms/accessories/au/en',
]
for (const url of dxpUrls) {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json' } })
    const text = res.ok ? await res.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${url.replace('https://www.volkswagen.com.au', '')}: ${res.status}${isJson ? ` JSON (${text.length})` : ''}`)
    if (isJson && text.length < 500) console.log(`    ${text}`)
  } catch (e) {
    console.log(`  ${url}: ${e.message}`)
  }
}
