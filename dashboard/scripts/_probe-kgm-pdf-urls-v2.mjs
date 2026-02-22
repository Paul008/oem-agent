// KGM: Find the actual PDF serving URL from the kgm.com.au website
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

async function main() {
  // 1. Check how kgm.com.au loads its pages - it's likely a Next.js SPA
  console.log('=== Phase 1: KGM.com.au homepage analysis ===');
  const homeRes = await fetch('https://kgm.com.au/', { headers: HEADERS, redirect: 'follow' });
  const html = await homeRes.text();

  // Check for __NEXT_DATA__
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch) {
    console.log('Found __NEXT_DATA__!');
    try {
      const nextData = JSON.parse(nextMatch[1]);
      const buildId = nextData.buildId;
      console.log(`Build ID: ${buildId}`);

      // The models page data endpoint
      const modelsUrl = `https://kgm.com.au/_next/data/${buildId}/models.json`;
      console.log(`\nTrying: ${modelsUrl}`);
      const modelsRes = await fetch(modelsUrl, { headers: { ...HEADERS, Accept: 'application/json' } });
      console.log(`Status: ${modelsRes.status}`);
      if (modelsRes.ok) {
        const data = await modelsRes.json();
        const json = JSON.stringify(data);
        // Look for PDF refs
        const pdfRefs = json.match(/[^"]*\.pdf[^"]*/gi) || [];
        if (pdfRefs.length > 0) {
          console.log(`PDF refs: ${[...new Set(pdfRefs)].join('\n  ')}`);
        }
      }

      // Try individual model pages
      const modelSlugs = ['torres', 'musso', 'rexton', 'actyon', 'korando', 'musso-ev'];
      for (const slug of modelSlugs) {
        const modelUrl = `https://kgm.com.au/_next/data/${buildId}/${slug}.json`;
        try {
          const res = await fetch(modelUrl, { headers: { ...HEADERS, Accept: 'application/json' } });
          if (res.ok) {
            const data = await res.json();
            const json = JSON.stringify(data);
            const pdfRefs = json.match(/["'][^"']*\.pdf[^"']*["']/gi) || [];
            if (pdfRefs.length > 0) {
              console.log(`\n${slug} PDFs:`);
              [...new Set(pdfRefs)].forEach(r => console.log(`  ${r}`));
            }

            // Also check for spec/brochure keys
            const specRefs = json.match(/"[^"]*(?:spec_sheet|brochure|download_pdf|pdf_url|document)[^"]*"/gi) || [];
            if (specRefs.length > 0) {
              console.log(`${slug} spec/brochure keys: ${[...new Set(specRefs)].join(', ')}`);
            }
          } else {
            console.log(`${slug}: ${res.status}`);
          }
        } catch (e) {
          console.log(`${slug}: Error`);
        }
      }
    } catch (e) {
      console.log(`Parse error: ${e.message}`);
    }
  } else {
    console.log('No __NEXT_DATA__ found');
  }

  // 2. Check if Payload CMS media has a static server
  // Payload CMS v2+ typically serves at /media/filename
  // But the API URL in the data is /api/media/file/filename
  // The actual file might be served from a different base URL
  console.log('\n=== Phase 2: Payload CMS media serving patterns ===');

  // Get the actual Payload CMS server URL structure
  const apiRes = await fetch('https://payloadb.therefinerydesign.com/api', {
    headers: { Accept: 'application/json', 'User-Agent': HEADERS['User-Agent'] }
  });
  console.log(`Payload API root: ${apiRes.status}`);
  if (apiRes.ok) {
    const text = await apiRes.text();
    console.log(`Response: ${text.slice(0, 500)}`);
  }

  // Try Payload media with GET instead of HEAD
  console.log('\n=== Phase 3: Try GET on Payload media ===');
  const pdfUrls = [
    'https://payloadb.therefinerydesign.com/api/media/file/KGM-Rexton-MY26-Specs-and-Features.pdf',
    'https://payloadb.therefinerydesign.com/media/KGM-Rexton-MY26-Specs-and-Features.pdf',
  ];

  for (const url of pdfUrls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': HEADERS['User-Agent'], Accept: 'application/pdf,*/*' },
        redirect: 'follow'
      });
      const ct = res.headers.get('content-type') || '';
      const cl = res.headers.get('content-length') || '0';
      console.log(`\n${url}`);
      console.log(`  Status: ${res.status}, Type: ${ct}, Size: ${(parseInt(cl)/1024).toFixed(0)}KB`);
      if (res.url !== url) console.log(`  Redirected: ${res.url}`);
      if (res.status === 404) {
        const body = await res.text();
        console.log(`  Body: ${body.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`${url} → Error: ${e.message}`);
    }
  }

  // 3. Check the KGM.com.au HTML for how it references Payload media
  console.log('\n=== Phase 4: Check KGM page for Payload image references ===');
  // Kgm.com.au homepage should have images loaded from Payload
  const imgRefs = html.match(/https?:\/\/[^"'\s<>]+(?:therefinerydesign|payloadb)[^"'\s<>]*/gi) || [];
  if (imgRefs.length > 0) {
    console.log(`Payload/Refinery image refs (${imgRefs.length}):`);
    [...new Set(imgRefs)].slice(0, 10).forEach(r => console.log(`  ${r}`));

    // Test if these image URLs work
    const testUrl = [...new Set(imgRefs)][0];
    try {
      const res = await fetch(testUrl, { method: 'HEAD', headers: HEADERS, redirect: 'follow' });
      console.log(`\nTest image: ${testUrl}`);
      console.log(`  Status: ${res.status}, Type: ${res.headers.get('content-type')}`);
      if (res.url !== testUrl) console.log(`  Final URL: ${res.url}`);
    } catch (e) {
      console.log(`Test image error: ${e.message}`);
    }
  } else {
    // Maybe images are loaded through Next.js image optimization
    const nextImgs = html.match(/\/_next\/image\?[^"'\s<>]+/gi) || [];
    if (nextImgs.length > 0) {
      console.log(`Next.js optimized images (${nextImgs.length}):`);
      [...new Set(nextImgs)].slice(0, 5).forEach(r => console.log(`  ${r}`));

      // Decode the URL parameter to find the source
      const decoded = decodeURIComponent(nextImgs[0]);
      console.log(`\nDecoded first image: ${decoded}`);
    }

    // Also check for srcset or data-src attributes
    const dataSrc = html.match(/(?:src|data-src|srcSet)=["']([^"']*payloadb[^"']*)["']/gi) || [];
    if (dataSrc.length > 0) {
      console.log(`Data-src with Payload refs:`);
      dataSrc.slice(0, 5).forEach(s => console.log(`  ${s.slice(0, 200)}`));
    }
  }
}

main().catch(console.error);
