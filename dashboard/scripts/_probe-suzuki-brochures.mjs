// Probe Suzuki AU for brochure PDF sources
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

async function probeUrl(label, url, expectJson = false) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`PROBE: ${label}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(80));
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Content-Type: ${res.headers.get('content-type')}`);
    console.log(`Final URL: ${res.url}`);
    if (!res.ok) {
      const text = await res.text();
      console.log(`Body (first 300): ${text.slice(0, 300)}`);
      return null;
    }
    if (expectJson) {
      const data = await res.json();
      return { type: 'json', data };
    }
    const text = await res.text();
    return { type: 'html', data: text };
  } catch (e) {
    console.log(`Error: ${e.message}`);
    return null;
  }
}

function extractPdfUrls(html) {
  const pdfMatches = html.match(/https?:\/\/[^"'\s<>]+\.pdf[^"'\s<>]*/gi) || [];
  return [...new Set(pdfMatches)];
}

function extractBrochureRefs(html) {
  const matches = html.match(/brochure[^"'\s<>]{0,300}/gi) || [];
  return [...new Set(matches)];
}

function extractDownloadLinks(html) {
  // Look for download-related anchors and links
  const downloadMatches = html.match(/<a[^>]*href=["']([^"']*(?:download|brochure|pdf)[^"']*)["'][^>]*>/gi) || [];
  return [...new Set(downloadMatches)];
}

async function main() {
  // 1. Suzuki brochure pages
  console.log('### PHASE 1: Suzuki AU website pages ###');
  const pages = [
    'https://www.suzuki.com.au/automobiles/brochures',
    'https://www.suzuki.com.au/automobiles/downloads',
    'https://www.suzuki.com.au/brochures',
    'https://www.suzuki.com.au/downloads',
    'https://www.suzuki.com.au/automobiles',
    'https://www.suzuki.com.au/automobiles/swift',
    'https://www.suzuki.com.au/automobiles/vitara',
    'https://www.suzuki.com.au/automobiles/jimny',
  ];

  for (const url of pages) {
    const result = await probeUrl('Page scan', url);
    if (result && result.type === 'html') {
      const pdfs = extractPdfUrls(result.data);
      const brochureRefs = extractBrochureRefs(result.data);
      const downloadLinks = extractDownloadLinks(result.data);

      if (pdfs.length > 0) {
        console.log(`\nPDF URLs (${pdfs.length}):`);
        pdfs.forEach(u => console.log(`  ${u}`));
      }
      if (brochureRefs.length > 0) {
        console.log(`\nBrochure refs (${brochureRefs.length}):`);
        brochureRefs.slice(0, 15).forEach(r => console.log(`  ${r.slice(0, 200)}`));
      }
      if (downloadLinks.length > 0) {
        console.log(`\nDownload links (${downloadLinks.length}):`);
        downloadLinks.slice(0, 15).forEach(l => console.log(`  ${l.slice(0, 200)}`));
      }

      // Look for form-gated brochure pattern
      const formMatches = result.data.match(/form[^"']{0,50}brochure|brochure[^"']{0,50}form/gi) || [];
      if (formMatches.length > 0) {
        console.log(`\nForm-gated brochure pattern:`);
        formMatches.slice(0, 5).forEach(m => console.log(`  ${m}`));
      }

      // Look for S3/CloudFront patterns
      const s3Matches = result.data.match(/https?:\/\/[^"'\s]*(?:s3\.amazonaws\.com|cloudfront\.net|suz-au)[^"'\s]*/gi) || [];
      if (s3Matches.length > 0) {
        console.log(`\nS3/CloudFront URLs (${s3Matches.length}):`);
        [...new Set(s3Matches)].slice(0, 20).forEach(u => console.log(`  ${u}`));
      }

      // Look for any data-* attributes with PDF/brochure
      const dataAttrs = result.data.match(/data-[a-z-]+="[^"]*(?:brochure|pdf|download)[^"]*"/gi) || [];
      if (dataAttrs.length > 0) {
        console.log(`\nData attributes:`);
        dataAttrs.slice(0, 10).forEach(a => console.log(`  ${a}`));
      }

      // Look for Next.js/React hydration data
      const scriptData = result.data.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (scriptData) {
        console.log('\nNext.js data found!');
        try {
          const nextData = JSON.parse(scriptData[1]);
          const json = JSON.stringify(nextData);
          const pdfInData = json.match(/[^"]*\.pdf[^"]*/gi) || [];
          const brochureInData = json.match(/brochure[^"]{0,100}/gi) || [];
          if (pdfInData.length > 0) {
            console.log(`PDFs in Next data: ${[...new Set(pdfInData)].join(', ')}`);
          }
          if (brochureInData.length > 0) {
            console.log(`Brochure refs in Next data: ${[...new Set(brochureInData)].join(', ')}`);
          }
        } catch (e) {
          console.log(`Parse error: ${e.message}`);
        }
      }

      // Look for wp-content patterns (WordPress)
      const wpMatches = result.data.match(/https?:\/\/[^"'\s]*wp-content[^"'\s]*\.pdf[^"'\s]*/gi) || [];
      if (wpMatches.length > 0) {
        console.log(`\nWordPress PDF URLs:`);
        wpMatches.forEach(u => console.log(`  ${u}`));
      }
    }
  }

  // 2. Try known CDN patterns
  console.log('\n### PHASE 2: CDN pattern probing ###');
  const cdnPatterns = [
    'https://suz-au-resources.s3.amazonaws.com/',
    'https://d1a3f4spazzrp4.cloudfront.net/',
    'https://d1a3f4spazzrp4.cloudfront.net/brochures/',
    'https://d1a3f4spazzrp4.cloudfront.net/pdf/',
    'https://d1a3f4spazzrp4.cloudfront.net/automobiles/',
    'https://suz-au-resources.s3.amazonaws.com/brochures/',
    'https://suz-au-resources.s3.amazonaws.com/pdf/',
  ];
  for (const url of cdnPatterns) {
    const result = await probeUrl('CDN probe', url);
    if (result) {
      if (result.type === 'html') {
        // S3 bucket listing?
        const keys = result.data.match(/<Key>([^<]*\.pdf)<\/Key>/gi) || [];
        if (keys.length > 0) {
          console.log(`S3 PDF keys (${keys.length}):`);
          keys.slice(0, 20).forEach(k => console.log(`  ${k}`));
        }
        // Any PDF references
        const pdfs = extractPdfUrls(result.data);
        if (pdfs.length > 0) {
          console.log(`PDF refs: ${pdfs.slice(0, 10).join(', ')}`);
        }
      }
    }
  }

  // 3. Try guessing brochure URLs based on model names
  console.log('\n### PHASE 3: Guessing brochure URLs ###');
  const models = ['swift', 'vitara', 'jimny', 'baleno', 's-cross', 'ignis', 'grand-vitara'];
  const urlPatterns = [
    (m) => `https://d1a3f4spazzrp4.cloudfront.net/brochures/suzuki-${m}-brochure.pdf`,
    (m) => `https://d1a3f4spazzrp4.cloudfront.net/pdf/${m}-brochure.pdf`,
    (m) => `https://d1a3f4spazzrp4.cloudfront.net/${m}/${m}-brochure.pdf`,
    (m) => `https://suz-au-resources.s3.amazonaws.com/brochures/${m}.pdf`,
    (m) => `https://suz-au-resources.s3.amazonaws.com/${m}-brochure.pdf`,
    (m) => `https://www.suzuki.com.au/content/dam/suzuki/au/brochures/${m}.pdf`,
    (m) => `https://www.suzuki.com.au/assets/brochures/${m}.pdf`,
    (m) => `https://www.suzuki.com.au/automobiles/${m}/brochure.pdf`,
  ];

  for (const model of models) {
    for (const patternFn of urlPatterns) {
      const url = patternFn(model);
      try {
        const res = await fetch(url, { method: 'HEAD', headers: HEADERS, redirect: 'follow' });
        const ct = res.headers.get('content-type') || '';
        const cl = res.headers.get('content-length') || '0';
        if (res.ok && (ct.includes('pdf') || ct.includes('octet-stream') || parseInt(cl) > 100000)) {
          console.log(`FOUND: ${url} (${res.status}, ${ct}, ${(parseInt(cl)/1024/1024).toFixed(1)}MB)`);
        } else if (res.status === 403) {
          // 403 might mean the file exists but access is restricted
          console.log(`RESTRICTED (403): ${url} (${ct})`);
        }
        // Skip logging 404s to reduce noise
      } catch (e) {
        // Skip errors
      }
    }
  }

  // 4. Check specific model pages more deeply for brochure form/links
  console.log('\n### PHASE 4: Model page deep scan ###');
  const modelPages = [
    'https://www.suzuki.com.au/automobiles/swift',
    'https://www.suzuki.com.au/automobiles/vitara',
    'https://www.suzuki.com.au/automobiles/jimny',
  ];
  for (const url of modelPages) {
    const result = await probeUrl('Deep model scan', url);
    if (result && result.type === 'html') {
      // Look for API endpoints referenced in JavaScript
      const apiEndpoints = result.data.match(/["'](\/api\/[^"']+|https?:\/\/[^"']*api[^"']*brochure[^"']*)["']/gi) || [];
      if (apiEndpoints.length > 0) {
        console.log(`\nAPI endpoints in JS:`);
        apiEndpoints.slice(0, 10).forEach(e => console.log(`  ${e}`));
      }

      // Look for form action URLs
      const formActions = result.data.match(/<form[^>]*action=["']([^"']+)["'][^>]*>/gi) || [];
      if (formActions.length > 0) {
        console.log(`\nForm actions:`);
        formActions.slice(0, 5).forEach(f => console.log(`  ${f}`));
      }

      // Check for brochure modal/popup patterns
      const modalPatterns = result.data.match(/(?:modal|popup|dialog)[^"']{0,50}brochure|brochure[^"']{0,50}(?:modal|popup|dialog)/gi) || [];
      if (modalPatterns.length > 0) {
        console.log(`\nModal/popup brochure pattern:`);
        modalPatterns.forEach(m => console.log(`  ${m}`));
      }

      // Check for HubSpot or form service integration
      const formServices = result.data.match(/hubspot|marketo|pardot|typeform|jotform|wufoo|formstack/gi) || [];
      if (formServices.length > 0) {
        console.log(`\nForm services: ${[...new Set(formServices)].join(', ')}`);
      }

      // Check for any hidden/embedded PDF links
      const allLinks = result.data.match(/href=["']([^"']+)["']/gi) || [];
      const pdfLinks = allLinks.filter(l => /\.pdf|brochure|download/i.test(l));
      if (pdfLinks.length > 0) {
        console.log(`\nRelevant links (${pdfLinks.length}):`);
        pdfLinks.slice(0, 20).forEach(l => console.log(`  ${l}`));
      }
    }
  }
}

main().catch(console.error);
