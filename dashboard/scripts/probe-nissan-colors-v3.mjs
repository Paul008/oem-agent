#!/usr/bin/env node

/**
 * Probe Nissan browse-range pages for color data
 * Focus on working URLs discovered in V2
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.nissan.com.au/'
}

// Extract JSON from various patterns in HTML
function extractJsonPatterns(html) {
  const patterns = []

  // Pattern 1: window.__INITIAL_STATE__ or similar
  const windowStateMatch = html.match(/window\.__\w+__\s*=\s*({.+?});/s)
  if (windowStateMatch) {
    patterns.push({
      type: 'window.__STATE__',
      snippet: windowStateMatch[0].slice(0, 500)
    })
  }

  // Pattern 2: Inline JSON in data attributes
  const dataJsonMatches = [...html.matchAll(/data-[\w-]+='({[^']+})'/g)]
  if (dataJsonMatches.length > 0) {
    patterns.push({
      type: 'data-* attributes',
      count: dataJsonMatches.length,
      snippet: dataJsonMatches[0][0].slice(0, 200)
    })
  }

  // Pattern 3: Script tags with type="application/json"
  const jsonScripts = [...html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>(.*?)<\/script>/gs)]
  if (jsonScripts.length > 0) {
    patterns.push({
      type: 'application/json scripts',
      count: jsonScripts.length,
      snippet: jsonScripts[0][1].slice(0, 300)
    })
  }

  // Pattern 4: Color-specific data structures
  const colorDataMatch = html.match(/"(?:colors?|exteriorColou?rs?|paintColou?rs?)":\s*\[(.*?)\]/s)
  if (colorDataMatch) {
    patterns.push({
      type: 'color array',
      snippet: colorDataMatch[0].slice(0, 500)
    })
  }

  // Pattern 5: Variant data with embedded colors
  const variantDataMatch = html.match(/"variants?":\s*\[(.*?)\]/s)
  if (variantDataMatch && variantDataMatch[0].toLowerCase().includes('colo')) {
    patterns.push({
      type: 'variant data with colors',
      snippet: variantDataMatch[0].slice(0, 500)
    })
  }

  return patterns
}

// Extract API endpoints from HTML
function extractApiEndpoints(html) {
  const endpoints = new Set()

  // Look for API URLs in various contexts
  const apiPatterns = [
    /["'](https?:\/\/[^"'\s]+\/api\/[^"'\s]+)["']/g,
    /["'](https?:\/\/[^"'\s]*nissan[^"'\s]*\/[^"'\s]*(?:vehicle|model|colour|variant)[^"'\s]+)["']/g,
    /fetch\(["']([^"']+)["']/g,
    /axios\.(?:get|post)\(["']([^"']+)["']/g
  ]

  for (const pattern of apiPatterns) {
    const matches = [...html.matchAll(pattern)]
    matches.forEach(m => {
      if (m[1].includes('nissan') || m[1].includes('api')) {
        endpoints.add(m[1])
      }
    })
  }

  return Array.from(endpoints)
}

async function probeBrowseRangePages() {
  console.log('🚗 Probing Nissan browse-range pages for color data...\n')

  const models = [
    'juke',
    'qashqai',
    'x-trail',
    'pathfinder',
    'navara',
    'ariya',
    'patrol'
  ]

  for (const model of models) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📋 Model: ${model.toUpperCase()}`)
    console.log('='.repeat(60))

    const url = `https://www.nissan.com.au/vehicles/browse-range/${model}.html`

    try {
      const res = await fetch(url, { headers: HEADERS })

      if (!res.ok) {
        console.log(`❌ ${res.status}: Page not found`)
        continue
      }

      const html = await res.text()
      console.log(`✅ Page loaded: ${Math.round(html.length / 1024)}KB`)

      // Extract JSON patterns
      const jsonPatterns = extractJsonPatterns(html)
      if (jsonPatterns.length > 0) {
        console.log(`\n📦 Found ${jsonPatterns.length} JSON data patterns:`)
        jsonPatterns.forEach((p, i) => {
          console.log(`\n  ${i + 1}. ${p.type}`)
          if (p.count) console.log(`     Count: ${p.count}`)
          console.log(`     Snippet: ${p.snippet.replace(/\n/g, ' ').slice(0, 200)}...`)
        })
      } else {
        console.log(`\n📦 No embedded JSON patterns found`)
      }

      // Extract API endpoints
      const apiEndpoints = extractApiEndpoints(html)
      if (apiEndpoints.length > 0) {
        console.log(`\n🔌 Found ${apiEndpoints.length} potential API endpoints:`)
        apiEndpoints.slice(0, 5).forEach(ep => {
          console.log(`  - ${ep}`)
        })
      }

      // Check for color-related UI elements
      const colorUIElements = []
      if (html.includes('color-selector') || html.includes('colour-selector')) {
        colorUIElements.push('color selector component')
      }
      if (html.includes('paint-swatch') || html.includes('colour-swatch')) {
        colorUIElements.push('paint swatch elements')
      }
      if (html.match(/class="[^"]*color[^"]*"/i)) {
        colorUIElements.push('color-related CSS classes')
      }

      if (colorUIElements.length > 0) {
        console.log(`\n🎨 Color UI elements detected:`)
        colorUIElements.forEach(el => console.log(`  - ${el}`))
      }

      // Check for configurator links
      const configuratorLinks = [...html.matchAll(/href="([^"]*(?:configurator|build|customise|variants)[^"]*)"/gi)]
        .map(m => m[1])
        .filter((v, i, a) => a.indexOf(v) === i) // unique

      if (configuratorLinks.length > 0) {
        console.log(`\n🛠️  Found ${configuratorLinks.length} configurator/variant links:`)
        configuratorLinks.slice(0, 3).forEach(link => {
          console.log(`  - ${link}`)
        })
      }

      // Check for image CDN patterns
      const imagePatterns = [...html.matchAll(/src="([^"]*\/(?:vehicles|colours|colors)[^"]*)"/gi)]
        .map(m => m[1])
        .filter((v, i, a) => a.indexOf(v) === i)

      if (imagePatterns.length > 0) {
        console.log(`\n🖼️  Found ${imagePatterns.length} vehicle/color image patterns:`)
        imagePatterns.slice(0, 3).forEach(img => {
          console.log(`  - ${img}`)
        })
      }

    } catch (err) {
      console.log(`❌ Error: ${err.message}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Probe complete!')
  console.log('='.repeat(60))
}

probeBrowseRangePages().catch(console.error)
