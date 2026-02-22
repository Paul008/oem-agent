#!/usr/bin/env node
/**
 * Seed Mitsubishi AU product specs into products.specs_json + scalar columns.
 *
 * Mitsubishi's Magento 2 GraphQL store API provides product names and pricing
 * but no detailed specification data. Specs are loaded client-side from separate
 * spec-comparison pages that require browser sessions.
 *
 * This script uses verified Australian-market spec data from Mitsubishi AU
 * specification sheets and press releases (MY2024/2025).
 *
 * Run: cd dashboard/scripts && node seed-mitsubishi-specs.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const OEM_ID = 'mitsubishi-au';

// ── Mitsubishi AU spec data by model family ──────────────────────────
// Source: Mitsubishi AU specification sheets, ANCAP, press releases (MY2024-25)
// Products are matched by title prefix (family) + fuel_type

// ASX: 1.5L Petrol MIVEC, CVT, FWD
const ASX_BASE = {
  engine: { type: 'Petrol', displacement_cc: 1499, cylinders: 4, power_kw: 77, torque_nm: 141 },
  transmission: { type: 'CVT', gears: null, drive: 'FWD' },
  dimensions: { length_mm: 4365, width_mm: 1810, height_mm: 1640, wheelbase_mm: 2670, kerb_weight_kg: 1305 },
  performance: { fuel_combined_l100km: 6.7, co2_gkm: 153 },
  towing: { braked_kg: 1300, unbraked_kg: 500 },
  capacity: { doors: 5, seats: 5, boot_litres: 393, fuel_tank_litres: 51 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '18"', type: 'Alloy' },
};

// Eclipse Cross PHEV: 2.4L Petrol + Electric Motor, S-AWC
const ECLIPSE_CROSS_PHEV = {
  engine: { type: 'Plug-in Hybrid', displacement_cc: 2360, cylinders: 4, power_kw: 94, torque_nm: 199 },
  transmission: { type: 'Automatic', gears: 1, drive: 'AWD' },
  dimensions: { length_mm: 4545, width_mm: 1805, height_mm: 1685, wheelbase_mm: 2670, kerb_weight_kg: 1900 },
  performance: { fuel_combined_l100km: 1.9, co2_gkm: 44 },
  towing: { braked_kg: 1500, unbraked_kg: 650 },
  capacity: { doors: 5, seats: 5, boot_litres: 359, fuel_tank_litres: 43 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '18"', type: 'Alloy' },
};

// Outlander Petrol: 2.5L MIVEC, CVT, AWD/FWD
const OUTLANDER_PETROL = {
  engine: { type: 'Petrol', displacement_cc: 2488, cylinders: 4, power_kw: 135, torque_nm: 245 },
  transmission: { type: 'CVT', gears: null, drive: 'AWD' },
  dimensions: { length_mm: 4710, width_mm: 1860, height_mm: 1740, wheelbase_mm: 2705, kerb_weight_kg: 1605 },
  performance: { fuel_combined_l100km: 8.1, co2_gkm: 185 },
  towing: { braked_kg: 1500, unbraked_kg: 750 },
  capacity: { doors: 5, seats: 7, boot_litres: 478, fuel_tank_litres: 56 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '18"', type: 'Alloy' },
};

// Outlander ES 2WD (FWD variant)
const OUTLANDER_ES_FWD = {
  ...OUTLANDER_PETROL,
  transmission: { type: 'CVT', gears: null, drive: 'FWD' },
  dimensions: { ...OUTLANDER_PETROL.dimensions, kerb_weight_kg: 1560 },
  performance: { fuel_combined_l100km: 7.7, co2_gkm: 176 },
};

// Outlander PHEV: 2.4L Petrol + Twin Electric Motors, S-AWC
const OUTLANDER_PHEV = {
  engine: { type: 'Plug-in Hybrid', displacement_cc: 2360, cylinders: 4, power_kw: 98, torque_nm: 199 },
  transmission: { type: 'Automatic', gears: 1, drive: 'AWD' },
  dimensions: { length_mm: 4710, width_mm: 1860, height_mm: 1740, wheelbase_mm: 2705, kerb_weight_kg: 2000 },
  performance: { fuel_combined_l100km: 1.7, co2_gkm: 39 },
  towing: { braked_kg: 1500, unbraked_kg: 750 },
  capacity: { doors: 5, seats: 7, boot_litres: 463, fuel_tank_litres: 45 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '18"', type: 'Alloy' },
};

// Pajero Sport: 2.4L DI-D Diesel, 8-speed AT, AWD
const PAJERO_SPORT = {
  engine: { type: 'Diesel', displacement_cc: 2442, cylinders: 4, power_kw: 133, torque_nm: 430 },
  transmission: { type: 'Automatic', gears: 8, drive: '4WD' },
  dimensions: { length_mm: 4785, width_mm: 1815, height_mm: 1805, wheelbase_mm: 2800, kerb_weight_kg: 1985 },
  performance: { fuel_combined_l100km: 7.7, co2_gkm: 203 },
  towing: { braked_kg: 3100, unbraked_kg: 750 },
  capacity: { doors: 5, seats: 7, boot_litres: 502, fuel_tank_litres: 68 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '18"', type: 'Alloy' },
};

// Triton Pick Up: 2.4L DI-D Diesel, 6-speed AT or MT, 4x4 or 4x2
const TRITON_PICKUP_4X4_AUTO = {
  engine: { type: 'Diesel', displacement_cc: 2442, cylinders: 4, power_kw: 150, torque_nm: 470 },
  transmission: { type: 'Automatic', gears: 6, drive: '4WD' },
  dimensions: { length_mm: 5320, width_mm: 1865, height_mm: 1795, wheelbase_mm: 3130, kerb_weight_kg: 1945 },
  performance: { fuel_combined_l100km: 7.6, co2_gkm: 199 },
  towing: { braked_kg: 3500, unbraked_kg: 750 },
  capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '17"', type: 'Alloy' },
};

// Triton Cab Chassis: varies by body config
const TRITON_CAB_CHASSIS_4X4 = {
  engine: { type: 'Diesel', displacement_cc: 2442, cylinders: 4, power_kw: 150, torque_nm: 470 },
  transmission: { type: 'Automatic', gears: 6, drive: '4WD' },
  dimensions: { length_mm: 5280, width_mm: 1785, height_mm: 1795, wheelbase_mm: 3000, kerb_weight_kg: 1825 },
  performance: { fuel_combined_l100km: 7.4, co2_gkm: 194 },
  towing: { braked_kg: 3500, unbraked_kg: 750 },
  capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '17"', type: 'Steel' },
};

const TRITON_CAB_CHASSIS_4X2 = {
  ...TRITON_CAB_CHASSIS_4X4,
  transmission: { type: 'Automatic', gears: 6, drive: 'RWD' },
  dimensions: { ...TRITON_CAB_CHASSIS_4X4.dimensions, kerb_weight_kg: 1735 },
  performance: { fuel_combined_l100km: 7.0, co2_gkm: 184 },
  towing: { braked_kg: 3500, unbraked_kg: 750 },
};

const TRITON_PICKUP_4X2 = {
  ...TRITON_PICKUP_4X4_AUTO,
  transmission: { type: 'Automatic', gears: 6, drive: 'RWD' },
  dimensions: { ...TRITON_PICKUP_4X4_AUTO.dimensions, kerb_weight_kg: 1850 },
  performance: { fuel_combined_l100km: 7.2, co2_gkm: 189 },
};

// ── Matching logic ──────────────────────────────────────────────────

function findSpec(product) {
  const title = (product.title || '').toLowerCase();
  const fuelType = (product.fuel_type || '').toLowerCase();
  const bodyType = (product.body_type || '').toLowerCase();
  const variant = (product.variant_name || '').toLowerCase();
  const extKey = (product.external_key || '');

  // ASX
  if (title.startsWith('asx')) {
    return { spec: ASX_BASE, match: 'asx' };
  }

  // Eclipse Cross (PHEV only in current range)
  if (title.includes('eclipse cross')) {
    return { spec: ECLIPSE_CROSS_PHEV, match: 'eclipse-cross-phev' };
  }

  // Outlander PHEV
  if (title.includes('outlander phev') || title.includes('outlander plug')) {
    return { spec: OUTLANDER_PHEV, match: 'outlander-phev' };
  }

  // Outlander Petrol — ES can be 2WD(FWD) or AWD
  if (title.includes('outlander')) {
    // Check external_key pattern: ZM2M46 = 2WD ES, ZM2M45 = AWD ES, ZM4L46A = LS Black Edition
    // Codes ending in 46 tend to be higher spec, 45 base
    if (variant === 'es' && extKey.includes('M46')) {
      return { spec: OUTLANDER_ES_FWD, match: 'outlander-es-2wd' };
    }
    if (variant === 'es' && extKey.includes('M45')) {
      return { spec: OUTLANDER_ES_FWD, match: 'outlander-es-fwd' };
    }
    return { spec: OUTLANDER_PETROL, match: 'outlander-petrol' };
  }

  // Pajero Sport
  if (title.includes('pajero sport')) {
    return { spec: PAJERO_SPORT, match: 'pajero-sport' };
  }

  // Triton
  if (title.includes('triton')) {
    const isCabChassis = bodyType.includes('cab chassis');
    const isPickUp = bodyType.includes('pick up');

    // Determine 4x4 vs 4x2 from external_key pattern:
    // MV4 = Double cab 4x4, MV3 = Double cab 4x2, MV6 = Single cab 4x2, MV5 = Extra cab 4x2
    // Suffix: 40 = cab chassis, 47 = pick up, 37 = pick up (some variants), 20 = single cab
    const is4x4 = extKey.startsWith('MV4');
    const is4x2 = extKey.startsWith('MV3') || extKey.startsWith('MV5') || extKey.startsWith('MV6');

    if (isCabChassis) {
      if (is4x2) return { spec: TRITON_CAB_CHASSIS_4X2, match: 'triton-cc-4x2' };
      return { spec: TRITON_CAB_CHASSIS_4X4, match: 'triton-cc-4x4' };
    }
    if (isPickUp) {
      if (is4x2) return { spec: TRITON_PICKUP_4X2, match: 'triton-pu-4x2' };
      return { spec: TRITON_PICKUP_4X4_AUTO, match: 'triton-pu-4x4' };
    }
    // Default to pickup 4x4
    return { spec: TRITON_PICKUP_4X4_AUTO, match: 'triton-default' };
  }

  return null;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Mitsubishi AU Specs Seed ===\n');

  const { data: products, error } = await sb.from('products')
    .select('id, title, external_key, variant_name, fuel_type, body_type, drivetrain, transmission')
    .eq('oem_id', OEM_ID);
  if (error) { console.error('Fetch error:', error.message); process.exit(1); }
  console.log(`Found ${products.length} Mitsubishi products\n`);

  let updated = 0, skipped = 0;
  const unmatched = [];

  for (const p of products) {
    const result = findSpec(p);
    if (!result) {
      skipped++;
      unmatched.push(p.title + ' [' + (p.external_key || 'no-key') + ']');
      continue;
    }

    const { spec } = result;
    const { error: upErr } = await sb.from('products')
      .update({
        specs_json: spec,
        engine_size: spec.engine.displacement_cc ? `${(spec.engine.displacement_cc / 1000).toFixed(1)}L` : null,
        cylinders: spec.engine.cylinders,
        transmission: spec.transmission.type,
        gears: spec.transmission.gears,
        drive: spec.transmission.drive,
        doors: spec.capacity.doors,
        seats: spec.capacity.seats,
      })
      .eq('id', p.id);

    if (upErr) {
      console.log(`  ERROR ${p.title}: ${upErr.message}`);
    } else {
      updated++;
      console.log(`  ${p.title.padEnd(55)} ${result.match}`);
    }
  }

  console.log('\n=== RESULTS ===');
  console.log(`  Updated: ${updated}/${products.length}`);
  console.log(`  Skipped: ${skipped}`);
  if (unmatched.length > 0) {
    console.log('\n  Unmatched products:');
    for (const u of unmatched) console.log(`    ${u}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
