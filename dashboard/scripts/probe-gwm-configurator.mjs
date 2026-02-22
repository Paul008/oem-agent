/**
 * GWM Configurator Color Data Probe
 *
 * Analyzes the Tank 300 configurator to understand color data structure
 */

import https from 'https';
import { JSDOM } from 'jsdom';

const CONFIG_URL = 'https://www.gwmanz.com/au/config/tank-300/';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ data, statusCode: res.statusCode }));
    }).on('error', reject);
  });
}

console.log('🎨 GWM Tank 300 Configurator Color Data Probe');
console.log('='.repeat(60));
console.log(`Fetching: ${CONFIG_URL}\n`);

const { data: html, statusCode } = await httpsGet(CONFIG_URL);

if (statusCode !== 200) {
  console.log(`❌ Status ${statusCode}`);
  process.exit(1);
}

const dom = new JSDOM(html);
const doc = dom.window.document;

console.log('✅ Page loaded successfully\n');

// 1. Find all elements with "colour" in class name
console.log('📍 ELEMENTS WITH "colour" CLASS:');
const colourElements = doc.querySelectorAll('[class*="colour"]');
console.log(`   Found ${colourElements.length} elements\n`);

// Group by tag name
const byTag = {};
for (const el of colourElements) {
  const tag = el.tagName.toLowerCase();
  byTag[tag] = (byTag[tag] || 0) + 1;
}

console.log('   Distribution by tag:');
for (const [tag, count] of Object.entries(byTag).sort((a, b) => b[1] - a[1])) {
  console.log(`      ${tag}: ${count}`);
}

// 2. Analyze first 5 color elements
console.log('\n📋 SAMPLE COLOR ELEMENTS:');
Array.from(colourElements).slice(0, 5).forEach((el, i) => {
  console.log(`\n   [${i}] ${el.tagName} — class="${el.className}"`);

  // Get text content
  const text = el.textContent?.trim().substring(0, 100);
  if (text) console.log(`      Text: ${text}`);

  // Get data attributes
  const dataAttrs = {};
  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-')) {
      dataAttrs[attr.name] = attr.value.substring(0, 100);
    }
  }
  if (Object.keys(dataAttrs).length > 0) {
    console.log(`      Data attributes:`, JSON.stringify(dataAttrs, null, 8));
  }

  // Get style
  if (el.getAttribute('style')) {
    console.log(`      Style: ${el.getAttribute('style').substring(0, 150)}`);
  }

  // Show HTML snippet
  console.log(`      HTML: ${el.outerHTML.substring(0, 300)}...`);
});

// 3. Look for JSON data in script tags
console.log('\n\n🔍 SEARCHING FOR JSON COLOR DATA IN SCRIPTS:');
const scripts = doc.querySelectorAll('script');
let foundColorData = false;

for (const script of scripts) {
  const content = script.textContent || '';

  // Look for color-related JSON patterns
  const patterns = [
    /"colours?":\s*\[/i,
    /"paints?":\s*\[/i,
    /"exteriorColors?":\s*\[/i,
    /"color[^"]*":\s*"/i
  ];

  for (const pattern of patterns) {
    if (pattern.test(content)) {
      console.log(`\n   ✅ Found color data pattern: ${pattern.source}`);

      // Extract surrounding context
      const match = content.match(new RegExp(`(.{0,100}${pattern.source}.{0,500})`, 'i'));
      if (match) {
        console.log(`      Context: ${match[0].substring(0, 600)}`);
        foundColorData = true;
      }
    }
  }

  // Look for window.__NUXT__ or similar app state
  if (content.includes('__NUXT__') || content.includes('window.CONFIG')) {
    console.log('\n   📦 Found app state object');

    // Try to extract color data
    const colorMatch = content.match(/"colour[^"]*"[^}]*(?:name|code|hex|rgb)[^}]*/gi);
    if (colorMatch) {
      console.log(`      Found ${colorMatch.length} color property snippets:`);
      colorMatch.slice(0, 5).forEach((m, i) => {
        console.log(`         [${i}] ${m.substring(0, 150)}`);
      });
      foundColorData = true;
    }
  }
}

if (!foundColorData) {
  console.log('   ❌ No obvious color JSON data found in scripts');
}

// 4. Look for API calls or data URLs
console.log('\n\n🌐 API ENDPOINTS & DATA SOURCES:');
const apiPatterns = [
  /https?:\/\/[^\s"']+\/api\/[^\s"']*/gi,
  /https?:\/\/[^\s"']+\/data\/[^\s"']*/gi,
  /\/api\/[^\s"']*/gi,
  /storyblok[^\s"']*/gi
];

const foundUrls = new Set();
for (const pattern of apiPatterns) {
  const matches = html.match(pattern);
  if (matches) {
    matches.forEach(url => foundUrls.add(url));
  }
}

if (foundUrls.size > 0) {
  console.log(`   Found ${foundUrls.size} potential API URLs:`);
  Array.from(foundUrls).slice(0, 10).forEach(url => {
    console.log(`      ${url}`);
  });
} else {
  console.log('   ❌ No API URLs found');
}

// 5. Check for form inputs or select elements with color data
console.log('\n\n📝 FORM ELEMENTS:');
const colorInputs = doc.querySelectorAll('input[name*="colour"], input[name*="color"], select[name*="colour"]');
if (colorInputs.length > 0) {
  console.log(`   Found ${colorInputs.length} color-related form inputs`);
  Array.from(colorInputs).slice(0, 3).forEach((input, i) => {
    console.log(`      [${i}] ${input.tagName} name="${input.name}" value="${input.value}"`);
  });
} else {
  console.log('   ❌ No color form inputs found');
}

console.log('\n' + '='.repeat(60));
console.log('✅ Probe complete');
