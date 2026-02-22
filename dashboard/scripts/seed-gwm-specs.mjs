#!/usr/bin/env node
/**
 * Seed GWM AU product specs into products.specs_json + scalar columns.
 *
 * GWM Storyblok CDN has model/variant stories but spec fields (motors, engines)
 * are empty in the CMS. This script uses verified Australian-market spec data
 * from GWM AU press releases, specification sheets, and ANCAP data (MY2025-26).
 *
 * Brands: Haval, Tank, ORA, Cannon (ute)
 *
 * Run: cd dashboard/scripts && node seed-gwm-specs.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const OEM_ID = 'gwm-au';

// ── GWM AU spec data ────────────────────────────────────────────────────
// Keyed by external_key (matches products table)
// Source: GWM AU specification sheets, ANCAP data (MY2025-26)

const SPECS = {
  // ── Haval Jolion ──────────────────────────────────────────────────────
  'haval-jolion-premium': {
    engine: { type: 'Petrol', displacement_cc: 1497, cylinders: 4, power_kw: 110, torque_nm: 220 },
    transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
    dimensions: { length_mm: 4472, width_mm: 1841, height_mm: 1619, wheelbase_mm: 2700, kerb_weight_kg: 1430 },
    performance: { fuel_combined_l100km: 7.0, co2_gkm: 160 },
    towing: { braked_kg: 1200, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 392, fuel_tank_litres: 50 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'haval-jolion-lux': {
    engine: { type: 'Petrol', displacement_cc: 1497, cylinders: 4, power_kw: 110, torque_nm: 220 },
    transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
    dimensions: { length_mm: 4472, width_mm: 1841, height_mm: 1619, wheelbase_mm: 2700, kerb_weight_kg: 1460 },
    performance: { fuel_combined_l100km: 7.0, co2_gkm: 160 },
    towing: { braked_kg: 1200, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 392, fuel_tank_litres: 50 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'haval-jolion-ultra': {
    engine: { type: 'Petrol', displacement_cc: 1497, cylinders: 4, power_kw: 110, torque_nm: 220 },
    transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
    dimensions: { length_mm: 4472, width_mm: 1841, height_mm: 1619, wheelbase_mm: 2700, kerb_weight_kg: 1480 },
    performance: { fuel_combined_l100km: 7.0, co2_gkm: 160 },
    towing: { braked_kg: 1200, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 392, fuel_tank_litres: 50 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'haval-jolion-vanta': {
    engine: { type: 'Petrol', displacement_cc: 1497, cylinders: 4, power_kw: 110, torque_nm: 220 },
    transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
    dimensions: { length_mm: 4472, width_mm: 1841, height_mm: 1619, wheelbase_mm: 2700, kerb_weight_kg: 1480 },
    performance: { fuel_combined_l100km: 7.0, co2_gkm: 160 },
    towing: { braked_kg: 1200, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 392, fuel_tank_litres: 50 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'haval-jolion-lux-hev': {
    engine: { type: 'Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 130, torque_nm: 350 },
    transmission: { type: 'Automatic', gears: 2, drive: 'FWD' },
    dimensions: { length_mm: 4472, width_mm: 1841, height_mm: 1619, wheelbase_mm: 2700, kerb_weight_kg: 1570 },
    performance: { fuel_combined_l100km: 5.2, co2_gkm: 119 },
    towing: { braked_kg: 1200, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 392, fuel_tank_litres: 50 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'haval-jolion-premium-hev': {
    engine: { type: 'Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 130, torque_nm: 350 },
    transmission: { type: 'Automatic', gears: 2, drive: 'FWD' },
    dimensions: { length_mm: 4472, width_mm: 1841, height_mm: 1619, wheelbase_mm: 2700, kerb_weight_kg: 1555 },
    performance: { fuel_combined_l100km: 5.2, co2_gkm: 119 },
    towing: { braked_kg: 1200, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 392, fuel_tank_litres: 50 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'haval-jolion-vanta-hev': {
    engine: { type: 'Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 130, torque_nm: 350 },
    transmission: { type: 'Automatic', gears: 2, drive: 'FWD' },
    dimensions: { length_mm: 4472, width_mm: 1841, height_mm: 1619, wheelbase_mm: 2700, kerb_weight_kg: 1575 },
    performance: { fuel_combined_l100km: 5.2, co2_gkm: 119 },
    towing: { braked_kg: 1200, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 392, fuel_tank_litres: 50 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── Haval H6 ──────────────────────────────────────────────────────────
  'haval-h6-lux': {
    engine: { type: 'Petrol', displacement_cc: 1497, cylinders: 4, power_kw: 110, torque_nm: 220 },
    transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
    dimensions: { length_mm: 4653, width_mm: 1886, height_mm: 1730, wheelbase_mm: 2738, kerb_weight_kg: 1580 },
    performance: { fuel_combined_l100km: 7.6, co2_gkm: 174 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 600, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'haval-h6-ultra': {
    engine: { type: 'Petrol', displacement_cc: 1497, cylinders: 4, power_kw: 110, torque_nm: 220 },
    transmission: { type: 'Automatic', gears: 7, drive: 'FWD' },
    dimensions: { length_mm: 4653, width_mm: 1886, height_mm: 1730, wheelbase_mm: 2738, kerb_weight_kg: 1620 },
    performance: { fuel_combined_l100km: 7.6, co2_gkm: 174 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 600, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'haval-h6-lux-hev': {
    engine: { type: 'Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 179, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 2, drive: 'FWD' },
    dimensions: { length_mm: 4683, width_mm: 1886, height_mm: 1730, wheelbase_mm: 2738, kerb_weight_kg: 1780 },
    performance: { fuel_combined_l100km: 5.2, co2_gkm: 118 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 555, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'haval-h6-ultra-hev': {
    engine: { type: 'Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 179, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 2, drive: 'FWD' },
    dimensions: { length_mm: 4683, width_mm: 1886, height_mm: 1730, wheelbase_mm: 2738, kerb_weight_kg: 1810 },
    performance: { fuel_combined_l100km: 5.2, co2_gkm: 118 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 555, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'haval-h6-ultra-hev-awd': {
    engine: { type: 'Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 179, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 2, drive: 'AWD' },
    dimensions: { length_mm: 4683, width_mm: 1886, height_mm: 1730, wheelbase_mm: 2738, kerb_weight_kg: 1870 },
    performance: { fuel_combined_l100km: 5.8, co2_gkm: 132 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 555, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'haval-h6-lux-phev': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 179, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 2, drive: 'FWD' },
    dimensions: { length_mm: 4683, width_mm: 1886, height_mm: 1730, wheelbase_mm: 2738, kerb_weight_kg: 1920 },
    performance: { fuel_combined_l100km: 1.4, co2_gkm: 32 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 500, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'haval-h6-ultra-phev': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 179, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 2, drive: 'FWD' },
    dimensions: { length_mm: 4683, width_mm: 1886, height_mm: 1730, wheelbase_mm: 2738, kerb_weight_kg: 1950 },
    performance: { fuel_combined_l100km: 1.4, co2_gkm: 32 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 500, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'haval-h6-ultra-phev-awd': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 179, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 2, drive: 'AWD' },
    dimensions: { length_mm: 4683, width_mm: 1886, height_mm: 1730, wheelbase_mm: 2738, kerb_weight_kg: 2020 },
    performance: { fuel_combined_l100km: 1.6, co2_gkm: 36 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 500, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },

  // ── Haval H6GT ────────────────────────────────────────────────────────
  'haval-h6gt-ultra': {
    engine: { type: 'Petrol', displacement_cc: 1996, cylinders: 4, power_kw: 155, torque_nm: 325 },
    transmission: { type: 'Automatic', gears: 7, drive: 'AWD' },
    dimensions: { length_mm: 4727, width_mm: 1886, height_mm: 1696, wheelbase_mm: 2738, kerb_weight_kg: 1720 },
    performance: { fuel_combined_l100km: 8.2, co2_gkm: 188 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 500, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },
  'haval-h6gt-ultra-phev': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 179, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 2, drive: 'AWD' },
    dimensions: { length_mm: 4727, width_mm: 1886, height_mm: 1696, wheelbase_mm: 2738, kerb_weight_kg: 2050 },
    performance: { fuel_combined_l100km: 1.6, co2_gkm: 36 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 5, boot_litres: 450, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },

  // ── Haval H7 ──────────────────────────────────────────────────────────
  'haval-h7-h7-vanta-hev': {
    engine: { type: 'Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 179, torque_nm: 530 },
    transmission: { type: 'Automatic', gears: 2, drive: 'AWD' },
    dimensions: { length_mm: 4780, width_mm: 1890, height_mm: 1775, wheelbase_mm: 2800, kerb_weight_kg: 1910 },
    performance: { fuel_combined_l100km: 6.3, co2_gkm: 144 },
    towing: { braked_kg: 1500, unbraked_kg: 500 },
    capacity: { doors: 5, seats: 7, boot_litres: 380, fuel_tank_litres: 57 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '19"', type: 'Alloy' },
  },

  // ── Tank 300 ──────────────────────────────────────────────────────────
  'tank-300-ultra': {
    engine: { type: 'Petrol', displacement_cc: 1996, cylinders: 4, power_kw: 155, torque_nm: 325 },
    transmission: { type: 'Automatic', gears: 9, drive: '4x4' },
    dimensions: { length_mm: 4760, width_mm: 1930, height_mm: 1903, wheelbase_mm: 2750, kerb_weight_kg: 2100 },
    performance: { fuel_combined_l100km: 9.9, co2_gkm: 227 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 680, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'tank-300-lux-diesel': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 135, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 9, drive: '4x4' },
    dimensions: { length_mm: 4760, width_mm: 1930, height_mm: 1903, wheelbase_mm: 2750, kerb_weight_kg: 2150 },
    performance: { fuel_combined_l100km: 8.5, co2_gkm: 224 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 680, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'tank-300-ultra-diesel': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 135, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 9, drive: '4x4' },
    dimensions: { length_mm: 4760, width_mm: 1930, height_mm: 1903, wheelbase_mm: 2750, kerb_weight_kg: 2170 },
    performance: { fuel_combined_l100km: 8.5, co2_gkm: 224 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 5, boot_litres: 680, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── Tank 500 ──────────────────────────────────────────────────────────
  'tank-500-ultra-phev': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 1996, cylinders: 4, power_kw: 300, torque_nm: 750 },
    transmission: { type: 'Automatic', gears: 9, drive: '4x4' },
    dimensions: { length_mm: 5090, width_mm: 1934, height_mm: 1905, wheelbase_mm: 2850, kerb_weight_kg: 2680 },
    performance: { fuel_combined_l100km: 2.4, co2_gkm: 55 },
    towing: { braked_kg: 2500, unbraked_kg: 750 },
    capacity: { doors: 5, seats: 7, boot_litres: 512, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '20"', type: 'Alloy' },
  },

  // ── ORA ────────────────────────────────────────────────────────────────
  'ora-lux': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 126, torque_nm: 250 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 4235, width_mm: 1825, height_mm: 1596, wheelbase_mm: 2650, kerb_weight_kg: 1610 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 5, seats: 5, boot_litres: 228, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'ora-gt': {
    engine: { type: 'Electric', displacement_cc: null, cylinders: null, power_kw: 126, torque_nm: 250 },
    transmission: { type: 'Automatic', gears: 1, drive: 'FWD' },
    dimensions: { length_mm: 4235, width_mm: 1825, height_mm: 1596, wheelbase_mm: 2650, kerb_weight_kg: 1680 },
    performance: { fuel_combined_l100km: null, co2_gkm: 0 },
    towing: { braked_kg: null, unbraked_kg: null },
    capacity: { doors: 5, seats: 5, boot_litres: 228, fuel_tank_litres: null },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── Cannon (Ute) ──────────────────────────────────────────────────────
  'cannon-premium': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 120, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 8, drive: '4x4' },
    dimensions: { length_mm: 5320, width_mm: 1880, height_mm: 1865, wheelbase_mm: 3180, kerb_weight_kg: 2085 },
    performance: { fuel_combined_l100km: 8.6, co2_gkm: 226 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'cannon-premium-single-cc': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 120, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 8, drive: '4x2' },
    dimensions: { length_mm: 5320, width_mm: 1880, height_mm: 1830, wheelbase_mm: 3180, kerb_weight_kg: 1950 },
    performance: { fuel_combined_l100km: 7.8, co2_gkm: 205 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 2, seats: 3, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '16"', type: 'Steel' },
  },
  'cannon-lux': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 120, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 8, drive: '4x4' },
    dimensions: { length_mm: 5320, width_mm: 1880, height_mm: 1865, wheelbase_mm: 3180, kerb_weight_kg: 2110 },
    performance: { fuel_combined_l100km: 8.6, co2_gkm: 226 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'cannon-lux-dual-cc': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 120, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 8, drive: '4x4' },
    dimensions: { length_mm: 5620, width_mm: 1880, height_mm: 1865, wheelbase_mm: 3480, kerb_weight_kg: 2050 },
    performance: { fuel_combined_l100km: 8.8, co2_gkm: 232 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '17"', type: 'Alloy' },
  },
  'cannon-ultra': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 120, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 8, drive: '4x4' },
    dimensions: { length_mm: 5320, width_mm: 1880, height_mm: 1865, wheelbase_mm: 3180, kerb_weight_kg: 2140 },
    performance: { fuel_combined_l100km: 8.6, co2_gkm: 226 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'cannon-vanta': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 120, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 8, drive: '4x4' },
    dimensions: { length_mm: 5320, width_mm: 1880, height_mm: 1865, wheelbase_mm: 3180, kerb_weight_kg: 2140 },
    performance: { fuel_combined_l100km: 8.6, co2_gkm: 226 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'cannon-xsr': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 120, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 8, drive: '4x4' },
    dimensions: { length_mm: 5390, width_mm: 1920, height_mm: 1890, wheelbase_mm: 3180, kerb_weight_kg: 2180 },
    performance: { fuel_combined_l100km: 9.0, co2_gkm: 237 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 6 },
    wheels: { size: '18"', type: 'Alloy' },
  },

  // ── Cannon Alpha ──────────────────────────────────────────────────────
  'cannon-alpha-lux': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 120, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 8, drive: '4x4' },
    dimensions: { length_mm: 5460, width_mm: 1934, height_mm: 1900, wheelbase_mm: 3190, kerb_weight_kg: 2250 },
    performance: { fuel_combined_l100km: 9.2, co2_gkm: 242 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'cannon-alpha-ultra': {
    engine: { type: 'Diesel', displacement_cc: 1996, cylinders: 4, power_kw: 120, torque_nm: 400 },
    transmission: { type: 'Automatic', gears: 8, drive: '4x4' },
    dimensions: { length_mm: 5460, width_mm: 1934, height_mm: 1900, wheelbase_mm: 3190, kerb_weight_kg: 2300 },
    performance: { fuel_combined_l100km: 9.2, co2_gkm: 242 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '20"', type: 'Alloy' },
  },
  'cannon-alpha-lux-phev': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 220, torque_nm: 615 },
    transmission: { type: 'Automatic', gears: 2, drive: '4x4' },
    dimensions: { length_mm: 5460, width_mm: 1934, height_mm: 1900, wheelbase_mm: 3190, kerb_weight_kg: 2530 },
    performance: { fuel_combined_l100km: 2.0, co2_gkm: 46 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '18"', type: 'Alloy' },
  },
  'cannon-alpha-ultra-phev': {
    engine: { type: 'Plug-in Hybrid', displacement_cc: 1497, cylinders: 4, power_kw: 220, torque_nm: 615 },
    transmission: { type: 'Automatic', gears: 2, drive: '4x4' },
    dimensions: { length_mm: 5460, width_mm: 1934, height_mm: 1900, wheelbase_mm: 3190, kerb_weight_kg: 2570 },
    performance: { fuel_combined_l100km: 2.0, co2_gkm: 46 },
    towing: { braked_kg: 3000, unbraked_kg: 750 },
    capacity: { doors: 4, seats: 5, boot_litres: null, fuel_tank_litres: 75 },
    safety: { ancap_stars: 5, airbags: 7 },
    wheels: { size: '20"', type: 'Alloy' },
  },
};

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== GWM AU Specs Seed ===\n');

  const { data: products, error } = await sb.from('products')
    .select('id, title, external_key, transmission, drivetrain')
    .eq('oem_id', OEM_ID);
  if (error) { console.error('Fetch error:', error.message); process.exit(1); }
  console.log(`Found ${products.length} GWM products\n`);

  let updated = 0, skipped = 0;
  const unmatched = [];

  for (const p of products) {
    const spec = SPECS[p.external_key];
    if (!spec) {
      skipped++;
      unmatched.push(p.title + ' [' + (p.external_key || 'no-key') + ']');
      continue;
    }

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
      console.log(`  ${p.title.padEnd(50)} ${p.external_key}`);
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
