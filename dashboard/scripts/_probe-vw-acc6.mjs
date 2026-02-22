#!/usr/bin/env node
// Parse the VW __NUXT_DATA__ properly and check shop API

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// 1. Check the shop API endpoints
console.log('=== Shop API v1 ===')
const shopUrls = [
  '/api/shop/v1/products',
  '/api/shop/v1/products?categoryId=160985513',
  '/api/shop/v1/products?category=sport-and-design',
  '/api/shop/v1/categories',
  '/api/shop/v1/categories/160985513',
  '/api/shop/v1/categories/160985513/products',
  '/api/shop/v1/cart',
  '/api/shop/v1/search?q=mat',
]
for (const path of shopUrls) {
  try {
    const r = await fetch(`https://volkswagen-genuine-accessories.com${path}`, {
      headers: { ...HEADERS, Accept: 'application/json' }
    })
    const text = r.ok ? await r.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${path}: ${r.status}${isJson ? ` JSON (${text.length})` : r.ok ? ` HTML (${text.length})` : ''}`)
    if (isJson && text.length < 2000) console.log(`    ${text.substring(0, 500)}`)
  } catch (e) {
    console.log(`  ${path}: ${e.message}`)
  }
}

// 2. Parse the Nuxt data to find products in pinia/apollo state
console.log('\n=== Parsing __NUXT_DATA__ ===')
const catUrl = 'https://volkswagen-genuine-accessories.com/au/en/c/sport-and-design/160985513/'
const res = await fetch(catUrl, { headers: HEADERS })
const html = await res.text()

const nuxtMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
if (!nuxtMatch) { console.log('No __NUXT_DATA__'); process.exit(1) }

const rawData = JSON.parse(nuxtMatch[1])
console.log(`Array entries: ${rawData.length}`)

// Nuxt 3 __NUXT_DATA__ format uses index references
// Entry at index 1 shows the structure: data->2, state->4, pinia->15, translations->598, apolloState->1260

// Let's decode the Nuxt 3 payload format
function decodeNuxtPayload(arr) {
  const refs = new Map()

  function resolve(idx) {
    if (refs.has(idx)) return refs.get(idx)
    const entry = arr[idx]

    if (entry === null || entry === undefined) return entry
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') return entry

    if (Array.isArray(entry)) {
      // Special Nuxt markers
      if (entry[0] === 'ShallowReactive' || entry[0] === 'Reactive' || entry[0] === 'ShallowRef') {
        const result = resolve(entry[1])
        refs.set(idx, result)
        return result
      }
      if (entry[0] === 'Date') {
        return entry[1]
      }
      if (entry[0] === 'Set') {
        return new Set(entry.slice(1).map(i => resolve(i)))
      }
      if (entry[0] === 'Map') {
        const map = new Map()
        for (let i = 1; i < entry.length; i += 2) {
          map.set(resolve(entry[i]), resolve(entry[i + 1]))
        }
        return map
      }
      // Regular array: indices reference other entries
      const result = entry.map(i => resolve(i))
      refs.set(idx, result)
      return result
    }

    if (typeof entry === 'object') {
      const result = {}
      refs.set(idx, result) // set early for circular refs
      for (const [key, valIdx] of Object.entries(entry)) {
        result[key] = resolve(valIdx)
      }
      return result
    }

    return entry
  }

  // Start from the root entry
  return resolve(0)
}

try {
  const decoded = decodeNuxtPayload(rawData)
  console.log(`Decoded type: ${typeof decoded}`)

  // Navigate to pinia store
  const pinia = decoded?.pinia
  if (pinia) {
    console.log(`Pinia keys: ${Object.keys(pinia).join(', ')}`)

    // Look for product-related stores
    for (const [storeName, storeData] of Object.entries(pinia)) {
      if (typeof storeData !== 'object' || storeData === null) continue
      const storeStr = JSON.stringify(storeData)
      if (storeStr.includes('price') || storeStr.includes('product') || storeStr.includes('article')) {
        console.log(`\n  Store "${storeName}" has product/price data`)
        console.log(`    Keys: ${Object.keys(storeData).join(', ')}`)

        // Check for product arrays
        for (const [key, val] of Object.entries(storeData)) {
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
            const first = val[0]
            console.log(`    ${key} (array[${val.length}]): ${JSON.stringify(first).substring(0, 300)}`)
          } else if (typeof val === 'object' && val !== null) {
            const subStr = JSON.stringify(val)
            if (subStr.includes('price') && subStr.length < 2000) {
              console.log(`    ${key}: ${subStr.substring(0, 300)}`)
            }
          }
        }
      }
    }
  }

  // Check Apollo state
  const apolloState = decoded?.apolloState
  if (apolloState) {
    console.log(`\nApollo state keys: ${Object.keys(apolloState).slice(0, 10).join(', ')}`)

    // Apollo cache is usually keyed by __typename:id
    for (const [key, val] of Object.entries(apolloState)) {
      if (typeof val === 'object' && val !== null) {
        if (val.price || val.formattedPrice || val.name) {
          console.log(`\n  Apollo entry "${key}": ${JSON.stringify(val).substring(0, 300)}`)
        }
      }
      if (typeof val === 'object' && val !== null && Object.keys(val).length > 0) {
        // Check for nested product data
        for (const [k2, v2] of Object.entries(val)) {
          if (typeof v2 === 'object' && v2 !== null && (v2.price || v2.formattedPrice)) {
            console.log(`  ${key}.${k2}: ${JSON.stringify(v2).substring(0, 200)}`)
          }
        }
      }
    }
  }

  // Search entire decoded data for price values
  console.log('\n=== Deep search for prices ===')
  const foundPrices = []
  function findPrices(obj, path = '', depth = 0) {
    if (depth > 15 || foundPrices.length > 100) return
    if (!obj || typeof obj !== 'object') return
    if (obj instanceof Set || obj instanceof Map) return

    if (Array.isArray(obj)) {
      obj.forEach((item, i) => findPrices(item, `${path}[${i}]`, depth + 1))
      return
    }

    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase()
      if ((lower.includes('price') || lower === 'amount' || lower === 'cost') && (typeof val === 'number' || (typeof val === 'string' && /^\d/.test(val)))) {
        foundPrices.push({ path: `${path}.${key}`, value: val })
      }
      if (typeof val === 'object') findPrices(val, `${path}.${key}`, depth + 1)
    }
  }
  findPrices(decoded)
  console.log(`Found ${foundPrices.length} price values`)
  for (const p of foundPrices.slice(0, 20)) {
    console.log(`  ${p.path}: ${p.value}`)
  }

} catch (e) {
  console.log(`Decode error: ${e.message}`)
  console.log(e.stack)

  // Fallback: raw string search
  console.log('\n=== Fallback: raw string search ===')
  const rawStr = JSON.stringify(rawData)
  // Find all strings that look like prices
  const priceEntries = rawData.filter(e => typeof e === 'string' && /^\$?\d[\d,]*\.\d{2}$/.test(e))
  console.log(`Price-like strings: ${priceEntries.length}`)
  for (const p of priceEntries.slice(0, 20)) console.log(`  ${p}`)

  // Find all strings that look like product names
  const nameEntries = rawData.filter(e => typeof e === 'string' && e.length > 5 && e.length < 80 && /^[A-Z]/.test(e) && !/^(http|\/|{|\[)/.test(e))
  console.log(`\nName-like strings: ${nameEntries.length}`)
  for (const n of nameEntries.slice(0, 30)) console.log(`  ${n}`)
}
