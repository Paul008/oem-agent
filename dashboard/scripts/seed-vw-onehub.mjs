#!/usr/bin/env node
/**
 * Seed Volkswagen AU from OneHub Offers API.
 * Returns ALL variants with colors (4-angle renders), pricing (MRDP driveaway + MRRP),
 * brochures, features, hero images, and banners.
 *
 * API: https://www.volkswagen.com.au/app/locals/get-onehub-offers
 * No auth required. Version parameter auto-increments until valid.
 *
 * Run: node dashboard/scripts/seed-vw-onehub.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const OEM_ID = 'volkswagen-au'
const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt']
const BASE_URL = 'https://www.volkswagen.com.au'

function allStates(a) { const r = {}; for (const s of STATES) r[`driveaway_${s}`] = a; return r }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }

function deriveColorType(name) {
  const l = name.toLowerCase()
  if (l.includes('pearl')) return 'pearl'
  if (l.includes('metallic')) return 'metallic'
  if (l.includes('matte')) return 'matte'
  return 'solid'
}

function deriveFuelType(payload) {
  const ft = (payload.fuel_type || '').toLowerCase()
  if (ft.includes('electric') || ft.includes('ev')) return 'electric'
  if (ft.includes('diesel')) return 'diesel'
  if (ft.includes('hybrid')) return 'hybrid'
  return 'petrol'
}

function deriveBodyType(payload) {
  const bs = (payload.body_shape || '').toLowerCase()
  if (bs.includes('suv') || bs.includes('wagon')) return 'suv'
  if (bs.includes('sedan')) return 'sedan'
  if (bs.includes('hatch')) return 'hatch'
  if (bs.includes('ute') || bs.includes('pick')) return 'ute'
  if (bs.includes('van')) return 'van'
  return 'suv'
}

// ============================================================================
// Fetch OneHub API
// ============================================================================

async function fetchOneHub(startVersion = 547) {
  let version = startVersion
  for (let i = 0; i < 100; i++) {
    const url = `${BASE_URL}/app/locals/get-onehub-offers?size=200&offset=0&sort=Price+(Low+-+High)&dealer=30140&version=${version}&seperator=:`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === 'success' && data.data?.length) {
      console.log(`OneHub version ${version}: ${data.data.length} variants`)
      return data.data
    }
    version++
  }
  throw new Error('No valid OneHub version found')
}

// ============================================================================
// Main
// ============================================================================

async function seed() {
  console.log('=== Volkswagen AU Full Seed (OneHub API) ===\n')

  const offers = await fetchOneHub()

  // Load vehicle_models
  const { data: dbModels } = await supabase
    .from('vehicle_models').select('id, slug, name').eq('oem_id', OEM_ID)
  const modelMap = Object.fromEntries(dbModels.map(m => [m.slug, m]))

  // Delete old data
  const { data: oldProducts } = await supabase.from('products').select('id').eq('oem_id', OEM_ID)
  if (oldProducts?.length) {
    const ids = oldProducts.map(p => p.id)
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      await supabase.from('variant_colors').delete().in('product_id', batch)
      await supabase.from('variant_pricing').delete().in('product_id', batch)
    }
    await supabase.from('products').delete().eq('oem_id', OEM_ID)
    console.log(`Deleted ${oldProducts.length} old products\n`)
  }
  await supabase.from('offers').delete().eq('oem_id', OEM_ID)
  await supabase.from('banners').delete().eq('oem_id', OEM_ID)

  let totalProducts = 0, totalColors = 0, totalPricing = 0, totalOffers = 0, totalBanners = 0
  const seenModels = new Set()
  const brochures = new Map()

  for (const offer of offers) {
    const p = offer.payload
    if (!p || !p.model_name) continue

    const modelSlug = slugify(p.model_family || p.model_name)
    const variantName = p.varient_name || p.variant_name || ''
    const externalKey = `${OEM_ID}-${offer.model_code}`
    const driveaway = parseInt(offer.mrdp) || null
    const rrp = parseInt(offer.mrrp) || null

    // Ensure vehicle_model exists
    if (!modelMap[modelSlug]) {
      const { data: newModel } = await supabase
        .from('vehicle_models')
        .upsert({
          oem_id: OEM_ID,
          slug: modelSlug,
          name: p.model_family || p.model_name,
          source_url: `${BASE_URL}/en/models/${modelSlug}.html`,
        }, { onConflict: 'oem_id,slug' })
        .select('id, slug, name')
        .single()
      if (newModel) modelMap[modelSlug] = newModel
    }

    const model = modelMap[modelSlug]
    if (!model) continue

    // Store brochure URL
    if (p.brochure_info?.brochure_file_url) {
      brochures.set(modelSlug, p.brochure_info.brochure_file_url)
    }

    // Insert product
    const product = {
      oem_id: OEM_ID,
      external_key: externalKey,
      source_url: `${BASE_URL}/en/models/${modelSlug}.html`,
      title: `${p.model_name} ${variantName}`.trim(),
      subtitle: variantName,
      body_type: deriveBodyType(p),
      fuel_type: deriveFuelType(p),
      availability: 'available',
      price_amount: driveaway || rrp,
      price_currency: 'AUD',
      price_type: 'driveaway',
      price_qualifier: 'Manufacturer recommended driveaway price',
      model_id: model.id,
      variant_code: offer.model_code,
      variant_name: variantName,
      engine_size: p.engine_capacity || null,
      transmission: p.transmission_desc || p.transmission || null,
      drive: p.driven_wheels || null,
      key_features: p.features || [],
      specs_json: {
        engine: {
          description: p.engine_capacity,
          power_kw: p.engine_power ? parseInt(p.engine_power) : null,
          type: p.fuel_type,
        },
        transmission: {
          type: p.transmission_desc || p.transmission,
          drive: p.driven_wheels,
        },
      },
      meta_json: {
        model_code: offer.model_code,
        model_year: p.model_year,
        salesgroup_key: p.salesgroupkey,
        carline_key: p.carlinekey,
        body_shape: p.body_shape,
        configurator_code: p.car_configurator_model_code,
      },
      last_seen_at: new Date().toISOString(),
    }

    const { data: inserted, error: prodErr } = await supabase
      .from('products').insert(product).select('id').single()
    if (prodErr) { console.log(`ERR product ${product.title}: ${prodErr.message}`); continue }
    totalProducts++

    // Insert variant_pricing
    if (driveaway) {
      await supabase.from('variant_pricing').upsert({
        product_id: inserted.id, price_type: 'standard',
        rrp, ...allStates(driveaway),
      }, { onConflict: 'product_id,price_type' })
      totalPricing++
    }

    // Insert variant_colors
    const colours = p.colours || {}
    let sortOrder = 0
    for (const [prcode, color] of Object.entries(colours)) {
      const heroUrl = color.images?.front || color.images?.right || null
      const swatchUrl = color.colour_tile || null
      const galleryUrls = [color.images?.front, color.images?.right, color.images?.back, color.images?.left].filter(Boolean)

      await supabase.from('variant_colors').upsert({
        product_id: inserted.id,
        color_code: prcode.replace(/\s/g, '-'),
        color_name: color.name || color.color,
        color_type: deriveColorType(color.name || ''),
        is_standard: color.is_default || parseInt(color.price) === 0,
        price_delta: parseInt(color.price) || 0,
        swatch_url: swatchUrl,
        hero_image_url: heroUrl,
        gallery_urls: galleryUrls,
        sort_order: sortOrder++,
      }, { onConflict: 'product_id,color_code' })
      totalColors++
    }

    // Track model for banner
    if (!seenModels.has(modelSlug) && p.hero_image?.listing) {
      seenModels.add(modelSlug)
    }

    // Insert offer if banner data exists
    if (p.banner?.banner_heading && !seenModels.has(`offer-${modelSlug}-${variantName}`)) {
      seenModels.add(`offer-${modelSlug}-${variantName}`)
      const offerTitle = `${p.model_name} ${variantName} — ${p.banner.banner_heading}`
      await supabase.from('offers').insert({
        oem_id: OEM_ID,
        title: offerTitle,
        offer_type: 'driveaway_deal',
        price_amount: driveaway,
        hero_image_url: p.hero_image?.detail || p.hero_image?.listing || null,
        applicable_models: [p.model_family || p.model_name],
        source_url: `${BASE_URL}/en/models/${modelSlug}.html`,
        last_seen_at: new Date().toISOString(),
      })
      totalOffers++
    }
  }

  // Update brochure URLs on vehicle_models
  for (const [slug, url] of brochures) {
    await supabase.from('vehicle_models').update({ brochure_url: url }).eq('oem_id', OEM_ID).eq('slug', slug)
  }
  console.log(`Brochures: ${brochures.size} models updated`)

  // Create homepage banners from first variant per model family
  const seenFamilies = new Set()
  for (const offer of offers) {
    const p = offer.payload
    if (!p?.model_family || seenFamilies.has(p.model_family)) continue
    seenFamilies.add(p.model_family)

    const heroImg = p.hero_image?.listing || p.hero_image?.detail
    if (!heroImg) continue

    await supabase.from('banners').insert({
      oem_id: OEM_ID,
      page_url: BASE_URL + '/',
      position: seenFamilies.size - 1,
      headline: `${p.model_family} — From $${parseInt(offer.mrdp)?.toLocaleString()} Driveaway`,
      sub_headline: p.banner?.banner_heading || '',
      cta_text: 'Configure Yours',
      cta_url: `${BASE_URL}/en/models/${slugify(p.model_family)}.html`,
      image_url_desktop: heroImg,
      last_seen_at: new Date().toISOString(),
    })
    totalBanners++
  }

  console.log(`\n=== VW AU SEED COMPLETE ===`)
  console.log(`Products: ${totalProducts}`)
  console.log(`Colors:   ${totalColors}`)
  console.log(`Pricing:  ${totalPricing}`)
  console.log(`Offers:   ${totalOffers}`)
  console.log(`Banners:  ${totalBanners}`)
  console.log(`Brochures: ${brochures.size}`)
}

seed().catch(err => { console.error(err); process.exit(1) })
