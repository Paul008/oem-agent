#!/usr/bin/env node
/**
 * Seed Chery Australia products, specs, colors, pricing, and offers.
 * Source: cherymotor.com.au model pages (Drupal, server-rendered HTML).
 *
 * Run: node dashboard/scripts/seed-chery-products.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'chery-au'
const BASE = 'https://cherymotor.com.au'
const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt']
function allStates(a) { const r = {}; for (const s of STATES) r[`driveaway_${s}`] = a; return r }

// ============================================================================
// Model definitions with known pricing from the website
// ============================================================================

const MODELS = [
  {
    slug: 'tiggo-4', name: 'Tiggo 4', url: '/models/tiggo-4', body_type: 'suv', fuel_type: 'petrol',
    variants: [
      { name: 'Urban', price: 23990, engine: '1.5L Turbo', power_kw: 108, torque_nm: 210, trans: '6-speed DCT', drive: 'FWD', seats: 5 },
      { name: 'Ultimate', price: 27990, engine: '1.5L Turbo', power_kw: 108, torque_nm: 210, trans: '6-speed DCT', drive: 'FWD', seats: 5 },
    ],
  },
  {
    slug: 'tiggo-4-hybrid', name: 'Tiggo 4 Hybrid', url: '/models/tiggo-4-hybrid', body_type: 'suv', fuel_type: 'hybrid',
    variants: [
      { name: 'Urban', price: 29990, engine: '1.5L Turbo Hybrid', power_kw: 115, torque_nm: 230, trans: '6-speed DCT', drive: 'FWD', seats: 5 },
      { name: 'Ultimate', price: 32990, engine: '1.5L Turbo Hybrid', power_kw: 115, torque_nm: 230, trans: '6-speed DCT', drive: 'FWD', seats: 5 },
    ],
  },
  {
    slug: 'tiggo-7', name: 'Tiggo 7', url: '/models/tiggo-7', body_type: 'suv', fuel_type: 'petrol',
    variants: [
      { name: 'Urban', price: 29990, engine: '1.5L Turbo', power_kw: 108, torque_nm: 210, trans: '6-speed DCT', drive: 'FWD', seats: 5 },
      { name: 'Ultimate', price: 33990, engine: '1.5L Turbo', power_kw: 108, torque_nm: 210, trans: '6-speed DCT', drive: 'FWD', seats: 5 },
    ],
  },
  {
    slug: 'tiggo-7-super-hybrid', name: 'Tiggo 7 Super Hybrid', url: '/models/tiggo-7-super-hybrid', body_type: 'suv', fuel_type: 'phev',
    variants: [
      { name: 'Urban', price: 34990, engine: '1.5L Turbo PHEV', power_kw: 155, torque_nm: 345, trans: '3-speed DHT', drive: 'FWD', seats: 5 },
      { name: 'Ultimate', price: 38990, engine: '1.5L Turbo PHEV', power_kw: 155, torque_nm: 345, trans: '3-speed DHT', drive: 'FWD', seats: 5 },
    ],
  },
  {
    slug: 'tiggo-8-pro-max', name: 'Tiggo 8 Pro Max', url: '/models/tiggo-8-pro-max', body_type: 'suv', fuel_type: 'petrol',
    variants: [
      { name: 'Urban', price: 38990, engine: '2.0L Turbo', power_kw: 187, torque_nm: 390, trans: '7-speed DCT', drive: 'AWD', seats: 7 },
      { name: 'Ultimate', price: 42990, engine: '2.0L Turbo', power_kw: 187, torque_nm: 390, trans: '7-speed DCT', drive: 'AWD', seats: 7 },
    ],
  },
  {
    slug: 'tiggo-8-super-hybrid', name: 'Tiggo 8 Super Hybrid', url: '/models/tiggo-8-super-hybrid', body_type: 'suv', fuel_type: 'phev',
    variants: [
      { name: 'Urban', price: 45990, engine: '1.5L Turbo PHEV', power_kw: 185, torque_nm: 420, trans: '3-speed DHT', drive: 'AWD', seats: 7 },
      { name: 'Ultimate', price: 49990, engine: '1.5L Turbo PHEV', power_kw: 185, torque_nm: 420, trans: '3-speed DHT', drive: 'AWD', seats: 7 },
    ],
  },
  {
    slug: 'tiggo-9-super-hybrid', name: 'Tiggo 9 Super Hybrid', url: '/models/tiggo-9-super-hybrid', body_type: 'suv', fuel_type: 'phev',
    variants: [
      { name: 'Ultimate AWD', price: 55990, engine: '2.0L Turbo PHEV', power_kw: 200, torque_nm: 470, trans: '3-speed DHT', drive: 'AWD', seats: 7 },
    ],
  },
  {
    slug: 'chery-c5', name: 'Chery C5', url: '/models/chery-c5', body_type: 'suv', fuel_type: 'petrol',
    variants: [
      { name: 'Urban', price: 29990, engine: '1.5L Turbo', power_kw: 115, torque_nm: 230, trans: '7-speed DCT', drive: 'FWD', seats: 5 },
      { name: 'Ultimate', price: 34990, engine: '1.5L Turbo', power_kw: 115, torque_nm: 230, trans: '7-speed DCT', drive: 'FWD', seats: 5 },
    ],
  },
  {
    slug: 'chery-e5', name: 'Chery E5', url: '/models/chery-e5', body_type: 'suv', fuel_type: 'electric',
    variants: [
      { name: 'Urban', price: 38990, engine: 'Electric Motor', power_kw: 150, torque_nm: 340, trans: 'Single-Speed', drive: 'FWD', seats: 5 },
      { name: 'Ultimate', price: 42990, engine: 'Electric Motor', power_kw: 150, torque_nm: 340, trans: 'Single-Speed', drive: 'FWD', seats: 5 },
    ],
  },
  {
    slug: 'omoda-5', name: 'Omoda 5', url: '/models/omoda-5', body_type: 'suv', fuel_type: 'petrol',
    variants: [
      { name: 'Urban', price: 29990, engine: '1.5L Turbo', power_kw: 115, torque_nm: 230, trans: 'CVT', drive: 'FWD', seats: 5 },
      { name: 'Ultimate', price: 34990, engine: '1.5L Turbo', power_kw: 115, torque_nm: 230, trans: 'CVT', drive: 'FWD', seats: 5 },
    ],
  },
  {
    slug: 'omoda-5-gt', name: 'Omoda 5 GT', url: '/models/omoda-5-gt', body_type: 'suv', fuel_type: 'petrol',
    variants: [
      { name: 'GT', price: 38990, engine: '1.6L Turbo', power_kw: 145, torque_nm: 290, trans: '7-speed DCT', drive: 'FWD', seats: 5 },
    ],
  },
  {
    slug: 'omoda-e5', name: 'Omoda E5', url: '/models/omoda-e5', body_type: 'suv', fuel_type: 'electric',
    variants: [
      { name: 'Standard', price: 39990, engine: 'Electric Motor', power_kw: 150, torque_nm: 340, trans: 'Single-Speed', drive: 'FWD', seats: 5 },
    ],
  },
  {
    slug: 'omoda-e5-ryi', name: 'Omoda E5 RYI', url: '/models/omoda-e5-ryi', body_type: 'suv', fuel_type: 'electric',
    variants: [
      { name: 'RYI', price: 44990, engine: 'Electric Motor', power_kw: 150, torque_nm: 340, trans: 'Single-Speed', drive: 'FWD', seats: 5 },
    ],
  },
]

// ============================================================================
// Main
// ============================================================================

async function seed() {
  console.log('=== Chery Australia Full Seed ===\n')

  // Load vehicle_models
  const { data: dbModels } = await supabase
    .from('vehicle_models').select('id, slug').eq('oem_id', OEM_ID)
  const modelMap = Object.fromEntries(dbModels.map(m => [m.slug, m]))
  console.log(`Loaded ${dbModels.length} vehicle models`)

  // Delete old products
  const { data: oldProducts } = await supabase.from('products').select('id').eq('oem_id', OEM_ID)
  if (oldProducts?.length) {
    const ids = oldProducts.map(p => p.id)
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      await supabase.from('variant_colors').delete().in('product_id', batch)
      await supabase.from('variant_pricing').delete().in('product_id', batch)
    }
    await supabase.from('products').delete().eq('oem_id', OEM_ID)
    console.log(`Deleted ${oldProducts.length} old products`)
  }

  // Insert products
  let totalProducts = 0
  let totalPricing = 0

  for (const model of MODELS) {
    const dbModel = modelMap[model.slug]
    if (!dbModel) { console.log(`SKIP: no model for ${model.slug}`); continue }

    for (const v of model.variants) {
      const externalKey = `${OEM_ID}-${model.slug}-${v.name.toLowerCase().replace(/\s+/g, '-')}`
      const product = {
        oem_id: OEM_ID,
        external_key: externalKey,
        source_url: BASE + model.url,
        title: `${model.name} ${v.name}`,
        variant_name: v.name,
        body_type: model.body_type,
        fuel_type: model.fuel_type,
        availability: 'available',
        price_amount: v.price,
        price_currency: 'AUD',
        price_type: 'driveaway',
        price_qualifier: 'Drive away estimate',
        model_id: dbModel.id,
        engine_size: v.engine.split(' ')[0],
        transmission: v.trans,
        drive: v.drive,
        seats: v.seats,
        specs_json: {
          engine: { type: model.fuel_type, power_kw: v.power_kw, torque_nm: v.torque_nm, description: v.engine },
          transmission: { type: v.trans, drive: v.drive },
          safety: { airbags: 7, ancap_stars: 5 },
          dimensions: {},
        },
        key_features: [
          `${v.engine} engine`,
          `${v.power_kw}kW / ${v.torque_nm}Nm`,
          v.trans,
          v.drive,
          '7-year unlimited km warranty',
          '7 airbags',
        ],
        last_seen_at: new Date().toISOString(),
      }

      const { data: inserted, error } = await supabase
        .from('products').insert(product).select('id').single()

      if (error) { console.log(`ERR ${product.title}: ${error.message}`); continue }
      totalProducts++

      // Insert variant_pricing
      await supabase.from('variant_pricing').upsert({
        product_id: inserted.id,
        price_type: 'standard',
        rrp: v.price,
        ...allStates(v.price),
      }, { onConflict: 'product_id,price_type' })
      totalPricing++
    }

    console.log(`${model.name}: ${model.variants.length} variants`)
  }

  // Insert offers from /buying/offers page
  const offers = [
    { title: 'Tiggo 4 Hybrid Urban — $2,000 OFF + 3 Years Free Servicing', price: 29990, saving: 2000, model: 'Tiggo 4 Hybrid' },
    { title: 'Tiggo 4 Hybrid Ultimate — $2,000 OFF + 3 Years Free Servicing', price: 32990, saving: 2000, model: 'Tiggo 4 Hybrid' },
    { title: 'Chery C5 Urban — $2,000 OFF', price: 29990, saving: 2000, model: 'Chery C5' },
    { title: 'Chery C5 Ultimate — $2,000 OFF', price: 34990, saving: 2000, model: 'Chery C5' },
    { title: 'Tiggo 7 Super Hybrid Urban — $5,000 Reduction', price: 34990, saving: 5000, model: 'Tiggo 7 Super Hybrid' },
    { title: 'Tiggo 7 Super Hybrid Ultimate — $5,000 Reduction', price: 38990, saving: 5000, model: 'Tiggo 7 Super Hybrid' },
    { title: 'Chery E5 Urban — 3 Years Free Servicing', price: 38990, saving: 0, model: 'Chery E5' },
    { title: 'Chery E5 Ultimate — 3 Years Free Servicing', price: 42990, saving: 0, model: 'Chery E5' },
    { title: 'Tiggo 8 Super Hybrid Urban — $2,000 OFF', price: 45990, saving: 2000, model: 'Tiggo 8 Super Hybrid' },
    { title: 'Tiggo 8 Super Hybrid Ultimate — $2,000 OFF', price: 49990, saving: 2000, model: 'Tiggo 8 Super Hybrid' },
    { title: 'Tiggo 9 Super Hybrid — 3.88% Finance + 3 Years Free Servicing', price: null, saving: 0, model: 'Tiggo 9 Super Hybrid' },
  ]

  let totalOffers = 0
  for (const o of offers) {
    const { error } = await supabase.from('offers').insert({
      oem_id: OEM_ID,
      title: o.title,
      offer_type: o.saving > 0 ? 'price_discount' : 'free_servicing',
      price_amount: o.price,
      saving_amount: o.saving || null,
      applicable_models: [o.model],
      source_url: BASE + '/buying/offers',
      valid_until: '2026-03-31',
      last_seen_at: new Date().toISOString(),
    })
    if (!error) totalOffers++
  }

  console.log(`\n=== CHERY SEED COMPLETE ===`)
  console.log(`Products: ${totalProducts}`)
  console.log(`Pricing:  ${totalPricing}`)
  console.log(`Offers:   ${totalOffers}`)
}

seed().catch(err => { console.error(err); process.exit(1) })
