#!/usr/bin/env node
// Try VW e-catalogue GraphQL with correct query format + extract all model page accessories

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// 1. Get fresh access token from the e-catalogue
console.log('=== Getting fresh access token ===')
const pageRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/c/sport-and-design/160985513/', {
  headers: HEADERS
})
const setCookies = pageRes.headers.getSetCookie?.() || []
let accessToken = null
let cookieParts = []
for (const c of setCookies) {
  const [nameVal] = c.split(';')
  cookieParts.push(nameVal)
  if (nameVal.startsWith('accessToken=')) {
    accessToken = nameVal.replace('accessToken=', '')
  }
}
const cookieStr = cookieParts.join('; ')
console.log(`Token: ${accessToken ? 'yes' : 'no'}`)

// 2. Try GraphQL with exact query format from the app
console.log('\n=== E-catalogue GraphQL with app queries ===')
const gqlUrl = 'https://volkswagen-genuine-accessories.com/au/api/graphql/'

const queries = [
  {
    name: 'GetFullCategory',
    query: `query GetFullCategory($coreCategoryId: ID!, $paging: SearchPaging!) {
      core_category(id: $coreCategoryId) {
        name
        id
        children { id name }
        products(paging: $paging) {
          totalCount
          items {
            id
            name
            price { value currency }
            variations { color { displayName } }
          }
        }
      }
    }`,
    variables: { coreCategoryId: '160985513', paging: { offset: 0, limit: 50 } }
  },
  {
    name: 'coreSearchSuggest',
    query: `query coreSearchSuggest($query: String!, $limit: Int!) {
      core_searchSuggest(query: $query) {
        productSuggests {
          products(limit: $limit) {
            id
            name
          }
        }
      }
    }`,
    variables: { query: 'mat', limit: 10 }
  },
  {
    name: 'ShopSearch',
    query: `query ShopSearch($filter: SearchFilter!, $paging: SearchPaging!) {
      shop_search(filter: $filter, paging: $paging) {
        totalCount
        items { id name price { value currency } }
      }
    }`,
    variables: { filter: { searchTerm: 'mat' }, paging: { offset: 0, limit: 50 } }
  }
]

for (const q of queries) {
  try {
    const r = await fetch(gqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Cookie: cookieStr,
        Origin: 'https://volkswagen-genuine-accessories.com',
        Referer: 'https://volkswagen-genuine-accessories.com/au/en/c/sport-and-design/160985513/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ query: q.query, variables: q.variables, operationName: q.name })
    })
    const text = r.ok ? await r.text() : await r.text().catch(() => '')
    console.log(`\n${q.name}: ${r.status} (${text.length} bytes)`)
    if (text.length > 0 && text.length < 2000) {
      console.log(`  ${text.substring(0, 500)}`)
    } else if (text.length >= 2000) {
      try {
        const data = JSON.parse(text)
        if (data.data) {
          const dataStr = JSON.stringify(data.data)
          console.log(`  Data (${dataStr.length} chars): ${dataStr.substring(0, 500)}`)
          // Count products
          const products = data.data?.core_category?.products?.items ||
                           data.data?.shop_search?.items ||
                           data.data?.core_searchSuggest?.productSuggests?.products || []
          console.log(`  Products: ${products.length}`)
          if (products.length > 0) {
            console.log(`  First: ${JSON.stringify(products[0]).substring(0, 300)}`)
          }
        }
        if (data.errors) {
          console.log(`  Errors: ${JSON.stringify(data.errors).substring(0, 500)}`)
        }
      } catch (e) {
        console.log(`  Not JSON: ${text.substring(0, 200)}`)
      }
    }
  } catch (e) {
    console.log(`\n${q.name}: ${e.message}`)
  }
}

// 3. Extract ALL accessories from ALL VW AU model.json pages
console.log('\n\n=== Extracting accessories from ALL VW AU model pages ===')
const MODELS = [
  'id-buzz-accessories', 'id-buzz-cargo-accessories', 'id4-accessories', 'id5-accessories',
  'golf-accessories', 'polo-accessories', 'tiguan-accessories', 't-roc-accessories',
  'amarok-accessories', 'touareg-accessories', 't-cross-accessories', 'tayron-accessories',
  'arteon-accessories', 'passat-wagon-accessories', 'multivan-accessories',
  'golf-r-accessories', 'golf-gti-accessories', 'polo-gti-accessories',
]

const allAccessories = new Map()

for (const model of MODELS) {
  const url = `https://www.volkswagen.com.au/en/owners-service/accessories/${model}.model.json`
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json' } })
    if (!res.ok) { console.log(`  ${model}: ${res.status}`); continue }
    const data = await res.json()

    // Recursively find ALL text+image pairs in expand/collapse sections and content sliders
    const items = []
    function findItems(obj, path = '') {
      if (!obj || typeof obj !== 'object') return

      const keys = Object.keys(obj)

      // Check for expand/collapse section items with text content
      if (obj.text && typeof obj.text === 'string') {
        const cleanText = obj.text.replace(/<[^>]+>/g, '').trim()
        if (cleanText.length > 10 && cleanText.length < 500) {
          // Find the heading for this item
          const heading = obj.headlineText || obj.heading || obj.title || null
          if (heading) {
            items.push({
              name: heading.replace(/<[^>]+>/g, '').trim(),
              description: cleanText,
              image: obj.fileReference || null
            })
          }
        }
      }

      // Check for heading + image blocks
      if (obj.headlineText && typeof obj.headlineText === 'string' && !obj.text) {
        const heading = obj.headlineText.replace(/<[^>]+>/g, '').trim()
        if (heading.length > 3 && heading.length < 100) {
          items.push({
            name: heading,
            description: obj.copyText ? obj.copyText.replace(/<[^>]+>/g, '').trim() : null,
            image: obj.fileReference || null
          })
        }
      }

      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'object') findItems(val, `${path}.${key}`)
      }
    }

    findItems(data)

    // Deduplicate by name
    const seen = new Set()
    const uniqueItems = items.filter(i => {
      if (seen.has(i.name)) return false
      // Skip navigation items
      if (['Home', 'Owners and Service', 'Accessories', 'Book a Service', 'Find a Dealer'].includes(i.name)) return false
      seen.add(i.name)
      return true
    })

    const modelSlug = model.replace('-accessories', '')
    for (const item of uniqueItems) {
      const key = item.name.toLowerCase()
      if (!allAccessories.has(key)) {
        allAccessories.set(key, { ...item, modelSlugs: new Set([modelSlug]) })
      } else {
        allAccessories.get(key).modelSlugs.add(modelSlug)
      }
    }

    console.log(`  ${model}: ${uniqueItems.length} items`)
    for (const i of uniqueItems.slice(0, 5)) {
      console.log(`    ${i.name}${i.description ? ': ' + i.description.substring(0, 60) : ''}`)
    }
  } catch (e) {
    console.log(`  ${model}: ${e.message}`)
  }
}

console.log(`\n=== Summary ===`)
console.log(`Total unique accessories: ${allAccessories.size}`)
console.log(`Models covered: ${MODELS.length}`)
console.log(`Note: VW AU model pages have names/descriptions/images but NO prices`)
console.log(`Prices would need to come from the e-catalogue (volkswagen-genuine-accessories.com/au/en/)`)
