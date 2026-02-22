#!/usr/bin/env node

/**
 * Analyze KGM offers page HTML structure
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

async function main() {
  console.log('Fetching KGM offers page...\n');
  
  const res = await fetch('https://www.kgm.com.au/offers', { headers: HEADERS });
  const html = await res.text();
  
  console.log(`HTML size: ${html.length} bytes\n`);
  
  // Look for Next.js data
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (nextDataMatch) {
    console.log('Found __NEXT_DATA__:');
    const data = JSON.parse(nextDataMatch[1]);
    console.log(JSON.stringify(data, null, 2).slice(0, 5000));
  }
  
  // Look for Payload API calls
  const apiMatches = html.match(/payloadb\.therefinerydesign\.com\/api\/[a-z-?=&\[\]]+/g);
  if (apiMatches) {
    console.log('\n\nAPI endpoints found in HTML:');
    const unique = [...new Set(apiMatches)];
    unique.forEach(url => console.log(url));
  }
  
  // Look for offer data in scripts
  const offerMatches = html.match(/"offer[^"]*":\s*\{[^}]+\}/gi);
  if (offerMatches) {
    console.log('\n\nOffer-related JSON fragments:');
    offerMatches.slice(0, 3).forEach(m => console.log(m));
  }
  
  // Look for model/vehicle data
  const modelMatches = html.match(/"(model|vehicle|grade)[^"]*":\s*\[[^\]]+\]/gi);
  if (modelMatches) {
    console.log('\n\nModel/vehicle JSON fragments:');
    modelMatches.slice(0, 3).forEach(m => console.log(m));
  }
  
  // Check for specific offer content
  const offerHeadings = html.match(/<h[1-6][^>]*>([^<]*offer[^<]*)<\/h[1-6]>/gi);
  if (offerHeadings) {
    console.log('\n\nOffer headings found:');
    offerHeadings.forEach(h => console.log(h.replace(/<[^>]+>/g, '')));
  }
  
  // Look for structured data
  const ldJsonMatches = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/gs);
  if (ldJsonMatches) {
    console.log('\n\nStructured data (JSON-LD):');
    ldJsonMatches.forEach((m, i) => {
      const json = m.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
      console.log(`\n=== LD+JSON ${i + 1} ===`);
      console.log(json.slice(0, 1000));
    });
  }
}

main().catch(console.error);
