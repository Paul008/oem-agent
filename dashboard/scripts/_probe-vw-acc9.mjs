#!/usr/bin/env node
// Probe VW OneHub offers API and OSSE GraphQL for accessory data

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'application/json',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// 1. Try the OneHub offers API (from user's code)
console.log('=== OneHub Offers API ===')
for (const version of [547, 548, 549, 550, 600, 650, 700]) {
  try {
    const url = `https://www.volkswagen.com.au/app/locals/get-onehub-offers?size=100&offset=0&sort=Price+(Low+-+High)&dealer=30140&version=${version}&seperator=:`
    const res = await fetch(url, { headers: HEADERS })
    const text = res.ok ? await res.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    if (isJson) {
      const data = JSON.parse(text)
      console.log(`  v${version}: ${data.status} - ${data.data?.length || 0} offers`)
      if (data.data?.length > 0) {
        // Show first item
        const first = data.data[0]
        console.log(`    First: ${JSON.stringify(first).substring(0, 300)}`)
        // Check for accessory-related fields
        const hasAccessory = JSON.stringify(data).toLowerCase().includes('accessory')
        console.log(`    Has "accessory": ${hasAccessory}`)
        break  // Found valid version
      }
    } else {
      console.log(`  v${version}: ${res.status} (not JSON)`)
    }
  } catch (e) {
    console.log(`  v${version}: ${e.message}`)
  }
}

// 2. Get fresh access token and try the OSSE GraphQL for AU
console.log('\n=== Getting fresh access token ===')
const pageRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/', {
  headers: { ...HEADERS, Accept: 'text/html' }
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
console.log(`Token: ${accessToken ? 'yes' : 'no'}`)
const cookieStr = cookieParts.join('; ')

// 3. Try OSSE GraphQL for AU (production + integ)
console.log('\n=== OSSE GraphQL for AU ===')
const ooseDomains = [
  'https://prod-aoz.osse.cariad.digital/au/api/graphql/',
  'https://aoz.osse.cariad.digital/au/api/graphql/',
  'https://integ-aoz.osse.cariad.digital/au/api/graphql/',
]

const categoryQuery = `query GetFullCategory($coreCategoryId: ID!, $paging: SearchPaging!) {
  core_category(id: $coreCategoryId) {
    name
    children {
      id
      name
    }
    products(paging: $paging) {
      totalCount
      items {
        id
        name
        price {
          value
          currency
        }
      }
    }
  }
}`

for (const url of ooseDomains) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Cookie: cookieStr,
        Origin: 'https://volkswagen-genuine-accessories.com',
        Referer: 'https://volkswagen-genuine-accessories.com/',
      },
      body: JSON.stringify({
        query: categoryQuery,
        variables: { coreCategoryId: '160985513', paging: { offset: 0, limit: 50 } }
      })
    })
    const text = r.ok ? await r.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${url}: ${r.status}${isJson ? ` JSON (${text.length})` : ''}`)
    if (isJson) {
      const data = JSON.parse(text)
      if (data.data) {
        console.log(`    ${JSON.stringify(data.data).substring(0, 500)}`)
      } else if (data.errors) {
        console.log(`    Errors: ${JSON.stringify(data.errors).substring(0, 500)}`)
      } else {
        console.log(`    ${text.substring(0, 500)}`)
      }
    }
  } catch (e) {
    console.log(`  ${url}: ${e.message}`)
  }
}

// 4. Try making the GraphQL call to the same domain (as the SPA does)
console.log('\n=== Same-domain GraphQL ===')
const sameDomainUrls = [
  'https://volkswagen-genuine-accessories.com/au/api/graphql/',
  'https://volkswagen-genuine-accessories.com/api/graphql/',
  'https://volkswagen-genuine-accessories.com/au/en/api/graphql/',
]

for (const url of sameDomainUrls) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Cookie: cookieStr,
      },
      body: JSON.stringify({
        query: categoryQuery,
        variables: { coreCategoryId: '160985513', paging: { offset: 0, limit: 50 } }
      })
    })
    const text = r.ok ? await r.text() : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${url.replace('https://volkswagen-genuine-accessories.com', '')}: ${r.status}${isJson ? ` JSON (${text.length})` : ''}`)
    if (isJson) {
      const data = JSON.parse(text)
      if (data.data) {
        console.log(`    ${JSON.stringify(data.data).substring(0, 500)}`)
      } else if (data.errors) {
        console.log(`    Errors: ${JSON.stringify(data.errors).substring(0, 500)}`)
      } else {
        console.log(`    ${text.substring(0, 500)}`)
      }
    }
  } catch (e) {
    console.log(`  ${url}: ${e.message}`)
  }
}

// 5. Try the individual VW AU model page JSON to find content slider items
console.log('\n=== Amarok model.json - deep extract ===')
const amarokRes = await fetch('https://www.volkswagen.com.au/en/owners-service/accessories/amarok-accessories.model.json', {
  headers: { ...HEADERS, Accept: 'application/json' }
})
const amarokData = await amarokRes.json()

// Recursively find all text content in content blocks
function findContentBlocks(obj, path = '', results = []) {
  if (!obj || typeof obj !== 'object') return results

  // Check if this has content-like properties
  const keys = Object.keys(obj)
  const hasText = keys.some(k => ['text', 'title', 'headline', 'copyText', 'headlineText', 'label'].includes(k))
  const hasImage = keys.some(k => ['fileReference', 'imageSrc', 'imageUrl'].includes(k))

  if (hasText || hasImage) {
    const text = obj.text || obj.title || obj.headline || obj.headlineText || obj.label || ''
    const cleanText = typeof text === 'string' ? text.replace(/<[^>]+>/g, '').trim() : ''
    if (cleanText.length > 3 && cleanText.length < 200) {
      results.push({
        path: path.split('.').slice(-3).join('.'),
        text: cleanText,
        image: obj.fileReference || obj.imageSrc || null,
        link: obj.linkUrl || obj.link || null
      })
    }
  }

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'object') findContentBlocks(val, `${path}.${key}`, results)
  }
  return results
}

const blocks = findContentBlocks(amarokData)
console.log(`Content blocks: ${blocks.length}`)
for (const b of blocks.slice(0, 30)) {
  console.log(`  ${b.text}${b.image ? ` [img]` : ''}`)
}

// 6. Check the Amarok HTML page for actual products
console.log('\n=== Amarok HTML accessory elements ===')
const amarokHtml = await (await fetch('https://www.volkswagen.com.au/en/owners-service/accessories/amarok-accessories.html', {
  headers: { ...HEADERS, Accept: 'text/html' }
})).text()

// Look for product-like content blocks in the HTML
const sectionHeaders = [...amarokHtml.matchAll(/<h[234][^>]*class="[^"]*"[^>]*>([^<]+)</g)]
console.log(`Section headers: ${sectionHeaders.length}`)
for (const h of sectionHeaders.slice(0, 20)) {
  console.log(`  ${h[1].trim()}`)
}

// Search for names near images
const accessoryPattern = /class="[^"]*(?:content-slider|product|accessory|card)[^"]*"[\s\S]*?(?:alt|title)="([^"]+)"/g
const accessories = [...amarokHtml.matchAll(accessoryPattern)]
console.log(`\nAccessory-like elements: ${accessories.length}`)
for (const a of accessories.slice(0, 10)) {
  console.log(`  ${a[1]}`)
}
