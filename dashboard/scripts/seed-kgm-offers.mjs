/**
 * Seed KGM offers from Payload CMS models API + website offer data.
 *
 * Sources:
 * - Factory bonus/run-out offers from kgm.com.au/offers (with CMS media images)
 * - ABN discounts from Payload CMS models.abn_discount field
 * - Grade-level pricing from Payload CMS grades endpoint
 *
 * Run: cd dashboard/scripts && node seed-kgm-offers.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const CMS_BASE = 'https://payloadb.therefinerydesign.com/api'
const MEDIA_BASE = 'https://payload.therefinerydesign.com/api/media/file'
const HEADERS = { Accept: 'application/json', Origin: 'https://kgm.com.au', Referer: 'https://kgm.com.au/' }
const OEM_ID = 'kgm-au'
const SOURCE_URL = 'https://www.kgm.com.au/offers'

// ── Website offers (scraped from kgm.com.au/offers) ──

const WEBSITE_OFFERS = [
  {
    title: 'Free Charger for Torres EVX or Musso EV customers',
    offer_type: 'value_add',
    saving_amount: null,
    description: 'KGM Australia will pay the cost of an EVNEX 7kW E2 Core charger for customers who purchase a Torres EVX or Musso EV before 31/03/2026.',
    disclaimer: 'Payment of the purchase price of the charger by KGM Australia does not include installation costs. The offer is available for private buyers only.',
    applicable_models: ['torres', 'musso-ev-my26'],
    validity_end: '2026-03-31',
    image: null, // no image on page for this one
    cta_url: 'https://www.kgm.com.au/models/torres',
  },
  {
    title: 'Musso Factory Bonus - Save $2,000',
    offer_type: 'factory_bonus',
    saving_amount: 2000,
    description: 'Factory bonus on MY26 Musso vehicles excluding the EV.',
    disclaimer: 'Offer available on MY26 Musso vehicles excluding the EV. Metallic paint $700 extra. Offer available for a limited time and while stocks last. Stock availability may vary between dealers.',
    applicable_models: ['musso-my26'],
    validity_end: null,
    image: `${MEDIA_BASE}/kgm-musso-my26-xlv-amazonian-green-ultimate.webp`,
    cta_url: 'https://www.kgm.com.au/models/musso',
  },
  {
    title: 'Rexton Factory Bonus - Save $2,000',
    offer_type: 'factory_bonus',
    saving_amount: 2000,
    description: 'Factory bonus on MY26 Rexton vehicles.',
    disclaimer: 'Offer available on MY26 Rexton vehicles. Metallic paint $700 extra. Offer available for a limited time and while stocks last. Stock availability may vary between dealers.',
    applicable_models: ['rexton-my26'],
    validity_end: null,
    image: `${MEDIA_BASE}/kgm-rexton-my26-marble-grey-ultimate.webp`,
    cta_url: 'https://www.kgm.com.au/models/rexton',
  },
  {
    title: 'Actyon Factory Bonus - Save $2,000',
    offer_type: 'factory_bonus',
    saving_amount: 2000,
    description: 'Factory bonus on MY26 Actyon vehicles.',
    disclaimer: 'Offer available on MY26 Actyon vehicles. Metallic paint $700 extra. Offer available for a limited time and while stocks last. Stock availability may vary between dealers.',
    applicable_models: ['actyon'],
    validity_end: null,
    image: `${MEDIA_BASE}/kgm-actyon-royal-copper-1.webp`,
    cta_url: 'https://www.kgm.com.au/models/actyon',
  },
  {
    title: 'Torres Factory Bonus - Save Up To $5,010',
    offer_type: 'factory_bonus',
    saving_amount: 5010,
    description: 'Factory bonus on MY25 and MY26 Torres vehicles excluding the EVX.',
    disclaimer: 'Offer available on MY25 and MY26 Torres vehicles excluding the EVX. Metallic paint $700 extra. Offer available for a limited time and while stocks last. Stock availability may vary between dealers.',
    applicable_models: ['torres'],
    validity_end: null,
    image: `${MEDIA_BASE}/kgm-torres-my25-grand-white-ultimate.webp`,
    cta_url: 'https://www.kgm.com.au/models/torres',
  },
  {
    title: 'MY24 Rexton Run Out Sale - Save Up To $5,010',
    offer_type: 'run_out',
    saving_amount: 5010,
    description: 'Run out sale on MY24 Rexton vehicles.',
    disclaimer: 'Offer available on MY24 Rexton vehicles. Metallic paint $700 extra. Offer available for a limited time and while stocks last. Stock availability may vary between dealers.',
    applicable_models: ['rexton-my24'],
    validity_end: null,
    image: `${MEDIA_BASE}/ssangyong-rexton-ultimate-marble-grey.webp`,
    cta_url: 'https://www.kgm.com.au/models/rexton',
  },
  {
    title: 'MY24 Musso Run Out Sale - Save Up To $6,010',
    offer_type: 'run_out',
    saving_amount: 6010,
    description: 'Run out sale on MY24 Musso vehicles.',
    disclaimer: 'Offer available on MY24 Rexton vehicles. Metallic paint $700 extra. Offer available for a limited time and while stocks last. Stock availability may vary between dealers.',
    applicable_models: ['musso-my24'],
    validity_end: null,
    image: `${MEDIA_BASE}/SsangYong_Musso_XLV_GrandWhite_Ultimate.webp`,
    cta_url: 'https://www.kgm.com.au/models/musso',
  },
  {
    title: 'Korando Run Out Sale',
    offer_type: 'run_out',
    saving_amount: null,
    description: 'Run out pricing on Korando vehicles.',
    disclaimer: 'Offer available for a limited time and while stocks last. Stock availability may vary between dealers.',
    applicable_models: ['korando'],
    validity_end: null,
    image: `${MEDIA_BASE}/ssangyong-korando-grand-whiteult.webp`,
    cta_url: 'https://www.kgm.com.au/models/korando',
  },
]

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function main() {
  // 1. Fetch models from Payload CMS for ABN discounts and pricing
  console.log('Fetching KGM models from Payload CMS...')
  const modelsRes = await fetch(`${CMS_BASE}/models?limit=100&depth=2`, { headers: HEADERS })
  const modelsData = await modelsRes.json()
  const models = modelsData.docs
  console.log(`  Found ${models.length} models`)

  // 2. Fetch grades for grade-level pricing
  console.log('Fetching KGM grades...')
  const gradesRes = await fetch(`${CMS_BASE}/grades?limit=100&depth=2`, { headers: HEADERS })
  const gradesData = await gradesRes.json()
  const grades = gradesData.docs
  console.log(`  Found ${grades.length} grades`)

  // 3. Print model ABN discounts
  console.log('\nModel ABN discounts:')
  for (const m of models) {
    console.log(`  ${m.name}: abn_discount=${m.abn_discount}, price=${m.price}`)
  }

  // 4. Look up vehicle_models in Supabase for model_id linking
  const { data: dbModels } = await supabase
    .from('vehicle_models')
    .select('id, slug, name')
    .eq('oem_id', OEM_ID)
  const modelLookup = {}
  for (const m of dbModels) {
    modelLookup[m.slug] = m.id
  }
  console.log(`\nDB models: ${dbModels.map(m => m.slug).join(', ')}`)

  // 5. Build offer rows
  const now = new Date().toISOString()
  const offerRows = []

  // Website offers (factory bonus, run-out, value-add)
  for (const offer of WEBSITE_OFFERS) {
    const extKey = `offer-${slugify(offer.title)}`

    // Try to find a matching model_id
    let modelId = null
    if (offer.applicable_models?.length === 1) {
      modelId = modelLookup[offer.applicable_models[0]] || null
    }

    // Find the model's ABN discount
    let abnDiscount = null
    if (offer.applicable_models?.length) {
      for (const modelSlug of offer.applicable_models) {
        const cmsModel = models.find(m => slugify(m.name) === modelSlug)
        if (cmsModel?.abn_discount) {
          abnDiscount = Math.abs(cmsModel.abn_discount)
          break
        }
      }
    }

    // Find starting price for the model
    let startingPrice = null
    if (offer.applicable_models?.length) {
      for (const modelSlug of offer.applicable_models) {
        const cmsModel = models.find(m => slugify(m.name) === modelSlug)
        if (cmsModel?.price) {
          startingPrice = cmsModel.price
          break
        }
      }
    }

    // Calculate ABN price if we have both
    const abnPrice = startingPrice && abnDiscount
      ? startingPrice - abnDiscount
      : null

    offerRows.push({
      oem_id: OEM_ID,
      external_key: extKey,
      source_url: SOURCE_URL,
      title: offer.title,
      description: offer.description,
      offer_type: offer.offer_type,
      applicable_models: offer.applicable_models?.join(', ') || null,
      price_amount: startingPrice,
      price_currency: 'AUD',
      price_type: 'rrp',
      abn_price_amount: abnPrice,
      saving_amount: offer.saving_amount,
      validity_start: null,
      validity_end: offer.validity_end,
      validity_raw: offer.validity_end ? `Ends ${offer.validity_end}` : 'Limited time, while stocks last',
      cta_text: 'Learn more',
      cta_url: offer.cta_url,
      hero_image_r2_key: offer.image,
      disclaimer_text: offer.disclaimer,
      model_id: modelId,
      content_hash: null,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    })
  }

  console.log(`\nPrepared ${offerRows.length} offers:`)
  for (const o of offerRows) {
    const price = o.price_amount ? `$${o.price_amount}` : '-'
    const abn = o.abn_price_amount ? `abn=$${o.abn_price_amount}` : ''
    const save = o.saving_amount ? `save=$${o.saving_amount}` : ''
    const img = o.hero_image_r2_key ? 'has-img' : 'no-img'
    console.log(`  ${o.title} | ${price} ${abn} ${save} | ${img}`)
  }

  // 6. Delete existing KGM offers and insert new ones
  console.log('\nDeleting existing KGM offers...')
  const { error: delErr } = await supabase
    .from('offers')
    .delete()
    .eq('oem_id', OEM_ID)
  if (delErr) console.error('Delete error:', delErr.message)

  console.log(`Inserting ${offerRows.length} offers...`)
  const { data: inserted, error: insErr } = await supabase
    .from('offers')
    .insert(offerRows)
    .select('id, title, price_amount, abn_price_amount, saving_amount')
  if (insErr) { console.error('Insert error:', insErr.message); process.exit(1) }

  console.log(`\n✓ Inserted ${inserted.length} KGM offers`)
  for (const o of inserted) {
    console.log(`  ${o.title} | rrp=$${o.price_amount || '-'} | abn=$${o.abn_price_amount || '-'} | save=$${o.saving_amount || '-'}`)
  }
}

main().catch(console.error)
