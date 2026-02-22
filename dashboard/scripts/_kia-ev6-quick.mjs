#!/usr/bin/env node
// Quick probe: extract all showroom images from EV6, EV4, Niro, Tasman pages

const KIA_BASE = 'https://www.kia.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

const pages = ['ev6', 'ev4', 'niro-ev', 'niro-hybrid', 'tasman', 'carnival-hybrid'];

for (const model of pages) {
  const url = `${KIA_BASE}/au/cars/${model}.html`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (r.status !== 200) { console.log(`${model}: ${r.status}`); continue; }
    const html = await r.text();

    // Get ALL _00000 hero frames from AU showroom paths
    const heroRegex = /"(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"]*?_00000\.(?:png|webp|jpg))"/gi;
    const heroes = new Set();
    let m;
    while ((m = heroRegex.exec(html)) !== null) {
      heroes.add(m[1]);
    }

    // Also get broader exterior/360/render patterns
    const broadRegex = /"(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"]*?(?:exterior|360|render)[^"]*?_\d{5}\.(?:png|webp|jpg))"/gi;
    const broadFrames = new Set();
    while ((m = broadRegex.exec(html)) !== null) {
      broadFrames.add(m[1]);
    }

    // Extract unique color slugs from the paths
    const colorSlugs = new Set();
    for (const path of [...heroes, ...broadFrames]) {
      // Pattern: .../folder/{color-slug}/filename
      const parts = path.split('/');
      const fn = parts[parts.length - 1];
      const possibleColor = parts[parts.length - 2];
      if (possibleColor && possibleColor.match(/^[a-z]+-[a-z]+/)) {
        colorSlugs.add(possibleColor);
      }
    }

    console.log(`\n${model}: ${heroes.size} hero frames, ${broadFrames.size} broad frames, ${colorSlugs.size} color slugs`);
    for (const slug of [...colorSlugs].sort()) {
      const heroPath = [...heroes].find(h => h.includes(`/${slug}/`));
      console.log(`  ${slug.padEnd(35)} ${heroPath ? heroPath.split('/').slice(-3).join('/') : '(no hero)'}`);
    }

    // If no heroes found, look at all showroom images
    if (heroes.size === 0 && broadFrames.size === 0) {
      const allShowroom = html.match(/"(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"]+)"/g) || [];
      console.log(`  All showroom refs: ${allShowroom.length}`);
      const unique = [...new Set(allShowroom.map(s => s.replace(/"/g, '')))];
      for (const u of unique.slice(0, 10)) {
        console.log(`    ${u}`);
      }
    }
  } catch (e) {
    console.log(`${model}: ${e.message}`);
  }
}
