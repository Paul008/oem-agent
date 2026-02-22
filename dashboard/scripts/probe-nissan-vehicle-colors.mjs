#!/usr/bin/env node

/**
 * Probe Nissan Australia for vehicle color data
 * Discovery only - no DB writes
 */

import { createClient } from '@supabase/supabase-js'

const s = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const APIGEE_HEADERS = {
  apiKey: 'BbNYLp9yyK3SWNxM9ZHVSUzKyJT9b63a',
  clientKey: '305e64c10be2e8fc0b7452a55f64e3b0',
  publicAccessToken: 'e9c8b8c74e7f485f9c3b7ad8697b8da9'
}

// Get Nissan products from DB
async function getNissanProducts() {
  const { data, error } = await s
    .from('products')
    .select('id, variant_code, variant_name, external_key, meta_json, model_id')
    .eq('oem_id', 'nissan-au')

  if (error) throw error
  return data
}

// Probe 1: Apigee /v2/models/{model_code} for color data
async function probeApigeeModels(modelCodes) {
  console.log('\n🔍 Probing Apigee /v2/models endpoints...')

  const uniqueModels = [...new Set(modelCodes)]

  for (const modelCode of uniqueModels.slice(0, 3)) { // Test first 3 models
    try {
      const url = `https://australia.nissan-api.net/v2/models/${modelCode}`
      const res = await fetch(url, { headers: APIGEE_HEADERS })

      if (!res.ok) {
        console.log(`  ❌ ${modelCode}: ${res.status}`)
        continue
      }

      const data = await res.json()
      console.log(`  ✅ ${modelCode}: ${res.status}`)

      // Check for color-related fields
      const colorFields = ['colors', 'colour', 'paint', 'exterior', 'finish']
      const foundFields = colorFields.filter(field =>
        JSON.stringify(data).toLowerCase().includes(field)
      )

      if (foundFields.length > 0) {
        console.log(`     Color fields found: ${foundFields.join(', ')}`)
        console.log(`     Sample data:`, JSON.stringify(data, null, 2).slice(0, 500))
      }

    } catch (err) {
      console.log(`  ❌ ${modelCode}: ${err.message}`)
    }
  }
}

// Probe 2: Helios CDN for color data
async function probeHeliosCDN() {
  console.log('\n🔍 Probing Helios CDN models JSON...')

  try {
    const url = 'https://www.nissan.com.au/content/dam/nissan/au/data/nissan-models-au.json'
    const res = await fetch(url)

    if (!res.ok) {
      console.log(`  ❌ ${res.status}`)
      return
    }

    const data = await res.json()
    console.log(`  ✅ ${res.status}`)
    console.log(`     Models found: ${data?.models?.length || 0}`)

    // Check for color data in first model
    if (data?.models?.[0]) {
      const model = data.models[0]
      console.log(`     Sample model: ${model.name}`)

      const colorFields = ['colors', 'colour', 'paint', 'exterior', 'finish', 'variants']
      const foundFields = colorFields.filter(field =>
        JSON.stringify(model).toLowerCase().includes(field)
      )

      if (foundFields.length > 0) {
        console.log(`     Color fields found: ${foundFields.join(', ')}`)
        console.log(`     Sample:`, JSON.stringify(model, null, 2).slice(0, 1000))
      }
    }

  } catch (err) {
    console.log(`  ❌ ${err.message}`)
  }
}

// Probe 3: Browse-range model pages for embedded color data
async function probeBrowseRangePages() {
  console.log('\n🔍 Probing browse-range HTML pages...')

  const testModels = ['navara', 'qashqai', 'x-trail']

  for (const slug of testModels) {
    try {
      const url = `https://www.nissan.com.au/vehicles/new-vehicles/${slug}.html`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      })

      if (!res.ok) {
        console.log(`  ❌ ${slug}: ${res.status}`)
        continue
      }

      const html = await res.text()
      console.log(`  ✅ ${slug}: ${res.status} (${Math.round(html.length / 1024)}KB)`)

      // Check for JSON-LD structured data
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
      if (jsonLdMatch) {
        console.log(`     Found JSON-LD`)
      }

      // Check for data attributes with color info
      const dataAttrPatterns = [
        /data-colors?="([^"]+)"/gi,
        /data-paint="([^"]+)"/gi,
        /data-exterior="([^"]+)"/gi,
        /data-variant.*color/gi
      ]

      for (const pattern of dataAttrPatterns) {
        const matches = html.match(pattern)
        if (matches) {
          console.log(`     Found data attributes: ${matches.slice(0, 2).join(', ')}`)
        }
      }

      // Check for embedded JSON config
      const configMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s) ||
                         html.match(/window\.nissan\s*=\s*({.*?});/s) ||
                         html.match(/"colors?":\s*\[(.*?)\]/s)

      if (configMatch) {
        console.log(`     Found embedded JSON config`)
        const snippet = configMatch[0].slice(0, 300)
        console.log(`     Snippet: ${snippet}...`)
      }

    } catch (err) {
      console.log(`  ❌ ${slug}: ${err.message}`)
    }
  }
}

// Probe 4: Check for 360 spin/configurator image paths
async function probeImagePaths() {
  console.log('\n🔍 Probing vehicle image paths...')

  const testPaths = [
    'https://www.nissan.com.au/content/dam/Nissan/au/vehicles/navara/360/navara-exterior-colors.json',
    'https://www.nissan.com.au/content/dam/Nissan/au/vehicles/qashqai/colors/colors.json',
    'https://www.nissan.com.au/content/dam/nissan/au/data/navara-colors.json',
    'https://www.nissan.com.au/content/dam/nissan/au/colours/navara.json'
  ]

  for (const url of testPaths) {
    try {
      const res = await fetch(url)
      console.log(`  ${res.ok ? '✅' : '❌'} ${url.split('/').slice(-3).join('/')}: ${res.status}`)

      if (res.ok) {
        const data = await res.json()
        console.log(`     Data:`, JSON.stringify(data, null, 2).slice(0, 500))
      }
    } catch (err) {
      console.log(`  ❌ ${url.split('/').slice(-3).join('/')}: ${err.message}`)
    }
  }
}

// Probe 5: Check existing product meta_json for color hints
async function probeProductMetaJson() {
  console.log('\n🔍 Checking existing product meta_json for color data...')

  const { data: products } = await s
    .from('products')
    .select('variant_code, variant_name, meta_json')
    .eq('oem_id', 'nissan-au')
    .limit(5)

  if (!products) return

  for (const p of products) {
    if (!p.meta_json || Object.keys(p.meta_json).length === 0) continue

    const json = typeof p.meta_json === 'string'
      ? JSON.parse(p.meta_json)
      : p.meta_json

    const colorFields = ['colors', 'colour', 'paint', 'exterior', 'finish']
    const foundFields = colorFields.filter(field =>
      JSON.stringify(json).toLowerCase().includes(field)
    )

    if (foundFields.length > 0) {
      console.log(`  ${p.variant_code || p.variant_name}:`)
      console.log(`     Color fields: ${foundFields.join(', ')}`)
      console.log(`     Sample:`, JSON.stringify(json, null, 2).slice(0, 300))
    }
  }
}

// Main probe execution
async function main() {
  console.log('🚗 Probing Nissan Australia for vehicle color data...\n')

  const products = await getNissanProducts()
  console.log(`📊 Found ${products.length} Nissan products in DB`)

  const modelCodes = products
    .map(p => p.meta_json?.modelCode || p.variant_code || p.variant_name)
    .filter(Boolean)

  await probeApigeeModels(modelCodes)
  await probeHeliosCDN()
  await probeBrowseRangePages()
  await probeImagePaths()
  await probeProductMetaJson()

  console.log('\n✅ Color data probe complete!')
}

main().catch(console.error)
