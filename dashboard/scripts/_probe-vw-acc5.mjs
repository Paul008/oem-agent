#!/usr/bin/env node
// Probe VW OSSE GraphQL API and category pages for product data

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': 'text/html',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// 1. Fetch Sport & Design category page and find all product data in the Nuxt __NUXT_DATA__
console.log('=== Fetching category page for __NUXT_DATA__ ===')
const catUrl = 'https://volkswagen-genuine-accessories.com/au/en/c/sport-and-design/160985513/'
const res = await fetch(catUrl, { headers: HEADERS })
const html = await res.text()

// Look for Nuxt3 data format: <script type="application/json" id="__NUXT_DATA__">
const nuxtDataMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
if (nuxtDataMatch) {
  console.log(`__NUXT_DATA__ found (${nuxtDataMatch[1].length} chars)`)
  try {
    const data = JSON.parse(nuxtDataMatch[1])
    console.log(`Type: ${typeof data}, isArray: ${Array.isArray(data)}, length: ${Array.isArray(data) ? data.length : 'N/A'}`)
    // Show first few entries
    if (Array.isArray(data)) {
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const item = data[i]
        if (typeof item === 'string') console.log(`  [${i}]: "${item.substring(0, 100)}"`)
        else if (typeof item === 'object') console.log(`  [${i}]: ${JSON.stringify(item).substring(0, 200)}`)
        else console.log(`  [${i}]: ${item}`)
      }
    }
  } catch (e) {
    console.log(`Parse error: ${e.message}`)
    console.log(`First 500 chars: ${nuxtDataMatch[1].substring(0, 500)}`)
  }
} else {
  console.log('No __NUXT_DATA__ found')
}

// Look for window.__NUXT__ (Nuxt 2 style)
const nuxt2Match = html.match(/window\.__NUXT__\s*=\s*([\s\S]*?)(?:<\/script>|;?\s*$)/m)
if (nuxt2Match) {
  console.log(`\n__NUXT__ (v2 style) found (${nuxt2Match[1].length} chars)`)
  console.log(`First 500 chars: ${nuxt2Match[1].substring(0, 500)}`)
}

// 2. Search for product/price data in ALL script tags
console.log('\n=== Searching all script tags for product data ===')
const scriptTags = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
console.log(`Total script tags: ${scriptTags.length}`)

for (let i = 0; i < scriptTags.length; i++) {
  const content = scriptTags[i][1]
  if (content.length < 10) continue

  // Check for product-related content
  const hasProduct = /product|item|accessory|article/i.test(content)
  const hasPrice = /price|amount|cost|\$\d/i.test(content)
  const hasName = /name.*?:.*?"[A-Z][a-z]/i.test(content)

  if (hasProduct || hasPrice) {
    const attrs = scriptTags[i][0].match(/<script([^>]*)>/)?.[1] || ''
    console.log(`\n  Script #${i} (${content.length} chars)${attrs ? ` attrs: ${attrs.trim()}` : ''}`)
    console.log(`    product: ${hasProduct}, price: ${hasPrice}, name: ${hasName}`)

    // Try to extract meaningful data
    if (content.includes('{')) {
      // Try JSON parse
      try {
        const json = JSON.parse(content)
        console.log(`    Valid JSON: ${typeof json}`)
        if (typeof json === 'object') {
          const str = JSON.stringify(json)
          const prices = [...str.matchAll(/"(?:price|formattedPrice)":\s*"?([^",}]+)/g)]
          if (prices.length > 0) {
            console.log(`    Prices: ${prices.slice(0, 5).map(p => p[1]).join(', ')}`)
          }
        }
      } catch (e) {
        // Not pure JSON, search for patterns
        const prices = [...content.matchAll(/"?price"?\s*[:=]\s*"?([^",\s}]+)/g)]
        const names = [...content.matchAll(/"?(?:name|title)"?\s*[:=]\s*"([^"]+)"/g)]
        if (prices.length > 0) console.log(`    Price patterns: ${prices.slice(0, 5).map(p => p[1]).join(', ')}`)
        if (names.length > 0) console.log(`    Name patterns: ${names.slice(0, 5).map(n => n[1]).join(', ')}`)
      }
    }
  }
}

// 3. Search the full HTML for price patterns
console.log('\n=== Prices in HTML ===')
const allPrices = [...html.matchAll(/\$\s?[\d,]+(?:\.\d{2})?/g)]
console.log(`Dollar amounts in full HTML: ${allPrices.length}`)
for (const p of [...new Set(allPrices.map(m => m[0]))].slice(0, 20)) console.log(`  ${p}`)

// 4. Search for product names in the HTML
console.log('\n=== Product names/titles ===')
const h2s = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)]
console.log(`H2/H3 headings: ${h2s.length}`)
for (const h of h2s.slice(0, 20)) {
  const text = h[1].replace(/<[^>]+>/g, '').trim()
  if (text.length > 2 && text.length < 100) console.log(`  ${text}`)
}

// 5. Look for data attributes
console.log('\n=== Data attributes with product info ===')
const dataAttrs = [...html.matchAll(/data-(?:product|item|name|price|category|sku)[^=]*="([^"]+)"/g)]
console.log(`Product data attributes: ${dataAttrs.length}`)
for (const d of dataAttrs.slice(0, 20)) console.log(`  ${d[0].substring(0, 100)}`)

// 6. Try the OSSE GraphQL API with AU market
console.log('\n=== OSSE GraphQL API ===')
const graphqlUrls = [
  'https://integ-aoz.osse.cariad.digital/ae/api/graphql/',
  'https://aoz.osse.cariad.digital/au/api/graphql/',
  'https://prod-aoz.osse.cariad.digital/au/api/graphql/',
]
const query = `{
  products(locale: "en-AU", first: 10) {
    edges {
      node {
        name
        price
        sku
      }
    }
  }
}`
for (const url of graphqlUrls) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...HEADERS, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })
    console.log(`  ${url}: ${r.status}`)
    if (r.ok) {
      const text = await r.text()
      console.log(`    ${text.substring(0, 300)}`)
    }
  } catch (e) {
    console.log(`  ${url}: ${e.message}`)
  }
}

// 7. Look at the Amarok page (which had the most content) more carefully
console.log('\n=== Amarok model.json - extract accessory items ===')
const amarokRes = await fetch('https://www.volkswagen.com.au/en/owners-service/accessories/amarok-accessories.model.json', {
  headers: { ...HEADERS, Accept: 'application/json' }
})
const amarokData = await amarokRes.json()

// Extract all content items from the slider sections
function extractSliderItems(obj, path = '', results = []) {
  if (!obj || typeof obj !== 'object') return results
  if (obj.headlineText && typeof obj.headlineText === 'string') {
    results.push({
      name: obj.headlineText,
      description: obj.copyText || obj.text || null,
      image: obj.fileReference || obj.imageSrc || null,
      link: obj.linkUrl || null,
      path
    })
  }
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'object') extractSliderItems(val, `${path}.${key}`, results)
  }
  return results
}

const items = extractSliderItems(amarokData)
console.log(`Content items with headlines: ${items.length}`)
for (const item of items) {
  const desc = item.description ? item.description.replace(/<[^>]+>/g, '').substring(0, 80) : 'no desc'
  console.log(`  ${item.name}: ${desc}`)
}
