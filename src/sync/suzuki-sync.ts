/**
 * Suzuki AU Sync
 *
 * API-first sync for Suzuki Australia. Primary source:
 *
 *   https://www.suzuki.com.au/suzuki-finance-calculator-data.json
 *
 * This single static JSON file is the authoritative source for:
 *  - 7 models × 15 variants (Swift Hybrid, Swift Sport, Ignis, Vitara, S-CROSS,
 *    Jimny, Fronx Hybrid) with per-state × per-transmission driveaway pricing
 *  - Paint colours with hex + hero image URLs per variant
 *  - Feature lists (engine, transmission, fuel economy, safety, multimedia…)
 *
 * It replaces the broken daily HTML crawl for Suzuki and doesn't require any
 * browser rendering. Registered in `discovered_apis` (reliability 0.95, verified).
 *
 * Data populated:
 *  - products          (upsert on oem_id,external_key)
 *  - variant_pricing   (upsert on product_id,price_type)
 *  - variant_colors    (upsert on product_id,color_code)
 *
 * Swatches: Suzuki's API exposes hex codes but no swatch image URLs, so we
 * synthesise a small SVG data URL per colour (single circle for solid,
 * split-circle for two-tone) and store it in `swatch_url`. The dashboard's
 * `<img>` rendering picks up data URLs automatically.
 *
 * Brochures: Suzuki does not publish brochure PDFs publicly (the site only
 * hosts a "Request a Brochure" form), so `vehicle_models.brochure_url` is
 * left untouched and PDF spec extraction is skipped for Suzuki.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const API_URL = 'https://www.suzuki.com.au/suzuki-finance-calculator-data.json';

// Map API model name → existing vehicle_models.name in DB
const MODEL_NAME_MAP: Record<string, string> = {
  'Swift Hybrid': 'Swift Hybrid',
  'Swift Sport': 'Swift Sport',
  'Ignis': 'Ignis',
  'Fronx Hybrid': 'Fronx Hybrid',
  'Vitara Hybrid': 'Vitara', // DB uses legacy name
  'S-CROSS': 'S-CROSS',
  'Jimny': 'Jimny',
};

// ============================================================================
// API Types
// ============================================================================

interface ApiImageSize {
  src: string;
  width?: number;
  height?: number;
  webp?: string;
}

interface ApiImage {
  alt?: string;
  title?: string;
  sizes?: Record<string, ApiImageSize>;
}

interface ApiPaintColour {
  name: string;
  hex: string;
  secondHex?: string;
  twoToned: boolean;
  type: string;
  extraCost: Record<string, number>;
  image?: ApiImage;
  offer?: unknown[];
  disclaimer?: string;
}

type Transmission = 'automatic' | 'manual';

interface ApiVariantPrice {
  price: number;
  futureValue?: unknown;
}

interface ApiVariant {
  variant: string;
  variantID: number;
  defaultInterestRate?: string;
  price: Record<string, Partial<Record<Transmission, ApiVariantPrice>>>;
  features?: string;
  paintColours?: ApiPaintColour[];
  modelVariantDisclaimer?: string;
  hideGFV?: boolean;
}

interface ApiModel {
  model: string;
  modelID: number;
  logo?: ApiImage;
  image?: ApiImage;
  modelVariants: ApiVariant[];
}

interface ApiResponse {
  models: ApiModel[];
}

// ============================================================================
// Helpers
// ============================================================================

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build a small SVG data URL swatch from a hex (or two hexes for two-tone). */
function hexSwatchDataUrl(hex: string, secondHex?: string): string {
  const h1 = hex.replace('#', '%23');
  if (secondHex && secondHex !== hex) {
    const h2 = secondHex.replace('#', '%23');
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>` +
      `<defs><clipPath id='c'><circle cx='20' cy='20' r='20'/></clipPath></defs>` +
      `<g clip-path='url(%23c)'>` +
      `<rect width='40' height='20' fill='${h1}'/>` +
      `<rect y='20' width='40' height='20' fill='${h2}'/>` +
      `</g></svg>`;
    return `data:image/svg+xml;utf8,${svg}`;
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>` +
    `<circle cx='20' cy='20' r='20' fill='${h1}'/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

function normalizeColorType(type: string, twoToned: boolean): string {
  if (twoToned) return 'two-tone';
  const t = (type || '').toLowerCase();
  if (t.includes('pearl')) return 'pearl';
  if (t.includes('matte') || t.includes('matt')) return 'matte';
  if (t.includes('metallic') || t.includes('premium')) return 'metallic';
  return 'solid';
}

/** Average extraCost across states. Use as a single display price_delta. */
function averageExtraCost(extra: Record<string, number> | undefined): number {
  if (!extra) return 0;
  const vals = Object.values(extra).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Parse the features HTML (e.g. `<ul><li>1.2L Hybrid engine</li>…</ul>`). */
function parseFeatures(html: string | undefined): string[] {
  if (!html) return [];
  return Array.from(html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Parse natural-language feature bullets from Suzuki's API into the canonical
 * `specs_json` shape used by other OEMs (Kia, Hyundai, etc):
 *   { engine: { type, displacement_l, … }, transmission: { type, gears, … }, … }
 *
 * The dashboard renders top-level keys as section headers and inner keys as
 * "Section.Field" labels, so the values must be scalars (string|number|bool),
 * not arrays. Unrecognised features are dropped — they live separately on
 * `products.key_features` (a top-level column) for full-text reference.
 *
 * Examples of bullets we parse:
 *   "1.2L Hybrid engine"                → engine.displacement_l=1.2, engine.type="Hybrid"
 *   "5-speed manual or automatic CVT transmission" → transmission.gears=5, transmission.type="Manual / CVT Auto"
 *   "3.8L/100km fuel economy manual^"   → performance.fuel_economy_manual_l_100km=3.8
 *   "9-inch multimedia touchscreen with DAB radio" → multimedia.touchscreen_inches=9, multimedia.dab_radio=true
 *   "6 airbags"                         → safety.airbags=6
 *   "16″ Black alloy wheels"            → wheels.diameter_inches=16, wheels.type="Alloy"
 */
function buildSpecsJson(features: string[], _variant: ApiVariant): Record<string, unknown> {
  const engine: Record<string, unknown> = {};
  const transmission: Record<string, unknown> = {};
  const performance: Record<string, unknown> = {};
  const safety: Record<string, unknown> = {};
  const multimedia: Record<string, unknown> = {};
  const wheels: Record<string, unknown> = {};
  const convenience: Record<string, unknown> = {};

  for (const raw of features) {
    const f = raw.replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
    const l = f.toLowerCase();

    // ── Engine: "1.2L Hybrid engine", "1.5L Turbo Hybrid engine"
    const eng = l.match(/(\d+(?:\.\d+)?)\s*l(?:itre)?\b\s*(turbo\s+hybrid|hybrid|turbo|petrol|diesel)?\s*engine/);
    if (eng) {
      engine.displacement_l = parseFloat(eng[1]);
      if (eng[2]) {
        engine.type = eng[2].split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
      }
      continue;
    }

    // ── Transmission: skip — resolved per-product in resolveTransmission()
    //   based on the actual `trans` value (automatic|manual). Bullet examples:
    //   "5-speed manual transmission"
    //   "5-speed manual or 4-speed automatic transmission"
    //   "5-speed manual or automatic CVT transmission"
    //   "automatic CVT transmission"
    //   "6-speed automatic with paddle shifters"
    if (/(\d+)-speed|cvt|transmission/.test(l)) continue;

    // ── Fuel economy: "3.8L/100km fuel economy manual", "4.0L/100km fuel economy automatic"
    const fe = l.match(/(\d+(?:\.\d+)?)\s*l\/100\s*km\s*fuel\s*economy(?:\s+(manual|automatic|combined))?/);
    if (fe) {
      const trans2 = fe[2] || 'combined';
      performance[`fuel_economy_${trans2}_l_100km`] = parseFloat(fe[1]);
      continue;
    }

    // ── Power: "108kW", "147 kW power"
    const power = l.match(/(\d+)\s*kw\b/);
    if (power && /power|engine/.test(l)) {
      performance.power_kw = parseInt(power[1], 10);
      continue;
    }

    // ── Torque: "235Nm", "250 Nm torque"
    const torque = l.match(/(\d+)\s*nm\b/);
    if (torque && /torque/.test(l)) {
      performance.torque_nm = parseInt(torque[1], 10);
      continue;
    }

    // ── Airbags: "6 airbags", "Six airbags", "8 SRS airbags"
    const airbagsNumeric = l.match(/(\d+)\s*(?:srs\s+)?airbags?/);
    if (airbagsNumeric) {
      safety.airbags = parseInt(airbagsNumeric[1], 10);
      continue;
    }
    const airbagsWord = l.match(/\b(two|three|four|five|six|seven|eight|nine|ten)\s+airbags?/);
    if (airbagsWord) {
      const map: Record<string, number> = {
        two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      };
      safety.airbags = map[airbagsWord[1]];
      continue;
    }

    // ── Safety boolean features
    if (/reverse\s+camera|rear\s*view\s*camera/.test(l)) { safety.reverse_camera = true; continue; }
    if (/rear\s+parking\s+sensors?/.test(l))             { safety.rear_parking_sensors = true; continue; }
    if (/front\s+parking\s+sensors?/.test(l))            { safety.front_parking_sensors = true; continue; }
    if (/blind\s*spot/.test(l))                          { safety.blind_spot_monitor = true; continue; }
    if (/lane\s+(?:keep|departure|assist)/.test(l))      { safety.lane_assist = true; continue; }
    if (/autonomous\s+emergency\s+braking|\baeb\b/.test(l)) { safety.aeb = true; continue; }
    if (/traffic\s+sign\s+recognition/.test(l))          { safety.traffic_sign_recognition = true; continue; }
    if (/adaptive\s+cruise/.test(l))                     { safety.adaptive_cruise = true; continue; }
    else if (/cruise\s+control/.test(l))                 { safety.cruise_control = true; continue; }
    if (/esc|electronic\s+stability/.test(l))            { safety.esc = true; continue; }
    if (/abs(?!\w)|anti.?lock\s+brak/.test(l))           { safety.abs = true; continue; }
    if (/security\s+alarm/.test(l))                      { safety.security_alarm = true; continue; }
    if (/360.{0,5}(?:degree|°|view)\s*camera/.test(l))   { safety.surround_view_camera = true; continue; }

    // ── Multimedia: "9-inch multimedia touchscreen", "8" colour touchscreen"
    const screen = l.match(/(\d+(?:\.\d+)?)[-\s]*(?:inch|"|″)\s*(?:colour\s+)?(?:multimedia\s+)?touchscreen/);
    if (screen) {
      multimedia.touchscreen_inches = parseFloat(screen[1]);
      continue;
    }
    if (/dab\b|dab\+|digital\s+radio/.test(l))    { multimedia.dab_radio = true; continue; }
    if (/wireless\s+apple\s+carplay/.test(l))     { multimedia.apple_carplay = 'wireless'; continue; }
    if (/apple\s+carplay/.test(l))                { multimedia.apple_carplay = 'wired'; continue; }
    if (/wireless\s+android\s+auto/.test(l))      { multimedia.android_auto = 'wireless'; continue; }
    if (/android\s+auto/.test(l))                 { multimedia.android_auto = 'wired'; continue; }
    if (/bluetooth/.test(l))                      { multimedia.bluetooth = true; continue; }
    const speakers = l.match(/(\d+)\s*(?:x\s*)?speakers?/);
    if (speakers) { multimedia.speakers = parseInt(speakers[1], 10); continue; }

    // ── Wheels: "16″ Black alloy wheels", "15" steel wheels", "18-inch alloy wheels"
    const wheel = l.match(/(\d+(?:\.\d+)?)\s*(?:inch|"|″|''|&#8243;|in)\s*(?:black\s+|machined\s+|two-tone\s+)*(alloy|steel)?\s*wheels?/);
    if (wheel) {
      wheels.diameter_inches = parseFloat(wheel[1]);
      if (wheel[2]) wheels.type = wheel[2][0].toUpperCase() + wheel[2].slice(1);
      continue;
    }

    // ── Convenience
    if (/keyless\s+(?:entry|start|access)/.test(l)) { convenience.keyless = true; continue; }
    if (/climate\s+control/.test(l))                { convenience.climate_control = true; continue; }
    if (/heated\s+seats?/.test(l))                  { convenience.heated_seats = true; continue; }
    if (/leather(?:-covered)?\s+(?:steering|seats?)/.test(l)) { convenience.leather = true; continue; }
    if (/sunroof|moonroof/.test(l))                 { convenience.sunroof = true; continue; }
    if (/led\s+head/.test(l))                       { convenience.led_headlights = true; continue; }
    if (/heated\s+(?:door\s+)?mirrors?/.test(l))    { convenience.heated_mirrors = true; continue; }
    if (/digital\s+speedo|digital\s+instrument/.test(l)) { convenience.digital_speedo = true; continue; }
    if (/stop[-\s]start\b/.test(l))                 { convenience.stop_start = true; continue; }
  }

  // Drop empty buckets so the dashboard renders only the populated sections
  const out: Record<string, unknown> = {};
  if (Object.keys(engine).length) out.engine = engine;
  if (Object.keys(transmission).length) out.transmission = transmission;
  if (Object.keys(performance).length) out.performance = performance;
  if (Object.keys(safety).length) out.safety = safety;
  if (Object.keys(multimedia).length) out.multimedia = multimedia;
  if (Object.keys(wheels).length) out.wheels = wheels;
  if (Object.keys(convenience).length) out.convenience = convenience;
  return out;
}

/**
 * Resolve transmission specs for a SPECIFIC product (auto or manual) by
 * scanning the inherited feature bullets. Suzuki often packs both transmissions
 * into a single bullet ("5-speed manual or 4-speed automatic transmission") so
 * we have to know which side of the OR we want.
 */
function resolveTransmission(features: string[], trans: Transmission): { type?: string; gears?: number } {
  const want = trans; // 'automatic' | 'manual'
  for (const raw of features) {
    const l = raw.replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    // Pattern A: dual transmissions in one bullet
    //   "5-speed manual or 4-speed automatic transmission"
    //   "6-speed manual and 7-speed automatic"
    const dual = l.match(/(\d+)-speed\s+(manual|automatic|cvt)\s+(?:or|and)\s+(\d+)-speed\s+(manual|automatic|cvt)/);
    if (dual) {
      const left  = { gears: parseInt(dual[1], 10), type: dual[2] };
      const right = { gears: parseInt(dual[3], 10), type: dual[4] };
      const pick = left.type === want ? left : right.type === want ? right : null;
      if (pick) return { gears: pick.gears, type: pick.type === 'cvt' ? 'CVT' : (pick.type[0].toUpperCase() + pick.type.slice(1)) };
    }
    // Pattern B: single-gear count for one type, alternate type stated separately
    //   "5-speed manual or automatic CVT transmission"
    const mixed = l.match(/(\d+)-speed\s+(manual|automatic)\s+or\s+(automatic|manual)\s+(cvt|automatic|manual)/);
    if (mixed) {
      if (mixed[2] === want) return { gears: parseInt(mixed[1], 10), type: mixed[2][0].toUpperCase() + mixed[2].slice(1) };
      if (want === 'automatic' && /cvt/.test(mixed[4])) return { type: 'Automatic CVT' };
    }
    // Pattern C: single transmission with gear count
    //   "5-speed manual transmission"
    //   "6-speed automatic with paddle shifters"
    //   "4-speed automatic transmission"
    const single = l.match(/(\d+)-speed\s+(manual|automatic|cvt)/);
    if (single && single[2] === want) {
      // want is Transmission ('automatic'|'manual'), so single[2] is one of those here
      return { gears: parseInt(single[1], 10), type: single[2][0].toUpperCase() + single[2].slice(1) };
    }
    // Pattern D: type-only bullets — use only when nothing better has matched
    if (want === 'automatic' && /\bautomatic\s+cvt\s+transmission\b/.test(l)) return { type: 'Automatic CVT' };
    if (want === 'automatic' && /\bautomatic\s+transmission\b/.test(l))      return { type: 'Automatic' };
    if (want === 'manual' && /\bmanual\s+transmission\b/.test(l))            return { type: 'Manual' };
  }
  return {};
}

/**
 * Derive a display title that matches the existing DB convention:
 *   Swift Hybrid + auto/manual both exist → "Swift Hybrid GL Auto"/"Swift Hybrid GL Manual"
 *   Swift Hybrid Plus (auto only)         → "Swift Hybrid Plus"
 *   Jimny (auto+manual)                   → "Jimny Auto" / "Jimny Manual"
 */
function deriveTitle(variant: ApiVariant, transmission: Transmission, hasBothTransmissions: boolean): string {
  const base = variant.variant.trim();
  if (!hasBothTransmissions) return base;
  const suffix = transmission === 'automatic' ? 'Auto' : 'Manual';
  // Special case: Swift Hybrid base variant is shown as "Swift Hybrid GL <Auto|Manual>" in DB
  if (/^swift hybrid$/i.test(base)) return `Swift Hybrid GL ${suffix}`;
  if (/^jimny$/i.test(base)) return `Jimny ${suffix}`;
  return `${base} ${suffix}`;
}

function deriveVariantName(base: string, model: string): string {
  // Strip the model prefix from the variant name (e.g. "Swift Hybrid Plus" → "Plus")
  const modelLower = model.toLowerCase();
  let out = base.trim();
  if (out.toLowerCase().startsWith(modelLower)) {
    out = out.slice(model.length).trim();
  }
  return out || base;
}

// ============================================================================
// Main entry
// ============================================================================

export interface SuzukiSyncResult {
  api_fetched: boolean;
  models_processed: number;
  variants_processed: number;
  products_upserted: number;
  colors_upserted: number;
  pricing_rows_upserted: number;
  errors: string[];
}

export async function executeSuzukiSync(supabase: SupabaseClient): Promise<SuzukiSyncResult> {
  const result: SuzukiSyncResult = {
    api_fetched: false,
    models_processed: 0,
    variants_processed: 0,
    products_upserted: 0,
    colors_upserted: 0,
    pricing_rows_upserted: 0,
    errors: [],
  };

  // 1. Fetch the finance calculator API
  let api: ApiResponse;
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    api = (await res.json()) as ApiResponse;
    result.api_fetched = true;
  } catch (e) {
    result.errors.push(`Failed to fetch ${API_URL}: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  // 2. Load existing vehicle_models (to attach model_id)
  const { data: existingModels, error: modelsErr } = await supabase
    .from('vehicle_models')
    .select('id, name, slug')
    .eq('oem_id', 'suzuki-au');

  if (modelsErr) {
    result.errors.push(`Failed to load vehicle_models: ${modelsErr.message}`);
  }

  const modelByName = new Map<string, string>();
  for (const m of existingModels ?? []) {
    modelByName.set((m.name as string).toLowerCase(), m.id as string);
  }

  // 3. Iterate API models → variants → transmissions
  const now = new Date().toISOString();

  for (const apiModel of api.models) {
    result.models_processed++;
    const dbModelName = MODEL_NAME_MAP[apiModel.model] ?? apiModel.model;
    const modelId = modelByName.get(dbModelName.toLowerCase()) ?? null;

    if (!modelId) {
      result.errors.push(`No matching vehicle_model for API model "${apiModel.model}"`);
    }

    // Per-model spec accumulator: Suzuki's API only lists feature *deltas* on
    // higher trims (the base variant carries the full engine/transmission/safety
    // sheet, then "Plus"/"GLX"/etc. only mention what's added or changed).
    // Walk variants in API order (base → top) and overlay each variant's parsed
    // specs onto the running accumulator so every product ends up with a
    // complete sheet. Higher-trim values overwrite lower-trim ones.
    let accumulatedSpecs: Record<string, Record<string, unknown>> = {};
    const accumulatedFeatures: string[] = [];

    for (const variant of apiModel.modelVariants ?? []) {
      result.variants_processed++;

      // Which transmissions have prices?
      const firstState = Object.values(variant.price ?? {})[0] ?? {};
      const transmissions = (['automatic', 'manual'] as Transmission[]).filter(
        (t) => typeof firstState[t]?.price === 'number',
      );
      if (transmissions.length === 0) continue;

      const hasBoth = transmissions.length === 2;
      const featuresList = parseFeatures(variant.features);
      const ownSpecs = buildSpecsJson(featuresList, variant) as Record<string, Record<string, unknown>>;

      // Merge own specs onto accumulator (own values overwrite inherited ones)
      for (const [section, fields] of Object.entries(ownSpecs)) {
        accumulatedSpecs[section] = { ...(accumulatedSpecs[section] ?? {}), ...fields };
      }
      // Carry forward feature bullets (deduped) for the products.key_features column
      for (const f of featuresList) if (!accumulatedFeatures.includes(f)) accumulatedFeatures.push(f);

      // Snapshot the merged spec sheet for THIS variant (deep clone so later
      // variants in this loop don't mutate already-stored references)
      const specsJson: Record<string, unknown> = {};
      for (const [section, fields] of Object.entries(accumulatedSpecs)) {
        specsJson[section] = { ...fields };
      }

      for (const trans of transmissions) {
        const externalKey = `suzuki-${variant.variantID}-${trans}`;
        const title = deriveTitle(variant, trans, hasBoth);
        const variantName = deriveVariantName(variant.variant, apiModel.model);

        // Base display price = NSW driveaway (fallback VIC then any state)
        const stateOrder = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
        let displayPrice: number | null = null;
        for (const st of stateOrder) {
          const p = variant.price?.[st]?.[trans]?.price;
          if (typeof p === 'number') {
            displayPrice = p;
            break;
          }
        }

        // Determine body/fuel type from model metadata
        const bodyType = /suv|cross|fronx|vitara|jimny/i.test(apiModel.model) ? 'SUV' : 'Hatch';
        const fuelType = /hybrid/i.test(apiModel.model) || /hybrid/i.test(variant.variant) ? 'Hybrid' : 'Petrol';

        // Resolve transmission specs for THIS product (auto vs manual differ
        // when the API packs both into one bullet, e.g. Jimny "5-speed manual
        // or 4-speed automatic transmission")
        const transSpec = resolveTransmission(accumulatedFeatures, trans);
        if (Object.keys(transSpec).length) {
          specsJson.transmission = { ...(specsJson.transmission as Record<string, unknown> ?? {}), ...transSpec };
        } else {
          // Fallback: at least populate the type from the product's transmission enum
          specsJson.transmission = { type: trans === 'automatic' ? 'Automatic' : 'Manual' };
        }

        // Upsert product
        const productRow = {
          oem_id: 'suzuki-au',
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
          specs_json: specsJson,
          meta_json: {
            source: 'suzuki-finance-calculator-data.json',
            has_gfv: !variant.hideGFV,
            model_id: apiModel.modelID,
            variant_id: variant.variantID,
            transmission: trans,
          },
          key_features: [...accumulatedFeatures],
          last_seen_at: now,
        };

        // The products table has no (oem_id, external_key) unique constraint,
        // so query first, then update or insert. We also fall back to matching
        // on (oem_id, title) to catch variants whose IDs have drifted between
        // model years (Suzuki re-IDs variants for new MY releases).
        let existing: { id: string } | null = null;
        const { data: byKey } = await supabase
          .from('products')
          .select('id')
          .eq('oem_id', 'suzuki-au')
          .eq('external_key', externalKey)
          .maybeSingle();
        if (byKey) {
          existing = byKey as { id: string };
        } else {
          const { data: byTitle } = await supabase
            .from('products')
            .select('id')
            .eq('oem_id', 'suzuki-au')
            .eq('title', title)
            .maybeSingle();
          if (byTitle) existing = byTitle as { id: string };
        }

        let productId: string;
        if (existing) {
          const { error: uErr } = await supabase
            .from('products')
            .update(productRow)
            .eq('id', existing.id);
          if (uErr) {
            result.errors.push(`Update product ${externalKey}: ${uErr.message}`);
            continue;
          }
          productId = existing.id;
        } else {
          const { data: inserted, error: iErr } = await supabase
            .from('products')
            .insert(productRow)
            .select('id')
            .single();
          if (iErr || !inserted) {
            result.errors.push(
              `Insert product ${externalKey}: ${iErr?.message ?? 'no id returned'}`,
            );
            continue;
          }
          productId = (inserted as { id: string }).id;
        }
        result.products_upserted++;

        // Upsert paint colours
        const paintColours = variant.paintColours ?? [];
        if (paintColours.length > 0) {
          const colorRows = paintColours.map((c, i) => {
            const delta = averageExtraCost(c.extraCost);
            const heroSrc = c.image?.sizes?.default?.src ?? null;
            const largeSrc = c.image?.sizes?.['large-up']?.src ?? null;
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
            };
          });

          const { error: cErr } = await supabase
            .from('variant_colors')
            .upsert(colorRows, { onConflict: 'product_id,color_code' });

          if (cErr) {
            result.errors.push(`Upsert colors ${externalKey}: ${cErr.message}`);
          } else {
            result.colors_upserted += colorRows.length;
          }
        }

        // Upsert per-state variant_pricing
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
        };

        const { error: vpErr } = await supabase
          .from('variant_pricing')
          .upsert(pricingRow, { onConflict: 'product_id,price_type' });

        if (vpErr) {
          result.errors.push(`Upsert pricing ${externalKey}: ${vpErr.message}`);
        } else {
          result.pricing_rows_upserted++;
        }
      }
    }
  }

  return result;
}
