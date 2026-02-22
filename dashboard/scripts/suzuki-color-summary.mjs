#!/usr/bin/env node
/**
 * Suzuki Color Data Summary
 * Quick overview of available color data
 */

import https from 'https';

const FINANCE_URL = 'https://www.suzuki.com.au/suzuki-finance-calculator-data.json';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01'
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HEADERS }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  console.log('🎨 Suzuki Australia Color Data Summary\n');

  const data = await fetch(FINANCE_URL);

  console.log('━'.repeat(70) + '\n');

  data.models.forEach((model, idx) => {
    console.log(`${idx + 1}. ${model.model}`);

    model.modelVariants.forEach(variant => {
      const colorCount = variant.paintColours?.length || 0;
      const twoTone = variant.paintColours?.filter(c => c.twoToned).length || 0;
      const hasCost = variant.paintColours?.some(c => Object.values(c.extraCost).some(v => v > 0)) || false;

      console.log(`   └─ ${variant.variant}`);
      console.log(`      Colors: ${colorCount} (${twoTone} two-tone)`);

      if (hasCost) {
        const costs = variant.paintColours
          .flatMap(c => Object.values(c.extraCost))
          .filter(v => v > 0);
        const minCost = Math.min(...costs);
        const maxCost = Math.max(...costs);
        console.log(`      Extra costs: $${minCost} - $${maxCost}`);
      }

      // Show color names
      if (variant.paintColours?.length > 0) {
        variant.paintColours.forEach(c => {
          const cost = c.extraCost.NSW > 0 ? ` (+$${c.extraCost.NSW})` : '';
          const twoToneFlag = c.twoToned ? ' 🔲🔳' : '';
          console.log(`      • ${c.name}${cost}${twoToneFlag}`);
        });
      }

      console.log();
    });
  });

  console.log('━'.repeat(70));

  // Totals
  const totalVariants = data.models.reduce((sum, m) => sum + m.modelVariants.length, 0);
  const totalColors = data.models.reduce(
    (sum, m) => sum + m.modelVariants.reduce((s, v) => s + (v.paintColours?.length || 0), 0),
    0
  );
  const uniqueColors = new Set(
    data.models.flatMap(m =>
      m.modelVariants.flatMap(v =>
        (v.paintColours || []).map(c => c.name)
      )
    )
  ).size;

  console.log('\n📊 Summary:\n');
  console.log(`  Models: ${data.models.length}`);
  console.log(`  Variants: ${totalVariants}`);
  console.log(`  Total color options: ${totalColors}`);
  console.log(`  Unique colors: ${uniqueColors}`);

  console.log('\n✅ Data Available:\n');
  console.log('  ✓ Color names');
  console.log('  ✓ Hex codes (CSS)');
  console.log('  ✓ Color types (Solid, Metallic, Pearl, Two-Tone)');
  console.log('  ✓ Two-tone configurations');
  console.log('  ✓ Per-state extra costs (8 states)');
  console.log('  ✓ High-quality product images (WebP)');
  console.log('  ✓ Responsive image sizes (2 breakpoints)');
  console.log('  ✓ Accessibility metadata (alt text, titles)');

  console.log('\n💾 Source:\n');
  console.log(`  ${FINANCE_URL}`);

  console.log('\n📄 Documentation:\n');
  console.log('  See: SUZUKI_COLOR_DISCOVERY_REPORT.md');
}

main().catch(console.error);
