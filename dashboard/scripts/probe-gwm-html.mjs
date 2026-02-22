#!/usr/bin/env node
/**
 * Extract GWM color data from rendered HTML (swatch CSS + model range sections)
 */

const BASE = 'https://www.gwmanz.com';
const MODEL_PAGES = {
  cannon: '/au/models/ute/cannon/',
  'cannon-alpha': '/au/models/ute/cannon-alpha/',
  'haval-jolion': '/au/models/suv/haval-jolion/',
  'haval-h6': '/au/models/suv/haval-h6/',
  'haval-h6gt': '/au/models/suv/haval-h6gt/',
  'tank-300': '/au/models/suv/tank-300/',
  'tank-500': '/au/models/suv/tank-500/',
  ora: '/au/models/hatchback/ora/',
};

async function main() {
  for (const [model, path] of Object.entries(MODEL_PAGES)) {
    console.log(`\n=== ${model.toUpperCase()} ===`);
    const r = await fetch(BASE + path, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.log(`  Status: ${r.status}`); continue; }
    const html = await r.text();

    // Extract the model-range section which contains variant + color data
    // Look for model-range-select-colour sections
    const colorSwatches = [...html.matchAll(/class="model-range-select-colour__colour[^"]*"\s*style="background:([^"]+)"/gi)];
    console.log(`  Color swatches: ${colorSwatches.length}`);
    colorSwatches.forEach(m => console.log(`    bg: ${m[1].substring(0, 150)}`));

    // Look for model range captions (variant names with their colors)
    const captions = [...html.matchAll(/class="model-range__caption-colour"[^>]*>([^<]*)</gi)];
    console.log(`  Color captions: ${captions.length}`);
    captions.forEach(m => console.log(`    "${m[1].trim()}"`));

    // Find the model-range section and extract variant/color mapping
    // Look for aria-label or title attributes near color elements
    const colorLabels = [...html.matchAll(/(?:aria-label|title)="([^"]*(?:colou?r|paint|[A-Z][a-z]+ (?:White|Black|Blue|Red|Grey|Silver|Green|Brown|Pearl|Metallic))[^"]*)"/gi)];
    console.log(`  Color labels: ${colorLabels.length}`);
    [...new Set(colorLabels.map(m => m[1]))].forEach(l => console.log(`    ${l}`));

    // Look for vehicle images with color names in alt text or data attributes
    const vehicleImgs = [...html.matchAll(/(?:alt|data-colour|data-color-name)="([^"]*(?:white|black|blue|red|grey|gray|silver|green|brown|pearl|metallic|mica|gold|bronze|titanium|midnight|storm|cosmic)[^"]*)"/gi)];
    const uniqueVehicleImgs = [...new Set(vehicleImgs.map(m => m[1]))];
    if (uniqueVehicleImgs.length > 0) {
      console.log(`  Vehicle images with color names: ${uniqueVehicleImgs.length}`);
      uniqueVehicleImgs.forEach(n => console.log(`    ${n}`));
    }

    // Extract model-range Storyblok image URLs (these are the hero images per variant/color)
    const heroImgs = [...html.matchAll(/(?:src|data-src)="(https:\/\/a\.storyblok\.com[^"]*(?:hero|threequarter|front|profile|exterior)[^"]*)"/gi)];
    const uniqueHeroImgs = [...new Set(heroImgs.map(m => m[1]))];
    console.log(`  Hero images: ${uniqueHeroImgs.length}`);
    uniqueHeroImgs.slice(0, 5).forEach(u => console.log(`    ${u.substring(0, 120)}`));

    // Check for build-your-own configurator link
    const configuratorLinks = [...html.matchAll(/href="([^"]*(?:configurator|build|customise)[^"]*)"/gi)];
    const uniqueConfig = [...new Set(configuratorLinks.map(m => m[1]))];
    if (uniqueConfig.length > 0) {
      console.log(`  Configurator links: ${uniqueConfig.length}`);
      uniqueConfig.forEach(l => console.log(`    ${l}`));
    }

    // Extract a section of HTML around model-range for analysis
    const rangeStart = html.indexOf('model-range');
    if (rangeStart > -1) {
      const section = html.substring(rangeStart, rangeStart + 5000);
      // Extract data from the section
      const variants = [...section.matchAll(/model-range__name[^>]*>([^<]+)</gi)];
      if (variants.length > 0) {
        console.log(`  Variant names in range:`);
        variants.forEach(v => console.log(`    ${v[1].trim()}`));
      }
      const prices = [...section.matchAll(/model-range__price[^>]*>\s*\$([0-9,]+)/gi)];
      if (prices.length > 0) {
        console.log(`  Prices in range:`);
        prices.forEach(p => console.log(`    $${p[1]}`));
      }
    }
  }

  // Also check the GWM configurator/build tool
  console.log('\n=== Checking GWM configurator ===');
  const configPaths = [
    '/au/configurator/',
    '/au/build-your-own/',
    '/au/build/',
    '/au/models/ute/cannon/configurator/',
    '/au/models/ute/cannon/build/',
  ];
  for (const p of configPaths) {
    try {
      const r = await fetch(BASE + p, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual' });
      const loc = r.headers.get('location') || '';
      console.log(`  ${p} -> ${r.status}${loc ? ' -> ' + loc : ''}`);
    } catch(e) {
      console.log(`  ${p} -> Error`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
