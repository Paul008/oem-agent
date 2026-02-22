#!/usr/bin/env node
// VW GraphQL - extract full query patterns from JS bundle and test category product listings

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

// 1. Extract full queries from JS bundle
console.log('=== Extracting full queries from JS bundle ===')
const htmlRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/', { headers: { ...HEADERS, Cookie: cookieParts.join('; ') } })
const html = await htmlRes.text()
const jsUrls = [...html.matchAll(/src="([^"]*\/_nuxt\/[^"]*\.js)"/g)].map(m => m[1])

let jsText = ''
for (const jsPath of jsUrls) {
  const jsUrl = jsPath.startsWith('http') ? jsPath : `https://volkswagen-genuine-accessories.com${jsPath}`
  const jsRes = await fetch(jsUrl, { headers: HEADERS })
  jsText += await jsRes.text()
}
console.log(`Total JS: ${jsText.length} chars`)

// Find all GraphQL query strings (look for query/mutation keywords followed by operation names)
const queryPattern = /`((?:query|mutation)\s+\w+[\s\S]*?)`/g
const queries = []
let match
while ((match = queryPattern.exec(jsText)) !== null) {
  queries.push(match[1].substring(0, 500))
}

// Also find template literal fragments used for queries
const fragPattern = /fragment\s+(\w+)\s+on\s+(\w+)\s*\{[^`]*?\}/g
const fragments = []
while ((match = fragPattern.exec(jsText)) !== null) {
  fragments.push(match[0].substring(0, 300))
}

console.log(`Found ${queries.length} queries, ${fragments.length} fragments`)

// Show search-related queries
for (const q of queries) {
  if (q.includes('search') || q.includes('Search') || q.includes('category') || q.includes('Category')) {
    console.log(`\n--- Query ---`)
    console.log(q)
  }
}

// Show product-related fragments
for (const f of fragments) {
  if (f.includes('Product') || f.includes('Item') || f.includes('Search') || f.includes('Category')) {
    console.log(`\n--- Fragment ---`)
    console.log(f)
  }
}

// 2. Also look for inline query strings (non-template-literal)
console.log('\n=== Inline query strings ===')
// Look for the actual GetFullCategory query text
const getCatMatch = jsText.match(/GetFullCategory[^"]*"([^"]{100,1000})"/)
if (getCatMatch) {
  console.log(`GetFullCategory string: ${getCatMatch[1].substring(0, 500)}`)
}

// Find "SelectedCategoryPart" fragment
const selCatMatch = jsText.match(/SelectedCategoryPart[^`]{0,500}/)
if (selCatMatch) {
  console.log(`\nSelectedCategoryPart context: ${selCatMatch[0].substring(0, 300)}`)
}

// Find what comes after "ProductSearchResult {"
const psrBody = jsText.match(/on ProductSearchResult \{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g)
if (psrBody) {
  for (const m of psrBody.slice(0, 5)) {
    console.log(`\nPSR body: ${m.substring(0, 400)}`)
  }
}

// 3. Now try the working totalCount field and selectedCategory
console.log('\n\n=== Testing ProductSearchResult fields ===')

// Test totalCount (which we saw in the JS)
const totalCountResult = await gql(`{
  shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
    ... on ProductSearchResult {
      totalCount
    }
  }
}`)
console.log(`totalCount via inline fragment: ${JSON.stringify(totalCountResult).substring(0, 300)}`)

// Test without inline fragment but with totalCount
const totalCountResult2 = await gql(`query ShopSearch($filter: SearchFilter!, $paging: SearchPaging!) {
  shop_search(filter: $filter, paging: $paging) {
    ... on ProductSearchResult {
      totalCount
    }
  }
}`, { filter: { searchTerm: 'mat' }, paging: { offset: 0, limit: 50 } })
console.log(`totalCount via named query: ${JSON.stringify(totalCountResult2).substring(0, 300)}`)

// 4. Try selectedCategory
const selCatResult = await gql(`{
  shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
    ... on ProductSearchResult {
      totalCount
      selectedCategory {
        count
        category { id name link { url } }
      }
    }
  }
}`)
console.log(`\nselectedCategory: ${JSON.stringify(selCatResult).substring(0, 500)}`)

// 5. Try to find products field — maybe it needs inline fragment
const productsList = await gql(`{
  shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
    ... on ProductSearchResult {
      totalCount
      items { id name }
    }
  }
}`)
console.log(`\nitems via inline fragment: ${JSON.stringify(productsList).substring(0, 500)}`)

const productsListB = await gql(`{
  shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
    ... on ProductSearchResult {
      totalCount
      products { id name }
    }
  }
}`)
console.log(`products via inline fragment: ${JSON.stringify(productsListB).substring(0, 500)}`)

const productsListC = await gql(`{
  shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
    ... on ProductSearchResult {
      totalCount
      results { id name }
    }
  }
}`)
console.log(`results via inline fragment: ${JSON.stringify(productsListC).substring(0, 500)}`)

const productsListD = await gql(`{
  shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
    ... on ProductSearchResult {
      totalCount
      entries { id name }
    }
  }
}`)
console.log(`entries via inline fragment: ${JSON.stringify(productsListD).substring(0, 500)}`)

const productsListE = await gql(`{
  shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
    ... on ProductSearchResult {
      totalCount
      hits { id name }
    }
  }
}`)
console.log(`hits via inline fragment: ${JSON.stringify(productsListE).substring(0, 500)}`)

// 6. Test GetFullCategory with inline fragment
console.log('\n=== GetFullCategory with inline fragment ===')
const catResult = await gql(`query GetFullCategory($coreCategoryId: ID!, $paging: SearchPaging!, $filter: CategorySearchFilter!) {
  core_category(id: $coreCategoryId) {
    id
    name
    children { id name }
    products(paging: $paging, filter: $filter) {
      ... on ProductSearchResult {
        totalCount
      }
    }
  }
}`, { coreCategoryId: '160985517', paging: { offset: 0, limit: 50 }, filter: {} })
console.log(`Category totalCount: ${JSON.stringify(catResult).substring(0, 500)}`)
