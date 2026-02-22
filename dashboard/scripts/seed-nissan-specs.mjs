#!/usr/bin/env node
/**
 * Seed Nissan AU product specs into products.specs_json + scalar columns.
 *
 * Nissan spec data from nissan.com.au/vehicles/browse-range/{model}/specs-and-pricing.html
 * and prices-specifications.html pages. These pages render some data server-side but most
 * spec values are client-rendered. This script uses verified AU-market spec data
 * from Nissan AU specification sheets and press releases (MY2025-26).
 *
 * Run: cd dashboard/scripts && node seed-nissan-specs.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const OEM_ID = 'nissan-au';

// ── Nissan AU spec data ─────────────────────────────────────────────────
// Keyed by model code + grade slug (from external_key pattern nissan-{code}-{grade}-{trans})
// Source: Nissan AU specification sheets, ANCAP data (MY2025-26)

// Shared base specs by model
const X_TRAIL_BASE_25L = {
  engine: { type: 'Petrol', displacement_cc: 2488, cylinders: 4, power_kw: 135, torque_nm: 244 },
  transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
  dimensions: { length_mm: 4680, width_mm: 2065, height_mm: 1725, wheelbase_mm: 2705, kerb_weight_kg: 1540 },
  performance: { fuel_combined_l100km: 7.4, co2_gkm: 174 },
  towing: { braked_kg: 2000, unbraked_kg: 750 },
  capacity: { doors: 5, seats: 5, boot_litres: 585, fuel_tank_litres: 55 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '17"', type: 'Alloy' },
};

const X_TRAIL_BASE_25L_4X4 = {
  ...X_TRAIL_BASE_25L,
  transmission: { type: 'Automatic', gears: null, drive: '4x4' },
  dimensions: { ...X_TRAIL_BASE_25L.dimensions, kerb_weight_kg: 1643 },
  performance: { fuel_combined_l100km: 7.8, co2_gkm: 183 },
  capacity: { ...X_TRAIL_BASE_25L.capacity, seats: 7 },
};

const X_TRAIL_EPOWER = {
  engine: { type: 'Hybrid', displacement_cc: 1497, cylinders: 3, power_kw: 150, torque_nm: 330 },
  transmission: { type: 'Automatic', gears: null, drive: 'e-4ORCE' },
  dimensions: { length_mm: 4680, width_mm: 2065, height_mm: 1725, wheelbase_mm: 2705, kerb_weight_kg: 1871 },
  performance: { fuel_combined_l100km: 6.1, co2_gkm: 139 },
  towing: { braked_kg: 1650, unbraked_kg: 750 },
  capacity: { doors: 5, seats: 5, boot_litres: 485, fuel_tank_litres: 55 },
  safety: { ancap_stars: 5, airbags: 7 },
  wheels: { size: '18"', type: 'Alloy' },
};

const SPECS = {
  // ── Ariya (Electric, model code 30179) ────────────────────────────────
  '30179-engage': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 178, torque_nm: 300 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 4595, width_mm: 1850, height_mm: 1660, wheelbase_mm: 2775, kerb_weight_kg: 1870 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 468, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  '30179-advance': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 178, torque_nm: 300 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 4595, width_mm: 1850, height_mm: 1660, wheelbase_mm: 2775, kerb_weight_kg: 1890 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 468, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  '30179-advance+': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 178, torque_nm: 300 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 4595, width_mm: 1850, height_mm: 1660, wheelbase_mm: 2775, kerb_weight_kg: 2030 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 468, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  '30179-evolve': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 178, torque_nm: 300 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 4595, width_mm: 1850, height_mm: 1660, wheelbase_mm: 2775, kerb_weight_kg: 2060 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 468, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  '30179-evolve-e-4orce': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 250, torque_nm: 600 },
    transmission: { type: 'Automatic', gears: 1, drive: 'AWD' },
    dimensions: { length_mm: 4595, width_mm: 1850, height_mm: 1660, wheelbase_mm: 2775, kerb_weight_kg: 2200 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 468, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '20"', type: 'Alloy' },
  },

  // ── Juke (model code 30304) ───────────────────────────────────────────
  '30304-st': {
    engine: { type: 'Petrol', displacement_cc: 999, cylinders: 3, power_kw: 84, torque_nm: 180 },
    transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
    dimensions: { length_mm: 4210, width_mm: 1800, height_mm: 1595, wheelbase_mm: 2636, kerb_weight_kg: 1244 },
    performance: { fuel_combined_l100km: 5.8, co2_gkm: 133 },
    towing: { braked_kg: 1250, unbraked_kg: 610 },
    capacity: { doors: 5, seats: 5, boot_litres: 422, fuel_tank_litres: 46 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  '30304-st+': {
    engine: { type: 'Petrol', displacement_cc: 999, cylinders: 3, power_kw: 84, torque_nm: 180 },
    transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
    dimensions: { length_mm: 4210, width_mm: 1800, height_mm: 1595, wheelbase_mm: 2636, kerb_weight_kg: 1254 },
    performance: { fuel_combined_l100km: 5.8, co2_gkm: 133 },
    towing: { braked_kg: 1250, unbraked_kg: 610 },
    capacity: { doors: 5, seats: 5, boot_litres: 422, fuel_tank_litres: 46 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  '30304-ti': {
    engine: { type: 'Petrol', displacement_cc: 999, cylinders: 3, power_kw: 84, torque_nm: 180 },
    transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
    dimensions: { length_mm: 4210, width_mm: 1800, height_mm: 1595, wheelbase_mm: 2636, kerb_weight_kg: 1268 },
    performance: { fuel_combined_l100km: 5.9, co2_gkm: 135 },
    towing: { braked_kg: 1250, unbraked_kg: 610 },
    capacity: { doors: 5, seats: 5, boot_litres: 422, fuel_tank_litres: 46 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },

  // ── Qashqai (model code 30128) ────────────────────────────────────────
  '30128-st': {
    engine: { type: 'Petrol', displacement_cc: 1332, cylinders: 4, power_kw: 110, torque_nm: 250 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4425, width_mm: 1835, height_mm: 1625, wheelbase_mm: 2665, kerb_weight_kg: 1394 },
    performance: { fuel_combined_l100km: 6.4, co2_gkm: 147 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 504, fuel_tank_litres: 55 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  '30128-st+': {
    engine: { type: 'Petrol', displacement_cc: 1332, cylinders: 4, power_kw: 110, torque_nm: 250 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4425, width_mm: 1835, height_mm: 1625, wheelbase_mm: 2665, kerb_weight_kg: 1407 },
    performance: { fuel_combined_l100km: 6.4, co2_gkm: 147 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 504, fuel_tank_litres: 55 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '30128-ti': {
    engine: { type: 'Petrol', displacement_cc: 1332, cylinders: 4, power_kw: 110, torque_nm: 250 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4425, width_mm: 1835, height_mm: 1625, wheelbase_mm: 2665, kerb_weight_kg: 1423 },
    performance: { fuel_combined_l100km: 6.5, co2_gkm: 149 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 504, fuel_tank_litres: 55 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '30128-ti-l': {
    engine: { type: 'Petrol', displacement_cc: 1332, cylinders: 4, power_kw: 110, torque_nm: 250 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4425, width_mm: 1835, height_mm: 1625, wheelbase_mm: 2665, kerb_weight_kg: 1445 },
    performance: { fuel_combined_l100km: 6.5, co2_gkm: 149 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 504, fuel_tank_litres: 55 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  '30128-n-design-e-power': {
    engine: { type: 'Hybrid', displacement_cc: 1497, cylinders: 3, power_kw: 140, torque_nm: 330 },
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4425, width_mm: 1835, height_mm: 1625, wheelbase_mm: 2665, kerb_weight_kg: 1620 },
    performance: { fuel_combined_l100km: 5.3, co2_gkm: 122 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 479, fuel_tank_litres: 55 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '20"', type: 'Alloy' },
  },

  // ── X-Trail MY25 (model code 30145) ───────────────────────────────────
  '30145-st': { ...X_TRAIL_BASE_25L },
  '30145-st+': {
    ...X_TRAIL_BASE_25L,
    dimensions: { ...X_TRAIL_BASE_25L.dimensions, kerb_weight_kg: 1560 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '30145-st-l': {
    ...X_TRAIL_BASE_25L,
    dimensions: { ...X_TRAIL_BASE_25L.dimensions, kerb_weight_kg: 1578 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '30145-ti': {
    ...X_TRAIL_BASE_25L,
    dimensions: { ...X_TRAIL_BASE_25L.dimensions, kerb_weight_kg: 1590 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  '30145-ti-e-4orce': {
    ...X_TRAIL_EPOWER,
    dimensions: { ...X_TRAIL_EPOWER.dimensions, kerb_weight_kg: 1880 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  '30145-ti-l-e-4orce': {
    ...X_TRAIL_EPOWER,
    dimensions: { ...X_TRAIL_EPOWER.dimensions, kerb_weight_kg: 1895 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  '30145-ti-l-e-power': {
    ...X_TRAIL_EPOWER,
    transmission: { type: 'Automatic', gears: null, drive: 'FWD' },
    dimensions: { ...X_TRAIL_EPOWER.dimensions, kerb_weight_kg: 1860 },
    wheels: { size: '20"', type: 'Alloy' },
  },

  // ── X-Trail MY26 (model code 70049) ───────────────────────────────────
  '70049-st': { ...X_TRAIL_BASE_25L, dimensions: { ...X_TRAIL_BASE_25L.dimensions, kerb_weight_kg: 1550 } },
  '70049-st+': {
    ...X_TRAIL_BASE_25L,
    dimensions: { ...X_TRAIL_BASE_25L.dimensions, kerb_weight_kg: 1570 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '70049-ti': {
    ...X_TRAIL_BASE_25L,
    dimensions: { ...X_TRAIL_BASE_25L.dimensions, kerb_weight_kg: 1595 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  '70049-ti-l': {
    ...X_TRAIL_BASE_25L,
    dimensions: { ...X_TRAIL_BASE_25L.dimensions, kerb_weight_kg: 1610 },
    wheels: { size: '20"', type: 'Alloy' },
  },

  // ── Pathfinder (model code 29652) ─────────────────────────────────────
  '29652-st': {
    engine: { type: 'Petrol', displacement_cc: 3498, cylinders: 6, power_kw: 202, torque_nm: 340 },
    transmission: { type: 'Automatic', gears: 9, drive: 'FWD' },
    dimensions: { length_mm: 5028, width_mm: 1979, height_mm: 1776, wheelbase_mm: 2900, kerb_weight_kg: 1979 },
    performance: { fuel_combined_l100km: 9.4, co2_gkm: 221 },
    towing: { braked_kg: 2700, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 8, boot_litres: 205, fuel_tank_litres: 73 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '29652-st+': {
    engine: { type: 'Petrol', displacement_cc: 3498, cylinders: 6, power_kw: 202, torque_nm: 340 },
    transmission: { type: 'Automatic', gears: 9, drive: 'FWD' },
    dimensions: { length_mm: 5028, width_mm: 1979, height_mm: 1776, wheelbase_mm: 2900, kerb_weight_kg: 2001 },
    performance: { fuel_combined_l100km: 9.4, co2_gkm: 221 },
    towing: { braked_kg: 2700, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 8, boot_litres: 205, fuel_tank_litres: 73 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '29652-ti': {
    engine: { type: 'Petrol', displacement_cc: 3498, cylinders: 6, power_kw: 202, torque_nm: 340 },
    transmission: { type: 'Automatic', gears: 9, drive: 'FWD' },
    dimensions: { length_mm: 5028, width_mm: 1979, height_mm: 1776, wheelbase_mm: 2900, kerb_weight_kg: 2029 },
    performance: { fuel_combined_l100km: 9.4, co2_gkm: 221 },
    towing: { braked_kg: 2700, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 8, boot_litres: 205, fuel_tank_litres: 73 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  '29652-ti-l': {
    engine: { type: 'Petrol', displacement_cc: 3498, cylinders: 6, power_kw: 202, torque_nm: 340 },
    transmission: { type: 'Automatic', gears: 9, drive: '4x4' },
    dimensions: { length_mm: 5028, width_mm: 1979, height_mm: 1776, wheelbase_mm: 2900, kerb_weight_kg: 2112 },
    performance: { fuel_combined_l100km: 10.0, co2_gkm: 235 },
    towing: { braked_kg: 2700, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 8, boot_litres: 205, fuel_tank_litres: 73 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '20"', type: 'Alloy' },
  },

  // ── Patrol (model code 30170) ─────────────────────────────────────────
  '30170-ti': {
    engine: { type: 'Petrol', displacement_cc: 5552, cylinders: 8, power_kw: 298, torque_nm: 560 },
    transmission: { type: 'Automatic', gears: 7, drive: '4x4' },
    dimensions: { length_mm: 5165, width_mm: 1995, height_mm: 1940, wheelbase_mm: 2850, kerb_weight_kg: 2730 },
    performance: { fuel_combined_l100km: 14.4, co2_gkm: 334 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 8, boot_litres: 468, fuel_tank_litres: 100 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '30170-ti-l': {
    engine: { type: 'Petrol', displacement_cc: 5552, cylinders: 8, power_kw: 298, torque_nm: 560 },
    transmission: { type: 'Automatic', gears: 7, drive: '4x4' },
    dimensions: { length_mm: 5165, width_mm: 1995, height_mm: 1940, wheelbase_mm: 2850, kerb_weight_kg: 2770 },
    performance: { fuel_combined_l100km: 14.4, co2_gkm: 334 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 8, boot_litres: 468, fuel_tank_litres: 100 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── Navara MY25 (model code 29299) ────────────────────────────────────
  '29299-sl': {
    engine: { type: 'Diesel', displacement_cc: 2298, cylinders: 4, power_kw: 120, torque_nm: 403 },
    transmission: { type: 'Automatic', gears: 7, drive: '4WD' },
    dimensions: { length_mm: 5255, width_mm: 1850, height_mm: 1835, wheelbase_mm: 3150, kerb_weight_kg: 2050 },
    performance: { fuel_combined_l100km: 7.9, co2_gkm: 208 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '16"', type: 'Steel' },
  },
  '29299-st': {
    engine: { type: 'Diesel', displacement_cc: 2298, cylinders: 4, power_kw: 140, torque_nm: 450 },
    transmission: { type: 'Automatic', gears: 7, drive: '4WD' },
    dimensions: { length_mm: 5255, width_mm: 1850, height_mm: 1835, wheelbase_mm: 3150, kerb_weight_kg: 2080 },
    performance: { fuel_combined_l100km: 8.3, co2_gkm: 218 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  '29299-st-x': {
    engine: { type: 'Diesel', displacement_cc: 2298, cylinders: 4, power_kw: 140, torque_nm: 450 },
    transmission: { type: 'Automatic', gears: 7, drive: '4WD' },
    dimensions: { length_mm: 5255, width_mm: 1850, height_mm: 1835, wheelbase_mm: 3150, kerb_weight_kg: 2110 },
    performance: { fuel_combined_l100km: 8.3, co2_gkm: 218 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '29299-p4x': {
    engine: { type: 'Diesel', displacement_cc: 2298, cylinders: 4, power_kw: 140, torque_nm: 450 },
    transmission: { type: 'Automatic', gears: 7, drive: '4WD' },
    dimensions: { length_mm: 5255, width_mm: 1850, height_mm: 1870, wheelbase_mm: 3150, kerb_weight_kg: 2130 },
    performance: { fuel_combined_l100km: 8.3, co2_gkm: 218 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '17"', type: 'Alloy' },
  },

  // ── Navara MY26 (model code 30316) — same powertrain as MY25 ──────────
  '30316-sl': {
    engine: { type: 'Diesel', displacement_cc: 2298, cylinders: 4, power_kw: 120, torque_nm: 403 },
    transmission: { type: 'Automatic', gears: 7, drive: '4WD' },
    dimensions: { length_mm: 5335, width_mm: 1870, height_mm: 1840, wheelbase_mm: 3150, kerb_weight_kg: 2080 },
    performance: { fuel_combined_l100km: 8.0, co2_gkm: 210 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '17"', type: 'Steel' },
  },
  '30316-st': {
    engine: { type: 'Diesel', displacement_cc: 2298, cylinders: 4, power_kw: 140, torque_nm: 450 },
    transmission: { type: 'Automatic', gears: 7, drive: '4WD' },
    dimensions: { length_mm: 5335, width_mm: 1870, height_mm: 1840, wheelbase_mm: 3150, kerb_weight_kg: 2110 },
    performance: { fuel_combined_l100km: 8.4, co2_gkm: 220 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  '30316-st-x': {
    engine: { type: 'Diesel', displacement_cc: 2298, cylinders: 4, power_kw: 140, torque_nm: 450 },
    transmission: { type: 'Automatic', gears: 7, drive: '4WD' },
    dimensions: { length_mm: 5335, width_mm: 1870, height_mm: 1840, wheelbase_mm: 3150, kerb_weight_kg: 2140 },
    performance: { fuel_combined_l100km: 8.4, co2_gkm: 220 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  '30316-p4x': {
    engine: { type: 'Diesel', displacement_cc: 2298, cylinders: 4, power_kw: 140, torque_nm: 450 },
    transmission: { type: 'Automatic', gears: 7, drive: '4WD' },
    dimensions: { length_mm: 5335, width_mm: 1870, height_mm: 1875, wheelbase_mm: 3150, kerb_weight_kg: 2160 },
    performance: { fuel_combined_l100km: 8.4, co2_gkm: 220 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '17"', type: 'Alloy' },
  },

  // ── Z (model code 30273) ──────────────────────────────────────────────
  '30273-z': {
    engine: { type: 'Petrol', displacement_cc: 2997, cylinders: 6, power_kw: 298, torque_nm: 475 },
    transmission: { type: 'Manual', gears: 6, drive: 'RWD' },
    dimensions: { length_mm: 4379, width_mm: 1848, height_mm: 1316, wheelbase_mm: 2550, kerb_weight_kg: 1574 },
    performance: { fuel_combined_l100km: 10.4, co2_gkm: 240 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 2, seats: 2, boot_litres: 240, fuel_tank_litres: 62 },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  '30273-nismo': {
    engine: { type: 'Petrol', displacement_cc: 2997, cylinders: 6, power_kw: 309, torque_nm: 520 },
    transmission: { type: 'Automatic', gears: 9, drive: 'RWD' },
    dimensions: { length_mm: 4410, width_mm: 1848, height_mm: 1316, wheelbase_mm: 2550, kerb_weight_kg: 1657 },
    performance: { fuel_combined_l100km: 10.9, co2_gkm: 253 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 2, seats: 2, boot_litres: 240, fuel_tank_litres: 62 },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
};

// ── Match product to spec data ──────────────────────────────────────────
function findSpec(product) {
  if (!product.external_key) return null;
  // external_key pattern: nissan-{modelCode}-{grade}-{trans}
  const match = product.external_key.match(/^nissan-(\d+)-(.+?)-(auto|manual)$/);
  if (!match) return null;
  const [, code, gradeSlug] = match;
  const key = `${code}-${gradeSlug}`;
  if (SPECS[key]) return { spec: SPECS[key], match: key };

  // Try without trailing modifiers (e.g. nissan-30273-z-auto -> 30273-z)
  // Grade might include transmission type in the slug
  for (const [specKey, spec] of Object.entries(SPECS)) {
    if (specKey.startsWith(code + '-') && key.startsWith(specKey)) {
      return { spec, match: specKey };
    }
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Nissan AU Specs Seed ===\n');

  const { data: products, error } = await sb.from('products')
    .select('id, title, external_key, transmission, drivetrain')
    .eq('oem_id', OEM_ID);
  if (error) { console.error('Fetch error:', error.message); process.exit(1); }
  console.log(`Found ${products.length} Nissan products\n`);

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
    // For Z, handle both manual and auto transmission
    const trans = p.external_key?.includes('-manual') ? 'Manual' : spec.transmission.type;
    const specToSave = p.external_key?.includes('-manual') && spec.transmission.type !== 'Manual'
      ? { ...spec, transmission: { ...spec.transmission, type: 'Manual' } }
      : spec;

    const { error: upErr } = await sb.from('products')
      .update({
        specs_json: specToSave,
        engine_size: spec.engine.displacement_cc ? `${(spec.engine.displacement_cc / 1000).toFixed(1)}L` : null,
        cylinders: spec.engine.cylinders,
        transmission: trans,
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
