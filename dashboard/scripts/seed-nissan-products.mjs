/**
 * Fetch and seed Nissan Australia vehicle data from Apigee /v2/models + browse-range page.
 * Apigee returns 21 models (current + legacy). We filter to current 10 models on nissan.com.au.
 * Run: node dashboard/scripts/seed-nissan-products.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'nissan-au'

// Current active models on nissan.com.au/vehicles/browse-range
// modelCode → metadata (from Apigee /v2/models + user knowledge)
const ACTIVE_MODELS = {
  30179: { slug: 'ariya',           name: 'Ariya',         body_type: 'SUV',  category: 'suv',  fuel: 'Electric',  year: 2025, config: 'BAHj', helios: 'FE0-B' },
  30304: { slug: 'juke',            name: 'Juke',          body_type: 'SUV',  category: 'suv',  fuel: 'Petrol',    year: 2025, config: 'BAHx', helios: null },
  30128: { slug: 'qashqai',         name: 'Qashqai',       body_type: 'SUV',  category: 'suv',  fuel: 'Hybrid',    year: 2025, config: 'BAHi', helios: null },
  30145: { slug: 'x-trail',         name: 'X-Trail',       body_type: 'SUV',  category: 'suv',  fuel: 'Hybrid',    year: 2025, config: 'BAG_', helios: 'T33-B' },
  70049: { slug: 'new-x-trail',     name: 'X-Trail MY26',  body_type: 'SUV',  category: 'suv',  fuel: 'Hybrid',    year: 2026, config: 'BAHt', helios: 'T33-B' },
  29652: { slug: 'pathfinder',      name: 'Pathfinder',    body_type: 'SUV',  category: 'suv',  fuel: 'Petrol',    year: 2025, config: 'BAHy', helios: 'R53-A' },
  30170: { slug: 'patrol',          name: 'Patrol',        body_type: 'SUV',  category: 'suv',  fuel: 'Petrol',    year: 2025, config: 'BAHv', helios: 'Y62-A' },
  29299: { slug: 'navara',          name: 'Navara',        body_type: 'Ute',  category: 'ute',  fuel: 'Diesel',    year: 2025, config: 'BAHo', helios: 'D23-C' },
  30316: { slug: 'all-new-navara',  name: 'Navara MY26',   body_type: 'Ute',  category: 'ute',  fuel: 'Diesel',    year: 2026, config: 'BAHu', helios: 'D23-C' },
  30273: { slug: 'z',               name: 'Z',             body_type: 'Coupe', category: 'sports', fuel: 'Petrol',  year: 2025, config: 'BAG-', helios: 'RZ34' },
}

// Known grades per model (from configurator pages and browse-range)
const MODEL_GRADES = {
  30179: [ // Ariya
    { grade: 'Engage', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Advance', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Advance+', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Evolve', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Evolve e-4ORCE', transmission: 'Automatic', drive: 'AWD' },
  ],
  30304: [ // Juke
    { grade: 'ST', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'ST+', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Ti', transmission: 'Automatic', drive: 'FWD' },
  ],
  30128: [ // Qashqai
    { grade: 'ST', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'ST+', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Ti', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Ti-L', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'N-DESIGN e-POWER', transmission: 'Automatic', drive: 'FWD' },
  ],
  30145: [ // X-Trail MY25 (runout)
    { grade: 'ST', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'ST+', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'ST-L', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Ti', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Ti e-4ORCE', transmission: 'Automatic', drive: 'AWD' },
    { grade: 'Ti-L e-4ORCE', transmission: 'Automatic', drive: 'AWD' },
    { grade: 'Ti-L e-POWER', transmission: 'Automatic', drive: 'FWD' },
  ],
  70049: [ // New X-Trail MY26
    { grade: 'ST', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'ST+', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Ti', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Ti-L', transmission: 'Automatic', drive: 'FWD' },
  ],
  29652: [ // Pathfinder
    { grade: 'ST', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'ST+', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Ti', transmission: 'Automatic', drive: 'FWD' },
    { grade: 'Ti-L', transmission: 'Automatic', drive: 'AWD' },
  ],
  30170: [ // Patrol
    { grade: 'Ti', transmission: 'Automatic', drive: 'AWD' },
    { grade: 'Ti-L', transmission: 'Automatic', drive: 'AWD' },
  ],
  29299: [ // Navara MY25
    { grade: 'SL', transmission: 'Automatic', drive: '4WD' },
    { grade: 'ST', transmission: 'Automatic', drive: '4WD' },
    { grade: 'ST-X', transmission: 'Automatic', drive: '4WD' },
    { grade: 'P4X', transmission: 'Automatic', drive: '4WD' },
  ],
  30316: [ // All-New Navara MY26
    { grade: 'SL', transmission: 'Automatic', drive: '4WD' },
    { grade: 'ST', transmission: 'Automatic', drive: '4WD' },
    { grade: 'ST-X', transmission: 'Automatic', drive: '4WD' },
    { grade: 'P4X', transmission: 'Automatic', drive: '4WD' },
  ],
  30273: [ // Z
    { grade: 'Z', transmission: 'Manual', drive: 'RWD' },
    { grade: 'Z', transmission: 'Automatic', drive: 'RWD' },
    { grade: 'NISMO', transmission: 'Automatic', drive: 'RWD' },
  ],
}

function slugify(str) {
  // Preserve the trailing "+" used for "ST+", "Advance+", "LS-U+" trim distinctions
  // (strip-to-alphanumeric collapses ST and ST+ to the same key otherwise — see
  // 7 historical collision pairs in products before 2026-04-08).
  return str
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function fetchApigeeModels() {
  console.log('Fetching Apigee public access token...')
  const tokenRes = await fetch(
    'https://ap.nissan-api.net/v2/publicAccessToken?locale=en_AU&scope=READ&proxy=*&brand=nissan&environment=prod',
    { headers: { Origin: 'https://www.nissan.com.au' } }
  )
  const { access_token } = await tokenRes.json()
  console.log(`  Token: ${access_token}`)

  const headers = {
    apiKey: 'A2X4O66rkJotaSQsTDLlXb9keGbVyN8Y',
    clientKey: 'h84dIG2S17QNq6j9fgvv6t3KXBQRJJts',
    accesstoken: `Bearer ${access_token}`,
    Accept: 'application/json',
    Origin: 'https://www.nissan.com.au',
  }

  console.log('Fetching /v2/models...')
  const res = await fetch('https://ap.nissan-api.net/v2/models', { headers })
  const data = await res.json()
  console.log(`  Found ${data.models.length} models in Apigee`)
  return data.models
}

async function seed() {
  // Fetch live model data from Apigee
  const apigeeModels = await fetchApigeeModels()

  // Map Apigee data by modelCode
  const apigeeByCode = {}
  for (const m of apigeeModels) {
    apigeeByCode[m.modelCode] = m
  }

  // Build model rows from our ACTIVE_MODELS registry, enriched with Apigee data
  const modelRows = []
  for (const [codeStr, meta] of Object.entries(ACTIVE_MODELS)) {
    const code = Number(codeStr)
    const apigee = apigeeByCode[codeStr] || {}
    const configUrl = apigee.configurator || null

    modelRows.push({
      oem_id: OEM_ID,
      slug: meta.slug,
      name: meta.name,
      body_type: meta.body_type,
      category: meta.category,
      model_year: meta.year,
      is_active: true,
      configurator_url: `https://www.nissan.com.au/vehicles/browse-range/${meta.slug}.html`,
      meta_json: {
        fuel_type: meta.fuel,
        source: 'apigee_v2_models',
        model_code: codeStr,
        config_code: meta.config,
        helios_vehicle_code: meta.helios,
        configurator_url: configUrl,
        apigee_data_path: apigee.dataPath || null,
      },
    })
  }

  console.log(`\nSeeding ${modelRows.length} vehicle models...`)
  const { data: modelData, error: modelErr } = await supabase
    .from('vehicle_models')
    .upsert(modelRows, { onConflict: 'oem_id,slug', ignoreDuplicates: false })
    .select('id, slug, name, model_year')
  if (modelErr) { console.error('Model error:', modelErr.message); process.exit(1) }
  console.log(`  Upserted ${modelData.length} models`)

  // Build model ID lookup
  const modelLookup = {}
  for (const m of modelData) {
    modelLookup[m.slug] = m.id
  }

  // Delete old Nissan products (the current ones are mostly promotional stubs with no pricing)
  console.log('\nDeleting old Nissan products...')
  const { data: oldProducts } = await supabase
    .from('products')
    .select('id')
    .eq('oem_id', OEM_ID)
  if (oldProducts?.length) {
    const oldIds = oldProducts.map(p => p.id)
    await supabase.from('variant_colors').delete().in('product_id', oldIds)
    await supabase.from('variant_pricing').delete().in('product_id', oldIds)
    await supabase.from('products').delete().eq('oem_id', OEM_ID)
    console.log(`  Deleted ${oldProducts.length} old products + related data`)
  } else {
    console.log('  No old products to delete')
  }

  // Build product rows from known grades
  const productRows = []
  for (const [codeStr, meta] of Object.entries(ACTIVE_MODELS)) {
    const code = Number(codeStr)
    const grades = MODEL_GRADES[code] || []
    const modelId = modelLookup[meta.slug] || null

    for (const g of grades) {
      const transLabel = g.transmission === 'Automatic' ? 'auto' : 'manual'
      const externalKey = `nissan-${codeStr}-${slugify(g.grade)}-${transLabel}`

      productRows.push({
        oem_id: OEM_ID,
        external_key: externalKey,
        source_url: `https://www.nissan.com.au/vehicles/browse-range/${meta.slug}.html`,
        title: `${meta.name} ${g.grade}`,
        subtitle: g.grade,
        body_type: meta.body_type,
        fuel_type: meta.fuel,
        availability: 'available',
        price_amount: null, // Pricing requires Choices API with browser session
        price_currency: 'AUD',
        price_type: 'driveaway',
        drivetrain: g.drive,
        transmission: g.transmission,
        variant_name: g.grade,
        variant_code: `${codeStr}-${slugify(g.grade)}`,
        model_id: modelId,
        meta_json: {
          source: 'known_grades_registry',
          model_code: codeStr,
          config_code: meta.config,
          grade: g.grade,
          transmission: g.transmission,
          pricing_note: 'Price requires Choices API with browser-session choice IDs. Run oem-build-price-discover skill to populate.',
        },
        last_seen_at: new Date().toISOString(),
      })
    }
  }

  console.log(`\nSeeding ${productRows.length} products...`)
  const { data: prodData, error: prodErr } = await supabase
    .from('products')
    .insert(productRows)
    .select('id, external_key, title')
  if (prodErr) { console.error('Product error:', prodErr.message); process.exit(1) }
  console.log(`  Inserted ${prodData.length} products`)

  // Summary
  console.log('\n=== NISSAN SEED COMPLETE ===')
  console.log(`  Models:   ${modelData.length}`)
  console.log(`  Products: ${prodData.length}`)
  console.log(`  Pricing:  0 (requires Choices API with browser session)`)

  console.log('\n  By model:')
  for (const [codeStr, meta] of Object.entries(ACTIVE_MODELS)) {
    const grades = MODEL_GRADES[Number(codeStr)] || []
    console.log(`    ${meta.name} (${codeStr}): ${grades.length} grades`)
  }

  console.log('\n  Note: Pricing data requires the Choices API which needs')
  console.log('  browser-session choice IDs. Run the oem-build-price-discover')
  console.log('  skill with Playwright/CDP to capture configurator sessions')
  console.log('  and populate variant_pricing rows.')
}

seed().catch(err => { console.error(err); process.exit(1) })
