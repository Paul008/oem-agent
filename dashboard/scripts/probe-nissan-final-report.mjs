#!/usr/bin/env node

/**
 * Final comprehensive probe: Extract actual color data from Nissan configurator pages
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/json,*/*',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.nissan.com.au/'
}

async function extractColorDataFromHTML(html, model) {
  const colorData = {
    model,
    colors: [],
    dataSource: null,
    extractionMethod: null
  }

  // Method 1: Look for data-* attributes with color info
  const dataColorAttr = html.match(/data-colors?=['"]([^'"]+)['"]/i)
  if (dataColorAttr) {
    try {
      const decoded = dataColorAttr[1].replace(/&quot;/g, '"')
      const parsed = JSON.parse(decoded)
      colorData.colors = parsed
      colorData.dataSource = 'data-color attribute'
      colorData.extractionMethod = 'HTML attribute parsing'
      return colorData
    } catch {}
  }

  // Method 2: Look for JavaScript variable assignments with color arrays
  const jsColorVarPatterns = [
    /var\s+colors?\s*=\s*(\[.*?\]);/s,
    /const\s+colors?\s*=\s*(\[.*?\]);/s,
    /let\s+colors?\s*=\s*(\[.*?\]);/s,
    /colours?\s*:\s*(\[.*?\])/s
  ]

  for (const pattern of jsColorVarPatterns) {
    const match = html.match(pattern)
    if (match) {
      try {
        const cleaned = match[1]
          .replace(/'/g, '"')
          .replace(/(\w+):/g, '"$1":') // Quote keys
          .replace(/,\s*}/g, '}') // Remove trailing commas

        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed) && parsed.length > 0) {
          colorData.colors = parsed
          colorData.dataSource = 'JavaScript variable'
          colorData.extractionMethod = 'Script tag parsing'
          return colorData
        }
      } catch {}
    }
  }

  // Method 3: Look for option elements in select/radio for colors
  const colorOptions = [
    ...html.matchAll(/<(?:option|input)[^>]*(?:color|colour)[^>]*value=["']([^"']+)["'][^>]*>([^<]+)</gi)
  ]

  if (colorOptions.length > 0) {
    colorData.colors = colorOptions.map(m => ({
      code: m[1],
      name: m[2].trim()
    }))
    colorData.dataSource = 'HTML form elements'
    colorData.extractionMethod = 'DOM element parsing'
    return colorData
  }

  // Method 4: Look for structured data in window object
  const windowDataMatch = html.match(/window\.__NISSAN_DATA__\s*=\s*({.*?});/s) ||
                         html.match(/window\.nissanConfig\s*=\s*({.*?});/s)

  if (windowDataMatch) {
    try {
      const cleaned = windowDataMatch[1]
        .replace(/'/g, '"')
        .replace(/(\w+):/g, '"$1":')

      const parsed = JSON.parse(cleaned)
      const colorStr = JSON.stringify(parsed).toLowerCase()

      if (colorStr.includes('color') || colorStr.includes('colour')) {
        colorData.dataSource = 'window.__NISSAN_DATA__'
        colorData.extractionMethod = 'Window object extraction'
        colorData.rawData = parsed
        return colorData
      }
    } catch {}
  }

  // Method 5: Check for embedded API endpoints that might serve color data
  const apiEndpoints = [
    ...html.matchAll(/["'](\/[^"']*(?:api|data)[^"']*(?:color|colour|variant)[^"']*)["']/gi)
  ]

  if (apiEndpoints.length > 0) {
    colorData.dataSource = 'API endpoints found'
    colorData.apiEndpoints = [...new Set(apiEndpoints.map(m => m[1]))]
    colorData.extractionMethod = 'Dynamic loading required'
  }

  return colorData
}

async function probeSampleConfiguratorPage() {
  console.log('🔍 Deep dive: Extracting color data from Nissan configurator pages\n')

  const testPages = [
    {
      model: 'Juke',
      url: 'https://www.nissan.com.au/vehicles/browse-range/juke/version-explorer/configurator/cfg.shtml/BAFz/AhpD7A/exterior-colour'
    },
    {
      model: 'Pathfinder',
      url: 'https://www.nissan.com.au/vehicles/browse-range/pathfinder/version-explorer/configurator-v3/cfg.shtml/BAFu/AkLD7A/exterior-colour'
    },
    {
      model: 'Qashqai',
      url: 'https://www.nissan.com.au/vehicles/browse-range/qashqai/configurator.html'
    }
  ]

  for (const page of testPages) {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`🚗 ${page.model}`)
    console.log('='.repeat(70))

    try {
      const res = await fetch(page.url, { headers: HEADERS })

      if (!res.ok) {
        console.log(`❌ ${res.status}: Failed to load`)
        continue
      }

      const html = await res.text()
      console.log(`✅ Loaded ${Math.round(html.length / 1024)}KB`)

      // Extract color data
      const colorData = await extractColorDataFromHTML(html, page.model)

      if (colorData.colors && colorData.colors.length > 0) {
        console.log(`\n✅ Successfully extracted ${colorData.colors.length} colors!`)
        console.log(`📊 Data source: ${colorData.dataSource}`)
        console.log(`🔧 Method: ${colorData.extractionMethod}`)
        console.log(`\n🎨 Colors:`)
        colorData.colors.slice(0, 10).forEach((c, i) => {
          console.log(`   ${i + 1}. ${JSON.stringify(c)}`)
        })

      } else if (colorData.apiEndpoints) {
        console.log(`\n⚠️  Color data loaded dynamically`)
        console.log(`🔌 Found API endpoints:`)
        colorData.apiEndpoints.forEach(ep => {
          console.log(`   - ${ep}`)
        })

      } else {
        console.log(`\n⚠️  No color data extracted`)

        // Look for clues about data structure
        console.log(`\n🔍 Analyzing page structure...`)

        // Check for common class names
        const classNames = [
          ...html.matchAll(/class=["']([^"']*(?:color|colour|swatch|paint)[^"']*)["']/gi)
        ]

        if (classNames.length > 0) {
          console.log(`   Found ${classNames.length} color-related CSS classes:`)
          const unique = [...new Set(classNames.map(m => m[1]))]
          unique.slice(0, 5).forEach(cls => {
            console.log(`     - ${cls}`)
          })
        }

        // Check for data layers or analytics
        const dataLayerMatch = html.match(/dataLayer\.push\((.*?)\);/s)
        if (dataLayerMatch) {
          const snippet = dataLayerMatch[1].slice(0, 200)
          if (snippet.toLowerCase().includes('color') ||
              snippet.toLowerCase().includes('colour')) {
            console.log(`   Found color data in analytics layer:`)
            console.log(`     ${snippet}...`)
          }
        }
      }

    } catch (err) {
      console.log(`❌ Error: ${err.message}`)
    }
  }
}

async function generateFinalReport() {
  console.log('\n\n' + '='.repeat(70))
  console.log('📋 FINAL REPORT: Nissan Australia Vehicle Color Data Discovery')
  console.log('='.repeat(70))

  console.log(`
🎯 KEY FINDINGS:

1. ✅ WEBSITE STRUCTURE:
   - Base URL: https://www.nissan.com.au/
   - Model pages: /vehicles/browse-range/{model}.html
   - Configurators: /vehicles/browse-range/{model}/build.html
   - Version explorer: /version-explorer/ve.shtml/ or /configurator/cfg.shtml/
   - Exterior color pages: /exterior-colour endpoints exist

2. 🔌 API ENDPOINTS:
   - Apigee: australia.nissan-api.net/v2/models (REQUIRES session auth)
   - Version explorer: Uses gradeSpec codes (e.g., 30128-ST, 29299-SL_DUAL_CAB)
   - Configurator codes: Base64-like encoded (e.g., BAFz/AhpD7A)

3. 🎨 COLOR DATA AVAILABILITY:
   - ✅ Side profile images in CDN show different colors
   - ✅ Configurator pages have "exterior-colour" sections
   - ⚠️  Color data loaded client-side (React/Vue SPA)
   - ⚠️  No static JSON endpoints discovered
   - ⚠️  Requires browser/JavaScript execution to extract

4. 🖼️  IMAGE CDN PATTERNS:
   - Base: //www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/
   - Path: vehicles/{MODEL}/side-profiles/{variant}_{color}.png
   - Example: JUKE/side-profiles/JK2PDTIY24_FRNARWLF16UMARHMCH_1.png

5. 📊 DATABASE STATUS:
   - 45 Nissan products in DB
   - 0 variant_colors (NEEDS SEEDING)
   - No discovered_apis entries yet

🛠️  RECOMMENDED APPROACH:

Option A: Playwright Browser Automation (RECOMMENDED)
   - Load configurator pages in headless browser
   - Extract color data from rendered DOM
   - Capture color names, hex codes, swatch images
   - Screenshot color selectors for reference

Option B: Reverse Engineer Configurator API
   - Inspect Network tab during color selection
   - Find XHR/fetch calls for variant/color data
   - Extract authentication requirements
   - Build API client with proper headers

Option C: HTML Scraping with Pattern Matching
   - Parse side-profile image filenames for color codes
   - Extract color names from image alt text
   - Match against common color patterns
   - Lower data quality but simpler implementation

📝 NEXT STEPS:
   1. Use Playwright to load juke/build.html configurator
   2. Interact with color selector UI
   3. Extract color data from DOM state
   4. Map colors to variants using gradeSpec codes
   5. Seed variant_colors table with discovered data
`)
}

async function main() {
  await probeSampleConfiguratorPage()
  await generateFinalReport()
}

main().catch(console.error)
