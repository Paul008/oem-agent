#!/usr/bin/env node
// VW GraphQL - SearchResultEntry fields + CoreItem fragment + full extraction test

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

// 1. Discover SearchResultEntry fields
console.log('=== SearchResultEntry fields ===')
const sreFields = [
  '__typename',
  'product { id name }',
  'item { id name }',
  'node { id name }',
  'productId',
  'itemId',
  'name',
  'title',
  'label',
  'price { amount currencyCode }',
  'image { url }',
  'images { url }',
  'thumbnail { url }',
  'link { url }',
  'url',
  'description',
  'shortDescription',
  'sku',
  'partNumber',
  'articleNumber',
  'score',
  'relevance',
  'rank',
  'position',
  'type',
  'category { id name }',
  'categories { id name }',
  'brand { name }',
  'availability',
  'inStock',
  'variations { id }',
  'highlighted',
  'snippet',
  'matching',
  // The CoreItem fragment from JS shows Item has these:
  'product { id name differentiatingFeature }',
  'item { id sku price { amount currencyCode } }',
]

const validSREFields = []
for (const field of sreFields) {
  try {
    const result = await gql(`{
      shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 1}) {
        ... on ProductSearchResult {
          entries {
            ${field}
          }
        }
      }
    }`)
    if (result.data?.shop_search?.entries) {
      const entry = result.data.shop_search.entries[0]
      const fieldName = field.split('{')[0].split('(')[0].trim()
      const value = entry?.[fieldName]
      if (value !== undefined) {
        validSREFields.push(field)
        console.log(`  ✅ ${field}: ${JSON.stringify(value)?.substring(0, 200)}`)
      }
    } else if (result.errors) {
      const msg = result.errors[0]?.message || ''
      if (!msg.includes('no field') && !msg.includes('parsing error') && !msg.includes('not defined')) {
        console.log(`  ❓ ${field}: ${msg.substring(0, 120)}`)
      }
    }
  } catch (e) {
    // skip
  }
}

console.log(`\nValid SearchResultEntry fields: ${validSREFields.join(', ')}`)

// 2. If we found product field, get full product data from entries
if (validSREFields.some(f => f.startsWith('product'))) {
  console.log('\n=== Full search with product details ===')
  const searchResult = await gql(`{
    shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 5}) {
      ... on ProductSearchResult {
        totalCount
        entries {
          product {
            id name shortDescription differentiatingFeature
            variations {
              id sku
              price { amount currencyCode }
              images { url }
            }
          }
        }
      }
    }
  }`)
  if (searchResult.data?.shop_search) {
    const sr = searchResult.data.shop_search
    console.log(`Total: ${sr.totalCount}`)
    for (const e of sr.entries || []) {
      const p = e.product
      console.log(`  ${p?.name} (${p?.id})`)
      for (const v of p?.variations || []) {
        console.log(`    ${v.sku}: $${v.price?.amount} ${v.price?.currencyCode}`)
      }
    }
  } else {
    console.log(JSON.stringify(searchResult).substring(0, 500))
  }
}

// 3. Test category product listing with entries
console.log('\n=== Category product listing with entries ===')
const CATEGORIES = [
  { name: 'Sport & Design', id: '160985513' },
  { name: 'Transport', id: '160985549' },
  { name: 'Comfort & Protection', id: '160985565' },
  { name: 'Communication', id: '160988427' },
  { name: 'Wheels', id: '160988447' },
  { name: 'E-Charging', id: '160988463' },
  { name: 'Lifestyle', id: '198280310' },
]

// First test one category
const catResult = await gql(`query GetFullCategory($coreCategoryId: ID!, $paging: SearchPaging!, $filter: CategorySearchFilter!) {
  core_category(id: $coreCategoryId) {
    id name
    children { id name }
    products(paging: $paging, filter: $filter) {
      ... on ProductSearchResult {
        totalCount
        entries {
          product {
            id name shortDescription
            variations {
              id sku
              price { amount currencyCode }
              images { url }
            }
          }
        }
      }
    }
  }
}`, { coreCategoryId: '160985513', paging: { offset: 0, limit: 5 }, filter: {} })

if (catResult.data?.core_category) {
  const cat = catResult.data.core_category
  console.log(`\nCategory: ${cat.name} (${cat.id})`)
  console.log(`Children: ${cat.children?.map(c => c.name).join(', ')}`)
  console.log(`Total products: ${cat.products?.totalCount}`)
  for (const e of cat.products?.entries || []) {
    const p = e.product
    console.log(`  ${p?.name} — ${p?.variations?.map(v => `${v.sku}: $${v.price?.amount}`).join(', ')}`)
  }
} else {
  console.log(JSON.stringify(catResult).substring(0, 500))
}

// 4. Count products across all top-level categories
console.log('\n=== Product counts per category ===')
let totalProducts = 0
for (const cat of CATEGORIES) {
  const result = await gql(`query GetFullCategory($coreCategoryId: ID!, $paging: SearchPaging!, $filter: CategorySearchFilter!) {
    core_category(id: $coreCategoryId) {
      id name
      children { id name }
      products(paging: $paging, filter: $filter) {
        ... on ProductSearchResult {
          totalCount
        }
      }
    }
  }`, { coreCategoryId: cat.id, paging: { offset: 0, limit: 1 }, filter: {} })

  const data = result.data?.core_category
  if (data) {
    const count = data.products?.totalCount || 0
    totalProducts += count
    console.log(`  ${data.name}: ${count} products, ${data.children?.length || 0} subcategories`)
    // Also check subcategories
    for (const child of data.children || []) {
      const subResult = await gql(`query GetFullCategory($coreCategoryId: ID!, $paging: SearchPaging!, $filter: CategorySearchFilter!) {
        core_category(id: $coreCategoryId) {
          id name
          products(paging: $paging, filter: $filter) {
            ... on ProductSearchResult { totalCount }
          }
        }
      }`, { coreCategoryId: child.id, paging: { offset: 0, limit: 1 }, filter: {} })
      const subData = subResult.data?.core_category
      if (subData) {
        const subCount = subData.products?.totalCount || 0
        if (subCount > 0) console.log(`    ${subData.name}: ${subCount}`)
      }
    }
  }
}
console.log(`\nTotal products across all categories: ${totalProducts}`)
