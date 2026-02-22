#!/usr/bin/env node

/**
 * Probe Nissan Australia for vehicle color data - V2
 * Tests multiple approaches including direct HTML scraping
 */

import { createClient } from '@supabase/supabase-js'

const s = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.nissan.com.au/'
}

// Probe 1: Check current site structure
async function probeSiteStructure() {
  console.log('\n🔍 Probing Nissan.com.au site structure...')

  try {
    const res = await fetch('https://www.nissan.com.au/', { headers: HEADERS })
    console.log(`  Homepage: ${res.status}`)

    const html = await res.text()

    // Check for vehicle links
    const vehicleLinks = [...html.matchAll(/href="([^"]*vehicle[^"]*)"/gi)]
      .map(m => m[1])
      .slice(0, 5)

    if (vehicleLinks.length > 0) {
      console.log(`  Found ${vehicleLinks.length} vehicle links:`)
      vehicleLinks.forEach(link => console.log(`    - ${link}`))
    }

    // Check for API endpoints in script tags
    const apiEndpoints = [...html.matchAll(/["'](https?:\/\/[^"']*api[^"']*\/(models?|vehicles?|colors?)[^"']*)["']/gi)]
      .map(m => m[1])

    if (apiEndpoints.length > 0) {
      console.log(`  Found ${apiEndpoints.length} potential API endpoints:`)
      apiEndpoints.slice(0, 5).forEach(ep => console.log(`    - ${ep}`))
    }

    // Check for configurator/build-and-price
    const configuratorMatch = html.match(/configurator|build-and-price|customise/i)
    if (configuratorMatch) {
      console.log(`  Found configurator references`)
    }

  } catch (err) {
    console.log(`  ❌ ${err.message}`)
  }
}

// Probe 2: Check known model pages
async function probeModelPages() {
  console.log('\n🔍 Probing individual model pages...')

  const models = [
    'navara',
    'qashqai',
    'x-trail',
    'pathfinder',
    'juke',
    'ariya',
    'patrol'
  ]

  const possiblePaths = [
    'vehicles/new-vehicles/{model}.html',
    'vehicles/{model}.html',
    'vehicles/{model}/',
    '{model}/',
    'en/vehicles/{model}.html'
  ]

  for (const model of models.slice(0, 3)) {
    console.log(`\n  Testing ${model}:`)

    for (const pathTemplate of possiblePaths) {
      const path = pathTemplate.replace('{model}', model)
      const url = `https://www.nissan.com.au/${path}`

      try {
        const res = await fetch(url, {
          headers: HEADERS,
          redirect: 'manual' // Don't follow redirects
        })

        if (res.status === 200) {
          console.log(`    ✅ ${path}: ${res.status}`)

          const html = await res.text()

          // Look for color data in various formats
          const colorPatterns = [
            /"colors?":\s*\[([^\]]+)\]/i,
            /"exteriorColou?rs?":\s*\[([^\]]+)\]/i,
            /"paintColou?rs?":\s*\[([^\]]+)\]/i,
            /data-colors?='([^']+)'/i,
            /window\.__INITIAL_STATE__\s*=\s*({[^;]+});/
          ]

          for (const pattern of colorPatterns) {
            const match = html.match(pattern)
            if (match) {
              console.log(`      Found color data pattern:`)
              console.log(`      ${match[0].slice(0, 200)}...`)
              break
            }
          }

          // Look for variant/grade selector with colors
          if (html.includes('variant') || html.includes('grade')) {
            console.log(`      Has variant/grade selectors`)
          }

          break // Found working URL, move to next model

        } else if (res.status === 301 || res.status === 302) {
          const location = res.headers.get('location')
          console.log(`    ↪️  ${path}: Redirects to ${location}`)
        }

      } catch (err) {
        // Skip network errors
      }
    }
  }
}

// Probe 3: Search for configurator/build tools
async function probeConfigurator() {
  console.log('\n🔍 Probing configurator/build tools...')

  const configuratorPaths = [
    'configurator',
    'build-and-price',
    'customise',
    'build-your-nissan',
    'tools/configurator',
    'vehicles/configurator'
  ]

  for (const path of configuratorPaths) {
    try {
      const url = `https://www.nissan.com.au/${path}`
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: 'manual'
      })

      if (res.status === 200 || res.status === 301 || res.status === 302) {
        const location = res.headers.get('location')
        console.log(`  ${res.status === 200 ? '✅' : '↪️ '} /${path}${location ? ` → ${location}` : ''}`)
      }

    } catch (err) {
      // Skip
    }
  }
}

// Probe 4: Check Nissan CDN for static data
async function probeCDN() {
  console.log('\n🔍 Probing Nissan CDN for static data files...')

  const cdnPaths = [
    'https://www.nissan.com.au/content/dam/nissan/au/data/models.json',
    'https://www.nissan.com.au/content/dam/nissan/au/data/vehicles.json',
    'https://www.nissan.com.au/content/dam/nissan/au/data/colours.json',
    'https://www.nissan.com.au/content/dam/nissan/au/data/variants.json',
    'https://cdn.nissan.com.au/data/models.json',
    'https://cdn.nissan.com.au/api/vehicles.json'
  ]

  for (const url of cdnPaths) {
    try {
      const res = await fetch(url, { headers: HEADERS })

      if (res.ok) {
        console.log(`  ✅ ${url.split('/').slice(-2).join('/')}`)
        const data = await res.json()
        console.log(`     Keys: ${Object.keys(data).join(', ')}`)
        console.log(`     Sample:`, JSON.stringify(data).slice(0, 200))
      }

    } catch (err) {
      // Skip
    }
  }
}

// Probe 5: Check for GraphQL endpoints
async function probeGraphQL() {
  console.log('\n🔍 Probing for GraphQL endpoints...')

  const graphqlPaths = [
    'https://www.nissan.com.au/api/graphql',
    'https://www.nissan.com.au/graphql',
    'https://api.nissan.com.au/graphql',
    'https://australia.nissan.com/graphql'
  ]

  for (const url of graphqlPaths) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: '{ __schema { types { name } } }'
        })
      })

      if (res.ok || res.status === 400) { // 400 might mean GraphQL is there but query is wrong
        console.log(`  ✅ ${url}: ${res.status}`)
        const text = await res.text()
        console.log(`     Response: ${text.slice(0, 200)}`)
      }

    } catch (err) {
      // Skip
    }
  }
}

// Probe 6: Check discovered_apis table for Nissan endpoints
async function probeDiscoveredApis() {
  console.log('\n🔍 Checking discovered_apis for Nissan endpoints...')

  const { data } = await s
    .from('discovered_apis')
    .select('url, method, auth_type, headers_json, response_example')
    .eq('oem_id', 'nissan-au')

  if (!data || data.length === 0) {
    console.log(`  No APIs found in discovered_apis table`)
    return
  }

  console.log(`  Found ${data.length} discovered APIs:`)

  for (const api of data) {
    console.log(`\n  ${api.method || 'GET'} ${api.url}`)
    if (api.auth_type) console.log(`    Auth: ${api.auth_type}`)

    // Check if this API might have color data
    if (api.response_example) {
      const example = typeof api.response_example === 'string'
        ? api.response_example
        : JSON.stringify(api.response_example)

      if (example.toLowerCase().includes('color') ||
          example.toLowerCase().includes('colour') ||
          example.toLowerCase().includes('paint')) {
        console.log(`    ✅ Response includes color data`)
        console.log(`    Sample: ${example.slice(0, 200)}`)
      }
    }
  }
}

async function main() {
  console.log('🚗 Probing Nissan Australia for vehicle color data (V2)...\n')

  await probeSiteStructure()
  await probeModelPages()
  await probeConfigurator()
  await probeCDN()
  await probeGraphQL()
  await probeDiscoveredApis()

  console.log('\n✅ Comprehensive color data probe complete!')
  console.log('\n📝 Next steps:')
  console.log('  1. Inspect working URLs found above')
  console.log('  2. Check browser DevTools Network tab for XHR/fetch calls')
  console.log('  3. Look for color data in variant selection UI')
  console.log('  4. Consider using Playwright for dynamic content extraction')
}

main().catch(console.error)
