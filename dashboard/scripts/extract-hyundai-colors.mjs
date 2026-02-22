#!/usr/bin/env node
/**
 * Extract Hyundai color data from model pages.
 * Hyundai embeds swatch images and color data inline on model pages.
 */

const HYUNDAI_BASE = 'https://www.hyundai.com';

// Model pages discovered from /au/en/cars listing
const modelPages = [
  { name: 'Tucson', slug: 'tucson', url: '/au/en/cars/suvs/tucson' },
  { name: 'Kona', slug: 'kona', url: '/au/en/cars/suvs/kona' },
  { name: 'Venue', slug: 'venue', url: '/au/en/cars/suvs/venue' },
  { name: 'Santa Fe', slug: 'santa-fe', url: '/au/en/cars/suvs/santa-fe' },
  { name: 'Palisade', slug: 'palisade', url: '/au/en/cars/suvs/palisade' },
  { name: 'i30', slug: 'i30', url: '/au/en/cars/small-cars/i30/sedan' },
  { name: 'i30 N Line', slug: 'i30-n-line', url: '/au/en/cars/small-cars/i30/n-line' },
  { name: 'i30 N', slug: 'i30-n', url: '/au/en/cars/sports-cars/i30-n' },
  { name: 'i20 N', slug: 'i20-n', url: '/au/en/cars/sports-cars/i20-n' },
  { name: 'Ioniq 5', slug: 'ioniq-5', url: '/au/en/cars/eco/ioniq5' },
  { name: 'Ioniq 5 N', slug: 'ioniq-5-n', url: '/au/en/cars/eco/ioniq5n' },
  { name: 'Ioniq 6', slug: 'ioniq-6', url: '/au/en/cars/eco/ioniq6' },
  { name: 'Ioniq 9', slug: 'ioniq-9', url: '/au/en/cars/eco/ioniq9' },
  { name: 'Kona Electric', slug: 'kona-electric', url: '/au/en/cars/eco/kona-electric' },
  { name: 'Inster', slug: 'inster', url: '/au/en/cars/eco/inster' },
  { name: 'Staria', slug: 'staria', url: '/au/en/cars/people-movers-and-commercial/staria' },
  { name: 'Staria Load', slug: 'staria-load', url: '/au/en/cars/people-movers-and-commercial/2025-staria-load' },
  { name: 'Santa Fe Hybrid', slug: 'santa-fe-hybrid', url: '/au/en/cars/suvs/santa-fe-hybrid' },
  { name: 'Tucson Hybrid', slug: 'tucson-hybrid', url: '/au/en/cars/hybrid' },
  { name: 'Kona Hybrid', slug: 'kona-hybrid', url: '/au/en/cars/suvs/kona/konahybrid' },
  { name: 'Sonata N Line', slug: 'sonata-n-line', url: '/au/en/cars/mid-size/sonata-n-line' },
];

for (const model of modelPages) {
  const url = HYUNDAI_BASE + model.url;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    });
    if (!r.ok) { console.log(`\n❌ ${model.name}: ${r.status}`); continue; }
    const html = await r.text();

    console.log(`\n✅ ${model.name} (${(html.length/1024).toFixed(0)}KB):`);

    // Extract swatch images - Hyundai uses pattern like:
    // <img class="swatch" src="..." alt="Color Name" data-color-code="XXX">
    // or <button class="swatch-btn" data-colour="Color Name">
    const swatchRegex = /swatch[^>]*(?:src|data-src)="([^"]+)"[^>]*alt="([^"]+)"/gi;
    let m;
    const swatches = [];
    while ((m = swatchRegex.exec(html)) !== null) {
      swatches.push({ url: m[1], name: m[2] });
    }

    // Also try: <img ... alt="..." ... class="...swatch..."
    const swatchRegex2 = /<img[^>]+alt="([^"]+)"[^>]+class="[^"]*swatch[^"]*"[^>]*src="([^"]+)"/gi;
    while ((m = swatchRegex2.exec(html)) !== null) {
      if (!swatches.find(s => s.name === m[1])) {
        swatches.push({ url: m[2], name: m[1] });
      }
    }

    // Extract colour/color from data attributes
    const colorDataRegex = /data-colou?r(?:-(?:code|name|id))?\s*=\s*"([^"]+)"/gi;
    const colorAttrs = [];
    while ((m = colorDataRegex.exec(html)) !== null) {
      colorAttrs.push(m[1]);
    }

    // Look for colour/color in class names with adjacent text
    const colourSectionRegex = /class="[^"]*colou?r[^"]*"[^>]*>([^<]{1,100})</gi;
    const colorSections = [];
    while ((m = colourSectionRegex.exec(html)) !== null) {
      const text = m[1].trim();
      if (text.length > 2 && text.length < 50) colorSections.push(text);
    }

    // Look for variantId patterns
    const variantIdRegex = /variant[_-]?[Ii]d[^=]*=\s*"?([^"'\s&]+)/g;
    const variantIds = [];
    while ((m = variantIdRegex.exec(html)) !== null) {
      variantIds.push(m[1]);
    }

    // Look for color-specific image URLs (vehicle renders per color)
    const colorImgRegex = /(?:src|data-src|data-image)="([^"]*(?:colou?r|paint|swatch)[^"]*\.(?:jpg|png|webp|gif))"/gi;
    const colorImages = [];
    while ((m = colorImgRegex.exec(html)) !== null) {
      colorImages.push(m[1]);
    }

    // Look for 360 or gallery patterns
    const galleryRegex = /(?:src|data-src)="([^"]*(?:360|gallery|exterior-colour)[^"]*\.(?:jpg|png|webp))"/gi;
    const galleryImages = [];
    while ((m = galleryRegex.exec(html)) !== null) {
      galleryImages.push(m[1]);
    }

    // Extract from embedded scripts/JSON
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let colorInScripts = 0;
    while ((m = scriptRegex.exec(html)) !== null) {
      const script = m[1];
      if (script.toLowerCase().includes('colour') || script.toLowerCase().includes('swatch')) {
        colorInScripts++;
        // Try to find JSON data with color info
        const jsonMatch = script.match(/(?:colours?|swatches?)\s*[:=]\s*(\[[\s\S]*?\])/i);
        if (jsonMatch) {
          try {
            const colors = JSON.parse(jsonMatch[1]);
            console.log(`  ** Color JSON found in script! ${colors.length} entries`);
            console.log(`  ** Sample: ${JSON.stringify(colors[0]).substring(0, 200)}`);
          } catch {
            console.log(`  ** Color data in script (not JSON): ${jsonMatch[1].substring(0, 200)}`);
          }
        }
      }
    }

    if (swatches.length) {
      console.log(`  Swatches (${swatches.length}):`);
      for (const s of swatches.slice(0, 8)) {
        console.log(`    ${s.name.padEnd(30)} ${s.url.substring(0, 80)}`);
      }
    }
    if (colorAttrs.length) console.log(`  Color attrs (${colorAttrs.length}): ${[...new Set(colorAttrs)].join(', ')}`);
    if (colorSections.length) console.log(`  Color sections: ${[...new Set(colorSections)].join(', ')}`);
    if (variantIds.length) console.log(`  VariantIds (${variantIds.length}): ${[...new Set(variantIds)].slice(0, 5).join(', ')}`);
    if (colorImages.length) console.log(`  Color images (${colorImages.length}): ${[...new Set(colorImages)].slice(0, 3).join(', ')}`);
    if (galleryImages.length) console.log(`  Gallery images: ${[...new Set(galleryImages)].slice(0, 3).join(', ')}`);
    if (colorInScripts) console.log(`  Scripts with color data: ${colorInScripts}`);

    if (!swatches.length && !colorAttrs.length) {
      // Broader search - look for any image with color-sounding alt text
      const imgAltRegex = /<img[^>]+alt="([^"]*(?:white|black|silver|grey|gray|blue|red|green|pearl|metallic|bronze|brown)[^"]*)"[^>]+src="([^"]+)"/gi;
      const colorImgs = [];
      while ((m = imgAltRegex.exec(html)) !== null) {
        colorImgs.push({ name: m[1], url: m[2] });
      }
      if (colorImgs.length) {
        console.log(`  Alt-text color images (${colorImgs.length}):`);
        for (const ci of colorImgs.slice(0, 5)) {
          console.log(`    ${ci.name.padEnd(40)} ${ci.url.substring(0, 80)}`);
        }
      }
    }
  } catch (e) {
    console.log(`\n❌ ${model.name}: ${e.message}`);
  }
}
