/**
 * Seed vehicle_models.source_url for all 132 models.
 *
 * Each OEM has a known URL pattern. Some slugs need overrides
 * (e.g., Hyundai has category-based paths, GWM has sub-brand URLs).
 *
 * Run: cd dashboard/scripts && node seed-source-urls.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

// ============================================================================
// OEM URL Patterns — slug → full page URL
// ============================================================================

/** Default pattern builders: oem_id → (slug) → URL */
const OEM_URL_PATTERNS = {
  'kia-au':         (slug) => `https://www.kia.com/au/cars/${slug}.html`,
  'toyota-au':      (slug) => `https://www.toyota.com.au/${slug}`,
  'mazda-au':       (slug) => `https://www.mazda.com.au/cars/${slug}/`,
  'nissan-au':      (slug) => `https://www.nissan.com.au/vehicles/browse-range/${slug}.html`,
  'ford-au':        (slug) => `https://www.ford.com.au/showroom/${slug}/`,
  'mitsubishi-au':  (slug) => `https://www.mitsubishi-motors.com.au/models/${slug}`,
  'subaru-au':      (slug) => `https://www.subaru.com.au/${slug}`,
  'suzuki-au':      (slug) => `https://www.suzuki.com.au/models/${slug}`,
  'isuzu-au':       (slug) => `https://www.isuzuute.com.au/${slug}`,
  'kgm-au':         (slug) => `https://www.kgm.com.au/models/${slug}`,
  'volkswagen-au':  (slug) => `https://www.volkswagen.com.au/en/models/${slug}.html`,
  'ldv-au':         (slug) => `https://www.ldvautomotive.com.au/models/${slug}`,
  'gwm-au':         (slug) => `https://www.gwmanz.com/au/models/${slug}`,
  'gac-au':         (slug) => `https://www.gacgroup.com/en-au/${slug}`,
}

// ============================================================================
// Slug Overrides — for models where the URL path differs from the DB slug
// ============================================================================

const SLUG_OVERRIDES = {
  // Hyundai has category-based URL paths
  'hyundai-au': {
    'venue':            'https://www.hyundai.com/au/en/cars/suvs/venue',
    'kona':             'https://www.hyundai.com/au/en/cars/suvs/kona',
    'kona-hybrid':      'https://www.hyundai.com/au/en/cars/suvs/kona-hybrid',
    'kona-electric':    'https://www.hyundai.com/au/en/cars/eco/kona-electric',
    'tucson':           'https://www.hyundai.com/au/en/cars/suvs/tucson',
    'santa-fe':         'https://www.hyundai.com/au/en/cars/suvs/santa-fe',
    'santa-fe-hybrid':  'https://www.hyundai.com/au/en/cars/suvs/santa-fe-hybrid',
    'palisade':         'https://www.hyundai.com/au/en/cars/suvs/palisade',
    'i20-n':            'https://www.hyundai.com/au/en/cars/sports-cars/i20-n',
    'i30':              'https://www.hyundai.com/au/en/cars/small-cars/i30',
    'i30-sedan':        'https://www.hyundai.com/au/en/cars/small-cars/i30-sedan',
    'i30-n':            'https://www.hyundai.com/au/en/cars/sports-cars/i30-n',
    'ioniq-5':          'https://www.hyundai.com/au/en/cars/eco/ioniq5',
    'ioniq-5-n':        'https://www.hyundai.com/au/en/cars/eco/ioniq5n',
    'ioniq-6':          'https://www.hyundai.com/au/en/cars/eco/ioniq6',
    'ioniq-9':          'https://www.hyundai.com/au/en/cars/eco/ioniq9',
    'staria':           'https://www.hyundai.com/au/en/cars/people-movers-and-commercial/staria',
    'inster':           'https://www.hyundai.com/au/en/cars/eco/inster',
    'iload':            'https://www.hyundai.com/au/en/cars/people-movers-and-commercial/iload',
    'sonata-n-line':    'https://www.hyundai.com/au/en/cars/sports-cars/sonata-n-line',
  },

  // GWM sub-brand URL patterns
  'gwm-au': {
    'haval-h6':     'https://www.gwmanz.com/au/models/haval-h6',
    'haval-jolion': 'https://www.gwmanz.com/au/models/haval-jolion',
    'haval-h6gt':   'https://www.gwmanz.com/au/models/haval-h6-gt',
    'haval-h7':     'https://www.gwmanz.com/au/models/haval-h7',
    'cannon':       'https://www.gwmanz.com/au/models/gwm-cannon',
    'cannon-alpha': 'https://www.gwmanz.com/au/models/gwm-cannon-alpha',
    'tank-300':     'https://www.gwmanz.com/au/models/tank-300',
    'tank-500':     'https://www.gwmanz.com/au/models/tank-500',
    'ora':          'https://www.gwmanz.com/au/models/ora',
  },

  // KGM model-year suffixes in slugs
  'kgm-au': {
    'rexton-my26':    'https://www.kgm.com.au/models/rexton',
    'musso-ev-my26':  'https://www.kgm.com.au/models/musso-ev',
    'musso-my26':     'https://www.kgm.com.au/models/musso',
    'musso-my24':     'https://www.kgm.com.au/models/musso',
  },

  // Isuzu model pages
  'isuzu-au': {
    'd-max': 'https://www.isuzuute.com.au/d-max',
    'mu-x':  'https://www.isuzuute.com.au/mu-x',
  },

  // GAC has body-type prefixed URLs
  'gac-au': {
    'aion-v':  'https://www.gacgroup.com/en-au/suv/aion-v',
    'm8-phev': 'https://www.gacgroup.com/en-au/mpv/gac-m8-phev',
    'emzoom':  'https://www.gacgroup.com/en-au/suv/gac-emzoom',
    'aion-ut': 'https://www.gacgroup.com/en-au/hatchback/aion-ut',
  },
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { data: models, error } = await supabase
    .from('vehicle_models')
    .select('oem_id, slug, name, source_url')
    .order('oem_id')
    .order('slug')

  if (error) {
    console.error('Failed to fetch models:', error.message)
    process.exit(1)
  }

  console.log(`Found ${models.length} vehicle models\n`)

  let updated = 0
  let skipped = 0
  let noPattern = 0
  const results = {}

  for (const model of models) {
    const { oem_id, slug } = model

    // Check for explicit override first
    const overrideUrl = SLUG_OVERRIDES[oem_id]?.[slug]
    const patternFn = OEM_URL_PATTERNS[oem_id]
    const url = overrideUrl || (patternFn ? patternFn(slug) : null)

    if (!url) {
      console.log(`  SKIP ${oem_id}/${slug} — no URL pattern`)
      noPattern++
      continue
    }

    // Skip if already set to the same URL
    if (model.source_url === url) {
      skipped++
      continue
    }

    const { error: upErr } = await supabase
      .from('vehicle_models')
      .update({ source_url: url })
      .eq('oem_id', oem_id)
      .eq('slug', slug)

    if (upErr) {
      console.error(`  ERROR ${oem_id}/${slug}: ${upErr.message}`)
    } else {
      updated++
      if (!results[oem_id]) results[oem_id] = []
      results[oem_id].push({ slug, url })
    }
  }

  // Summary
  console.log('\n=== Results ===')
  for (const [oem, items] of Object.entries(results)) {
    console.log(`\n${oem} (${items.length} updated):`)
    for (const { slug, url } of items) {
      console.log(`  ${slug} → ${url}`)
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Updated: ${updated}`)
  console.log(`Already set: ${skipped}`)
  console.log(`No pattern: ${noPattern}`)
  console.log(`Total: ${models.length}`)
}

main().catch(console.error)
