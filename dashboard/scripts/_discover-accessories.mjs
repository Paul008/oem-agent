#!/usr/bin/env node
// Discover accessory data sources for all OEMs
// Fetches accessories pages, parses HTML for embedded JSON/API endpoints
// Run: cd dashboard/scripts && node _discover-accessories.mjs

const TARGETS = [
  // Suzuki - known S3/CloudFront for products, check for accessories
  {
    oem: 'suzuki-au',
    urls: [
      'https://www.suzuki.com.au/automobile/models/jimny/accessories',
      'https://www.suzuki.com.au/automobile/models/swift/accessories',
      'https://www.suzuki.com.au/automobile/models/vitara/accessories',
      'https://www.suzuki.com.au/automobile/accessories',
    ]
  },
  // Kia - parts store (Shopify?) + main site accessories
  {
    oem: 'kia-au',
    urls: [
      'https://www.kia.com/au/shopping-tools/genuine-accessories.html',
      'https://parts.kia.com.au/',
      'https://parts.kia.com.au/accessories/Kia__.html',
    ]
  },
  // Isuzu - per-model accessory pages
  {
    oem: 'isuzu-au',
    urls: [
      'https://www.isuzuute.com.au/d-max/accessories',
      'https://www.isuzuute.com.au/mu-x/accessories',
    ]
  },
  // GWM
  {
    oem: 'gwm-au',
    urls: [
      'https://www.gwmaustralia.com.au/accessories',
      'https://www.gwmaustralia.com.au/models/ute-cannon/accessories',
    ]
  },
  // Mazda
  {
    oem: 'mazda-au',
    urls: [
      'https://www.mazda.com.au/accessories/',
      'https://www.mazda.com.au/accessories/find-accessories/cx-5/',
      'https://www.mazda.com.au/accessories/find-accessories/bt-50/',
    ]
  },
  // Nissan
  {
    oem: 'nissan-au',
    urls: [
      'https://www.nissan.com.au/owners/genuine-accessories.html',
      'https://www.nissan.com.au/vehicles/browse-range/navara/accessories.html',
      'https://www.nissan.com.au/vehicles/browse-range/x-trail/accessories.html',
    ]
  },
  // Toyota
  {
    oem: 'toyota-au',
    urls: [
      'https://www.toyota.com.au/accessories',
      'https://www.toyota.com.au/hilux/accessories',
    ]
  },
  // Hyundai
  {
    oem: 'hyundai-au',
    urls: [
      'https://www.hyundai.com/au/en/owning/accessories',
      'https://www.hyundai.com/au/en/owning/accessories/tucson.html',
    ]
  },
  // Subaru
  {
    oem: 'subaru-au',
    urls: [
      'https://www.subaru.com.au/accessories',
      'https://www.subaru.com.au/outback/accessories',
    ]
  },
  // Ford
  {
    oem: 'ford-au',
    urls: [
      'https://www.ford.com.au/shopping/accessories/',
      'https://www.ford.com.au/trucks-and-vans/ranger/accessories/',
    ]
  },
  // VW
  {
    oem: 'volkswagen-au',
    urls: [
      'https://www.volkswagen.com.au/en/models/amarok/accessories.html',
    ]
  },
  // LDV
  {
    oem: 'ldv-au',
    urls: [
      'https://www.ldvautomotive.com.au/accessories',
      'https://www.ldvautomotive.com.au/models/t60-max/accessories',
    ]
  },
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow' })
    return { status: res.status, html: await res.text(), url: res.url, ct: res.headers.get('content-type') }
  } catch (e) {
    return { status: 0, html: '', url, error: e.message }
  }
}

function analyzeHTML(html, sourceUrl) {
  const findings = []

  // 1. __NEXT_DATA__ (Next.js)
  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (nextData) {
    try {
      const data = JSON.parse(nextData[1])
      findings.push({ type: 'nextjs', data: JSON.stringify(data).substring(0, 500), buildId: data.buildId })
    } catch {}
  }

  // 2. JSON-LD structured data
  const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1])
      if (data['@type'] === 'Product' || data['@type'] === 'ItemList' || data['@type'] === 'OfferCatalog') {
        findings.push({ type: 'json-ld', schemaType: data['@type'], preview: JSON.stringify(data).substring(0, 300) })
      }
    } catch {}
  }

  // 3. Inline JSON objects in script tags (data stores, initial state)
  const scriptTags = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)
  for (const m of scriptTags) {
    const script = m[1]
    // Look for large JSON objects that might be data stores
    const jsonPatterns = [
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
      /window\.__DATA__\s*=\s*({[\s\S]*?});/,
      /window\.pageData\s*=\s*({[\s\S]*?});/,
      /var\s+data\s*=\s*({[\s\S]*?});/,
      /"accessories":\s*\[/,
      /"products":\s*\[/,
      /JSON\.parse\('([\s\S]*?)'\)/,
    ]
    for (const p of jsonPatterns) {
      const found = script.match(p)
      if (found) {
        findings.push({ type: 'inline-json', pattern: p.source.substring(0, 40), preview: found[0].substring(0, 300) })
      }
    }

    // Look for API fetch calls
    const fetchPatterns = [
      /fetch\(['"]([^'"]+)['"]/g,
      /axios\.\w+\(['"]([^'"]+)['"]/g,
      /\.get\(['"]([^'"]+api[^'"]*)['"]/g,
      /url:\s*['"]([^'"]*api[^'"]*)['"]/g,
      /apiUrl:\s*['"]([^'"]+)['"]/g,
      /endpoint:\s*['"]([^'"]+)['"]/g,
    ]
    for (const p of fetchPatterns) {
      let match
      while ((match = p.exec(script)) !== null) {
        const apiUrl = match[1]
        if (apiUrl.includes('accessor') || apiUrl.includes('product') || apiUrl.includes('/api/') || apiUrl.includes('catalog')) {
          findings.push({ type: 'api-url', url: apiUrl })
        }
      }
    }
  }

  // 4. Data attributes with JSON
  const dataAttrs = html.matchAll(/data-(?:props|config|items|accessories|products)=['"]({[\s\S]*?})['"]/g)
  for (const m of dataAttrs) {
    findings.push({ type: 'data-attr', preview: m[0].substring(0, 300) })
  }

  // 5. Nuxt/Vue data
  const nuxtData = html.match(/window\.__NUXT__\s*=\s*/)
  if (nuxtData) {
    findings.push({ type: 'nuxt', note: 'Nuxt.js app detected' })
  }

  // 6. Count accessory-related content
  const accMentions = (html.match(/accessory|accessories/gi) || []).length
  const priceMentions = (html.match(/\$[\d,]+\.?\d*/g) || [])
  const partNumbers = (html.match(/[A-Z]{2,3}\d{4,}/g) || [])

  // 7. Check for Shopify patterns
  if (html.includes('Shopify') || html.includes('shopify') || html.includes('cdn.shopify.com')) {
    findings.push({ type: 'shopify', note: 'Shopify platform detected' })
  }

  // 8. Check for WooCommerce/WordPress patterns
  if (html.includes('wp-content') || html.includes('woocommerce')) {
    findings.push({ type: 'wordpress', note: html.includes('woocommerce') ? 'WooCommerce detected' : 'WordPress detected' })
  }

  // 9. Check for Contentful
  if (html.includes('contentful') || html.includes('ctfassets.net')) {
    findings.push({ type: 'contentful', note: 'Contentful CMS detected' })
  }

  return {
    findings,
    stats: {
      accMentions,
      prices: priceMentions.length,
      priceExamples: priceMentions.slice(0, 5),
      partNumbers: partNumbers.length,
      partExamples: partNumbers.slice(0, 5),
      htmlSize: html.length,
    }
  }
}

console.log('=== OEM Accessories Discovery ===\n')

for (const target of TARGETS) {
  console.log(`\n--- ${target.oem} ---`)

  for (const url of target.urls) {
    const { status, html, url: finalUrl, error, ct } = await fetchPage(url)

    if (error || status >= 400) {
      console.log(`  ❌ ${url} → ${status || error}`)
      continue
    }

    const { findings, stats } = analyzeHTML(html, finalUrl)

    const icon = findings.length > 0 ? '✅' : (stats.accMentions > 5 ? '🌐' : '⚪')
    console.log(`  ${icon} ${url} → ${status} [${stats.htmlSize} bytes]`)
    console.log(`     Mentions: ${stats.accMentions} accessories, ${stats.prices} prices, ${stats.partNumbers} part numbers`)

    if (stats.priceExamples.length) console.log(`     Prices: ${stats.priceExamples.join(', ')}`)
    if (stats.partExamples.length) console.log(`     Parts: ${stats.partExamples.join(', ')}`)

    for (const f of findings) {
      console.log(`     📊 ${f.type}: ${f.note || f.url || f.preview?.substring(0, 150) || JSON.stringify(f).substring(0, 150)}`)
    }
  }
}

console.log('\n=== Discovery Complete ===')
