// KGM: Find the correct URL to serve PDFs from Payload CMS
const HEADERS = {
  'Accept': '*/*',
  'Origin': 'https://kgm.com.au',
  'Referer': 'https://kgm.com.au/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

async function main() {
  // The media item has url: "/api/media/file/KGM-Korando-MY23-Specs-and-Features.pdf"
  // But that 404s on the API server. Let's find the correct prefix.

  // 1. Try image URLs first - we know images work
  console.log('=== Phase 1: Find a working image URL pattern ===');
  const imgRes = await fetch(
    'https://payloadb.therefinerydesign.com/api/media?limit=1&where[mimeType][contains]=image',
    { headers: { ...HEADERS, Accept: 'application/json' } }
  );
  const imgData = await imgRes.json();
  if (imgData.docs[0]) {
    const img = imgData.docs[0];
    console.log(`Image: ${img.filename}, URL field: ${img.url}`);

    // Try various URL constructions for the image
    const urls = [
      `https://payloadb.therefinerydesign.com${img.url}`,
      `https://payloadb.therefinerydesign.com/media/${img.filename}`,
    ];

    // Check if there are size variants that work
    if (img.sizes) {
      for (const [size, data] of Object.entries(img.sizes)) {
        if (data && data.url) {
          urls.push(`https://payloadb.therefinerydesign.com${data.url}`);
        }
      }
    }

    for (const url of urls) {
      try {
        const res = await fetch(url, { method: 'HEAD', headers: HEADERS, redirect: 'follow' });
        const ct = res.headers.get('content-type') || '';
        console.log(`${url} → ${res.status} (${ct})`);
        if (res.url !== url) console.log(`  Redirected: ${res.url}`);
      } catch (e) {
        console.log(`${url} → Error: ${e.message}`);
      }
    }
  }

  // 2. Check how KGM.com.au serves media
  console.log('\n=== Phase 2: Check KGM website for media serving pattern ===');
  const kgmRes = await fetch('https://kgm.com.au/models', { headers: { ...HEADERS, Accept: 'text/html' }, redirect: 'follow' });
  if (kgmRes.ok) {
    const html = await kgmRes.text();

    // Find image src patterns that reference the Payload CMS
    const payloadImgs = html.match(/https?:\/\/payloadb\.therefinerydesign\.com[^"'\s]+/gi) || [];
    if (payloadImgs.length > 0) {
      console.log(`Payload URLs found in KGM page (${payloadImgs.length}):`);
      const unique = [...new Set(payloadImgs)];
      unique.slice(0, 10).forEach(u => console.log(`  ${u}`));
    }

    // Find any PDF links on the models page
    const pdfLinks = html.match(/https?:\/\/[^"'\s]+\.pdf[^"'\s]*/gi) || [];
    if (pdfLinks.length > 0) {
      console.log(`\nPDF links on models page:`);
      [...new Set(pdfLinks)].forEach(u => console.log(`  ${u}`));
    }

    // Check for spec sheet links
    const specLinks = html.match(/href=["']([^"']*spec[^"']*)["']/gi) || [];
    if (specLinks.length > 0) {
      console.log(`\nSpec sheet links:`);
      [...new Set(specLinks)].forEach(l => console.log(`  ${l}`));
    }
  }

  // 3. Check a specific model page on KGM
  console.log('\n=== Phase 3: KGM model page (Torres) ===');
  const modelPages = ['torres', 'musso', 'rexton', 'actyon', 'korando'];
  for (const model of modelPages) {
    const url = `https://kgm.com.au/${model}`;
    try {
      const res = await fetch(url, { headers: { ...HEADERS, Accept: 'text/html' }, redirect: 'follow' });
      console.log(`\n${model}: ${res.status} (final: ${res.url})`);
      if (res.ok) {
        const html = await res.text();

        // Find PDF links
        const pdfLinks = html.match(/https?:\/\/[^"'\s<>]+\.pdf[^"'\s<>]*/gi) || [];
        if (pdfLinks.length > 0) {
          console.log(`  PDFs: ${[...new Set(pdfLinks)].join(', ')}`);
        }

        // Find Payload media references
        const payloadRefs = html.match(/https?:\/\/payloadb\.therefinerydesign\.com[^"'\s<>]+/gi) || [];
        const pdfPayload = payloadRefs.filter(u => /\.pdf/i.test(u));
        if (pdfPayload.length > 0) {
          console.log(`  Payload PDFs: ${[...new Set(pdfPayload)].join(', ')}`);
        }

        // Look for spec sheet / brochure download buttons
        const specBtns = html.match(/<a[^>]*href=["']([^"']*(?:spec|brochure|download|pdf)[^"']*)["'][^>]*>/gi) || [];
        if (specBtns.length > 0) {
          console.log(`  Spec/download buttons:`);
          [...new Set(specBtns)].forEach(b => console.log(`    ${b.slice(0, 200)}`));
        }

        // Look for data attributes with PDF refs
        const dataAttrs = html.match(/data-[a-z-]+="[^"]*\.pdf[^"]*"/gi) || [];
        if (dataAttrs.length > 0) {
          console.log(`  Data attrs with PDF: ${dataAttrs.join(', ')}`);
        }

        // Check inline scripts for PDF URLs
        const scriptPdfs = html.match(/["'][^"']*\.pdf[^"']*["']/gi) || [];
        if (scriptPdfs.length > 0) {
          console.log(`  PDF refs in scripts/data: ${[...new Set(scriptPdfs)].slice(0, 5).join(', ')}`);
        }
      }
    } catch (e) {
      console.log(`${model}: Error: ${e.message}`);
    }
  }

  // 4. Try the KGM media with the correct Next.js/Vercel pattern
  console.log('\n=== Phase 4: Try alternate KGM media paths ===');
  const pdfName = 'KGM-Rexton-MY26-Specs-and-Features.pdf';
  const altUrls = [
    `https://kgm.com.au/_next/data/${pdfName}`,
    `https://kgm.com.au/downloads/${pdfName}`,
    `https://kgm.com.au/specs/${pdfName}`,
    `https://kgm.com.au/pdf/${pdfName}`,
    `https://kgm.com.au/assets/${pdfName}`,
    `https://kgm.com.au/static/${pdfName}`,
    // Payload CMS serves files at the URL stored in the media item
    // which is /api/media/file/FILENAME - but that's relative to the Payload server
    // The KGM site might proxy this
    `https://payloadb.therefinerydesign.com/api/media/file/${pdfName}`,
    // Maybe Payload needs auth or different endpoint
    `https://payloadb.therefinerydesign.com/media/file/${pdfName}`,
    `https://payloadb.therefinerydesign.com/${pdfName}`,
  ];

  for (const url of altUrls) {
    try {
      const res = await fetch(url, { method: 'HEAD', headers: HEADERS, redirect: 'follow' });
      const ct = res.headers.get('content-type') || '';
      const cl = res.headers.get('content-length') || '0';
      if (res.ok && (ct.includes('pdf') || parseInt(cl) > 50000)) {
        console.log(`FOUND: ${url} (${ct}, ${(parseInt(cl)/1024).toFixed(0)}KB)`);
      } else if (res.status !== 404) {
        console.log(`${url} → ${res.status} (${ct})`);
      }
    } catch (e) {
      // skip
    }
  }
}

main().catch(console.error);
