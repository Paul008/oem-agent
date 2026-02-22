#!/usr/bin/env node
/**
 * Probe KGM Payload CMS for colour data.
 * Endpoints:
 *   1. /api/colours?limit=200&depth=2  — master colour list
 *   2. /api/grades?limit=100&depth=3   — grades with nested colours
 *   3. /api/models?limit=100&depth=2   — models for grade-to-model mapping
 *
 * Run: node dashboard/scripts/probe-kgm-colors.mjs
 */

const BASE = 'https://payloadb.therefinerydesign.com/api'
const HEADERS = {
  Accept: 'application/json',
  Origin: 'https://kgm.com.au',
  Referer: 'https://kgm.com.au/',
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function fetchJSON(path) {
  const url = `${BASE}${path}`
  console.log(`  GET ${url}`)
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) {
    console.error(`  FAILED ${res.status} ${res.statusText}`)
    return null
  }
  return res.json()
}

async function probe() {
  // ── 1. Probe /api/colours directly ──
  console.log('\n=== 1. /api/colours (depth=2, limit=200) ===')
  const coloursData = await fetchJSON('/colours?limit=200&depth=2')
  if (!coloursData) {
    console.log('Colours endpoint failed, trying depth=1...')
  }

  if (coloursData) {
    const colours = coloursData.docs || []
    console.log(`Total colours: ${coloursData.totalDocs} (fetched ${colours.length})`)

    // Show full structure of first entry
    if (colours.length > 0) {
      console.log('\n--- First colour entry (full structure) ---')
      console.log(JSON.stringify(colours[0], null, 2))

      // Show second entry for comparison
      if (colours.length > 1) {
        console.log('\n--- Second colour entry ---')
        console.log(JSON.stringify(colours[1], null, 2))
      }
    }

    // Analyse all fields present across all colour entries
    console.log('\n--- Fields analysis across all colours ---')
    const fieldCounts = {}
    for (const c of colours) {
      for (const key of Object.keys(c)) {
        fieldCounts[key] = (fieldCounts[key] || 0) + 1
      }
    }
    console.log('Fields and occurrence counts:')
    for (const [field, count] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${field}: ${count}/${colours.length}`)
    }

    // Unique colour titles
    const titles = [...new Set(colours.map(c => c.title).filter(Boolean))].sort()
    console.log(`\nUnique colour names (${titles.length}): ${titles.join(', ')}`)

    // Price distribution
    const prices = colours.map(c => c.price).filter(p => p !== undefined && p !== null)
    const priceSet = [...new Set(prices)].sort((a, b) => a - b)
    console.log(`\nPrice values: ${priceSet.join(', ')}`)
    for (const p of priceSet) {
      console.log(`  $${p}: ${prices.filter(x => x === p).length} entries`)
    }

    // is_standard distribution
    const standardCounts = { true: 0, false: 0, undefined: 0 }
    for (const c of colours) {
      const key = c.is_standard === true ? 'true' : c.is_standard === false ? 'false' : 'undefined'
      standardCounts[key]++
    }
    console.log(`\nis_standard: true=${standardCounts.true}, false=${standardCounts.false}, undefined=${standardCounts.undefined}`)

    // Check for hex codes
    const withHex = colours.filter(c => c.hex || c.hex_code || c.color_hex || c.colour_hex)
    console.log(`\nEntries with hex code field: ${withHex.length}`)

    // Check icon/swatch data
    const withIcon = colours.filter(c => c.icon)
    const withCarImage = colours.filter(c => c.car_image)
    console.log(`Entries with icon (swatch): ${withIcon.length}`)
    console.log(`Entries with car_image (hero render): ${withCarImage.length}`)

    if (withIcon.length > 0) {
      const iconExample = withIcon[0].icon
      console.log('\n--- Icon (swatch) structure example ---')
      console.log(JSON.stringify(iconExample, null, 2))
    }

    if (withCarImage.length > 0) {
      const carExample = withCarImage[0].car_image
      console.log('\n--- Car image (hero render) structure example ---')
      console.log(JSON.stringify(carExample, null, 2))
    }

    // Summarise unique swatches
    const swatchUrls = colours
      .map(c => c.icon?.url || c.icon?.sizes?.thumbnail?.url)
      .filter(Boolean)
    const uniqueSwatches = [...new Set(swatchUrls)]
    console.log(`\nSwatch URLs: ${swatchUrls.length} total, ${uniqueSwatches.length} unique`)
    uniqueSwatches.slice(0, 5).forEach(u => console.log(`  ${u}`))

    // Summarise unique car renders
    const carUrls = colours
      .map(c => c.car_image?.url || c.car_image?.sizes?.medium?.url)
      .filter(Boolean)
    const uniqueCars = [...new Set(carUrls)]
    console.log(`\nCar render URLs: ${carUrls.length} total, ${uniqueCars.length} unique`)
    uniqueCars.slice(0, 5).forEach(u => console.log(`  ${u}`))
  }

  // ── 2. Probe /api/grades for nested colours ──
  console.log('\n\n=== 2. /api/grades (depth=3) — colour data nested in grades ===')
  const gradesData = await fetchJSON('/grades?limit=100&depth=3')
  if (gradesData) {
    const grades = gradesData.docs || []
    console.log(`Total grades: ${gradesData.totalDocs} (fetched ${grades.length})`)

    // Fetch models for mapping
    const modelsData = await fetchJSON('/models?limit=100&depth=2')
    const models = modelsData?.docs || []

    // Show colour structure from first grade that has colours
    const gradeWithColours = grades.find(g => g.colours?.length > 0)
    if (gradeWithColours) {
      console.log(`\n--- Grade "${gradeWithColours.name}" has ${gradeWithColours.colours.length} colours ---`)
      console.log('First colour in grade:')
      console.log(JSON.stringify(gradeWithColours.colours[0], null, 2))

      // Check if grade colours have additional fields vs /api/colours
      console.log('\n--- Grade colour fields ---')
      const gradeColourFields = {}
      for (const c of gradeWithColours.colours) {
        for (const key of Object.keys(c)) {
          gradeColourFields[key] = (gradeColourFields[key] || 0) + 1
        }
      }
      for (const [field, count] of Object.entries(gradeColourFields)) {
        console.log(`  ${field}: ${count}/${gradeWithColours.colours.length}`)
      }
    }

    // Build grade→model mapping
    function matchGradeToModel(gradeName) {
      const sorted = [...models].sort((a, b) => b.name.length - a.name.length)
      for (const m of sorted) {
        if (gradeName === m.name || gradeName.startsWith(m.name + ' ')) return m
      }
      const titleSorted = models
        .filter(m => m.title && (gradeName === m.title || gradeName.startsWith(m.title + ' ')))
        .sort((a, b) => a.name.length - b.name.length)
      return titleSorted.find(m => m.name.includes('MY24')) || titleSorted[0] || null
    }

    // Per-model colour summary
    console.log('\n\n=== 3. Colour summary by model and grade ===')
    const modelColourMap = new Map() // model.name → { grades, uniqueColours }

    for (const g of grades) {
      const model = matchGradeToModel(g.name)
      const modelName = model?.name || 'UNMATCHED'

      if (!modelColourMap.has(modelName)) {
        modelColourMap.set(modelName, { grades: [], uniqueColours: new Set() })
      }
      const entry = modelColourMap.get(modelName)
      const gradeColours = (g.colours || []).map(c => ({
        name: c.title,
        price: c.price,
        is_standard: c.is_standard,
        swatch: c.icon?.url || null,
        car_image: c.car_image?.url || null,
      }))
      entry.grades.push({
        grade: g.name,
        colourCount: gradeColours.length,
        colours: gradeColours,
      })
      gradeColours.forEach(c => entry.uniqueColours.add(c.name))
    }

    for (const [modelName, data] of modelColourMap) {
      console.log(`\n${modelName}:`)
      console.log(`  Unique colours: ${[...data.uniqueColours].sort().join(', ')}`)
      for (const gradeInfo of data.grades) {
        console.log(`  ${gradeInfo.grade} (${gradeInfo.colourCount} colours):`)
        for (const c of gradeInfo.colours) {
          const stdLabel = c.is_standard ? ' [STANDARD]' : ''
          const swatchLabel = c.swatch ? ' [swatch]' : ' [no swatch]'
          const heroLabel = c.car_image ? ' [hero render]' : ' [no hero]'
          console.log(`    - ${c.name}: $${c.price}${stdLabel}${swatchLabel}${heroLabel}`)
        }
      }
    }

    // Overall stats
    console.log('\n\n=== 4. Overall colour statistics ===')
    const allGradeColours = grades.flatMap(g => g.colours || [])
    const uniqueNames = [...new Set(allGradeColours.map(c => c.title).filter(Boolean))].sort()
    console.log(`Total colour entries across all grades: ${allGradeColours.length}`)
    console.log(`Unique colour names: ${uniqueNames.length}`)
    console.log(`Names: ${uniqueNames.join(', ')}`)

    const withSwatch = allGradeColours.filter(c => c.icon?.url)
    const withHero = allGradeColours.filter(c => c.car_image?.url)
    console.log(`\nWith swatch image: ${withSwatch.length}/${allGradeColours.length}`)
    console.log(`With hero render: ${withHero.length}/${allGradeColours.length}`)

    // Check for any hex-like fields anywhere
    console.log('\n--- Checking all colour fields for hex/RGB data ---')
    const allFields = new Set()
    for (const c of allGradeColours) {
      for (const key of Object.keys(c)) allFields.add(key)
      // Also check nested icon and car_image
      if (c.icon) for (const key of Object.keys(c.icon)) allFields.add(`icon.${key}`)
      if (c.car_image) for (const key of Object.keys(c.car_image)) allFields.add(`car_image.${key}`)
    }
    console.log(`All fields: ${[...allFields].sort().join(', ')}`)
  }

  // ── 5. Try depth=0 on colours for minimal response ──
  console.log('\n\n=== 5. /api/colours?depth=0 — check for ID-only references ===')
  const colourMinimal = await fetchJSON('/colours?limit=5&depth=0')
  if (colourMinimal) {
    console.log('Depth=0 sample:')
    console.log(JSON.stringify(colourMinimal.docs?.slice(0, 2), null, 2))
  }
}

probe().catch(err => { console.error(err); process.exit(1) })
