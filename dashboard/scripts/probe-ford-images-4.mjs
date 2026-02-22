#!/usr/bin/env node
/**
 * probe-ford-images-4.mjs
 * Final investigation: DAM image existence checks, colorizer SPA discovery,
 * and Ford's B&P iframe/micro-frontend analysis.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function f(url, opts = {}) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, ...opts.headers },
    });
    return r;
  } catch (e) {
    return { ok: false, status: 'ERR', text: async () => '', headers: { get: () => '' } };
  }
}

// ============================================================
// PART 1: Verify discovered DAM images and probe color-specific variants
// ============================================================
console.log('=== PART 1: DAM Image Verification ===\n');

// Test known Mustang DAM images
const knownImages = [
  '/content/dam/Ford/au/nameplate/mustang/pick-up-from-where-you-left/au-ecoboost-carbonised-grey.webp',
  '/content/dam/Ford/au/nameplate/mustang/overview/billboards/au-overview-desktop.webp',
  '/content/dam/Ford/au/nameplate/mustang/overview/cards/mustang-gt.webp',
  '/content/dam/Ford/au/nameplate/mustang/overview/cards/mustang-ecoboost.webp',
];

for (const path of knownImages) {
  const r = await f(`https://www.ford.com.au${path}`);
  const ct = r.headers?.get?.('content-type') || '';
  if (r.ok) {
    const body = await r.arrayBuffer();
    console.log(`OK ${path.split('/').pop()} (${ct}, ${(body.byteLength/1024).toFixed(0)}KB)`);
  } else {
    console.log(`${r.status} ${path.split('/').pop()}`);
  }
}

// Try DAM color variants for Mustang
console.log('\nProbing Mustang color DAM variants:');
const mustangColors = ['shadow-black', 'oxford-white', 'grabber-blue', 'dark-matter-grey', 'race-red', 'vapor-blue', 'twister-orange', 'carbonised-grey'];
const damColorPatterns = [
  (model, color) => `/content/dam/Ford/au/nameplate/${model}/pick-up-from-where-you-left/au-ecoboost-${color}.webp`,
  (model, color) => `/content/dam/Ford/au/nameplate/${model}/pick-up-from-where-you-left/au-gt-${color}.webp`,
  (model, color) => `/content/dam/Ford/au/nameplate/${model}/pick-up-from-where-you-left/${color}.webp`,
  (model, color) => `/content/dam/Ford/au/nameplate/${model}/colors/${color}.webp`,
  (model, color) => `/content/dam/Ford/au/nameplate/${model}/colors/${color}.png`,
  (model, color) => `/content/dam/Ford/au/nameplate/${model}/colour/${color}.webp`,
  (model, color) => `/content/dam/Ford/au/nameplate/${model}/swatches/${color}.png`,
  (model, color) => `/content/dam/Ford/au/nameplate/${model}/overview/colors/${color}.webp`,
];

for (const color of mustangColors) {
  for (const patFn of damColorPatterns) {
    const path = patFn('mustang', color);
    const r = await f(`https://www.ford.com.au${path}`);
    if (r.ok) {
      const body = await r.arrayBuffer();
      const ct = r.headers?.get?.('content-type') || '';
      console.log(`  OK ${path} (${ct}, ${(body.byteLength/1024).toFixed(0)}KB)`);
      break; // Found pattern for this color
    }
  }
}

// Try DAM for Ranger too
console.log('\nProbing Ranger color DAM variants:');
const rangerColors = ['arctic-white', 'shadow-black', 'blue-lightning', 'aluminium-silver', 'conquer-grey', 'sediment-bronze', 'next-gen-blue', 'meteor-grey'];
for (const color of rangerColors) {
  for (const patFn of damColorPatterns) {
    const path = patFn('ranger', color);
    const r = await f(`https://www.ford.com.au${path}`);
    if (r.ok) {
      const body = await r.arrayBuffer();
      const ct = r.headers?.get?.('content-type') || '';
      console.log(`  OK ${path} (${ct}, ${(body.byteLength/1024).toFixed(0)}KB)`);
      break;
    }
  }
}

// ============================================================
// PART 2: Find the colorizer/explore-models SPA
// ============================================================
console.log('\n=== PART 2: Colorizer/Explore-Models SPA discovery ===\n');

// Ford's B&P page mentioned "colorizer" and "coloriser" in its content
// The Ranger page has: data-all-named-config with configs like "hero", "raptor", etc.
// Try to find the actual app that powers the color picker

const colorizerUrls = [
  'https://www.ford.com.au/showroom/ranger/explore-ranger/',
  'https://www.ford.com.au/showroom/cars/ranger.html',
  'https://www.ford.com.au/showroom/cars/mustang.html',
  // Try the nameplateWithColorizer pattern
  'https://www.ford.com.au/content/ford/au/en_au/home/showroom/ranger/explore-ranger.html',
  'https://www.ford.com.au/content/ford/au/en_au/home/showroom/ranger/colorizer.html',
  'https://www.ford.com.au/content/ford/au/en_au/home/showroom/ranger/colours.html',
  // Explore-models pattern
  'https://www.ford.com.au/showroom/explore-models/ranger/',
  // Compare pattern
  'https://www.ford.com.au/showroom/compare/ranger/',
  // Direct model pages (some OEMs use this)
  'https://www.ford.com.au/ranger/',
  'https://www.ford.com.au/everest/',
  'https://www.ford.com.au/puma/',
];

for (const url of colorizerUrls) {
  const r = await f(url, { headers: { 'Accept': 'text/html' } });
  if (r.ok) {
    const text = await r.text();
    if (text.length > 5000) {
      // Quick check for what's on this page
      const colorRefs = (text.match(/colou?r|paint|swatch/gi) || []).length;
      const gpasRefs = (text.match(/gpas/gi) || []).length;
      const damImgs = [...new Set(text.match(/\/content\/dam\/[^"'\s<>)]+\.(webp|jpg|png)/gi) || [])];
      console.log(`OK ${url} (${(text.length/1024).toFixed(0)}KB) color:${colorRefs} gpas:${gpasRefs} dam:${damImgs.length}`);
      for (const d of damImgs.filter(d => !d.match(/logo|icon|svg/i)).slice(0, 10)) {
        console.log(`  ${d}`);
      }
    }
  } else {
    console.log(`${r.status} ${url}`);
  }
}

// ============================================================
// PART 3: Fetch the guxacc JS and extract full GPAS URL pattern
// ============================================================
console.log('\n=== PART 3: GPAS URL construction pattern from JS ===\n');

// From probe 2 we know guxacc.min.js has the GPAS image loading code
// Let's get the full context around the GPAS URL construction
const jsR = await f('https://www.ford.com.au/aqf/resources/FordBillboard/clientlibs-aem-billboards-FordBillboard/js/guxacc.min.js');
if (jsR.ok) {
  const js = await jsR.text();
  console.log(`guxacc.min.js size: ${(js.length/1024).toFixed(0)}KB`);

  // Find the GPAS URL construction code
  const gpasIdx = js.indexOf('gpas-serv-path');
  if (gpasIdx > -1) {
    const context = js.substring(Math.max(0, gpasIdx - 500), Math.min(js.length, gpasIdx + 1000));
    console.log(`\nGPAS serv-path context:\n${context.substring(0, 1500)}`);
  }

  // Find the gpas-cache URL construction
  const cacheIdx = js.indexOf('gpas-cache');
  if (cacheIdx > -1) {
    const context = js.substring(Math.max(0, cacheIdx - 300), Math.min(js.length, cacheIdx + 500));
    console.log(`\nGPAS cache context:\n${context.substring(0, 800)}`);
  }

  // Find the gpas-allowed-domains usage
  const domainsIdx = js.indexOf('gpas-allowed-domains');
  if (domainsIdx > -1) {
    const context = js.substring(Math.max(0, domainsIdx - 200), Math.min(js.length, domainsIdx + 500));
    console.log(`\nGPAS allowed-domains context:\n${context.substring(0, 700)}`);
  }

  // Find the ADFS credential check
  const adfsIdx = js.indexOf('ADFS-credential');
  if (adfsIdx > -1) {
    const context = js.substring(Math.max(0, adfsIdx - 300), Math.min(js.length, adfsIdx + 500));
    console.log(`\nADFS credential context:\n${context.substring(0, 800)}`);
  }

  // Look for gpasAuthenticationHeader usage
  const authIdx = js.indexOf('gpasAuthenticationHeader');
  if (authIdx > -1) {
    const context = js.substring(Math.max(0, authIdx - 200), Math.min(js.length, authIdx + 500));
    console.log(`\nGPAS auth header context:\n${context.substring(0, 700)}`);
  }
}

// ============================================================
// PART 4: Try fetching GPAS images WITHOUT authentication
// ============================================================
console.log('\n=== PART 4: GPAS direct image fetch ===\n');

// From the JS analysis, the GPAS URL is: https://www.{domain}{servPath}
// where domain comes from gpas-staging-domains and servPath from data-gpas-serv-path
// The Ranger page had data-gpas-authentication-header="false" which means NO ADFS needed!

// Let's try the direct GPAS URL pattern for Ranger
// The JS shows: n="https://www."+(x?x.split(","):[])[1]+B
// where x = data-gpas-staging-domains, B = data-gpas-serv-path

// data-gpas-allowed-domains contains ["gpas.ford.com","gpas-cache.ford.com"]
// So the domains list would include gpas-cache.ford.com

// Try common GPAS image paths for Ford AU
const gpasDirectUrls = [
  'https://gpas-cache.ford.com/guid/3-1/image?quality=90&subtype=exterior',
  'https://www.gpas-cache.ford.com/',
  'https://gpas.ford.com/',
  // Try the Ford DIG (Digital Image Gallery) service directly
  'https://build.ford.com/dig/Ford/Ranger/2025/HD-TILE/Image[|Ford|Ranger|2025|1|1.|100A..SM4..89N.PQ.88W.64T.RET.44B.AC.PKS.SS6.913.648.XLL.]/EXT/1/vehicle.png',
];

for (const url of gpasDirectUrls) {
  const r = await f(url);
  const ct = r.headers?.get?.('content-type') || '';
  if (r.ok) {
    const body = await r.arrayBuffer();
    console.log(`OK ${url.substring(0, 100)} (${ct}, ${(body.byteLength/1024).toFixed(0)}KB)`);
  } else {
    console.log(`${r.status} ${url.substring(0, 100)}`);
  }
}

// ============================================================
// PART 5: Try the Ranger showroom page from the older URL pattern
// ============================================================
console.log('\n=== PART 5: Alternative model page URLs ===\n');

const altUrls = [
  'https://www.ford.com.au/showroom/cars/ranger.html',
  'https://www.ford.com.au/showroom/suvs/everest.html',
  'https://www.ford.com.au/showroom/suvs/puma.html',
  'https://www.ford.com.au/showroom/sports/mustang.html',
  'https://www.ford.com.au/showroom/commercial/transit.html',
  'https://www.ford.com.au/showroom/utes/ranger.html',
  'https://www.ford.com.au/showroom/performance/mustang.html',
  // New-generation page patterns
  'https://www.ford.com.au/vehicles/ranger/',
  'https://www.ford.com.au/vehicles/mustang/',
  'https://www.ford.com.au/vehicles/everest/',
  'https://www.ford.com.au/vehicles/puma/',
  // Check if they have subpages for each model
  'https://www.ford.com.au/showroom/ranger/explore-ranger/',
  'https://www.ford.com.au/showroom/ranger/ranger-range/',
  'https://www.ford.com.au/showroom/ranger/ranger-models/',
  'https://www.ford.com.au/showroom/ranger/range/',
];

for (const url of altUrls) {
  const r = await f(url, { headers: { 'Accept': 'text/html' } });
  if (r.ok) {
    const text = await r.text();
    if (text.length > 5000) {
      const damImgs = [...new Set(text.match(/\/content\/dam\/[^"'\s<>)]+\.(webp|jpg|png)/gi) || [])];
      const colorRefs = (text.match(/colou?r|paint|swatch/gi) || []).length;
      console.log(`OK ${url} (${(text.length/1024).toFixed(0)}KB) color:${colorRefs} dam:${damImgs.length}`);
      for (const d of damImgs.filter(d => !d.match(/logo|icon|svg|pdf/i)).slice(0, 8)) {
        console.log(`  ${d}`);
      }
    }
  } else {
    console.log(`${r.status} ${url}`);
  }
}

// ============================================================
// PART 6: Extract all DAM images across all working pages
// ============================================================
console.log('\n=== PART 6: Comprehensive DAM image catalog ===\n');

const allModels = {
  ranger: 'https://www.ford.com.au/showroom/ranger/',
  mustang: 'https://www.ford.com.au/cars/mustang/',
  transit: 'https://www.ford.com.au/commercial/transit/',
  'transit-custom': 'https://www.ford.com.au/commercial/transit-custom/',
  'e-transit': 'https://www.ford.com.au/commercial/e-transit/',
  'f-150': 'https://www.ford.com.au/commercial/f-150/',
};

const allDamImages = {};

for (const [model, url] of Object.entries(allModels)) {
  const r = await f(url, { headers: { 'Accept': 'text/html' } });
  if (!r.ok) continue;
  const text = await r.text();
  const damImgs = [...new Set(text.match(/\/content\/dam\/Ford\/au\/nameplate\/[^"'\s<>)]+\.(webp|jpg|png)/gi) || [])];
  if (damImgs.length) {
    allDamImages[model] = damImgs;
    console.log(`${model}: ${damImgs.length} nameplate DAM images`);
    for (const d of damImgs) console.log(`  ${d}`);
  } else {
    console.log(`${model}: no nameplate DAM images`);
  }
}

// ============================================================
// PART 7: Check the Mustang "pick-up-from-where-you-left" folder for more colors
// ============================================================
console.log('\n=== PART 7: Mustang pick-up folder color variants ===\n');

// We know au-ecoboost-carbonised-grey.webp exists. Try more combinations:
const grades = ['ecoboost', 'gt', 'v8', 'fastback', 'convertible'];
const moreColors = [
  'shadow-black', 'oxford-white', 'grabber-blue', 'dark-matter-grey',
  'race-red', 'vapor-blue', 'twister-orange', 'carbonised-grey',
  'iconic-silver', 'eruption-green', 'rapid-red', 'atlas-blue',
  'velocity-blue', 'lucid-red', 'yellow', 'orange', 'blue', 'red', 'white', 'black', 'grey', 'silver',
  'antimatter-blue', 'cyber-orange',
];

let foundCount = 0;
for (const grade of grades) {
  for (const color of moreColors) {
    const path = `/content/dam/Ford/au/nameplate/mustang/pick-up-from-where-you-left/au-${grade}-${color}.webp`;
    const r = await f(`https://www.ford.com.au${path}`);
    if (r.ok) {
      const body = await r.arrayBuffer();
      console.log(`OK au-${grade}-${color}.webp (${(body.byteLength/1024).toFixed(0)}KB)`);
      foundCount++;
    }
  }
}
// Also try without grade prefix
for (const color of moreColors) {
  const paths = [
    `/content/dam/Ford/au/nameplate/mustang/pick-up-from-where-you-left/au-${color}.webp`,
    `/content/dam/Ford/au/nameplate/mustang/pick-up-from-where-you-left/${color}.webp`,
  ];
  for (const path of paths) {
    const r = await f(`https://www.ford.com.au${path}`);
    if (r.ok) {
      const body = await r.arrayBuffer();
      console.log(`OK ${path.split('/').pop()} (${(body.byteLength/1024).toFixed(0)}KB)`);
      foundCount++;
    }
  }
}
console.log(`\nTotal found: ${foundCount} color images`);

// ============================================================
// PART 8: Check for an Everest page under different URL patterns
// ============================================================
console.log('\n=== PART 8: Find Everest page ===\n');

const everestUrls = [
  'https://www.ford.com.au/suvs/everest/',
  'https://www.ford.com.au/suv/everest/',
  'https://www.ford.com.au/showroom/everest/',
  'https://www.ford.com.au/showroom/suvs/everest/',
  'https://www.ford.com.au/cars/everest/',
  'https://www.ford.com.au/vehicles/everest/',
  'https://www.ford.com.au/content/ford/au/en_au/home/showroom/everest.html',
  'https://www.ford.com.au/content/ford/au/en_au/home/suvs/everest.html',
];

for (const url of everestUrls) {
  const r = await f(url, { headers: { 'Accept': 'text/html' } });
  if (r.ok) {
    const text = await r.text();
    if (text.length > 5000) {
      const title = text.match(/<title[^>]*>([^<]+)/i)?.[1] || '';
      const damImgs = [...new Set(text.match(/\/content\/dam\/[^"'\s<>)]+\.(webp|jpg|png)/gi) || [])];
      console.log(`OK ${url} (${(text.length/1024).toFixed(0)}KB) title: ${title.trim()} dam: ${damImgs.length}`);
      for (const d of damImgs.filter(d => d.includes('nameplate')).slice(0, 10)) console.log(`  ${d}`);
    }
  } else {
    console.log(`${r.status} ${url}`);
  }
}

console.log('\n=== PROBE 4 COMPLETE ===');
