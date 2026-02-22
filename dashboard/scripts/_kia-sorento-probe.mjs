#!/usr/bin/env node
/**
 * Deep dive into sorento and ev6 pages which had limited renders.
 * Also probe the sorento-pe folder pattern.
 */

const KIA_BASE = 'https://www.kia.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,*/*',
};

// Check sorento page for all exterior/360 image paths
const sorentoUrl = `${KIA_BASE}/au/cars/sorento.html`;
const r = await fetch(sorentoUrl, { headers: HEADERS });
const html = await r.text();

// Extract ALL image paths that look like exterior renders
const extRegex = /"(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"]*?(?:exterior|360|render)[^"]*?\.(png|webp|jpg))"/gi;
const allExt = new Set();
let m;
while ((m = extRegex.exec(html)) !== null) {
  allExt.add(m[1]);
}

console.log(`Sorento page: ${allExt.size} exterior/360 image paths\n`);
for (const path of [...allExt].sort()) {
  console.log(`  ${path}`);
}

// Now look for ALL paths with sorento in them (any folder variant)
const sorentoImgRegex = /"(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"]*?sorento[^"]*?\.(png|webp|jpg))"/gi;
const sorentoImgs = new Set();
while ((m = sorentoImgRegex.exec(html)) !== null) {
  sorentoImgs.add(m[1]);
}

console.log(`\nSorento-named image paths: ${sorentoImgs.size}\n`);
for (const path of [...sorentoImgs].sort()) {
  console.log(`  ${path}`);
}

// Check for folders in the showroom path
const folderRegex = /\/content\/dam\/kwcms\/au\/en\/images\/showroom\/([^/]+)\//g;
const folders = new Set();
while ((m = folderRegex.exec(html)) !== null) {
  folders.add(m[1]);
}
console.log(`\nShowroom folders referenced: ${[...folders].join(', ')}`);

// Now probe sorento exterior/360 CDN paths directly
console.log('\n\n=== Probe sorento CDN paths ===\n');
const sorentoColors = [
  'aurora-black-pearl', 'cityscape-green', 'clear-white', 'gravity-blue',
  'mineral-blue', 'silky-silver', 'snow-white-pearl', 'steel-grey', 'volcanic-sand-brown'
];

const sorentoFolders = ['sorento', 'sorento-pe', 'sorento-hybrid', 'new-sorento'];
const renderTypes = ['360VR', '360vr', 'exterior360', 'exterior'];
const grades = ['gt', 'GT', 'gt-line', 'GT-Line'];
const exts = ['png', 'webp'];

for (const folder of sorentoFolders) {
  for (const rt of renderTypes) {
    for (const color of sorentoColors.slice(0, 3)) {
      for (const grade of grades) {
        for (const ext of exts) {
          const filenames = [
            `Kia-sorento-${grade}-${color}_00000.${ext}`,
            `kia-sorento-${grade}-${color}_00000.${ext}`,
          ];
          for (const fn of filenames) {
            const url = `${KIA_BASE}/content/dam/kwcms/au/en/images/showroom/${folder}/${rt}/${color}/${fn}`;
            try {
              const c = new AbortController();
              const t = setTimeout(() => c.abort(), 5000);
              const r2 = await fetch(url, { method: 'HEAD', signal: c.signal, headers: HEADERS });
              clearTimeout(t);
              if (r2.ok) {
                const size = r2.headers.get('content-length');
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

// Also check the sorento page for the specific exterior path that was found
console.log('\n=== Verify known sorento render ===');
const knownUrl = `${KIA_BASE}/content/dam/kwcms/au/en/images/showroom/sorento/exterior/volcanic-sand-brown/kia-sorento-gt-volcanic-sand-brown_00000.webp`;
const r3 = await fetch(knownUrl, { method: 'HEAD', headers: HEADERS });
console.log(`Known sorento render: ${r3.status} ${r3.headers.get('content-length')}b`);

// Try other colors in same path pattern
for (const color of sorentoColors) {
  const testUrl = `${KIA_BASE}/content/dam/kwcms/au/en/images/showroom/sorento/exterior/${color}/kia-sorento-gt-${color}_00000.webp`;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const r4 = await fetch(testUrl, { method: 'HEAD', signal: c.signal, headers: HEADERS });
    clearTimeout(t);
    const size = r4.headers.get('content-length');
    console.log(`  ${color}: ${r4.status} ${size ? size + 'b' : ''}`);
  } catch { console.log(`  ${color}: timeout`); }
}

// And try .png variants
console.log('\n=== Sorento .png variants ===');
for (const color of sorentoColors) {
  const testUrl = `${KIA_BASE}/content/dam/kwcms/au/en/images/showroom/sorento/exterior/${color}/kia-sorento-gt-${color}_00000.png`;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const r4 = await fetch(testUrl, { method: 'HEAD', signal: c.signal, headers: HEADERS });
    clearTimeout(t);
    const size = r4.headers.get('content-length');
    if (r4.ok && size && parseInt(size) > 5000) {
      console.log(`  ${color}: ${r4.status} ${size}b`);
    }
  } catch {}
}

// Now check EV6
console.log('\n\n=== EV6 deep probe ===\n');
const ev6Url = `${KIA_BASE}/au/cars/ev6.html`;
const r5 = await fetch(ev6Url, { headers: HEADERS });
const ev6Html = await r5.text();

// Get all showroom paths
const ev6ImgRegex = /"(\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"]+\.(png|webp|jpg))"/gi;
const ev6Imgs = new Set();
while ((m = ev6ImgRegex.exec(ev6Html)) !== null) {
  ev6Imgs.add(m[1]);
}
console.log(`EV6 showroom images: ${ev6Imgs.size}`);
for (const img of [...ev6Imgs].sort()) {
  console.log(`  ${img}`);
}

// Check EV6 folders
const ev6Folders = new Set();
const ev6FolderRegex = /\/content\/dam\/kwcms\/au\/en\/images\/showroom\/([^/]+)\//g;
while ((m = ev6FolderRegex.exec(ev6Html)) !== null) {
  ev6Folders.add(m[1]);
}
console.log(`\nEV6 showroom folders: ${[...ev6Folders].join(', ')}`);

// Probe EV6 CDN
const ev6Colors = ['aurora-black-pearl', 'glacier', 'interstellar-grey', 'runway-red', 'snow-white-pearl', 'steel-grey', 'yacht-blue'];
const ev6FolderList = ['ev6', 'ev6-pe', 'EV6'];
for (const folder of ev6FolderList) {
  for (const rt of renderTypes) {
    for (const color of ev6Colors) {
      for (const grade of ['gt', 'GT', 'gt-line']) {
        for (const ext of exts) {
          const fn = `Kia-ev6-${grade}-${color}_00000.${ext}`;
          const url = `${KIA_BASE}/content/dam/kwcms/au/en/images/showroom/${folder}/${rt}/${color}/${fn}`;
          try {
            const c = new AbortController();
            const t = setTimeout(() => c.abort(), 5000);
            const r6 = await fetch(url, { method: 'HEAD', signal: c.signal, headers: HEADERS });
            clearTimeout(t);
            if (r6.ok && r6.headers.get('content-length') > 5000) {
              console.log(`  FOUND: ${folder}/${rt}/${color}/${fn}`);
            }
          } catch {}
        }
      }
    }
  }
}
console.log('Done.');
