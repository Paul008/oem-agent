#!/usr/bin/env node
// Probe Nissan accessories — discover API from website
// Starting point: https://www.nissan.com.au/vehicles/browse-range/navara/accessories.html

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// Step 1: Fetch the Navara accessories page and look for API endpoints
console.log('=== Fetching Navara accessories page ===')
const pageRes = await fetch('https://www.nissan.com.au/vehicles/browse-range/navara/accessories.html', { headers: HEADERS })
const html = await pageRes.text()
console.log(`Page: ${pageRes.status}, ${html.length} bytes`)

// Look for proxy.json or API endpoints
const proxyMatches = [...html.matchAll(/['"](\/content\/[^'"]*?proxy[^'"]*?)['"]/g)]
console.log(`\nProxy endpoints: ${proxyMatches.length}`)
for (const m of proxyMatches) console.log(`  ${m[1]}`)

// Look for HELIOS configuration
const heliosMatch = html.match(/HELIOS\.config\s*=\s*(\{[\s\S]*?\});/m)
if (heliosMatch) console.log(`\nHELIOS config found (${heliosMatch[1].length} chars)`)

// Look for accessories data in Helios components
const heliosComponents = [...html.matchAll(/HELIOS\.components\.([a-zA-Z0-9_]+)\s*=\s*(\{[\s\S]*?\});/gm)]
console.log(`\nHELIOS components: ${heliosComponents.length}`)
for (const m of heliosComponents) {
  const name = m[1]
  const data = m[2]
  console.log(`  ${name}: ${data.length} chars`)
  if (data.includes('accessor') || data.includes('price') || data.includes('pack')) {
    console.log(`    Contains accessories/price data!`)
    console.log(`    Preview: ${data.substring(0, 500)}`)
  }
}

// Look for any JSON data URLs
const apiUrls = [...html.matchAll(/['"](https?:\/\/[^'"]*(?:api|json|accessor|content)[^'"]*)['"]/gi)]
console.log(`\nAPI/JSON URLs: ${apiUrls.length}`)
for (const m of apiUrls.slice(0, 20)) console.log(`  ${m[1]}`)

// Look for Apigee endpoints
const apigeeUrls = [...html.matchAll(/['"](https?:\/\/[^'"]*nissan-api[^'"]*)['"]/g)]
console.log(`\nApigee URLs: ${apigeeUrls.length}`)
for (const m of apigeeUrls) console.log(`  ${m[1]}`)

// Look for AEM content API
const aemUrls = [...html.matchAll(/['"]([^'"]*jcr:content[^'"]*)['"]/g)]
console.log(`\nAEM content paths: ${aemUrls.length}`)
for (const m of aemUrls.slice(0, 10)) console.log(`  ${m[1]}`)

// Step 2: Try common Nissan accessories API patterns
console.log('\n=== Trying API endpoints ===')
const endpoints = [
  'https://www.nissan.com.au/content/nissan_prod/en_AU/index/vehicles/browse-range/navara/accessories/jcr:content.proxy.json',
  'https://www.nissan.com.au/content/nissan_prod/en_AU/index/vehicles/browse-range/navara/accessories.accessories.json',
  'https://www.nissan.com.au/content/nissan_prod/en_AU/index/vehicles/browse-range/navara/accessories.model.json',
  'https://www.nissan.com.au/vehicles/browse-range/navara/accessories.model.json',
  'https://www.nissan.com.au/vehicles/browse-range/navara/accessories.accessories.json',
  'https://www.nissan.com.au/content/dam/nissan/au/accessories/navara.json',
]

for (const url of endpoints) {
  try {
    const r = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json' } })
    console.log(`  ${r.status}: ${url.substring(url.lastIndexOf('/') - 20)}`)
    if (r.ok) {
      const text = await r.text()
      console.log(`    ${text.substring(0, 300)}`)
    }
  } catch (e) {
    console.log(`  ERR: ${url.substring(url.lastIndexOf('/') - 20)} - ${e.message}`)
  }
}

// Step 3: Look for all model accessories pages
console.log('\n=== Checking other models ===')
const models = ['x-trail', 'qashqai', 'pathfinder', 'patrol', 'juke', 'leaf', 'navara', 'ariya']
for (const model of models) {
  try {
    const r = await fetch(`https://www.nissan.com.au/vehicles/browse-range/${model}/accessories.html`, {
      headers: HEADERS, redirect: 'follow'
    })
    console.log(`  ${model}: ${r.status} (${r.url.includes('accessories') ? 'has accessories page' : 'redirected'})`)
  } catch (e) {
    console.log(`  ${model}: ${e.message}`)
  }
}

// Step 4: Extract accessories data from inline scripts
console.log('\n=== Extracting inline accessory data ===')
// Look for accessory pack data or product data in scripts
const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
for (const block of scriptBlocks) {
  const script = block[1]
  if (script.includes('accessories') && script.length > 100) {
    // Find JSON objects with accessories
    const accMatches = [...script.matchAll(/"accessories?"[\s]*:[\s]*(\[[\s\S]*?\])/g)]
    for (const am of accMatches) {
      console.log(`  Accessories array found: ${am[1].substring(0, 200)}`)
    }

    // Also look for pack data
    const packMatches = [...script.matchAll(/"packs?"[\s]*:[\s]*(\[[\s\S]*?\])/g)]
    for (const pm of packMatches) {
      console.log(`  Packs array found: ${pm[1].substring(0, 200)}`)
    }

    // Look for price data
    if (script.includes('price') && script.includes('name')) {
      const priceContext = script.substring(
        Math.max(0, script.indexOf('price') - 200),
        Math.min(script.length, script.indexOf('price') + 300)
      )
      console.log(`  Price context: ...${priceContext.replace(/\s+/g, ' ').substring(0, 400)}...`)
    }
  }
}
