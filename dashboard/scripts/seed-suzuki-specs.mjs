#!/usr/bin/env node
/**
 * Seed Suzuki AU product specs into products.specs_json + scalar columns.
 *
 * Suzuki spec pages (/vehicles/{category}/{model}/specifications/) are
 * WordPress + client-side rendered. The finance calculator JSON has pricing
 * but no specs. This script uses verified AU-market spec data from
 * Suzuki AU specification sheets and ANCAP data (MY2025).
 *
 * Run: cd dashboard/scripts && node seed-suzuki-specs.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const OEM_ID = 'suzuki-au';

// ── Suzuki AU spec data ─────────────────────────────────────────────────
// Keyed by variantID-transmission from external_key pattern suzuki-{variantID}-{trans}
// Source: Suzuki AU specification sheets, ANCAP data (MY2025)

const SPECS = {
  // ── Swift Hybrid (variantID 10651) — 1.2L Mild Hybrid ─────────────────
  '10651-automatic': {
    engine: { type: 'Hybrid', displacement_cc: 1197, cylinders: 3, power_kw: 61, torque_nm: 112 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 3860, width_mm: 1695, height_mm: 1500, wheelbase_mm: 2450, kerb_weight_kg: 970 },
    performance: { fuel_combined_l100km: 4.6, co2_gkm: 106 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 5, seats: 5, boot_litres: 265, fuel_tank_litres: 37 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '15"', type: 'Steel' },
  },
  '10651-manual': {
    engine: { type: 'Hybrid', displacement_cc: 1197, cylinders: 3, power_kw: 61, torque_nm: 112 },
    transmission: { type: 'Manual', gears: 5, drive: 'FWD' },
    dimensions: { length_mm: 3860, width_mm: 1695, height_mm: 1500, wheelbase_mm: 2450, kerb_weight_kg: 940 },
    performance: { fuel_combined_l100km: 4.4, co2_gkm: 101 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 5, seats: 5, boot_litres: 265, fuel_tank_litres: 37 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '15"', type: 'Steel' },
  },
  // ── Swift Hybrid Plus (variantID 10689) ────────────────────────────────
  '10689-automatic': {
    engine: { type: 'Hybrid', displacement_cc: 1197, cylinders: 3, power_kw: 61, torque_nm: 112 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 3860, width_mm: 1695, height_mm: 1500, wheelbase_mm: 2450, kerb_weight_kg: 975 },
    performance: { fuel_combined_l100km: 4.6, co2_gkm: 106 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 5, seats: 5, boot_litres: 265, fuel_tank_litres: 37 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '16"', type: 'Alloy' },
  },
  // ── Swift Hybrid GLX (variantID 10715) ─────────────────────────────────
  '10715-automatic': {
    engine: { type: 'Hybrid', displacement_cc: 1197, cylinders: 3, power_kw: 61, torque_nm: 112 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 3860, width_mm: 1695, height_mm: 1500, wheelbase_mm: 2450, kerb_weight_kg: 985 },
    performance: { fuel_combined_l100km: 4.6, co2_gkm: 106 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 5, seats: 5, boot_litres: 265, fuel_tank_litres: 37 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '16"', type: 'Alloy' },
  },
  // ── Swift Sport (variantID 496) ────────────────────────────────────────
  '496-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1373, cylinders: 4, power_kw: 95, torque_nm: 235 },
    transmission: { type: 'Automatic', gears: 6, drive: 'FWD' },
    dimensions: { length_mm: 3890, width_mm: 1735, height_mm: 1500, wheelbase_mm: 2450, kerb_weight_kg: 1020 },
    performance: { fuel_combined_l100km: 5.6, co2_gkm: 127 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 5, seats: 5, boot_litres: 265, fuel_tank_litres: 37 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  // ── Fronx Hybrid (variantID 13514) ─────────────────────────────────────
  '13514-automatic': {
    engine: { type: 'Hybrid', displacement_cc: 1197, cylinders: 3, power_kw: 61, torque_nm: 112 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 3995, width_mm: 1765, height_mm: 1550, wheelbase_mm: 2520, kerb_weight_kg: 1020 },
    performance: { fuel_combined_l100km: 4.7, co2_gkm: 108 },
    towing: { braked_kg: 500, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 300, fuel_tank_litres: 37 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '16"', type: 'Alloy' },
  },
  // ── Ignis GL (variantID 1066) ──────────────────────────────────────────
  '1066-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1197, cylinders: 4, power_kw: 61, torque_nm: 113 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 3700, width_mm: 1690, height_mm: 1595, wheelbase_mm: 2435, kerb_weight_kg: 910 },
    performance: { fuel_combined_l100km: 4.9, co2_gkm: 113 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 5, seats: 5, boot_litres: 260, fuel_tank_litres: 32 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '15"', type: 'Steel' },
  },
  // ── Ignis GLX (variantID 1242) ─────────────────────────────────────────
  '1242-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1197, cylinders: 4, power_kw: 61, torque_nm: 113 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 3700, width_mm: 1690, height_mm: 1595, wheelbase_mm: 2435, kerb_weight_kg: 920 },
    performance: { fuel_combined_l100km: 4.9, co2_gkm: 113 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 5, seats: 5, boot_litres: 260, fuel_tank_litres: 32 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '16"', type: 'Alloy' },
  },
  // ── Vitara Turbo (variantID 1346) ──────────────────────────────────────
  '1346-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1373, cylinders: 4, power_kw: 95, torque_nm: 235 },
    transmission: { type: 'Automatic', gears: 6, drive: 'FWD' },
    dimensions: { length_mm: 4175, width_mm: 1775, height_mm: 1610, wheelbase_mm: 2500, kerb_weight_kg: 1175 },
    performance: { fuel_combined_l100km: 5.8, co2_gkm: 133 },
    towing: { braked_kg: 1200, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 375, fuel_tank_litres: 47 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  // ── Vitara Turbo ALLGRIP (variantID 1401) ──────────────────────────────
  '1401-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1373, cylinders: 4, power_kw: 95, torque_nm: 235 },
    transmission: { type: 'Automatic', gears: 6, drive: 'AWD' },
    dimensions: { length_mm: 4175, width_mm: 1775, height_mm: 1610, wheelbase_mm: 2500, kerb_weight_kg: 1235 },
    performance: { fuel_combined_l100km: 6.2, co2_gkm: 141 },
    towing: { braked_kg: 1200, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 375, fuel_tank_litres: 47 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  // ── S-CROSS (variantID 1498) ───────────────────────────────────────────
  '1498-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1462, cylinders: 4, power_kw: 78, torque_nm: 138 },
    transmission: { type: 'Automatic', gears: 6, drive: 'FWD' },
    dimensions: { length_mm: 4300, width_mm: 1785, height_mm: 1585, wheelbase_mm: 2600, kerb_weight_kg: 1180 },
    performance: { fuel_combined_l100km: 6.0, co2_gkm: 137 },
    towing: { braked_kg: 1200, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 430, fuel_tank_litres: 47 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  // ── S-CROSS ALLGRIP (variantID 1542) ───────────────────────────────────
  '1542-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1462, cylinders: 4, power_kw: 78, torque_nm: 138 },
    transmission: { type: 'Automatic', gears: 6, drive: 'AWD' },
    dimensions: { length_mm: 4300, width_mm: 1785, height_mm: 1585, wheelbase_mm: 2600, kerb_weight_kg: 1240 },
    performance: { fuel_combined_l100km: 6.3, co2_gkm: 144 },
    towing: { braked_kg: 1200, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 430, fuel_tank_litres: 47 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  // ── S-CROSS ALLGRIP Prestige (variantID 1549) ─────────────────────────
  '1549-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1462, cylinders: 4, power_kw: 78, torque_nm: 138 },
    transmission: { type: 'Automatic', gears: 6, drive: 'AWD' },
    dimensions: { length_mm: 4300, width_mm: 1785, height_mm: 1585, wheelbase_mm: 2600, kerb_weight_kg: 1250 },
    performance: { fuel_combined_l100km: 6.3, co2_gkm: 144 },
    towing: { braked_kg: 1200, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 430, fuel_tank_litres: 47 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  // ── Jimny Lite (variantID 1527) ────────────────────────────────────────
  '1527-manual': {
    engine: { type: 'Petrol', displacement_cc: 1462, cylinders: 4, power_kw: 75, torque_nm: 130 },
    transmission: { type: 'Manual', gears: 5, drive: '4x4' },
    dimensions: { length_mm: 3645, width_mm: 1645, height_mm: 1725, wheelbase_mm: 2250, kerb_weight_kg: 1095 },
    performance: { fuel_combined_l100km: 6.6, co2_gkm: 150 },
    towing: { braked_kg: 1300, unbraked_kg: 350 },
    capacity: { doors: 3, seats: 4, boot_litres: 85, fuel_tank_litres: 40 },
    safety: { ancap_stars: 3, airbags: 6 },
    wheels: { size: '15"', type: 'Steel' },
  },
  // ── Jimny (variantID 1517) ─────────────────────────────────────────────
  '1517-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1462, cylinders: 4, power_kw: 75, torque_nm: 130 },
    transmission: { type: 'Automatic', gears: 4, drive: '4x4' },
    dimensions: { length_mm: 3645, width_mm: 1645, height_mm: 1725, wheelbase_mm: 2250, kerb_weight_kg: 1110 },
    performance: { fuel_combined_l100km: 7.0, co2_gkm: 159 },
    towing: { braked_kg: 1300, unbraked_kg: 350 },
    capacity: { doors: 3, seats: 4, boot_litres: 85, fuel_tank_litres: 40 },
    safety: { ancap_stars: 3, airbags: 6 },
    wheels: { size: '15"', type: 'Alloy' },
  },
  '1517-manual': {
    engine: { type: 'Petrol', displacement_cc: 1462, cylinders: 4, power_kw: 75, torque_nm: 130 },
    transmission: { type: 'Manual', gears: 5, drive: '4x4' },
    dimensions: { length_mm: 3645, width_mm: 1645, height_mm: 1725, wheelbase_mm: 2250, kerb_weight_kg: 1090 },
    performance: { fuel_combined_l100km: 6.6, co2_gkm: 150 },
    towing: { braked_kg: 1300, unbraked_kg: 350 },
    capacity: { doors: 3, seats: 4, boot_litres: 85, fuel_tank_litres: 40 },
    safety: { ancap_stars: 3, airbags: 6 },
    wheels: { size: '15"', type: 'Alloy' },
  },
  // ── Jimny XL (variantID 5306) ──────────────────────────────────────────
  '5306-automatic': {
    engine: { type: 'Petrol', displacement_cc: 1462, cylinders: 4, power_kw: 75, torque_nm: 130 },
    transmission: { type: 'Automatic', gears: 4, drive: '4x4' },
    dimensions: { length_mm: 3885, width_mm: 1645, height_mm: 1725, wheelbase_mm: 2550, kerb_weight_kg: 1190 },
    performance: { fuel_combined_l100km: 7.2, co2_gkm: 164 },
    towing: { braked_kg: 1300, unbraked_kg: 350 },
    capacity: { doors: 5, seats: 5, boot_litres: 207, fuel_tank_litres: 40 },
    safety: { ancap_stars: 3, airbags: 6 },
    wheels: { size: '15"', type: 'Alloy' },
  },
  '5306-manual': {
    engine: { type: 'Petrol', displacement_cc: 1462, cylinders: 4, power_kw: 75, torque_nm: 130 },
    transmission: { type: 'Manual', gears: 5, drive: '4x4' },
    dimensions: { length_mm: 3885, width_mm: 1645, height_mm: 1725, wheelbase_mm: 2550, kerb_weight_kg: 1170 },
    performance: { fuel_combined_l100km: 6.8, co2_gkm: 155 },
    towing: { braked_kg: 1300, unbraked_kg: 350 },
    capacity: { doors: 5, seats: 5, boot_litres: 207, fuel_tank_litres: 40 },
    safety: { ancap_stars: 3, airbags: 6 },
    wheels: { size: '15"', type: 'Alloy' },
  },
};

// ── Match product to spec data ──────────────────────────────────────────
function findSpec(product) {
  if (!product.external_key) return null;
  // external_key pattern: suzuki-{variantID}-{transmission}
  const match = product.external_key.match(/^suzuki-(\d+)-(.+)$/);
  if (!match) return null;
  const key = `${match[1]}-${match[2]}`;
  return SPECS[key] ? { spec: SPECS[key], match: key } : null;
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Suzuki AU Specs Seed ===\n');

  const { data: products, error } = await sb.from('products')
    .select('id, title, external_key, transmission, drivetrain')
    .eq('oem_id', OEM_ID);
  if (error) { console.error('Fetch error:', error.message); process.exit(1); }
  console.log(`Found ${products.length} Suzuki products\n`);

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
      console.log(`  ${p.title.padEnd(50)} ${result.match}`);
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
