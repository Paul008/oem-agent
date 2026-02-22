#!/usr/bin/env node
/**
 * Probe ALL OEM websites for color data in model pages.
 * For each OEM, fetch one representative model page and extract color information.
 */

const probes = [
  {
    oem: 'hyundai-au',
    name: 'Hyundai Tucson',
    url: 'https://www.hyundai.com/au/en/cars/suvs/tucson',
    patterns: ['color', 'colour', 'paint', 'swatch', 'exterior', 'variant-id', 'variantId', 'model-series'],
  },
  {
    oem: 'hyundai-au',
    name: 'Hyundai Kona',
    url: 'https://www.hyundai.com/au/en/cars/suvs/kona',
    patterns: ['color', 'colour', 'paint', 'swatch', 'exterior'],
  },
  {
    oem: 'ford-au',
    name: 'Ford Ranger',
    url: 'https://www.ford.com.au/showroom/ranger/',
    patterns: ['color', 'colour', 'paint', 'swatch', 'GPAS', 'gpas', 'exterior'],
  },
  {
    oem: 'gwm-au',
    name: 'GWM Ute',
    url: 'https://www.gwm.com.au/models/ute/',
    patterns: ['color', 'colour', 'paint', 'swatch', 'exterior'],
  },
  {
    oem: 'gwm-au',
    name: 'GWM Haval H6',
    url: 'https://www.gwm.com.au/models/haval-h6/',
    patterns: ['color', 'colour', 'paint', 'swatch', 'exterior'],
  },
  {
    oem: 'suzuki-au',
    name: 'Suzuki Vitara',
    url: 'https://www.suzuki.com.au/automobiles/vitara',
    patterns: ['color', 'colour', 'paint', 'swatch', 'exterior'],
  },
  {
    oem: 'suzuki-au',
    name: 'Suzuki Swift',
    url: 'https://www.suzuki.com.au/automobiles/swift',
    patterns: ['color', 'colour', 'paint', 'swatch', 'exterior'],
  },
  {
    oem: 'mazda-au',
    name: 'Mazda CX-5',
    url: 'https://www.mazda.com.au/models/mazda-cx-5/',
    patterns: ['color', 'colour', 'paint', 'swatch', 'exterior', '__NEXT_DATA__', 'Koala'],
  },
  {
    oem: 'nissan-au',
    name: 'Nissan X-Trail',
    url: 'https://www.nissan.com.au/vehicles/browse-range/x-trail.html',
    patterns: ['color', 'colour', 'paint', 'swatch', 'exterior', 'variant'],
  },
  {
    oem: 'ldv-au',
    name: 'LDV T60',
    url: 'https://www.ldvautomotive.com.au/models/t60/',
    patterns: ['color', 'colour', 'paint', 'swatch', 'exterior'],
  },
  {
    oem: 'toyota-au',
    name: 'Toyota RAV4',
    url: 'https://www.toyota.com.au/rav4',
    patterns: ['color', 'colour', 'paint', 'swatch', 'configurator'],
  },
];

for (const probe of probes) {
  console.log(`\n========== ${probe.name} (${probe.oem}) ==========`);
  console.log(`URL: ${probe.url}`);

  try {
    const r = await fetch(probe.url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });

    if (!r.ok) {
      console.log(`  ❌ Status: ${r.status}`);
      continue;
    }

    const html = await r.text();
    console.log(`  ✅ ${(html.length/1024).toFixed(0)}KB loaded`);

    // Count pattern occurrences
    for (const pat of probe.patterns) {
      const regex = new RegExp(pat, 'gi');
      const matches = html.match(regex) || [];
      if (matches.length > 0) {
        console.log(`  ${pat}: ${matches.length} occurrences`);
      }
    }

    // Look for JSON/script data with color info
    const scriptMatches = html.match(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    if (scriptMatches.length) {
      console.log(`  JSON scripts: ${scriptMatches.length}`);
      for (const sm of scriptMatches.slice(0, 2)) {
        const content = sm.replace(/<\/?script[^>]*>/gi, '').trim();
        if (content.toLowerCase().includes('color') || content.toLowerCase().includes('colour') || content.toLowerCase().includes('paint')) {
          console.log(`  ** Color data in JSON-LD! Preview: ${content.substring(0, 200)}`);
        }
      }
    }

    // Look for inline JS objects with color data
    const colorObjects = html.match(/(?:colors?|colours?|paints?|exterior)\s*[:=]\s*[\[{]/gi) || [];
    if (colorObjects.length) {
      console.log(`  Color objects: ${colorObjects.length}`);
      for (const co of colorObjects.slice(0, 3)) {
        const idx = html.indexOf(co);
        console.log(`  ** ${html.substring(idx, idx + 200).replace(/\n/g, ' ').trim()}`);
      }
    }

    // Look for image URLs with color patterns
    const colorImages = html.match(/(?:src|href|data-src)="[^"]*(?:colou?r|paint|swatch|exterior)[^"]*\.(jpg|png|webp|gif)"/gi) || [];
    const uniqueImages = [...new Set(colorImages.map(m => m.match(/"([^"]+)"/)?.[1]).filter(Boolean))];
    if (uniqueImages.length) {
      console.log(`  Color images: ${uniqueImages.length}`);
      for (const img of uniqueImages.slice(0, 5)) {
        console.log(`    ${img.substring(0, 120)}`);
      }
    }

    // Look for data attributes
    const dataAttrs = html.match(/data-(?:color|colour|variant|model|paint|config)[^=]*="[^"]+"/gi) || [];
    if (dataAttrs.length) {
      console.log(`  Data attributes: ${dataAttrs.length}`);
      for (const da of [...new Set(dataAttrs)].slice(0, 5)) {
        console.log(`    ${da}`);
      }
    }

    // Look for API endpoint patterns
    const apiPatterns = html.match(/(?:api|endpoint|service|content\/api)[^"'\s<>]{5,100}/gi) || [];
    const uniqueApis = [...new Set(apiPatterns)].slice(0, 5);
    if (uniqueApis.length) {
      console.log(`  API patterns:`);
      for (const api of uniqueApis) {
        console.log(`    ${api}`);
      }
    }

    // Look for Storyblok (GWM)
    const storyblok = html.match(/storyblok[^"'\s<>]{0,200}/gi) || [];
    if (storyblok.length) {
      console.log(`  Storyblok refs: ${storyblok.length}`);
      for (const sb of [...new Set(storyblok)].slice(0, 3)) {
        console.log(`    ${sb.substring(0, 100)}`);
      }
    }

    // Hyundai-specific: look for variantId, model-series-id
    if (probe.oem === 'hyundai-au') {
      const variantIds = html.match(/variant[_-]?id[^"'\s<>]*=\s*"?([^"'\s<>]+)/gi) || [];
      const modelSeries = html.match(/model-series-id="([^"]+)"/gi) || [];
      const buildPrice = html.match(/build[_-]?(?:and[_-]?)?price[^"'\s<>]*/gi) || [];
      if (variantIds.length) console.log(`  VariantIds:`, [...new Set(variantIds)].slice(0, 5));
      if (modelSeries.length) console.log(`  ModelSeries:`, [...new Set(modelSeries)]);
      if (buildPrice.length) console.log(`  BuildPrice refs:`, [...new Set(buildPrice)].slice(0, 5));
    }

  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }
}
