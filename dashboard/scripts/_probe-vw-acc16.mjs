#!/usr/bin/env node
// VW GraphQL - now we know: Money={amount,currencyCode}, Variation=Item, SearchResult=ProductSearchResult
// Find the product listing field on ProductSearchResult

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
}

const pageRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/', { headers: HEADERS })
const setCookies = pageRes.headers.getSetCookie?.() || []
let accessToken = null
let cookieParts = []
for (const c of setCookies) {
  const [nameVal] = c.split(';')
  cookieParts.push(nameVal)
  if (nameVal.startsWith('accessToken=')) accessToken = nameVal.replace('accessToken=', '')
}

const GQL_URL = 'https://volkswagen-genuine-accessories.com/au/api/graphql/'
const gqlHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Authorization: `Bearer ${accessToken}`,
  Cookie: cookieParts.join('; '),
  Origin: 'https://volkswagen-genuine-accessories.com',
  Referer: 'https://volkswagen-genuine-accessories.com/au/en/',
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: gqlHeaders,
    body: JSON.stringify({ query, variables })
  })
  return res.json()
}

const testId = 'VW-ACC-7H2061245E RUY'

// 1. Now that we know the type is ProductSearchResult, try more field names
console.log('=== ProductSearchResult fields ===')
const psrFields = [
  // Product lists
  'items { id }',
  'products { id }',
  'entries { id }',
  'hits { id }',
  'results { id }',
  'nodes { id }',
  'edges { node { id } }',
  'elements { id }',
  'records { id }',
  'rows { id }',
  'documents { id }',
  'matches { id }',
  'searchHits { id }',
  // Pagination
  'totalCount',
  'count',
  'total',
  'offset',
  'limit',
  'page',
  'pageSize',
  'hasMore',
  'hasNextPage',
  'pageInfo { hasNextPage hasPreviousPage }',
  // Facets
  'facets { name }',
  'filters { name }',
  'aggregations { name }',
  // Sort
  'sort',
  'sortOptions',
  // Query echo
  'query',
  'searchTerm',
  'correctedQuery',
  'suggestion',
  'suggestions',
  // Banners
  'banners',
  // Try as direct array (ProductSearchResult might have `content`)
  'content { id }',
]

const validPSRFields = ['__typename']
for (const field of psrFields) {
  try {
    const result = await gql(`{
      shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
        ${field}
      }
    }`)
    if (result.data?.shop_search) {
      const fieldName = field.split('{')[0].split('(')[0].trim()
      const value = result.data.shop_search[fieldName]
      if (value !== undefined) {
        validPSRFields.push(field)
        console.log(`  ✅ ${field}: ${JSON.stringify(value)?.substring(0, 200)}`)
      }
    } else if (result.errors) {
      const msg = result.errors[0]?.message || ''
      if (!msg.includes('no field') && !msg.includes('parsing error') && !msg.includes('not defined')) {
        console.log(`  ❓ ${field}: ${msg.substring(0, 100)}`)
      }
    }
  } catch (e) {
    // skip
  }
}

console.log(`\nValid ProductSearchResult fields: ${validPSRFields.join(', ')}`)

// 2. Try fetching a full product with price now
console.log('\n=== Full product with variation prices ===')
const fullResult = await gql(`{
  core_product(id: "${testId}") {
    id
    name
    shortDescription
    differentiatingFeature
    variations {
      id
      sku
      shortDescription
      price { amount currencyCode }
      images { url }
      link { url }
    }
  }
}`)
if (fullResult.data?.core_product) {
  const p = fullResult.data.core_product
  console.log(`Product: ${p.name}`)
  console.log(`Short desc: ${p.shortDescription}`)
  console.log(`Feature: ${p.differentiatingFeature}`)
  for (const v of p.variations || []) {
    console.log(`  Variation ${v.sku}: $${v.price?.amount} ${v.price?.currencyCode}`)
    console.log(`    Image: ${v.images?.[0]?.url?.substring(0, 100)}`)
    console.log(`    Link: ${v.link?.url}`)
  }
} else {
  console.log(JSON.stringify(fullResult).substring(0, 500))
}

// 3. Try Item (Variation) fields for more data
console.log('\n=== More Item (Variation) fields ===')
const itemFields = [
  'name',
  'description',
  'longDescription',
  'categories { id name }',
  'category { id name }',
  'features { name value }',
  'attributes { name value }',
  'color { displayName hexCode }',
  'color { displayName }',
  'availability { available }',
  'availability { status }',
  'availability { deliverable }',
  'availability { inStock }',
  'availability { availableQuantity }',
  'availability { message }',
  'availability { type }',
  'partNumber',
  'articleNumber',
  'materialNumber',
  'brand { name }',
  'brand',
  'compatibleCarModels { id name }',
  'carModels { id name }',
  'fitment',
  'fitments { id name }',
  'weight',
  'dimensions',
  'deliveryTime',
  'deliveryInfo',
]

const validItemFields = ['id', 'sku', 'shortDescription', 'price { amount currencyCode }', 'images { url }', 'link { url }']
for (const field of itemFields) {
  try {
    const result = await gql(`{
      core_product(id: "${testId}") {
        variations {
          ${field}
        }
      }
    }`)
    if (result.data?.core_product?.variations) {
      const firstVar = result.data.core_product.variations[0]
      const fieldName = field.split('{')[0].split('(')[0].trim()
      const value = firstVar?.[fieldName]
      if (value !== undefined) {
        validItemFields.push(field)
        console.log(`  ✅ ${field}: ${JSON.stringify(value)?.substring(0, 150)}`)
      }
    } else if (result.errors) {
      const msg = result.errors[0]?.message || ''
      if (!msg.includes('no field') && !msg.includes('parsing error')) {
        console.log(`  ❓ ${field}: ${msg.substring(0, 100)}`)
      }
    }
  } catch (e) {
    // skip
  }
}

console.log(`\nValid Item fields: ${validItemFields.join(', ')}`)

// 4. Try to see if the JS bundle reveals the SearchResult field names
console.log('\n=== Checking Nuxt app JS for ProductSearchResult queries ===')
const htmlRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/', { headers: { ...HEADERS, Cookie: cookieParts.join('; ') } })
const html = await htmlRes.text()

// Find JS bundle URLs
const jsUrls = [...html.matchAll(/src="([^"]*\/_nuxt\/[^"]*\.js)"/g)].map(m => m[1])
console.log(`Found ${jsUrls.length} JS bundles`)

// Look for ProductSearchResult or search query patterns in first few bundles
for (const jsPath of jsUrls.slice(0, 10)) {
  const jsUrl = jsPath.startsWith('http') ? jsPath : `https://volkswagen-genuine-accessories.com${jsPath}`
  try {
    const jsRes = await fetch(jsUrl, { headers: HEADERS })
    const jsText = await jsRes.text()

    // Find ProductSearchResult references
    const psrMatches = [...jsText.matchAll(/ProductSearchResult[^}]{0,200}/g)]
    for (const m of psrMatches) {
      console.log(`  PSR: ${m[0].substring(0, 150)}`)
    }

    // Find shop_search query fragments
    const searchMatches = [...jsText.matchAll(/shop_search[^}]{0,300}/g)]
    for (const m of searchMatches) {
      console.log(`  Search: ${m[0].substring(0, 200)}`)
    }

    // Find GetFullCategory query fragments
    const catMatches = [...jsText.matchAll(/GetFullCategory[^}]{0,300}/g)]
    for (const m of catMatches) {
      console.log(`  Cat: ${m[0].substring(0, 200)}`)
    }

    // Look for "items" or similar in context of search/category
    const itemsMatches = [...jsText.matchAll(/(?:search|category|products?)[\w.]*\.(?:items|entries|hits|products|results|content|elements)\b/gi)]
    for (const m of itemsMatches.slice(0, 5)) {
      console.log(`  Items ref: ${m[0]}`)
    }
  } catch (e) {
    // skip unreachable bundles
  }
}
