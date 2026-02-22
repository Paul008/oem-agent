#!/usr/bin/env node
// Audit model coverage: compare vehicle_models table against OEM website model pages
// Usage: cd dashboard/scripts && node audit-model-coverage.mjs [--oem kia-au]
// Reports: models on website but not in DB (missing) and in DB but not on website (stale)

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

// ── CLI args ──
const args = process.argv.slice(2)
const oemFilter = args.includes('--oem') ? args[args.indexOf('--oem') + 1] : null

// ── OEM registry: vehicles index pages + link patterns ──
const OEM_CONFIGS = {
  'kia-au': {
    url: 'https://www.kia.com/au/cars.html',
    pattern: /\/au\/cars\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match.replace(/\.html$/, ''),
  },
  'hyundai-au': {
    url: 'https://www.hyundai.com/au/en/cars',
    pattern: /\/au\/en\/cars\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match,
  },
  'gwm-au': {
    url: 'https://www.gwmanz.com/au/models/',
    pattern: /\/au\/models\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match,
  },
  'toyota-au': {
    url: 'https://www.toyota.com.au/all-vehicles',
    pattern: /href="\/([a-z0-9-]+)"/gi,
    slugNormalize: (match) => match,
    // Toyota has top-level paths — filter out non-vehicle pages
    excludeSlugs: ['offers', 'owners', 'fleet', 'news', 'all-vehicles', 'about', 'contact', 'find-a-dealer', 'service', 'parts', 'finance', 'insurance', 'sustainability', 'safety', 'technology', 'build-your-toyota'],
  },
  'nissan-au': {
    url: 'https://www.nissan.com.au/vehicles/browse-range.html',
    pattern: /\/vehicles\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match.replace(/\.html$/, ''),
    excludeSlugs: ['browse-range', 'future-vehicles'],
  },
  'mazda-au': {
    url: 'https://www.mazda.com.au/cars/',
    pattern: /\/cars\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match,
  },
  'ford-au': {
    url: 'https://www.ford.com.au/',
    pattern: /\/showroom\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match,
  },
  'mitsubishi-au': {
    url: 'https://www.mitsubishi-motors.com.au/?group=private',
    pattern: /\/vehicles\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match,
  },
  'subaru-au': {
    url: 'https://www.subaru.com.au/vehicles',
    pattern: /subaru\.com\.au\/([a-z0-9-]+)"/gi,
    slugNormalize: (match) => match,
    excludeSlugs: ['vehicles', 'offers', 'owners', 'fleet', 'about', 'service', 'parts', 'finance'],
  },
  'suzuki-au': {
    url: 'https://www.suzuki.com.au/vehicles/',
    pattern: /\/vehicles\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match.replace(/\//g, ''),
    excludeSlugs: ['future'],
  },
  'volkswagen-au': {
    url: 'https://www.volkswagen.com.au/en/models.html',
    pattern: /\/en\/models\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match.replace(/\.html$/, ''),
  },
  'isuzu-au': {
    url: 'https://www.isuzuute.com.au/',
    pattern: /\/(d-max|mu-x)(?:\/|")/gi,
    slugNormalize: (match) => match,
  },
  'kgm-au': {
    url: 'https://kgm.com.au/',
    pattern: /\/models\/([a-z0-9-]+)/gi,
    slugNormalize: (match) => match,
  },
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function fetchModelsFromWebsite(oemId, config) {
  try {
    const res = await fetch(config.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
    })

    if (!res.ok) {
      console.warn(`  [${oemId}] HTTP ${res.status} from ${config.url}`)
      return []
    }

    const html = await res.text()
    const matches = new Set()

    // Extract slugs from href patterns
    let match
    const regex = new RegExp(config.pattern.source, config.pattern.flags)
    while ((match = regex.exec(html)) !== null) {
      let slug = match[1]
      if (config.slugNormalize) slug = config.slugNormalize(slug)
      slug = slugify(slug)
      if (slug && slug.length > 1) {
        if (config.excludeSlugs && config.excludeSlugs.includes(slug)) continue
        matches.add(slug)
      }
    }

    return [...matches]
  } catch (err) {
    console.warn(`  [${oemId}] Fetch error: ${err.message}`)
    return []
  }
}

// ── Main ──
console.log('=== Model Coverage Audit ===\n')

const oems = oemFilter ? [oemFilter] : Object.keys(OEM_CONFIGS)
const report = { timestamp: new Date().toISOString(), oems: {} }

for (const oemId of oems) {
  const config = OEM_CONFIGS[oemId]
  if (!config) {
    console.warn(`No config for ${oemId}, skipping`)
    continue
  }

  console.log(`[${oemId}]`)

  // Get DB models
  const { data: dbModels, error } = await supabase
    .from('vehicle_models')
    .select('slug, name, source_url')
    .eq('oem_id', oemId)
    .order('slug')

  if (error) {
    console.error(`  DB error: ${error.message}`)
    continue
  }

  const dbSlugs = new Set((dbModels || []).map(m => m.slug))

  // Get website models
  const websiteSlugs = await fetchModelsFromWebsite(oemId, config)
  const websiteSet = new Set(websiteSlugs)

  // Compute diffs
  const missing = websiteSlugs.filter(s => !dbSlugs.has(s))
  const stale = [...dbSlugs].filter(s => !websiteSet.has(s))
  const matched = websiteSlugs.filter(s => dbSlugs.has(s))

  console.log(`  DB models: ${dbSlugs.size}`)
  console.log(`  Website models: ${websiteSet.size}`)
  console.log(`  Matched: ${matched.length}`)

  if (missing.length > 0) {
    console.log(`  MISSING (on website, not in DB): ${missing.join(', ')}`)
  }
  if (stale.length > 0) {
    console.log(`  STALE (in DB, not on website): ${stale.join(', ')}`)
  }
  if (missing.length === 0 && stale.length === 0) {
    console.log(`  ✓ Full coverage`)
  }

  report.oems[oemId] = {
    db_count: dbSlugs.size,
    website_count: websiteSet.size,
    matched: matched.length,
    missing,
    stale,
    db_slugs: [...dbSlugs],
    website_slugs: websiteSlugs,
  }

  console.log('')
}

// Summary
console.log('=== Summary ===')
let totalMissing = 0
let totalStale = 0
for (const [oemId, data] of Object.entries(report.oems)) {
  totalMissing += data.missing.length
  totalStale += data.stale.length
}
console.log(`Total missing: ${totalMissing}`)
console.log(`Total stale: ${totalStale}`)
console.log('')

// Output JSON for piping
if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
}
