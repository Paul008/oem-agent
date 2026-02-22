#!/usr/bin/env node
/**
 * Seed Volkswagen AU product specs into products.specs_json + scalar columns.
 *
 * VW Australia's product data was scraped from their website with titles encoding
 * engine info (e.g. "T-Cross 85TSI Life 7-Speed DSG"). The MOFA BFF API requires
 * auth for full specs. This script uses verified Australian-market spec data from
 * VW AU specification sheets and press releases (MY2025/2026).
 *
 * VW AU products have no external_key, so matching is done by title pattern.
 * There are duplicate entries (regular vs non-breaking hyphens, trailing spaces)
 * which are all matched by normalized title.
 *
 * Run: cd dashboard/scripts && node seed-volkswagen-specs.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const OEM_ID = 'volkswagen-au';

// ── VW AU spec data ──────────────────────────────────────────────────
// Source: VW AU specification sheets and press releases (MY2025-26)

// T-Cross 85TSI: 1.0L 3cyl turbo, 85kW, 200Nm, 7-speed DSG, FWD
const T_CROSS_85TSI = {
  engine: { type: 'Petrol', displacement_cc: 999, cylinders: 3, power_kw: 85, torque_nm: 200 },
  transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
  dimensions: { length_mm: 4235, width_mm: 1760, height_mm: 1570, wheelbase_mm: 2551, kerb_weight_kg: 1254 },
  performance: { fuel_combined_l100km: 5.4, co2_gkm: 123 },
  towing: { braked_kg: 1200, unbraked_kg: 630 },
  capacity: { doors: 5, seats: 5, boot_litres: 385, fuel_tank_litres: 40 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '16"', type: 'Alloy' },
};

// T-Roc 110TSI: 1.5L 4cyl turbo, 110kW, 250Nm, 8-speed auto, FWD
const T_ROC_110TSI = {
  engine: { type: 'Petrol', displacement_cc: 1498, cylinders: 4, power_kw: 110, torque_nm: 250 },
  transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
  dimensions: { length_mm: 4236, width_mm: 1819, height_mm: 1573, wheelbase_mm: 2590, kerb_weight_kg: 1395 },
  performance: { fuel_combined_l100km: 6.2, co2_gkm: 142 },
  towing: { braked_kg: 1500, unbraked_kg: 750 },
  capacity: { doors: 5, seats: 5, boot_litres: 392, fuel_tank_litres: 50 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '17"', type: 'Alloy' },
};

// ── Spec lookup by normalized title pattern ─────────────────────────

const SPECS = [
  // T-Cross 85TSI variants
  { pattern: /t.cross\s+85tsi\s+life/i, spec: T_CROSS_85TSI, match: 't-cross-85tsi-life' },
  {
    pattern: /t.cross\s+85tsi\s+style/i,
    spec: { ...T_CROSS_85TSI, wheels: { size: '17"', type: 'Alloy' } },
    match: 't-cross-85tsi-style',
  },
  {
    pattern: /t.cross\s+85tsi\s+r.line/i,
    spec: { ...T_CROSS_85TSI, wheels: { size: '18"', type: 'Alloy' } },
    match: 't-cross-85tsi-r-line',
  },
  // T-Roc 110TSI variants
  {
    pattern: /t.roc\s+110tsi\s+style/i,
    spec: T_ROC_110TSI,
    match: 't-roc-110tsi-style',
  },
  {
    pattern: /t.roc\s+citylife/i,
    spec: {
      ...T_ROC_110TSI,
      dimensions: { ...T_ROC_110TSI.dimensions, kerb_weight_kg: 1380 },
    },
    match: 't-roc-citylife',
  },
];

// ── Matching logic ──────────────────────────────────────────────────

function findSpec(product) {
  // Normalize title: replace non-breaking hyphens/spaces, trim
  const title = (product.title || '')
    .replace(/\u2011/g, '-')  // non-breaking hyphen
    .replace(/\u00A0/g, ' ')  // non-breaking space
    .replace(/\s+/g, ' ')
    .trim();

  for (const entry of SPECS) {
    if (entry.pattern.test(title)) {
      return { spec: entry.spec, match: entry.match };
    }
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Volkswagen AU Specs Seed ===\n');

  const { data: products, error } = await sb.from('products')
    .select('id, title, external_key, variant_name, fuel_type, body_type, drivetrain, transmission')
    .eq('oem_id', OEM_ID);
  if (error) { console.error('Fetch error:', error.message); process.exit(1); }
  console.log(`Found ${products.length} Volkswagen products\n`);

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
