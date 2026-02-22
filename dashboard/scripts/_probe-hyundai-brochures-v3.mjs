// Hyundai AU: Deep probe of the main page for model URLs and brochure DAM paths
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

async function main() {
  // 1. Get the main page and extract all internal links to find model page structure
  console.log('=== Phase 1: Extract navigation and model links ===');
  const res = await fetch('https://www.hyundai.com/au/en', { headers: HEADERS, redirect: 'follow' });
  const html = await res.text();

  // Extract all internal links
  const allLinks = html.match(/href=["'](\/au\/en\/[^"']+)["']/gi) || [];
  const uniqueLinks = [...new Set(allLinks.map(l => l.match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean))];

  // Find model-related links
  const modelLinks = uniqueLinks.filter(l => /find-a-car|model|vehicle|car|suv|sedan|electric/i.test(l));
  console.log(`Model-related links (${modelLinks.length}):`);
  modelLinks.forEach(l => console.log(`  ${l}`));

  // Find download/brochure links
  const downloadLinks = uniqueLinks.filter(l => /download|brochure|pdf|specification/i.test(l));
  console.log(`\nDownload/brochure links (${downloadLinks.length}):`);
  downloadLinks.forEach(l => console.log(`  ${l}`));

  // Find all DAM paths and check for PDFs
  const damPaths = html.match(/\/content\/dam\/[^"'\s]+/gi) || [];
  const uniqueDam = [...new Set(damPaths)];
  const pdfDam = uniqueDam.filter(p => /\.pdf/i.test(p));
  console.log(`\nAll DAM PDF paths (${pdfDam.length}):`);
  pdfDam.forEach(p => console.log(`  ${p}`));

  // Show DAM base path structure
  const damBases = [...new Set(uniqueDam.map(p => p.split('/').slice(0, 7).join('/')))];
  console.log(`\nDAM base path structure:`);
  damBases.forEach(b => console.log(`  ${b}`));

  // 2. Try to visit model pages using the found links
  console.log('\n=== Phase 2: Visit model pages ===');
  const modelsToTry = modelLinks.filter(l => !l.includes('#')).slice(0, 10);
  for (const path of modelsToTry) {
    const url = `https://www.hyundai.com${path}`;
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      console.log(`\n${path} → ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        console.log(`  Title: ${title ? title[1].trim() : 'N/A'}`);

        // Check for PDF/brochure
        const pdfUrls = html.match(/https?:\/\/[^"'\s<>]+\.pdf[^"'\s<>]*/gi) || [];
        const damPdfs = html.match(/\/content\/dam\/[^"'\s]+\.pdf/gi) || [];
        const brochureRefs = html.match(/.{0,50}brochure.{0,50}/gi) || [];

        if (pdfUrls.length > 0) console.log(`  PDF URLs: ${[...new Set(pdfUrls)].join(', ')}`);
        if (damPdfs.length > 0) console.log(`  DAM PDFs: ${[...new Set(damPdfs)].join(', ')}`);
        if (brochureRefs.length > 0) {
          console.log(`  Brochure mentions (${brochureRefs.length}):`);
          [...new Set(brochureRefs)].slice(0, 3).forEach(r => console.log(`    ${r.trim()}`));
        }

        // Check for download-a-brochure sub-links
        const subLinks = html.match(/href=["']([^"']*(?:brochure|download|pdf)[^"']*)["']/gi) || [];
        if (subLinks.length > 0) {
          console.log(`  Brochure/download sub-links:`);
          [...new Set(subLinks)].forEach(l => console.log(`    ${l}`));
        }
      }
    } catch (e) {
      console.log(`${path} → Error: ${e.message}`);
    }
  }

  // 3. Try Hyundai AEM Exporter / Content API (Sling)
  console.log('\n=== Phase 3: AEM Sling/Content exporter ===');
  const slingPatterns = [
    'https://www.hyundai.com/au/en/find-a-car.model.json',
    'https://www.hyundai.com/au/en/find-a-car.infinity.json',
    'https://www.hyundai.com/au/en.model.json',
    'https://www.hyundai.com/au/en.infinity.json',
    'https://www.hyundai.com/au/en.2.json',
    'https://www.hyundai.com/au/en/find-a-car.2.json',
  ];
  for (const url of slingPatterns) {
    try {
      const res = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json' } });
      console.log(`\n${url.split('/au/')[1]} → ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`Keys: ${JSON.stringify(Object.keys(data)).slice(0, 300)}`);
        const json = JSON.stringify(data);
        const pdfRefs = json.match(/[^"]*\.pdf[^"]*/gi) || [];
        const brochureRefs = json.match(/brochure[^"]{0,100}/gi) || [];
        if (pdfRefs.length > 0) console.log(`PDFs: ${[...new Set(pdfRefs)].slice(0, 5).join(', ')}`);
        if (brochureRefs.length > 0) console.log(`Brochure: ${[...new Set(brochureRefs)].slice(0, 5).join(', ')}`);
      }
    } catch (e) {
      // skip
    }
  }

  // 4. Check if brochures are hosted on a separate subdomain or CDN
  console.log('\n=== Phase 4: Alternate Hyundai CDN/subdomains ===');
  const altDomains = [
    'https://cdn.hyundai.com/au/en/data/brochure/',
    'https://assets.hyundai.com/au/',
    'https://www.hyundai.com/content/hyundai/au/en/find-a-car/tucson/jcr:content.model.json',
    'https://www.hyundai.com/content/hyundai/au/en/find-a-car/tucson.model.json',
  ];
  for (const url of altDomains) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      console.log(`${url} → ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        const pdfRefs = text.match(/\.pdf/gi) || [];
        const brochureRefs = text.match(/brochure/gi) || [];
        if (pdfRefs.length > 0) console.log(`  Has ${pdfRefs.length} PDF refs`);
        if (brochureRefs.length > 0) console.log(`  Has ${brochureRefs.length} brochure refs`);
        console.log(`  Sample: ${text.slice(0, 300)}`);
      }
    } catch (e) {
      console.log(`${url} → Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
