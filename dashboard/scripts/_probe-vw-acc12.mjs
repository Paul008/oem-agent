#!/usr/bin/env node
// VW GraphQL - discover Product fields and extract complete accessory data

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
}

// Get token
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

// 1. Try different field names on Product
console.log('=== Discovering Product fields ===')
const fieldTests = [
  // Price fields
  'price { value currency formattedValue }',
  'price { value currency }',
  'price',
  'formattedPrice',
  'priceValue',
  'basePrice',
  'retailPrice',
  'msrp',
  // Image fields
  'images { url }',
  'image { url }',
  'imageUrl',
  'mainImage { url }',
  'pictures { url }',
  'media { url }',
  // Description
  'longDescription',
  'shortDescription',
  'summary',
  'text',
  'content',
  // IDs and codes
  'sku',
  'code',
  'articleNumber',
  'partNumber',
  'materialNumber',
  // Metadata
  'categories { id name }',
  'category { id name }',
  'brand',
  'manufacturer',
  // Car model association
  'compatibleCarModels { id name }',
  'carModels { id name }',
  'vehicles { id name }',
  'fitments { id name }',
  // Variations
  'variations { id name }',
  'variants { id name }',
  'options { id name }',
  // General
  'type',
  'status',
  'availability',
  'inStock',
  'url',
  'slug',
  'link',
  'differentiatingFeature',
]

const validFields = ['id', 'name']  // Known to work

for (const field of fieldTests) {
  try {
    const result = await gql(`{
      core_product(id: "${testId}") {
        ${field}
      }
    }`)
    if (result.data?.core_product) {
      const value = result.data.core_product
      const fieldName = field.split('{')[0].split(' ')[0].trim()
      validFields.push(field)
      const display = JSON.stringify(value[fieldName])
      console.log(`  ✅ ${field}: ${display?.substring(0, 100) || 'null'}`)
    } else if (result.errors) {
      // Only show non-parsing errors
      const msg = result.errors[0]?.message || ''
      if (!msg.includes('no field')) {
        console.log(`  ❌ ${field}: ${msg.substring(0, 80)}`)
      }
    }
  } catch (e) {
    console.log(`  ⚠️ ${field}: ${e.message}`)
  }
}

console.log(`\nValid fields: ${validFields.join(', ')}`)

// 2. Fetch a product with all valid fields
console.log('\n=== Full product with all valid fields ===')
const fullQuery = `{
  core_product(id: "${testId}") {
    ${validFields.join('\n    ')}
  }
}`
const fullResult = await gql(fullQuery)
console.log(JSON.stringify(fullResult.data?.core_product, null, 2)?.substring(0, 1000))

// 3. Get all categories with their subcategories
console.log('\n=== Full category tree ===')
const CATEGORIES = [
  { name: 'Sport & Design', id: '160985513' },
  { name: 'Transport', id: '160985549' },
  { name: 'Comfort & Protection', id: '160985565' },
  { name: 'Communication', id: '160988427' },
  { name: 'Wheels', id: '160988447' },
  { name: 'E-Charging', id: '160988463' },
  { name: 'Lifestyle', id: '198280310' },
]

const allCatIds = []
for (const cat of CATEGORIES) {
  const result = await gql(`{
    core_category(id: "${cat.id}") {
      id name
      children { id name children { id name } }
    }
  }`)
  const data = result.data?.core_category
  if (data) {
    console.log(`\n  ${data.name} (${data.id})`)
    allCatIds.push(data.id)
    for (const child of data.children || []) {
      console.log(`    ${child.name} (${child.id})`)
      allCatIds.push(child.id)
      for (const grandchild of child.children || []) {
        console.log(`      ${grandchild.name} (${grandchild.id})`)
        allCatIds.push(grandchild.id)
      }
    }
  }
}

// 4. Try to get products from a category
console.log('\n=== Products from category ===')
// Try different field names for the products list on Category
const catProductTests = [
  'products(paging: {offset: 0, limit: 5}) { items { id name } }',
  'products(paging: {offset: 0, limit: 5}) { edges { node { id name } } }',
  'products { items { id name } }',
  'articles(paging: {offset: 0, limit: 5}) { items { id name } }',
  'articles { id name }',
]

for (const test of catProductTests) {
  const result = await gql(`{
    core_category(id: "160985517") {
      id name
      ${test}
    }
  }`)
  if (result.data?.core_category) {
    const data = result.data.core_category
    console.log(`  ✅ ${test.substring(0, 60)}: ${JSON.stringify(data).substring(0, 300)}`)
  } else if (result.errors) {
    const msg = result.errors[0]?.message || ''
    if (!msg.includes('no field')) {
      console.log(`  ❌ ${test.substring(0, 60)}: ${msg.substring(0, 80)}`)
    }
  }
}

// 5. Try search to list products
console.log('\n=== Search with correct fields ===')
// Try different SearchResult fields
const searchTests = [
  'shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 5}) { items { id name } count }',
  'shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 5}) { items { id name } total }',
  'shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 5}) { items { id name } }',
  'shop_search(filter: {searchTerm: "mat"}, paging: {offset: 0, limit: 5}) { products { id name } }',
]

for (const test of searchTests) {
  const result = await gql(`{ ${test} }`)
  if (result.data) {
    console.log(`  ✅ ${test.substring(0, 80)}: ${JSON.stringify(result.data).substring(0, 300)}`)
  } else if (result.errors) {
    const msg = result.errors[0]?.message || ''
    if (!msg.includes('no field')) {
      console.log(`  ❌ ${test.substring(0, 80)}: ${msg.substring(0, 80)}`)
    }
  }
}
