#!/usr/bin/env node

/**
 * Probe Nissan configurator pages for color data
 * These pages are interactive tools that should have color selectors
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/json,*/*',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.nissan.com.au/'
}

async function probeConfiguratorPages() {
  console.log('🛠️  Probing Nissan configurator pages for color data...\n')

  const configurators = [
    {
      model: 'Juke',
      url: 'https://www.nissan.com.au/vehicles/browse-range/juke/build.html'
    },
    {
      model: 'Qashqai',
      url: 'https://www.nissan.com.au/vehicles/browse-range/qashqai/configurator.html'
    },
    {
      model: 'X-Trail',
      url: 'https://www.nissan.com.au/vehicles/browse-range/x-trail/build.html'
    },
    {
      model: 'Pathfinder',
      url: 'https://www.nissan.com.au/vehicles/browse-range/pathfinder/build.html'
    },
    {
      model: 'Navara',
      url: 'https://www.nissan.com.au/vehicles/browse-range/navara/build.html'
    }
  ]

  for (const config of configurators) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🚗 ${config.model} Configurator`)
    console.log('='.repeat(60))

    try {
      const res = await fetch(config.url, { headers: HEADERS })

      if (!res.ok) {
        console.log(`❌ ${res.status}: Page not available`)
        continue
      }

      const html = await res.text()
      console.log(`✅ Page loaded: ${Math.round(html.length / 1024)}KB`)

      // Extract all script tags with JSON-like content
      const scripts = [...html.matchAll(/<script[^>]*>(.*?)<\/script>/gs)]

      let foundColorData = false

      for (let i = 0; i < scripts.length; i++) {
        const scriptContent = scripts[i][1]

        // Check if this script contains color/colour data
        if (scriptContent.toLowerCase().includes('color') ||
            scriptContent.toLowerCase().includes('colour')) {

          // Try to extract JSON objects
          const jsonMatches = scriptContent.match(/({[^{}]*(?:{[^{}]*}[^{}]*)*})/g)

          if (jsonMatches) {
            for (const jsonStr of jsonMatches.slice(0, 3)) {
              if (jsonStr.toLowerCase().includes('color') ||
                  jsonStr.toLowerCase().includes('colour')) {
                console.log(`\n🎨 Found color data in script #${i + 1}:`)
                console.log(jsonStr.slice(0, 500).replace(/\n/g, ' '))
                foundColorData = true
              }
            }
          }

          // Also check for array patterns
          const arrayMatches = scriptContent.match(/\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]/g)
          if (arrayMatches) {
            for (const arrStr of arrayMatches.slice(0, 2)) {
              if (arrStr.toLowerCase().includes('color') ||
                  arrStr.toLowerCase().includes('colour')) {
                console.log(`\n🎨 Found color array in script #${i + 1}:`)
                console.log(arrStr.slice(0, 400).replace(/\n/g, ' '))
                foundColorData = true
              }
            }
          }
        }
      }

      if (!foundColorData) {
        console.log(`\n⚠️  No embedded color data found`)

        // Check for external data endpoints
        const dataEndpoints = [
          ...html.matchAll(/data-api=['"]([^'"]+)['"]/g),
          ...html.matchAll(/data-config=['"]([^'"]+)['"]/g),
          ...html.matchAll(/data-url=['"]([^'"]+)['"]/g)
        ]

        if (dataEndpoints.length > 0) {
          console.log(`\n🔌 Found data attributes (possible API endpoints):`)
          dataEndpoints.slice(0, 5).forEach(m => {
            console.log(`  - ${m[1]}`)
          })
        }

        // Check for iframe configurators
        const iframes = [...html.matchAll(/<iframe[^>]+src=['"]([^'"]+)['"]/g)]
        if (iframes.length > 0) {
          console.log(`\n📦 Found iframe configurators:`)
          iframes.forEach(m => {
            console.log(`  - ${m[1]}`)
          })
        }
      }

    } catch (err) {
      console.log(`❌ Error: ${err.message}`)
    }
  }

  console.log('\n' + '='.repeat(60))
}

// Also probe the configurator URLs found in the HTML
async function probeDirectConfiguratorURLs() {
  console.log('\n\n🔍 Probing direct configurator URLs...\n')

  const directUrls = [
    'https://www.nissan.com.au/vehicles/browse-range/juke/version-explorer/configurator/cfg.shtml/BAFz/AhpD7A/exterior-colour',
    'https://www.nissan.com.au/vehicles/browse-range/pathfinder/version-explorer/configurator-v3/cfg.shtml/BAFu/AkLD7A/exterior-colour',
    'https://www.nissan.com.au/vehicles/browse-range/qashqai/version-explorer/ve.shtml/gradeSpec:30128-ST',
    'https://www.nissan.com.au/vehicles/browse-range/navara/version-explorer/ve.shtml/gradeSpec:29299-SL_DUAL_CAB'
  ]

  for (const url of directUrls) {
    const modelName = url.split('/')[5]
    console.log(`\n📋 ${modelName}:`)
    console.log(`   ${url}`)

    try {
      const res = await fetch(url, { headers: HEADERS })
      console.log(`   Status: ${res.status}`)

      if (res.ok) {
        const contentType = res.headers.get('content-type')
        console.log(`   Content-Type: ${contentType}`)

        if (contentType?.includes('json')) {
          const data = await res.json()
          console.log(`   Response keys: ${Object.keys(data).join(', ')}`)

          if (JSON.stringify(data).toLowerCase().includes('color') ||
              JSON.stringify(data).toLowerCase().includes('colour')) {
            console.log(`   ✅ Contains color data!`)
            console.log(`   Sample:`, JSON.stringify(data, null, 2).slice(0, 500))
          }
        } else {
          const html = await res.text()
          if (html.toLowerCase().includes('exterior') &&
              html.toLowerCase().includes('colour')) {
            console.log(`   ✅ Page contains exterior colour content`)
          }
        }
      }

    } catch (err) {
      console.log(`   ❌ ${err.message}`)
    }
  }
}

async function main() {
  await probeConfiguratorPages()
  await probeDirectConfiguratorURLs()

  console.log('\n✅ Configurator probe complete!')
  console.log('\n📝 Summary:')
  console.log('  - Nissan uses client-side configurators (likely React/Vue)')
  console.log('  - Color data may be loaded dynamically via XHR/fetch')
  console.log('  - Consider using Playwright to capture runtime data')
  console.log('  - Version explorer URLs contain gradeSpec codes for variants')
}

main().catch(console.error)
