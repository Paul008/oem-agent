#!/usr/bin/env node
// Deeper probe of VW accessories sources

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15',
  'Accept': '*/*',
  'Accept-Language': 'en-AU,en;q=0.9',
}

// 1. Parse the model.json to find accessory names/images in the page structure
console.log('=== Parsing Amarok model.json for accessory structure ===')
const amarokUrl = 'https://www.volkswagen.com.au/en/owners-service/accessories/amarok-accessories.model.json'
const res = await fetch(amarokUrl, { headers: HEADERS })
const data = await res.json()

// Recursively find all text/image content in the JSON
function findLeafValues(obj, path = '', results = []) {
  if (typeof obj === 'string' && obj.length > 3 && obj.length < 200) {
    // Filter for likely accessory-related content
    const lower = obj.toLowerCase()
    if (lower.includes('mat') || lower.includes('bar') || lower.includes('rack') ||
        lower.includes('liner') || lower.includes('wheel') || lower.includes('dash') ||
        lower.includes('protection') || lower.includes('carrier') || lower.includes('alloy') ||
        lower.includes('tow') || lower.includes('cargo') || lower.includes('roof') ||
        lower.includes('sport') || lower.includes('step') || lower.includes('guard') ||
        lower.includes('canopy') || lower.includes('accessory') || lower.includes('styling')) {
      results.push({ path, value: obj })
    }
  } else if (obj && typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      findLeafValues(val, `${path}.${key}`, results)
    }
  }
  return results
}

const accValues = findLeafValues(data)
console.log(`Found ${accValues.length} accessory-related values`)
const uniqueNames = [...new Set(accValues.map(v => v.value))].slice(0, 30)
for (const name of uniqueNames) {
  console.log(`  ${name}`)
}

// 2. Look at specific JSON structure patterns
console.log('\n=== JSON keys containing "slider" or "card" ===')
function findKeys(obj, target, path = '', results = []) {
  if (obj && typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      const newPath = `${path}.${key}`
      if (key.toLowerCase().includes(target)) {
        results.push({ path: newPath, type: typeof val, isArray: Array.isArray(val), length: Array.isArray(val) ? val.length : null })
      }
      findKeys(val, target, newPath, results)
    }
  }
  return results
}

const sliderKeys = findKeys(data, 'slider')
console.log(`Slider keys: ${sliderKeys.length}`)
for (const k of sliderKeys.slice(0, 10)) {
  console.log(`  ${k.path} (${k.type}${k.isArray ? ` [${k.length}]` : ''})`)
}

const cardKeys = findKeys(data, 'card')
console.log(`\nCard keys: ${cardKeys.length}`)
for (const k of cardKeys.slice(0, 10)) {
  console.log(`  ${k.path} (${k.type}${k.isArray ? ` [${k.length}]` : ''})`)
}

// 3. Parse the e-catalogue HTML for accessory data
console.log('\n=== E-catalogue deep probe ===')
const ecatRes = await fetch('https://volkswagen-genuine-accessories.com/au/en/', {
  headers: { ...HEADERS, Accept: 'text/html' }
})
const ecatHtml = await ecatRes.text()
console.log(`E-catalogue HTML: ${ecatHtml.length} bytes`)

// Look for part numbers (VW format: 3-letter prefix + 3 digits + 3 digits)
const partNums = [...new Set([...ecatHtml.matchAll(/\b([A-Z0-9]{3}\s?\d{3}\s?\d{3}(?:\s?[A-Z0-9]+)?)\b/g)].map(m => m[1]))]
console.log(`Part numbers: ${partNums.length}`)
for (const pn of partNums.slice(0, 10)) {
  console.log(`  ${pn}`)
}

// Look for product names (in JSON objects within the page)
const jsonBlobs = [...ecatHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .filter(s => s.includes('product') || s.includes('accessory') || s.includes('price'))
console.log(`\nScript blocks with product/accessory/price: ${jsonBlobs.length}`)
for (const blob of jsonBlobs.slice(0, 3)) {
  // Extract interesting data
  const priceMatches = [...blob.matchAll(/["']?price["']?\s*:\s*["']?([^"',\s}]+)/g)]
  const nameMatches = [...blob.matchAll(/["']?(?:name|title|label)["']?\s*:\s*["']([^"']+)/g)]
  if (priceMatches.length > 0 || nameMatches.length > 0) {
    console.log(`  Block (${blob.length} chars): ${priceMatches.length} prices, ${nameMatches.length} names`)
    for (const n of nameMatches.slice(0, 3)) console.log(`    Name: ${n[1]}`)
    for (const p of priceMatches.slice(0, 3)) console.log(`    Price: ${p[1]}`)
  }
}

// Check for a React/Next/Nuxt data object
const nextDataMatch = ecatHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
const nuxtDataMatch = ecatHtml.match(/window\.__NUXT__\s*=\s*([\s\S]*?)<\/script>/)
const initialStateMatch = ecatHtml.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/)
console.log(`\nFramework data: Next=${!!nextDataMatch}, Nuxt=${!!nuxtDataMatch}, Redux=${!!initialStateMatch}`)

// Check for any fetch API URLs in the JS
const fetchUrls = [...ecatHtml.matchAll(/fetch\s*\(\s*["']([^"']+)["']/g)]
  .map(m => m[1])
  .filter(u => u.includes('api') || u.includes('product') || u.includes('accessor'))
console.log(`Fetch API URLs: ${fetchUrls.length}`)
for (const u of fetchUrls) console.log(`  ${u}`)

// Check what model pages are linked
const modelLinks = [...ecatHtml.matchAll(/href=["']\/au\/en\/([^"']+)["']/g)]
  .map(m => m[1])
  .filter(l => !l.includes('.') && l.length > 3)
const uniqueLinks = [...new Set(modelLinks)]
console.log(`\nModel page links: ${uniqueLinks.length}`)
for (const l of uniqueLinks.slice(0, 15)) console.log(`  ${l}`)

// 4. Try e-catalogue model-specific pages
console.log('\n=== E-catalogue model pages ===')
const ecatModels = ['amarok', 'tiguan', 'golf', 'polo', 'id-buzz', 't-roc']
for (const model of ecatModels) {
  for (const path of [`/au/en/${model}`, `/au/en/models/${model}`, `/au/en/vehicles/${model}`]) {
    try {
      const r = await fetch(`https://volkswagen-genuine-accessories.com${path}`, {
        headers: { ...HEADERS, Accept: 'text/html' },
        redirect: 'follow'
      })
      if (r.ok || r.status === 301 || r.status === 302) {
        const text = r.ok ? await r.text() : ''
        const prices = [...(text.matchAll(/\$[\d,]+(?:\.\d{2})?/g) || [])].map(m => m[0])
        console.log(`  ${path}: ${r.status} (${text.length} bytes), ${prices.length} prices`)
        if (prices.length > 0) console.log(`    ${prices.slice(0, 5).join(', ')}`)
      } else {
        console.log(`  ${path}: ${r.status}`)
      }
    } catch (e) {
      console.log(`  ${path}: ${e.message}`)
    }
  }
}
