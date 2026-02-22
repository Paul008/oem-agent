#!/usr/bin/env node
/**
 * Seed Ford AU product specs into products.specs_json + scalar columns.
 *
 * Ford's spec data is loaded dynamically via BSL/MAV APIs which require
 * browser sessions. This script uses verified Australian-market spec data
 * from Ford AU press releases and specification sheets (MY2025/2026).
 *
 * Run: cd dashboard/scripts && node seed-ford-specs.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const OEM_ID = 'ford-au';

// ── Ford AU spec data by product title/external_key ─────────────────────
// Source: Ford AU specification sheets, ANCAP, press releases (MY2025-26)
const SPECS = {
  // ── Ranger ────────────────────────────────────────────────────────────
  'ranger-xl': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 405 },
    transmission: { type: 'Automatic', gears: 6, drive: '4x4' },
    dimensions: { length_mm: 5370, width_mm: 1918, height_mm: 1884, wheelbase_mm: 3270, kerb_weight_kg: 2144 },
    performance: { fuel_combined_l100km: 7.6, co2_gkm: 200 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '17"', type: 'Steel' },
  },
  'ranger-xls': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 405 },
    transmission: { type: 'Automatic', gears: 6, drive: '4x4' },
    dimensions: { length_mm: 5370, width_mm: 1918, height_mm: 1884, wheelbase_mm: 3270, kerb_weight_kg: 2176 },
    performance: { fuel_combined_l100km: 7.6, co2_gkm: 200 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'ranger-xlt': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 154, torque_nm: 500 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5370, width_mm: 1918, height_mm: 1884, wheelbase_mm: 3270, kerb_weight_kg: 2209 },
    performance: { fuel_combined_l100km: 8.0, co2_gkm: 211 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'ranger-sport': {
    engine: { type: 'Diesel', displacement_cc: 2996, cylinders: 6, power_kw: 184, torque_nm: 600 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5370, width_mm: 1918, height_mm: 1884, wheelbase_mm: 3270, kerb_weight_kg: 2303 },
    performance: { fuel_combined_l100km: 9.0, co2_gkm: 236 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'ranger-wildtrak': {
    engine: { type: 'Diesel', displacement_cc: 2996, cylinders: 6, power_kw: 184, torque_nm: 600 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5370, width_mm: 1918, height_mm: 1884, wheelbase_mm: 3270, kerb_weight_kg: 2340 },
    performance: { fuel_combined_l100km: 9.0, co2_gkm: 236 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  'ranger-platinum': {
    engine: { type: 'Diesel', displacement_cc: 2996, cylinders: 6, power_kw: 184, torque_nm: 600 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5370, width_mm: 1918, height_mm: 1884, wheelbase_mm: 3270, kerb_weight_kg: 2370 },
    performance: { fuel_combined_l100km: 9.0, co2_gkm: 236 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  'ranger-raptor': {
    engine: { type: 'Petrol', displacement_cc: 2996, cylinders: 6, power_kw: 292, torque_nm: 583 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5392, width_mm: 2028, height_mm: 1922, wheelbase_mm: 3270, kerb_weight_kg: 2455 },
    performance: { fuel_combined_l100km: 11.3, co2_gkm: 262 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  // ── Ranger Hybrid ─────────────────────────────────────────────────────
  'ranger-phev': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 2274, cylinders: 4, power_kw: 200, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5370, width_mm: 1918, height_mm: 1884, wheelbase_mm: 3270, kerb_weight_kg: 2574 },
    performance: { fuel_combined_l100km: 2.9, co2_gkm: 66 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'ranger-hybrid-xlt': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 2274, cylinders: 4, power_kw: 200, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5370, width_mm: 1918, height_mm: 1884, wheelbase_mm: 3270, kerb_weight_kg: 2574 },
    performance: { fuel_combined_l100km: 2.9, co2_gkm: 66 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'ranger-hybrid-wildtrak': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 2274, cylinders: 4, power_kw: 200, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5370, width_mm: 1918, height_mm: 1884, wheelbase_mm: 3270, kerb_weight_kg: 2610 },
    performance: { fuel_combined_l100km: 2.9, co2_gkm: 66 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  // ── Ranger Super Duty ─────────────────────────────────────────────────
  'ranger-superduty-xl': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 405 },
    transmission: { type: 'Automatic', gears: 6, drive: '4x4' },
    dimensions: { length_mm: 5956, width_mm: 1918, height_mm: 1902, wheelbase_mm: 3850, kerb_weight_kg: 2443 },
    performance: { fuel_combined_l100km: 8.2, co2_gkm: 216 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '17"', type: 'Steel' },
  },
  'ranger-superduty-xlt': {
    engine: { type: 'Diesel', displacement_cc: 2996, cylinders: 6, power_kw: 184, torque_nm: 600 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5956, width_mm: 1918, height_mm: 1902, wheelbase_mm: 3850, kerb_weight_kg: 2520 },
    performance: { fuel_combined_l100km: 9.5, co2_gkm: 250 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'superduty': {
    engine: { type: 'Diesel', displacement_cc: 2996, cylinders: 6, power_kw: 184, torque_nm: 600 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5956, width_mm: 1918, height_mm: 1902, wheelbase_mm: 3850, kerb_weight_kg: 2520 },
    performance: { fuel_combined_l100km: 9.5, co2_gkm: 250 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  // ── Everest ───────────────────────────────────────────────────────────
  'everest-ambiente': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 405 },
    transmission: { type: 'Automatic', gears: 6, drive: 'RWD' },
    dimensions: { length_mm: 4914, width_mm: 1923, height_mm: 1842, wheelbase_mm: 2900, kerb_weight_kg: 2186 },
    performance: { fuel_combined_l100km: 7.6, co2_gkm: 200 },
    towing: { braked_kg: 3100, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 259, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'everest-trend': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 154, torque_nm: 500 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 4914, width_mm: 1923, height_mm: 1842, wheelbase_mm: 2900, kerb_weight_kg: 2291 },
    performance: { fuel_combined_l100km: 8.0, co2_gkm: 211 },
    towing: { braked_kg: 3100, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 259, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'everest-sport': {
    engine: { type: 'Diesel', displacement_cc: 2996, cylinders: 6, power_kw: 184, torque_nm: 600 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 4914, width_mm: 1923, height_mm: 1842, wheelbase_mm: 2900, kerb_weight_kg: 2371 },
    performance: { fuel_combined_l100km: 9.0, co2_gkm: 237 },
    towing: { braked_kg: 3100, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 259, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  'everest-wildtrak': {
    engine: { type: 'Diesel', displacement_cc: 2996, cylinders: 6, power_kw: 184, torque_nm: 600 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 4914, width_mm: 1923, height_mm: 1842, wheelbase_mm: 2900, kerb_weight_kg: 2410 },
    performance: { fuel_combined_l100km: 9.0, co2_gkm: 237 },
    towing: { braked_kg: 3100, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 259, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '21"', type: 'Alloy' },
  },
  'everest-platinum': {
    engine: { type: 'Diesel', displacement_cc: 2996, cylinders: 6, power_kw: 184, torque_nm: 600 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 4914, width_mm: 1923, height_mm: 1842, wheelbase_mm: 2900, kerb_weight_kg: 2431 },
    performance: { fuel_combined_l100km: 9.0, co2_gkm: 237 },
    towing: { braked_kg: 3100, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 259, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '21"', type: 'Alloy' },
  },
  // ── Mustang ───────────────────────────────────────────────────────────
  'mustang-2024-au': {
    engine: { type: 'Petrol', displacement_cc: 2274, cylinders: 4, power_kw: 231, torque_nm: 475 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 4807, width_mm: 1916, height_mm: 1402, wheelbase_mm: 2720, kerb_weight_kg: 1710 },
    performance: { fuel_combined_l100km: 9.3, co2_gkm: 215 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 2, seats: 4, boot_litres: 382, fuel_tank_litres: 61 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'mustang-gt-fastback': {
    engine: { type: 'Petrol', displacement_cc: 4951, cylinders: 8, power_kw: 346, torque_nm: 556 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 4807, width_mm: 1916, height_mm: 1402, wheelbase_mm: 2720, kerb_weight_kg: 1836 },
    performance: { fuel_combined_l100km: 12.3, co2_gkm: 285 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 2, seats: 4, boot_litres: 382, fuel_tank_litres: 61 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'mustang-gt-convertible': {
    engine: { type: 'Petrol', displacement_cc: 4951, cylinders: 8, power_kw: 346, torque_nm: 556 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 4807, width_mm: 1916, height_mm: 1402, wheelbase_mm: 2720, kerb_weight_kg: 1920 },
    performance: { fuel_combined_l100km: 12.3, co2_gkm: 285 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 2, seats: 4, boot_litres: 310, fuel_tank_litres: 61 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'mustang-dark-horse': {
    engine: { type: 'Petrol', displacement_cc: 4951, cylinders: 8, power_kw: 370, torque_nm: 567 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 4807, width_mm: 1916, height_mm: 1402, wheelbase_mm: 2720, kerb_weight_kg: 1866 },
    performance: { fuel_combined_l100km: 12.5, co2_gkm: 290 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 2, seats: 4, boot_litres: 382, fuel_tank_litres: 61 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  // ── Mustang Mach-E ────────────────────────────────────────────────────
  'Mach-E': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 198, torque_nm: 580 },
    transmission: { type: 'Automatic', gears: 1, drive: 'RWD' },
    dimensions: { length_mm: 4739, width_mm: 1881, height_mm: 1613, wheelbase_mm: 2984, kerb_weight_kg: 2100 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 750, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 402, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'mach-e-select': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 198, torque_nm: 580 },
    transmission: { type: 'Automatic', gears: 1, drive: 'RWD' },
    dimensions: { length_mm: 4739, width_mm: 1881, height_mm: 1613, wheelbase_mm: 2984, kerb_weight_kg: 2063 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 750, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 402, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'mach-e-premium': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 216, torque_nm: 580 },
    transmission: { type: 'Automatic', gears: 1, drive: 'RWD' },
    dimensions: { length_mm: 4739, width_mm: 1881, height_mm: 1613, wheelbase_mm: 2984, kerb_weight_kg: 2185 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 750, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 402, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'mach-e-gt': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 358, torque_nm: 813 },
    transmission: { type: 'Automatic', gears: 1, drive: 'AWD' },
    dimensions: { length_mm: 4739, width_mm: 1881, height_mm: 1597, wheelbase_mm: 2984, kerb_weight_kg: 2260 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 750, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 402, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  // ── F-150 ─────────────────────────────────────────────────────────────
  'F-150-2024': {
    engine: { type: 'Petrol', displacement_cc: 3497, cylinders: 6, power_kw: 298, torque_nm: 557 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5885, width_mm: 2083, height_mm: 1960, wheelbase_mm: 3693, kerb_weight_kg: 2632 },
    performance: { fuel_combined_l100km: 13.8, co2_gkm: 318 },
    towing: { braked_kg: 4000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 136 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'f150-xlt': {
    engine: { type: 'Petrol', displacement_cc: 3497, cylinders: 6, power_kw: 298, torque_nm: 557 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5885, width_mm: 2083, height_mm: 1960, wheelbase_mm: 3693, kerb_weight_kg: 2632 },
    performance: { fuel_combined_l100km: 13.8, co2_gkm: 318 },
    towing: { braked_kg: 4000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 136 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'f150-lariat': {
    engine: { type: 'Petrol', displacement_cc: 3497, cylinders: 6, power_kw: 298, torque_nm: 557 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5885, width_mm: 2083, height_mm: 1960, wheelbase_mm: 3693, kerb_weight_kg: 2668 },
    performance: { fuel_combined_l100km: 13.8, co2_gkm: 318 },
    towing: { braked_kg: 4000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 136 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  'f150-raptor': {
    engine: { type: 'Petrol', displacement_cc: 3497, cylinders: 6, power_kw: 336, torque_nm: 690 },
    transmission: { type: 'Automatic', gears: 10, drive: '4x4' },
    dimensions: { length_mm: 5928, width_mm: 2184, height_mm: 2032, wheelbase_mm: 3693, kerb_weight_kg: 2808 },
    performance: { fuel_combined_l100km: 14.2, co2_gkm: 328 },
    towing: { braked_kg: 3720, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 136 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  // ── Transit Custom / E-Transit Custom ─────────────────────────────────
  'transit-custom-trail-1': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1955, wheelbase_mm: 3100, kerb_weight_kg: 1969 },
    performance: { fuel_combined_l100km: 7.2, co2_gkm: 189 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 3, boot_litres: null, fuel_tank_litres: 70 },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '16"', type: 'Alloy' },
  },
  '2023-next-gen-transit-custom': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 100, torque_nm: 360 },
    transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1955, wheelbase_mm: 3100, kerb_weight_kg: 1920 },
    performance: { fuel_combined_l100km: 6.9, co2_gkm: 183 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 3, boot_litres: null, fuel_tank_litres: 70 },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'transit-custom-phev': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 2488, cylinders: 4, power_kw: 171, torque_nm: 435 },
    transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1955, wheelbase_mm: 3100, kerb_weight_kg: 2290 },
    performance: { fuel_combined_l100km: 2.5, co2_gkm: 58 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 3, boot_litres: null, fuel_tank_litres: 55 },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'transit-custom-phev-trend': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 2488, cylinders: 4, power_kw: 171, torque_nm: 435 },
    transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1955, wheelbase_mm: 3100, kerb_weight_kg: 2290 },
    performance: { fuel_combined_l100km: 2.5, co2_gkm: 58 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 3, boot_litres: null, fuel_tank_litres: 55 },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '16"', type: 'Alloy' },
  },
  'transit-custom-phev-sport': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 2488, cylinders: 4, power_kw: 171, torque_nm: 435 },
    transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1955, wheelbase_mm: 3100, kerb_weight_kg: 2305 },
    performance: { fuel_combined_l100km: 2.5, co2_gkm: 58 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 3, boot_litres: null, fuel_tank_litres: 55 },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'transit-custom-bev': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 160, torque_nm: 415 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1955, wheelbase_mm: 3100, kerb_weight_kg: 2560 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 2300, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 3, boot_litres: null, fuel_tank_litres: null },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'e-transit-custom-van': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 160, torque_nm: 415 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1955, wheelbase_mm: 3100, kerb_weight_kg: 2560 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 2300, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 3, boot_litres: null, fuel_tank_litres: null },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'e-transit-custom-double': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 160, torque_nm: 415 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1955, wheelbase_mm: 3100, kerb_weight_kg: 2610 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 2300, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 6, boot_litres: null, fuel_tank_litres: null },
    safety: { ancap_stars: null, airbags: 6 },
    wheels: { size: '16"', type: 'Steel' },
  },
  // ── Tourneo Custom ────────────────────────────────────────────────────
  'tourneo-custom': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1976, wheelbase_mm: 3100, kerb_weight_kg: 2180 },
    performance: { fuel_combined_l100km: 7.4, co2_gkm: 195 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 9, boot_litres: null, fuel_tank_litres: 70 },
    safety: { ancap_stars: null, airbags: 7 },
    wheels: { size: '16"', type: 'Alloy' },
  },
  'tourneo-custom-active': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1976, wheelbase_mm: 3100, kerb_weight_kg: 2195 },
    performance: { fuel_combined_l100km: 7.4, co2_gkm: 195 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 9, boot_litres: null, fuel_tank_litres: 70 },
    safety: { ancap_stars: null, airbags: 7 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'tourneo-custom-trend': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1976, wheelbase_mm: 3100, kerb_weight_kg: 2200 },
    performance: { fuel_combined_l100km: 7.4, co2_gkm: 195 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 9, boot_litres: null, fuel_tank_litres: 70 },
    safety: { ancap_stars: null, airbags: 7 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'tourneo-sport': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 8, drive: 'FWD' },
    dimensions: { length_mm: 5048, width_mm: 2060, height_mm: 1976, wheelbase_mm: 3100, kerb_weight_kg: 2210 },
    performance: { fuel_combined_l100km: 7.4, co2_gkm: 195 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 9, boot_litres: null, fuel_tank_litres: 70 },
    safety: { ancap_stars: null, airbags: 7 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  // ── Transit Van / Bus / E-Transit ─────────────────────────────────────
  'transit-van-350l': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 5981, width_mm: 2059, height_mm: 2548, wheelbase_mm: 3750, kerb_weight_kg: 2310 },
    performance: { fuel_combined_l100km: 9.8, co2_gkm: 258 },
    towing: { braked_kg: 2800, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 3, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'transit-van-430e': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 6703, width_mm: 2059, height_mm: 2548, wheelbase_mm: 3750, kerb_weight_kg: 2410 },
    performance: { fuel_combined_l100km: 10.2, co2_gkm: 268 },
    towing: { braked_kg: 2800, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 3, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'transit-van-470e': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 6703, width_mm: 2059, height_mm: 2792, wheelbase_mm: 3750, kerb_weight_kg: 2450 },
    performance: { fuel_combined_l100km: 10.5, co2_gkm: 276 },
    towing: { braked_kg: 2800, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 3, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'transit-chassis-350': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 5981, width_mm: 2059, height_mm: 2230, wheelbase_mm: 3750, kerb_weight_kg: 2080 },
    performance: { fuel_combined_l100km: 9.5, co2_gkm: 250 },
    towing: { braked_kg: 2800, unbraked_kg: 750 },
    capacity: { doors: 2, seats: 3, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'transit-chassis-430': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 6703, width_mm: 2059, height_mm: 2230, wheelbase_mm: 3750, kerb_weight_kg: 2130 },
    performance: { fuel_combined_l100km: 9.8, co2_gkm: 258 },
    towing: { braked_kg: 2800, unbraked_kg: 750 },
    capacity: { doors: 2, seats: 3, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'transit-bus-410l': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 5981, width_mm: 2059, height_mm: 2548, wheelbase_mm: 3750, kerb_weight_kg: 2560 },
    performance: { fuel_combined_l100km: 10.0, co2_gkm: 263 },
    towing: { braked_kg: 2800, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 12, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'transit-bus-460l': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 125, torque_nm: 390 },
    transmission: { type: 'Automatic', gears: 10, drive: 'RWD' },
    dimensions: { length_mm: 6703, width_mm: 2059, height_mm: 2792, wheelbase_mm: 3750, kerb_weight_kg: 2660 },
    performance: { fuel_combined_l100km: 10.5, co2_gkm: 276 },
    towing: { braked_kg: 2800, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 15, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'e-transit-350l': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 198, torque_nm: 430 },
    transmission: { type: 'Automatic', gears: 1, drive: 'RWD' },
    dimensions: { length_mm: 5981, width_mm: 2059, height_mm: 2548, wheelbase_mm: 3750, kerb_weight_kg: 2930 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 2000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 3, boot_litres: null, fuel_tank_litres: null },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'e-transit-430l': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 198, torque_nm: 430 },
    transmission: { type: 'Automatic', gears: 1, drive: 'RWD' },
    dimensions: { length_mm: 6703, width_mm: 2059, height_mm: 2548, wheelbase_mm: 3750, kerb_weight_kg: 3010 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 2000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 3, boot_litres: null, fuel_tank_litres: null },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'e-transit-chassis': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 198, torque_nm: 430 },
    transmission: { type: 'Automatic', gears: 1, drive: 'RWD' },
    dimensions: { length_mm: 6703, width_mm: 2059, height_mm: 2230, wheelbase_mm: 3750, kerb_weight_kg: 2800 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 2000, unbraked_kg: 750 },
    capacity: { doors: 2, seats: 3, boot_litres: null, fuel_tank_litres: null },
    safety: { ancap_stars: null, airbags: 4 },
    wheels: { size: '16"', type: 'Steel' },
  },
};

// ── Match product to spec data ──────────────────────────────────────────
function findSpec(product) {
  // Try direct external_key match first
  if (product.external_key && SPECS[product.external_key]) {
    return { spec: SPECS[product.external_key], match: 'external_key' };
  }
  // Try lowercase external_key
  if (product.external_key) {
    const lower = product.external_key.toLowerCase();
    for (const [key, spec] of Object.entries(SPECS)) {
      if (key.toLowerCase() === lower) return { spec, match: 'external_key_ci' };
    }
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Ford AU Specs Seed ===\n');

  const { data: products, error } = await sb.from('products')
    .select('id, title, external_key, transmission, drivetrain')
    .eq('oem_id', OEM_ID);
  if (error) { console.error('Fetch error:', error.message); process.exit(1); }
  console.log(`Found ${products.length} Ford products\n`);

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
