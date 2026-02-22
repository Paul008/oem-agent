#!/usr/bin/env node

/**
 * Probe KGM Payload CMS API for offers/promotions data
 */

const PAYLOAD_BASE = 'https://payloadb.therefinerydesign.com/api';
const HEADERS = {
  'Origin': 'https://www.kgm.com.au',
  'Referer': 'https://www.kgm.com.au/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

const collections = [
  'offers',
  'promotions', 
  'specials',
  'deals',
  'pages',
  'banners',
  'campaigns',
  'globals',
  'vehicles',
  'grades',
  'models'
];

const globalPaths = [
  'globals',
  'globals/site-settings',
  'globals/settings',
  'globals/offers'
];

const pageSearches = [
  'pages?where[slug][equals]=offers',
  'pages?where[slug][equals]=special-offers',
  'pages?where[slug][contains]=offer',
  'pages?where[slug][contains]=special',
  'pages?where[slug][contains]=promotion'
];

async function probe(endpoint, label) {
  const url = `${PAYLOAD_BASE}/${endpoint}`;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${label}: ${url}`);
  console.log('='.repeat(80));
  
  try {
    const res = await fetch(url, { headers: HEADERS });
    console.log(`Status: ${res.status}`);
    
    if (!res.ok) {
      const text = await res.text();
      console.log(`Error response: ${text.slice(0, 200)}`);
      return null;
    }
    
    const data = await res.json();
    
    // Print structure
    if (Array.isArray(data)) {
      console.log(`Array with ${data.length} items`);
      console.log(JSON.stringify(data.slice(0, 2), null, 2));
    } else if (data.docs) {
      console.log(`Docs array with ${data.docs.length} items (total: ${data.totalDocs || '?'})`);
      console.log(JSON.stringify(data.docs.slice(0, 2), null, 2));
    } else {
      console.log('Full response:');
      console.log(JSON.stringify(data, null, 2));
    }
    
    return data;
  } catch (err) {
    console.log(`Error: ${err.message}`);
    return null;
  }
}

async function probeWebsite() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('KGM Website Offers Page');
  console.log('='.repeat(80));
  
  const urls = [
    'https://www.kgm.com.au/offers',
    'https://www.kgm.com.au/special-offers',
    'https://www.kgm.com.au/promotions'
  ];
  
  for (const url of urls) {
    try {
      console.log(`\nFetching: ${url}`);
      const res = await fetch(url, { headers: HEADERS });
      console.log(`Status: ${res.status}`);
      
      if (res.ok) {
        const html = await res.text();
        console.log(`HTML size: ${html.length} bytes`);
        
        // Look for Payload CMS data structures
        const jsonMatches = html.match(/<script[^>]*>([^<]*"docs"[^<]*)<\/script>/g);
        if (jsonMatches) {
          console.log(`Found ${jsonMatches.length} potential Payload data scripts`);
          for (let i = 0; i < Math.min(2, jsonMatches.length); i++) {
            const match = jsonMatches[i];
            const jsonText = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
            console.log(`Script ${i + 1}:`, jsonText.slice(0, 500));
          }
        }
        
        // Look for API calls in HTML
        const apiMatches = html.match(/payloadb\.therefinerydesign\.com\/api\/[a-z-]+/g);
        if (apiMatches) {
          console.log('API endpoints found in HTML:');
          console.log([...new Set(apiMatches)].join('\n'));
        }
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
}

async function main() {
  console.log('KGM PAYLOAD CMS OFFERS PROBE');
  console.log('Testing collections, globals, page searches, and website HTML\n');
  
  // Test base collections
  console.log('\n### TESTING COLLECTIONS ###');
  for (const col of collections) {
    await probe(col, `Collection: ${col}`);
  }
  
  // Test globals
  console.log('\n\n### TESTING GLOBALS ###');
  for (const path of globalPaths) {
    await probe(path, `Global: ${path}`);
  }
  
  // Test page searches
  console.log('\n\n### TESTING PAGE SEARCHES ###');
  for (const search of pageSearches) {
    await probe(search, `Page search: ${search}`);
  }
  
  // Probe website HTML
  console.log('\n\n### TESTING WEBSITE HTML ###');
  await probeWebsite();
  
  console.log('\n\n=== PROBE COMPLETE ===');
}

main().catch(console.error);
