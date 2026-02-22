#!/usr/bin/env node
// VW GraphQL - find price field and category product listings

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

async function gql(query) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: gqlHeaders,
    body: JSON.stringify({ query })
  })
  return res.json()
}

const testId = 'VW-ACC-7H2061245E RUY'

// 1. More price field names
console.log('=== More Product fields ===')
const fields = [
  // Price variations
  'grossPrice { value currency formattedValue }',
  'grossPrice { value currency }',
  'grossPrice',
  'netPrice { value currency }',
  'netPrice',
  'salesPrice { value currency }',
  'salesPrice',
  'listPrice { value currency }',
  'listPrice',
  'retailPrice { value currency }',
  'recommendedRetailPrice { value currency }',
  'rrp { value currency }',
  'startingPrice { value currency }',
  'prices { value currency }',
  'priceInfo { value currency }',
  'pricing { value currency }',
  'amount { value currency }',
  'cost { value currency }',
  'formattedPrice',
  'priceFormatted',
  'displayPrice',
  'priceText',
  'priceLabel',
  'priceDisplay',
  'salePrice',
  'originalPrice',
  // Known to need subfields
  'brand { name id }',
  'link { url label type }',
  'link { url }',
  // Images
  'images { url type label }',
  'image { url }',
  'imageUrl',
  'mainImage',
  'pictures',
  'media { url type }',
  'thumbnail { url }',
  'gallery { url }',
  // More metadata
  'longDescription',
  'articleNumber',
  'ean',
  'gtin',
  'materialNumber',
  'externalId',
  'partNumber',
  'itemCode',
  'sku',
  'code',
  'referenceId',
  // Fitment
  'carModels { id name }',
  'vehicles',
  'compatibleModels { id name }',
  'fitment',
  'fitments',
  'applicableModels',
  // Status
  'availability',
  'inStock',
  'stock',
  'deliverable',
  'orderable',
  'purchasable',
  // Others
  'type',
  'productType',
  'tags',
  'labels',
  'attributes { name value }',
  'features { name value }',
  'properties { name value }',
  'specifications { name value }',
  'dimensions',
  'weight',
  'color',
  'rating',
  'reviewCount',
  'url',
  'slug',
  'path',
  'variations { id }',
  'variants { id }',
  'options { id }',
  'children { id }',
  'relatedProducts { id }',
  'accessories { id }',
  'crossSells { id }',
  'upSells { id }',
]

const validFields = ['id', 'name', 'shortDescription', 'differentiatingFeature']

for (const field of fields) {
  try {
    const result = await gql(`{
      core_product(id: "${testId}") {
        ${field}
      }
    }`)
    if (result.data?.core_product) {
      const fieldName = field.split('{')[0].split('(')[0].trim()
      const value = result.data.core_product[fieldName]
      if (value !== null && value !== undefined) {
        validFields.push(field)
        console.log(`  ✅ ${field}: ${JSON.stringify(value).substring(0, 150)}`)
      } else {
        console.log(`  ✅ ${field}: null`)
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

console.log(`\n=== All valid fields ===`)
console.log(validFields.join('\n'))

// 2. Also try category fields for product listing
console.log('\n=== Category product listing fields ===')
const catFields = [
  'products(paging: {offset: 0, limit: 3}) { items { id name } count }',
  'products(paging: {offset: 0, limit: 3}) { items { id name } }',
  'products(paging: {offset: 0, limit: 3}) { nodes { id name } }',
  'products(paging: {offset: 0, limit: 3}) { edges { node { id name } } }',
  'products { id name }',
  'articles(paging: {offset: 0, limit: 3}) { items { id name } }',
  'articles { id name }',
  'items(paging: {offset: 0, limit: 3}) { id name }',
  'searchProducts(paging: {offset: 0, limit: 3}) { items { id name } }',
]

for (const field of catFields) {
  try {
    const result = await gql(`{
      core_category(id: "160985517") {
        id name
        ${field}
      }
    }`)
    if (result.data?.core_category) {
      const data = result.data.core_category
      // Remove id and name, show what's left
      const { id, name, ...rest } = data
      if (Object.keys(rest).length > 0) {
        console.log(`  ✅ ${field.substring(0, 80)}: ${JSON.stringify(rest).substring(0, 300)}`)
      }
    } else if (result.errors) {
      const msg = result.errors[0]?.message || ''
      if (!msg.includes('no field') && !msg.includes('parsing error') && !msg.includes('not defined')) {
        console.log(`  ❓ ${field.substring(0, 80)}: ${msg.substring(0, 80)}`)
      }
    }
  } catch (e) {
    // skip
  }
}

// 3. Try search with different result fields
console.log('\n=== Search result fields ===')
const searchFields = [
  '{ items { id name } count }',
  '{ items { id name } total }',
  '{ items { id name } totalItems }',
  '{ items { id name } numberOfResults }',
  '{ items { id name } resultCount }',
  '{ items { id name } }',
  '{ products { id name } }',
  '{ results { id name } }',
  '{ nodes { id name } }',
  '{ edges { node { id name } } }',
]

for (const field of searchFields) {
  try {
    const result = await gql(`{
      shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 3}) ${field}
    }`)
    if (result.data?.shop_search) {
      console.log(`  ✅ ${field}: ${JSON.stringify(result.data.shop_search).substring(0, 300)}`)
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
