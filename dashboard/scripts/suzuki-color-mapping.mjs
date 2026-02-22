#!/usr/bin/env node
/**
 * Suzuki Color Data Mapping Analysis
 * Shows how to map finance data to DB schema
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
  console.log('📊 Suzuki Color Data Mapping Analysis\n');

  const data = await fetch(FINANCE_URL);

  // Analyze data structure
  console.log('Data Structure:\n');
  console.log('├─ models[] (7)');
  console.log('   ├─ model: string (e.g., "Swift Hybrid")');
  console.log('   ├─ modelID: number (e.g., 10475)');
  console.log('   └─ modelVariants[] (1-3 per model)');
  console.log('      ├─ variant: string (e.g., "Swift Hybrid GL")');
  console.log('      ├─ variantID: number (e.g., 10651)');
  console.log('      ├─ price: object { ACT, NSW, VIC, QLD, WA, SA, TAS, NT }');
  console.log('      └─ paintColours[] (2-8 per variant)');
  console.log('         ├─ name: string');
  console.log('         ├─ hex: string (CSS hex color)');
  console.log('         ├─ twoToned: boolean');
  console.log('         ├─ secondHex: string (for two-tone)');
  console.log('         ├─ type: string ("Solid", "Metallic", "Pearl")');
  console.log('         ├─ extraCost: object { ACT, NSW, VIC, QLD, WA, SA, TAS, NT }');
  console.log('         └─ image: object { alt, title, sizes: { default, large-up } }');

  console.log('\n' + '='.repeat(70));
  console.log('MAPPING TO DB SCHEMA (variant_colors)');
  console.log('='.repeat(70) + '\n');

  console.log('Fields to populate:\n');

  console.log('1. product_id (FK to products)');
  console.log('   ├─ Source: JOIN via variantID → external_key');
  console.log('   └─ Note: Need to map variantID to existing product records\n');

  console.log('2. name');
  console.log('   ├─ Source: paintColour.name');
  console.log('   └─ Example: "Pure White Pearl"\n');

  console.log('3. hex_code');
  console.log('   ├─ Source: paintColour.hex');
  console.log('   └─ Example: "#f7f7f8"\n');

  console.log('4. type');
  console.log('   ├─ Source: paintColour.type');
  console.log('   └─ Values: "Solid", "Metallic", "Pearl"\n');

  console.log('5. is_two_tone');
  console.log('   ├─ Source: paintColour.twoToned');
  console.log('   └─ Type: boolean\n');

  console.log('6. second_hex_code');
  console.log('   ├─ Source: paintColour.secondHex');
  console.log('   └─ Example: "#000000" (if two-tone)\n');

  console.log('7. extra_cost_nsw, extra_cost_vic, etc.');
  console.log('   ├─ Source: paintColour.extraCost.{STATE}');
  console.log('   └─ Example: 645 (AUD)\n');

  console.log('8. image_url');
  console.log('   ├─ Source: paintColour.image.sizes.default.src');
  console.log('   └─ Example: https://www.suzuki.com.au/wp-content/uploads/.../webp\n');

  console.log('9. meta_json');
  console.log('   ├─ Source: Store full image object + alt/title');
  console.log('   └─ Include: default, large-up sizes, alt, title, webp URLs\n');

  // Count statistics
  console.log('='.repeat(70));
  console.log('STATISTICS');
  console.log('='.repeat(70) + '\n');

  let totalColors = 0;
  let twoToneCount = 0;
  let colorTypes = {};
  let costRanges = { min: Infinity, max: 0 };

  data.models.forEach(model => {
    model.modelVariants.forEach(variant => {
      if (variant.paintColours) {
        totalColors += variant.paintColours.length;

        variant.paintColours.forEach(color => {
          if (color.twoToned) twoToneCount++;

          colorTypes[color.type] = (colorTypes[color.type] || 0) + 1;

          // Check max extra cost across all states
          Object.values(color.extraCost).forEach(cost => {
            if (cost > 0) {
              costRanges.min = Math.min(costRanges.min, cost);
              costRanges.max = Math.max(costRanges.max, cost);
            }
          });
        });
      }
    });
  });

  console.log(`Total colors: ${totalColors}`);
  console.log(`Two-tone colors: ${twoToneCount}`);
  console.log(`Color types: ${Object.entries(colorTypes).map(([k, v]) => `${k} (${v})`).join(', ')}`);
  console.log(`Extra cost range: $${costRanges.min === Infinity ? 0 : costRanges.min} - $${costRanges.max}`);

  // Sample mapping
  console.log('\n' + '='.repeat(70));
  console.log('SAMPLE MAPPING');
  console.log('='.repeat(70) + '\n');

  const sampleVariant = data.models[0].modelVariants[0];
  const sampleColor = sampleVariant.paintColours[0];

  console.log(`Variant: ${sampleVariant.variant} (ID: ${sampleVariant.variantID})`);
  console.log(`Color: ${sampleColor.name}\n`);

  console.log('SQL INSERT example:\n');
  console.log('INSERT INTO variant_colors (');
  console.log('  product_id,');
  console.log('  name,');
  console.log('  hex_code,');
  console.log('  type,');
  console.log('  is_two_tone,');
  console.log('  extra_cost_nsw,');
  console.log('  extra_cost_vic,');
  console.log('  extra_cost_qld,');
  console.log('  extra_cost_wa,');
  console.log('  extra_cost_sa,');
  console.log('  extra_cost_tas,');
  console.log('  extra_cost_act,');
  console.log('  extra_cost_nt,');
  console.log('  image_url,');
  console.log('  meta_json');
  console.log(') VALUES (');
  console.log(`  (SELECT id FROM products WHERE external_key = 'suzuki-au-${sampleVariant.variantID}'),`);
  console.log(`  '${sampleColor.name}',`);
  console.log(`  '${sampleColor.hex}',`);
  console.log(`  '${sampleColor.type}',`);
  console.log(`  ${sampleColor.twoToned},`);
  console.log(`  ${sampleColor.extraCost.NSW},`);
  console.log(`  ${sampleColor.extraCost.VIC},`);
  console.log(`  ${sampleColor.extraCost.QLD},`);
  console.log(`  ${sampleColor.extraCost.WA},`);
  console.log(`  ${sampleColor.extraCost.SA},`);
  console.log(`  ${sampleColor.extraCost.TAS},`);
  console.log(`  ${sampleColor.extraCost.ACT},`);
  console.log(`  ${sampleColor.extraCost.NT},`);
  console.log(`  '${sampleColor.image.sizes.default.src}',`);
  console.log(`  '${JSON.stringify({ image: sampleColor.image, offer: sampleColor.offer, disclaimer: sampleColor.disclaimer })}'`);
  console.log(');\n');

  console.log('✅ Analysis complete\n');
  console.log('💡 Next step: Create seed-suzuki-colors.mjs to populate variant_colors table');
}

main().catch(console.error);
