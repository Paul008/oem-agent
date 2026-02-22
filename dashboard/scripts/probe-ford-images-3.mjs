#!/usr/bin/env node
/**
 * probe-ford-images-3.mjs
 * Deep dive into Ford B&P page color data, GPAS billboard config,
 * and DAM image URL construction.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function f(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*' } });
    return r;
  } catch (e) {
    return { ok: false, status: 'ERR', text: async () => '' };
  }
}

// ============================================================
// PART 1: Extract billboard configuration divs from Ranger page
// ============================================================
console.log('=== PART 1: Ranger billboard/GPAS configuration ===\n');

const rangerR = await f('https://www.ford.com.au/showroom/ranger/');
const rangerHtml = await rangerR.text();

// Find ALL data attributes related to GPAS on the page
const gpasAttrs = rangerHtml.match(/data-gpas[^=]*="[^"]*"/gi) || [];
console.log(`GPAS data attributes (${gpasAttrs.length}):`);
for (const a of [...new Set(gpasAttrs)]) console.log(`  ${a}`);

// Find configuration div with billboard data
const billboardDivs = rangerHtml.match(/<div[^>]*class="[^"]*configuration[^"]*"[^>]*>/gi) || [];
console.log(`\nBillboard/configuration divs (${billboardDivs.length}):`);
for (const div of billboardDivs) console.log(`  ${div.substring(0, 300)}`);

// Look for the data-gpas-serv-path attribute more broadly
const servPaths = rangerHtml.match(/data-gpas-serv-path="[^"]*"/gi) || [];
console.log(`\nGPAS serv paths: ${servPaths}`);

const stagingDomains = rangerHtml.match(/data-gpas-staging-domains="[^"]*"/gi) || [];
console.log(`GPAS staging domains: ${stagingDomains}`);

// Find ALL data attributes that contain image/url-like content
const imgDataAttrs = rangerHtml.match(/data-[a-z-]+"[^"]*(?:\/content\/dam|\.jpg|\.png|\.webp|image|url|src)[^"]*"/gi) || [];
console.log(`\nImage-related data attributes (${[...new Set(imgDataAttrs)].length}):`);
for (const a of [...new Set(imgDataAttrs)].slice(0, 20)) console.log(`  ${a}`);

// ============================================================
// PART 2: Analyze build-and-price page for color data
// ============================================================
console.log('\n=== PART 2: Build-and-price color data ===\n');

const bpR = await f('https://www.ford.com.au/build-and-price/?nameplate=Ranger');
const bpHtml = await bpR.text();
console.log(`B&P page size: ${(bpHtml.length/1024).toFixed(0)}KB`);

// Extract color/colour references with context
const colorContexts = [];
const colorRegex = /(?:colou?r|paint)(?:Code|Name|Option|Chip|Swatch)?/gi;
let cm;
const seen = new Set();
while ((cm = colorRegex.exec(bpHtml)) !== null) {
  const start = Math.max(0, cm.index - 80);
  const end = Math.min(bpHtml.length, cm.index + cm[0].length + 80);
  const ctx = bpHtml.substring(start, end).replace(/\n/g, ' ').trim();
  if (!seen.has(ctx)) {
    seen.add(ctx);
    colorContexts.push(ctx);
  }
}
console.log(`Unique color contexts (${colorContexts.length}, showing first 30):`);
for (const ctx of colorContexts.slice(0, 30)) console.log(`  ${ctx}`);

// Look for data-color or data-paint attributes
const colorDataAttrs = bpHtml.match(/data-[a-z-]*(?:colou?r|paint|swatch)[^=]*="[^"]*"/gi) || [];
console.log(`\nColor data attributes (${colorDataAttrs.length}):`);
for (const a of [...new Set(colorDataAttrs)].slice(0, 20)) console.log(`  ${a}`);

// Look for color hex codes as background-color in style attributes or CSS
const hexInStyles = bpHtml.match(/(?:background-color|color)\s*:\s*#[0-9a-f]{3,8}/gi) || [];
console.log(`\nHex colors in styles (${[...new Set(hexInStyles)].length}):`);
for (const h of [...new Set(hexInStyles)].slice(0, 20)) console.log(`  ${h}`);

// ============================================================
// PART 3: Check if Ranger page has DAM gallery images per color
// ============================================================
console.log('\n=== PART 3: DAM gallery investigation ===\n');

// Extract all /content/dam/ URLs from Ranger page
const damUrls = [...new Set(rangerHtml.match(/\/content\/dam\/[^"'\s<>)]+/g) || [])];
console.log(`DAM URLs on Ranger page (${damUrls.length}):`);
for (const u of damUrls) console.log(`  ${u}`);

// Also from B&P page
const bpDamUrls = [...new Set(bpHtml.match(/\/content\/dam\/[^"'\s<>)]+/g) || [])];
console.log(`\nDAM URLs on B&P page (${bpDamUrls.length}):`);
for (const u of bpDamUrls.slice(0, 30)) console.log(`  ${u}`);

// ============================================================
// PART 4: Try common Ford image path patterns with known DAM structure
// ============================================================
console.log('\n=== PART 4: Probe DAM directory structure ===\n');

// From the Ranger page, we saw: /content/dam/Ford/website-assets/ap/au/home/logo/
// Let's probe the nameplate directory structure
const probePaths = [
  '/content/dam/Ford/au/nameplate/ranger.json',
  '/content/dam/Ford/au/nameplate/ranger/1.json',
  '/content/dam/Ford/au/nameplate.json',
  '/content/dam/Ford.json',
  '/content/dam/Ford/au.json',
  '/content/dam/Ford/au/nameplate/ranger/overview.json',
  '/content/dam/Ford/au/nameplate/ranger/gallery.json',
  '/content/dam/Ford/au/nameplate/ranger/build-and-price.json',
  // Try different DAM structures
  '/content/dam/Ford/website-assets/ap/au.json',
  '/content/dam/Ford/website-assets/ap/au/home.json',
  '/content/dam/Ford/website-assets/ap/au/home/showroom.json',
  '/content/dam/Ford/website-assets/ap/au/home/showroom/ranger.json',
];

for (const path of probePaths) {
  const r = await f(`https://www.ford.com.au${path}`);
  if (r.ok) {
    const text = await r.text();
    if (text.length > 50) {
      console.log(`OK ${path} (${(text.length/1024).toFixed(0)}KB)`);
      try {
        const json = JSON.parse(text);
        const keys = Object.keys(json);
        console.log(`  Keys: ${keys.slice(0, 15).join(', ')}`);
        // Look for child nodes that might be color images
        for (const k of keys) {
          if (typeof json[k] === 'object' && json[k]?.['jcr:primaryType']) {
            console.log(`  ${k}: ${json[k]['jcr:primaryType']}`);
          }
        }
      } catch {
        console.log(`  (HTML, not JSON)`);
      }
    }
  }
}

// ============================================================
// PART 5: Extract swatch/color chip styles from Ranger and B&P pages
// ============================================================
console.log('\n=== PART 5: Swatch styles and inline color data ===\n');

// Look for swatch-related CSS classes and their styles
const swatchClasses = bpHtml.match(/class="[^"]*swatch[^"]*"/gi) || [];
console.log(`Swatch classes (${swatchClasses.length}):`);
for (const c of [...new Set(swatchClasses)].slice(0, 10)) console.log(`  ${c}`);

// Look for inline styles with background colors (potential swatch colors)
const bgStyles = bpHtml.match(/style="[^"]*background[^"]*"/gi) || [];
console.log(`\nBackground styles (${bgStyles.length}):`);
for (const s of [...new Set(bgStyles)].slice(0, 15)) console.log(`  ${s}`);

// Look for AEM component data that might contain color configs
const aemComponents = bpHtml.match(/data-cmp-[a-z-]+="[^"]+"/gi) || [];
console.log(`\nAEM component data (${[...new Set(aemComponents)].length}):`);
for (const c of [...new Set(aemComponents)].slice(0, 10)) console.log(`  ${c}`);

// ============================================================
// PART 6: Try Ford's Vehicle Image Delivery patterns from US/EU
// ============================================================
console.log('\n=== PART 6: Vehicle image delivery patterns ===\n');

const imageDeliveryUrls = [
  // Ford image service patterns
  'https://build.ford.com.au/api/v2/gallery/ranger/2025',
  'https://build.ford.com/dig/Ford/Ranger/2025/HD-TILE/Image',
  // Ford Digital Image Gallery (DIG) - used in US
  'https://build.ford.com/dig/Ford/Ranger/2025/HD-TILE/Image%5B%7CFord%7CRanger%7C2025%7C1%7C1.%7C100A..SM4..89N.PQ.88W.64T.RET.44B.AC.PKS.SS6.913.648.XLL.%5D/EXT/1/vehicle.png',
  // Australia-specific DIG
  'https://build.ford.com.au/dig/Ford/Ranger/2025/HD-TILE',
  // Simpler patterns
  'https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/gallery/colors/arctic-white/exterior-front.webp',
  'https://www.ford.com.au/content/dam/Ford/au/nameplate/ranger/gallery/exterior-front.webp',
];

for (const url of imageDeliveryUrls) {
  const r = await f(url);
  const ct = r.headers?.get?.('content-type') || '';
  if (r.ok) {
    const body = await r.arrayBuffer();
    console.log(`OK ${url.substring(0, 100)} (${ct}, ${body.byteLength} bytes)`);
  } else {
    console.log(`${r.status} ${url.substring(0, 100)}`);
  }
}

// ============================================================
// PART 7: Check for Mustang-specific color pages
// ============================================================
console.log('\n=== PART 7: Mustang page deep analysis ===\n');

const mustangR = await f('https://www.ford.com.au/cars/mustang/');
const mustangHtml = await mustangR.text();

// Look for color mentions with surrounding HTML
const mustangColors = mustangHtml.match(/<[^>]*(?:colou?r|paint|swatch)[^>]*>[\s\S]{0,200}/gi) || [];
console.log(`Mustang color HTML snippets (${mustangColors.length}):`);
for (const c of mustangColors.slice(0, 10)) {
  console.log(`  ${c.replace(/\n/g, ' ').trim().substring(0, 200)}`);
}

// Extract all unique DAM images from Mustang page
const mustangDam = [...new Set(mustangHtml.match(/\/content\/dam\/[^"'\s<>)]+/g) || [])];
console.log(`\nMustang DAM URLs (${mustangDam.length}):`);
for (const u of mustangDam) console.log(`  ${u}`);

// ============================================================
// PART 8: Try to find the AngularJS app data for B&P configurator
// ============================================================
console.log('\n=== PART 8: AngularJS / B&P app data ===\n');

// The accproductdata.min.js file had AngularJS patterns
// Look for ng-app, ng-controller, ng-init, or data-ng- attributes
const ngAttrs = bpHtml.match(/(?:ng-|data-ng-)[a-z-]+="[^"]*"/gi) || [];
console.log(`Angular attributes on B&P page (${ngAttrs.length}):`);
for (const a of [...new Set(ngAttrs)].slice(0, 15)) console.log(`  ${a}`);

// Look for any JSON config blocks in B&P page scripts
const bpScripts = bpHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
console.log(`\nB&P script blocks: ${bpScripts.length}`);
for (let i = 0; i < bpScripts.length; i++) {
  const content = bpScripts[i].replace(/<\/?script[^>]*>/gi, '').trim();
  if (content.length < 50) continue;

  // Check for vehicle/color/image config
  if (content.match(/(?:nameplate|vehicle|model).*(?:colou?r|paint|image|gallery)/si) ||
      content.match(/gpas|imageUrl|colorCode|paintCode/i)) {
    console.log(`  Script #${i} (${content.length} chars) has vehicle/color data:`);
    console.log(`    ${content.substring(0, 500).replace(/\n/g, '\n    ')}`);
  }
}

// Look for B&P div with configuration data
const bpConfigs = bpHtml.match(/<div[^>]*(?:data-nameplate|data-vehicle|data-config|class="[^"]*(?:bnp|build|price|config))[^>]*>/gi) || [];
console.log(`\nB&P config divs (${bpConfigs.length}):`);
for (const d of [...new Set(bpConfigs)].slice(0, 10)) console.log(`  ${d.substring(0, 300)}`);

// ============================================================
// PART 9: Check the Ranger page for color swatches as embedded images
// ============================================================
console.log('\n=== PART 9: Embedded color swatch images ===\n');

// Some Ford pages embed color swatches as tiny base64 images or inline SVGs
const base64Imgs = rangerHtml.match(/data:image\/[^"'\s]+/gi) || [];
console.log(`Base64 images on Ranger page: ${base64Imgs.length}`);
for (const img of base64Imgs.slice(0, 5)) console.log(`  ${img.substring(0, 80)}...`);

// Look for SVG circles/rects that might be color swatches
const svgColors = rangerHtml.match(/<(?:circle|rect)[^>]*fill="[^"]+"/gi) || [];
console.log(`\nSVG color shapes: ${svgColors.length}`);
for (const s of svgColors.slice(0, 10)) console.log(`  ${s}`);

// ============================================================
// PART 10: Probe the Ranger /explore page variant
// ============================================================
console.log('\n=== PART 10: Alternate page variants ===\n');

const altPages = [
  'https://www.ford.com.au/showroom/ranger/explore/',
  'https://www.ford.com.au/showroom/ranger/explore-models/',
  'https://www.ford.com.au/showroom/ranger/models/',
  'https://www.ford.com.au/showroom/ranger/compare/',
  'https://www.ford.com.au/showroom/ranger/gallery/',
  'https://www.ford.com.au/showroom/ranger/specifications/',
  'https://www.ford.com.au/showroom/ranger/design/',
  'https://www.ford.com.au/showroom/everest/',
  'https://www.ford.com.au/showroom/puma/',
  'https://www.ford.com.au/cars/puma/',
  'https://www.ford.com.au/suvs/everest/',
  'https://www.ford.com.au/suvs/puma/',
];

for (const url of altPages) {
  const r = await f(url);
  if (r.ok) {
    const text = await r.text();
    if (text.length > 5000) {
      const colorRefs = (text.match(/colou?r|paint|swatch/gi) || []).length;
      const gpasRefs = (text.match(/gpas/gi) || []).length;
      const damRefs = (text.match(/content\/dam/gi) || []).length;
      console.log(`OK ${url} (${(text.length/1024).toFixed(0)}KB) color:${colorRefs} gpas:${gpasRefs} dam:${damRefs}`);

      // If it has lots of color refs, extract DAM URLs
      if (damRefs > 3) {
        const dams = [...new Set(text.match(/\/content\/dam\/[^"'\s<>)]+/g) || [])];
        for (const d of dams.filter(d => !d.match(/logo|icon|svg/i)).slice(0, 10)) {
          console.log(`  ${d}`);
        }
      }
    }
  } else {
    console.log(`${r.status} ${url}`);
  }
}

console.log('\n=== PROBE 3 COMPLETE ===');
