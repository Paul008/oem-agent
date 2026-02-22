#!/usr/bin/env node

/**
 * Probe KGM Payload CMS for offer data in existing collections
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
  console.log('KGM OFFERS PROBE V2');
  console.log('Checking grades and models for offer fields\n');
  
  // Check grades with full depth to see all fields
  console.log('=== FETCHING GRADES (depth=2) ===');
  const gradesData = await fetchAPI('grades?depth=2&limit=100');
  
  if (gradesData && gradesData.docs && gradesData.docs.length > 0) {
    console.log(`Found ${gradesData.docs.length} grades\n`);
    
    // Look for offer-related fields in first grade
    const firstGrade = gradesData.docs[0];
    console.log('First grade structure:');
    console.log(JSON.stringify(firstGrade, null, 2).slice(0, 2000));
    console.log('\n...\n');
    
    // Check all fields across all grades
    const allFields = new Set();
    gradesData.docs.forEach(grade => {
      Object.keys(grade).forEach(key => allFields.add(key));
    });
    
    console.log('\nAll fields found in grades:');
    console.log([...allFields].sort().join(', '));
    
    // Look for offer-related fields
    const offerFields = [...allFields].filter(f => 
      f.toLowerCase().includes('offer') ||
      f.toLowerCase().includes('promo') ||
      f.toLowerCase().includes('special') ||
      f.toLowerCase().includes('deal') ||
      f.toLowerCase().includes('discount') ||
      f.toLowerCase().includes('campaign')
    );
    
    if (offerFields.length > 0) {
      console.log('\n\n=== OFFER-RELATED FIELDS ===');
      console.log(offerFields);
      
      // Show examples
      offerFields.forEach(field => {
        const examples = gradesData.docs
          .filter(g => g[field])
          .slice(0, 2)
          .map(g => ({ name: g.name, [field]: g[field] }));
        
        if (examples.length > 0) {
          console.log(`\nExamples of "${field}":`);
          console.log(JSON.stringify(examples, null, 2));
        }
      });
    }
  }
  
  // Check models
  console.log('\n\n=== FETCHING MODELS (depth=2) ===');
  const modelsData = await fetchAPI('models?depth=2&limit=100');
  
  if (modelsData && modelsData.docs && modelsData.docs.length > 0) {
    console.log(`Found ${modelsData.docs.length} models\n`);
    
    const firstModel = modelsData.docs[0];
    console.log('First model structure:');
    console.log(JSON.stringify(firstModel, null, 2).slice(0, 2000));
    console.log('\n...\n');
    
    const allFields = new Set();
    modelsData.docs.forEach(model => {
      Object.keys(model).forEach(key => allFields.add(key));
    });
    
    console.log('\nAll fields found in models:');
    console.log([...allFields].sort().join(', '));
    
    const offerFields = [...allFields].filter(f => 
      f.toLowerCase().includes('offer') ||
      f.toLowerCase().includes('promo') ||
      f.toLowerCase().includes('special') ||
      f.toLowerCase().includes('deal') ||
      f.toLowerCase().includes('discount') ||
      f.toLowerCase().includes('campaign')
    );
    
    if (offerFields.length > 0) {
      console.log('\n\n=== OFFER-RELATED FIELDS IN MODELS ===');
      console.log(offerFields);
    }
  }
  
  // Try to list all available collections
  console.log('\n\n=== TRYING TO LIST COLLECTIONS ===');
  const rootData = await fetchAPI('');
  if (rootData) {
    console.log(JSON.stringify(rootData, null, 2));
  }
  
  console.log('\n=== PROBE COMPLETE ===');
}

main().catch(console.error);
