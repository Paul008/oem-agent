#!/usr/bin/env node
/**
 * Populate variant_pricing with driveaway estimates for all OEMs.
 * Uses OEM-specific APIs where available, falls back to products.price_amount.
 *
 * Run: node dashboard/scripts/seed-all-pricing.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt']

function allStates(amount) {
  if (!amount) return {}
  const row = {}
  for (const s of STATES) row[`driveaway_${s}`] = amount
  return row
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ============================================================================
// 1. KIA — Already handled by kia-colors.ts (skip)
// ============================================================================

// ============================================================================
// 2. HYUNDAI — CGI configurator has fscLowPrice (national driveaway)
// ============================================================================
async function seedHyundaiPricing() {
  console.log('\n=== HYUNDAI PRICING ===')
  const { data: products } = await supabase
    .from('products')
    .select('id, title, meta_json, price_amount')
    .eq('oem_id', 'hyundai-au')

  let inserted = 0
  for (const p of products) {
    const mj = p.meta_json || {}
    // Use price_low from CGI data, fallback to price_amount
    const driveaway = mj.price_low || mj.price_high || p.price_amount
    if (!driveaway || driveaway > 999999) continue

    const rrp = p.price_amount || null

    const row = {
      product_id: p.id,
      price_type: 'standard',
      rrp,
      ...allStates(Math.round(driveaway * 100) / 100),
    }

    const { error } = await supabase
      .from('variant_pricing')
      .upsert(row, { onConflict: 'product_id,price_type' })

    if (error) {
      console.log(`  ERR ${p.title}: ${error.message}`)
    } else {
      inserted++
      // Update product display price
      await supabase.from('products').update({
        price_amount: driveaway,
        price_type: 'driveaway',
        price_qualifier: 'Drive away estimate',
      }).eq('id', p.id)
    }
  }
  console.log(`  ${inserted}/${products.length} products priced`)
}

// ============================================================================
// 3. MITSUBISHI — GraphQL has state-specific pricing (NSW, VIC, QLD)
// ============================================================================
async function seedMitsubishiPricing() {
  console.log('\n=== MITSUBISHI PRICING ===')
  const GQL = 'https://store.mitsubishi-motors.com.au/graphql'

  // Fetch offers with state pricing
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{
        offers(priceGroup: PRIVATE) {
          items {
            vehicle { sku name }
            pricing {
              nsw { driveAwayPrice }
              vic { driveAwayPrice }
              qld { driveAwayPrice }
              wa { driveAwayPrice }
              sa { driveAwayPrice }
              tas { driveAwayPrice }
              act { driveAwayPrice }
              nt { driveAwayPrice }
            }
            rrp
          }
        }
      }`
    }),
  })
  const data = await res.json()

  if (data.errors) {
    // Fallback: use products.price_amount as national driveaway
    console.log('  GraphQL offers query failed, using products.price_amount fallback')
    return seedOemFromProducts('mitsubishi-au')
  }

  const offers = data.data?.offers?.items || []
  console.log(`  ${offers.length} offers from GraphQL`)

  const { data: products } = await supabase
    .from('products')
    .select('id, title, meta_json, price_amount')
    .eq('oem_id', 'mitsubishi-au')

  let inserted = 0
  for (const offer of offers) {
    const sku = offer.vehicle?.sku
    if (!sku) continue

    // Match to product by SKU in meta_json
    const product = products.find(p => p.meta_json?.sku === sku)
    if (!product) continue

    const pr = offer.pricing || {}
    const rrp = offer.rrp || product.price_amount || null

    const row = {
      product_id: product.id,
      price_type: 'standard',
      rrp,
      driveaway_nsw: pr.nsw?.driveAwayPrice || null,
      driveaway_vic: pr.vic?.driveAwayPrice || null,
      driveaway_qld: pr.qld?.driveAwayPrice || null,
      driveaway_wa: pr.wa?.driveAwayPrice || null,
      driveaway_sa: pr.sa?.driveAwayPrice || null,
      driveaway_tas: pr.tas?.driveAwayPrice || null,
      driveaway_act: pr.act?.driveAwayPrice || null,
      driveaway_nt: pr.nt?.driveAwayPrice || null,
    }

    const bestPrice = row.driveaway_vic || row.driveaway_nsw || rrp
    if (!bestPrice) continue

    const { error } = await supabase
      .from('variant_pricing')
      .upsert(row, { onConflict: 'product_id,price_type' })

    if (!error) {
      inserted++
      await supabase.from('products').update({
        price_amount: bestPrice,
        price_type: 'driveaway',
        price_qualifier: 'Drive away estimate',
      }).eq('id', product.id)
    }
  }
  console.log(`  ${inserted} pricing rows from GraphQL`)

  // Fill remaining products from price_amount
  const pricedIds = new Set(offers.map(o => {
    const p = products.find(pp => pp.meta_json?.sku === o.vehicle?.sku)
    return p?.id
  }).filter(Boolean))

  const unpriced = products.filter(p => !pricedIds.has(p.id) && p.price_amount)
  if (unpriced.length) {
    console.log(`  + ${unpriced.length} products from price_amount fallback`)
    for (const p of unpriced) {
      await supabase.from('variant_pricing').upsert({
        product_id: p.id, price_type: 'standard',
        rrp: p.price_amount, ...allStates(p.price_amount),
      }, { onConflict: 'product_id,price_type' })
    }
  }
}

// ============================================================================
// Generic: Seed from products.price_amount (national, all states same)
// ============================================================================
async function seedOemFromProducts(oemId) {
  const { data: products } = await supabase
    .from('products')
    .select('id, title, price_amount, price_type')
    .eq('oem_id', oemId)

  let inserted = 0
  for (const p of products) {
    if (!p.price_amount || p.price_amount > 999999) continue

    const { error } = await supabase
      .from('variant_pricing')
      .upsert({
        product_id: p.id,
        price_type: 'standard',
        rrp: p.price_amount,
        ...allStates(p.price_amount),
      }, { onConflict: 'product_id,price_type' })

    if (!error) {
      inserted++
      // Update price_type to driveaway if it wasn't already
      if (p.price_type !== 'driveaway') {
        await supabase.from('products').update({
          price_type: 'driveaway',
          price_qualifier: 'Drive away estimate',
        }).eq('id', p.id)
      }
    }
  }
  return { total: products.length, inserted }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  console.log('=== ALL-OEM PRICING SEED ===')
  console.log('Skipping: kia-au (handled by kia-colors.ts)\n')

  // OEMs with dedicated pricing logic
  await seedHyundaiPricing()
  await seedMitsubishiPricing()

  // OEMs with products.price_amount (national driveaway or RRP)
  const genericOems = [
    'mazda-au', 'ford-au', 'nissan-au', 'toyota-au', 'isuzu-au',
    'subaru-au', 'suzuki-au', 'volkswagen-au', 'gwm-au', 'gmsv-au',
    'ldv-au', 'gac-au', 'foton-au', 'kgm-au',
  ]

  for (const oemId of genericOems) {
    const r = await seedOemFromProducts(oemId)
    console.log(`${oemId}: ${r.inserted}/${r.total} products priced`)
  }

  // Summary
  const { count } = await supabase
    .from('variant_pricing')
    .select('*', { count: 'exact', head: true })
  console.log(`\n=== TOTAL VARIANT_PRICING ROWS: ${count} ===`)
}

main().catch(err => { console.error(err); process.exit(1) })
