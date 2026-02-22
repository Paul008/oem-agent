// Probe KGM Payload CMS models collection for brochure/spec-sheet references
const PAYLOAD_BASE = 'https://payloadb.therefinerydesign.com/api';
const HEADERS = {
  'Accept': 'application/json',
  'Origin': 'https://kgm.com.au',
  'Referer': 'https://kgm.com.au/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

async function main() {
  // 1. Fetch all models with deep nesting to find spec sheet PDF links
  console.log('=== PHASE 1: Models with depth=3 ===');
  const res = await fetch(`${PAYLOAD_BASE}/models?limit=50&depth=3`, { headers: HEADERS });
  const data = await res.json();
  console.log(`Total models: ${data.totalDocs}`);

  for (const model of data.docs) {
    console.log(`\n--- ${model.name || model.title} (${model.slug}) ---`);
    const json = JSON.stringify(model);

    // Find all PDF references
    const pdfUrls = json.match(/[^"'\s]+\.pdf[^"'\s]*/gi) || [];
    if (pdfUrls.length > 0) {
      console.log(`PDF refs (${pdfUrls.length}):`);
      [...new Set(pdfUrls)].forEach(u => console.log(`  ${u}`));
    }

    // Find brochure/spec references
    const specRefs = json.match(/"[^"]*(?:brochure|spec|feature|download|document)[^"]*"/gi) || [];
    if (specRefs.length > 0) {
      console.log(`Spec/brochure refs (${specRefs.length}):`);
      [...new Set(specRefs)].slice(0, 10).forEach(r => console.log(`  ${r}`));
    }

    // Check specific known fields that might have PDF links
    const fields = ['base_feature_set', 'universal_feature_sets', 'pricing_offers'];
    for (const field of fields) {
      if (model[field]) {
        const fieldJson = JSON.stringify(model[field]);
        const fieldPdfs = fieldJson.match(/[^"'\s]+\.pdf[^"'\s]*/gi) || [];
        if (fieldPdfs.length > 0) {
          console.log(`PDFs in ${field}: ${fieldPdfs.join(', ')}`);
        }
      }
    }
  }

  // 2. Try to access the PDF files found in Phase 1 of previous probe
  console.log('\n=== PHASE 2: Verify spec sheet PDFs are accessible ===');
  const knownPdfs = [
    'KGM-Korando-MY23-Specs-and-Features.pdf',
    'KGM-MY26-Torres-EVX-Specs-and-Features.pdf',
    'KGM-Torres-HEV-MY26-Specs-and-Features.pdf',
    'KGM-Torres-MY25-Specs-and-Features.pdf',
    'KGM-MY27-ACTYON-HEV-Specs-and-Features-1.pdf',
    'KGM-MY26-ACTYON-Specs-and-Features.pdf',
    'KGM-Rexton-MY26-Specs-and-Features.pdf',
    'KGM-Musso-EV-MY26-Specs-and-Features.pdf',
    'KGM-Musso-MY26-Specs-and-Features-1.pdf',
    'KGM-Musso-MY26-Specs-and-Features.pdf',
  ];

  for (const pdf of knownPdfs) {
    const url = `${PAYLOAD_BASE}/media/file/${pdf}`;
    try {
      const res = await fetch(url, { method: 'HEAD', headers: HEADERS, redirect: 'follow' });
      const ct = res.headers.get('content-type') || '';
      const cl = res.headers.get('content-length') || '0';
      const sizeMB = (parseInt(cl) / 1024 / 1024).toFixed(1);
      console.log(`${pdf}: ${res.status} (${ct}, ${sizeMB}MB) → ${res.url}`);
    } catch (e) {
      console.log(`${pdf}: Error: ${e.message}`);
    }
  }

  // 3. Check if models have spec_sheet or similar linked field
  console.log('\n=== PHASE 3: Model field analysis ===');
  const modelRes = await fetch(`${PAYLOAD_BASE}/models?limit=1&depth=0`, { headers: HEADERS });
  const modelData = await modelRes.json();
  if (modelData.docs[0]) {
    console.log('Model fields:');
    for (const [key, val] of Object.entries(modelData.docs[0])) {
      const type = Array.isArray(val) ? 'array' : typeof val;
      const preview = JSON.stringify(val)?.slice(0, 100) || 'null';
      console.log(`  ${key}: (${type}) ${preview}`);
    }
  }

  // 4. Check for a globals/settings collection that might have brochure config
  console.log('\n=== PHASE 4: Global settings ===');
  const globalEndpoints = ['globals', 'settings', 'site-settings', 'general'];
  for (const ep of globalEndpoints) {
    try {
      const res = await fetch(`${PAYLOAD_BASE}/${ep}`, { headers: HEADERS });
      console.log(`${ep}: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`Keys: ${JSON.stringify(Object.keys(data)).slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`${ep}: Error`);
    }
  }

  // 5. Look for brochure-like PDFs with different naming patterns in media
  console.log('\n=== PHASE 5: Search media for brochure patterns ===');
  const searchTerms = ['brochure', 'spec', 'feature', 'price'];
  for (const term of searchTerms) {
    try {
      const res = await fetch(`${PAYLOAD_BASE}/media?where[filename][contains]=${term}&limit=20`, { headers: HEADERS });
      const data = await res.json();
      if (data.docs && data.docs.length > 0) {
        console.log(`\nSearch "${term}": ${data.docs.length} results`);
        data.docs.forEach(d => console.log(`  ${d.filename} (${d.mimeType}) → ${d.url}`));
      } else {
        console.log(`Search "${term}": 0 results`);
      }
    } catch (e) {
      console.log(`Search "${term}": Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
