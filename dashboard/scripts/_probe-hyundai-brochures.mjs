// Probe Hyundai AU Content API v3 for brochure URLs
const BASE = 'https://www.hyundai.com/au/api/v3/content';
const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

async function probe(label, url) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`PROBE: ${label}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(80));
  try {
    const res = await fetch(url, { headers: HEADERS });
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Content-Type: ${res.headers.get('content-type')}`);
    if (!res.ok) {
      const text = await res.text();
      console.log(`Body (first 500): ${text.slice(0, 500)}`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (e) {
    console.log(`Error: ${e.message}`);
    return null;
  }
}

function findBrochureKeys(obj, path = '', depth = 0) {
  if (depth > 8 || !obj) return [];
  const results = [];
  const brochureTerms = /brochure|pdf|download|document|spec.*sheet/i;

  if (typeof obj === 'string') {
    if (brochureTerms.test(obj) || obj.endsWith('.pdf')) {
      results.push({ path, value: obj });
    }
    return results;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      results.push(...findBrochureKeys(item, `${path}[${i}]`, depth + 1));
    });
    return results;
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (brochureTerms.test(key)) {
        results.push({ path: `${path}.${key}`, value: val });
      }
      results.push(...findBrochureKeys(val, `${path}.${key}`, depth + 1));
    }
  }
  return results;
}

async function main() {
  // 1. Try the models list endpoint
  let data = await probe('Models list', `${BASE}/models`);
  if (data) {
    const keys = Object.keys(data).slice(0, 10);
    console.log(`Top-level keys: ${JSON.stringify(keys)}`);
    const brochureHits = findBrochureKeys(data);
    if (brochureHits.length > 0) {
      console.log(`\nBROCHURE HITS (${brochureHits.length}):`);
      brochureHits.slice(0, 20).forEach(h => console.log(`  ${h.path}: ${JSON.stringify(h.value).slice(0, 200)}`));
    } else {
      console.log('\nNo brochure references found in models list');
    }
    // Show structure sample
    if (Array.isArray(data)) {
      console.log(`\nArray of ${data.length} items`);
      if (data[0]) console.log(`First item keys: ${JSON.stringify(Object.keys(data[0]))}`);
      // Show first item compactly
      console.log(`First item sample: ${JSON.stringify(data[0]).slice(0, 500)}`);
    } else {
      console.log(`\nResponse sample: ${JSON.stringify(data).slice(0, 1000)}`);
    }
  }

  // 2. Try specific model endpoints
  const models = ['tucson', 'i30', 'kona', 'ioniq-5', 'santa-fe', 'staria'];
  for (const model of models) {
    for (const pattern of [
      `${BASE}/models/${model}`,
      `${BASE}/model/${model}`,
      `${BASE}/vehicles/${model}`,
    ]) {
      data = await probe(`Model: ${model}`, pattern);
      if (data) {
        const brochureHits = findBrochureKeys(data);
        if (brochureHits.length > 0) {
          console.log(`\nBROCHURE HITS (${brochureHits.length}):`);
          brochureHits.slice(0, 10).forEach(h => console.log(`  ${h.path}: ${JSON.stringify(h.value).slice(0, 200)}`));
        }
        // Show top-level structure
        if (typeof data === 'object') {
          const keys = Object.keys(data);
          console.log(`Keys: ${JSON.stringify(keys).slice(0, 500)}`);
        }
        console.log(`Sample: ${JSON.stringify(data).slice(0, 800)}`);
        break; // Found a working pattern, skip others for this model
      }
    }
  }

  // 3. Try download/brochure specific endpoints
  const brochureEndpoints = [
    `${BASE}/brochures`,
    `${BASE}/downloads`,
    `https://www.hyundai.com/au/api/v3/brochures`,
    `https://www.hyundai.com/au/api/v3/downloads`,
    `https://www.hyundai.com/au/api/v3/content/downloads`,
    `https://www.hyundai.com/au/api/v3/content/brochures`,
    `https://www.hyundai.com/au/api/v3/content/resources`,
    `https://www.hyundai.com/au/api/v3/content/media`,
  ];
  for (const url of brochureEndpoints) {
    data = await probe('Brochure endpoint', url);
    if (data) {
      const brochureHits = findBrochureKeys(data);
      if (brochureHits.length > 0) {
        console.log(`\nBROCHURE HITS (${brochureHits.length}):`);
        brochureHits.forEach(h => console.log(`  ${h.path}: ${JSON.stringify(h.value).slice(0, 200)}`));
      }
      console.log(`Sample: ${JSON.stringify(data).slice(0, 500)}`);
    }
  }

  // 4. Try HTML page for brochure download links
  console.log(`\n${'='.repeat(80)}`);
  console.log('PROBE: HTML brochure pages');
  console.log('='.repeat(80));
  const htmlPages = [
    'https://www.hyundai.com/au/en/find-a-car/tucson/download-a-brochure',
    'https://www.hyundai.com/au/en/find-a-car/tucson/brochure',
    'https://www.hyundai.com/au/en/brochures',
    'https://www.hyundai.com/au/en/find-a-car/tucson',
  ];
  for (const url of htmlPages) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] }, redirect: 'follow' });
      console.log(`\n${url} → ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        // Search for PDF links
        const pdfMatches = html.match(/https?:\/\/[^"'\s]+\.pdf[^"'\s]*/gi) || [];
        const brochureMatches = html.match(/brochure[^"'\s]{0,200}/gi) || [];
        if (pdfMatches.length > 0) {
          console.log(`PDF URLs found (${pdfMatches.length}):`);
          [...new Set(pdfMatches)].forEach(u => console.log(`  ${u}`));
        }
        if (brochureMatches.length > 0) {
          console.log(`Brochure references (${brochureMatches.length}):`);
          [...new Set(brochureMatches)].slice(0, 10).forEach(m => console.log(`  ${m.slice(0, 150)}`));
        }
        if (pdfMatches.length === 0 && brochureMatches.length === 0) {
          console.log('No PDF or brochure references in HTML');
        }
      }
    } catch (e) {
      console.log(`${url} → Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
