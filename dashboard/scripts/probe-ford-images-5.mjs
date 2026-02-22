#!/usr/bin/env node
/**
 * probe-ford-images-5.mjs
 * Final targeted probe: extract the B&P configurator API endpoints
 * from accproductdata.min.js and try them.
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
// PART 1: Get the accproductdata.min.js and extract API endpoints
// ============================================================
console.log('=== PART 1: API endpoint extraction from B&P JS ===\n');

// First get the Ranger page to find JS URLs
const rangerR = await f('https://www.ford.com.au/showroom/ranger/', { headers: { 'Accept': 'text/html' } });
const rangerHtml = await rangerR.text();

// Find all JS file paths
const jsPaths = [...new Set(
  (rangerHtml.match(/src="([^"]*\.js(?:\?[^"]*)?)"/gi) || [])
    .map(s => s.match(/src="([^"]+)"/)?.[1])
    .filter(Boolean)
)];

console.log(`JS files: ${jsPaths.length}`);
for (const p of jsPaths) console.log(`  ${p}`);

// Find the accproductdata JS
const accJs = jsPaths.find(p => p.includes('accproductdata')) || '';
if (accJs) {
  const jsUrl = accJs.startsWith('http') ? accJs : `https://www.ford.com.au${accJs}`;
  console.log(`\nFetching accproductdata: ${jsUrl}`);
  const jsR = await f(jsUrl);
  if (jsR.ok) {
    const js = await jsR.text();
    console.log(`Size: ${(js.length/1024).toFixed(0)}KB`);

    // Extract ALL URL-like strings from the JS
    const urls = [...new Set(js.match(/["']((?:https?:)?\/\/[^"'\s]{10,200})["']/g) || [])];
    console.log(`\nAll URL literals (${urls.length}):`);
    for (const u of urls) console.log(`  ${u}`);

    // Look for service/endpoint configuration objects
    const endpoints = [...new Set(js.match(/(?:endpoint|service|apiUrl|baseUrl|apiBase|serviceUrl|configUrl)\s*[:=]\s*["'][^"']+["']/gi) || [])];
    console.log(`\nEndpoint configs (${endpoints.length}):`);
    for (const e of endpoints) console.log(`  ${e}`);

    // Look for nameplate-related configuration
    const npConfigs = js.match(/nameplat[^"'\s]{0,200}/gi) || [];
    const uniqueNp = [...new Set(npConfigs)];
    console.log(`\nNameplate configs (${uniqueNp.length}):`);
    for (const np of uniqueNp.slice(0, 20)) console.log(`  ${np}`);

    // Look for image URL construction code
    const imgCode = [];
    const patterns = [
      /["']\/content\/dam\/[^"']+["']/g,
      /imageUrl\s*[:=]\s*[^;]+/gi,
      /\.imageUrl\s*=\s*[^;]+/gi,
    ];
    for (const pat of patterns) {
      const matches = js.match(pat) || [];
      imgCode.push(...matches);
    }
    console.log(`\nImage URL code (${imgCode.length}):`);
    for (const ic of [...new Set(imgCode)].slice(0, 15)) console.log(`  ${ic.substring(0, 200)}`);

    // Look for GPAS URL construction
    const gpasCode = js.match(/gpas[^;]{0,500}/gi) || [];
    console.log(`\nGPAS code fragments (${gpasCode.length}):`);
    for (const gc of [...new Set(gpasCode)].slice(0, 5)) console.log(`  ${gc.substring(0, 300)}`);

    // Look for vehicleData-url usage
    const vdCode = js.match(/vehicleData[^;]{0,300}/gi) || [];
    console.log(`\nVehicleData code (${vdCode.length}):`);
    for (const vc of [...new Set(vdCode)].slice(0, 5)) console.log(`  ${vc.substring(0, 300)}`);
  }
}

// ============================================================
// PART 2: Try VDM (Vehicle Data Manager) API endpoints
// ============================================================
console.log('\n=== PART 2: VDM API discovery ===\n');

// The data-vehicleData-url="/content/ford/au/en_au" found on Mustang page
// suggests AEM Content Services are used. Try vehicle data endpoints.
const vdmEndpoints = [
  // AEM Content Services pattern
  'https://www.ford.com.au/content/ford/au/en_au/home/cars/mustang/jcr:content/vehicleData.json',
  'https://www.ford.com.au/content/ford/au/en_au/home/cars/mustang/jcr:content/vehicleData.infinity.json',
  'https://www.ford.com.au/content/ford/au/en_au/vehicleData/mustang.json',
  // vehicleData-url + model pattern
  'https://www.ford.com.au/content/ford/au/en_au/vehicles/mustang.model.json',
  'https://www.ford.com.au/content/ford/au/en_au/vehicles/ranger.model.json',
  // Try the B&P key-code as API key
  'https://www.ford.com.au/bin/ford/vehicledata/ranger?keycode=Al1EdZ_aW5T6XNlr-BJxCw1l4KaA0tmXFI_eTl1RITyYptWUS0qit_MprtcG7w2F',
  // Try Ford's global API patterns
  'https://api.ford.com/api/fordau/vehicles/v1/catalog',
  'https://www.ford.com.au/servlet/rest/v1/vehicledata?market=AU&language=en',
  // B&P webapp config
  'https://www.ford.com.au/content/ford/au/en_au/home/build-and-price/jcr:content/header.json',
];

for (const url of vdmEndpoints) {
  const r = await f(url, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
  if (r.ok) {
    const text = await r.text();
    if (text.length > 50) {
      console.log(`OK ${url} (${(text.length/1024).toFixed(0)}KB)`);
      try {
        const json = JSON.parse(text);
        console.log(`  Keys: ${Object.keys(json).slice(0, 15).join(', ')}`);
      } catch {
        console.log(`  (not JSON)`);
      }
    }
  } else if (r.status !== 404 && r.status !== 'ERR') {
    console.log(`${r.status} ${url}`);
  }
}

// ============================================================
// PART 3: Get the Ranger page billboard section HTML
// ============================================================
console.log('\n=== PART 3: Ranger billboard HTML analysis ===\n');

// Look for the billboard-image div and all its children
const billboardMatch = rangerHtml.match(/<div[^>]*id="billboard-image"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
if (billboardMatch) {
  console.log(`Billboard div found (${billboardMatch[0].length} chars):`);
  console.log(billboardMatch[0].substring(0, 1000));
} else {
  // Try broader search
  const billboardId = rangerHtml.indexOf('billboard-image');
  if (billboardId > -1) {
    console.log(`billboard-image found at char ${billboardId}:`);
    console.log(rangerHtml.substring(billboardId - 100, billboardId + 500).replace(/\n/g, '\n'));
  }

  // Also look for the configuration div with gpas data
  const configIdx = rangerHtml.indexOf('data-gpas-');
  if (configIdx > -1) {
    console.log(`\nGPAS config context:`);
    console.log(rangerHtml.substring(configIdx - 200, configIdx + 500).replace(/\n/g, '\n'));
  }
}

// ============================================================
// PART 4: Try the Ranger showroom for sub-pages (explore, models)
// ============================================================
console.log('\n=== PART 4: Ranger sub-page discovery ===\n');

// Extract all internal links from Ranger page
const rangerLinks = [...new Set(
  (rangerHtml.match(/href="([^"]*ranger[^"]*)"[^>]*>/gi) || [])
    .map(m => m.match(/href="([^"]+)"/)?.[1])
    .filter(Boolean)
    .filter(u => u.startsWith('/') && !u.includes('.pdf') && !u.includes('#'))
)];

console.log(`Internal Ranger links (${rangerLinks.length}):`);
for (const link of rangerLinks.sort()) console.log(`  ${link}`);

// Also check Mustang page for sub-links
const mustangR = await f('https://www.ford.com.au/cars/mustang/', { headers: { 'Accept': 'text/html' } });
const mustangHtml = await mustangR.text();

const mustangLinks = [...new Set(
  (mustangHtml.match(/href="([^"]*mustang[^"]*)"[^>]*>/gi) || [])
    .map(m => m.match(/href="([^"]+)"/)?.[1])
    .filter(Boolean)
    .filter(u => u.startsWith('/') && !u.includes('.pdf') && !u.includes('#'))
)];

console.log(`\nInternal Mustang links (${mustangLinks.length}):`);
for (const link of mustangLinks.sort()) console.log(`  ${link}`);

// ============================================================
// PART 5: Try the discovered sub-pages
// ============================================================
console.log('\n=== PART 5: Sub-page probing ===\n');

const allSubPages = [...new Set([...rangerLinks, ...mustangLinks])];
for (const link of allSubPages) {
  const url = `https://www.ford.com.au${link}`;
  const r = await f(url, { headers: { 'Accept': 'text/html' } });
  if (r.ok) {
    const text = await r.text();
    if (text.length > 5000) {
      const colorRefs = (text.match(/colou?r|paint|swatch/gi) || []).length;
      const gpasRefs = (text.match(/gpas/gi) || []).length;
      const damImgs = [...new Set(text.match(/\/content\/dam\/Ford\/au\/nameplate\/[^"'\s<>)]+/g) || [])];
      if (colorRefs > 10 || gpasRefs > 0 || damImgs.length > 5) {
        console.log(`OK ${link} (${(text.length/1024).toFixed(0)}KB) color:${colorRefs} gpas:${gpasRefs} dam:${damImgs.length}`);
        for (const d of damImgs.filter(d => !d.match(/logo|icon|pdf/i)).slice(0, 5)) {
          console.log(`  ${d}`);
        }
      }
    }
  }
}

// ============================================================
// PART 6: Try fetching the DAM "choose-your-colour" images from Transit Custom
// ============================================================
console.log('\n=== PART 6: Transit Custom colour images ===\n');

// Transit Custom had "choose-your-colour-desktop.webp" and "choose-your-colour-mobile.webp"
// Let's check if there are color-specific variants
const tcBase = '/content/dam/Ford/au/nameplate/transit-custom/overview/billboard/';
const tcColors = ['frozen-white', 'shadow-black', 'blue-lightning', 'magnetic', 'agate-black', 'solar-silver', 'diffused-silver', 'lucid-red'];
for (const color of tcColors) {
  const paths = [
    `${tcBase}choose-your-colour-${color}-desktop.webp`,
    `${tcBase}${color}-desktop.webp`,
    `${tcBase}choose-your-colour/${color}-desktop.webp`,
  ];
  for (const path of paths) {
    const r = await f(`https://www.ford.com.au${path}`);
    if (r.ok) {
      const body = await r.arrayBuffer();
      console.log(`OK ${path.split('/').pop()} (${(body.byteLength/1024).toFixed(0)}KB)`);
      break;
    }
  }
}

// Also verify the choose-your-colour images exist
const tcCYC = [
  `${tcBase}choose-your-colour-desktop.webp`,
  `${tcBase}choose-your-colour-mobile.webp`,
];
for (const path of tcCYC) {
  const r = await f(`https://www.ford.com.au${path}`);
  if (r.ok) {
    const body = await r.arrayBuffer();
    console.log(`OK ${path.split('/').pop()} (${(body.byteLength/1024).toFixed(0)}KB)`);
  }
}

console.log('\n=== PROBE 5 COMPLETE ===');
