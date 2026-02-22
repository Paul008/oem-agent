#!/usr/bin/env node
// Check Nissan model accessories page structure for models returning 0

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html',
}

const models = ['x-trail', 'pathfinder', 'patrol', 'juke', 'ariya']

for (const slug of models) {
  const url = `https://www.nissan.com.au/vehicles/browse-range/${slug}/accessories.html`
  const res = await fetch(url, { headers: HEADERS })
  console.log(`\n=== ${slug}: ${res.status}, ${res.headers.get('content-type')} ===`)
  if (!res.ok) continue

  const html = await res.text()
  console.log(`Size: ${html.length} bytes`)

  // Check if it's the same template
  const hasAccessorySection = html.includes('accessory-name')
  const hasStylePack = html.includes('style-pack')
  console.log(`Has accessory-name: ${hasAccessorySection}`)
  console.log(`Has style-pack: ${hasStylePack}`)

  // Check for Handlebars templates ({{...}})
  const hbsTemplates = [...html.matchAll(/\{\{[^}]+\}\}/g)]
  console.log(`Handlebars templates: ${hbsTemplates.length}`)

  // Check for data-component or data-type attributes
  const components = [...html.matchAll(/data-component="([^"]+)"/g)]
  console.log(`Components: ${[...new Set(components.map(m => m[1]))].join(', ')}`)

  // Look for any name-like + price-like classes
  const allClasses = [...html.matchAll(/class="([^"]+)"/g)]
  const nameClasses = allClasses.filter(m => m[1].includes('name') && !m[1].includes('vehicle')).slice(0, 5)
  const priceClasses = allClasses.filter(m => m[1].includes('price')).slice(0, 5)
  console.log(`Name classes: ${nameClasses.map(m => m[1]).join(' | ')}`)
  console.log(`Price classes: ${priceClasses.map(m => m[1]).join(' | ')}`)

  // Check for .proxy.json reference
  const proxyRef = html.match(/jcr:content\.proxy\.json/)
  console.log(`Has proxy.json: ${!!proxyRef}`)

  // Show the section around "accessory" mentions
  const accIdx = html.indexOf('accessory')
  if (accIdx > -1) {
    const context = html.substring(Math.max(0, accIdx - 100), accIdx + 300)
    console.log(`\nFirst "accessory" context:\n${context.replace(/\s+/g, ' ').substring(0, 400)}`)
  }

  // Check for "Fitted RRP" or "$" patterns with names nearby
  const pricePatterns = [...html.matchAll(/(?:Fitted RRP|RRP)[^<]*\$[\d,]+(?:\.\d+)?/g)]
  console.log(`\nPrice pattern matches: ${pricePatterns.length}`)
  for (const p of pricePatterns.slice(0, 3)) {
    console.log(`  ${p[0]}`)
  }

  // Check for HELIOS components specific to this page
  const heliosRefs = [...html.matchAll(/HELIOS\.components\.(\w+)/g)]
  console.log(`HELIOS components: ${[...new Set(heliosRefs.map(m => m[1]))].join(', ')}`)

  // Check if the page uses a different content loading strategy
  const fetchCalls = [...html.matchAll(/fetch\s*\(\s*['"]([^'"]+)['"]/g)]
  console.log(`Fetch calls: ${fetchCalls.map(m => m[1]).join(', ')}`)

  const xhrCalls = [...html.matchAll(/XMLHttpRequest|\.open\s*\(\s*['"](?:GET|POST)['"],\s*['"]([^'"]+)['"]/g)]
  console.log(`XHR calls: ${xhrCalls.length}`)
}
