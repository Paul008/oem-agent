#!/usr/bin/env node
// VW GraphQL - find prices via variations and fix category/search queries

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
const variationId = 'VW-7H2061245E RUY'  // from variations[0].id

// 1. Discover Variation fields (especially price)
console.log('=== Variation fields ===')
const varFields = [
  'id', 'name', 'shortDescription',
  'price { value currency formattedValue }',
  'price { value currency }',
  'price',
  'grossPrice { value currency formattedValue }',
  'grossPrice',
  'netPrice { value currency }',
  'salesPrice { value currency }',
  'formattedPrice',
  'priceFormatted',
  'displayPrice',
  'amount',
  'cost',
  'color { displayName hexCode }',
  'color { displayName }',
  'images { url }',
  'image { url }',
  'sku',
  'articleNumber',
  'materialNumber',
  'partNumber',
  'availability',
  'inStock',
  'deliverable',
  'orderable',
  'purchasable',
  'link { url }',
  'features { name value }',
  'attributes { name value }',
  'dimensions',
  'weight',
  'brand { name }',
  'carModels { id name }',
  'compatibleCarModels { id name }',
]

const validVarFields = []
for (const field of varFields) {
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
        validVarFields.push(field)
        console.log(`  ✅ ${field}: ${JSON.stringify(value).substring(0, 150)}`)
      }
    } else if (result.errors) {
      const msg = result.errors[0]?.message || ''
      if (!msg.includes('no field') && !msg.includes('parsing error')) {
        console.log(`  ❓ ${field}: ${msg.substring(0, 80)}`)
      }
    }
  } catch (e) {
    // skip
  }
}

console.log(`\nValid variation fields: ${validVarFields.join(', ')}`)

// 2. Try GetFullCategory with filter param
console.log('\n=== GetFullCategory with filter ===')
const catQueries = [
  // With empty filter
  {
    query: `query GetFullCategory($id: ID!, $paging: SearchPaging!, $filter: CategorySearchFilter!) {
      core_category(id: $id) {
        id name
        products(paging: $paging, filter: $filter) { items { id name } }
      }
    }`,
    variables: { id: '160985517', paging: { offset: 0, limit: 5 }, filter: {} }
  },
  // Without filter but with selectedCarModelId
  {
    query: `query GetFullCategory($id: ID!, $paging: SearchPaging!, $selectedCarModelId: String) {
      core_category(id: $id) {
        id name
        products(paging: $paging, selectedCarModelId: $selectedCarModelId) { items { id name } }
      }
    }`,
    variables: { id: '160985517', paging: { offset: 0, limit: 5 } }
  },
  // Try raster field instead
  {
    query: `{ core_category(id: "160985517") { id name raster { totalHeight totalWidth elements { column height width } } } }`,
    variables: {}
  },
]

for (const q of catQueries) {
  const result = await gql(q.query, q.variables)
  if (result.data) {
    console.log(`  ✅ ${JSON.stringify(result.data).substring(0, 500)}`)
  } else if (result.errors) {
    console.log(`  ❌ ${result.errors[0]?.message?.substring(0, 200)}`)
  }
}

// 3. Try ShopSearch with correct structure
console.log('\n=== ShopSearch fixed ===')
const searchQueries = [
  // Minimal items
  {
    query: `query ShopSearch($filter: SearchFilter!, $paging: SearchPaging!) {
      shop_search(filter: $filter, paging: $paging) {
        items { id name }
      }
    }`,
    variables: { filter: { searchTerm: 'mat' }, paging: { offset: 0, limit: 5 } }
  },
  // With selectedCarModelId
  {
    query: `query ShopSearch($filter: SearchFilter!, $paging: SearchPaging!, $selectedCarModelId: String) {
      shop_search(filter: $filter, paging: $paging, selectedCarModelId: $selectedCarModelId) {
        items { id name }
      }
    }`,
    variables: { filter: { searchTerm: 'mat' }, paging: { offset: 0, limit: 5 } }
  },
]

for (const q of searchQueries) {
  const result = await gql(q.query, q.variables)
  if (result.data) {
    console.log(`  ✅ ${JSON.stringify(result.data).substring(0, 500)}`)
  } else if (result.errors) {
    console.log(`  ❌ ${result.errors[0]?.message?.substring(0, 200)}`)
  }
}

// 4. Try to get the shop_product type (shop-specific with price)
console.log('\n=== Shop product (with price?) ===')
const shopProductQueries = [
  `{ shop_product(id: "${testId}") { id name price { value } } }`,
  `{ shop_product(id: "${variationId}") { id name price { value } } }`,
  `{ shop_article(id: "${testId}") { id name price { value } } }`,
  `{ shop_article(id: "${variationId}") { id name price { value } } }`,
]

for (const q of shopProductQueries) {
  const result = await gql(q)
  if (result.data) {
    console.log(`  ✅ ${JSON.stringify(result.data).substring(0, 300)}`)
  } else if (result.errors) {
    const msg = result.errors[0]?.message || ''
    if (!msg.includes('no field') && !msg.includes('parsing error') && !msg.includes('not defined')) {
      console.log(`  ❌ ${msg.substring(0, 200)}`)
    }
  }
}

// 5. Fetch a product page from the e-catalogue to see if price is rendered
console.log('\n=== Product page HTML (checking for price) ===')
const productPageUrl = 'https://volkswagen-genuine-accessories.com/au/en/p/textile-floor-mats/VW-7H2061245E%20RUY/'
const prodRes = await fetch(productPageUrl, { headers: { ...HEADERS, Cookie: cookieParts.join('; ') } })
const prodHtml = await prodRes.text()
console.log(`Product page: ${prodRes.status} (${prodHtml.length} bytes)`)

// Find prices in the HTML
const prices = [...prodHtml.matchAll(/\$\s?[\d,]+(?:\.\d{2})?/g)]
console.log(`Prices in HTML: ${prices.length}`)
for (const p of [...new Set(prices.map(m => m[0]))]) console.log(`  ${p}`)

// Find the Nuxt data
const nuxtMatch = prodHtml.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
if (nuxtMatch) {
  const rawData = JSON.parse(nuxtMatch[1])
  // Find price values
  const priceNums = rawData.filter(e => typeof e === 'number' && e > 5 && e < 50000)
  console.log(`\nNumeric values (5-50000) in Nuxt data: ${priceNums.length}`)
  for (const p of priceNums) console.log(`  ${p}`)

  // Find price-like strings
  const priceStrings = rawData.filter(e => typeof e === 'string' && /^\$?\d[\d,.]*$/.test(e))
  console.log(`\nPrice-like strings: ${priceStrings.length}`)
  for (const p of priceStrings) console.log(`  ${p}`)

  // Find strings containing dollar sign
  const dollarStrings = rawData.filter(e => typeof e === 'string' && e.includes('$'))
  console.log(`\nStrings with $: ${dollarStrings.length}`)
  for (const d of dollarStrings.slice(0, 10)) console.log(`  ${d.substring(0, 100)}`)

  // Find "price" in strings
  const priceRefs = rawData.filter(e => typeof e === 'string' && e.toLowerCase().includes('price'))
  console.log(`\nStrings with "price": ${priceRefs.length}`)
  for (const p of priceRefs.slice(0, 10)) console.log(`  ${p.substring(0, 100)}`)
}
