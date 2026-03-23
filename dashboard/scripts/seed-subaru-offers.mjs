#!/usr/bin/env node
/**
 * Seed Subaru Australia offers from the /special-offers page.
 *
 * The Subaru offers page is a React app (Inchcape AU Web Platform) with
 * obfuscated CSS Module classes. Offer data lives in the React fiber tree
 * as `specialOffers` props. Since the page blocks bot User-Agents (405),
 * this script embeds the known offer data structure and inserts directly.
 *
 * Image CDN: production-cdn-subaru-image-handler.s3.ap-southeast-2.amazonaws.com
 * Offers are NATIONAL (not state-filtered) — dealer selection only affects enquiry routing.
 *
 * Run: cd dashboard/scripts && node seed-subaru-offers.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'subaru-au'
const SOURCE_URL = 'https://www.subaru.com.au/special-offers'
const S3_CDN = 'https://production-cdn-subaru-image-handler.s3.ap-southeast-2.amazonaws.com'

// ── Offer data extracted from the Subaru /special-offers React app ──
// Each offer has: id (slug), title, category, displayCategory, price, media (desktop/tablet/mobile)
const OFFERS = [
  // === Driveaway Offers ===
  {
    slug: '2026-forester-awd-driveaway-offer',
    title: 'Subaru Forester AWD from $48,990 Driveaway',
    description: 'Hurry, last days - Subaru Forester AWD from $48,990 Driveaway',
    offer_type: 'driveaway',
    category: 'Special Offer',
    display: 'Main',
    applicable_models: ['Forester'],
    price: 48990,
    cta_text: 'View Offer',
  },
  {
    slug: '2026-forester-awd-hybrid-driveaway-offer',
    title: 'Forester AWD Hybrid from $51,990 driveaway',
    description: 'Hurry last days! Forester AWD Hybrid from $51,990 driveaway',
    offer_type: 'driveaway',
    category: 'Special Offer',
    display: 'Main',
    applicable_models: ['Forester'],
    price: 51990,
    cta_text: 'View Offer',
  },
  {
    slug: '2026-crosstrek-driveaway-offer',
    title: 'Subaru Crosstrek now starting from $39,990-$52,990 Driveaway',
    description: 'Subaru Crosstrek now starting from $39,990-$52,990 Driveaway',
    offer_type: 'driveaway',
    category: 'Special Offer',
    display: 'Main',
    applicable_models: ['Crosstrek'],
    price: 39990,
    cta_text: 'View Offer',
  },

  // === Run-out / Servicing Offers ===
  {
    slug: 'outback-xt-5-years-free-servicing',
    title: 'Outback Turbocharged run out offer!',
    description: 'Outback XT with 5 years free servicing',
    offer_type: 'servicing',
    category: 'Special Offer',
    display: 'Main',
    applicable_models: ['Outback'],
    price: null,
    cta_text: 'Enquire Now',
  },

  // === Special Edition Models ===
  {
    slug: 'wrx-club-spec-evo-special-edition',
    title: 'A Legend Returns - WRX Club Spec Evo',
    description: 'WRX Club Spec Evo Special Edition',
    offer_type: 'special_edition',
    category: 'Special Edition Model',
    display: 'Secondary',
    applicable_models: ['WRX'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'brz-kiiro-special-edition',
    title: 'Fired up in Sunrise Yellow - BRZ Kiiro',
    description: 'BRZ Kiiro Special Edition',
    offer_type: 'special_edition',
    category: 'Special Edition Model',
    display: 'Secondary',
    applicable_models: ['BRZ'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'outback-sport-xt-onyx',
    title: 'Break Convention. Drive Bold. - Outback Sport XT Onyx',
    description: 'Outback Sport XT Onyx Edition',
    offer_type: 'special_edition',
    category: 'Special Edition Model',
    display: 'Secondary',
    applicable_models: ['Outback'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'crosstrek-onyx',
    title: 'Dark, daring, and ready to roam - Crosstrek Onyx',
    description: 'Crosstrek Onyx Edition',
    offer_type: 'special_edition',
    category: 'Special Edition Model',
    display: 'Secondary',
    applicable_models: ['Crosstrek'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'outback-premium',
    title: 'Subaru Outback AWD Premium',
    description: 'Outback AWD Premium',
    offer_type: 'special_edition',
    category: 'Special Edition Model',
    display: 'Secondary',
    applicable_models: ['Outback'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'impreza-s-edition',
    title: 'Track-inspired. Street-refined. - Impreza S Edition',
    description: 'Impreza S Edition',
    offer_type: 'special_edition',
    category: 'Special Edition Model',
    display: 'Secondary',
    applicable_models: ['Impreza'],
    price: null,
    cta_text: 'View Offer',
  },

  // === Accessory Offers ===
  {
    slug: 'brz-accessory-offer',
    title: 'BRZ Accessory Pack',
    description: 'BRZ accessories offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['BRZ'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'forester-tow-bar-offer',
    title: 'Forester Tow Bar Offer',
    description: 'Forester tow bar accessory offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['Forester'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'wrx-rear-spoiler-offer',
    title: 'WRX Rear Spoiler Offer',
    description: 'WRX rear spoiler accessory offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['WRX'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'crosstrek-alloy-wheel-offer',
    title: 'Crosstrek Alloy Wheel Offer',
    description: 'Crosstrek alloy wheel accessory offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['Crosstrek'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'forester-mudflap-offer',
    title: 'Forester Mudflap Offer',
    description: 'Forester mudflap accessory offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['Forester'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'impreza-styling-pack-offer',
    title: 'Impreza Styling Pack Offer',
    description: 'Impreza styling pack accessory offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['Impreza'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'outback-cargo-panel-offer',
    title: 'Outback Cargo Panel Offer',
    description: 'Outback cargo panel accessory offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['Outback'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'forester-first-aid-kit-offer',
    title: 'Forester First Aid Kit Offer',
    description: 'Forester first aid kit accessory offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['Forester'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'crosstrek-accessory-pack-offer',
    title: 'Crosstrek Accessory Pack Offer',
    description: 'Crosstrek general accessory pack offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['Crosstrek'],
    price: null,
    cta_text: 'View Offer',
  },
  {
    slug: 'wrx-accessory-pack-offer',
    title: 'WRX Accessory Pack Offer',
    description: 'WRX general accessory pack offer',
    offer_type: 'accessory',
    category: 'Accessory Offer',
    display: 'Tertiary',
    applicable_models: ['WRX'],
    price: null,
    cta_text: 'View Offer',
  },
]

// ── Link offer slugs to vehicle_models ──
async function resolveModelId(modelNames) {
  if (!modelNames || modelNames.length === 0) return null
  const { data } = await supabase
    .from('vehicle_models')
    .select('id, name')
    .eq('oem_id', OEM_ID)
    .in('name', modelNames)
    .limit(1)
  return data?.[0]?.id || null
}

// ── Main ──
console.log('=== Seeding Subaru Australia Offers ===\n')
console.log(`  Total offers to seed: ${OFFERS.length}`)

let created = 0
let updated = 0
let skipped = 0

for (const offer of OFFERS) {
  const modelId = await resolveModelId(offer.applicable_models)

  // Build image URLs (desktop, tablet, mobile) from S3 CDN pattern
  // The exact UUIDs vary — we store the slug-based path prefix
  // and the orchestrator crawl will update with exact image URLs
  const heroImageUrl = `${S3_CDN}/offers/${offer.slug}/`
  const ctaUrl = `https://www.subaru.com.au/special-offers/${offer.slug}`

  const row = {
    oem_id: OEM_ID,
    source_url: SOURCE_URL,
    title: offer.title,
    description: offer.description,
    offer_type: offer.offer_type,
    applicable_models: offer.applicable_models,
    price_amount: offer.price,
    price_currency: offer.price ? 'AUD' : null,
    price_type: offer.price ? 'driveaway' : null,
    cta_text: offer.cta_text,
    cta_url: ctaUrl,
    hero_image_r2_key: null, // Will be populated when crawl extracts actual image URLs
    model_id: modelId,
    eligibility: { category: offer.category, display: offer.display, scope: 'national' },
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // Check if exists
  const { data: existing } = await supabase
    .from('offers')
    .select('id')
    .eq('oem_id', OEM_ID)
    .eq('title', offer.title)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('offers')
      .update(row)
      .eq('id', existing.id)
    if (error) {
      console.error(`  ✗ Update failed for "${offer.title}": ${error.message}`)
    } else {
      updated++
      console.log(`  ↻ Updated: ${offer.title}`)
    }
  } else {
    row.id = crypto.randomUUID()
    row.created_at = new Date().toISOString()
    const { error } = await supabase.from('offers').insert(row)
    if (error) {
      console.error(`  ✗ Insert failed for "${offer.title}": ${error.message}`)
    } else {
      created++
      console.log(`  ✓ Created: ${offer.title}`)
    }
  }
}

console.log(`\n=== Done ===`)
console.log(`  Created: ${created}`)
console.log(`  Updated: ${updated}`)
console.log(`  Total: ${OFFERS.length}`)

// ── Also ensure source page exists for ongoing crawls ──
console.log('\n=== Ensuring Subaru source pages exist ===\n')

const sourcePages = [
  { oem_id: OEM_ID, url: 'https://www.subaru.com.au/', page_type: 'homepage', status: 'active' },
  { oem_id: OEM_ID, url: 'https://www.subaru.com.au/vehicles', page_type: 'vehicle', status: 'active' },
  { oem_id: OEM_ID, url: 'https://www.subaru.com.au/special-offers', page_type: 'offers', status: 'active' },
  { oem_id: OEM_ID, url: 'https://www.subaru.com.au/newsroom', page_type: 'news', status: 'active' },
]

for (const sp of sourcePages) {
  const { data: existing } = await supabase
    .from('source_pages')
    .select('id')
    .eq('oem_id', OEM_ID)
    .eq('url', sp.url)
    .maybeSingle()

  if (existing) {
    console.log(`  ↻ Source page exists: ${sp.url}`)
  } else {
    const { error } = await supabase.from('source_pages').insert({
      ...sp,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (error) {
      console.error(`  ✗ Failed: ${sp.url} — ${error.message}`)
    } else {
      console.log(`  ✓ Created: ${sp.url} (${sp.page_type})`)
    }
  }
}

console.log('\nDone! Subaru offers seeded and source pages configured.')
