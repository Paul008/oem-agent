#!/usr/bin/env node
// Probe Isuzu: build carNames from range data, fetch accessories via GetCarColours

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.isuzuute.com.au/build-and-quote',
  'Origin': 'https://www.isuzuute.com.au',
}

const RANGE_SOURCES = [
  { model: 'D-MAX', dsId: '%7B58ED1496-0A3E-4C26-84B5-4A9A766BF139%7D' },
  { model: 'MU-X', dsId: '%7BC91E66BB-1837-4DA2-AB7F-D0041C9384D7%7D' },
]

function buildCarName(model, name) {
  // "4x4 X-TERRAIN Crew Cab Ute" -> "D-MAX-4x4-X-TERRAIN-Crew-Cab-Ute"
  // Remove engine size in parentheses and " - High Ride" suffix for the base name
  let clean = name.replace(/\s*\(\d+\.\d+L\)\s*/g, '').trim()

  // Handle " - High Ride" -> "-High-Ride"
  clean = clean.replace(/\s*-\s*High Ride/g, '-High-Ride')

  // Replace spaces with hyphens
  clean = clean.replace(/\s+/g, '-')

  // Remove + from grade names
  clean = clean.replace(/\+/g, '')

  return `${model}-${clean}`
}

const allCarNames = new Set()

for (const src of RANGE_SOURCES) {
  const url = `https://www.isuzuute.com.au/isuzuapi/RangeAPI/GetRangeData?dataSourceId=${src.dsId}`
  const r = await fetch(url, { headers: HEADERS })
  const data = await r.json()

  for (const car of data.Cars || []) {
    // Skip 2.2L variants for now (they share accessories with 3.0L)
    if (car.Name.includes('2.2L')) continue

    const carName = buildCarName(src.model, car.Name)
    allCarNames.add(carName)
  }
}

console.log(`Built ${allCarNames.size} carNames:`)
for (const cn of [...allCarNames].sort()) console.log(`  ${cn}`)

// Fetch accessories
console.log('\n--- Fetching accessories ---')
const allAccessories = new Map()
const variantResults = []

for (const carName of [...allCarNames].sort()) {
  const url = `https://www.isuzuute.com.au/isuzuapi/BuildandQuote/GetCarColours?carName=${encodeURIComponent(carName)}`
  const r = await fetch(url, { headers: HEADERS })
  const text = await r.text()
  if (text === 'null' || text === '') {
    console.log(`  skip ${carName}: null`)
    continue
  }

  try {
    const data = JSON.parse(text)
    const accCats = ['AccessoriesExteriorFrontAndSide', 'AccessoriesExteriorRear', 'AccessoriesRoofAndInterior', 'GenuineTrayBodies']
    let count = 0
    for (const cat of accCats) {
      if (Array.isArray(data[cat])) {
        for (const acc of data[cat]) {
          count++
          if (!allAccessories.has(acc.ItemId)) {
            acc._category = cat
            acc._variants = [carName]
            allAccessories.set(acc.ItemId, acc)
          } else {
            allAccessories.get(acc.ItemId)._variants.push(carName)
          }
        }
      }
    }
    console.log(`  ${carName}: ${count} accessories`)
    variantResults.push({ name: carName, count })
  } catch (e) {
    console.log(`  ${carName}: error`)
  }
}

// Summary
console.log(`\n=== Summary ===`)
console.log(`Variants with accessories: ${variantResults.length}/${allCarNames.size}`)
console.log(`Unique accessories (by ItemId): ${allAccessories.size}`)

const catMap = {}
for (const [, acc] of allAccessories) {
  const cat = acc._category.replace('Accessories', '').replace('Genuine', '')
  catMap[cat] = (catMap[cat] || 0) + 1
}
console.log('Categories:', catMap)

const prices = [...allAccessories.values()].map(a => parseFloat(a.Price)).filter(p => p > 0)
if (prices.length > 0) console.log(`Price range: $${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`)

// Sample
const sample = [...allAccessories.values()][0]
if (sample) {
  console.log('\nSample keys:', Object.keys(sample).filter(k => !k.startsWith('_')).join(', '))
  const { _variants, _category, ...rest } = sample
  console.log(JSON.stringify(rest, null, 2).substring(0, 2000))
}
