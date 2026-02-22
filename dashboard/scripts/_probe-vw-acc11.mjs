#!/usr/bin/env node
// VW e-catalogue GraphQL - working queries for accessories with prices

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// 1. Get fresh access token
console.log('=== Getting access token ===')
const pageRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/', { headers: HEADERS })
const setCookies = pageRes.headers.getSetCookie?.() || []
let accessToken = null
let cookieParts = []
for (const c of setCookies) {
  const [nameVal] = c.split(';')
  cookieParts.push(nameVal)
  if (nameVal.startsWith('accessToken=')) accessToken = nameVal.replace('accessToken=', '')
}
const cookieStr = cookieParts.join('; ')
console.log(`Token: ${accessToken ? 'yes' : 'no'}`)

const GQL_URL = 'https://volkswagen-genuine-accessories.com/au/api/graphql/'
const gqlHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Authorization: `Bearer ${accessToken}`,
  Cookie: cookieStr,
  Origin: 'https://volkswagen-genuine-accessories.com',
  Referer: 'https://volkswagen-genuine-accessories.com/au/en/',
}

async function gql(query, variables = {}, operationName = null) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: gqlHeaders,
    body: JSON.stringify({ query, variables, ...(operationName ? { operationName } : {}) })
  })
  return res.json()
}

// 2. Get a single product detail to discover available fields
console.log('\n=== Fetching single product detail ===')
const productId = 'VW-ACC-7H2061245E RUY' // Textile floor mats from earlier search
const productResult = await gql(`
  query CoreProduct($coreProductId: ID!) {
    core_product(id: $coreProductId) {
      id
      name
      description
      price { value currency formattedValue }
      images { url altText }
      categories { id name }
      features { name value }
      variations { id name price { value currency } color { displayName hexCode } }
      compatibleCarModels { id name }
    }
  }
`, { coreProductId: productId }, 'CoreProduct')

if (productResult.errors) {
  console.log(`Errors: ${JSON.stringify(productResult.errors).substring(0, 500)}`)
  // Try with fewer fields
  const simpleResult = await gql(`
    query CoreProduct($coreProductId: ID!) {
      core_product(id: $coreProductId) {
        id
        name
      }
    }
  `, { coreProductId: productId })
  console.log(`Simple query: ${JSON.stringify(simpleResult).substring(0, 500)}`)

  // Introspect the Product type
  console.log('\n=== Introspecting Product type ===')
  const introspection = await gql(`{
    __type(name: "Product") {
      name
      fields {
        name
        type { name kind ofType { name kind } }
      }
    }
  }`)
  if (introspection.data?.__type) {
    console.log(`Product fields:`)
    for (const f of introspection.data.__type.fields) {
      const typeName = f.type.name || f.type.ofType?.name || f.type.kind
      console.log(`  ${f.name}: ${typeName}`)
    }
  } else {
    console.log(`Introspection: ${JSON.stringify(introspection).substring(0, 500)}`)
  }
} else {
  console.log(`Product: ${JSON.stringify(productResult.data).substring(0, 500)}`)
}

// 3. Introspect the SearchResult type to find correct fields
console.log('\n=== Introspecting SearchResult type ===')
const searchIntrospection = await gql(`{
  __type(name: "SearchResult") {
    name
    fields {
      name
      type { name kind ofType { name kind ofType { name kind } } }
    }
  }
}`)
if (searchIntrospection.data?.__type) {
  console.log(`SearchResult fields:`)
  for (const f of searchIntrospection.data.__type.fields) {
    const typeName = f.type.name || f.type.ofType?.name || f.type.kind
    console.log(`  ${f.name}: ${typeName}`)
  }
} else {
  console.log(`Introspection: ${JSON.stringify(searchIntrospection).substring(0, 500)}`)
}

// 4. Introspect Category type
console.log('\n=== Introspecting Category type ===')
const catIntrospection = await gql(`{
  __type(name: "Category") {
    name
    fields {
      name
      type { name kind ofType { name kind ofType { name kind } } }
    }
  }
}`)
if (catIntrospection.data?.__type) {
  console.log(`Category fields:`)
  for (const f of catIntrospection.data.__type.fields) {
    const typeName = f.type.name || f.type.ofType?.name || f.type.kind
    console.log(`  ${f.name}: ${typeName}`)
  }
}

// 5. Try fetching categories
console.log('\n=== Fetching category tree ===')
const catResult = await gql(`{
  core_category(id: "160985513") {
    id
    name
    children { id name }
  }
}`)
console.log(`Category: ${JSON.stringify(catResult.data || catResult.errors).substring(0, 500)}`)

// 6. Use search suggest to discover a wide range of products
console.log('\n=== Search suggest for various terms ===')
const terms = ['mat', 'bar', 'rack', 'roof', 'tow', 'wheel', 'dash', 'cargo', 'liner', 'spoiler', 'pedal', 'guard', 'step', 'stripe', 'canopy', 'charger', 'carrier', 'protection', 'cover', 'light']
const allProducts = new Map()

for (const term of terms) {
  const result = await gql(`
    query coreSearchSuggest($query: String!, $limit: Int!) {
      core_searchSuggest(query: $query) {
        productSuggests {
          products(limit: $limit) {
            id
            name
          }
        }
      }
    }
  `, { query: term, limit: 20 })

  const products = result.data?.core_searchSuggest?.productSuggests?.[0]?.products || []
  let newCount = 0
  for (const p of products) {
    if (!allProducts.has(p.id)) {
      allProducts.set(p.id, p.name)
      newCount++
    }
  }
  if (products.length > 0) console.log(`  "${term}": ${products.length} results, ${newCount} new`)
}

console.log(`\nTotal unique products discovered: ${allProducts.size}`)
for (const [id, name] of [...allProducts.entries()].slice(0, 20)) {
  console.log(`  ${id}: ${name}`)
}
