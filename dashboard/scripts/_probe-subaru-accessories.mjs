#!/usr/bin/env node
// Probe Subaru accessories — discover API from website
// Known endpoint: https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api
// Needs x-api-key header

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

// Step 1: Check the Subaru accessories page for any embedded API keys or endpoints
console.log('=== Probing Subaru website for API key ===')

const pages = [
  'https://www.subaru.com.au/accessories',
  'https://www.subaru.com.au/accessories/forester',
  'https://www.subaru.com.au/build-and-price',
]

for (const pageUrl of pages) {
  try {
    const res = await fetch(pageUrl, { headers: HEADERS, redirect: 'follow' })
    console.log(`${pageUrl}: ${res.status}`)
    if (!res.ok) continue

    const html = await res.text()
    console.log(`  Size: ${html.length} bytes`)

    // Look for API keys
    const apiKeyPatterns = [
      /x-api-key['":\s]+([a-zA-Z0-9]{20,})/gi,
      /apiKey['":\s]+['"]([a-zA-Z0-9]{20,})['"]/gi,
      /API_KEY['":\s]+['"]([a-zA-Z0-9]{20,})['"]/gi,
      /execute-api[^'"]*ap-southeast-2[^'"]+/g,
      /gn6lyzqet4[^'"]+/g,
      /pn8w2w2g74[^'"]+/g,
      /retailer[^'"]*api/gi,
    ]

    for (const pattern of apiKeyPatterns) {
      const matches = html.matchAll(pattern)
      for (const m of matches) {
        console.log(`  Found: ${m[0].substring(0, 100)}`)
      }
    }

    // Look for JS bundle files that might contain API config
    const scriptPattern = /src="([^"]*(?:main|app|chunk|vendor|config)[^"]*\.js[^"]*)"/gi
    const scripts = [...html.matchAll(scriptPattern)].slice(0, 5)
    if (scripts.length > 0) {
      console.log(`  Scripts: ${scripts.map(s => s[1].substring(0, 80)).join('\n    ')}`)
    }

    // Look for __NEXT_DATA__ or similar embedded config
    const nextDataMatch = html.match(/__NEXT_DATA__[^{]*([\s\S]{0,500})/)
    if (nextDataMatch) console.log(`  __NEXT_DATA__ found`)

    const configMatch = html.match(/window\.__CONFIG__|window\.config|window\.ENV/i)
    if (configMatch) console.log(`  Config var found: ${configMatch[0]}`)

  } catch (e) {
    console.log(`${pageUrl}: ${e.message}`)
  }
}

// Step 2: Try the production API with common API key patterns
console.log('\n=== Testing Subaru API endpoints ===')
const API_BASE = 'https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api'

// Try without auth
try {
  const res = await fetch(`${API_BASE}/v1/models`, {
    headers: {
      'User-Agent': HEADERS['User-Agent'],
      'Accept': 'application/json',
    }
  })
  console.log(`No auth: ${res.status} ${res.statusText}`)
  if (res.ok) {
    const data = await res.json()
    console.log('  Data:', JSON.stringify(data).substring(0, 500))
  }
} catch (e) {
  console.log(`No auth: ${e.message}`)
}

// Try the alternative production endpoint from docs
try {
  const alt = 'https://pn8w2w2g74.execute-api.ap-southeast-2.amazonaws.com/production/api'
  const res = await fetch(`${alt}/v1/models`, {
    headers: {
      'User-Agent': HEADERS['User-Agent'],
      'Accept': 'application/json',
    }
  })
  console.log(`Alt endpoint: ${res.status} ${res.statusText}`)
} catch (e) {
  console.log(`Alt endpoint: ${e.message}`)
}

// Step 3: Check if there's a publicly-accessible accessories API or page with JSON data
console.log('\n=== Checking for Subaru accessory data in HTML ===')
try {
  const res = await fetch('https://www.subaru.com.au/accessories/forester', { headers: HEADERS })
  if (res.ok) {
    const html = await res.text()
    console.log(`Forester accessories page: ${html.length} bytes`)

    // Check for JSON-LD or structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    if (jsonLdMatch) console.log(`  JSON-LD blocks: ${jsonLdMatch.length}`)

    // Check for price data
    const priceMatches = html.match(/\$\d[\d,.]+/g)
    if (priceMatches) console.log(`  Price mentions: ${priceMatches.length} (sample: ${priceMatches.slice(0, 5).join(', ')})`)

    // Check for part numbers
    const partMatches = html.match(/[A-Z0-9]{6,10}/g)
    if (partMatches) {
      const unique = [...new Set(partMatches)].filter(p => /^[A-Z]\d{2}/.test(p))
      if (unique.length > 0) console.log(`  Part number candidates: ${unique.slice(0, 10).join(', ')}`)
    }

    // Check for API calls in inline scripts
    const inlineScripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || []
    for (const script of inlineScripts) {
      if (script.includes('api') || script.includes('fetch') || script.includes('axios')) {
        const snippet = script.substring(0, 200).replace(/<[^>]+>/g, '')
        if (snippet.trim()) console.log(`  API-related script: ${snippet.substring(0, 150)}`)
      }
    }
  }
} catch (e) {
  console.log(`Forester page: ${e.message}`)
}
