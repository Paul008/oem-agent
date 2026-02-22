#!/usr/bin/env node
/**
 * Probe Mitsubishi Australia color data APIs.
 *
 * TWO data sources discovered:
 *
 * 1. MAGENTO 2 GRAPHQL (store.mitsubishi-motors.com.au/graphql)
 *    - configurable_options.exterior_code → 22 unique colours with swatch images
 *    - Per-variant pricing by colour (premium colours like Black Diamond +$990)
 *    - Swatch images: /media/attribute/swatch/swatch_thumb/110x90/{path}
 *    - Full swatch: /media/attribute/swatch/{path}
 *    - No auth required
 *
 * 2. AEM ASSETS API (mitsubishi-motors.com.au/api/assets/mmal/vehicles)
 *    - Per-colour CGI renders (3/4 front, side, rear-left) for every grade/colour combo
 *    - Hierarchical DAM: {model}/{MY}/{seats}/{grade}/{drivetrain}/{fuel}/{trans}/{colour}/
 *    - No auth required (Siren+JSON format)
 *    - ~3 images per colour per grade: {angle}_{colour}.png
 *
 * Run: cd dashboard/scripts && node probe-mitsubishi-colors.mjs
 */

const GQL = 'https://store.mitsubishi-motors.com.au/graphql'
const AEM_BASE = 'https://www.mitsubishi-motors.com.au/api/assets/mmal'

async function gql(query) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '))
  return json.data
}

async function fetchSiren(path) {
  const url = `${AEM_BASE}/${path}.json`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status !== 200) return null
    return await res.json()
  } catch { return null }
}

function sirenEntities(siren) {
  if (!siren?.entities) return []
  return siren.entities.map(e => ({
    name: e.properties?.name || 'unknown',
    type: (e.class || [])[0],
    isFolder: (e.class || [])[0] === 'assets/folder',
    isAsset: (e.class || [])[0] === 'assets/asset',
    properties: e.properties,
  }))
}

// Walk an AEM DAM folder recursively until we find leaf assets
async function walkToImages(path, maxDepth = 10) {
  if (maxDepth <= 0) return []
  const data = await fetchSiren(path)
  if (!data) return []
  const items = sirenEntities(data)
  const results = []
  for (const item of items) {
    if (item.isAsset && !item.properties?.contentFragment) {
      results.push({ name: item.name, dam: `/content/dam/mmal/${path}/${item.name}` })
    } else if (item.isFolder) {
      const sub = await walkToImages(`${path}/${item.name}`, maxDepth - 1)
      results.push(...sub)
    }
  }
  return results
}

console.log('='.repeat(70))
console.log('MITSUBISHI AUSTRALIA — COLOUR DATA PROBE')
console.log('='.repeat(70))

// ────────────────────────────────────────────────────────────────────
// 1. MAGENTO GRAPHQL: Extract all colours with swatch data
// ────────────────────────────────────────────────────────────────────
console.log('\n--- SOURCE 1: Magento 2 GraphQL ---')
console.log('Endpoint: https://store.mitsubishi-motors.com.au/graphql')
console.log('Auth: None required\n')

const data = await gql(`{
  products(filter: { category_id: { eq: "31" } }, pageSize: 60) {
    total_count
    items {
      sku name
      price_range { minimum_price { final_price { value } } }
      ... on ConfigurableProduct {
        configurable_options {
          attribute_code label
          values {
            label value_index uid
            swatch_data {
              value
              ... on ImageSwatchData { thumbnail }
            }
          }
        }
        variants {
          product {
            sku
            price_range { minimum_price { final_price { value } } }
          }
          attributes { code label value_index }
        }
      }
    }
  }
}`)

const items = data.products.items
console.log(`Products: ${items.length} ConfigurableProducts (vehicles)`)

// Aggregate unique colours
const colourMap = new Map()
let totalVariants = 0

for (const item of items) {
  const basePrice = item.price_range.minimum_price.final_price.value
  if (basePrice >= 99990) continue // placeholder

  for (const opt of item.configurable_options || []) {
    if (opt.attribute_code === 'exterior_code') {
      for (const v of opt.values) {
        if (!colourMap.has(v.label)) {
          colourMap.set(v.label, {
            name: v.label,
            value_index: v.value_index,
            uid: v.uid,
            swatch_path: v.swatch_data?.value || null,
            swatch_thumb_url: v.swatch_data?.thumbnail || null,
            products: [],
          })
        }
        const entry = colourMap.get(v.label)
        // Find price delta
        const variant = (item.variants || []).find(vr =>
          vr.attributes.some(a => a.code === 'exterior_code' && a.label === v.label)
        )
        const variantPrice = variant?.product.price_range.minimum_price.final_price.value
        const delta = (variantPrice && variantPrice < 99990) ? variantPrice - basePrice : 0
        entry.products.push({
          sku: item.sku,
          name: item.name,
          basePrice,
          colourPrice: variantPrice || basePrice,
          priceDelta: delta,
        })
      }
    }
  }
  totalVariants += (item.variants || []).length
}

console.log(`Variants: ${totalVariants} (colour x interior x pack combos)`)
console.log(`Unique colours: ${colourMap.size}\n`)

console.log('COLOUR CATALOG:')
console.log('-'.repeat(110))
console.log('Colour Name          | Idx   | UID                              | Swatch Path                    | Products | Premium')
console.log('-'.repeat(110))

for (const [name, info] of [...colourMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const maxDelta = Math.max(...info.products.map(p => p.priceDelta))
  const premium = maxDelta > 0 ? `+$${maxDelta}` : 'base'
  const uidShort = info.uid ? info.uid.substring(0, 32) : 'N/A'
  console.log(
    `${name.padEnd(21)}| ${String(info.value_index).padEnd(6)}| ${uidShort.padEnd(33)}| ${(info.swatch_path || 'none').padEnd(31)}| ${String(info.products.length).padEnd(9)}| ${premium}`
  )
}

console.log('\nSWATCH IMAGE URLs:')
console.log('  Thumbnail (110x90): https://store.mitsubishi-motors.com.au/media/attribute/swatch/swatch_thumb/110x90/{path}')
console.log('  Full swatch:        https://store.mitsubishi-motors.com.au/media/attribute/swatch/{path}')
console.log('  Product catalog:    https://store.mitsubishi-motors.com.au/media/catalog/product/{path}')

// Show price by colour for one product
const sampleProduct = items.find(i => i.name === 'ES' && i.sku.startsWith('ZM2'))
if (sampleProduct) {
  console.log(`\nSAMPLE: ${sampleProduct.name} (${sampleProduct.sku}) — Price by colour:`)
  const basePrice = sampleProduct.price_range.minimum_price.final_price.value
  for (const v of sampleProduct.variants || []) {
    const ext = v.attributes.find(a => a.code === 'exterior_code')
    if (!ext) continue
    const vp = v.product.price_range.minimum_price.final_price.value
    if (vp >= 99990) continue
    const delta = vp - basePrice
    console.log(`  ${ext.label.padEnd(20)} $${vp.toLocaleString()} ${delta > 0 ? `(+$${delta})` : '(base)'}`)
  }
}

// ────────────────────────────────────────────────────────────────────
// 2. AEM ASSETS API: Per-colour CGI renders
// ────────────────────────────────────────────────────────────────────
console.log('\n\n--- SOURCE 2: AEM Assets API (per-colour vehicle renders) ---')
console.log('Endpoint: https://www.mitsubishi-motors.com.au/api/assets/mmal/vehicles/{model}/{MY}/...json')
console.log('Format: Siren+JSON (application/vnd.siren+json)')
console.log('Auth: None required\n')

// Show the folder hierarchy
console.log('DAM FOLDER HIERARCHY:')
console.log('  /content/dam/mmal/vehicles/')
console.log('    {model}/')
console.log('      {MY}/')
console.log('        {body-config}/    (e.g. 7-seats, 5-seats, double-cab-pick-up)')
console.log('          {grade}/        (e.g. es, aspire, exceed, gsr)')
console.log('            {drivetrain}/ (e.g. awd, 2wd, 4wd)')
console.log('              {fuel}/     (e.g. unleaded, diesel, plug-in-hybrid-ev)')
console.log('                {trans}/  (e.g. automatic)')
console.log('                  {colour}/ <-- PER-COLOUR FOLDER')
console.log('                    dnd-...-{colour}-3-4-front.png  (3/4 front angle)')
console.log('                    ..._side_{colour}.png            (side view)')
console.log('                    ..._rear-left_{colour}.png       (rear-left angle)')

// Demo: Walk one real path to show the actual images
console.log('\nDEMO: Outlander PHEV Exceed — colour render images:')
const demoPath = 'vehicles/outlander/25my/7-seats/plug-in-hybrid-ev-exceed/awd/plug-in-hybrid-ev/automatic'
const demoData = await fetchSiren(demoPath)

if (demoData) {
  const demoItems = sirenEntities(demoData)
  const colourFolders = demoItems.filter(i => i.isFolder)

  for (const folder of colourFolders) {
    const images = await walkToImages(`${demoPath}/${folder.name}`, 1)
    console.log(`\n  ${folder.name}/:`)
    for (const img of images) {
      const damUrl = `https://www.mitsubishi-motors.com.au${img.dam}`
      console.log(`    ${img.name}`)
      console.log(`    URL: ${damUrl}`)
    }
  }
}

// Also show the double-range marketing renders
console.log('\nMARKETING RENDERS (double-range):')
const drImages = await walkToImages('vehicles/outlander/25my/double-range', 1)
for (const img of drImages) {
  console.log(`  ${img.name}`)
  console.log(`  URL: https://www.mitsubishi-motors.com.au${img.dam}`)
}

// Show the build-and-price step-0 images (per-model selector)
console.log('\nBUILD & PRICE STEP-0 IMAGES:')
const models = ['asx', 'outlander', 'triton', 'eclipse-cross', 'pajero-sport']
for (const model of models) {
  const url = `https://www.mitsubishi-motors.com.au/content/dam/mmal/vehicles/build-and-price-step-0/dnd-${model}.png`
  try {
    const res = await fetch(url, { method: 'HEAD' })
    console.log(`  [${res.status}] dnd-${model}.png`)
  } catch { console.log(`  [ERR] dnd-${model}.png`) }
}

// Show the offers query images (per-SKU renders)
console.log('\nOFFER IMAGES (from GraphQL offers query):')
const offersData = await gql(`{
  offers(priceGroup: PRIVATE) {
    items { family vehicle { sku name } image }
  }
}`)
const uniqueOfferImages = [...new Set(offersData.offers.items.map(i => i.image).filter(Boolean))]
for (const img of uniqueOfferImages.slice(0, 10)) {
  console.log(`  ${img}`)
}
console.log(`  ... ${uniqueOfferImages.length} total unique offer images`)

// ────────────────────────────────────────────────────────────────────
// FINAL SUMMARY
// ────────────────────────────────────────────────────────────────────
console.log('\n\n' + '='.repeat(70))
console.log('COLOUR DATA SUMMARY')
console.log('='.repeat(70))
console.log(`
DATA AVAILABLE:

1. MAGENTO GRAPHQL COLOUR METADATA (PRIMARY)
   - 22 unique exterior colours across ${items.length} products, ${totalVariants} variants
   - Swatch images: thumbnail (110x90) + full-size PNG
   - Per-variant pricing: premium colours like Black Diamond, Red Diamond +$990
   - Colour classification: standard (no delta) vs premium (has delta)
   - UID + value_index for each colour (for programmatic matching)

2. AEM ASSETS API COLOUR RENDERS (SECONDARY)
   - High-resolution CGI renders for every grade + colour combination
   - Three angles per colour: 3/4-front, side, rear-left
   - Hierarchical folder structure navigable via /api/assets/mmal/...json
   - DAM path: /content/dam/mmal/vehicles/{model}/{MY}/{config}/.../.../{colour}/
   - Marketing double-range images per grade
   - No auth, public Siren+JSON API

3. ADDITIONAL IMAGE SOURCES
   - Offer images: /content/dam/mmal/offers/{year}/default/{model}/{sku}.png
   - B&P step-0 selector: /content/dam/mmal/vehicles/build-and-price-step-0/dnd-{model}.png
   - Interior trim photos: dnd-{trim}-{number}.jpg alongside colour folders

EXTRACTION STRATEGY:
  1. Query GraphQL products(category 31) for colour names, swatches, pricing
  2. Walk AEM /api/assets/mmal/vehicles/{model}/{MY}/...json for render image DAM paths
  3. Build render URLs: https://www.mitsubishi-motors.com.au{dam_path}
  4. Match GraphQL colour names to AEM folder names (slugified)
`)
