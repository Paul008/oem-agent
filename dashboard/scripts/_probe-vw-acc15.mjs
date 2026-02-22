#!/usr/bin/env node
// VW GraphQL - discover Money subfields on Variation.price and SearchResult product listing fields

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

console.log(`Token: ${accessToken ? 'yes' : 'no'}`)

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

// 1. Discover Money subfields on Variation.price
console.log('=== Money subfields on Variation.price ===')
const moneyFields = [
  // Common GraphQL money patterns
  'amount',
  'formatted',
  'centAmount',
  'net',
  'gross',
  'display',
  'text',
  'raw',
  'label',
  'formattedAmount',
  'formattedGross',
  'formattedNet',
  'grossValue',
  'netValue',
  'taxValue',
  'tax',
  'total',
  'subtotal',
  // Commercetools patterns (VW uses OSSE which may be commercetools-based)
  'currencyCode',
  'centPrecision',
  'fractionDigits',
  'type',
  // SAP Commerce / Hybris patterns
  'formattedValue',
  'value',
  'priceType',
  'maxQuantity',
  'minQuantity',
  // Spryker patterns
  'grossAmount',
  'netAmount',
  'taxRate',
  // Shopware patterns
  'unitPrice',
  'totalPrice',
  'calculatedPrice',
  // Generic
  'currency',
  'code',
  'symbol',
  'number',
  'decimal',
  'integer',
  'string',
  'float',
]

const validMoneyFields = []
for (const field of moneyFields) {
  try {
    const result = await gql(`{
      core_product(id: "${testId}") {
        variations {
          price { ${field} }
        }
      }
    }`)
    if (result.data?.core_product?.variations) {
      const price = result.data.core_product.variations[0]?.price
      if (price && price[field] !== undefined) {
        validMoneyFields.push(field)
        console.log(`  ✅ ${field}: ${JSON.stringify(price[field])}`)
      } else if (price) {
        console.log(`  ✅ ${field}: (exists but null/undefined) price=${JSON.stringify(price)}`)
        validMoneyFields.push(field)
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

console.log(`\nValid Money fields: ${validMoneyFields.join(', ')}`)

// If we found valid money fields, fetch full price
if (validMoneyFields.length > 0) {
  console.log('\n=== Full price with all valid fields ===')
  const priceQuery = `{
    core_product(id: "${testId}") {
      variations {
        id
        name
        sku
        price { ${validMoneyFields.join(' ')} }
      }
    }
  }`
  const priceResult = await gql(priceQuery)
  if (priceResult.data?.core_product?.variations) {
    for (const v of priceResult.data.core_product.variations) {
      console.log(`  ${v.sku || v.id}: price=${JSON.stringify(v.price)}`)
    }
  }
}

// 2. Discover SearchResult fields
console.log('\n=== SearchResult fields ===')
const searchResultFields = [
  // Pagination / listing
  'entries { id name }',
  'hits { id name }',
  'documents { id name }',
  'records { id name }',
  'data { id name }',
  'content { id name }',
  'list { id name }',
  'page { id name }',
  'pageContent { id name }',
  'searchItems { id name }',
  'resultItems { id name }',
  'pagination { offset limit }',
  'paging { offset limit }',
  // Try just scalar fields to discover what exists
  'totalCount',
  'count',
  'total',
  'totalItems',
  'totalResults',
  'numberOfResults',
  'resultCount',
  'numFound',
  'size',
  'length',
  'offset',
  'limit',
  'page',
  'pageSize',
  'hasMore',
  'hasNextPage',
  'hasPreviousPage',
  'currentPage',
  'totalPages',
  // Facets
  'facets { name values { value count } }',
  'filters { name values { value count } }',
  'aggregations { name values { value count } }',
  // Suggestions
  'suggestions { text }',
  'didYouMean',
  'correctedQuery',
  'spellCheck',
]

const validSearchFields = []
for (const field of searchResultFields) {
  try {
    const result = await gql(`{
      shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
        ${field}
      }
    }`)
    if (result.data?.shop_search) {
      const fieldName = field.split('{')[0].split('(')[0].trim()
      const value = result.data.shop_search[fieldName]
      validSearchFields.push(field)
      console.log(`  ✅ ${field}: ${JSON.stringify(value)?.substring(0, 200)}`)
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

console.log(`\nValid SearchResult fields: ${validSearchFields.join(', ')}`)

// 3. Also try Category product listing fields
console.log('\n=== Category product listing fields ===')
const catProductFields = [
  'entries { id name }',
  'hits { id name }',
  'documents { id name }',
  'content { id name }',
  'list { id name }',
  'searchItems { id name }',
  'resultItems { id name }',
  // Maybe SearchResult IS the product list and we need different approach
  'items(limit: 3) { id name }',
  'products(limit: 3) { id name }',
  'entries(limit: 3) { id name }',
  // Or maybe products returns SearchResult directly and items is nested
  // Try nesting differently
]

for (const field of catProductFields) {
  try {
    const result = await gql(`{
      core_category(id: "160985517") {
        id name
        products(paging: {offset: 0, limit: 3}) {
          ${field}
        }
      }
    }`)
    if (result.data?.core_category) {
      const products = result.data.core_category.products
      if (products) {
        console.log(`  ✅ products > ${field}: ${JSON.stringify(products).substring(0, 300)}`)
      }
    } else if (result.errors) {
      const msg = result.errors[0]?.message || ''
      if (!msg.includes('no field') && !msg.includes('parsing error') && !msg.includes('not defined')) {
        console.log(`  ❓ products > ${field}: ${msg.substring(0, 100)}`)
      }
    }
  } catch (e) {
    // skip
  }
}

// 4. Try the raw response from SearchResult — maybe it IS the array
console.log('\n=== Is SearchResult itself a list? ===')
// Try querying shop_search and requesting Product fields directly on it
const directFields = [
  'id',
  'name',
  'totalCount',
  'offset',
  'limit',
  'query',
  'searchTerm',
  '__typename',
]

for (const field of directFields) {
  try {
    const result = await gql(`{
      shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) {
        ${field}
      }
    }`)
    if (result.data?.shop_search) {
      console.log(`  ✅ ${field}: ${JSON.stringify(result.data.shop_search[field])}`)
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

// 5. Try to capture the exact error messages to understand the type system
console.log('\n=== Error message analysis ===')
const typeProbes = [
  { name: 'SearchResult.__typename', q: '{ shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) { __typename } }' },
  { name: 'Category.products type', q: '{ core_category(id: "160985517") { products(paging: {offset: 0, limit: 3}) { __typename } } }' },
  { name: 'Product.__typename', q: `{ core_product(id: "${testId}") { __typename } }` },
  { name: 'Variation.__typename', q: `{ core_product(id: "${testId}") { variations { __typename } } }` },
  { name: 'Money.__typename', q: `{ core_product(id: "${testId}") { variations { price { __typename } } } }` },
]

for (const probe of typeProbes) {
  const result = await gql(probe.q)
  if (result.data) {
    console.log(`  ${probe.name}: ${JSON.stringify(result.data).substring(0, 300)}`)
  } else if (result.errors) {
    console.log(`  ${probe.name}: ${result.errors[0]?.message?.substring(0, 200)}`)
  }
}
