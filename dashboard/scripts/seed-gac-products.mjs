/**
 * Fetch and seed GAC Australia vehicle data from their API.
 * Uses HmacSHA256 signed requests to eu-www-api.gacgroup.com
 * Run: node dashboard/scripts/seed-gac-products.mjs
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'gac-au'
const API_BASE = 'https://eu-www-api.gacgroup.com/gateway/v1/www/api'
const APP_ID = 'fe-official'
const SIGN_SECRET = 'fe-official-450etarvpz'

// GAC models for AU market
const GAC_MODELS = [
  { vehSeriesCode: 'aion-v',  vehStyleCode: '2024', name: 'AION V',   body_type: 'SUV', category: 'suv',  fuel: 'BEV',  slug: 'aion-v' },
  { vehSeriesCode: 'm8-phev', vehStyleCode: '2024', name: 'M8 PHEV',  body_type: 'MPV', category: 'mpv',  fuel: 'PHEV', slug: 'm8-phev' },
  { vehSeriesCode: 'emzoom',  vehStyleCode: '2024', name: 'EMZOOM',   body_type: 'SUV', category: 'suv',  fuel: 'Petrol', slug: 'emzoom' },
  { vehSeriesCode: 'aion-ut', vehStyleCode: '2025', name: 'AION UT',  body_type: 'Hatch', category: 'hatch', fuel: 'BEV', slug: 'aion-ut' },
]

// Website URL mapping
const MODEL_URLS = {
  'aion-v':  'https://www.gacgroup.com/en-au/suv/aion-v',
  'm8-phev': 'https://www.gacgroup.com/en-au/mpv/gac-m8-phev',
  'emzoom':  'https://www.gacgroup.com/en-au/suv/gac-emzoom',
  'aion-ut': 'https://www.gacgroup.com/en-au/hatchback/aion-ut',
}

function gacHeaders(method, body, params) {
  const timestamp = String(Date.now())
  const requestId = crypto.randomUUID()

  const parts = []
  if (method === 'post' && body !== undefined) {
    parts.push('body' + (JSON.stringify(body) || ''))
  }
  if (method === 'get' && params) {
    Object.keys(params).forEach(k => parts.push(k + params[k]))
  }
  parts.push('fnc-app-id' + APP_ID)
  parts.push('fnc-requestId' + requestId)
  parts.push('fnc-timestamp' + timestamp)
  parts.sort()

  const sig = crypto.createHmac('sha256', SIGN_SECRET)
    .update(parts.join(''))
    .digest('hex')
    .toUpperCase()

  return {
    'fnc-app-id': APP_ID,
    'fnc-requestId': requestId,
    'fnc-timestamp': timestamp,
    'sig': sig,
    'locale': 'en',
    'region': 'AU',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

async function gacPost(url, body) {
  const headers = gacHeaders('post', body)
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await resp.json()
  if (!data.success) throw new Error(`GAC API error: ${data.msg} (${data.code})`)
  return data.data
}

async function gacGet(url) {
  const headers = gacHeaders('get')
  const resp = await fetch(url, { method: 'GET', headers })
  const data = await resp.json()
  if (!data.success) throw new Error(`GAC API error: ${data.msg} (${data.code})`)
  return data.data
}

function parseSpecs(configs, variantIndex) {
  const specs = {}
  for (const section of configs) {
    const sectionSpecs = {}
    for (const item of section.content) {
      const val = item.content?.[variantIndex] || item.content?.[0]
      if (val && val !== '-' && val !== '—') {
        sectionSpecs[item.name] = val
      }
    }
    if (Object.keys(sectionSpecs).length > 0) {
      specs[section.name] = sectionSpecs
    }
  }
  return specs
}

async function seed() {
  console.log('=== GAC Australia Seed ===\n')

  // --- 1. Seed vehicle_models ---
  const modelRows = GAC_MODELS.map(m => ({
    oem_id: OEM_ID,
    slug: m.slug,
    name: m.name,
    body_type: m.body_type,
    category: m.category,
    model_year: parseInt(m.vehStyleCode),
    is_active: m.slug !== 'aion-ut', // AION UT not yet launched
    source_url: MODEL_URLS[m.slug],
    configurator_url: MODEL_URLS[m.slug],
    meta_json: {
      fuel_type: m.fuel,
      source: 'gac_api',
      veh_series_code: m.vehSeriesCode,
      veh_style_code: m.vehStyleCode,
    },
  }))

  console.log(`Seeding ${modelRows.length} vehicle models...`)
  const { data: modelData, error: modelErr } = await supabase
    .from('vehicle_models')
    .upsert(modelRows, { onConflict: 'oem_id,slug', ignoreDuplicates: false })
    .select('id, slug, name, model_year')
  if (modelErr) { console.error('Model error:', modelErr.message); process.exit(1) }
  console.log(`  Upserted ${modelData.length} models`)

  // Build model ID lookup
  const modelLookup = {}
  for (const m of modelData) modelLookup[m.slug] = m.id

  // --- 2. Fetch config + pricing from API ---
  console.log('\nFetching model configs from GAC API...')

  // Delete old products
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
  }

  const productRows = []
  const allSpecs = {} // slug → variantIndex → specs

  for (const model of GAC_MODELS) {
    console.log(`\n  Fetching ${model.name}...`)
    try {
      const configData = await gacPost(
        `${API_BASE}/showroom/vehicle/query/config-model`,
        { vehSeriesCode: model.vehSeriesCode, vehStyleCode: model.vehStyleCode }
      )

      const variants = configData.vehicleModels || []
      const configs = configData.configs || []

      console.log(`    Found ${variants.length} variants`)

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]
        const specs = parseSpecs(configs, i)

        productRows.push({
          oem_id: OEM_ID,
          external_key: `gac-${model.vehSeriesCode}-${v.vehModelId}`,
          source_url: MODEL_URLS[model.slug],
          title: `${model.name} ${v.vehModelName}`,
          subtitle: v.vehModelName,
          body_type: model.body_type,
          fuel_type: model.fuel,
          availability: 'available',
          price_amount: v.salePrice,
          price_currency: 'AUD',
          price_type: 'msrp',
          variant_name: v.vehModelName,
          variant_code: String(v.vehModelId),
          model_id: modelLookup[model.slug] || null,
          specs_json: specs,
          meta_json: {
            source: 'gac_api',
            veh_model_id: v.vehModelId,
            veh_series_code: model.vehSeriesCode,
            power_type: model.fuel,
          },
          last_seen_at: new Date().toISOString(),
        })

        console.log(`    ${v.vehModelName}: $${v.salePrice.toLocaleString()}`)
      }
    } catch (err) {
      console.log(`    Skipped (${err.message})`)
    }
  }

  // --- 3. Insert products ---
  if (productRows.length === 0) {
    console.log('\nNo products to seed.')
    return
  }

  console.log(`\nSeeding ${productRows.length} products...`)
  const { data: prodData, error: prodErr } = await supabase
    .from('products')
    .insert(productRows)
    .select('id, external_key, title, price_amount')
  if (prodErr) { console.error('Product error:', prodErr.message); process.exit(1) }
  console.log(`  Inserted ${prodData.length} products`)

  // --- 4. Fetch priceConfigModel → hero images + variant_pricing ---
  console.log('\nFetching price config (pricing + images)...')
  const pricingRows = []

  for (const model of GAC_MODELS) {
    try {
      const priceData = await gacPost(
        `${API_BASE}/showroom/veh-model/query/priceConfigModel`,
        { vehSeriesCode: model.vehSeriesCode, vehStyleCode: model.vehStyleCode }
      )
      if (!priceData?.vehicleModels) continue

      for (const vm of priceData.vehicleModels) {
        // Match to inserted product by vehModelCode or name
        const matchedProduct = prodData.find(p => {
          const extKey = `gac-${model.vehSeriesCode}-${vm.id}`
          return p.external_key === extKey
        })
        if (!matchedProduct) {
          console.log(`  ${model.name} ${vm.name}: no product match (id ${vm.id})`)
          continue
        }

        // Update hero image on product
        const heroUrl = vm.picUrlList?.[0] || null
        if (heroUrl) {
          await supabase
            .from('products')
            .update({
              hero_image_url: heroUrl,
              gallery_urls: vm.picUrlList || [],
            })
            .eq('id', matchedProduct.id)
        }

        // Build variant_pricing row
        pricingRows.push({
          product_id: matchedProduct.id,
          price_type: 'rrp',
          rrp: vm.salePrice,
          fetched_at: new Date().toISOString(),
        })

        console.log(`  ${model.name} ${vm.name}: $${vm.salePrice.toLocaleString()} RRP, ${vm.picUrlList?.length || 0} images`)
      }
    } catch (err) {
      console.log(`  ${model.name}: skipped (${err.message})`)
    }
  }

  // Insert variant_pricing
  let pricingInserted = 0
  if (pricingRows.length > 0) {
    console.log(`\nSeeding ${pricingRows.length} variant_pricing rows...`)
    const { data: priceInsertData, error: priceErr } = await supabase
      .from('variant_pricing')
      .insert(pricingRows)
      .select('id')
    if (priceErr) {
      console.error('Pricing error:', priceErr.message)
    } else {
      pricingInserted = priceInsertData.length
      console.log(`  Inserted ${pricingInserted} variant_pricing rows`)
    }
  }

  // --- Summary ---
  console.log('\n=== GAC SEED COMPLETE ===')
  console.log(`  Models:   ${modelData.length}`)
  console.log(`  Products: ${prodData.length}`)
  console.log(`  Pricing:  ${pricingInserted}`)
  console.log('\n  By model:')
  for (const model of GAC_MODELS) {
    const count = productRows.filter(p => p.meta_json.veh_series_code === model.vehSeriesCode).length
    console.log(`    ${model.name}: ${count} variants`)
  }
}

seed().catch(err => { console.error(err); process.exit(1) })
