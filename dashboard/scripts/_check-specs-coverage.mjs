/**
 * Check product specs_json coverage across all OEMs.
 * Run: node /tmp/_check-specs-coverage.mjs
 * 
 * Checks:
 * 1. Total products with/without specs_json per OEM
 * 2. Products missing specs_json entirely
 * 3. Products where specs_json is missing key categories
 * 4. Mazda 'wheels' category issue specifically
 * 5. EVs with wrong fuel_type / missing engine specs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const KEY_CATEGORIES = ['engine', 'transmission', 'dimensions', 'performance', 'towing', 'capacity', 'safety', 'wheels']

// EV-related keywords to detect electric vehicles
const EV_KEYWORDS = ['electric', 'ev', 'bev', 'phev', 'e-', 'ioniq', 'kona electric', 'niro ev', 'ev6', 'ev5', 'ev9', 'id.', 'mach-e', 'mustang mach', 'solterra', 'leaf', 'ariya', 'eclipse cross phev', 'outlander phev', 'ora']

async function main() {
  console.log('='.repeat(80))
  console.log('PRODUCT SPECS (specs_json) COVERAGE REPORT')
  console.log('='.repeat(80))
  console.log()

  // Fetch all products with their OEM info
  const { data: products, error } = await supabase
    .from('products')
    .select('id, oem_id, title, external_key, specs_json, fuel_type')
    .order('oem_id')
    .order('title')

  if (error) {
    console.error('Error fetching products:', error.message)
    process.exit(1)
  }

  console.log(`Total products in database: ${products.length}`)
  console.log()

  // ──────────────────────────────────────────────
  // 1. Per-OEM summary: with/without specs_json
  // ──────────────────────────────────────────────
  console.log('─'.repeat(80))
  console.log('1. SPECS_JSON COVERAGE PER OEM')
  console.log('─'.repeat(80))
  console.log()

  const oemGroups = {}
  for (const p of products) {
    if (!oemGroups[p.oem_id]) oemGroups[p.oem_id] = { with: 0, without: 0, total: 0, products: [] }
    oemGroups[p.oem_id].total++
    oemGroups[p.oem_id].products.push(p)
    if (p.specs_json && typeof p.specs_json === 'object' && Object.keys(p.specs_json).length > 0) {
      oemGroups[p.oem_id].with++
    } else {
      oemGroups[p.oem_id].without++
    }
  }

  const sortedOems = Object.keys(oemGroups).sort()
  let totalWith = 0, totalWithout = 0

  console.log(pad('OEM', 20) + pad('Total', 8) + pad('With Specs', 12) + pad('Missing', 10) + pad('Coverage', 10))
  console.log('-'.repeat(60))
  for (const oem of sortedOems) {
    const g = oemGroups[oem]
    totalWith += g.with
    totalWithout += g.without
    const pct = g.total > 0 ? ((g.with / g.total) * 100).toFixed(1) : '0.0'
    console.log(pad(oem, 20) + pad(g.total, 8) + pad(g.with, 12) + pad(g.without, 10) + pad(`${pct}%`, 10))
  }
  console.log('-'.repeat(60))
  const totalPct = products.length > 0 ? ((totalWith / products.length) * 100).toFixed(1) : '0.0'
  console.log(pad('TOTAL', 20) + pad(products.length, 8) + pad(totalWith, 12) + pad(totalWithout, 10) + pad(`${totalPct}%`, 10))
  console.log()

  // ──────────────────────────────────────────────
  // 2. Products MISSING specs_json entirely
  // ──────────────────────────────────────────────
  console.log('─'.repeat(80))
  console.log('2. PRODUCTS MISSING specs_json ENTIRELY')
  console.log('─'.repeat(80))
  console.log()

  const missing = products.filter(p => !p.specs_json || typeof p.specs_json !== 'object' || Object.keys(p.specs_json).length === 0)

  if (missing.length === 0) {
    console.log('All products have specs_json populated!')
  } else {
    console.log(`${missing.length} products missing specs_json:`)
    console.log()
    console.log(pad('OEM', 20) + pad('Title', 50) + 'External Key')
    console.log('-'.repeat(100))
    for (const p of missing) {
      console.log(pad(p.oem_id, 20) + pad(truncate(p.title, 48), 50) + (p.external_key || 'N/A'))
    }
  }
  console.log()

  // ──────────────────────────────────────────────
  // 3. Products with specs_json but missing key categories
  // ──────────────────────────────────────────────
  console.log('─'.repeat(80))
  console.log('3. SPECS_JSON CATEGORY COVERAGE ANALYSIS')
  console.log('─'.repeat(80))
  console.log()

  const withSpecs = products.filter(p => p.specs_json && typeof p.specs_json === 'object' && Object.keys(p.specs_json).length > 0)

  // Global category stats
  const categoryStats = {}
  for (const cat of KEY_CATEGORIES) {
    categoryStats[cat] = { present: 0, missing: 0, missingProducts: [] }
  }

  for (const p of withSpecs) {
    const specKeys = Object.keys(p.specs_json).map(k => k.toLowerCase())
    for (const cat of KEY_CATEGORIES) {
      // Check for exact match or partial match (e.g. "engine_specs" matches "engine")
      const found = specKeys.some(k => k.includes(cat) || cat.includes(k))
      if (found) {
        categoryStats[cat].present++
      } else {
        categoryStats[cat].missing++
        categoryStats[cat].missingProducts.push(p)
      }
    }
  }

  console.log(`Products with specs_json: ${withSpecs.length}`)
  console.log()
  console.log(pad('Category', 16) + pad('Present', 10) + pad('Missing', 10) + pad('Coverage', 10))
  console.log('-'.repeat(46))
  for (const cat of KEY_CATEGORIES) {
    const s = categoryStats[cat]
    const pct = withSpecs.length > 0 ? ((s.present / withSpecs.length) * 100).toFixed(1) : '0.0'
    console.log(pad(cat, 16) + pad(s.present, 10) + pad(s.missing, 10) + pad(`${pct}%`, 10))
  }
  console.log()

  // Show per-OEM breakdown for categories with low coverage
  for (const cat of KEY_CATEGORIES) {
    const s = categoryStats[cat]
    if (s.missing > 0 && s.missing <= 50) {
      console.log(`  Products missing '${cat}':`)
      // Group by OEM
      const byOem = {}
      for (const p of s.missingProducts) {
        if (!byOem[p.oem_id]) byOem[p.oem_id] = []
        byOem[p.oem_id].push(p.title)
      }
      for (const [oem, titles] of Object.entries(byOem).sort()) {
        console.log(`    ${oem} (${titles.length}): ${titles.slice(0, 5).join(', ')}${titles.length > 5 ? ` ... +${titles.length - 5} more` : ''}`)
      }
      console.log()
    } else if (s.missing > 50) {
      // Group by OEM and just show counts
      const byOem = {}
      for (const p of s.missingProducts) {
        if (!byOem[p.oem_id]) byOem[p.oem_id] = 0
        byOem[p.oem_id]++
      }
      console.log(`  Products missing '${cat}' (by OEM):`)
      for (const [oem, count] of Object.entries(byOem).sort()) {
        console.log(`    ${oem}: ${count} products`)
      }
      console.log()
    }
  }

  // ──────────────────────────────────────────────
  // 4. Mazda 'wheels' category investigation
  // ──────────────────────────────────────────────
  console.log('─'.repeat(80))
  console.log('4. MAZDA WHEELS CATEGORY INVESTIGATION')
  console.log('─'.repeat(80))
  console.log()

  const mazdaProducts = withSpecs.filter(p => p.oem_id === 'mazda-au')
  console.log(`Mazda products with specs_json: ${mazdaProducts.length}`)
  console.log()

  if (mazdaProducts.length > 0) {
    let wheelsPresent = 0, wheelsMissing = 0
    const mazdaWheelsIssues = []

    for (const p of mazdaProducts) {
      const specKeys = Object.keys(p.specs_json)
      const lowerKeys = specKeys.map(k => k.toLowerCase())
      const hasWheels = lowerKeys.some(k => k.includes('wheel'))

      if (hasWheels) {
        wheelsPresent++
        // Check what the wheels category contains
        const wheelsKey = specKeys.find(k => k.toLowerCase().includes('wheel'))
        const wheelsData = p.specs_json[wheelsKey]
        if (wheelsData && typeof wheelsData === 'object') {
          const entries = Array.isArray(wheelsData) ? wheelsData.length : Object.keys(wheelsData).length
          if (entries === 0) {
            mazdaWheelsIssues.push({ title: p.title, issue: 'empty wheels object', key: wheelsKey })
          }
        } else if (!wheelsData) {
          mazdaWheelsIssues.push({ title: p.title, issue: 'null/undefined wheels value', key: wheelsKey })
        }
      } else {
        wheelsMissing++
        // Show what categories ARE present
        console.log(`  MISSING wheels: ${truncate(p.title, 40)}`)
        console.log(`    Categories present: ${specKeys.join(', ')}`)
      }
    }

    console.log()
    console.log(`  Wheels present: ${wheelsPresent}/${mazdaProducts.length}`)
    console.log(`  Wheels missing: ${wheelsMissing}/${mazdaProducts.length}`)

    if (mazdaWheelsIssues.length > 0) {
      console.log()
      console.log('  Wheels data issues:')
      for (const issue of mazdaWheelsIssues) {
        console.log(`    ${truncate(issue.title, 40)} — ${issue.issue} (key: "${issue.key}")`)
      }
    }

    // Sample a Mazda product with wheels to show structure
    const sampleWithWheels = mazdaProducts.find(p => {
      const keys = Object.keys(p.specs_json).map(k => k.toLowerCase())
      return keys.some(k => k.includes('wheel'))
    })
    if (sampleWithWheels) {
      const wheelsKey = Object.keys(sampleWithWheels.specs_json).find(k => k.toLowerCase().includes('wheel'))
      console.log()
      console.log(`  Sample Mazda wheels data (${truncate(sampleWithWheels.title, 30)}):`)
      console.log(`    Key: "${wheelsKey}"`)
      const wheelsVal = sampleWithWheels.specs_json[wheelsKey]
      console.log(`    Type: ${typeof wheelsVal}, isArray: ${Array.isArray(wheelsVal)}`)
      if (typeof wheelsVal === 'object' && wheelsVal !== null) {
        const preview = JSON.stringify(wheelsVal, null, 2).slice(0, 500)
        console.log(`    Preview: ${preview}`)
      }
    }

    // Also show all unique top-level category names across Mazda products
    const allMazdaKeys = new Set()
    for (const p of mazdaProducts) {
      for (const k of Object.keys(p.specs_json)) {
        allMazdaKeys.add(k)
      }
    }
    console.log()
    console.log(`  All unique specs_json categories across Mazda products:`)
    console.log(`    ${[...allMazdaKeys].sort().join(', ')}`)
  }
  console.log()

  // ──────────────────────────────────────────────
  // 5. EV / PHEV fuel_type and engine specs check
  // ──────────────────────────────────────────────
  console.log('─'.repeat(80))
  console.log('5. EV / PHEV FUEL TYPE & ENGINE SPECS CHECK')
  console.log('─'.repeat(80))
  console.log()

  // Detect EVs by title keywords or fuel_type
  const possibleEVs = products.filter(p => {
    const titleLower = (p.title || '').toLowerCase()
    const keyLower = (p.external_key || '').toLowerCase()
    const fuelLower = (p.fuel_type || '').toLowerCase()
    return EV_KEYWORDS.some(kw => titleLower.includes(kw) || keyLower.includes(kw)) ||
           ['electric', 'bev', 'phev', 'plug-in hybrid'].some(ft => fuelLower.includes(ft))
  })

  console.log(`Possible EV/PHEV products detected: ${possibleEVs.length}`)
  console.log()

  if (possibleEVs.length > 0) {
    console.log(pad('OEM', 18) + pad('Title', 40) + pad('fuel_type', 18) + pad('Has Engine', 12) + 'Issue')
    console.log('-'.repeat(110))

    for (const p of possibleEVs) {
      const fuelType = p.fuel_type || 'NULL'
      const fuelLower = fuelType.toLowerCase()
      
      let hasEngine = 'N/A'
      let issues = []

      if (p.specs_json && typeof p.specs_json === 'object' && Object.keys(p.specs_json).length > 0) {
        const specKeys = Object.keys(p.specs_json).map(k => k.toLowerCase())
        hasEngine = specKeys.some(k => k.includes('engine')) ? 'Yes' : 'No'

        // Check for wrong fuel_type
        if (!['electric', 'bev', 'phev', 'plug-in hybrid', 'battery electric'].some(ft => fuelLower.includes(ft))) {
          if (fuelType === 'NULL') {
            issues.push('fuel_type is NULL')
          } else {
            issues.push(`fuel_type="${fuelType}" (expected Electric/BEV/PHEV)`)
          }
        }

        // For pure EVs (not PHEV), having an ICE engine section might be wrong
        const titleLower = (p.title || '').toLowerCase()
        const isPureEV = ['leaf', 'ariya', 'ioniq 5', 'ioniq 6', 'ev6', 'ev5', 'ev9', 'id.', 'solterra', 'mach-e', 'ora'].some(kw => titleLower.includes(kw))
        if (isPureEV && hasEngine === 'Yes') {
          // Check if engine section mentions electric motor vs ICE
          const engineKey = Object.keys(p.specs_json).find(k => k.toLowerCase().includes('engine'))
          if (engineKey) {
            const engineData = JSON.stringify(p.specs_json[engineKey]).toLowerCase()
            if (!engineData.includes('electric') && !engineData.includes('motor') && !engineData.includes('kwh') && !engineData.includes('battery')) {
              issues.push('Pure EV but engine section looks like ICE')
            }
          }
        }

        // For pure EVs without engine specs at all
        if (isPureEV && hasEngine === 'No') {
          issues.push('Pure EV missing motor/powertrain specs')
        }
      } else {
        hasEngine = 'NO SPECS'
        issues.push('No specs_json at all')
      }

      const issueStr = issues.length > 0 ? issues.join('; ') : 'OK'
      console.log(pad(p.oem_id, 18) + pad(truncate(p.title, 38), 40) + pad(fuelType, 18) + pad(hasEngine, 12) + issueStr)
    }
  }

  console.log()

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log()
  console.log(`Total products: ${products.length}`)
  console.log(`With specs_json: ${totalWith} (${totalPct}%)`)
  console.log(`Missing specs_json: ${totalWithout}`)
  console.log(`Possible EVs/PHEVs: ${possibleEVs.length}`)
  console.log()

  // Category coverage summary
  console.log('Category coverage (of products WITH specs):')
  for (const cat of KEY_CATEGORIES) {
    const s = categoryStats[cat]
    const pct = withSpecs.length > 0 ? ((s.present / withSpecs.length) * 100).toFixed(1) : '0.0'
    const filledCount = Math.round(parseFloat(pct) / 5)
    const emptyCount = 20 - filledCount
    const bar = '\u2588'.repeat(filledCount) + '\u2591'.repeat(emptyCount)
    console.log(`  ${pad(cat, 14)} ${bar} ${pct}%`)
  }

  console.log()
  console.log('Done.')
}

function pad(str, len) {
  const s = String(str)
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length)
}

function truncate(str, maxLen) {
  if (!str) return ''
  return str.length > maxLen ? str.slice(0, maxLen - 2) + '..' : str
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
