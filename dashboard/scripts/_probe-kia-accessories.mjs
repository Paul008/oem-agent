#!/usr/bin/env node
// Probe Kia accessories from their website
// URL pattern: https://www.kia.com/au/cars/{model}/accessories.html

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

// Kia AU models (from their website navigation)
const MODELS = [
  'k4', 'cerato', 'rio', 'stonic', 'seltos', 'sportage', 'sorento',
  'ev3', 'ev5', 'ev6', 'ev9', 'niro', 'carnival', 'picanto',
]

let totalAccessories = 0
const allAccessories = new Map() // partNumber -> accessory
const allCategories = new Set()
const modelResults = []

for (const model of MODELS) {
  const url = `https://www.kia.com/au/cars/${model}/accessories.html`
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow' })
    if (!res.ok) {
      console.log(`  ${model}: HTTP ${res.status}`)
      continue
    }

    const html = await res.text()

    // Extract JSON-LD structured data
    const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    let accsFromJsonLd = []
    for (const block of jsonLdBlocks) {
      try {
        const data = JSON.parse(block[1])
        if (data['@type'] === 'Product' || (Array.isArray(data) && data[0]?.['@type'] === 'Product')) {
          const products = Array.isArray(data) ? data : [data]
          accsFromJsonLd.push(...products)
        }
        if (data['@graph']) {
          const products = data['@graph'].filter(item => item['@type'] === 'Product')
          accsFromJsonLd.push(...products)
        }
      } catch {}
    }

    // Also try extracting from data attributes or inline JSON
    // Look for accessory card data
    const accCardPattern = /data-acc-(?:name|id|price|part)="([^"]+)"/g
    const dataAttrs = [...html.matchAll(accCardPattern)]

    // Look for any JSON arrays with price/name/partNumber
    const jsonArrayPattern = /\[[\s]*\{[^}]*"(?:partNumber|sku|itemCode)"[^}]*"(?:price|rrp|amount)"[^}]*\}[\s\S]*?\]/g
    const jsonArrays = [...html.matchAll(jsonArrayPattern)]

    // Try to extract accessory data from HTML structure
    // Look for accessory items with prices
    const pricePattern = /\$\s*([\d,]+(?:\.\d{2})?)/g
    const prices = [...html.matchAll(pricePattern)].map(m => parseFloat(m[1].replace(',', '')))

    if (accsFromJsonLd.length > 0) {
      console.log(`  ${model}: ${accsFromJsonLd.length} accessories (JSON-LD)`)
      modelResults.push({ model, count: accsFromJsonLd.length, source: 'json-ld' })
      for (const acc of accsFromJsonLd) {
        const key = acc.sku || acc.name
        if (key) {
          allAccessories.set(key, { ...acc, _model: model })
          if (acc.category) allCategories.add(acc.category)
        }
      }
      totalAccessories += accsFromJsonLd.length
    } else if (prices.length > 5) {
      // Count accessory-like elements
      const accNames = [...html.matchAll(/<h[23456][^>]*class="[^"]*acc[^"]*"[^>]*>([^<]+)</g)]
      console.log(`  ${model}: ~${prices.length} prices found, ${accNames.length} named items (HTML)`)
      modelResults.push({ model, count: prices.length, source: 'html-prices' })
    } else {
      console.log(`  ${model}: no structured data found (${html.length} bytes)`)
    }
  } catch (e) {
    console.log(`  ${model}: ${e.message}`)
  }
}

// Summary
console.log('\n=== Summary ===')
console.log(`Models with data: ${modelResults.length}`)
console.log(`Total raw: ${totalAccessories}`)
console.log(`Unique by sku/name: ${allAccessories.size}`)
console.log(`Categories: ${[...allCategories].join(', ') || 'none from JSON-LD'}`)

// Sample
const sample = [...allAccessories.values()][0]
if (sample) {
  const { _model, ...rest } = sample
  console.log('\nSample:')
  console.log(JSON.stringify(rest, null, 2).substring(0, 1500))
}

// Show all models results
console.log('\nPer model:')
for (const r of modelResults) {
  console.log(`  ${r.model}: ${r.count} (${r.source})`)
}
