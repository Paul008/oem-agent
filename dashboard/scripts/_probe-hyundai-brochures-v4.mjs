// Hyundai AU: Extract brochure data from cars listing page and model pages
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

async function main() {
  // 1. Get the cars listing page and extract all data-form-download-brochure attributes
  console.log('=== Phase 1: Extract brochure data from /au/en/cars ===');
  const res = await fetch('https://www.hyundai.com/au/en/cars', { headers: HEADERS, redirect: 'follow' });
  const html = await res.text();

  // Extract all data-form-download-brochure attributes
  const brochureAttrs = html.match(/data-form-download-brochure=["'][^"']+["']/gi) || [];
  console.log(`Found ${brochureAttrs.length} brochure data attributes`);

  // Decode HTML entities and parse
  const brochureData = [];
  for (const attr of brochureAttrs) {
    const value = attr.match(/data-form-download-brochure=["']([^"']+)["']/i)?.[1];
    if (value) {
      const decoded = value
        .replace(/&#34;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
      try {
        const parsed = JSON.parse(decoded);
        brochureData.push(parsed);
      } catch (e) {
        console.log(`Parse error for: ${decoded.slice(0, 100)}`);
      }
    }
  }

  console.log(`\nParsed ${brochureData.length} brochure configs:`);
  brochureData.forEach((bd, i) => {
    console.log(`\n[${i + 1}] ${JSON.stringify(bd, null, 2)}`);
  });

  // 2. Also look for model card links and their associated data
  console.log('\n=== Phase 2: Extract model card data ===');
  // Find all model links on the page
  const modelCardLinks = html.match(/href=["'](\/au\/en\/cars\/[^"'#]+)["']/gi) || [];
  const uniqueModelLinks = [...new Set(modelCardLinks.map(l => l.match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean))];
  console.log(`Model links (${uniqueModelLinks.length}):`);
  uniqueModelLinks.forEach(l => console.log(`  ${l}`));

  // 3. Visit a specific model page (e.g., Tucson) and look for brochure data
  console.log('\n=== Phase 3: Visit specific model pages for brochure data ===');
  for (const path of uniqueModelLinks.slice(0, 5)) {
    const url = `https://www.hyundai.com${path}`;
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      console.log(`\n${path} → ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        console.log(`  Title: ${title ? title[1].trim() : 'N/A'}`);

        // Check for data-form-download-brochure
        const brochureAttrs = html.match(/data-form-download-brochure=["'][^"']+["']/gi) || [];
        if (brochureAttrs.length > 0) {
          for (const attr of brochureAttrs) {
            const value = attr.match(/data-form-download-brochure=["']([^"']+)["']/i)?.[1];
            if (value) {
              const decoded = value.replace(/&#34;/g, '"').replace(/&amp;/g, '&');
              try {
                const parsed = JSON.parse(decoded);
                console.log(`  Brochure config: ${JSON.stringify(parsed)}`);
              } catch (e) {
                console.log(`  Brochure raw: ${decoded.slice(0, 200)}`);
              }
            }
          }
        }

        // Check for direct PDF download links
        const pdfLinks = html.match(/href=["']([^"']*\.pdf[^"']*)["']/gi) || [];
        if (pdfLinks.length > 0) {
          console.log(`  PDF links:`);
          [...new Set(pdfLinks)].forEach(l => console.log(`    ${l}`));
        }

        // Check for DAM paths with brochure
        const damBrochure = html.match(/\/content\/dam\/[^"'\s]*brochure[^"'\s]*/gi) || [];
        if (damBrochure.length > 0) {
          console.log(`  DAM brochure paths:`);
          [...new Set(damBrochure)].forEach(p => console.log(`    ${p}`));
        }

        // Check for any data attributes with PDF/brochure
        const dataAttrs = html.match(/data-[a-z-]+=["'][^"']*(?:brochure|\.pdf)[^"']*["']/gi) || [];
        if (dataAttrs.length > 0) {
          console.log(`  Data attributes with brochure/PDF:`);
          [...new Set(dataAttrs)].slice(0, 5).forEach(a => {
            const decoded = a.replace(/&#34;/g, '"').replace(/&amp;/g, '&');
            console.log(`    ${decoded.slice(0, 200)}`);
          });
        }

        // Look for "download a brochure" buttons or CTAs
        const ctaButtons = html.match(/<a[^>]*>[^<]*(?:brochure|download)[^<]*<\/a>/gi) || [];
        if (ctaButtons.length > 0) {
          console.log(`  Brochure CTAs:`);
          ctaButtons.slice(0, 5).forEach(c => console.log(`    ${c.slice(0, 200)}`));
        }
      }
    } catch (e) {
      console.log(`${path} → Error: ${e.message}`);
    }
  }

  // 4. Check the AEM model.json for the cars page
  console.log('\n=== Phase 4: AEM Sling model.json for cars page ===');
  const jsonRes = await fetch('https://www.hyundai.com/au/en/cars.model.json', {
    headers: { ...HEADERS, Accept: 'application/json' }
  });
  console.log(`cars.model.json: ${jsonRes.status}`);
  if (jsonRes.ok) {
    const data = await jsonRes.json();
    const json = JSON.stringify(data);
    const brochureRefs = json.match(/brochure[^"]{0,200}/gi) || [];
    const pdfRefs = json.match(/[^"]*\.pdf[^"]*/gi) || [];
    console.log(`Keys: ${JSON.stringify(Object.keys(data)).slice(0, 500)}`);
    if (brochureRefs.length > 0) {
      console.log(`Brochure refs (${brochureRefs.length}):`);
      [...new Set(brochureRefs)].slice(0, 10).forEach(r => console.log(`  ${r.slice(0, 150)}`));
    }
    if (pdfRefs.length > 0) {
      console.log(`PDF refs (${pdfRefs.length}):`);
      [...new Set(pdfRefs)].slice(0, 10).forEach(r => console.log(`  ${r.slice(0, 150)}`));
    }
    // Show a compact sample
    console.log(`Sample: ${json.slice(0, 1000)}`);
  }

  // 5. Try guessing Hyundai AEM DAM brochure paths using the confirmed pattern
  console.log('\n=== Phase 5: Guess AEM DAM brochure paths ===');
  const models = ['tucson', 'i30', 'kona', 'ioniq-5', 'ioniq-6', 'santa-fe', 'palisade', 'staria', 'i30-sedan', 'venue'];
  const damPatterns = [
    m => `/content/dam/hyundai/au/en/models/${m}/brochure/${m}-brochure.pdf`,
    m => `/content/dam/hyundai/au/en/models/${m}/${m}-brochure.pdf`,
    m => `/content/dam/hyundai/au/en/documents/brochures/${m}.pdf`,
    m => `/content/dam/hyundai/au/en/documents/brochures/${m}-brochure.pdf`,
    m => `/content/dam/hyundai/au/en/data/brochure/${m}.pdf`,
    m => `/content/dam/hyundai/au/en/documents/2025/${m}-brochure.pdf`,
    m => `/content/dam/hyundai/au/en/documents/2026/${m}-brochure.pdf`,
    m => `/content/dam/hyundai/au/en/find-a-car/${m}/${m}-brochure.pdf`,
    m => `/content/dam/hyundai/au/en/cars/${m}/${m}-brochure.pdf`,
  ];

  for (const model of models) {
    for (const patternFn of damPatterns) {
      const path = patternFn(model);
      const url = `https://www.hyundai.com${path}`;
      try {
        const res = await fetch(url, { method: 'HEAD', headers: HEADERS, redirect: 'follow' });
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          const cl = res.headers.get('content-length') || '0';
          console.log(`FOUND: ${path} (${ct}, ${(parseInt(cl)/1024).toFixed(0)}KB)`);
        }
      } catch (e) {
        // skip
      }
    }
  }
}

main().catch(console.error);
