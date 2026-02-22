#!/usr/bin/env node
// Analyze X-Trail accessories page structure to find the correct patterns

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html',
}

const url = 'https://www.nissan.com.au/vehicles/browse-range/x-trail/accessories.html'
const res = await fetch(url, { headers: HEADERS })
const html = await res.text()

// Find all "Fitted RRP" occurrences and examine surrounding HTML
console.log('=== Context around "Fitted RRP" ===')
const fittedPattern = /Fitted RRP/g
let match
let count = 0
while ((match = fittedPattern.exec(html)) !== null && count < 5) {
  const start = Math.max(0, match.index - 500)
  const end = Math.min(html.length, match.index + 200)
  const context = html.substring(start, end)
  console.log(`\n--- Match ${++count} ---`)
  console.log(context.replace(/\s+/g, ' ').trim())
  console.log('---')
}

// Find style-pack sections
console.log('\n=== Style pack sections ===')
const packIdx = html.indexOf('style-pack-name')
if (packIdx > -1) {
  const context = html.substring(Math.max(0, packIdx - 500), packIdx + 500)
  console.log(context.replace(/\s+/g, ' ').trim())
}

// Try the proxy.json endpoint
console.log('\n=== Proxy JSON ===')
const proxyUrl = 'https://www.nissan.com.au/content/nissan_prod/en_AU/index/vehicles/browse-range/x-trail/accessories/jcr:content.proxy.json'
try {
  const pRes = await fetch(proxyUrl, { headers: { ...HEADERS, Accept: 'application/json' } })
  console.log(`Status: ${pRes.status}`)
  if (pRes.ok) {
    const text = await pRes.text()
    console.log(`Length: ${text.length}`)
    console.log(text.substring(0, 2000))
  }
} catch (e) {
  console.log(`Error: ${e.message}`)
}

// Look for HELIOS.components.c_184B data specifically
console.log('\n=== HELIOS c_184B ===')
const heliosMatch = html.match(/HELIOS\.components\.c_184B\s*=\s*([\s\S]*?);\s*(?:HELIOS|<\/script>)/m)
if (heliosMatch) {
  console.log(`Found (${heliosMatch[1].length} chars):`)
  console.log(heliosMatch[1].substring(0, 3000))
} else {
  // Try broader match
  const broader = html.match(/c_184B[\s\S]{0,100}/)
  if (broader) console.log(`c_184B reference: ${broader[0]}`)
}

// Check for Handlebars templates related to accessories
console.log('\n=== Handlebars templates ===')
const hbsPattern = /<script[^>]*type="text\/x-handlebars-template"[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/script>/g
const templates = [...html.matchAll(hbsPattern)]
console.log(`Found ${templates.length} Handlebars templates`)
for (const t of templates) {
  if (t[2].includes('price') || t[2].includes('name') || t[2].includes('accessor')) {
    console.log(`\n  Template: ${t[1]}`)
    console.log(`  ${t[2].substring(0, 500)}`)
  }
}
