#!/usr/bin/env node
/**
 * Inspect Suzuki paintColours structure from finance data (v2)
 */

import https from 'https';

const FINANCE_URL = 'https://www.suzuki.com.au/suzuki-finance-calculator-data.json';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.suzuki.com.au/'
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HEADERS }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error('Failed to parse JSON. Response:', data.slice(0, 500));
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('🎨 Suzuki Paint Colours Inspector v2\n');

  const data = await fetch(FINANCE_URL);

  console.log(`Found ${data.models.length} models\n`);

  data.models.forEach(model => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${model.model} (ID: ${model.modelID})`);
    console.log(`${'='.repeat(60)}\n`);

    model.modelVariants.forEach(variant => {
      console.log(`📦 ${variant.variant} (ID: ${variant.variantID})`);
      console.log(`   Price: $${variant.price.toLocaleString()}`);

      if (variant.paintColours && variant.paintColours.length > 0) {
        console.log(`   🎨 ${variant.paintColours.length} paint colours:\n`);

        variant.paintColours.forEach((color, idx) => {
          const colorStr = typeof color === 'string'
            ? color
            : JSON.stringify(color, null, 2).split('\n').map(line => '        ' + line).join('\n').trim();

          console.log(`      ${idx + 1}. ${colorStr}`);
        });
      } else {
        console.log(`   ❌ No paint colours`);
      }

      console.log();
    });
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60) + '\n');

  const totalVariants = data.models.reduce((sum, m) => sum + m.modelVariants.length, 0);
  const variantsWithColors = data.models.reduce(
    (sum, m) => sum + m.modelVariants.filter(v => v.paintColours?.length > 0).length,
    0
  );

  console.log(`Total variants: ${totalVariants}`);
  console.log(`Variants with colors: ${variantsWithColors}`);
  console.log(`Coverage: ${((variantsWithColors / totalVariants) * 100).toFixed(1)}%`);

  // Color property structure
  const sampleColor = data.models[0]?.modelVariants[0]?.paintColours?.[0];
  if (sampleColor) {
    console.log(`\n📋 Sample color structure:`);
    console.log(JSON.stringify(sampleColor, null, 2));

    if (typeof sampleColor === 'object') {
      console.log(`\n🔑 Color properties: ${Object.keys(sampleColor).join(', ')}`);
    } else {
      console.log(`\n⚠️  Colors are simple strings, not objects`);
    }
  }
}

main().catch(console.error);
