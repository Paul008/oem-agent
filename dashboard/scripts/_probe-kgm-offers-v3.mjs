#!/usr/bin/env node

/**
 * Extract KGM offer data from models and grades
 */

const PAYLOAD_BASE = 'https://payloadb.therefinerydesign.com/api';
const HEADERS = {
  'Origin': 'https://www.kgm.com.au',
  'Referer': 'https://www.kgm.com.au/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

async function fetchAPI(endpoint) {
  const url = `${PAYLOAD_BASE}/${endpoint}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  return await res.json();
}

async function main() {
  console.log('KGM OFFERS EXTRACTION');
  console.log('Analyzing pricing_offers, abn_discount, and year_discount fields\n');
  
  // Fetch all models with full depth
  console.log('=== MODELS ===');
  const modelsData = await fetchAPI('models?depth=3&limit=100');
  
  if (modelsData && modelsData.docs) {
    console.log(`Total models: ${modelsData.docs.length}\n`);
    
    modelsData.docs.forEach(model => {
      console.log(`\n--- ${model.name} ---`);
      console.log(`Model ID: ${model.id}`);
      console.log(`Price: $${model.price?.toLocaleString()}`);
      
      if (model.abn_discount) {
        console.log(`ABN Discount: $${model.abn_discount?.toLocaleString()}`);
      }
      
      if (model.pricing_offers) {
        console.log('\nPricing Offers:');
        console.log(JSON.stringify(model.pricing_offers, null, 2));
      }
      
      // Check grades for year_discount
      if (model.grades && model.grades.length > 0) {
        const gradesWithDiscount = model.grades.filter(g => g.year_discount);
        if (gradesWithDiscount.length > 0) {
          console.log('\nGrades with year_discount:');
          gradesWithDiscount.forEach(g => {
            console.log(`  - ${g.name}: $${g.year_discount?.toLocaleString()} off`);
          });
        }
      }
    });
  }
  
  // Fetch all grades to see full year_discount data
  console.log('\n\n=== ALL GRADES WITH YEAR_DISCOUNT ===');
  const gradesData = await fetchAPI('grades?depth=2&limit=100');
  
  if (gradesData && gradesData.docs) {
    const withDiscount = gradesData.docs.filter(g => g.year_discount);
    
    console.log(`\nGrades with year_discount: ${withDiscount.length} / ${gradesData.docs.length}`);
    
    if (withDiscount.length > 0) {
      console.log('\nBreakdown:');
      withDiscount.forEach(g => {
        console.log(`  ${g.name}: $${g.year_discount?.toLocaleString()} off (Price: $${g.price?.toLocaleString()})`);
      });
    }
  }
  
  console.log('\n\n=== SUMMARY ===');
  console.log('Offer fields found in Payload CMS:');
  console.log('1. models.abn_discount - ABN holder discount per model');
  console.log('2. models.pricing_offers - Structured offer data (unknown format)');
  console.log('3. grades.year_discount - End of year discount per grade');
  
  console.log('\n=== PROBE COMPLETE ===');
}

main().catch(console.error);
