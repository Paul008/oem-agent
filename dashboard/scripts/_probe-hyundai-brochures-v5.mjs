// Hyundai AU: Scan ALL model pages for PDF links (spec sheets, brochures)
// Key finding: brochureDirectDownload is "false" = form-gated
// But spec sheets are direct DAM downloads!
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

const MODEL_PAGES = [
  '/au/en/cars/suvs/kona',
  '/au/en/cars/suvs/kona/konahybrid',
  '/au/en/cars/eco/kona-electric/',
  '/au/en/cars/suvs/tucson',
  '/au/en/cars/suvs/venue',
  '/au/en/cars/suvs/santa-fe',
  '/au/en/cars/suvs/santa-fe-hybrid',
  '/au/en/cars/suvs/palisade',
  '/au/en/cars/small-cars/i30/n-line',
  '/au/en/cars/small-cars/i30/sedan',
  '/au/en/cars/small-cars/i30/i30-sedan-hybrid',
  '/au/en/cars/small-cars/i30/n-line-sedan',
  '/au/en/cars/eco/inster',
  '/au/en/cars/eco/ioniq9',
  '/au/en/cars/eco/ioniq5',
  '/au/en/cars/eco/ioniq5n',
  '/au/en/cars/mid-size/sonata-n-line',
  '/au/en/cars/sports-cars/i20-n',
  '/au/en/cars/sports-cars/i30-n',
  '/au/en/cars/sports-cars/i30-sedan-n',
  '/au/en/cars/people-movers-and-commercial/staria',
  '/au/en/cars/people-movers-and-commercial/2025-staria-load',
  '/au/en/cars/ecv/mighty-electric',
];

async function main() {
  const results = [];

  for (const path of MODEL_PAGES) {
    const url = `https://www.hyundai.com${path}`;
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!res.ok) {
        console.log(`${path} → ${res.status} SKIP`);
        continue;
      }
      const html = await res.text();
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || 'N/A';

      // Extract all PDF links from DAM
      const damPdfs = html.match(/\/content\/dam\/[^"'\s]+\.pdf/gi) || [];
      const uniquePdfs = [...new Set(damPdfs)];

      // Extract brochure download config
      const brochureConfig = html.match(/data-form-download-brochure=["']([^"']+)["']/i)?.[1];
      let brochureData = null;
      if (brochureConfig) {
        try {
          brochureData = JSON.parse(brochureConfig.replace(/&#34;/g, '"'));
        } catch (e) {}
      }

      // Categorize PDFs
      const specSheets = uniquePdfs.filter(p => /spec/i.test(p));
      const brochurePdfs = uniquePdfs.filter(p => /brochure/i.test(p));
      const otherPdfs = uniquePdfs.filter(p => !/spec|brochure/i.test(p));

      const result = {
        path,
        title: title.split('|')[0].trim(),
        specSheets,
        brochurePdfs,
        otherPdfs,
        brochureDirectDownload: brochureData?.brochureDirectDownload,
        brochureUrl: brochureData?.brochureUrl || null,
      };
      results.push(result);

      // Print summary
      console.log(`\n${result.title} (${path})`);
      if (specSheets.length > 0) {
        specSheets.forEach(s => console.log(`  SPEC: https://www.hyundai.com${s}`));
      }
      if (brochurePdfs.length > 0) {
        brochurePdfs.forEach(b => console.log(`  BROCHURE: https://www.hyundai.com${b}`));
      }
      if (otherPdfs.length > 0) {
        otherPdfs.forEach(o => console.log(`  OTHER PDF: https://www.hyundai.com${o}`));
      }
      if (brochureData) {
        console.log(`  Brochure config: ${JSON.stringify(brochureData)}`);
      }
      if (uniquePdfs.length === 0 && !brochureData) {
        console.log(`  (no PDFs or brochure config found)`);
      }

    } catch (e) {
      console.log(`${path} → Error: ${e.message}`);
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  const withSpecs = results.filter(r => r.specSheets.length > 0);
  const withBrochures = results.filter(r => r.brochurePdfs.length > 0);
  const formGated = results.filter(r => r.brochureDirectDownload === 'false');
  const directDownload = results.filter(r => r.brochureDirectDownload === 'true');

  console.log(`Total models scanned: ${results.length}`);
  console.log(`With spec sheet PDFs: ${withSpecs.length}`);
  console.log(`With brochure PDFs: ${withBrochures.length}`);
  console.log(`Form-gated brochures: ${formGated.length}`);
  console.log(`Direct download brochures: ${directDownload.length}`);

  console.log('\nAll unique PDF URLs:');
  const allPdfs = new Set();
  results.forEach(r => {
    [...r.specSheets, ...r.brochurePdfs, ...r.otherPdfs].forEach(p => allPdfs.add(p));
  });
  [...allPdfs].sort().forEach(p => console.log(`  https://www.hyundai.com${p}`));

  // Verify a few PDFs are actually accessible
  console.log('\n=== PDF Accessibility Check ===');
  const pdfSample = [...allPdfs].slice(0, 5);
  for (const pdfPath of pdfSample) {
    const url = `https://www.hyundai.com${pdfPath}`;
    try {
      const res = await fetch(url, { method: 'HEAD', headers: HEADERS, redirect: 'follow' });
      const ct = res.headers.get('content-type') || '';
      const cl = res.headers.get('content-length') || '0';
      console.log(`${pdfPath.split('/').pop()}: ${res.status} (${ct}, ${(parseInt(cl)/1024).toFixed(0)}KB)`);
    } catch (e) {
      console.log(`${pdfPath.split('/').pop()}: Error`);
    }
  }
}

main().catch(console.error);
