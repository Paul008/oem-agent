#!/usr/bin/env node
/**
 * probe-ford-images.mjs
 * Deep investigation of Ford Australia color/image data sources.
 * Probes showroom pages, build-and-price, GPAS CDN, and AEM content APIs.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FORD_BASE = 'https://www.ford.com.au';

const models = [
  'ranger', 'everest', 'mustang', 'mustang-mach-e', 'puma',
  'escape', 'endura', 'transit', 'transit-custom', 'e-transit',
  'ranger-raptor', 'f-150', 'bronco', 'f-150-lightning',
];

async function fetchSafe(url, opts = {}) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*', ...opts.headers },
      ...opts,
    });
    return r;
  } catch (e) {
    return { ok: false, status: 'ERR', statusText: e.message, text: async () => '', json: async () => null };
  }
}

// ============================================================
// PHASE 1: Find working showroom URLs
// ============================================================
console.log('=== PHASE 1: Discover working Ford model URLs ===\n');

const urlPatterns = [
  (m) => `${FORD_BASE}/showroom/${m}/`,
  (m) => `${FORD_BASE}/showroom/${m}`,
  (m) => `${FORD_BASE}/content/ford/au/en_au/home/showroom/${m}.html`,
  (m) => `${FORD_BASE}/vehicles/${m}/`,
  (m) => `${FORD_BASE}/cars/${m}/`,
  (m) => `${FORD_BASE}/suvs/${m}/`,
  (m) => `${FORD_BASE}/commercial/${m}/`,
  (m) => `${FORD_BASE}/${m}/`,
];

const workingUrls = {};

for (const model of models) {
  for (const patternFn of urlPatterns) {
    const url = patternFn(model);
    const r = await fetchSafe(url);
    if (r.ok) {
      const html = await r.text();
      if (html.length > 5000) {
        console.log(`  OK ${model} => ${url} (${(html.length/1024).toFixed(0)}KB)`);
        workingUrls[model] = { url, html };
        break;
      }
    }
  }
  if (!workingUrls[model]) {
    console.log(`  -- ${model}: no working URL found`);
  }
}

console.log(`\nFound ${Object.keys(workingUrls).length} working model pages.\n`);

// ============================================================
// PHASE 2: Deep HTML analysis on working pages
// ============================================================
console.log('=== PHASE 2: Analyze HTML for color/image data ===\n');

for (const [model, { url, html }] of Object.entries(workingUrls)) {
  console.log(`--- ${model} (${url}) ---`);

  // GPAS URLs
  const gpasUrls = [...new Set(html.match(/https?:\/\/gpas-cache\.ford\.com[^"'\s<>)]+/g) || [])];
  if (gpasUrls.length) {
    console.log(`  GPAS URLs (${gpasUrls.length}):`);
    for (const u of gpasUrls.slice(0, 10)) console.log(`    ${u}`);
  }

  // Color/paint keywords in data attributes
  const dataAttrs = html.match(/data-[a-z-]*(?:color|colour|paint|swatch|variant|config|model|vehicle|code)[a-z-]*="[^"]*"/gi) || [];
  if (dataAttrs.length) {
    console.log(`  Data attributes (${dataAttrs.length}):`);
    for (const a of [...new Set(dataAttrs)].slice(0, 10)) console.log(`    ${a}`);
  }

  // JSON-LD
  const jsonLd = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  if (jsonLd.length) {
    console.log(`  JSON-LD scripts: ${jsonLd.length}`);
    for (const jl of jsonLd) {
      const content = jl.replace(/<\/?script[^>]*>/gi, '').trim();
      if (content.match(/colou?r|paint|variant|model|offer/i)) {
        console.log(`    Contains color/variant data! Preview: ${content.substring(0, 300)}`);
      }
    }
  }

  // Inline JS data objects
  const jsDataPatterns = [
    /window\.__[A-Z_]+__\s*=\s*/g,
    /var\s+(?:pageData|vehicleData|modelData|colorData|configData)\s*=\s*/gi,
    /"(?:colorOptions|colours|colors|paintOptions|exteriorColors)"\s*:\s*[\[{]/gi,
    /"(?:wltp|bodyStyle|variant|trim|grade)"\s*:\s*[\[{"]/gi,
  ];
  for (const pat of jsDataPatterns) {
    const matches = html.match(pat) || [];
    if (matches.length) {
      for (const m of matches) {
        const idx = html.indexOf(m);
        const snippet = html.substring(idx, idx + 400).replace(/\n/g, ' ').trim();
        console.log(`  JS data: ${snippet.substring(0, 200)}`);
      }
    }
  }

  // AEM Content Fragment data
  const cfMatches = html.match(/data-cmp-contentfragment='([^']+)'/g) || [];
  if (cfMatches.length) {
    console.log(`  AEM Content Fragments: ${cfMatches.length}`);
    for (const cf of cfMatches.slice(0, 3)) {
      try {
        const data = JSON.parse(cf.replace("data-cmp-contentfragment='", '').replace(/'$/, ''));
        console.log(`    CF: ${JSON.stringify(data).substring(0, 300)}`);
      } catch {}
    }
  }

  // Search for GUID patterns (Ford uses GUIDs in image paths)
  const guids = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
  if (guids.length) {
    console.log(`  GUIDs found (${guids.length}): ${[...new Set(guids)].slice(0, 5).join(', ')}`);
  }

  // All unique image URLs
  const allImgs = [...new Set(html.match(/https?:\/\/[^"'\s<>)]+\.(jpg|jpeg|png|webp|avif)/gi) || [])];
  const imgDomains = {};
  for (const img of allImgs) {
    try { const d = new URL(img).hostname; imgDomains[d] = (imgDomains[d] || 0) + 1; } catch {}
  }
  console.log(`  Image domains:`, Object.entries(imgDomains).sort((a,b) => b[1]-a[1]).slice(0, 8));

  // Look for color-related image URLs specifically
  const colorImgs = allImgs.filter(u => u.match(/colou?r|paint|swatch|exterior|overlay/i));
  if (colorImgs.length) {
    console.log(`  Color images (${colorImgs.length}):`);
    for (const img of colorImgs.slice(0, 8)) console.log(`    ${img}`);
  }

  // Look for any CDN URLs that might have vehicle images
  const cdnImgs = allImgs.filter(u => u.match(/gpas|dam|scene7|cloudinary|imgix|cdn/i));
  if (cdnImgs.length) {
    console.log(`  CDN images (${cdnImgs.length}):`);
    for (const img of cdnImgs.slice(0, 8)) console.log(`    ${img}`);
  }

  console.log('');
}

// ============================================================
// PHASE 3: Probe build-and-price tool
// ============================================================
console.log('=== PHASE 3: Build-and-Price tool probing ===\n');

const bpUrls = [
  `${FORD_BASE}/content/ford/au/en_au/home/build-and-price.html`,
  `${FORD_BASE}/build-and-price/`,
  `${FORD_BASE}/build-and-price`,
  `${FORD_BASE}/configurator/`,
];

for (const url of bpUrls) {
  const r = await fetchSafe(url);
  const status = r.status || (r.ok ? 200 : 'ERR');
  if (r.ok) {
    const html = await r.text();
    console.log(`  OK ${url} (${(html.length/1024).toFixed(0)}KB)`);

    // Look for API base URLs in the build-and-price page
    const apiUrls = html.match(/https?:\/\/[^"'\s<>)]*(?:api|service|config|catalog|vehicle)[^"'\s<>)]*/gi) || [];
    const unique = [...new Set(apiUrls)];
    if (unique.length) {
      console.log(`  API URLs found (${unique.length}):`);
      for (const u of unique.slice(0, 15)) console.log(`    ${u}`);
    }

    // Look for JS bundle URLs that might reveal API endpoints
    const jsBundles = html.match(/(?:src|href)="([^"]*(?:main|app|vendor|chunk|bundle|config)[^"]*\.js)"/gi) || [];
    if (jsBundles.length) {
      console.log(`  JS bundles: ${jsBundles.length}`);
      for (const b of jsBundles.slice(0, 5)) console.log(`    ${b}`);
    }

    // GPAS refs
    const gpas = html.match(/gpas[^"'\s<>)]{0,200}/gi) || [];
    if (gpas.length) console.log(`  GPAS refs: ${[...new Set(gpas)].slice(0, 5)}`);
  } else {
    console.log(`  ${status} ${url}`);
  }
}

// ============================================================
// PHASE 4: Probe AEM content API endpoints
// ============================================================
console.log('\n=== PHASE 4: AEM Content API probing ===\n');

const aemEndpoints = [];
for (const model of Object.keys(workingUrls)) {
  aemEndpoints.push(
    `${FORD_BASE}/content/ford/au/en_au/home/showroom/${model}.model.json`,
    `${FORD_BASE}/content/ford/au/en_au/home/showroom/${model}/jcr:content.json`,
    `${FORD_BASE}/content/ford/au/en_au/home/showroom/${model}.infinity.json`,
    `${FORD_BASE}/content/ford/au/en_au/home/showroom/${model}.data`,
    `${FORD_BASE}/content/ford/au/en_au/home/showroom/${model}/gallery.model.json`,
    `${FORD_BASE}/showroom/${model}.model.json`,
    `${FORD_BASE}/showroom/${model}/jcr:content.json`,
    `${FORD_BASE}/content/ford/au/en_au/home/vehicles/${model}.model.json`,
    `${FORD_BASE}/content/ford/au/en_au/home/vehicles/${model}/gallery.data`,
  );
}

// Also add generic config endpoints
aemEndpoints.push(
  `${FORD_BASE}/content/ford/au/en_au/home/build-and-price.model.json`,
  `${FORD_BASE}/content/ford/au/en_au/home/build-and-price/jcr:content.json`,
  `${FORD_BASE}/content/ford/au/en_au/home.model.json`,
);

for (const url of aemEndpoints) {
  const r = await fetchSafe(url);
  if (r.ok) {
    const text = await r.text();
    if (text.length > 100) {
      console.log(`  OK ${url} (${(text.length/1024).toFixed(0)}KB)`);
      // Quick peek at content
      try {
        const json = JSON.parse(text);
        const keys = Object.keys(json);
        console.log(`     Keys: ${keys.slice(0, 10).join(', ')}`);
        // Check for color-related keys recursively (1 level)
        for (const k of keys) {
          if (typeof json[k] === 'object' && json[k]) {
            const subKeys = Object.keys(json[k]);
            const colorKeys = subKeys.filter(sk => sk.match(/colou?r|paint|swatch|exterior|variant|trim|grade|image/i));
            if (colorKeys.length) console.log(`     ${k} has color keys: ${colorKeys.join(', ')}`);
          }
        }
      } catch {
        console.log(`     (not JSON) Preview: ${text.substring(0, 200)}`);
      }
    }
  }
}

// ============================================================
// PHASE 5: Probe GPAS CDN patterns
// ============================================================
console.log('\n=== PHASE 5: GPAS CDN pattern probing ===\n');

// Known GPAS patterns from other Ford markets
const gpasPaths = [
  'https://gpas-cache.ford.com/guid/0a9f97d6-4d83-327a-8a77-03375ccd5726',  // US Ranger sample
  'https://gpas-cache.ford.com/guid/b02b59c6-c tried',
];

// Try known Ford API patterns
const fordApis = [
  `${FORD_BASE}/api/vehicles`,
  `${FORD_BASE}/api/v1/vehicles`,
  `${FORD_BASE}/api/models`,
  `${FORD_BASE}/api/configurator/models`,
  `${FORD_BASE}/cxp/api/catalog/v1/vehicles`,
  `${FORD_BASE}/cxp/api/catalog/models`,
  `https://shop.ford.com.au/api/catalog/v1/vehicles`,
  `https://www.ford.com.au/servlet/rest/v1/vehicle/model/ranger`,
  `https://www.ford.com.au/servlet/rest/v1/vehicle/models`,
];

for (const url of fordApis) {
  const r = await fetchSafe(url, { headers: { 'Accept': 'application/json' } });
  const status = r.status || 'ERR';
  if (r.ok) {
    const text = await r.text();
    console.log(`  OK ${url} (${(text.length/1024).toFixed(0)}KB)`);
    try {
      const json = JSON.parse(text);
      console.log(`     Preview: ${JSON.stringify(json).substring(0, 300)}`);
    } catch {
      console.log(`     Preview: ${text.substring(0, 200)}`);
    }
  } else {
    console.log(`  ${status} ${url}`);
  }
}

// ============================================================
// PHASE 6: Deep-dive into working showroom page for embedded configs
// ============================================================
console.log('\n=== PHASE 6: Deep showroom page analysis ===\n');

// Pick the first working model (likely ranger) for deep analysis
const [firstModel, firstData] = Object.entries(workingUrls)[0] || [];
if (firstModel && firstData) {
  const { html } = firstData;
  console.log(`Deep analysis of ${firstModel} page (${(html.length/1024).toFixed(0)}KB):\n`);

  // Extract ALL script blocks and look for configuration data
  const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log(`Total <script> blocks: ${scripts.length}`);

  for (let i = 0; i < scripts.length; i++) {
    const content = scripts[i].replace(/<\/?script[^>]*>/gi, '').trim();
    if (content.length < 50) continue;

    // Check if script contains vehicle/color/config data
    const hasVehicle = content.match(/vehicle|model|variant|trim|grade|body/i);
    const hasColor = content.match(/colou?r|paint|swatch|exterior/i);
    const hasImage = content.match(/gpas|image.*url|src.*image|photo|gallery/i);
    const hasConfig = content.match(/config|catalog|api.*url|endpoint|baseUrl/i);

    if (hasVehicle || hasColor || hasImage || hasConfig) {
      const tags = [];
      if (hasVehicle) tags.push('VEHICLE');
      if (hasColor) tags.push('COLOR');
      if (hasImage) tags.push('IMAGE');
      if (hasConfig) tags.push('CONFIG');
      console.log(`\n  Script #${i} [${tags.join(',')}] (${content.length} chars):`);
      console.log(`    ${content.substring(0, 500).replace(/\n/g, '\n    ')}`);
    }
  }

  // Extract all unique URLs from page
  console.log('\n  All unique URLs containing "ford" or API patterns:');
  const allUrls = [...new Set(html.match(/https?:\/\/[^"'\s<>)]+/g) || [])];
  const interestingUrls = allUrls.filter(u =>
    u.match(/api|service|config|catalog|gpas|dam|scene7|vehicle|model|build/i) &&
    !u.match(/\.css$|\.js$|\.woff|\.svg$|google|facebook|adobe|fonts\.|analytics/i)
  );
  for (const u of interestingUrls.slice(0, 20)) {
    console.log(`    ${u}`);
  }

  // Look for inline CSS with color swatches (background-color or background-image)
  const swatchStyles = html.match(/background(?:-(?:color|image))?\s*:\s*(?:#[0-9a-f]{3,8}|rgb[^)]+\)|url\([^)]+\))/gi) || [];
  const uniqueSwatches = [...new Set(swatchStyles)];
  if (uniqueSwatches.length) {
    console.log(`\n  Inline swatch styles (${uniqueSwatches.length}):`);
    for (const s of uniqueSwatches.slice(0, 15)) console.log(`    ${s}`);
  }

  // Look for color hex codes in data attributes or inline styles
  const hexCodes = html.match(/(?:data-[a-z-]*="|style=")[^"]*#[0-9a-f]{6}[^"]*"/gi) || [];
  if (hexCodes.length) {
    console.log(`\n  Hex color codes in attributes (${hexCodes.length}):`);
    for (const h of [...new Set(hexCodes)].slice(0, 10)) console.log(`    ${h}`);
  }
}

// ============================================================
// PHASE 7: Try Ford's build-and-price XHR endpoints
// ============================================================
console.log('\n=== PHASE 7: Build-and-price XHR/API endpoints ===\n');

// Ford Australia uses a CX platform (CXP) for build-and-price
const bpApiUrls = [
  // Common Ford CXP patterns
  `${FORD_BASE}/cxp/api/catalog/v2/ford/au/en_au/products`,
  `${FORD_BASE}/cxp/api/catalog/v2/ford/au/en_au/products/ranger`,
  `${FORD_BASE}/cxp/api/catalog/v2/ford/au/en_au/models`,
  `${FORD_BASE}/cxp/api/v1/models`,
  `${FORD_BASE}/bp/api/v1/models`,
  `${FORD_BASE}/bp3/api/v1/models`,
  // GPAS image service
  'https://gpas-cache.ford.com/v1/content/ford/au/en_au/vehicles',
  'https://gpas-cache.ford.com/v1/images/ford/au/vehicles',
  // Ford's Blue Oval API
  'https://api.ford.com/api/fordau/v1/vehicles',
  'https://api.mps.ford.com/api/lookup/v1/vehicle/ford/au',
  // AEM GraphQL
  `${FORD_BASE}/graphql/execute.json/ford-au/models`,
  `${FORD_BASE}/graphql/execute.json/ford/models`,
  // Sitecore/AEM experience fragments
  `${FORD_BASE}/content/experience-fragments/ford/au/en_au/showroom.model.json`,
  `${FORD_BASE}/content/experience-fragments/ford/au/en_au/build-and-price.model.json`,
  // Try /bin/ servlet patterns (AEM)
  `${FORD_BASE}/bin/ford/vehicledata.json`,
  `${FORD_BASE}/bin/ford/vehicledata?market=au`,
  `${FORD_BASE}/bin/ford/models.json`,
];

for (const url of bpApiUrls) {
  const r = await fetchSafe(url, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
  const status = r.status || 'ERR';
  if (r.ok) {
    const text = await r.text();
    if (text.length > 50) {
      console.log(`  OK ${url} (${(text.length/1024).toFixed(0)}KB)`);
      try {
        const json = JSON.parse(text);
        console.log(`     Keys: ${JSON.stringify(Object.keys(json)).substring(0, 200)}`);
        console.log(`     Preview: ${JSON.stringify(json).substring(0, 400)}`);
      } catch {
        console.log(`     Preview: ${text.substring(0, 200)}`);
      }
    }
  } else if (status !== 'ERR' && status !== 404) {
    console.log(`  ${status} ${url}`);
  }
}

// ============================================================
// PHASE 8: Fetch and analyze JS bundles for API endpoint discovery
// ============================================================
console.log('\n=== PHASE 8: JS Bundle analysis for API endpoints ===\n');

if (firstModel && firstData) {
  const { html } = firstData;

  // Extract JS bundle URLs
  const jsSrcs = [...new Set(html.match(/src="([^"]*\.js(?:\?[^"]*)?)"/gi) || [])];
  const fordJs = jsSrcs
    .map(s => s.match(/src="([^"]+)"/)?.[1])
    .filter(Boolean)
    .filter(u => u.includes('ford') || u.startsWith('/'))
    .slice(0, 10);

  console.log(`Found ${fordJs.length} Ford JS bundles to analyze:`);

  for (const jsPath of fordJs) {
    const jsUrl = jsPath.startsWith('http') ? jsPath : `${FORD_BASE}${jsPath}`;
    const r = await fetchSafe(jsUrl);
    if (!r.ok) continue;

    const js = await r.text();
    if (js.length < 100) continue;

    // Look for API URL patterns in JS
    const apiPatterns = js.match(/["'](?:https?:)?\/\/[^"'\s]*(?:api|gpas|service|catalog|vehicle|config)[^"'\s]*["']/gi) || [];
    const colorPatterns = js.match(/["'](?:colou?rCode|paintCode|swatchUrl|exteriorColor|colorChipUrl|colorImageUrl)["']/gi) || [];
    const imagePatterns = js.match(/gpas-cache\.ford\.com[^"'\s]*/gi) || [];

    if (apiPatterns.length || colorPatterns.length || imagePatterns.length) {
      console.log(`  ${jsPath.split('/').pop()} (${(js.length/1024).toFixed(0)}KB):`);
      if (apiPatterns.length) {
        console.log(`    API URLs (${apiPatterns.length}):`);
        for (const a of [...new Set(apiPatterns)].slice(0, 10)) console.log(`      ${a}`);
      }
      if (colorPatterns.length) {
        console.log(`    Color fields: ${[...new Set(colorPatterns)].join(', ')}`);
      }
      if (imagePatterns.length) {
        console.log(`    GPAS patterns: ${[...new Set(imagePatterns)].slice(0, 5)}`);
      }
    }
  }
}

console.log('\n=== PROBE COMPLETE ===\n');
