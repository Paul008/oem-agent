// Probe Hyundai AU - try different API patterns and the actual model page HTML
const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

async function probeJson(label, url) {
  console.log(`\n--- ${label} ---`);
  console.log(`URL: ${url}`);
  try {
    const res = await fetch(url, { headers: HEADERS });
    console.log(`Status: ${res.status}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (e) {
    console.log(`Error: ${e.message}`);
    return null;
  }
}

async function probeHtml(label, url) {
  console.log(`\n--- ${label} ---`);
  console.log(`URL: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': HEADERS['User-Agent'] },
      redirect: 'follow'
    });
    console.log(`Status: ${res.status}, Final: ${res.url}`);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    console.log(`Error: ${e.message}`);
    return null;
  }
}

function findPdfRefs(obj, path = '', depth = 0) {
  if (depth > 10 || !obj) return [];
  const results = [];
  if (typeof obj === 'string') {
    if (obj.endsWith('.pdf') || /brochure|download.*pdf/i.test(obj)) {
      results.push({ path, value: obj });
    }
    return results;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => results.push(...findPdfRefs(item, `${path}[${i}]`, depth + 1)));
    return results;
  }
  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      results.push(...findPdfRefs(val, `${path}.${key}`, depth + 1));
    }
  }
  return results;
}

async function main() {
  // Phase 1: Try the correct Hyundai Content API v3 patterns
  // The known working endpoint from memory is /au/api/v3/content/models
  // But that's 404 - maybe the API was updated. Let's try other patterns.
  console.log('=== PHASE 1: API Endpoint Discovery ===');

  const apiPatterns = [
    // v3 content variations
    'https://www.hyundai.com/au/api/content/models',
    'https://www.hyundai.com/au/api/v2/content/models',
    'https://www.hyundai.com/au/api/v1/content/models',
    // GNB/navigation APIs (common in Hyundai sites)
    'https://www.hyundai.com/au/api/v3/gnb',
    'https://www.hyundai.com/au/api/v3/gnb/models',
    'https://www.hyundai.com/au/api/v3/navigation',
    // Vehicle-specific APIs
    'https://www.hyundai.com/au/api/v3/vehicle/list',
    'https://www.hyundai.com/au/api/v3/vehicles',
    'https://www.hyundai.com/au/api/v3/find-a-car',
    // DXP / Headless CMS patterns
    'https://www.hyundai.com/au/api/v3/dxp/models',
    'https://www.hyundai.com/au/api/v3/cms/models',
    // GraphQL (some Hyundai markets use it)
    'https://www.hyundai.com/au/graphql',
    // SSR/hydration data
    'https://www.hyundai.com/au/en/find-a-car.json',
    'https://www.hyundai.com/au/en/find-a-car/_data.json',
  ];

  for (const url of apiPatterns) {
    const data = await probeJson('API probe', url);
    if (data) {
      console.log(`FOUND! Keys: ${JSON.stringify(Object.keys(data)).slice(0, 300)}`);
      const pdfRefs = findPdfRefs(data);
      if (pdfRefs.length > 0) {
        console.log(`PDF refs: ${JSON.stringify(pdfRefs).slice(0, 500)}`);
      }
      console.log(`Sample: ${JSON.stringify(data).slice(0, 500)}`);
    }
  }

  // Phase 2: Try model-specific pages and look for embedded JSON/API calls
  console.log('\n=== PHASE 2: Model page HTML scan ===');
  const modelPages = [
    'https://www.hyundai.com/au/en/find-a-car/tucson',
    'https://www.hyundai.com/au/en/find-a-car/i30',
    'https://www.hyundai.com/au/en/cars/tucson',
    'https://www.hyundai.com/au/en/cars/i30',
    'https://www.hyundai.com/au/en/models/tucson',
    'https://www.hyundai.com/au/en/suv/tucson',
    'https://www.hyundai.com/au/en/electric/ioniq-5',
  ];

  for (const url of modelPages) {
    const html = await probeHtml('Model page', url);
    if (html) {
      // Look for PDF links
      const pdfUrls = html.match(/https?:\/\/[^"'\s]+\.pdf[^"'\s]*/gi) || [];
      if (pdfUrls.length > 0) {
        console.log(`PDF URLs (${pdfUrls.length}): ${[...new Set(pdfUrls)].join('\n  ')}`);
      }

      // Look for brochure references
      const brochureRefs = html.match(/brochure/gi) || [];
      if (brochureRefs.length > 0) {
        console.log(`Brochure mentions: ${brochureRefs.length}`);
        // Get context around brochure mentions
        const contexts = html.match(/.{0,100}brochure.{0,100}/gi) || [];
        contexts.slice(0, 5).forEach(c => console.log(`  Context: ...${c.trim()}...`));
      }

      // Look for API URLs in the page
      const apiUrls = html.match(/["'](\/au\/api\/[^"']+)["']/gi) || [];
      if (apiUrls.length > 0) {
        console.log(`API URLs in page (${apiUrls.length}):`);
        [...new Set(apiUrls)].slice(0, 15).forEach(u => console.log(`  ${u}`));
      }

      // Look for __NEXT_DATA__ or similar hydration
      const nextData = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextData) {
        console.log('Found __NEXT_DATA__!');
        try {
          const parsed = JSON.parse(nextData[1]);
          const pdfRefs = findPdfRefs(parsed);
          if (pdfRefs.length > 0) console.log(`PDF refs in Next data: ${JSON.stringify(pdfRefs)}`);
        } catch (e) {
          console.log(`Parse error: ${e.message}`);
        }
      }

      // Look for window.__data or similar embedded JSON
      const windowData = html.match(/window\.__[A-Z_]+__\s*=\s*(\{[\s\S]*?\});/gi) || [];
      if (windowData.length > 0) {
        console.log(`Found ${windowData.length} window data blocks`);
        windowData.forEach(w => {
          const pdfMatch = w.match(/\.pdf/gi);
          const brochMatch = w.match(/brochure/gi);
          if (pdfMatch || brochMatch) {
            console.log(`  Has PDF/brochure refs: pdf=${pdfMatch?.length || 0}, brochure=${brochMatch?.length || 0}`);
          }
        });
      }

      // Show a snippet of page title
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (title) console.log(`Page title: ${title[1].trim()}`);

      break; // Found a working page, that's enough for pattern discovery
    }
  }

  // Phase 3: Try direct PDF URL patterns
  console.log('\n=== PHASE 3: Direct PDF URL guessing ===');
  const pdfPatterns = [
    'https://www.hyundai.com/content/dam/hyundai/au/en/models/tucson/brochure/Hyundai_Tucson_Brochure.pdf',
    'https://www.hyundai.com/content/dam/hyundai/au/en/data/brochure/tucson.pdf',
    'https://www.hyundai.com/au/en/-/media/au/models/tucson/brochure.pdf',
    'https://www.hyundai.com/content/dam/hyundai/au/en/data/vehicle-pdf/tucson-brochure.pdf',
    'https://www.hyundai.com/content/dam/hyundai/au/en/find-a-car/tucson/pdf/tucson-brochure.pdf',
    'https://www.hyundai.com/content/dam/hyundai/au/brochure/tucson.pdf',
    'https://www.hyundai.com/au/content/dam/hyundai/au/en/data/brochure/Tucson.pdf',
  ];

  for (const url of pdfPatterns) {
    try {
      const res = await fetch(url, { method: 'HEAD', headers: HEADERS, redirect: 'follow' });
      const ct = res.headers.get('content-type') || '';
      const cl = res.headers.get('content-length') || '0';
      if (res.ok) {
        console.log(`FOUND: ${url} (${ct}, ${(parseInt(cl)/1024/1024).toFixed(1)}MB)`);
      } else if (res.status === 301 || res.status === 302) {
        console.log(`REDIRECT ${res.status}: ${url} -> ${res.headers.get('location')}`);
      }
      // Don't log 404s
    } catch (e) {
      // skip
    }
  }

  // Phase 4: Check the Hyundai CDN / AEM dam patterns
  console.log('\n=== PHASE 4: AEM DAM content paths ===');
  const damPaths = [
    'https://www.hyundai.com/content/dam/hyundai/au/',
    'https://www.hyundai.com/content/dam/hyundai/au/en/data/',
    'https://www.hyundai.com/content/dam/hyundai/au/en/data/brochure/',
    'https://www.hyundai.com/content/dam/hyundai/au/en/data/vehicle-pdf/',
  ];
  for (const url of damPaths) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      console.log(`${url} → ${res.status} (${res.headers.get('content-type')})`);
      if (res.ok) {
        const text = await res.text();
        const pdfRefs = text.match(/[^"'\s]+\.pdf/gi) || [];
        if (pdfRefs.length > 0) {
          console.log(`  PDF refs: ${[...new Set(pdfRefs)].slice(0, 20).join(', ')}`);
        }
      }
    } catch (e) {
      console.log(`${url} → Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
