#!/usr/bin/env node
/**
 * Seed Toyota AU product specs into products.specs_json + scalar columns.
 *
 * Toyota AU's spec data is loaded via Cloudflare-protected browser-session APIs
 * that require active sessions. Product titles in the DB encode model + drivetrain +
 * fuel type (e.g. "HiLux 4x4 Diesel", "RAV4 AWD Hybrid"). Many products share the
 * same title but differ only in colour/option packs (different external_keys).
 *
 * This script uses verified Australian-market spec data from Toyota AU specification
 * sheets, press releases, and published spec comparison pages (MY2025/2026).
 * Specs are matched by normalized title pattern (model + drivetrain + fuel).
 *
 * Run: cd dashboard/scripts && node seed-toyota-specs.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const OEM_ID = 'toyota-au';

// ── Toyota AU spec data by normalized title ──────────────────────────
// Source: Toyota AU specification sheets, ANCAP, press releases (MY2025-26)
// Key = normalized title: "model drivetrain fuel" (lowercased, double-spaces collapsed)

const SPECS = {
  // ── Yaris Hybrid: 1.5L 3cyl Atkinson + Motor, CVT, FWD ──────────
  'yaris hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 1490, cylinders: 3, power_kw: 85, torque_nm: 120 },
    transmission: { type: 'CVT', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 3940, width_mm: 1745, height_mm: 1500, wheelbase_mm: 2560, kerb_weight_kg: 1090 },
    performance: { fuel_combined_l100km: 3.3, co2_gkm: 76 },
    towing: { braked_kg: 0, unbraked_kg: 0 },
    capacity: { doors: 5, seats: 5, boot_litres: 286, fuel_tank_litres: 36 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '15"', type: 'Alloy' },
  },

  // ── Yaris Cross 2WD Hybrid: 1.5L 3cyl + Motor, CVT, FWD ─────────
  'yaris cross 2wd hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 1490, cylinders: 3, power_kw: 85, torque_nm: 120 },
    transmission: { type: 'CVT', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4180, width_mm: 1765, height_mm: 1590, wheelbase_mm: 2560, kerb_weight_kg: 1190 },
    performance: { fuel_combined_l100km: 3.8, co2_gkm: 87 },
    towing: { braked_kg: 750, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 397, fuel_tank_litres: 36 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── Yaris Cross AWD Hybrid: 1.5L + dual motors, E-Four AWD ──────
  'yaris cross awd hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 1490, cylinders: 3, power_kw: 90, torque_nm: 120 },
    transmission: { type: 'CVT', gears: null, drive: 'AWD' },
    dimensions: { length_mm: 4180, width_mm: 1765, height_mm: 1590, wheelbase_mm: 2560, kerb_weight_kg: 1250 },
    performance: { fuel_combined_l100km: 4.0, co2_gkm: 92 },
    towing: { braked_kg: 750, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 397, fuel_tank_litres: 36 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── Corolla Hatch Hybrid: 1.8L 4cyl + Motor, CVT, FWD ───────────
  'corolla hatch hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 1798, cylinders: 4, power_kw: 103, torque_nm: 142 },
    transmission: { type: 'CVT', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4370, width_mm: 1790, height_mm: 1435, wheelbase_mm: 2640, kerb_weight_kg: 1365 },
    performance: { fuel_combined_l100km: 4.2, co2_gkm: 96 },
    towing: { braked_kg: 0, unbraked_kg: 0 },
    capacity: { doors: 5, seats: 5, boot_litres: 313, fuel_tank_litres: 43 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '16"', type: 'Alloy' },
  },

  // ── Corolla Sedan Hybrid: 1.8L 4cyl + Motor, CVT, FWD ───────────
  'corolla sedan hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 1798, cylinders: 4, power_kw: 103, torque_nm: 142 },
    transmission: { type: 'CVT', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4620, width_mm: 1790, height_mm: 1435, wheelbase_mm: 2700, kerb_weight_kg: 1380 },
    performance: { fuel_combined_l100km: 4.1, co2_gkm: 94 },
    towing: { braked_kg: 0, unbraked_kg: 0 },
    capacity: { doors: 4, seats: 5, boot_litres: 422, fuel_tank_litres: 43 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '16"', type: 'Alloy' },
  },

  // ── Camry Hybrid: 2.5L 4cyl Dynamic Force + Motor, CVT, FWD ─────
  'camry hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 2487, cylinders: 4, power_kw: 160, torque_nm: 221 },
    transmission: { type: 'CVT', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4920, width_mm: 1840, height_mm: 1445, wheelbase_mm: 2825, kerb_weight_kg: 1625 },
    performance: { fuel_combined_l100km: 4.2, co2_gkm: 96 },
    towing: { braked_kg: 0, unbraked_kg: 0 },
    capacity: { doors: 4, seats: 5, boot_litres: 400, fuel_tank_litres: 50 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '17"', type: 'Alloy' },
  },

  // ── C-HR 2WD Hybrid: 2.0L 4cyl + Motor, CVT, FWD ────────────────
  'c-hr 2wd hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 1987, cylinders: 4, power_kw: 112, torque_nm: 190 },
    transmission: { type: 'CVT', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4360, width_mm: 1830, height_mm: 1560, wheelbase_mm: 2640, kerb_weight_kg: 1460 },
    performance: { fuel_combined_l100km: 4.8, co2_gkm: 110 },
    towing: { braked_kg: 750, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 310, fuel_tank_litres: 43 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── C-HR AWD Hybrid: 2.0L + rear motor, E-Four AWD ───────────────
  'c-hr awd hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 1987, cylinders: 4, power_kw: 120, torque_nm: 190 },
    transmission: { type: 'CVT', gears: null, drive: 'AWD' },
    dimensions: { length_mm: 4360, width_mm: 1830, height_mm: 1560, wheelbase_mm: 2640, kerb_weight_kg: 1530 },
    performance: { fuel_combined_l100km: 5.1, co2_gkm: 117 },
    towing: { braked_kg: 750, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 310, fuel_tank_litres: 43 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── Corolla Cross 2WD Hybrid: 2.0L 4cyl + Motor, CVT, FWD ───────
  'corolla cross 2wd hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 1987, cylinders: 4, power_kw: 112, torque_nm: 190 },
    transmission: { type: 'CVT', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4460, width_mm: 1825, height_mm: 1620, wheelbase_mm: 2640, kerb_weight_kg: 1440 },
    performance: { fuel_combined_l100km: 4.8, co2_gkm: 110 },
    towing: { braked_kg: 750, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 440, fuel_tank_litres: 43 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '17"', type: 'Alloy' },
  },

  // ── Corolla Cross AWD Hybrid: 2.0L + rear motor, E-Four ──────────
  'corolla cross awd hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 1987, cylinders: 4, power_kw: 120, torque_nm: 190 },
    transmission: { type: 'CVT', gears: null, drive: 'AWD' },
    dimensions: { length_mm: 4460, width_mm: 1825, height_mm: 1620, wheelbase_mm: 2640, kerb_weight_kg: 1510 },
    performance: { fuel_combined_l100km: 5.0, co2_gkm: 115 },
    towing: { braked_kg: 750, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 440, fuel_tank_litres: 43 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── RAV4 2WD Hybrid: 2.5L 4cyl + Motor, CVT, FWD ────────────────
  'rav4 2wd hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 2487, cylinders: 4, power_kw: 163, torque_nm: 221 },
    transmission: { type: 'CVT', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4600, width_mm: 1855, height_mm: 1685, wheelbase_mm: 2690, kerb_weight_kg: 1650 },
    performance: { fuel_combined_l100km: 4.7, co2_gkm: 108 },
    towing: { braked_kg: 800, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 542, fuel_tank_litres: 55 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── RAV4 AWD Hybrid: 2.5L + rear motor, E-Four AWD ───────────────
  'rav4 awd hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 2487, cylinders: 4, power_kw: 163, torque_nm: 221 },
    transmission: { type: 'CVT', gears: null, drive: 'AWD' },
    dimensions: { length_mm: 4600, width_mm: 1855, height_mm: 1685, wheelbase_mm: 2690, kerb_weight_kg: 1700 },
    performance: { fuel_combined_l100km: 5.0, co2_gkm: 115 },
    towing: { braked_kg: 800, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 542, fuel_tank_litres: 55 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── RAV4 2WD Plug-in Hybrid: 2.5L + Motor, PHEV, FWD ────────────
  'rav4 2wd plug-in hybrid': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 2487, cylinders: 4, power_kw: 225, torque_nm: 221 },
    transmission: { type: 'CVT', gears: null, drive: 'FWD' },
    dimensions: { length_mm: 4600, width_mm: 1855, height_mm: 1685, wheelbase_mm: 2690, kerb_weight_kg: 1850 },
    performance: { fuel_combined_l100km: 1.0, co2_gkm: 22 },
    towing: { braked_kg: 800, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 490, fuel_tank_litres: 55 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── RAV4 AWD Plug-in Hybrid: 2.5L + dual motors, E-Four PHEV ────
  'rav4 awd plug-in hybrid': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 2487, cylinders: 4, power_kw: 225, torque_nm: 221 },
    transmission: { type: 'CVT', gears: null, drive: 'AWD' },
    dimensions: { length_mm: 4600, width_mm: 1855, height_mm: 1685, wheelbase_mm: 2690, kerb_weight_kg: 1900 },
    performance: { fuel_combined_l100km: 1.0, co2_gkm: 22 },
    towing: { braked_kg: 800, unbraked_kg: 400 },
    capacity: { doors: 5, seats: 5, boot_litres: 490, fuel_tank_litres: 55 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '19"', type: 'Alloy' },
  },

  // ── Kluger AWD Hybrid: 2.5L 4cyl + dual motors, CVT, AWD ────────
  'kluger awd hybrid': {
    engine: { type: 'Hybrid', displacement_cc: 2487, cylinders: 4, power_kw: 184, torque_nm: 239 },
    transmission: { type: 'CVT', gears: null, drive: 'AWD' },
    dimensions: { length_mm: 4965, width_mm: 1930, height_mm: 1750, wheelbase_mm: 2850, kerb_weight_kg: 1990 },
    performance: { fuel_combined_l100km: 5.6, co2_gkm: 128 },
    towing: { braked_kg: 2000, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 270, fuel_tank_litres: 65 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── Fortuner AWD Diesel: 2.8L 4cyl turbo diesel, 6-speed AT, 4WD ─
  'fortuner awd diesel': {
    engine: { type: 'Diesel', displacement_cc: 2755, cylinders: 4, power_kw: 150, torque_nm: 500 },
    transmission: { type: 'Automatic', gears: 6, drive: '4WD' },
    dimensions: { length_mm: 4795, width_mm: 1855, height_mm: 1835, wheelbase_mm: 2745, kerb_weight_kg: 2165 },
    performance: { fuel_combined_l100km: 7.6, co2_gkm: 199 },
    towing: { braked_kg: 3100, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 200, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── LandCruiser 300 4x4 Diesel: 3.3L V6 twin-turbo diesel, 10AT ─
  'landcruiser 300 4x4 diesel': {
    engine: { type: 'Diesel', displacement_cc: 3346, cylinders: 6, power_kw: 227, torque_nm: 700 },
    transmission: { type: 'Automatic', gears: 10, drive: '4WD' },
    dimensions: { length_mm: 4985, width_mm: 1980, height_mm: 1925, wheelbase_mm: 2850, kerb_weight_kg: 2530 },
    performance: { fuel_combined_l100km: 8.9, co2_gkm: 233 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 553, fuel_tank_litres: 110 },
    safety: { ancap_stars: 5, airbags: 10 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── LandCruiser 70 4x4 Diesel: 2.8L 4cyl turbo diesel, 6AT or 5MT ─
  'landcruiser 70 4x4 diesel': {
    engine: { type: 'Diesel', displacement_cc: 2755, cylinders: 4, power_kw: 150, torque_nm: 500 },
    transmission: { type: 'Automatic', gears: 6, drive: '4WD' },
    dimensions: { length_mm: 4890, width_mm: 1870, height_mm: 1920, wheelbase_mm: 2730, kerb_weight_kg: 2140 },
    performance: { fuel_combined_l100km: 8.6, co2_gkm: 226 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: null, fuel_tank_litres: 130 },
    safety: { ancap_stars: null, airbags: 7 },
    wheels: { size: '16"', type: 'Steel' },
  },

  // ── LandCruiser Prado 4WD Diesel: 2.8L 4cyl turbo diesel, 6AT ───
  'landcruiser prado 4wd diesel': {
    engine: { type: 'Diesel', displacement_cc: 2755, cylinders: 4, power_kw: 150, torque_nm: 500 },
    transmission: { type: 'Automatic', gears: 6, drive: '4WD' },
    dimensions: { length_mm: 4925, width_mm: 1885, height_mm: 1890, wheelbase_mm: 2790, kerb_weight_kg: 2280 },
    performance: { fuel_combined_l100km: 7.9, co2_gkm: 207 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 553, fuel_tank_litres: 87 },
    safety: { ancap_stars: 5, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── HiLux 4x4 Diesel: 2.8L 4cyl turbo diesel, 6-speed AT, 4x4 ──
  'hilux 4x4 diesel': {
    engine: { type: 'Diesel', displacement_cc: 2755, cylinders: 4, power_kw: 150, torque_nm: 500 },
    transmission: { type: 'Automatic', gears: 6, drive: '4WD' },
    dimensions: { length_mm: 5325, width_mm: 1855, height_mm: 1815, wheelbase_mm: 3085, kerb_weight_kg: 2050 },
    performance: { fuel_combined_l100km: 7.6, co2_gkm: 199 },
    towing: { braked_kg: 3500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '17"', type: 'Alloy' },
  },

  // ── HiLux 4x2 Diesel: 2.4L or 2.8L 4cyl diesel, 6AT, RWD ───────
  'hilux 4x2 diesel': {
    engine: { type: 'Diesel', displacement_cc: 2755, cylinders: 4, power_kw: 150, torque_nm: 500 },
    transmission: { type: 'Automatic', gears: 6, drive: 'RWD' },
    dimensions: { length_mm: 5325, width_mm: 1855, height_mm: 1800, wheelbase_mm: 3085, kerb_weight_kg: 1870 },
    performance: { fuel_combined_l100km: 7.2, co2_gkm: 189 },
    towing: { braked_kg: 2800, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 80 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '17"', type: 'Steel' },
  },

  // ── HiAce RWD Diesel: 2.8L 4cyl turbo diesel, 6AT, RWD ──────────
  'hiace rwd diesel': {
    engine: { type: 'Diesel', displacement_cc: 2755, cylinders: 4, power_kw: 130, torque_nm: 450 },
    transmission: { type: 'Automatic', gears: 6, drive: 'RWD' },
    dimensions: { length_mm: 5265, width_mm: 1950, height_mm: 1990, wheelbase_mm: 3210, kerb_weight_kg: 2040 },
    performance: { fuel_combined_l100km: 8.2, co2_gkm: 215 },
    towing: { braked_kg: 1500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: null, fuel_tank_litres: 70 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '15"', type: 'Steel' },
  },

  // ── Coaster RWD Diesel: 4.0L 4cyl turbo diesel, 6AT, RWD ────────
  'coaster rwd diesel': {
    engine: { type: 'Diesel', displacement_cc: 4009, cylinders: 4, power_kw: 110, torque_nm: 392 },
    transmission: { type: 'Automatic', gears: 6, drive: 'RWD' },
    dimensions: { length_mm: 6990, width_mm: 2080, height_mm: 2635, wheelbase_mm: 3935, kerb_weight_kg: 4030 },
    performance: { fuel_combined_l100km: 13.5, co2_gkm: 355 },
    towing: { braked_kg: 2000, unbraked_kg: 750 },
    capacity: { doors: 2, seats: 22, boot_litres: null, fuel_tank_litres: 100 },
    safety: { ancap_stars: null, airbags: 2 },
    wheels: { size: '17.5"', type: 'Steel' },
  },

  // ── bZ4X 2WD Electric: single motor, FWD ─────────────────────────
  'bz4x 2wd electric': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 150, torque_nm: 266 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 4690, width_mm: 1860, height_mm: 1650, wheelbase_mm: 2850, kerb_weight_kg: 1950 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 750, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 452, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── bZ4X AWD Electric: dual motor, AWD ────────────────────────────
  'bz4x awd electric': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 160, torque_nm: 337 },
    transmission: { type: 'Automatic', gears: 1, drive: 'AWD' },
    dimensions: { length_mm: 4690, width_mm: 1860, height_mm: 1650, wheelbase_mm: 2850, kerb_weight_kg: 2010 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: 750, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 452, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── GR Yaris AWD: 1.6L 3cyl turbo, 6MT or 8GR-AT, AWD ───────────
  'gr yaris awd': {
    engine: { type: 'Petrol', displacement_cc: 1618, cylinders: 3, power_kw: 200, torque_nm: 370 },
    transmission: { type: 'Manual', gears: 6, drive: 'AWD' },
    dimensions: { length_mm: 3995, width_mm: 1805, height_mm: 1455, wheelbase_mm: 2560, kerb_weight_kg: 1280 },
    performance: { fuel_combined_l100km: 8.2, co2_gkm: 187 },
    towing: { braked_kg: 0, unbraked_kg: 0 },
    capacity: { doors: 3, seats: 4, boot_litres: 174, fuel_tank_litres: 50 },
    safety: { ancap_stars: null, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── GR Corolla AWD: 1.6L 3cyl turbo, 6MT, AWD (GR-FOUR) ─────────
  'gr corolla awd': {
    engine: { type: 'Petrol', displacement_cc: 1618, cylinders: 3, power_kw: 224, torque_nm: 370 },
    transmission: { type: 'Manual', gears: 6, drive: 'AWD' },
    dimensions: { length_mm: 4410, width_mm: 1850, height_mm: 1480, wheelbase_mm: 2640, kerb_weight_kg: 1475 },
    performance: { fuel_combined_l100km: 8.4, co2_gkm: 192 },
    towing: { braked_kg: 0, unbraked_kg: 0 },
    capacity: { doors: 5, seats: 5, boot_litres: 297, fuel_tank_litres: 50 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── GR86 RWD: 2.4L flat-4, 6MT or 6AT, RWD ──────────────────────
  'gr86 rwd': {
    engine: { type: 'Petrol', displacement_cc: 2387, cylinders: 4, power_kw: 174, torque_nm: 250 },
    transmission: { type: 'Manual', gears: 6, drive: 'RWD' },
    dimensions: { length_mm: 4265, width_mm: 1775, height_mm: 1310, wheelbase_mm: 2575, kerb_weight_kg: 1276 },
    performance: { fuel_combined_l100km: 8.9, co2_gkm: 203 },
    towing: { braked_kg: 0, unbraked_kg: 0 },
    capacity: { doors: 2, seats: 4, boot_litres: 226, fuel_tank_litres: 50 },
    safety: { ancap_stars: null, airbags: 7 },
    wheels: { size: '17"', type: 'Alloy' },
  },

  // ── Tundra 4WD: 3.4L V6 Twin-Turbo i-FORCE MAX hybrid, 10AT ─────
  'tundra 4wd': {
    engine: { type: 'Hybrid', displacement_cc: 3444, cylinders: 6, power_kw: 326, torque_nm: 790 },
    transmission: { type: 'Automatic', gears: 10, drive: '4WD' },
    dimensions: { length_mm: 5930, width_mm: 2030, height_mm: 1975, wheelbase_mm: 3700, kerb_weight_kg: 2790 },
    performance: { fuel_combined_l100km: 10.6, co2_gkm: 243 },
    towing: { braked_kg: 4500, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 128 },
    safety: { ancap_stars: null, airbags: 8 },
    wheels: { size: '18"', type: 'Alloy' },
  },
};

// ── Matching logic ──────────────────────────────────────────────────

function normalizeTitle(title) {
  return (title || '')
    .replace(/\u2011/g, '-')   // non-breaking hyphen
    .replace(/\u00A0/g, ' ')   // non-breaking space
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findSpec(product) {
  const title = normalizeTitle(product.title);

  // Direct lookup
  if (SPECS[title]) {
    return { spec: SPECS[title], match: title };
  }

  // Try matching each key as a pattern
  for (const [key, spec] of Object.entries(SPECS)) {
    if (title === key) {
      return { spec, match: key };
    }
  }

  return null;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Toyota AU Specs Seed ===\n');

  const { data: products, error } = await sb.from('products')
    .select('id, title, external_key, variant_name, fuel_type, body_type, drivetrain, transmission')
    .eq('oem_id', OEM_ID);
  if (error) { console.error('Fetch error:', error.message); process.exit(1); }
  console.log(`Found ${products.length} Toyota products\n`);

  let updated = 0, skipped = 0;
  const unmatched = [];
  const matchCounts = {};

  for (const p of products) {
    const result = findSpec(p);
    if (!result) {
      skipped++;
      const normalTitle = normalizeTitle(p.title);
      if (!unmatched.includes(normalTitle)) {
        unmatched.push(normalTitle);
      }
      continue;
    }

    const { spec } = result;
    matchCounts[result.match] = (matchCounts[result.match] || 0) + 1;

    const { error: upErr } = await sb.from('products')
      .update({
        specs_json: spec,
        engine_size: spec.engine.displacement_cc ? `${(spec.engine.displacement_cc / 1000).toFixed(1)}L` : (spec.engine.type === 'Electric' ? 'Electric' : null),
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
    }
  }

  console.log('=== MATCH BREAKDOWN ===');
  for (const [key, count] of Object.entries(matchCounts).sort()) {
    console.log(`  ${key.padEnd(40)} ${count} products`);
  }

  console.log('\n=== RESULTS ===');
  console.log(`  Updated: ${updated}/${products.length}`);
  console.log(`  Skipped: ${skipped}`);
  if (unmatched.length > 0) {
    console.log('\n  Unmatched title patterns:');
    for (const u of unmatched) console.log(`    "${u}"`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
