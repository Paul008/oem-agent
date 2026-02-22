#!/usr/bin/env node
// Probe Nissan accessories — deep HTML analysis
// Look for: HELIOS data, gradesVersionsData, AEM component data, inline JSON

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html',
}

const url = 'https://www.nissan.com.au/vehicles/browse-range/navara/accessories.html'
const res = await fetch(url, { headers: HEADERS })
const html = await res.text()

// 1. Find all script content with data objects
console.log('=== Script blocks with data ===')
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
for (const [, script] of scripts) {
  if (script.length < 50) continue

  // Look for component data assignments
  if (script.includes('HELIOS') || script.includes('component') || script.includes('accessori')) {
    // Find variable assignments with objects
    const assignments = [...script.matchAll(/(?:HELIOS\.[a-zA-Z_.]+|var\s+\w+|window\.\w+)\s*=\s*(\{[\s\S]*?\});/g)]
    for (const a of assignments) {
      const preview = a[0].substring(0, 300)
      if (preview.includes('accessor') || preview.includes('price') || preview.includes('grade') || preview.includes('pack')) {
        console.log(`\n--- Assignment (${a[0].length} chars) ---`)
        console.log(a[0].substring(0, 800))
      }
    }
  }
}

// 2. Find the gradesVersionsData specifically
console.log('\n=== gradesVersionsData ===')
const gvdMatch = html.match(/gradesVersionsData\s*=\s*(\{[\s\S]*?\});/m)
if (gvdMatch) {
  console.log(gvdMatch[1].substring(0, 2000))
}

// 3. Find HELIOS.config
const configMatch = html.match(/HELIOS\.config\s*=\s*(\{[\s\S]*?\});/m)
if (configMatch) {
  console.log('\n=== HELIOS.config ===')
  console.log(configMatch[1].substring(0, 1500))
}

// 4. Find any data-props or data-config attributes on components
console.log('\n=== Data attributes ===')
const dataAttrs = [...html.matchAll(/data-(?:props|config|api|endpoint|url|src|json)\s*=\s*['"]([^'"]+)['"]/gi)]
for (const m of dataAttrs.slice(0, 20)) {
  console.log(`  ${m[0].substring(0, 200)}`)
}

// 5. Find references to .json URLs in the HTML
console.log('\n=== JSON URL references ===')
const jsonRefs = [...html.matchAll(/['"]([^'"]*\.json[^'"]*)['"]/g)]
const uniqueJsonRefs = [...new Set(jsonRefs.map(m => m[1]))]
for (const ref of uniqueJsonRefs.filter(r => !r.includes('analytics'))) {
  console.log(`  ${ref}`)
}

// 6. Look for accessory content sections (HTML elements with accessory data)
console.log('\n=== Accessory HTML sections ===')
// Find elements with accessory-related classes
const accSections = [...html.matchAll(/class="[^"]*(?:accessor|pack|product)[^"]*"/gi)]
console.log(`Accessory-related classes: ${accSections.length}`)
for (const m of accSections.slice(0, 10)) {
  console.log(`  ${m[0]}`)
}

// 7. Look for price data in the HTML
const priceElements = [...html.matchAll(/<[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g)]
console.log(`\nPrice elements: ${priceElements.length}`)
for (const m of priceElements.slice(0, 5)) {
  const clean = m[1].replace(/<[^>]+>/g, '').trim()
  if (clean) console.log(`  ${clean}`)
}

// 8. Look for all inline data that contains "accessory" or "pack" near price data
console.log('\n=== Accessory data in HTML ===')
const accPattern = /(?:accessor|pack)[^<]*?\$[\d,.]+/gi
const accMatches = [...html.matchAll(accPattern)]
console.log(`Matches: ${accMatches.length}`)
for (const m of accMatches.slice(0, 10)) {
  console.log(`  ${m[0].substring(0, 150)}`)
}

// 9. Check for React/Vue/Angular data
console.log('\n=== Framework data ===')
const reactData = html.match(/__NEXT_DATA__|__NUXT__|window\.__data|window\.__INITIAL/)
if (reactData) console.log(`  Framework data found: ${reactData[0]}`)

// 10. Look for noscript or hidden content
const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/g)
if (noscript) console.log(`  noscript blocks: ${noscript.length}`)

// 11. Specifically look for component IDs and their data
console.log('\n=== Component data ===')
const componentPattern = /HELIOS\.components\.(c_[A-Z0-9]+)\s*=\s*(\{[\s\S]*?\});/gm
const components = [...html.matchAll(componentPattern)]
console.log(`HELIOS components: ${components.length}`)
for (const c of components) {
  console.log(`  ${c[1]}: ${c[2].length} chars`)
  // Show first 300 chars of each
  console.log(`    ${c[2].substring(0, 300)}`)
}

// 12. Also check HELIOS.components without the strict pattern
const heliosAny = [...html.matchAll(/HELIOS\.components\.(\w+)\s*[=:]/g)]
console.log(`\nAll HELIOS.components references:`)
for (const m of [...new Set(heliosAny.map(m => m[1]))]) {
  console.log(`  ${m}`)
}

// 13. Look for the actual accessory card HTML structure
console.log('\n=== Accessory card structure ===')
const cardPattern = /accessory[^>]*>[\s\S]{0,500}(?:name|title|price)/gi
const cards = [...html.matchAll(cardPattern)]
console.log(`Card-like structures: ${cards.length}`)
for (const c of cards.slice(0, 3)) {
  console.log(`  ${c[0].substring(0, 200).replace(/\s+/g, ' ')}`)
}
