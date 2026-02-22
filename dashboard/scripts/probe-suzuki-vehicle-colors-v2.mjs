#!/usr/bin/env node
/**
 * Probe Suzuki Australia for vehicle color data (v2)
 * Enhanced to follow redirects and inspect finance data structure
 */

import https from 'https';
import { URL } from 'url';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://www.suzuki.com.au';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9'
};

/**
 * Fetch with redirect following
 */
function fetch(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: HEADERS
    };

    https.get(options, (res) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects === 0) {
          return reject(new Error('Too many redirects'));
        }

        const redirectUrl = new URL(res.headers.location, url);
        console.log(`   ↪️  Redirected to: ${redirectUrl.pathname}`);
        return fetch(redirectUrl.href, maxRedirects - 1).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data,
          url: res.responseUrl || url
        });
      });
    }).on('error', reject);
  });
}

/**
 * Deep search for color data in object
 */
function findColorData(obj, path = '') {
  const results = [];

  if (!obj || typeof obj !== 'object') return results;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    // Check if key suggests color data
    if (/color|colour|paint|swatch/i.test(key)) {
      results.push({
        path: currentPath,
        key,
        valueType: Array.isArray(value) ? 'array' : typeof value,
        sampleValue: Array.isArray(value)
          ? `[${value.length} items]`
          : typeof value === 'object'
            ? `{${Object.keys(value).join(', ')}}`
            : value
      });
    }

    // Recurse into objects and arrays
    if (typeof value === 'object' && value !== null) {
      results.push(...findColorData(value, currentPath));
    }
  }

  return results;
}

/**
 * Check finance calculator data
 */
async function checkFinanceData() {
  console.log('\n1️⃣  Checking finance calculator data...\n');

  const url = `${BASE_URL}/suzuki-finance-calculator-data.json`;
  const { status, body } = await fetch(url);

  if (status !== 200) {
    console.log(`❌ Finance data not accessible (${status})`);
    return null;
  }

  const data = JSON.parse(body);
  console.log(`✅ Finance data loaded: ${data.models?.length || 0} models\n`);

  // Deep search for color data
  const colorFindings = findColorData(data);

  if (colorFindings.length === 0) {
    console.log('❌ No color-related properties found in finance data\n');
  } else {
    console.log(`🎨 Found ${colorFindings.length} color-related properties:\n`);
    colorFindings.forEach(finding => {
      console.log(`   ${finding.path}`);
      console.log(`      Type: ${finding.valueType}`);
      console.log(`      Sample: ${finding.sampleValue}`);
      console.log();
    });
  }

  // Sample model structure
  if (data.models && data.models.length > 0) {
    const sampleModel = data.models[0];
    console.log(`📋 Sample model structure (${sampleModel.model || 'unknown'}):`);
    console.log(`   Keys: ${Object.keys(sampleModel).join(', ')}\n`);

    if (sampleModel.modelVariants && sampleModel.modelVariants.length > 0) {
      const sampleVariant = sampleModel.modelVariants[0];
      console.log(`📋 Sample variant structure:`);
      console.log(`   Keys: ${Object.keys(sampleVariant).join(', ')}\n`);

      // Save sample for inspection
      writeFileSync('/tmp/suzuki-sample-variant.json', JSON.stringify(sampleVariant, null, 2));
      console.log(`💾 Sample variant saved to /tmp/suzuki-sample-variant.json\n`);
    }
  }

  return data;
}

/**
 * Check actual model pages
 */
async function checkModelPages() {
  console.log('\n2️⃣  Checking model pages...\n');

  // First, get the homepage to find actual model URLs
  const { body: homepage } = await fetch(BASE_URL);

  // Extract model links
  const modelLinks = [...homepage.matchAll(/href=["']\/automobiles\/([^"'\/]+)["']/g)]
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i); // unique

  console.log(`Found ${modelLinks.length} model slugs: ${modelLinks.join(', ')}\n`);

  // Check each model
  for (const model of modelLinks.slice(0, 3)) { // Sample first 3
    console.log(`\n📄 Checking ${model}...`);

    const { status, body } = await fetch(`${BASE_URL}/automobiles/${model}`);

    if (status !== 200) {
      console.log(`   ⚠️  Not accessible (${status})`);
      continue;
    }

    // Look for color data patterns
    const patterns = [
      { name: 'Colour selector', regex: /class=["'][^"']*colour-selector[^"']*["']/i },
      { name: 'Color swatch', regex: /class=["'][^"']*color-swatch[^"']*["']/i },
      { name: 'Paint option', regex: /data-paint|data-color|data-colour/i },
      { name: 'JSON config', regex: /var\s+config\s*=\s*{[\s\S]{0,500}colour/i },
      { name: 'Colour images', regex: /\/colours?\//i }
    ];

    patterns.forEach(({ name, regex }) => {
      const matches = body.match(regex);
      if (matches) {
        console.log(`   ✅ ${name} found`);
      }
    });

    // Check for colour-specific URLs
    const colourUrls = [
      `/automobiles/${model}/colours`,
      `/automobiles/${model}/specifications`
    ];

    for (const url of colourUrls) {
      try {
        const { status: colStatus } = await fetch(`${BASE_URL}${url}`);
        if (colStatus === 200) {
          console.log(`   ✅ ${url} exists`);
        }
      } catch (e) {
        // Skip
      }
    }

    await new Promise(r => setTimeout(r, 500));
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Suzuki Australia Color Data Probe v2\n');

  try {
    await checkFinanceData();
    await checkModelPages();

    console.log('\n✅ Probe complete\n');
    console.log('💡 Next steps:');
    console.log('   1. Check /tmp/suzuki-sample-variant.json for data structure');
    console.log('   2. Visit suzuki.com.au/automobiles/swift in browser');
    console.log('   3. Use DevTools Network tab to find color data sources');
    console.log('   4. Check for configurator or 360-degree viewer');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
