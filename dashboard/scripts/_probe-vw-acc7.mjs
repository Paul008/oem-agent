#!/usr/bin/env node
// Probe VW shop API with cookies, and examine Apollo state

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// 1. First, fetch the page to get cookies
console.log('=== Fetching page with cookies ===')
const pageRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/c/sport-and-design/160985513/', {
  headers: HEADERS,
  redirect: 'follow'
})
const cookies = pageRes.headers.getSetCookie?.() || []
console.log(`Set-Cookie headers: ${cookies.length}`)
for (const c of cookies) console.log(`  ${c.split(';')[0]}`)

const cookieStr = cookies.map(c => c.split(';')[0]).join('; ')

// 2. Try shop API with cookies
console.log('\n=== Shop API with session cookies ===')
const shopUrls = [
  '/api/shop/v1/products?categoryId=160985513&pageSize=50',
  '/api/shop/v1/categories',
  '/api/shop/v1/search?q=mat&pageSize=50',
]
for (const path of shopUrls) {
  try {
    const r = await fetch(`https://volkswagen-genuine-accessories.com${path}`, {
      headers: { ...HEADERS, Accept: 'application/json', Cookie: cookieStr }
    })
    const text = r.ok ? await r.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${path}: ${r.status}${isJson ? ` JSON (${text.length})` : ''}`)
    if (isJson) console.log(`    ${text.substring(0, 500)}`)
  } catch (e) {
    console.log(`  ${path}: ${e.message}`)
  }
}

// 3. Parse the page to find what API the Apollo client actually calls
const html = await pageRes.text()

// Look at the __NUXT_DATA__ Apollo state more carefully
const nuxtMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
if (!nuxtMatch) { console.log('No data'); process.exit(1) }
const rawData = JSON.parse(nuxtMatch[1])

// Examine the Apollo state entries directly
console.log('\n=== Apollo state raw entries ===')
// Find the apolloState index from entry 1
const rootEntry = rawData[1]
const apolloIdx = rootEntry.apolloState
console.log(`Apollo state at index: ${apolloIdx}`)
const apolloEntry = rawData[apolloIdx]
console.log(`Apollo entry type: ${typeof apolloEntry}, keys: ${typeof apolloEntry === 'object' ? Object.keys(apolloEntry).slice(0, 20).join(',') : 'N/A'}`)

// Apollo state often stores data in a flat cache with __typename:id keys
if (typeof apolloEntry === 'object') {
  for (const [key, valIdx] of Object.entries(apolloEntry)) {
    const val = rawData[valIdx]
    if (typeof val === 'object' && val !== null) {
      const keys = Object.keys(val)
      console.log(`  Entry ${key} (idx ${valIdx}): ${keys.slice(0, 8).join(', ')}`)
      // Sample the data
      const sample = {}
      for (const k of keys.slice(0, 5)) {
        const v = rawData[val[k]]
        sample[k] = typeof v === 'string' ? v.substring(0, 50) : v
      }
      console.log(`    Sample: ${JSON.stringify(sample)}`)
    }
  }
}

// 4. Search for GraphQL query patterns in the JS bundle
console.log('\n=== GraphQL queries in JS ===')
const scriptSrcs = [...html.matchAll(/src="([^"]*\.js[^"]*)"/g)].map(m => m[1])
for (const src of scriptSrcs.slice(0, 3)) {
  const fullUrl = src.startsWith('http') ? src : `https://volkswagen-genuine-accessories.com${src}`
  try {
    const r = await fetch(fullUrl, { headers: HEADERS })
    if (!r.ok) continue
    const js = await r.text()

    // Find GraphQL queries
    const gqlPatterns = [...js.matchAll(/(?:query|mutation)\s+(\w+)[^{]*\{[^}]{10,200}/g)]
    if (gqlPatterns.length > 0) {
      console.log(`\n  ${src.split('/').pop()}: ${gqlPatterns.length} GraphQL operations`)
      for (const q of gqlPatterns.slice(0, 10)) {
        console.log(`    ${q[0].substring(0, 150)}`)
      }
    }

    // Find API base URL patterns
    const baseUrls = [...js.matchAll(/(?:baseURL|apiUrl|API_URL|endpoint)['":\s]*['"]([^'"]+)['"]/g)]
    if (baseUrls.length > 0) {
      console.log(`  Base URLs:`)
      for (const b of baseUrls) console.log(`    ${b[1]}`)
    }

    // Find product/category fetch patterns
    const fetchPatterns = [...js.matchAll(/products|categories|articles/g)]
    const apiFetches = [...js.matchAll(/\/api\/shop\/v1\/(\w+)/g)]
    if (apiFetches.length > 0) {
      console.log(`  Shop API endpoints used:`)
      for (const a of [...new Set(apiFetches.map(m => m[0]))]) console.log(`    ${a}`)
    }
  } catch (e) {
    // skip
  }
}

// 5. Search raw Nuxt data for all product/accessory-like entries
console.log('\n=== Product data in raw Nuxt array ===')
// Print all string entries that look like product names
const nameStrings = rawData.filter((e, i) => {
  if (typeof e !== 'string') return false
  if (e.length < 5 || e.length > 100) return false
  // Exclude URLs, HTML, JSON-like strings
  if (/^(http|\/|<|{|\[|#|\.|\d)/.test(e)) return false
  // Exclude common non-product strings
  if (/^(en|au|true|false|null|undefined|function|return|var|const|let)$/i.test(e)) return false
  return true
})
console.log(`Potential name strings: ${nameStrings.length}`)
for (const n of nameStrings.slice(0, 50)) console.log(`  ${n}`)

// Print all number entries that could be prices (> 10, < 50000)
const priceNums = rawData.filter(e => typeof e === 'number' && e > 10 && e < 50000)
console.log(`\nPotential prices (numbers 10-50000): ${priceNums.length}`)
for (const p of priceNums.slice(0, 20)) console.log(`  ${p}`)
