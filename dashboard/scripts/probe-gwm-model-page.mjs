/**
 * GWM Model Page Color Data Probe
 *
 * Analyzes the Tank 300 model page for color swatch structure
 */

import https from 'https';
import { JSDOM } from 'jsdom';

const MODEL_URL = 'https://www.gwmanz.com/au/models/suv/tank-300/';

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

console.log('🎨 GWM Tank 300 Model Page Color Data Probe');
console.log('='.repeat(60));
console.log(`Fetching: ${MODEL_URL}\n`);

const { data: html, statusCode } = await httpsGet(MODEL_URL);

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

// Group by class name patterns
const classPatterns = {};
for (const el of colourElements) {
  const classes = el.className.split(' ')
    .filter(c => c.toLowerCase().includes('colour'))
    .join(' ');

  classPatterns[classes] = (classPatterns[classes] || 0) + 1;
}

console.log('   Distribution by colour-related classes:');
for (const [classes, count] of Object.entries(classPatterns).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`      ${classes}: ${count}`);
}

// 2. Analyze color swatches in detail
console.log('\n\n📋 DETAILED COLOR SWATCH ANALYSIS:');

// Find potential color names
const colorNames = new Set();
for (const el of colourElements) {
  const text = el.textContent?.trim();
  if (text && text.length > 0 && text.length < 50) {
    // Likely a color name
    colorNames.add(text);
  }

  // Check aria-label or title
  const ariaLabel = el.getAttribute('aria-label');
  const title = el.getAttribute('title');
  if (ariaLabel) colorNames.add(ariaLabel);
  if (title) colorNames.add(title);
}

console.log(`   Potential color names found: ${colorNames.size}`);
for (const name of Array.from(colorNames).slice(0, 10)) {
  console.log(`      ${name}`);
}

// 3. Find color swatch buttons or divs
console.log('\n\n🎨 COLOR SWATCH ELEMENTS:');
const swatchSelectors = [
  '[class*="colour"][class*="swatch"]',
  '[class*="colour"][class*="option"]',
  '[class*="colour"][class*="button"]',
  '[class*="colour"][class*="item"]',
  'button[class*="colour"]',
  'div[class*="colour"]'
];

for (const selector of swatchSelectors) {
  const elements = doc.querySelectorAll(selector);
  if (elements.length > 0) {
    console.log(`\n   ${selector}: ${elements.length} elements`);

    Array.from(elements).slice(0, 3).forEach((el, i) => {
      console.log(`\n      [${i}] Classes: ${el.className}`);

      // Text content
      const text = el.textContent?.trim().substring(0, 100);
      if (text) console.log(`          Text: ${text}`);

      // Data attributes
      const dataAttrs = {};
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-')) {
          dataAttrs[attr.name] = attr.value.substring(0, 100);
        }
      }
      if (Object.keys(dataAttrs).length > 0) {
        console.log(`          Data:`, JSON.stringify(dataAttrs, null, 12));
      }

      // Background color or image
      const style = el.getAttribute('style');
      if (style) {
        const bgMatch = style.match(/background[^;]*/gi);
        if (bgMatch) {
          console.log(`          Background: ${bgMatch.join('; ')}`);
        }
      }

      // Child img element
      const img = el.querySelector('img');
      if (img) {
        console.log(`          Image: ${img.src.substring(0, 150)}`);
      }
    });
  }
}

// 4. Look for JSON data with color information
console.log('\n\n🔍 JSON COLOR DATA IN SCRIPTS:');
const scripts = doc.querySelectorAll('script');
let colorJsonFound = false;

for (const script of scripts) {
  const content = script.textContent || '';

  // Look for arrays with color data
  const colorArrayPattern = /"colours?":\s*\[([^\]]{100,})\]/gi;
  const matches = content.matchAll(colorArrayPattern);

  for (const match of matches) {
    colorJsonFound = true;
    console.log('\n   ✅ Found color array in JSON:');
    console.log(`      ${match[0].substring(0, 600)}...`);
  }

  // Look for individual color objects
  if (content.includes('"name"') && content.includes('"hex"')) {
    const colorObjPattern = /\{[^}]*"name"[^}]*"hex"[^}]*\}/gi;
    const objMatches = Array.from(content.matchAll(colorObjPattern));

    if (objMatches.length > 0 && !colorJsonFound) {
      colorJsonFound = true;
      console.log(`\n   ✅ Found ${objMatches.length} color objects with name + hex`);
      objMatches.slice(0, 3).forEach((m, i) => {
        console.log(`      [${i}] ${m[0]}`);
      });
    }
  }
}

if (!colorJsonFound) {
  console.log('   ❌ No color JSON data found in scripts');
}

// 5. Find Storyblok content
console.log('\n\n📦 STORYBLOK DATA:');
const storyblokPattern = /"content":\s*\{[^}]*"component"[^}]*\}/gi;
const storyMatches = html.match(storyblokPattern);

if (storyMatches) {
  console.log(`   Found ${storyMatches.length} Storyblok component references`);
  storyMatches.slice(0, 3).forEach((m, i) => {
    console.log(`      [${i}] ${m.substring(0, 200)}...`);
  });
} else {
  console.log('   ❌ No Storyblok component data found');
}

console.log('\n' + '='.repeat(60));
console.log('✅ Probe complete');
