// Probe KGM AU Payload CMS media library for brochure PDFs
const PAYLOAD_BASE = 'https://payloadb.therefinerydesign.com/api';
const HEADERS = {
  'Accept': 'application/json',
  'Origin': 'https://kgm.com.au',
  'Referer': 'https://kgm.com.au/',
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

async function main() {
  // 1. Probe media endpoint for PDFs
  console.log('### PHASE 1: Media library scan for PDFs ###');
  let page = 1;
  let allPdfs = [];
  let allBrochures = [];
  let totalDocs = 0;

  while (page <= 10) { // scan up to 10 pages
    const data = await probe(
      `Media page ${page}`,
      `${PAYLOAD_BASE}/media?limit=100&page=${page}`
    );
    if (!data || !data.docs || data.docs.length === 0) break;

    totalDocs += data.docs.length;
    console.log(`Page ${page}: ${data.docs.length} items (total so far: ${totalDocs})`);

    // Show pagination info
    if (page === 1) {
      console.log(`Total pages: ${data.totalPages}, Total docs: ${data.totalDocs}`);
    }

    for (const doc of data.docs) {
      const filename = doc.filename || '';
      const mimeType = doc.mimeType || '';
      const url = doc.url || '';
      const alt = doc.alt || '';

      // Check for PDF files
      if (mimeType.includes('pdf') || filename.endsWith('.pdf') || url.endsWith('.pdf')) {
        allPdfs.push({
          id: doc.id,
          filename,
          mimeType,
          url,
          alt,
          filesize: doc.filesize,
          createdAt: doc.createdAt
        });
      }

      // Check for brochure references
      const brochureTerms = /brochure|spec.*sheet|price.*list|catalogue/i;
      if (brochureTerms.test(filename) || brochureTerms.test(alt) || brochureTerms.test(url)) {
        allBrochures.push({
          id: doc.id,
          filename,
          url,
          alt,
          mimeType,
          filesize: doc.filesize
        });
      }
    }

    if (!data.hasNextPage) break;
    page++;
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('RESULTS: Media Library Scan');
  console.log('='.repeat(80));
  console.log(`Total media items scanned: ${totalDocs}`);
  console.log(`PDF files found: ${allPdfs.length}`);
  console.log(`Brochure-related items: ${allBrochures.length}`);

  if (allPdfs.length > 0) {
    console.log('\nPDF FILES:');
    allPdfs.forEach(p => {
      console.log(`  ${p.filename}`);
      console.log(`    URL: ${p.url}`);
      console.log(`    Size: ${p.filesize ? (p.filesize / 1024 / 1024).toFixed(1) + 'MB' : 'unknown'}`);
      console.log(`    Alt: ${p.alt || 'none'}`);
    });
  }

  if (allBrochures.length > 0) {
    console.log('\nBROCHURE-RELATED ITEMS:');
    allBrochures.forEach(b => {
      console.log(`  ${b.filename} (${b.mimeType})`);
      console.log(`    URL: ${b.url}`);
    });
  }

  // 2. Probe other Payload collections that might have brochures
  console.log('\n### PHASE 2: Other collections ###');
  const collections = ['pages', 'vehicles', 'models', 'downloads', 'documents', 'brochures', 'files', 'resources'];
  for (const col of collections) {
    const data = await probe(`Collection: ${col}`, `${PAYLOAD_BASE}/${col}?limit=5`);
    if (data && data.docs) {
      console.log(`Found ${data.totalDocs || data.docs.length} items in ${col}`);
      if (data.docs[0]) {
        console.log(`First item keys: ${JSON.stringify(Object.keys(data.docs[0]))}`);
      }

      // Deep scan for brochure references
      const brochureTerms = /brochure|pdf|download|document|spec.*sheet/i;
      for (const doc of data.docs) {
        const json = JSON.stringify(doc);
        if (brochureTerms.test(json)) {
          // Find the specific fields
          const matches = json.match(/brochure[^"]{0,100}|\.pdf[^"]{0,50}/gi) || [];
          if (matches.length > 0) {
            console.log(`  Brochure ref in doc ${doc.id || doc.slug || 'unknown'}: ${matches.slice(0, 5).join(', ')}`);
          }
        }
      }
    }
  }

  // 3. Probe vehicles collection more deeply
  console.log('\n### PHASE 3: Vehicles detail scan ###');
  const vehiclesData = await probe('Vehicles list', `${PAYLOAD_BASE}/vehicles?limit=50&depth=2`);
  if (vehiclesData && vehiclesData.docs) {
    for (const v of vehiclesData.docs) {
      const json = JSON.stringify(v);
      const pdfUrls = json.match(/https?:\/\/[^"]+\.pdf/gi) || [];
      const brochureRefs = json.match(/"[^"]*brochure[^"]*"/gi) || [];
      if (pdfUrls.length > 0 || brochureRefs.length > 0) {
        console.log(`\nVehicle: ${v.name || v.title || v.slug || v.id}`);
        pdfUrls.forEach(u => console.log(`  PDF: ${u}`));
        brochureRefs.forEach(r => console.log(`  Ref: ${r}`));
      }
    }
  }

  // 4. Check the KGM website directly for brochure pages
  console.log('\n### PHASE 4: KGM website brochure pages ###');
  const kgmPages = [
    'https://kgm.com.au/brochures',
    'https://kgm.com.au/downloads',
    'https://kgm.com.au/resources',
    'https://kgm.com.au/models',
  ];
  for (const url of kgmPages) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': HEADERS['User-Agent'] },
        redirect: 'follow'
      });
      console.log(`\n${url} → ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        const pdfMatches = html.match(/https?:\/\/[^"'\s]+\.pdf[^"'\s]*/gi) || [];
        const brochureMatches = html.match(/brochure[^"'\s]{0,200}/gi) || [];
        if (pdfMatches.length > 0) {
          console.log(`PDF URLs (${pdfMatches.length}):`);
          [...new Set(pdfMatches)].forEach(u => console.log(`  ${u}`));
        }
        if (brochureMatches.length > 0) {
          console.log(`Brochure refs (${brochureMatches.length}):`);
          [...new Set(brochureMatches)].slice(0, 10).forEach(m => console.log(`  ${m.slice(0, 150)}`));
        }
      }
    } catch (e) {
      console.log(`${url} → Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
