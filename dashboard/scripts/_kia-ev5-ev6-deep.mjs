#!/usr/bin/env node
// Deep probe: EV5 and EV6 pages for all possible render paths

const KIA_BASE = 'https://www.kia.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

for (const model of ['ev5', 'ev6']) {
  const url = `${KIA_BASE}/au/cars/${model}.html`;
  const r = await fetch(url, { headers: HEADERS });
  const html = await r.text();

  console.log(`\n=== ${model} (${html.length} bytes) ===\n`);

  // Extract ALL image references (not just showroom)
  const allImgRegex = /"(\/content\/dam\/kwcms\/[^"]+\.(png|webp|jpg))"/gi;
  const allImgs = new Set();
  let m;
  while ((m = allImgRegex.exec(html)) !== null) {
    allImgs.add(m[1]);
  }

  // Look for any numbered frame images
  const numberedImgs = [...allImgs].filter(i => /_\d{5}\./.test(i));
  console.log(`Total images: ${allImgs.size}, Numbered frames: ${numberedImgs.length}`);

  // Group numbered by folder
  const byFolder = {};
  for (const img of numberedImgs) {
    const parts = img.split('/');
    const parentFolder = parts.slice(0, -1).join('/');
    if (byFolder[parentFolder] === undefined) byFolder[parentFolder] = [];
    byFolder[parentFolder].push(parts[parts.length - 1]);
  }

  for (const [folder, files] of Object.entries(byFolder)) {
    const hero = files.find(f => f.includes('_00000'));
    console.log(`  ${folder.split('/').slice(-3).join('/')}`);
    console.log(`    ${files.length} frames, hero: ${hero || 'NONE'}`);
  }

  // Check for any pattern with color-slug directories
  const colorDirs = [...allImgs].filter(i => {
    const parts = i.split('/');
    return parts.some(p => /^[a-z]+-[a-z]+(-[a-z]+)?$/.test(p));
  });

  if (colorDirs.length > 0) {
    console.log(`\n  Color directory images: ${colorDirs.length}`);
    const uniqueColorPaths = new Set(colorDirs.map(p => {
      const parts = p.split('/');
      return parts.find(seg => /^[a-z]+-[a-z]+(-[a-z]+)?$/.test(seg));
    }));
    console.log(`  Unique color slugs: ${[...uniqueColorPaths].join(', ')}`);
  }
}

// Check if EV5 has more colors in its features/exterior pages
console.log('\n=== EV5 features page ===\n');
{
  const r = await fetch(`${KIA_BASE}/au/cars/ev5/features.html`, { headers: HEADERS });
  if (r.ok) {
    const html = await r.text();
    const numberedRegex = /"(\/content\/dam\/kwcms\/[^"]*_\d{5}\.[^"]+)"/gi;
    const numbered = new Set();
    let m;
    while ((m = numberedRegex.exec(html)) !== null) numbered.add(m[1]);
    console.log(`EV5 features: ${numbered.size} numbered frames`);

    // Extract color folders
    for (const img of numbered) {
      const parts = img.split('/');
      const colorPart = parts.find(p => /^[a-z]+-[a-z]+/.test(p) && p.length > 5);
      if (colorPart) console.log(`  ${colorPart}: ${parts.slice(-2).join('/')}`);
    }
  }
}

// Check for niro EV under different URL patterns
console.log('\n=== Niro EV URL patterns ===\n');
const niroUrls = [
  `${KIA_BASE}/au/cars/niro.html`,
  `${KIA_BASE}/au/cars/niro-ev.html`,
  `${KIA_BASE}/au/cars/e-niro.html`,
  `${KIA_BASE}/au/cars/niro/ev.html`,
];
for (const url of niroUrls) {
  const r = await fetch(url, { headers: HEADERS, redirect: 'manual' });
  const loc = r.headers.get('location');
  console.log(`  ${url.split('/au/')[1]}: ${r.status}${loc ? ' → ' + loc : ''}`);
}

// Check tasman for any render URLs via brute force CDN
console.log('\n=== Tasman CDN brute force ===\n');
const tasmanColors = ['aurora-black-pearl', 'clear-white', 'interstellar-grey', 'steel-grey'];
const tasmanFolders = ['tasman', 'tasman-pe'];
const renderTypes = ['360VR', '360vr', 'exterior360', 'exterior'];
const grades = ['gt', 'GT', 'gt-line', 'GT-Line', 's', 'S', 'x-line', 'X-Line'];

for (const folder of tasmanFolders) {
  for (const rt of renderTypes) {
    for (const color of tasmanColors) {
      for (const grade of grades) {
        for (const ext of ['png', 'webp']) {
          const fns = [
            `Kia-tasman-${grade}-${color}_00000.${ext}`,
            `kia-tasman-${grade}-${color}_00000.${ext}`,
          ];
          for (const fn of fns) {
            const url = `${KIA_BASE}/content/dam/kwcms/au/en/images/showroom/${folder}/${rt}/${color}/${fn}`;
            try {
              const c = new AbortController();
              const t = setTimeout(() => c.abort(), 5000);
              const r = await fetch(url, { method: 'HEAD', signal: c.signal, headers: HEADERS });
              clearTimeout(t);
              if (r.ok) {
                const size = r.headers.get('content-length');
                if (size && parseInt(size) > 5000) {
                  console.log(`  FOUND: ${folder}/${rt}/${color}/${fn} (${size}b)`);
                }
              }
            } catch {}
          }
        }
      }
    }
  }
}
console.log('Done.');
