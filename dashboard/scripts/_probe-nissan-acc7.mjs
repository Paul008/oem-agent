#!/usr/bin/env node
// Extract ALL "Fitted RRP" items from Nissan pages that use the rich-text format
// These pages (X-Trail, Pathfinder, Patrol, Juke, Ariya) use <h3> headings + "Fitted RRP: $X" in content

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html',
}

// Check what an individual accessory looks like (not a pack) on X-Trail page
const url = 'https://www.nissan.com.au/vehicles/browse-range/x-trail/accessories.html'
const res = await fetch(url, { headers: HEADERS })
const html = await res.text()

// Find ALL "Fitted RRP" occurrences and extract the name/price/part nearby
console.log('=== All Fitted RRP items on X-Trail ===')
const fittedPattern = /Fitted RRP:\s*\$([0-9,]+)/g
let match
const items = []
while ((match = fittedPattern.exec(html)) !== null) {
  const priceStr = match[1].replace(/,/g, '')
  const price = parseFloat(priceStr)

  // Look backwards for the nearest heading or name
  const before = html.substring(Math.max(0, match.index - 1000), match.index)

  // Try to find the nearest <h3> or <h4> heading
  const headingMatch = before.match(/.*<h[3456][^>]*>[\s\S]*?<span>([^<]+)<\/span>/s)

  // Or the nearest bold text / title
  const boldMatch = before.match(/.*<b>([^<]{3,50})<\/b>/s)

  // Or look for the image-card heading
  const imgCardMatch = before.match(/.*class="[^"]*image-card-heading[^"]*"[^>]*>([^<]+)/s)

  const name = headingMatch?.[1]?.trim() || imgCardMatch?.[1]?.trim() || boldMatch?.[1]?.trim() || null

  // Look for part number nearby
  const surrounding = html.substring(Math.max(0, match.index - 500), Math.min(html.length, match.index + 200))
  const partMatch = surrounding.match(/Part (?:number|#|no\.?):\s*([A-Z0-9-]+)/i)

  if (name && price > 0) {
    items.push({ name, price, partNumber: partMatch?.[1] || null })
  }
}

console.log(`Found ${items.length} items`)
for (const item of items) {
  console.log(`  $${item.price}: ${item.name}${item.partNumber ? ` (${item.partNumber})` : ''}`)
}

// Now check the accessory-price elements (there's one on X-Trail)
console.log('\n=== accessory-price elements ===')
const accPriceElements = [...html.matchAll(/class="[^"]*accessory-price[^"]*"[^>]*>([\s\S]*?)<\//g)]
for (const m of accPriceElements) {
  const text = m[1].replace(/<[^>]+>/g, '').trim()
  console.log(`  ${text}`)
  // Show context around it
  const idx = m.index
  const context = html.substring(Math.max(0, idx - 300), idx + 200).replace(/\s+/g, ' ')
  console.log(`  Context: ...${context.substring(0, 400)}...`)
}

// Also check the proxy endpoint
console.log('\n=== Trying proxy.json for all models ===')
const models = ['navara', 'x-trail', 'qashqai', 'pathfinder', 'patrol', 'juke', 'ariya']
for (const model of models) {
  const proxyUrl = `https://www.nissan.com.au/content/nissan_prod/en_AU/index/vehicles/browse-range/${model}/accessories/jcr:content.proxy.json`
  try {
    const r = await fetch(proxyUrl, { headers: { ...HEADERS, Accept: 'application/json' } })
    const text = r.ok ? (await r.text()) : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${model}: ${r.status}${isJson ? ` JSON (${text.length} chars)` : r.ok ? ` HTML (${text.length})` : ''}`)
    if (isJson) console.log(`    ${text.substring(0, 300)}`)
  } catch (e) {
    console.log(`  ${model}: ${e.message}`)
  }
}

// Try direct AEM selectors for accessories
console.log('\n=== AEM selectors ===')
const selectors = [
  `jcr:content.accessories.json`,
  `jcr:content/accessories.json`,
  `jcr:content.infinity.json`,
  `_jcr_content.json`,
]
for (const sel of selectors) {
  const u = `https://www.nissan.com.au/content/nissan_prod/en_AU/index/vehicles/browse-range/navara/accessories/${sel}`
  try {
    const r = await fetch(u, { headers: { ...HEADERS, Accept: 'application/json' } })
    const text = r.ok ? (await r.text()) : ''
    const isJson = text.startsWith('{') || text.startsWith('[')
    console.log(`  ${sel}: ${r.status}${isJson ? ` JSON (${text.length})` : ''}`)
    if (isJson) console.log(`    ${text.substring(0, 500)}`)
  } catch (e) {
    console.log(`  ${sel}: ${e.message}`)
  }
}
