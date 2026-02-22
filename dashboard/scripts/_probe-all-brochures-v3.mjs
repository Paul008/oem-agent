// Final probe: targeted follow-ups based on previous findings
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

async function main() {
  // =============================================
  // KGM: Try the correct Payload CMS media URL
  // The /api/media/file/ path returned 404, try the actual static URL
  // =============================================
  console.log('=== KGM: Find correct PDF serving URL ===');

  // First, get the full media item details for a PDF
  const kgmHeaders = {
    'Accept': 'application/json',
    'Origin': 'https://kgm.com.au',
    'Referer': 'https://kgm.com.au/',
    'User-Agent': HEADERS['User-Agent']
  };

  // Get a specific PDF media item with all fields
  const mediaRes = await fetch(
    'https://payloadb.therefinerydesign.com/api/media?where[filename][contains]=Specs&limit=2&depth=0',
    { headers: kgmHeaders }
  );
  const mediaData = await mediaRes.json();
  if (mediaData.docs && mediaData.docs[0]) {
    console.log('Full PDF media item:');
    console.log(JSON.stringify(mediaData.docs[0], null, 2));

    // Try various URL constructions
    const doc = mediaData.docs[0];
    const urls = [
      `https://payloadb.therefinerydesign.com${doc.url}`,
      `https://payloadb.therefinerydesign.com/media/${doc.filename}`,
      `https://kgm.com.au${doc.url}`,
      `https://kgm.com.au/media/${doc.filename}`,
      `https://kgm.com.au/api/media/file/${doc.filename}`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, { method: 'HEAD', headers: kgmHeaders, redirect: 'follow' });
        const ct = res.headers.get('content-type') || '';
        const cl = res.headers.get('content-length') || '0';
        console.log(`\n${url}`);
        console.log(`  Status: ${res.status}, Type: ${ct}, Size: ${(parseInt(cl)/1024).toFixed(0)}KB`);
        if (res.url !== url) console.log(`  Redirected to: ${res.url}`);
      } catch (e) {
        console.log(`${url} → Error: ${e.message}`);
      }
    }
  }

  // Also check if the KGM models have a spec_sheet field that links to these PDFs
  console.log('\n\n=== KGM: Check model grades for spec sheet links ===');
  const gradesRes = await fetch(
    'https://payloadb.therefinerydesign.com/api/grades?limit=5&depth=2',
    { headers: kgmHeaders }
  );
  if (gradesRes.ok) {
    const gradesData = await gradesRes.json();
    console.log(`Grades: ${gradesData.totalDocs} total`);
    if (gradesData.docs[0]) {
      console.log(`Grade keys: ${JSON.stringify(Object.keys(gradesData.docs[0]))}`);
      const json = JSON.stringify(gradesData.docs[0]);
      const pdfRefs = json.match(/[^"]*\.pdf[^"]*/gi) || [];
      if (pdfRefs.length > 0) console.log(`PDF refs: ${pdfRefs.join(', ')}`);
    }
  } else {
    console.log(`Grades endpoint: ${gradesRes.status}`);
  }

  // =============================================
  // SUZUKI: Probe brochure-request page (Marketo form-gated)
  // =============================================
  console.log('\n\n=== SUZUKI: Brochure request page ===');
  const suzRes = await fetch('https://www.suzuki.com.au/brochure-request/', { headers: HEADERS });
  console.log(`Status: ${suzRes.status}`);
  if (suzRes.ok) {
    const html = await suzRes.text();
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    console.log(`Title: ${title ? title[1].trim() : 'N/A'}`);

    // Look for Marketo form IDs
    const marketoForms = html.match(/mktoForm[_\d]+|MktoForms2|loadForm[^)]+\)/gi) || [];
    console.log(`Marketo forms: ${[...new Set(marketoForms)].join(', ')}`);

    // Look for any PDF URLs or download patterns
    const pdfUrls = html.match(/https?:\/\/[^"'\s<>]+\.pdf[^"'\s<>]*/gi) || [];
    if (pdfUrls.length > 0) {
      console.log(`PDF URLs: ${[...new Set(pdfUrls)].join('\n  ')}`);
    }

    // Look for model selection dropdown or list
    const modelOptions = html.match(/option[^>]*value=["']([^"']+)["'][^>]*>([^<]+)/gi) || [];
    if (modelOptions.length > 0) {
      console.log(`Model options (${modelOptions.length}):`);
      modelOptions.slice(0, 15).forEach(o => console.log(`  ${o.slice(0, 100)}`));
    }

    // Look for brochure data attributes or JS vars
    const brochureData = html.match(/brochure[^"']{0,200}/gi) || [];
    if (brochureData.length > 0) {
      console.log(`Brochure data refs (${brochureData.length}):`);
      [...new Set(brochureData)].slice(0, 10).forEach(d => console.log(`  ${d.slice(0, 150)}`));
    }

    // Look for CDN or upload URLs
    const uploadUrls = html.match(/https?:\/\/[^"'\s<>]*(?:uploads|cdn|assets|static)[^"'\s<>]*/gi) || [];
    if (uploadUrls.length > 0) {
      console.log(`CDN/upload URLs:`);
      [...new Set(uploadUrls)].slice(0, 15).forEach(u => console.log(`  ${u}`));
    }

    // Check for API calls in scripts
    const apiCalls = html.match(/fetch\(["'][^"']+["']\)|axios\.[a-z]+\(["'][^"']+["']\)|["'](\/api\/[^"']+)["']/gi) || [];
    if (apiCalls.length > 0) {
      console.log(`API calls in scripts:`);
      apiCalls.slice(0, 10).forEach(a => console.log(`  ${a}`));
    }

    // Look for Marketo callback that might reveal PDF URL pattern
    const callbacks = html.match(/(?:callback|success|onSuccess|thankYou|redirect)[^}]{0,300}/gi) || [];
    const brochureCallbacks = callbacks.filter(c => /brochure|pdf|download/i.test(c));
    if (brochureCallbacks.length > 0) {
      console.log(`Brochure-related callbacks:`);
      brochureCallbacks.slice(0, 5).forEach(c => console.log(`  ${c.slice(0, 200)}`));
    }
  }

  // Try the Suzuki vehicle detail pages with correct URL structure
  console.log('\n=== SUZUKI: Vehicle detail pages ===');
  const suzModels = [
    'https://www.suzuki.com.au/vehicles/swift/',
    'https://www.suzuki.com.au/vehicles/vitara/',
    'https://www.suzuki.com.au/vehicles/jimny/',
    'https://www.suzuki.com.au/vehicles/grand-vitara/',
    'https://www.suzuki.com.au/vehicles/baleno/',
    'https://www.suzuki.com.au/vehicles/s-cross/',
    'https://www.suzuki.com.au/vehicles/ignis/',
  ];
  for (const url of suzModels) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      console.log(`\n${url} → ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        console.log(`Title: ${title ? title[1].trim() : 'N/A'}`);

        // Look for brochure/PDF refs
        const pdfUrls = html.match(/https?:\/\/[^"'\s<>]+\.pdf[^"'\s<>]*/gi) || [];
        const brochureLinks = html.match(/href=["']([^"']*brochure[^"']*)["']/gi) || [];
        if (pdfUrls.length > 0) console.log(`PDFs: ${[...new Set(pdfUrls)].join(', ')}`);
        if (brochureLinks.length > 0) console.log(`Brochure links: ${[...new Set(brochureLinks)].join(', ')}`);

        // Check for CloudFront URLs
        const cfUrls = html.match(/https?:\/\/[^"'\s<>]*cloudfront\.net[^"'\s<>]*/gi) || [];
        if (cfUrls.length > 0) {
          const pdfCf = cfUrls.filter(u => /\.pdf/i.test(u));
          if (pdfCf.length > 0) console.log(`CloudFront PDFs: ${pdfCf.join(', ')}`);
        }
      }
    } catch (e) {
      console.log(`${url} → Error: ${e.message}`);
    }
  }

  // =============================================
  // HYUNDAI: Try the actual working API path
  // From memory: "Content API v3 (no auth), 15 models, 526 accessories"
  // The API might use different URL patterns now
  // =============================================
  console.log('\n\n=== HYUNDAI: Deep API discovery ===');

  // First, fetch the main page and find API patterns
  const hyRes = await fetch('https://www.hyundai.com/au/en.html', { headers: HEADERS, redirect: 'follow' });
  console.log(`Hyundai main page: ${hyRes.status}, URL: ${hyRes.url}`);
  if (hyRes.ok) {
    const html = await hyRes.text();
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    console.log(`Title: ${title ? title[1].trim() : 'N/A'}`);

    // Extract API URLs from the page
    const apiUrls = html.match(/["']((?:https?:)?\/\/[^"']*api[^"']*|\/au\/api[^"']*)["']/gi) || [];
    if (apiUrls.length > 0) {
      console.log(`API URLs found (${apiUrls.length}):`);
      [...new Set(apiUrls)].slice(0, 20).forEach(u => console.log(`  ${u}`));
    }

    // Look for content/dam paths (AEM)
    const damPaths = html.match(/\/content\/dam\/[^"'\s]+/gi) || [];
    if (damPaths.length > 0) {
      console.log(`DAM paths (${damPaths.length}):`);
      const pdfDam = damPaths.filter(p => /\.pdf/i.test(p));
      [...new Set(pdfDam)].forEach(p => console.log(`  PDF: ${p}`));
      const uniqueDam = [...new Set(damPaths.map(p => p.split('/').slice(0, 6).join('/')))];
      console.log(`DAM base paths: ${uniqueDam.join(', ')}`);
    }

    // Check for brochure mentions
    const brochureRefs = html.match(/.{0,50}brochure.{0,50}/gi) || [];
    if (brochureRefs.length > 0) {
      console.log(`Brochure contexts:`);
      [...new Set(brochureRefs)].slice(0, 5).forEach(r => console.log(`  ${r.trim()}`));
    }
  }

  // Try the Hyundai model pages with .html suffix (AEM pattern)
  console.log('\n=== HYUNDAI: AEM page patterns ===');
  const hyPages = [
    'https://www.hyundai.com/au/en/find-a-car.html',
    'https://www.hyundai.com/au/en/find-a-car/tucson.html',
    'https://www.hyundai.com/au/en/find-a-car/tucson/highlights.html',
    'https://www.hyundai.com/au/en/find-a-car/tucson/specifications.html',
    'https://www.hyundai.com/au/en/find-a-car/tucson/download-a-brochure.html',
    'https://www.hyundai.com/au/en/find-a-car/i30.html',
    'https://www.hyundai.com/au/en/find-a-car/ioniq-5.html',
  ];
  for (const url of hyPages) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      console.log(`\n${url} → ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        console.log(`Title: ${title ? title[1].trim() : 'N/A'}`);

        const pdfUrls = html.match(/https?:\/\/[^"'\s<>]+\.pdf[^"'\s<>]*/gi) || [];
        if (pdfUrls.length > 0) {
          console.log(`PDF URLs:`);
          [...new Set(pdfUrls)].forEach(u => console.log(`  ${u}`));
        }

        const damPaths = html.match(/\/content\/dam\/[^"'\s]+\.pdf/gi) || [];
        if (damPaths.length > 0) {
          console.log(`DAM PDF paths:`);
          [...new Set(damPaths)].forEach(p => console.log(`  ${p}`));
        }

        const brochureRefs = html.match(/.{0,80}brochure.{0,80}/gi) || [];
        if (brochureRefs.length > 0) {
          console.log(`Brochure refs (${brochureRefs.length}):`);
          [...new Set(brochureRefs)].slice(0, 5).forEach(r => console.log(`  ${r.trim()}`));
        }

        // Check for API endpoints in the page
        const apiEndpoints = html.match(/["'](\/au\/api\/[^"']+)["']/gi) || [];
        if (apiEndpoints.length > 0) {
          console.log(`API endpoints: ${[...new Set(apiEndpoints)].slice(0, 10).join(', ')}`);
        }
      }
    } catch (e) {
      console.log(`${url} → Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
