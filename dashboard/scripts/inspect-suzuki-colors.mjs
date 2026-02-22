#!/usr/bin/env node
/**
 * Inspect Suzuki paintColours structure from finance data
 */

import https from 'https';

const FINANCE_URL = 'https://www.suzuki.com.au/suzuki-finance-calculator-data.json';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  console.log('🎨 Suzuki Paint Colours Inspector\n');

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

        variant.paintColours.forEach(color => {
          console.log(`      • ${JSON.stringify(color, null, 2).replace(/\n/g, '\n        ')}`);
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
    console.log(`\nSample color object:`);
    console.log(JSON.stringify(sampleColor, null, 2));
    console.log(`\nColor properties: ${Object.keys(sampleColor).join(', ')}`);
  }
}

main().catch(console.error);
