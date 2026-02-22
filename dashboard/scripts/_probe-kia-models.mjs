#!/usr/bin/env node
const KIA = 'https://www.kia.com';
const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

async function probe(model) {
  const url = KIA + '/au/cars/' + model + '.html';
  try {
    const r = await fetch(url, { headers: H });
    if (!r.ok) return console.log(model + ': HTTP ' + r.status);
    const html = await r.text();

    // Find ALL _00000 patterns in showroom CDN
    const matches = html.match(/\/content\/dam\/kwcms\/au\/en\/images\/showroom\/[^"']*?_00000\.(?:png|webp|jpg)/gi) || [];
    console.log(model + ': ' + matches.length + ' _00000 URLs');

    const slugs = new Set();
    for (const u of matches) {
      const parts = u.split('/');
      const slug = parts[parts.length - 2];
      if (!['exterior','interior','360vr','360VR','exterior360','Features','features','color-chip'].includes(slug)) {
        slugs.add(slug);
      }
    }
    console.log('  Color slugs (' + slugs.size + '): ' + [...slugs].join(', '));
    if (matches.length > 0) console.log('  Sample: ' + matches[0]);

    // Check for 360-related refs
    const any360 = html.match(/360[VvRr]|exterior360/gi) || [];
    console.log('  360 refs: ' + any360.length);

    // Check for other vehicle render patterns
    const otherRenders = html.match(/\/content\/dam\/kwcms\/[^"']*?\.(png|webp|jpg)/gi) || [];
    const uniqueOther = new Set(otherRenders.map(u => {
      const parts = u.split('/');
      return parts.slice(0, -1).join('/');
    }));
    console.log('  Total DAM image paths: ' + otherRenders.length + ' (' + uniqueOther.size + ' unique dirs)');
  } catch (e) {
    console.log(model + ': ERROR ' + e.message);
  }
  console.log();
}

for (const m of ['ev6', 'tasman', 'niro', 'ev4', 'sportage-hybrid']) {
  await probe(m);
}
