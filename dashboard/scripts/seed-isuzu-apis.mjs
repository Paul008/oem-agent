/**
 * Seed Isuzu Australia discovered APIs from isuzu-ute-theme-new source code.
 * OEM APIs at isuzuute.com.au (WAF-blocked externally, confirmed in theme source).
 * CDN data at isuzuute.b-cdn.net (publicly accessible).
 * Run: node dashboard/scripts/seed-isuzu-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const apis = [
  // ═══════════════ ISUZU OEM APIs (WAF-blocked, confirmed in source) ═══════════════
  {
    oem_id: 'isuzu-au',
    url: 'https://www.isuzuute.com.au/isuzuapi/BuildandQuote/GetCarColours',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.7,
    status: 'discovered',
    schema_json: {
      params: { carName: 'Optional - filter by variant name' },
      returns: ['colour_options', 'colour_metadata'],
      note: 'Returns 403 from outside WAF. Works from browser session on isuzuute.com.au.',
      discovery_source: 'isuzu-ute-theme-new/src/functions/get-vehicle-colors.js',
    },
  },
  {
    oem_id: 'isuzu-au',
    url: 'https://www.isuzuute.com.au/isuzuapi/CompareAPI/GetCompareModelData?dataSourceId={AF3B74E8-F4F4-4DE7-A58C-2BE6B1227E84}',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.7,
    status: 'discovered',
    schema_json: {
      params: { dataSourceId: '{AF3B74E8-F4F4-4DE7-A58C-2BE6B1227E84}' },
      returns: ['mu_x_grades', 'specifications', 'comparison_data'],
      note: 'MU-X vehicle grades and specs. WAF-blocked externally.',
      discovery_source: 'isuzu-ute-theme-new/src/functions/get-mux-compare-data.js',
    },
  },
  {
    oem_id: 'isuzu-au',
    url: 'https://www.isuzuute.com.au/isuzuapi/CompareAPI/GetCompareModelData?dataSourceId={81CA9928-D04D-49F8-A264-48A6F77D7072}',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.7,
    status: 'discovered',
    schema_json: {
      params: { dataSourceId: '{81CA9928-D04D-49F8-A264-48A6F77D7072}' },
      returns: ['d_max_grades', 'specifications', 'comparison_data'],
      note: 'D-MAX vehicle grades and specs. WAF-blocked externally.',
      discovery_source: 'isuzu-ute-theme-new/src/functions/get-dmax-compare-data.js',
    },
  },
  {
    oem_id: 'isuzu-au',
    url: 'https://www.isuzuute.com.au/isuzuapi/RangeAPI/GetRangeData?dataSourceId={58ED1496-0A3E-4C26-84B5-4A9A766BF139}',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.7,
    status: 'discovered',
    schema_json: {
      params: { dataSourceId: '{58ED1496-0A3E-4C26-84B5-4A9A766BF139}' },
      returns: ['d_max_range', 'pricing', 'availability'],
      note: 'D-MAX range data with pricing. WAF-blocked externally.',
      discovery_source: 'isuzu-ute-theme-new/src/functions/get-dmax-variants.js',
    },
  },
  {
    oem_id: 'isuzu-au',
    url: 'https://www.isuzuute.com.au/isuzuapi/RangeAPI/GetRangeData?dataSourceId={C91E66BB-1837-4DA2-AB7F-D0041C9384D7}',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.7,
    status: 'discovered',
    schema_json: {
      params: { dataSourceId: '{C91E66BB-1837-4DA2-AB7F-D0041C9384D7}' },
      returns: ['mu_x_range', 'pricing', 'availability'],
      note: 'MU-X range data with pricing. WAF-blocked externally.',
      discovery_source: 'isuzu-ute-theme-new/src/functions/get-mux-variants.js',
    },
  },
  {
    oem_id: 'isuzu-au',
    url: 'https://www.isuzuute.com.au/isuzuapi/BuildandQuote/GetInitialData',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.7,
    status: 'discovered',
    schema_json: {
      params: { carType: 'd-max | mu-x' },
      returns: ['initial_vehicle_data', 'configuration_options'],
      note: 'Build & Quote tool initial data. WAF-blocked externally.',
      discovery_source: 'isuzu-ute-theme-new/src/functions/get-carType.js',
    },
  },
  {
    oem_id: 'isuzu-au',
    url: 'https://www.isuzuute.com.au/isuzuapi/BuildandQuote/GetSummaryCost',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.7,
    status: 'discovered',
    schema_json: {
      returns: ['summary_cost', 'configured_vehicle_pricing'],
      note: 'Build & Quote summary cost for configured vehicle. WAF-blocked externally.',
      discovery_source: 'isuzu-ute-theme-new/src/functions/get-summary-cost.js',
    },
  },

  // ═══════════════ ISUZU CDN (publicly accessible) ═══════════════
  {
    oem_id: 'isuzu-au',
    url: 'https://isuzuute.b-cdn.net/data/models.json',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      returns: ['model_list', 'model_images', 'brochure_pdfs', 'spec_sheets', 'segments', 'variant_links'],
      note: 'BunnyNet CDN. Returns D-MAX and MU-X with brochure/specs PDF links, images, segment data.',
      discovery_source: 'isuzu-ute-theme-new/src/services/model.js',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'isuzu-au',
    url: 'https://isuzuute.b-cdn.net/data/{slug}.json',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.9,
    status: 'verified',
    schema_json: {
      params: { slug: 'Page slug e.g. d-max, mu-x, offers' },
      returns: ['page_content', 'variant_data', 'offer_data'],
      note: 'BunnyNet CDN. Per-page content delivery. Slug matches OEM page slugs.',
      discovery_source: 'isuzu-ute-theme-new/src/services/oemPage.js',
    },
  },
]

async function seed() {
  console.log(`Inserting ${apis.length} Isuzu discovered APIs...`)

  const { data, error } = await supabase
    .from('discovered_apis')
    .upsert(apis, { onConflict: 'oem_id,url', ignoreDuplicates: false })
    .select('id, oem_id, url, status')

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log(`Successfully upserted ${data.length} APIs:`)
  const verified = data.filter(d => d.status === 'verified').length
  const discovered = data.filter(d => d.status === 'discovered').length
  console.log(`  ${verified} verified (CDN), ${discovered} discovered (WAF-blocked OEM APIs)`)
  data.forEach(d => console.log(`  [${d.status}] ${d.url}`))
}

seed()
