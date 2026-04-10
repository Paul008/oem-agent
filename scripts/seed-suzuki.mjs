#!/usr/bin/env node
/**
 * One-shot Suzuki Australia refresh.
 *
 * Mirrors src/sync/suzuki-sync.ts (same logic, reimplemented in plain JS so
 * we can run it outside the Cloudflare Worker with the service role key).
 * Data source: https://www.suzuki.com.au/suzuki-finance-calculator-data.json
 *
 * Usage:
 *   node scripts/seed-suzuki.mjs
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env (auto-loaded).
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Load .env ──
try {
  const env = readFileSync('.env', 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, KEY)
const OEM_ID = 'suzuki-au'
const API_URL = 'https://www.suzuki.com.au/suzuki-finance-calculator-data.json'
const now = new Date().toISOString()

const MODEL_NAME_MAP = {
  'Swift Hybrid': 'Swift Hybrid',
  'Swift Sport': 'Swift Sport',
  'Ignis': 'Ignis',
  'Fronx Hybrid': 'Fronx Hybrid',
  'Vitara Hybrid': 'Vitara',
  'S-CROSS': 'S-CROSS',
  'Jimny': 'Jimny',
}

// ── Helpers ──

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function hexSwatchDataUrl(hex, secondHex) {
  const h1 = hex.replace('#', '%23')
  if (secondHex && secondHex !== hex) {
    const h2 = secondHex.replace('#', '%23')
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>` +
      `<defs><clipPath id='c'><circle cx='20' cy='20' r='20'/></clipPath></defs>` +
      `<g clip-path='url(%23c)'>` +
      `<rect width='40' height='20' fill='${h1}'/>` +
      `<rect y='20' width='40' height='20' fill='${h2}'/>` +
      `</g></svg>`
    return `data:image/svg+xml;utf8,${svg}`
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>` +
    `<circle cx='20' cy='20' r='20' fill='${h1}'/>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${svg}`
}

function normalizeColorType(type, twoToned) {
  if (twoToned) return 'two-tone'
  const t = (type || '').toLowerCase()
  if (t.includes('pearl')) return 'pearl'
  if (t.includes('matte') || t.includes('matt')) return 'matte'
  if (t.includes('metallic') || t.includes('premium')) return 'metallic'
  return 'solid'
}

function averageExtraCost(extra) {
  if (!extra) return 0
  const vals = Object.values(extra).filter((v) => typeof v === 'number')
  if (!vals.length) return 0
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function parseFeatures(html) {
  if (!html) return []
  return Array.from(html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

// Parse natural-language feature bullets into the canonical specs_json shape
// (matches src/sync/suzuki-sync.ts buildSpecsJson — keep them in sync).
function buildSpecsJson(features, _variant) {
  const engine = {}, transmission = {}, performance = {}, safety = {}, multimedia = {}, wheels = {}, convenience = {}

  for (const raw of features) {
    const f = raw.replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ').trim()
    const l = f.toLowerCase()

    // Engine
    const eng = l.match(/(\d+(?:\.\d+)?)\s*l(?:itre)?\b\s*(turbo\s+hybrid|hybrid|turbo|petrol|diesel)?\s*engine/)
    if (eng) {
      engine.displacement_l = parseFloat(eng[1])
      if (eng[2]) engine.type = eng[2].split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
      continue
    }

    // Transmission: skip — resolved per-product in resolveTransmission()
    if (/(\d+)-speed|cvt|transmission/.test(l)) continue

    // Fuel economy
    const fe = l.match(/(\d+(?:\.\d+)?)\s*l\/100\s*km\s*fuel\s*economy(?:\s+(manual|automatic|combined))?/)
    if (fe) {
      const trans2 = fe[2] || 'combined'
      performance[`fuel_economy_${trans2}_l_100km`] = parseFloat(fe[1])
      continue
    }

    // Power / torque
    const power = l.match(/(\d+)\s*kw\b/)
    if (power && /power|engine/.test(l)) { performance.power_kw = parseInt(power[1], 10); continue }
    const torque = l.match(/(\d+)\s*nm\b/)
    if (torque && /torque/.test(l)) { performance.torque_nm = parseInt(torque[1], 10); continue }

    // Airbags
    const airbagsNumeric = l.match(/(\d+)\s*(?:srs\s+)?airbags?/)
    if (airbagsNumeric) { safety.airbags = parseInt(airbagsNumeric[1], 10); continue }
    const airbagsWord = l.match(/\b(two|three|four|five|six|seven|eight|nine|ten)\s+airbags?/)
    if (airbagsWord) {
      const map = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
      safety.airbags = map[airbagsWord[1]]
      continue
    }

    // Safety boolean features
    if (/reverse\s+camera|rear\s*view\s*camera/.test(l)) { safety.reverse_camera = true; continue }
    if (/rear\s+parking\s+sensors?/.test(l))             { safety.rear_parking_sensors = true; continue }
    if (/front\s+parking\s+sensors?/.test(l))            { safety.front_parking_sensors = true; continue }
    if (/blind\s*spot/.test(l))                          { safety.blind_spot_monitor = true; continue }
    if (/lane\s+(?:keep|departure|assist)/.test(l))      { safety.lane_assist = true; continue }
    if (/autonomous\s+emergency\s+braking|\baeb\b/.test(l)) { safety.aeb = true; continue }
    if (/traffic\s+sign\s+recognition/.test(l))          { safety.traffic_sign_recognition = true; continue }
    if (/adaptive\s+cruise/.test(l))                     { safety.adaptive_cruise = true; continue }
    else if (/cruise\s+control/.test(l))                 { safety.cruise_control = true; continue }
    if (/esc|electronic\s+stability/.test(l))            { safety.esc = true; continue }
    if (/abs(?!\w)|anti.?lock\s+brak/.test(l))           { safety.abs = true; continue }
    if (/security\s+alarm/.test(l))                      { safety.security_alarm = true; continue }
    if (/360.{0,5}(?:degree|°|view)\s*camera/.test(l))   { safety.surround_view_camera = true; continue }

    // Multimedia
    const screen = l.match(/(\d+(?:\.\d+)?)[-\s]*(?:inch|"|″)\s*(?:colour\s+)?(?:multimedia\s+)?touchscreen/)
    if (screen) { multimedia.touchscreen_inches = parseFloat(screen[1]); continue }
    if (/dab\b|dab\+|digital\s+radio/.test(l))    { multimedia.dab_radio = true; continue }
    if (/wireless\s+apple\s+carplay/.test(l))     { multimedia.apple_carplay = 'wireless'; continue }
    if (/apple\s+carplay/.test(l))                { multimedia.apple_carplay = 'wired'; continue }
    if (/wireless\s+android\s+auto/.test(l))      { multimedia.android_auto = 'wireless'; continue }
    if (/android\s+auto/.test(l))                 { multimedia.android_auto = 'wired'; continue }
    if (/bluetooth/.test(l))                      { multimedia.bluetooth = true; continue }
    const speakers = l.match(/(\d+)\s*(?:x\s*)?speakers?/)
    if (speakers) { multimedia.speakers = parseInt(speakers[1], 10); continue }

    // Wheels
    const wheel = l.match(/(\d+(?:\.\d+)?)\s*(?:inch|"|″|''|&#8243;|in)\s*(?:black\s+|machined\s+|two-tone\s+)*(alloy|steel)?\s*wheels?/)
    if (wheel) {
      wheels.diameter_inches = parseFloat(wheel[1])
      if (wheel[2]) wheels.type = wheel[2][0].toUpperCase() + wheel[2].slice(1)
      continue
    }

    // Convenience
    if (/keyless\s+(?:entry|start|access)/.test(l)) { convenience.keyless = true; continue }
    if (/climate\s+control/.test(l))                { convenience.climate_control = true; continue }
    if (/heated\s+seats?/.test(l))                  { convenience.heated_seats = true; continue }
    if (/leather(?:-covered)?\s+(?:steering|seats?)/.test(l)) { convenience.leather = true; continue }
    if (/sunroof|moonroof/.test(l))                 { convenience.sunroof = true; continue }
    if (/led\s+head/.test(l))                       { convenience.led_headlights = true; continue }
    if (/heated\s+(?:door\s+)?mirrors?/.test(l))    { convenience.heated_mirrors = true; continue }
    if (/digital\s+speedo|digital\s+instrument/.test(l)) { convenience.digital_speedo = true; continue }
    if (/stop[-\s]start\b/.test(l))                 { convenience.stop_start = true; continue }
  }

  const out = {}
  if (Object.keys(engine).length) out.engine = engine
  if (Object.keys(transmission).length) out.transmission = transmission
  if (Object.keys(performance).length) out.performance = performance
  if (Object.keys(safety).length) out.safety = safety
  if (Object.keys(multimedia).length) out.multimedia = multimedia
  if (Object.keys(wheels).length) out.wheels = wheels
  if (Object.keys(convenience).length) out.convenience = convenience
  return out
}

// Resolve transmission specs for a SPECIFIC product (auto or manual) by
// scanning the inherited feature bullets. Suzuki packs both transmissions
// into a single bullet ("5-speed manual or 4-speed automatic transmission").
function resolveTransmission(features, want) {
  for (const raw of features) {
    const l = raw.replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    // Pattern A: dual transmissions in one bullet
    const dual = l.match(/(\d+)-speed\s+(manual|automatic|cvt)\s+(?:or|and)\s+(\d+)-speed\s+(manual|automatic|cvt)/)
    if (dual) {
      const left  = { gears: parseInt(dual[1], 10), type: dual[2] }
      const right = { gears: parseInt(dual[3], 10), type: dual[4] }
      const pick = left.type === want ? left : right.type === want ? right : null
      if (pick) return { gears: pick.gears, type: pick.type === 'cvt' ? 'CVT' : (pick.type[0].toUpperCase() + pick.type.slice(1)) }
    }
    // Pattern B: "5-speed manual or automatic CVT transmission"
    const mixed = l.match(/(\d+)-speed\s+(manual|automatic)\s+or\s+(automatic|manual)\s+(cvt|automatic|manual)/)
    if (mixed) {
      if (mixed[2] === want) return { gears: parseInt(mixed[1], 10), type: mixed[2][0].toUpperCase() + mixed[2].slice(1) }
      if (want === 'automatic' && /cvt/.test(mixed[4])) return { type: 'Automatic CVT' }
    }
    // Pattern C: single transmission with gear count
    const single = l.match(/(\d+)-speed\s+(manual|automatic|cvt)/)
    if (single && single[2] === want) {
      return { gears: parseInt(single[1], 10), type: single[2] === 'cvt' ? 'CVT' : (single[2][0].toUpperCase() + single[2].slice(1)) }
    }
    // Pattern D: type-only bullets
    if (want === 'automatic' && /\bautomatic\s+cvt\s+transmission\b/.test(l)) return { type: 'Automatic CVT' }
    if (want === 'automatic' && /\bautomatic\s+transmission\b/.test(l))      return { type: 'Automatic' }
    if (want === 'manual' && /\bmanual\s+transmission\b/.test(l))            return { type: 'Manual' }
  }
  return {}
}

function deriveTitle(variant, transmission, hasBoth) {
  const base = variant.variant.trim()
  if (!hasBoth) return base
  const suffix = transmission === 'automatic' ? 'Auto' : 'Manual'
  if (/^swift hybrid$/i.test(base)) return `Swift Hybrid GL ${suffix}`
  if (/^jimny$/i.test(base)) return `Jimny ${suffix}`
  return `${base} ${suffix}`
}

function deriveVariantName(base, model) {
  let out = base.trim()
  if (out.toLowerCase().startsWith(model.toLowerCase())) {
    out = out.slice(model.length).trim()
  }
  return out || base
}

// ── Main ──

async function seed() {
  console.log('=== Suzuki AU API sync ===\n')

  // Fetch API
  console.log(`→ Fetching ${API_URL}`)
  const res = await fetch(API_URL, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const api = await res.json()
  console.log(`  ok — ${api.models?.length ?? 0} models\n`)

  // Load vehicle_models
  const { data: existingModels, error: mErr } = await supabase
    .from('vehicle_models')
    .select('id, name, slug')
    .eq('oem_id', OEM_ID)
  if (mErr) throw mErr

  const modelByName = new Map()
  for (const m of existingModels ?? []) {
    modelByName.set(m.name.toLowerCase(), m.id)
  }
  console.log(`→ Loaded ${existingModels?.length ?? 0} existing vehicle_models`)
  for (const m of existingModels ?? []) console.log(`   • ${m.name} (${m.slug})`)
  console.log()

  const stats = {
    models_processed: 0,
    variants_processed: 0,
    products_upserted: 0,
    colors_upserted: 0,
    pricing_rows_upserted: 0,
    errors: [],
  }

  for (const apiModel of api.models ?? []) {
    stats.models_processed++
    const dbModelName = MODEL_NAME_MAP[apiModel.model] ?? apiModel.model
    const modelId = modelByName.get(dbModelName.toLowerCase()) ?? null
    if (!modelId) {
      stats.errors.push(`No vehicle_model for "${apiModel.model}" (→ "${dbModelName}")`)
    }

    console.log(`── ${apiModel.model} (id=${apiModel.modelID}, model_id=${modelId ?? 'MISSING'})`)

    // Per-model accumulator: Suzuki API only lists feature deltas on higher
    // trims. Walk variants base→top and overlay each trim's specs onto the
    // running accumulator so every product ends up with a complete sheet.
    const accumulatedSpecs = {}
    const accumulatedFeatures = []

    for (const variant of apiModel.modelVariants ?? []) {
      stats.variants_processed++
      const firstState = Object.values(variant.price ?? {})[0] ?? {}
      const transmissions = ['automatic', 'manual'].filter(
        (t) => typeof firstState[t]?.price === 'number',
      )
      if (!transmissions.length) {
        console.log(`   ⚠ ${variant.variant}: no priced transmissions, skipping`)
        continue
      }
      const hasBoth = transmissions.length === 2
      const featuresList = parseFeatures(variant.features)
      const ownSpecs = buildSpecsJson(featuresList, variant)

      // Merge own specs onto accumulator (own values overwrite inherited ones)
      for (const [section, fields] of Object.entries(ownSpecs)) {
        accumulatedSpecs[section] = { ...(accumulatedSpecs[section] ?? {}), ...fields }
      }
      for (const f of featuresList) if (!accumulatedFeatures.includes(f)) accumulatedFeatures.push(f)

      // Snapshot merged spec sheet for THIS variant (deep clone)
      const specsJson = {}
      for (const [section, fields] of Object.entries(accumulatedSpecs)) {
        specsJson[section] = { ...fields }
      }

      for (const trans of transmissions) {
        const externalKey = `suzuki-${variant.variantID}-${trans}`
        const title = deriveTitle(variant, trans, hasBoth)
        const variantName = deriveVariantName(variant.variant, apiModel.model)
        const stateOrder = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']
        let displayPrice = null
        for (const st of stateOrder) {
          const p = variant.price?.[st]?.[trans]?.price
          if (typeof p === 'number') {
            displayPrice = p
            break
          }
        }

        const bodyType = /suv|cross|fronx|vitara|jimny/i.test(apiModel.model) ? 'SUV' : 'Hatch'
        const fuelType =
          /hybrid/i.test(apiModel.model) || /hybrid/i.test(variant.variant) ? 'Hybrid' : 'Petrol'

        // Per-product transmission spec resolution (auto vs manual differ
        // when the API packs both into one bullet, e.g. Jimny "5-speed manual
        // or 4-speed automatic transmission"). Clone the snapshot first so we
        // don't pollute siblings.
        const perProductSpecs = {}
        for (const [section, fields] of Object.entries(specsJson)) {
          perProductSpecs[section] = { ...fields }
        }
        const transSpec = resolveTransmission(accumulatedFeatures, trans)
        if (Object.keys(transSpec).length) {
          perProductSpecs.transmission = { ...(perProductSpecs.transmission ?? {}), ...transSpec }
        } else {
          perProductSpecs.transmission = { type: trans === 'automatic' ? 'Automatic' : 'Manual' }
        }

        const productRow = {
          oem_id: OEM_ID,
          external_key: externalKey,
          title,
          variant_name: variantName,
          variant_code: `${variant.variantID}-${trans}`,
          price_amount: displayPrice,
          price_type: 'driveaway',
          price_qualifier: 'Drive away estimate',
          body_type: bodyType,
          fuel_type: fuelType,
          transmission: trans === 'automatic' ? 'Automatic' : 'Manual',
          model_id: modelId,
          specs_json: perProductSpecs,
          meta_json: {
            source: 'suzuki-finance-calculator-data.json',
            has_gfv: !variant.hideGFV,
            model_id: apiModel.modelID,
            variant_id: variant.variantID,
            transmission: trans,
          },
          key_features: [...accumulatedFeatures],
          last_seen_at: now,
        }

        // Query existing by (oem_id, external_key); fall back to (oem_id, title)
        // so re-IDed variants (new MY) update in place instead of duplicating.
        let existing = null
        const { data: byKey } = await supabase
          .from('products')
          .select('id')
          .eq('oem_id', OEM_ID)
          .eq('external_key', externalKey)
          .maybeSingle()
        if (byKey) {
          existing = byKey
        } else {
          const { data: byTitle } = await supabase
            .from('products')
            .select('id')
            .eq('oem_id', OEM_ID)
            .eq('title', title)
            .maybeSingle()
          if (byTitle) existing = byTitle
        }

        let productId
        if (existing) {
          const { error: uErr } = await supabase
            .from('products')
            .update(productRow)
            .eq('id', existing.id)
          if (uErr) {
            stats.errors.push(`update ${externalKey}: ${uErr.message}`)
            console.log(`   ✗ ${title}: ${uErr.message}`)
            continue
          }
          productId = existing.id
        } else {
          const { data: inserted, error: iErr } = await supabase
            .from('products')
            .insert(productRow)
            .select('id')
            .single()
          if (iErr || !inserted) {
            stats.errors.push(`insert ${externalKey}: ${iErr?.message ?? 'no id'}`)
            console.log(`   ✗ ${title}: ${iErr?.message}`)
            continue
          }
          productId = inserted.id
        }
        stats.products_upserted++

        // Colors
        const paintColours = variant.paintColours ?? []
        if (paintColours.length) {
          const colorRows = paintColours.map((c, i) => {
            const delta = averageExtraCost(c.extraCost)
            const heroSrc = c.image?.sizes?.default?.src ?? null
            const largeSrc = c.image?.sizes?.['large-up']?.src ?? null
            return {
              product_id: productId,
              color_code: slugify(c.name),
              color_name: c.name,
              color_type: normalizeColorType(c.type, c.twoToned),
              is_standard: delta === 0,
              price_delta: delta,
              swatch_url: hexSwatchDataUrl(c.hex, c.secondHex || undefined),
              source_swatch_url: null,
              hero_image_url: heroSrc,
              source_hero_url: heroSrc,
              gallery_urls: largeSrc ? [largeSrc] : null,
              source_gallery_urls: largeSrc ? [largeSrc] : null,
              sort_order: i,
            }
          })
          const { error: cErr } = await supabase
            .from('variant_colors')
            .upsert(colorRows, { onConflict: 'product_id,color_code' })
          if (cErr) {
            stats.errors.push(`colors ${externalKey}: ${cErr.message}`)
          } else {
            stats.colors_upserted += colorRows.length
          }
        }

        // Pricing
        const pricingRow = {
          product_id: productId,
          price_type: 'standard',
          rrp: displayPrice,
          driveaway_nsw: variant.price?.NSW?.[trans]?.price ?? null,
          driveaway_vic: variant.price?.VIC?.[trans]?.price ?? null,
          driveaway_qld: variant.price?.QLD?.[trans]?.price ?? null,
          driveaway_wa: variant.price?.WA?.[trans]?.price ?? null,
          driveaway_sa: variant.price?.SA?.[trans]?.price ?? null,
          driveaway_tas: variant.price?.TAS?.[trans]?.price ?? null,
          driveaway_act: variant.price?.ACT?.[trans]?.price ?? null,
          driveaway_nt: variant.price?.NT?.[trans]?.price ?? null,
          effective_date: now.slice(0, 10),
        }
        const { error: vpErr } = await supabase
          .from('variant_pricing')
          .upsert(pricingRow, { onConflict: 'product_id,price_type' })
        if (vpErr) {
          stats.errors.push(`pricing ${externalKey}: ${vpErr.message}`)
        } else {
          stats.pricing_rows_upserted++
        }

        console.log(
          `   ✓ ${title.padEnd(32)} $${(displayPrice ?? 0).toLocaleString().padStart(7)}  ${paintColours.length} colours`,
        )
      }
    }
  }

  console.log('\n── Summary ──')
  console.log(JSON.stringify(stats, null, 2))

  if (stats.errors.length) {
    process.exitCode = 1
  }
}

seed().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
