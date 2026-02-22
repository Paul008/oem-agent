#!/usr/bin/env node
/**
 * Try to enumerate Hyundai swatch URLs from the PCM CDN pattern.
 * Known pattern: /content/dam/hyundai/au/en/models/pcm/colours/exterior-swatches/{Color_Name}_{size}.png
 * Also check if there's a directory listing or index.
 */

const HYUNDAI_BASE = 'https://www.hyundai.com';
const SWATCH_PATH = '/content/dam/hyundai/au/en/models/pcm/colours/exterior-swatches/';

// Known Hyundai AU colors from brochures and marketing
const knownColors = [
  'Abyss_Black', 'Amazon_Gray', 'Arctic_White', 'Atlas_White', 'Biophilic_Blue',
  'Cashmere_Beige', 'Chalk_White', 'Coconut_White', 'Cosmic_Blue', 'Creamy_White',
  'Cyber_Gray', 'Dark_Knight', 'Deep_Sea', 'Ecotronic_Grey', 'Engine_Red',
  'Fluid_Metal', 'Galactic_Grey', 'Gravity_Gold', 'Green_Grey', 'Haze_Grey',
  'Horizon_Red', 'Intense_Blue', 'Lucid_Red', 'Magnetic_Silver', 'Marine_Blue',
  'Meta_Blue', 'Midnight_Black', 'Morning_Mist', 'Nocturne_Gray', 'Nordic_White',
  'Ocean_Blue', 'Optic_White', 'Phantom_Black', 'Pine_Green', 'Polar_White',
  'Rain_Forest', 'Serenity_White', 'Shimmering_Silver', 'Silky_Bronze', 'Stargazing_Blue',
  'Steel_Graphite', 'Surfy_Blue', 'Teal_Sapphire', 'Titan_Gray', 'Typhoon_Silver',
  'Ultimate_Red', 'Vibrant_Blue', 'Wistful_White', 'Yonder_Blue_Pearl',
  // Additional variations
  'Fiery_Red', 'Sunset_Red', 'Digital_Teal', 'Dive_In_Jeju', 'Curated_Silver',
  'Shooting_Star', 'Gravity_Gold_Matte', 'Aero_Silver', 'Matte_Black',
];

const sizes = ['68_68', '68x68', '38x38', '128x128'];

console.log('Probing Hyundai PCM swatch CDN...\n');

let found = 0;
for (const color of knownColors) {
  for (const size of sizes) {
    const url = `${HYUNDAI_BASE}${SWATCH_PATH}${color}_${size}.png`;
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) {
        const len = r.headers.get('content-length');
        console.log(`✅ ${color} (${size}) → ${len}B`);
        found++;
        break; // Found at one size, skip others
      }
    } catch {}
  }
  // Also try without size suffix
  const url = `${HYUNDAI_BASE}${SWATCH_PATH}${color}.png`;
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (r.ok) {
      console.log(`✅ ${color} (no size) → ${r.headers.get('content-length')}B`);
      found++;
    }
  } catch {}
}

// Also try the variations with different naming conventions
const variations = ['Black_Pearl', 'White_Pearl', 'Silver_Metallic', 'Grey_Metallic', 'Blue_Pearl'];
for (const v of variations) {
  for (const ext of ['.png', '.jpg', '.webp']) {
    for (const size of ['68_68', '68x68', '']) {
      const name = size ? `${v}_${size}` : v;
      const url = `${HYUNDAI_BASE}${SWATCH_PATH}${name}${ext}`;
      try {
        const r = await fetch(url, { method: 'HEAD' });
        if (r.ok) {
          console.log(`✅ ${name}${ext} → ${r.headers.get('content-length')}B`);
          found++;
          break;
        }
      } catch {}
    }
  }
}

console.log(`\nFound: ${found} swatch images`);

// Now try to get the full Tucson page's 3D spinner data which may contain color configs
console.log('\n=== Checking 3D spinner/CGI color data ===');
const spinnerPaths = [
  '/content/dam/hyundai/au/en/cgi/tucson-my26/my26-/config.json',
  '/content/dam/hyundai/au/en/cgi/tucson-my26/colors.json',
  '/content/dam/hyundai/au/en/cgi/tucson-my26/my26-/colors.json',
  '/content/dam/hyundai/au/en/cgi/tucson-my26/variants.json',
  '/content/dam/hyundai/au/en/models/pcm/colours/exterior-swatches/',
  '/content/dam/hyundai/au/en/models/pcm/colours/',
];

for (const path of spinnerPaths) {
  try {
    const r = await fetch(HYUNDAI_BASE + path);
    const ct = r.headers.get('content-type') || '';
    if (r.ok) {
      const text = await r.text();
      console.log(`✅ ${path} (${r.status}, ${ct.substring(0,30)}, ${text.length}B)`);
      console.log(`   Preview: ${text.substring(0, 200)}`);
    } else {
      console.log(`❌ ${path}: ${r.status}`);
    }
  } catch (e) {
    console.log(`❌ ${path}: ${e.message}`);
  }
}
