#!/usr/bin/env node
// Probe EV6 CDN for 360 renders even though the page doesn't have them
const KIA = 'https://www.kia.com';
const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

const colors = ['clear-white', 'snow-white-pearl', 'aurora-black-pearl', 'yacht-blue', 'runway-red', 'steel-grey', 'glacier', 'fusion-black'];
const folders = ['ev6', 'ev6-pe', 'ev6-gt', 'EV6'];
const types = ['360VR', '360vr', 'exterior360', 'exterior'];
const grades = ['gt', 'GT', 'gt-line', 'GT-Line', 'air'];
const exts = ['png', 'webp'];

let found = 0;
for (const folder of folders) {
  for (const type of types) {
    for (const grade of grades) {
      const color = 'snow-white-pearl';
      for (const ext of exts) {
        // Try with and without extra subdirs
        const urls = [
          `${KIA}/content/dam/kwcms/au/en/images/showroom/${folder}/${type}/${color}/Kia-ev6-${grade}-${color}_00000.${ext}`,
          `${KIA}/content/dam/kwcms/au/en/images/showroom/${folder}/${type}/exterior/${color}/Kia-ev6-${grade}-${color}_00000.${ext}`,
          `${KIA}/content/dam/kwcms/au/en/images/showroom/${folder}/${type}/sedan/${color}/Kia-ev6-${grade}-${color}_00000.${ext}`,
        ];
        for (const url of urls) {
          try {
            const r = await fetch(url, { method: 'HEAD', headers: H, signal: AbortSignal.timeout(5000) });
            if (r.ok) {
              const ct = r.headers.get('content-type') || '';
              const size = r.headers.get('content-length') || '?';
              if (ct.startsWith('image/')) {
                console.log(`HIT: ${url.split('/showroom/')[1]} (${ct}, ${size}b)`);
                found++;
              }
            }
          } catch {}
        }
      }
    }
  }
}

// Also try the EV6 with shopping-tools/byo path
for (const color of colors) {
  const url = `${KIA}/content/dam/kwcms/au/en/images/shopping-tools/byo/ev6/${color}/kia-ev6-gt-${color}_00000.png`;
  try {
    const r = await fetch(url, { method: 'HEAD', headers: H, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const ct = r.headers.get('content-type') || '';
      if (ct.startsWith('image/')) console.log(`BYO HIT: ${url.split('/byo/')[1]}`);
    }
  } catch {}
}

// Also try with different model names
for (const modelName of ['ev6', 'ev-6', 'EV6']) {
  for (const color of ['snow-white-pearl', 'clear-white']) {
    const urls = [
      `${KIA}/content/dam/kwcms/au/en/images/showroom/${modelName}/360VR/${color}/Kia-${modelName}-gt-${color}_00000.png`,
      `${KIA}/content/dam/kwcms/au/en/images/showroom/${modelName}/360vr/${color}/Kia-${modelName}-gt-${color}_00000.png`,
      `${KIA}/content/dam/kwcms/au/en/images/showroom/${modelName}/exterior360/${color}/Kia-${modelName}-gt-${color}_00000.png`,
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url, { method: 'HEAD', headers: H, signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const ct = r.headers.get('content-type') || '';
          if (ct.startsWith('image/')) console.log(`MODEL HIT: ${url.split('/showroom/')[1]}`);
        }
      } catch {}
    }
  }
}

console.log(`\nTotal found: ${found}`);
if (found === 0) console.log('No EV6 360 renders found on CDN.');
