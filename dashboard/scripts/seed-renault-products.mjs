/**
 * Seed Renault Australia vehicles, variants, colors, pricing, and offers
 * from Gatsby page-data.json endpoints (i-motor CMS).
 *
 * Data source: https://www.renault.com.au/page-data/{path}/page-data.json
 *
 * Run: cd dashboard/scripts && node seed-renault-products.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'renault-au'
const BASE = 'https://www.renault.com.au'
const now = new Date().toISOString()

// ── Helpers ──

async function fetchPageData(path) {
  const url = `${BASE}/page-data/${path}/page-data.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  const json = await res.json()
  return json.result.data
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/** Map category names → body_type */
function deriveBodyType(categories, vehicleClassification) {
  const names = categories.map(c => c.name?.toLowerCase() || '')
  if (names.includes('commercial')) return 'Van'
  if (names.includes('suv')) return 'SUV'
  if (vehicleClassification === 'passenger') return 'Hatch'
  return 'SUV'
}

/** Map category → offer_type */
function mapOfferType(category) {
  switch (category) {
    case 'driveaway_offer': return 'driveaway'
    case 'finance_offer': return 'finance'
    case 'special_offer': return 'accessory'
    default: return 'other'
  }
}

// ── Main ──

async function seed() {
  console.log('=== Renault Australia Seed ===\n')

  // ── 0. Verify OEM record exists (created by migration, not overwritten here) ──
  const { data: oemCheck } = await supabase.from('oems').select('id').eq('id', OEM_ID).single()
  if (!oemCheck) {
    // Fallback: create if migration hasn't run yet
    const { error: oemErr } = await supabase.from('oems').insert({
      id: OEM_ID, name: 'Renault Australia', base_url: BASE, is_active: true,
      config_json: { homepage: '/', vehicles_index: '/vehicles/', offers: '/special-offers/', news: '/news/', brand_colors: ['#EFDF00', '#000000'], framework: 'gatsby', platform: 'imotor', notes: 'Gatsby 5.14.6 + i-motor CMS (same platform as LDV).' },
    })
    if (oemErr) { console.error('OEM insert error:', oemErr.message); process.exit(1) }
    console.log('OEM record created: renault-au')
  } else {
    console.log('OEM record exists: renault-au')
  }

  // ── 1. Fetch models listing ──
  console.log('Fetching models listing...')
  const listingData = await fetchPageData('vehicles')
  const allModels = listingData.allCmsVehicleModelLean.nodes

  // Filter: displayInNavigation=true, not comingSoon, not excluded
  const activeModels = allModels.filter(
    m => m.displayInNavigation && !m.comingSoonModel && !m.isExcluded
  )
  console.log(`  Found ${allModels.length} total, ${activeModels.length} active models`)

  // ── 2. Upsert vehicle_models ──
  const modelRows = activeModels.map(m => ({
    oem_id: OEM_ID,
    slug: m.fields.slug.replace(/^\/|\/$/g, ''),
    name: m.displayName || m.name,
    body_type: deriveBodyType(m.modelsCategories || [], null),
    category: (m.modelsCategories || []).map(c => c.name?.toLowerCase()).join(', '),
    is_active: true,
    source_url: `${BASE}/vehicles/${m.fields.slug.replace(/^\/|\/$/g, '')}/`,
    meta_json: {
      source: 'renault_page_data',
      remote_id: m.remoteId,
      tagline: m.tagline || null,
      categories: (m.modelsCategories || []).map(c => c.name),
    },
  }))

  console.log(`\nUpserting ${modelRows.length} vehicle models...`)
  const { data: modelData, error: modelErr } = await supabase
    .from('vehicle_models')
    .upsert(modelRows, { onConflict: 'oem_id,slug', ignoreDuplicates: false })
    .select('id, slug, name')
  if (modelErr) { console.error('Model upsert error:', modelErr.message); process.exit(1) }
  console.log(`  Upserted ${modelData.length} models`)

  // Build lookup
  const modelLookup = {}
  for (const m of modelData) modelLookup[m.slug] = m.id

  // ── 3. Delete old products for clean re-seed ──
  const { data: oldProducts } = await supabase
    .from('products')
    .select('id')
    .eq('oem_id', OEM_ID)
  if (oldProducts?.length) {
    const oldIds = oldProducts.map(p => p.id)
    await supabase.from('variant_colors').delete().in('product_id', oldIds)
    await supabase.from('variant_pricing').delete().in('product_id', oldIds)
    await supabase.from('products').delete().eq('oem_id', OEM_ID)
    console.log(`\nDeleted ${oldProducts.length} old products + related data`)
  }

  // ── 4. Fetch each model detail → products + colors ──
  console.log('\nFetching model details...')

  let totalProducts = 0
  let totalColors = 0
  let totalPricing = 0

  for (const model of activeModels) {
    const slug = model.fields.slug.replace(/^\/|\/$/g, '')
    console.log(`\n  ${model.displayName || model.name} (${slug})...`)

    let detail
    try {
      const detailData = await fetchPageData(`vehicles/${slug}`)
      detail = detailData.allCmsVehicleModelLean.nodes[0]
    } catch (err) {
      console.log(`    SKIP: ${err.message}`)
      continue
    }

    const bodyType = deriveBodyType(
      model.modelsCategories || [],
      detail.vehicleClassification
    )
    const brochureUrl = detail.brochure?.url || null

    // Iterate modelsVariants → trims
    const variants = detail.modelsVariants || []
    console.log(`    ${variants.length} variant groups`)

    for (const variant of variants) {
      const trims = variant.trims || []
      for (const trim of trims) {
        const variantName = variant.name
        const trimName = trim.name
        const title = `${model.displayName || model.name} ${variantName}`
        const extKey = `renault-${slug}-${slugify(variantName)}-${slugify(trimName)}`

        // Build specs_json from trim fields
        const specs = {}
        if (trim.fuel) specs.fuel_type = trim.fuel
        if (trim.transmission) specs.transmission = trim.transmission
        if (trim.driveTrain) specs.drive_train = trim.driveTrain
        if (trim.engineCapacity) specs.engine_capacity_cc = trim.engineCapacity
        if (trim.noOfCylinders) specs.cylinders = trim.noOfCylinders
        if (trim.fuelConsumption) specs.fuel_consumption_l100km = trim.fuelConsumption
        if (trim.co2Emissions) specs.co2_emissions_gkm = trim.co2Emissions
        if (trim.seats) specs.seats = trim.seats
        if (trim.gvm) specs.gvm_kg = trim.gvm
        if (trim.gcm) specs.gcm_kg = trim.gcm
        if (trim.payload) specs.payload_kg = trim.payload
        if (trim.tareWeight) specs.tare_weight_kg = trim.tareWeight

        // CTA links
        const ctaLinks = []
        if (brochureUrl) ctaLinks.push({ label: 'Brochure', url: brochureUrl, type: 'brochure' })

        // Hero image from trim
        const heroUrl = trim.image?.srcWebp || trim.image?.srcFallback || null

        // Product row
        const productRow = {
          oem_id: OEM_ID,
          external_key: extKey,
          source_url: `${BASE}/vehicles/${slug}/`,
          title,
          subtitle: trimName,
          body_type: bodyType,
          fuel_type: trim.fuel || null,
          price_amount: trim.price || null,
          price_currency: 'AUD',
          price_type: trim.price ? 'msrp' : null,
          variant_name: variantName,
          variant_code: slugify(variantName),
          model_id: modelLookup[slug] || null,
          transmission: trim.transmission || null,
          drivetrain: trim.driveTrain || null,
          engine_desc: trim.name || null,
          seats: trim.seats || null,
          specs_json: specs,
          cta_links: ctaLinks.length ? ctaLinks : null,
          meta_json: {
            source: 'renault_page_data',
            trim_id: trim.id,
            hero_image_url: heroUrl,
            drive_away_price: trim.driveAwayPrice || null,
            dealer_delivery_fee: trim.dealerDeliveryFee || null,
            feature_text: trim.text || null,
          },
          last_seen_at: now,
        }

        // Insert product
        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .insert(productRow)
          .select('id, title')
        if (prodErr) {
          console.log(`    ERR product ${title}: ${prodErr.message}`)
          continue
        }

        const productId = prodData[0].id
        totalProducts++
        const priceLine = trim.price ? `$${trim.price.toLocaleString()}` : 'no price'
        console.log(`    ${variantName} / ${trimName}: ${priceLine}`)

        // ── Variant pricing ──
        if (trim.price) {
          const pricingRow = {
            product_id: productId,
            price_type: 'standard',
            rrp: trim.price,
            fetched_at: now,
          }
          if (trim.driveAwayPrice && trim.driveAwayPrice > 0) {
            // Store drive-away in all state columns (uniform for Renault)
            pricingRow.driveaway_nsw = trim.driveAwayPrice
            pricingRow.driveaway_vic = trim.driveAwayPrice
            pricingRow.driveaway_qld = trim.driveAwayPrice
            pricingRow.driveaway_sa = trim.driveAwayPrice
            pricingRow.driveaway_wa = trim.driveAwayPrice
            pricingRow.driveaway_tas = trim.driveAwayPrice
            pricingRow.driveaway_act = trim.driveAwayPrice
            pricingRow.driveaway_nt = trim.driveAwayPrice
          }
          const { error: prErr } = await supabase
            .from('variant_pricing')
            .upsert(pricingRow, { onConflict: 'product_id,price_type' })
          if (!prErr) totalPricing++
        }

        // ── Exterior colors ──
        const extColors = trim.trimsExteriorsColours || []
        for (let ci = 0; ci < extColors.length; ci++) {
          const c = extColors[ci]
          const colorCode = slugify(c.name)
          const colorRow = {
            product_id: productId,
            color_code: colorCode,
            color_name: c.name,
            color_type: c.trimsExteriorsColoursCategory?.name || 'Standard',
            is_standard: (c.price || 0) === 0,
            price_delta: c.price || 0,
            swatch_url: c.swatchImage?.srcFallback || null,
            hero_image_url: c.standardImage?.srcWebp || c.standardImage?.srcFallback || null,
            sort_order: ci,
          }
          const { error: cErr } = await supabase
            .from('variant_colors')
            .upsert(colorRow, { onConflict: 'product_id,color_code' })
          if (!cErr) totalColors++
        }
      }
    }
  }

  // ── 5. Fetch and seed offers ──
  console.log('\n\nFetching special offers...')
  let totalOffers = 0

  // Delete old offers for clean re-seed
  await supabase.from('offers').delete().eq('oem_id', OEM_ID)

  try {
    const offersData = await fetchPageData('special-offers')
    const specials = offersData.allCmsSpecial.nodes || []
    console.log(`  Found ${specials.length} offers`)

    for (const s of specials) {
      // Derive model slug from linkUrl (e.g. "vehicles/duster/" → "duster")
      const linkSlug = (s.linkUrl || '').replace(/^\/?(vehicles\/)?/, '').replace(/\/$/, '') || null

      const offerRow = {
        oem_id: OEM_ID,
        title: s.heading,
        offer_type: mapOfferType(s.category),
        price_amount: s.price || null,
        description: (s.shortContent || '').replace(/<[^>]+>/g, '').trim() || null,
        disclaimer_text: (s.contentDisclaimer || '').replace(/<[^>]+>/g, '').trim() || null,
        disclaimer_html: s.contentDisclaimer || null,
        hero_image_r2_key: s.smallImage?.srcFallback || null,
        applicable_models: linkSlug ? [linkSlug] : [],
        source_url: `${BASE}/special-offers/`,
        cta_url: s.linkUrl ? `${BASE}/${s.linkUrl.replace(/^\//, '')}` : null,
        last_seen_at: now,
        external_key: `renault-offer-${s.remoteId}`,
      }

      const { error } = await supabase.from('offers').insert(offerRow)
      if (error) {
        console.log(`    ERR offer "${s.heading}": ${error.message}`)
      } else {
        totalOffers++
        console.log(`    ${s.heading}: ${s.category} ${s.price ? '$' + s.price.toLocaleString() : ''}`)
      }
    }
  } catch (err) {
    console.error('Offers error:', err.message)
  }

  // ── Summary ──
  console.log('\n=== RENAULT SEED COMPLETE ===')
  console.log(`  Models:   ${modelData.length}`)
  console.log(`  Products: ${totalProducts}`)
  console.log(`  Colors:   ${totalColors}`)
  console.log(`  Pricing:  ${totalPricing}`)
  console.log(`  Offers:   ${totalOffers}`)
}

seed().catch(err => { console.error(err); process.exit(1) })
