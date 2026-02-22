#!/usr/bin/env node
/**
 * probe-ford-images-2.mjs
 * Focused deep-dive on Ford Ranger page to find color/image data.
 * The Ranger page has 20 GUIDs, a 3DModel JSON-LD, and uses the "newer" AEM template.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function f(url, opts = {}) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': opts.accept || '*/*', ...opts.headers },
    });
    return r;
  } catch (e) {
    return { ok: false, status: 'ERR', text: async () => '', json: async () => null };
  }
}

// ============================================================
// PART 1: Deep Ranger page analysis - extract ALL GUIDs and their context
// ============================================================
console.log('=== PART 1: Ranger page GUID analysis ===\n');

const r = await f('https://www.ford.com.au/showroom/ranger/', { accept: 'text/html' });
const html = await r.text();
console.log(`Page size: ${(html.length/1024).toFixed(0)}KB`);

// Extract all GUIDs with surrounding context
const guidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const allGuids = [];
let match;
while ((match = guidRegex.exec(html)) !== null) {
  const start = Math.max(0, match.index - 100);
  const end = Math.min(html.length, match.index + match[0].length + 100);
  const context = html.substring(start, end).replace(/\n/g, ' ').trim();
  allGuids.push({ guid: match[0], context });
}
console.log(`\nAll GUIDs found (${allGuids.length}):`);
const uniqueGuids = new Map();
for (const g of allGuids) {
  if (!uniqueGuids.has(g.guid)) uniqueGuids.set(g.guid, g.context);
}
for (const [guid, ctx] of uniqueGuids) {
  console.log(`  ${guid}:`);
  console.log(`    ${ctx.substring(0, 200)}`);
}

// ============================================================
// PART 2: Try AEM model.json endpoints (targeted)
// ============================================================
console.log('\n=== PART 2: AEM model.json endpoints ===\n');

const aemUrls = [
  'https://www.ford.com.au/showroom/ranger.model.json',
  'https://www.ford.com.au/content/ford/au/en_au/home/showroom/ranger.model.json',
  'https://www.ford.com.au/content/ford/au/en_au/home/showroom/ranger/jcr:content.json',
  'https://www.ford.com.au/cars/mustang.model.json',
  'https://www.ford.com.au/content/ford/au/en_au/home/cars/mustang.model.json',
  // Try the vehicleData-url pattern discovered
  'https://www.ford.com.au/content/ford/au/en_au.model.json',
  'https://www.ford.com.au/content/ford/au/en_au/home.model.json',
];

for (const url of aemUrls) {
  const r = await f(url, { accept: 'application/json' });
  if (r.ok) {
    const text = await r.text();
    if (text.length > 100) {
      console.log(`OK ${url} (${(text.length/1024).toFixed(0)}KB)`);
      try {
        const json = JSON.parse(text);
        console.log(`  Top keys: ${Object.keys(json).slice(0, 15).join(', ')}`);
      } catch {
        console.log(`  (not JSON)`);
      }
    }
  } else {
    console.log(`${r.status} ${url}`);
  }
}

// ============================================================
// PART 3: Probe GPAS CDN with discovered GUIDs
// ============================================================
console.log('\n=== PART 3: GPAS CDN probing with discovered GUIDs ===\n');

const guids = [...uniqueGuids.keys()];
const gpasPatterns = [
  (g) => `https://gpas-cache.ford.com/guid/${g}`,
  (g) => `https://gpas-cache.ford.com/guid/${g}?width=800`,
  (g) => `https://gpas-cache.ford.com/guid/${g}?width=1200&height=800`,
];

for (const guid of guids.slice(0, 6)) {
  for (const patFn of gpasPatterns) {
    const url = patFn(guid);
    const r = await f(url);
    const ct = r.headers?.get?.('content-type') || '';
    if (r.ok) {
      const body = await r.text();
      console.log(`OK ${url} (${ct}, ${body.length} bytes)`);
      if (ct.includes('json')) console.log(`  ${body.substring(0, 300)}`);
      break; // Skip other patterns for this GUID
    } else {
      console.log(`${r.status} ${url}`);
      break; // Skip other patterns for this GUID
    }
  }
}

// ============================================================
// PART 4: Look for 3D model viewer / configurator data
// ============================================================
console.log('\n=== PART 4: 3D model / configurator data ===\n');

// The Ranger page has a 3DModel JSON-LD - let's find the full block
const modelLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
for (const m of modelLdMatch) {
  const content = m.replace(/<\/?script[^>]*>/gi, '').trim();
  console.log(`JSON-LD: ${content.substring(0, 500)}`);
  console.log('');
}

// Look for 3D viewer / WebGL / model-viewer tags
const viewerTags = html.match(/<(?:model-viewer|a-scene|canvas)[^>]*>/gi) || [];
const threejsRefs = html.match(/three\.?js|model-viewer|gltf|draco|meshopt/gi) || [];
console.log(`3D viewer tags: ${viewerTags.length}`);
console.log(`3D library refs: ${[...new Set(threejsRefs)].join(', ')}`);

// Look for iframe that might load the configurator
const iframes = html.match(/<iframe[^>]*src="([^"]+)"[^>]*>/gi) || [];
if (iframes.length) {
  console.log(`Iframes (${iframes.length}):`);
  for (const iframe of iframes) console.log(`  ${iframe.substring(0, 200)}`);
}

// ============================================================
// PART 5: Try Ford Vehicle Data Manager (VDM) endpoints
// ============================================================
console.log('\n=== PART 5: VDM and catalog endpoints ===\n');

// The data-key-code found on some pages
const keyCode = 'Al1EdZ_aW5T6XNlr-BJxCw1l4KaA0tmXFI_eTl1RITyYptWUS0qit_MprtcG7w2F';

const vdmUrls = [
  // VDM patterns used by Ford globally
  `https://www.ford.com.au/content/ford/au/en_au/home/showroom/ranger.caas.json`,
  `https://www.ford.com.au/content/ford/au/en_au/home/showroom/ranger.caas.json/jcr:content/bodyContent`,
  // VHS (Vehicle Hub Service) patterns
  `https://vhs.ford.com/api/v1/vehicles?market=AU&language=en`,
  `https://vhsapi.ford.com/api/v1/vehicles?market=AU`,
  // B&P API gateway
  `https://shop.ford.com.au/aemapi/bp3/v1/nameplates?market=AU&lang=en`,
  `https://shop.ford.com.au/aemapi/v2/bp3/nameplates?market=AU`,
  // Ford API gateway
  `https://api.ford.com.au/api/dealer/v1/vehicles`,
  // CXP (Customer Experience Platform)
  `https://www.ford.com.au/cxp/api/bp3/v1/nameplates`,
  `https://www.ford.com.au/cxp/api/bp3/v1/nameplates?market=AU`,
  // Pricing and vehicle data
  `https://www.ford.com.au/bin/ford/pricing?nameplate=Ranger&market=AU`,
  `https://www.ford.com.au/bin/ford/vehiclePricing?nameplate=Ranger`,
  // Try the vehicleData-url base
  `https://www.ford.com.au/content/ford/au/en_au/vehicleData/Ranger.json`,
  `https://www.ford.com.au/content/ford/au/en_au/home/vehicles/ranger/vehicleData.json`,
  `https://www.ford.com.au/content/ford/au/en_au/vehicledata/ranger.json`,
];

for (const url of vdmUrls) {
  const r = await f(url, { accept: 'application/json', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  if (r.ok) {
    const text = await r.text();
    if (text.length > 50) {
      console.log(`OK ${url} (${(text.length/1024).toFixed(0)}KB)`);
      try {
        const json = JSON.parse(text);
        console.log(`  Keys: ${Object.keys(json).slice(0, 10).join(', ')}`);
        console.log(`  Preview: ${JSON.stringify(json).substring(0, 400)}`);
      } catch {
        console.log(`  Preview: ${text.substring(0, 200)}`);
      }
    }
  } else if (r.status && r.status !== 404 && r.status !== 'ERR') {
    console.log(`${r.status} ${url}`);
  }
}

// ============================================================
// PART 6: Investigate Ford's DAM (Digital Asset Manager) patterns
// ============================================================
console.log('\n=== PART 6: DAM image patterns ===\n');

// Ford uses /content/dam/Ford/ for static assets
const damPatterns = [
  'https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/',
  'https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/colors/',
  'https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/colour/',
  'https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/swatches/',
  'https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/gallery/',
  'https://www.ford.com.au/content/dam/Ford/au/nameplate/mustang/',
  'https://www.ford.com.au/content/dam/Ford/au/nameplate/mustang/colors/',
];

// Also try to get DAM directory listing
for (const damUrl of damPatterns) {
  const r = await f(damUrl + '.json', { accept: 'application/json' });
  if (r.ok) {
    const text = await r.text();
    console.log(`OK ${damUrl}.json (${(text.length/1024).toFixed(0)}KB)`);
    try {
      const json = JSON.parse(text);
      console.log(`  Preview: ${JSON.stringify(json).substring(0, 500)}`);
    } catch {
      console.log(`  Preview: ${text.substring(0, 200)}`);
    }
  }
}

// Try known DAM image patterns
const colorNames = ['arctic-white', 'shadow-black', 'blue-lightning', 'aluminium-silver', 'conquer-grey'];
const damImagePatterns = [
  (c) => `https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/colors/${c}.png`,
  (c) => `https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/swatches/${c}.png`,
  (c) => `https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/color-chip-${c}.png`,
];

for (const color of colorNames) {
  for (const patFn of damImagePatterns) {
    const url = patFn(color);
    const r = await f(url);
    if (r.ok) {
      const ct = r.headers?.get?.('content-type') || '';
      console.log(`OK ${url} (${ct})`);
    }
  }
}

// ============================================================
// PART 7: Check the Ranger showroom page for JS that loads vehicle config
// ============================================================
console.log('\n=== PART 7: Ranger page JS analysis ===\n');

// Extract and fetch all JS files from the Ranger page
const jsSrcs = [...new Set(
  (html.match(/src="([^"]*\.js(?:\?[^"]*)?)"/gi) || [])
    .map(s => s.match(/src="([^"]+)"/)?.[1])
    .filter(Boolean)
)];

console.log(`JS files on Ranger page: ${jsSrcs.length}`);

// Focus on Ford-specific JS bundles (not analytics, fonts, etc.)
const fordJs = jsSrcs.filter(u =>
  (u.includes('ford') || u.startsWith('/')) &&
  !u.match(/analytics|adobe|gtm|google|facebook|tag.*manager|launch|satellite|cookie/i)
);

console.log(`Ford JS files: ${fordJs.length}`);

for (const jsPath of fordJs.slice(0, 8)) {
  const jsUrl = jsPath.startsWith('http') ? jsPath : `https://www.ford.com.au${jsPath}`;
  const r = await f(jsUrl);
  if (!r.ok) continue;

  const js = await r.text();
  if (js.length < 200) continue;

  // Look specifically for:
  // 1. GPAS URL patterns
  const gpasRefs = [...new Set(js.match(/gpas[^"'\s\n]{0,200}/gi) || [])];
  // 2. Color-related field names
  const colorFields = [...new Set(js.match(/["'](colou?r(?:Code|Name|Chip|Swatch|Image|Url|Hex|RGB)?|paint(?:Code|Name)?|exterior(?:Color|Colour)?|swatch(?:Url|Image)?|chipUrl)["']/gi) || [])];
  // 3. Vehicle/configurator API URLs
  const apiUrls = [...new Set(js.match(/["'](?:https?:)?\/\/[^"'\s]*(?:vehicle|configurator|catalog|bp3|vdm|vhs|gpas)[^"'\s]*["']/gi) || [])];
  // 4. Build-and-price config
  const bpConfig = [...new Set(js.match(/["'](?:bnp|build.*price|configurator|nameplat)[^"'\s]{0,100}["']/gi) || [])];
  // 5. Image URL builder patterns
  const imgBuilders = [...new Set(js.match(/["'][^"']*image[^"']*url[^"']*["']|imageUrl|imgUrl|heroImage|swatchImage/gi) || [])];

  if (gpasRefs.length || colorFields.length || apiUrls.length || bpConfig.length || imgBuilders.length) {
    const filename = jsPath.split('/').pop()?.split('?')[0];
    console.log(`\n  ${filename} (${(js.length/1024).toFixed(0)}KB):`);
    if (gpasRefs.length) console.log(`    GPAS: ${gpasRefs.slice(0, 5).join(' | ')}`);
    if (colorFields.length) console.log(`    Color fields: ${colorFields.join(', ')}`);
    if (apiUrls.length) console.log(`    API URLs: ${apiUrls.slice(0, 5).join('\n             ')}`);
    if (bpConfig.length) console.log(`    B&P config: ${bpConfig.slice(0, 5).join(', ')}`);
    if (imgBuilders.length) console.log(`    Image builders: ${imgBuilders.slice(0, 5).join(', ')}`);

    // If we found GPAS or API URLs, extract more context around them
    if (gpasRefs.length) {
      for (const ref of gpasRefs.slice(0, 2)) {
        const idx = js.indexOf(ref);
        if (idx > -1) {
          const start = Math.max(0, idx - 200);
          const end = Math.min(js.length, idx + ref.length + 200);
          console.log(`    GPAS context: ...${js.substring(start, end).replace(/\n/g, ' ').trim().substring(0, 400)}...`);
        }
      }
    }
  }
}

// ============================================================
// PART 8: Check the Ranger page for embedded Micro-Frontend / Web Component config
// ============================================================
console.log('\n=== PART 8: Micro-frontend / Web Component analysis ===\n');

// Ford uses web components for their configurator
const customElements = html.match(/<[a-z]+-[a-z]+[^>]*>/gi) || [];
const uniqueElements = [...new Set(customElements.map(e => e.match(/<([a-z]+-[a-z-]+)/)?.[1]).filter(Boolean))];
if (uniqueElements.length) {
  console.log(`Custom elements: ${uniqueElements.join(', ')}`);
}

// Look for shadow DOM / web component scripts
const wcScripts = html.match(/customElements\.define|attachShadow|shadowRoot/gi) || [];
if (wcScripts.length) console.log(`Web component patterns: ${wcScripts.length}`);

// Look for lit/stencil/angular elements or React portals
const frameworks = html.match(/lit-element|stencil|angular|react-dom|vue\./gi) || [];
if (frameworks.length) console.log(`Frameworks detected: ${[...new Set(frameworks)].join(', ')}`);

// Check for Akamai/Edgecast/Cloudfront CDN patterns
const cdnRefs = html.match(/https?:\/\/[^"'\s<>)]*(?:akamai|edgecast|cloudfront|fastly|cdn)[^"'\s<>)]*/gi) || [];
if (cdnRefs.length) {
  console.log(`CDN URLs: ${[...new Set(cdnRefs)].slice(0, 5).join('\n  ')}`);
}

// ============================================================
// PART 9: Try the 3D model viewer endpoint directly
// ============================================================
console.log('\n=== PART 9: 3D viewer and interactive config endpoints ===\n');

const viewerUrls = [
  'https://www.ford.com.au/showroom/ranger/3d-model/',
  'https://www.ford.com.au/showroom/ranger/360/',
  'https://www.ford.com.au/showroom/ranger/explore/',
  'https://www.ford.com.au/showroom/ranger/colours/',
  'https://www.ford.com.au/showroom/ranger/colors/',
  'https://www.ford.com.au/showroom/ranger/gallery/',
  'https://www.ford.com.au/cars/mustang/gallery/',
  'https://www.ford.com.au/cars/mustang/colours/',
  // Build and price with model
  'https://www.ford.com.au/build-and-price/ranger/',
  'https://www.ford.com.au/build-and-price/mustang/',
  'https://www.ford.com.au/build-and-price/?nameplate=Ranger',
];

for (const url of viewerUrls) {
  const r = await f(url, { accept: 'text/html' });
  if (r.ok) {
    const text = await r.text();
    if (text.length > 5000) {
      console.log(`OK ${url} (${(text.length/1024).toFixed(0)}KB)`);

      // Quick check for color data in these pages
      const colorRefs = text.match(/colou?r|paint|swatch/gi) || [];
      const gpasRefs = text.match(/gpas/gi) || [];
      const imgDomains = {};
      const imgs = text.match(/https?:\/\/[^"'\s<>)]+\.(jpg|jpeg|png|webp)/gi) || [];
      for (const img of imgs) {
        try { const d = new URL(img).hostname; imgDomains[d] = (imgDomains[d] || 0) + 1; } catch {}
      }
      console.log(`  Color refs: ${colorRefs.length}, GPAS refs: ${gpasRefs.length}`);
      console.log(`  Image domains: ${JSON.stringify(Object.entries(imgDomains).sort((a,b)=>b[1]-a[1]).slice(0,5))}`);
    }
  } else {
    console.log(`${r.status} ${url}`);
  }
}

console.log('\n=== PROBE 2 COMPLETE ===');
