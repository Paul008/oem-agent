#!/usr/bin/env node
// Use VW accessToken to call shop API, and find product GraphQL queries

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// 1. Get a fresh accessToken
console.log('=== Getting access token ===')
const pageRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/', {
  headers: HEADERS,
  redirect: 'follow'
})
const setCookies = pageRes.headers.getSetCookie?.() || []
let accessToken = null
let allCookies = []
for (const c of setCookies) {
  const [nameVal] = c.split(';')
  allCookies.push(nameVal)
  if (nameVal.startsWith('accessToken=')) {
    accessToken = nameVal.replace('accessToken=', '')
  }
}
console.log(`Access token: ${accessToken ? accessToken.substring(0, 50) + '...' : 'not found'}`)
const cookieStr = allCookies.join('; ')

// 2. Try the GraphQL endpoint with the token
console.log('\n=== GraphQL API with token ===')
const graphqlEndpoints = [
  'https://volkswagen-genuine-accessories.com/api/shop/v1/graphql',
  'https://volkswagen-genuine-accessories.com/graphql',
  'https://volkswagen-genuine-accessories.com/api/graphql',
]

const productQuery = `query {
  products(first: 10) {
    edges {
      node {
        name
        price
      }
    }
  }
}`

for (const url of graphqlEndpoints) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        ...HEADERS,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: cookieStr,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({ query: productQuery })
    })
    const text = r.ok ? await r.text() : ''
    console.log(`  ${url.replace('https://volkswagen-genuine-accessories.com', '')}: ${r.status} (${text.length} bytes)`)
    if (text.length > 0 && text.length < 1000) console.log(`    ${text}`)
  } catch (e) {
    console.log(`  ${url}: ${e.message}`)
  }
}

// 3. Try REST API with Bearer token
console.log('\n=== Shop API with Bearer token ===')
const apiPaths = [
  '/api/shop/v1/products?categoryId=160985513&pageSize=50',
  '/api/shop/v1/categories',
  '/api/shop/v1/products/search?q=mat&pageSize=50',
  '/api/shop/v1/products?pageSize=50',
]
for (const path of apiPaths) {
  try {
    const r = await fetch(`https://volkswagen-genuine-accessories.com${path}`, {
      headers: {
        ...HEADERS,
        Accept: 'application/json',
        Cookie: cookieStr,
        Authorization: `Bearer ${accessToken}`
      }
    })
    const text = r.ok ? await r.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${path}: ${r.status}${isJson ? ` JSON (${text.length})` : ''}`)
    if (isJson && text.length < 2000) console.log(`    ${text.substring(0, 500)}`)
    if (isJson && text.length > 2000) {
      // Try to parse and show structure
      try {
        const data = JSON.parse(text)
        if (data.products) console.log(`    products: ${data.products.length || Object.keys(data.products).length} entries`)
        if (data.items) console.log(`    items: ${data.items.length} entries`)
        if (data.results) console.log(`    results: ${data.results.length} entries`)
        if (data.content) console.log(`    content: ${Object.keys(data.content).length} entries`)
        console.log(`    Top keys: ${Object.keys(data).join(', ')}`)
        // Show first product
        const items = data.products || data.items || data.results || []
        if (Array.isArray(items) && items.length > 0) {
          console.log(`    First item: ${JSON.stringify(items[0]).substring(0, 300)}`)
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) {
    console.log(`  ${path}: ${e.message}`)
  }
}

// 4. Extract the actual GraphQL queries from the JS bundle
console.log('\n=== Extracting product-related GraphQL from JS ===')
const html = await pageRes.text()
const scriptSrcs = [...html.matchAll(/src="([^"]*\.js[^"]*)"/g)].map(m => m[1])

for (const src of scriptSrcs) {
  const fullUrl = src.startsWith('http') ? src : `https://volkswagen-genuine-accessories.com${src}`
  try {
    const r = await fetch(fullUrl, { headers: HEADERS })
    if (!r.ok) continue
    const js = await r.text()

    // Find product/category related queries
    const queries = [...js.matchAll(/(query\s+\w*(?:Product|Category|Article|Search|Listing)[^{]*\{[\s\S]{10,500}?\}(?:\s*\})*)/g)]
    if (queries.length > 0) {
      console.log(`\n  ${src.split('/').pop()}: ${queries.length} product-related queries`)
      for (const q of queries.slice(0, 10)) {
        console.log(`    ${q[1].substring(0, 200).replace(/\s+/g, ' ')}`)
      }
    }

    // Also find all "/api/shop/v1/" patterns
    const shopApis = [...js.matchAll(/\/api\/shop\/v1\/[^\s"'`]+/g)]
    if (shopApis.length > 0) {
      const unique = [...new Set(shopApis.map(m => m[0]))]
      console.log(`\n  Shop API paths:`)
      for (const a of unique) console.log(`    ${a}`)
    }

    // Find the GraphQL endpoint URL
    const gqlUrl = [...js.matchAll(/(?:graphqlUrl|GRAPHQL_URL|graphql_endpoint|apolloUrl)\s*[=:]\s*["'`]([^"'`]+)/g)]
    if (gqlUrl.length > 0) {
      console.log(`  GraphQL URL: ${gqlUrl.map(m => m[1]).join(', ')}`)
    }

    // Find OSSE/API domain references
    const apiDomains = [...js.matchAll(/https?:\/\/[^"'`\s]+osse[^"'`\s]*/g)]
    if (apiDomains.length > 0) {
      const unique = [...new Set(apiDomains.map(m => m[0]))]
      console.log(`  OSSE domains:`)
      for (const d of unique.slice(0, 10)) console.log(`    ${d}`)
    }
  } catch (e) {
    // skip
  }
}
