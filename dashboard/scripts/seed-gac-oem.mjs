/**
 * Seed GAC Australia OEM record + source pages.
 * Run this FIRST before seed-gac-products.mjs and seed-gac-apis.mjs
 * Run: node dashboard/scripts/seed-gac-oem.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

async function seed() {
  console.log('=== Seeding GAC Australia OEM ===\n')

  // --- 1. Upsert OEM record ---
  const oem = {
    id: 'gac-au',
    name: 'GAC Australia',
    base_url: 'https://www.gacgroup.com/en-au/',
    is_active: true,
    config_json: {
      homepage: 'https://www.gacgroup.com/en-au/',
      vehicles_index: 'https://www.gacgroup.com/en-au/',
      brand_color: '#0052CC',
      framework: 'nuxt3',
      schedule: {
        vehicles: 24,
        offers: 12,
        banners: 24,
      },
      api_gateway: 'https://eu-www-api.gacgroup.com/gateway/v1/www/api',
      cdn: 'https://eu-www-resouce-cdn.gacgroup.com',
      flags: {
        requiresBrowserRendering: false,
        hasSubBrands: false,
        hasSignedApi: true,
        isNuxt: true,
      },
    },
  }

  const { data: oemData, error: oemErr } = await supabase
    .from('oems')
    .upsert(oem, { onConflict: 'id' })
    .select()
  if (oemErr) { console.error('OEM error:', oemErr.message); process.exit(1) }
  console.log(`OEM record upserted: ${oemData[0].id} (${oemData[0].name})`)

  // --- 2. Seed source pages ---
  const sourcePages = [
    { oem_id: 'gac-au', url: 'https://www.gacgroup.com/en-au/', page_type: 'homepage', is_active: true },
    { oem_id: 'gac-au', url: 'https://www.gacgroup.com/en-au/suv/aion-v', page_type: 'vehicle', is_active: true },
    { oem_id: 'gac-au', url: 'https://www.gacgroup.com/en-au/mpv/gac-m8-phev', page_type: 'vehicle', is_active: true },
    { oem_id: 'gac-au', url: 'https://www.gacgroup.com/en-au/suv/gac-emzoom', page_type: 'vehicle', is_active: true },
    { oem_id: 'gac-au', url: 'https://www.gacgroup.com/en-au/hatchback/aion-ut', page_type: 'vehicle', is_active: true },
    { oem_id: 'gac-au', url: 'https://www.gacgroup.com/en-au/news', page_type: 'news', is_active: true },
  ]

  console.log(`\nSeeding ${sourcePages.length} source pages...`)
  const { data: pageData, error: pageErr } = await supabase
    .from('source_pages')
    .upsert(sourcePages, { onConflict: 'oem_id,url', ignoreDuplicates: false })
    .select('id, url, page_type')
  if (pageErr) { console.error('Page error:', pageErr.message); process.exit(1) }
  console.log(`  Upserted ${pageData.length} source pages`)
  pageData.forEach(p => console.log(`    [${p.page_type}] ${p.url}`))

  console.log('\n=== GAC OEM SEED COMPLETE ===')
  console.log('Next steps:')
  console.log('  1. node dashboard/scripts/seed-gac-products.mjs')
  console.log('  2. node dashboard/scripts/seed-gac-apis.mjs')
}

seed().catch(err => { console.error(err); process.exit(1) })
