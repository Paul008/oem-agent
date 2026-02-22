#!/usr/bin/env node
/**
 * Probe Suzuki Australia for vehicle color data
 * Checks finance data, model pages, and CDN patterns
 */

import https from 'https';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://www.suzuki.com.au';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9'
};

const MODELS = ['swift', 'vitara', 'jimny', 's-cross', 'fronx', 'ignis'];

/**
 * Fetch helper
 */
function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HEADERS }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ status: res.statusCode, body: data });
        } else {
          resolve({ status: res.statusCode, body: null });
        }
      });
    }).on('error', reject);
  });
}

/**
 * Extract JSON objects from HTML
 */
function extractJSON(html) {
  const results = [];

  // Look for various JSON patterns
  const patterns = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});/g,
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]+?});/g,
    /data-props=["']({[^"']+})["']/g,
    /data-config=["']({[^"']+})["']/g,
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]+?)<\/script>/gi,
    /<script[^>]*>([\s\S]*?var\s+\w+\s*=\s*({[\s\S]+?});[\s\S]*?)<\/script>/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      try {
        const jsonStr = match[1] || match[2];
        const parsed = JSON.parse(jsonStr);
        results.push(parsed);
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }

  return results;
}

/**
 * Extract color swatches from HTML
 */
function extractColorSwatches(html) {
  const swatches = [];

  // Look for color swatch patterns
  const patterns = [
    /<(?:img|div)[^>]*class=["'][^"']*color[^"']*["'][^>]*>/gi,
    /<(?:img|div)[^>]*data-color[^>]*>/gi,
    /<(?:img|div)[^>]*swatch[^>]*>/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      swatches.push(match[0]);
    }
  }

  return swatches;
}

/**
 * Check finance calculator data
 */
async function checkFinanceData() {
  console.log('\n1️⃣  Checking finance calculator data...');

  const url = `${BASE_URL}/suzuki-finance-calculator-data.json`;
  const { status, body } = await fetch(url);

  if (status !== 200) {
    console.log(`❌ Finance data not accessible (${status})`);
    return null;
  }

  try {
    const data = JSON.parse(body);
    console.log(`✅ Finance data loaded`);

    // Check structure
    if (data.models && Array.isArray(data.models)) {
      console.log(`   📊 Found ${data.models.length} models`);

      // Sample first model
      const sample = data.models[0];
      console.log(`   🔍 Sample model keys: ${Object.keys(sample).join(', ')}`);

      // Look for color data
      const colorKeys = Object.keys(sample).filter(k =>
        /color|colour|paint/i.test(k)
      );

      if (colorKeys.length > 0) {
        console.log(`   🎨 Potential color keys: ${colorKeys.join(', ')}`);
      }

      // Check variants
      if (sample.variants && Array.isArray(sample.variants)) {
        const variantSample = sample.variants[0];
        console.log(`   🔍 Variant keys: ${Object.keys(variantSample).join(', ')}`);

        const variantColorKeys = Object.keys(variantSample).filter(k =>
          /color|colour|paint/i.test(k)
        );

        if (variantColorKeys.length > 0) {
          console.log(`   🎨 Variant color keys: ${variantColorKeys.join(', ')}`);
        }
      }
    }

    // Save for inspection
    writeFileSync('/tmp/suzuki-finance-data.json', JSON.stringify(data, null, 2));
    console.log(`   💾 Saved to /tmp/suzuki-finance-data.json`);

    return data;
  } catch (e) {
    console.log(`❌ Failed to parse finance data: ${e.message}`);
    return null;
  }
}

/**
 * Check model page for color data
 */
async function checkModelPage(model) {
  console.log(`\n2️⃣  Checking ${model} model page...`);

  // Try different URL patterns
  const urls = [
    `${BASE_URL}/automobiles/${model}`,
    `${BASE_URL}/automobiles/${model}/colours`,
    `${BASE_URL}/automobiles/${model}/specifications`,
    `${BASE_URL}/automobiles/${model}/features-specifications`
  ];

  const results = { model, colors: [], swatches: [], jsonData: [] };

  for (const url of urls) {
    const { status, body } = await fetch(url);

    if (status !== 200) {
      console.log(`   ⚠️  ${url.split('/').pop()} not found (${status})`);
      continue;
    }

    console.log(`   ✅ ${url.split('/').pop()} loaded`);

    // Extract JSON from page
    const jsonObjects = extractJSON(body);
    if (jsonObjects.length > 0) {
      console.log(`   📦 Found ${jsonObjects.length} JSON objects`);
      results.jsonData.push(...jsonObjects);
    }

    // Extract color swatches
    const swatches = extractColorSwatches(body);
    if (swatches.length > 0) {
      console.log(`   🎨 Found ${swatches.length} color swatches`);
      results.swatches.push(...swatches);
    }

    // Look for color-related text
    const colorMatches = body.match(/(?:color|colour|paint)[\s\S]{0,100}/gi);
    if (colorMatches && colorMatches.length > 0) {
      console.log(`   🔍 Found ${colorMatches.length} color mentions`);

      // Sample a few
      colorMatches.slice(0, 3).forEach(m => {
        console.log(`      "${m.slice(0, 80).replace(/\n/g, ' ')}..."`);
      });
    }

    // Look for CDN image patterns
    const cdnImages = body.match(/https?:\/\/[^"\s]+cloudfront\.net[^"\s]+/gi) || [];
    const colorImages = cdnImages.filter(url =>
      /color|colour|paint|swatch/i.test(url)
    );

    if (colorImages.length > 0) {
      console.log(`   🖼️  Found ${colorImages.length} color-related images`);
      results.colors.push(...colorImages.slice(0, 5).map(url => ({ source: 'cdn', url })));
    }

    // Save HTML for manual inspection
    if (url.includes('/colours')) {
      writeFileSync(`/tmp/suzuki-${model}-colours.html`, body);
      console.log(`   💾 Saved HTML to /tmp/suzuki-${model}-colours.html`);
    }
  }

  return results;
}

/**
 * Check CDN patterns
 */
async function checkCDNPatterns() {
  console.log('\n3️⃣  Checking CDN patterns...');

  // Known CDN base
  const cdnBase = 'd1lbigfqv02v5x.cloudfront.net';

  console.log(`   🔍 Known CDN: ${cdnBase}`);
  console.log(`   💡 Tip: Check browser DevTools Network tab for image URL patterns`);

  // Try common paths
  const testPaths = [
    '/assets/images/colours/',
    '/assets/images/colors/',
    '/media/colours/',
    '/images/colours/',
    '/automobiles/swift/colours/'
  ];

  for (const path of testPaths) {
    console.log(`   🔗 Potential path: https://${cdnBase}${path}`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Suzuki Australia Color Data Probe\n');

  // 1. Check finance data
  const financeData = await checkFinanceData();

  // 2. Check model pages
  const modelResults = [];
  for (const model of MODELS) {
    const result = await checkModelPage(model);
    modelResults.push(result);

    // Delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 3. Check CDN patterns
  await checkCDNPatterns();

  // 4. Summary
  console.log('\n📊 Summary\n');

  modelResults.forEach(result => {
    console.log(`${result.model}:`);
    console.log(`  JSON objects: ${result.jsonData.length}`);
    console.log(`  Swatches: ${result.swatches.length}`);
    console.log(`  Color images: ${result.colors.length}`);
  });

  // Save full results
  const report = {
    timestamp: new Date().toISOString(),
    financeData: financeData ? 'Available' : 'Not found',
    modelResults,
    recommendations: [
      'Check /tmp/suzuki-*.html files for embedded JSON',
      'Check /tmp/suzuki-finance-data.json for color properties',
      'Inspect browser DevTools Network tab on color pages for image patterns',
      'Look for configurator or 360-spin functionality that might expose color data'
    ]
  };

  writeFileSync('/tmp/suzuki-color-probe-report.json', JSON.stringify(report, null, 2));
  console.log(`\n💾 Full report saved to /tmp/suzuki-color-probe-report.json`);
}

main().catch(console.error);
