// Probe Suzuki AU - try the actual current website structure
// Suzuki AU seems to have restructured - /automobiles/ is now 404
// Try the new URL patterns and WordPress/WPEngine CDN
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

async function probeHtml(label, url) {
  console.log(`\n--- ${label} ---`);
  console.log(`URL: ${url}`);
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
    console.log(`Status: ${res.status}, Final: ${res.url}`);
    if (!res.ok) return null;
    return { html: await res.text(), finalUrl: res.url };
  } catch (e) {
    console.log(`Error: ${e.message}`);
    return null;
  }
}

async function main() {
  // Phase 1: Find the current Suzuki site structure
  console.log('=== PHASE 1: Suzuki AU current site structure ===');
  const sitePages = [
    'https://www.suzuki.com.au/',
    'https://www.suzuki.com.au/cars',
    'https://www.suzuki.com.au/models',
    'https://www.suzuki.com.au/vehicles',
    'https://www.suzuki.com.au/car',
    'https://www.suzuki.com.au/swift',
    'https://www.suzuki.com.au/vitara',
    'https://www.suzuki.com.au/jimny',
    'https://www.suzuki.com.au/grand-vitara',
    'https://www.suzuki.com.au/baleno',
    'https://www.suzuki.com.au/s-cross',
    'https://www.suzuki.com.au/ignis',
  ];

  let workingPages = [];
  for (const url of sitePages) {
    const result = await probeHtml('Site page', url);
    if (result) {
      const title = result.html.match(/<title[^>]*>([^<]+)<\/title>/i);
      console.log(`Title: ${title ? title[1].trim() : 'N/A'}`);

      // Check for PDF/brochure refs
      const pdfUrls = result.html.match(/https?:\/\/[^"'\s<>]+\.pdf[^"'\s<>]*/gi) || [];
      const brochureRefs = result.html.match(/brochure/gi) || [];
      if (pdfUrls.length > 0) {
        console.log(`PDF URLs (${pdfUrls.length}):`);
        [...new Set(pdfUrls)].forEach(u => console.log(`  ${u}`));
      }
      if (brochureRefs.length > 0) {
        console.log(`Brochure mentions: ${brochureRefs.length}`);
        const contexts = result.html.match(/.{0,80}brochure.{0,80}/gi) || [];
        contexts.slice(0, 3).forEach(c => console.log(`  ...${c.trim()}...`));
      }

      // Look for S3/CloudFront/CDN URLs
      const cdnUrls = result.html.match(/https?:\/\/[^"'\s<>]*(?:cloudfront\.net|s3\.amazonaws\.com|wp-content)[^"'\s<>]*/gi) || [];
      if (cdnUrls.length > 0) {
        const unique = [...new Set(cdnUrls)];
        console.log(`CDN URLs (${unique.length} unique):`);
        unique.slice(0, 10).forEach(u => console.log(`  ${u}`));
        // Look for PDF-specific CDN URLs
        const pdfCdn = unique.filter(u => /\.pdf/i.test(u));
        if (pdfCdn.length > 0) {
          console.log(`PDF CDN URLs:`);
          pdfCdn.forEach(u => console.log(`  ${u}`));
        }
      }

      // Look for download links
      const downloadLinks = result.html.match(/href=["']([^"']*(?:download|brochure|pdf)[^"']*)["']/gi) || [];
      if (downloadLinks.length > 0) {
        console.log(`Download links (${downloadLinks.length}):`);
        downloadLinks.slice(0, 10).forEach(l => console.log(`  ${l}`));
      }

      workingPages.push(url);
    }
  }

  // Phase 2: Dig into the working model pages
  console.log('\n=== PHASE 2: Deep model page analysis ===');
  for (const url of workingPages.slice(0, 3)) {
    const result = await probeHtml('Deep scan', url);
    if (!result) continue;

    const html = result.html;

    // Extract ALL href values
    const allHrefs = html.match(/href=["']([^"']+)["']/gi) || [];
    const relevantHrefs = allHrefs.filter(h => /pdf|brochure|download|spec|feature/i.test(h));
    if (relevantHrefs.length > 0) {
      console.log(`Relevant hrefs (${relevantHrefs.length}):`);
      relevantHrefs.forEach(h => console.log(`  ${h}`));
    }

    // Look for form actions (brochure request forms)
    const forms = html.match(/<form[^>]+>/gi) || [];
    if (forms.length > 0) {
      console.log(`Forms (${forms.length}):`);
      forms.forEach(f => console.log(`  ${f.slice(0, 200)}`));
    }

    // Look for Marketo/HubSpot forms
    const marketoForms = html.match(/mkto|marketo|hubspot|hbspt|pardot/gi) || [];
    if (marketoForms.length > 0) {
      console.log(`Marketing forms: ${[...new Set(marketoForms)].join(', ')}`);
    }

    // Look for JSON-LD or structured data
    const jsonLd = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    if (jsonLd.length > 0) {
      console.log(`JSON-LD blocks: ${jsonLd.length}`);
      jsonLd.forEach(block => {
        const content = block.match(/>([^<]+)</)?.[1] || '';
        if (/brochure|pdf|download/i.test(content)) {
          console.log(`  Has brochure refs: ${content.slice(0, 300)}`);
        }
      });
    }

    // Look for data attributes
    const dataDownload = html.match(/data-[a-z-]+="[^"]*(?:brochure|pdf|download)[^"]*"/gi) || [];
    if (dataDownload.length > 0) {
      console.log(`Data attrs with download/brochure:`);
      dataDownload.forEach(a => console.log(`  ${a}`));
    }

    // Look for inline scripts with brochure/PDF URLs
    const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const script of scripts) {
      if (/brochure|\.pdf/i.test(script)) {
        // Extract the relevant parts
        const pdfRefs = script.match(/["'][^"']*\.pdf[^"']*["']/gi) || [];
        const brochureRefs = script.match(/["'][^"']*brochure[^"']*["']/gi) || [];
        if (pdfRefs.length > 0 || brochureRefs.length > 0) {
          console.log(`Script with PDF/brochure refs:`);
          pdfRefs.forEach(r => console.log(`  PDF: ${r}`));
          brochureRefs.forEach(r => console.log(`  Brochure: ${r}`));
        }
      }
    }
  }

  // Phase 3: Check WordPress REST API (Suzuki AU uses WordPress)
  console.log('\n=== PHASE 3: WordPress REST API ===');
  const wpEndpoints = [
    'https://www.suzuki.com.au/wp-json/wp/v2/pages?per_page=100&search=brochure',
    'https://www.suzuki.com.au/wp-json/wp/v2/media?per_page=50&mime_type=application/pdf',
    'https://www.suzuki.com.au/wp-json/wp/v2/media?per_page=50&search=brochure',
    'https://www.suzuki.com.au/wp-json/wp/v2/posts?per_page=20&search=brochure',
    'https://www.suzuki.com.au/wp-json/',
  ];

  for (const url of wpEndpoints) {
    console.log(`\n--- WP API: ${url.split('?')[0].split('/').pop()} ---`);
    try {
      const res = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json' } });
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          console.log(`Results: ${data.length}`);
          data.forEach(item => {
            if (item.source_url) {
              console.log(`  Media: ${item.title?.rendered || item.slug} → ${item.source_url}`);
            } else if (item.link) {
              console.log(`  Page: ${item.title?.rendered || item.slug} → ${item.link}`);
            }
          });
        } else if (data.name) {
          console.log(`WP Site: ${data.name}`);
          console.log(`Routes: ${Object.keys(data.routes || {}).slice(0, 10).join(', ')}`);
        }
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }

  // Phase 4: Try WordPress uploads path directly
  console.log('\n=== PHASE 4: WP uploads directory ===');
  const wpPdfPatterns = [
    'https://www.suzuki.com.au/wp-content/uploads/2025/',
    'https://www.suzuki.com.au/wp-content/uploads/2026/',
    'https://www.suzuki.com.au/wp-content/uploads/brochures/',
    'https://www.suzuki.com.au/wp-content/uploads/pdf/',
  ];
  for (const url of wpPdfPatterns) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      console.log(`${url} → ${res.status}`);
      if (res.ok) {
        const html = await res.text();
        const pdfLinks = html.match(/href="([^"]*\.pdf)"/gi) || [];
        if (pdfLinks.length > 0) {
          console.log(`  PDF files:`);
          pdfLinks.forEach(l => console.log(`    ${l}`));
        }
      }
    } catch (e) {
      console.log(`${url} → Error`);
    }
  }
}

main().catch(console.error);
