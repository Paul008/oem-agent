/**
 * Seed Subaru Australia OEM + discovered APIs from official Retailer API v1.5 docs.
 * Production base: https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api/v1
 * Auth: x-api-key header
 * Run: node dashboard/scripts/seed-subaru-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const BASE = 'https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api'
const API_KEY = 'w68ewXf97mnPODxXG6ZA4FKhP65wpUK576oLryW9'

// Step 1: Upsert OEM
async function ensureOem() {
  const { data, error } = await supabase
    .from('oems')
    .upsert({
      id: 'subaru-au',
      name: 'Subaru Australia',
      base_url: 'https://www.subaru.com.au/',
      config_json: {
        region: 'AU',
        language: 'en',
        api_base: 'https://gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com/Production/api',
        api_key_header: 'x-api-key',
        regions: ['BRISBANE', 'CENTRAL', 'EASTERN', 'MELBOURNE', 'NORTHERN', 'SOUTHERN', 'SYDNEY', 'TASMANIA', 'WESTERN'],
      },
      is_active: true,
    }, { onConflict: 'id' })
    .select()
  if (error) { console.error('OEM upsert error:', error.message); process.exit(1) }
  console.log('OEM:', data[0].id, data[0].name)
}

// Step 2: Seed APIs
const apis = [
  {
    oem_id: 'subaru-au',
    url: `${BASE}/v1/models`,
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.98,
    status: 'verified',
    schema_json: {
      auth: { header: 'x-api-key', key: API_KEY },
      returns: ['models', 'variants_summary', 'colour_options', 'pricing', 'images'],
      note: '10 models, 55 variants. Each model includes full variant list with MLP, colours, body style, transmission, fuel type, engine capacity, CO2, redbook codes.',
      discovery_source: 'Subaru Retailer API v1.5 docs',
      verified_date: '2026-02-19',
      sample_models: ['Impreza', 'Crosstrek', 'Forester', 'Outback', 'BRZ', 'WRX', 'Solterra'],
    },
  },
  {
    oem_id: 'subaru-au',
    url: `${BASE}/v1/models/{modelId}`,
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.98,
    status: 'verified',
    schema_json: {
      auth: { header: 'x-api-key', key: API_KEY },
      params: { modelId: 'UUID - e.g. f1beb83d-4173-4c4f-5a9f-08ddad389131' },
      returns: ['model_detail', 'variant_summaries', 'images'],
      discovery_source: 'Subaru Retailer API v1.5 docs',
    },
  },
  {
    oem_id: 'subaru-au',
    url: `${BASE}/v1/models/{modelId}/variants`,
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.98,
    status: 'verified',
    schema_json: {
      auth: { header: 'x-api-key', key: API_KEY },
      params: { modelId: 'UUID' },
      returns: ['variant_list', 'colour_options', 'interior_options', 'capped_service', 'key_features', 'pricing'],
      note: 'Full variant list for a model including colours with hex codes, price effects, hi-res image URLs.',
      discovery_source: 'Subaru Retailer API v1.5 docs',
    },
  },
  {
    oem_id: 'subaru-au',
    url: `${BASE}/v1/variants/{variantId}`,
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.98,
    status: 'verified',
    schema_json: {
      auth: { header: 'x-api-key', key: API_KEY },
      params: { variantId: 'UUID' },
      returns: ['variant_detail', 'colour_options', 'interior_options', 'capped_service', 'service_plan', 'key_features', 'manufacturersListPrice', 'engine_capacity', 'cylinders', 'fuel_type', 'transmission', 'body_style', 'CO2', 'tare_weight', 'redbook_code', 'nvic_code'],
      note: 'Richest single-variant endpoint. Excludes specs/accessories (separate endpoints).',
      discovery_source: 'Subaru Retailer API v1.5 docs',
    },
  },
  {
    oem_id: 'subaru-au',
    url: `${BASE}/v1/variants/{variantId}/specs`,
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.98,
    status: 'verified',
    schema_json: {
      auth: { header: 'x-api-key', key: API_KEY },
      params: { variantId: 'UUID' },
      returns: ['spec_groups', 'spec_items', 'disclaimers'],
      note: 'Grouped specs: Transmission, Engine, Performance, Dimensions, Safety, Features etc.',
      discovery_source: 'Subaru Retailer API v1.5 docs',
    },
  },
  {
    oem_id: 'subaru-au',
    url: `${BASE}/v1/variants/{variantId}/accessories`,
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.98,
    status: 'verified',
    schema_json: {
      auth: { header: 'x-api-key', key: API_KEY },
      params: { variantId: 'UUID' },
      returns: ['accessories', 'accessory_packs', 'pricing', 'fitting_time', 'images'],
      note: 'Genuine accessories with item codes, prices (fitted/unfitted), category, images.',
      discovery_source: 'Subaru Retailer API v1.5 docs',
    },
  },
  {
    oem_id: 'subaru-au',
    url: `${BASE}/v1/offers`,
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'offers',
    reliability_score: 0.98,
    status: 'verified',
    schema_json: {
      auth: { header: 'x-api-key', key: API_KEY },
      returns: ['offers', 'pricing', 'media_gallery', 'content', 'categories', 'regions', 'disclaimers', 'sash_styling', 'start_date', 'expiry_date'],
      note: '11 current offers. Rich content model with nested paragraph/list/disclaimer types. Includes regional display ordering.',
      discovery_source: 'Subaru Retailer API v1.5 docs',
      verified_date: '2026-02-19',
    },
  },
  {
    oem_id: 'subaru-au',
    url: `${BASE}/v1/offers/{region}`,
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'offers',
    reliability_score: 0.98,
    status: 'verified',
    schema_json: {
      auth: { header: 'x-api-key', key: API_KEY },
      params: { region: 'BRISBANE | CENTRAL | EASTERN | MELBOURNE | NORTHERN | SOUTHERN | SYDNEY | TASMANIA | WESTERN' },
      returns: ['regional_offers', 'national_offers', 'display_order'],
      note: 'Regional + national offers. Regional offers ordered first by displayOrder, then national. Not case-sensitive.',
      discovery_source: 'Subaru Retailer API v1.5 docs',
    },
  },
  {
    oem_id: 'subaru-au',
    url: `${BASE}/v1/regions`,
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'config',
    reliability_score: 0.98,
    status: 'verified',
    schema_json: {
      auth: { header: 'x-api-key', key: API_KEY },
      returns: ['region_ids', 'region_names'],
      note: '9 regions: BRISBANE, CENTRAL, EASTERN, MELBOURNE, NORTHERN, SOUTHERN, SYDNEY, TASMANIA, WESTERN',
      discovery_source: 'Subaru Retailer API v1.5 docs',
    },
  },
  {
    oem_id: 'subaru-au',
    url: 'https://cdn-image-handler.oem-production.subaru.com.au',
    method: 'GET',
    content_type: 'image/png',
    response_type: 'image',
    data_type: 'other',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      params: { pxc_width: 'int', pxc_height: 'int', pxc_size: 'w,h or s:factor', pxc_method: 'crop|fit|fitfill|limit|limitfill', pxc_bgcolor: 'hex RGB' },
      returns: ['vehicle_images', 'accessory_images'],
      note: 'CDN image handler with dynamic resizing/cropping. URLs returned by all vehicle/accessory endpoints. Supports front/rear/side/hi-res views per colour.',
      discovery_source: 'Subaru Retailer API v1.5 docs',
    },
  },
]

async function seed() {
  await ensureOem()

  console.log(`\nInserting ${apis.length} Subaru discovered APIs...`)

  const { data, error } = await supabase
    .from('discovered_apis')
    .upsert(apis, { onConflict: 'oem_id,url', ignoreDuplicates: false })
    .select('id, oem_id, url')

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log(`Successfully upserted ${data.length} APIs:`)
  data.forEach(d => console.log(`  ${d.url}`))
}

seed()
