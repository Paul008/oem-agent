#!/usr/bin/env node
// Probe Hyundai accessories API
// API: https://www.hyundai.com/content/api/au/hyundai/v3/accessories?groupId={groupId}
// GroupIds come from model accessories pages: model-series-id="..." attribute

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

// Models with known groupIds
const KNOWN_MODELS = [
  { name: 'Tucson', slug: 'tucson', groupId: '990EEC2C-4AFE-4AD2-B016-73BCD2EB5B44' },
  { name: 'Kona', slug: 'kona', groupId: '9F6AA9F2-17C6-4148-B47B-1054467C933B' },
  { name: 'Venue', slug: 'venue', groupId: '4AEAFF7A-088F-4686-AE85-CEF84E83D8EE' },
  { name: 'Santa Fe', slug: 'santa-fe', groupId: 'B58EB7A1-CD96-435C-A728-8E7748FE7520' },
  { name: 'Palisade', slug: 'palisade', groupId: 'A15B22F2-30DE-4B8C-8A95-9E814662ECDD' },
  { name: 'i30', slug: 'i30', groupId: 'C4994B0D-A89D-4113-B6CD-B5D9352512C3' },
  { name: 'Staria', slug: 'staria', groupId: 'E14E5076-A170-4F6C-86EF-AEF77027B46A' },
]

// Models that need groupId discovery
const UNKNOWN_MODELS = [
  { name: 'IONIQ 5', slug: 'ioniq-5', pageSlug: 'ioniq5' },
  { name: 'IONIQ 5 N', slug: 'ioniq-5-n', pageSlug: 'ioniq-5-n' },
  { name: 'IONIQ 6', slug: 'ioniq-6', pageSlug: 'ioniq6' },
  { name: 'IONIQ 9', slug: 'ioniq-9', pageSlug: 'ioniq9' },
  { name: 'INSTER', slug: 'inster', pageSlug: 'inster' },
  { name: 'i30 N', slug: 'i30-n', pageSlug: 'i30n' },
  { name: 'i30 Sedan', slug: 'i30-sedan', pageSlug: 'i30-sedan' },
  { name: 'i20 N', slug: 'i20-n', pageSlug: 'i20n' },
  { name: 'Sonata N Line', slug: 'sonata-n-line', pageSlug: 'sonata' },
  { name: 'i30 N Line', slug: 'i30-n-line', pageSlug: 'i30-n-line' },
]

// Step 1: Scrape missing groupIds from Hyundai website
console.log('=== Discovering missing groupIds ===')
const allModels = [...KNOWN_MODELS]

for (const model of UNKNOWN_MODELS) {
  // Try several URL patterns
  const urlPatterns = [
    `https://www.hyundai.com/au/en/owning/accessories/${model.pageSlug}`,
    `https://www.hyundai.com/au/en/owning/accessories/${model.slug}`,
  ]

  let found = false
  for (const pageUrl of urlPatterns) {
    try {
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': HEADERS['User-Agent'], Accept: 'text/html' },
        redirect: 'follow',
      })
      if (!res.ok) continue

      const html = await res.text()
      const match = html.match(/model-series-id="([^"]+)"/)
      if (match && match[1]) {
        console.log(`  ${model.name}: ${match[1]} (from ${pageUrl})`)
        allModels.push({ name: model.name, slug: model.slug, groupId: match[1] })
        found = true
        break
      }

      // Also try data-group-id or groupId in script tags
      const match2 = html.match(/groupId['":\s]+([A-F0-9-]{36})/i)
      if (match2 && match2[1]) {
        console.log(`  ${model.name}: ${match2[1]} (script, from ${pageUrl})`)
        allModels.push({ name: model.name, slug: model.slug, groupId: match2[1] })
        found = true
        break
      }
    } catch (e) {
      // continue
    }
  }
  if (!found) console.log(`  ${model.name}: NOT FOUND`)
}

console.log(`\nTotal models with groupIds: ${allModels.length}`)

// Step 2: Fetch accessories for all models with known groupIds
console.log('\n=== Fetching accessories ===')
let totalCount = 0
let totalPacks = 0
const allCategories = new Set()
const allAccessories = new Map()
const modelResults = []

for (const model of allModels) {
  const url = `https://www.hyundai.com/content/api/au/hyundai/v3/accessories?groupId=${model.groupId}`
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) {
      console.log(`  ${model.name}: HTTP ${res.status}`)
      continue
    }

    const data = await res.json()
    const accs = data.accessories || []
    const packs = data.accessoryPacks || []

    console.log(`  ${model.name}: ${accs.length} accessories, ${packs.length} packs`)
    modelResults.push({ name: model.name, slug: model.slug, count: accs.length, packs: packs.length })

    for (const acc of accs) {
      if (acc.category) allCategories.add(acc.category)
      const key = acc.accessoryId || acc.partNumber
      if (key && !allAccessories.has(key)) {
        allAccessories.set(key, { ...acc, _modelSlug: model.slug })
      }
    }
    for (const pack of packs) {
      const key = pack.accessoryId || pack.packId
      if (key && !allAccessories.has(key)) {
        allAccessories.set(key, { ...pack, _modelSlug: model.slug, _isPack: true })
      }
    }

    totalCount += accs.length
    totalPacks += packs.length
  } catch (e) {
    console.log(`  ${model.name}: ERROR - ${e.message}`)
  }
}

// Summary
console.log('\n=== Summary ===')
console.log(`Models with data: ${modelResults.length}`)
console.log(`Total accessories (raw): ${totalCount}`)
console.log(`Total packs (raw): ${totalPacks}`)
console.log(`Unique accessories (by accessoryId): ${allAccessories.size}`)
console.log(`Categories: ${[...allCategories].join(', ')}`)

const prices = [...allAccessories.values()]
  .map(a => parseFloat(a.rrpIncFitment) || parseFloat(a.price) || 0)
  .filter(p => p > 0)
if (prices.length > 0) {
  console.log(`Price range: $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)
}

// Show sample
const sample = [...allAccessories.values()][0]
if (sample) {
  const { _modelSlug, _isPack, ...rest } = sample
  console.log('\nSample keys:', Object.keys(rest).join(', '))
  console.log(JSON.stringify(rest, null, 2).substring(0, 2000))
}
