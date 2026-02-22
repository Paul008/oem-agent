#!/usr/bin/env node
// Check for duplicate color codes in Isuzu API response
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Accept: 'application/json',
  Referer: 'https://www.isuzuute.com.au/build-and-quote',
  Origin: 'https://www.isuzuute.com.au',
};

const colUrl = 'https://www.isuzuute.com.au/isuzuapi/BuildandQuote/GetCarColours?carName=D-MAX-4x4-X-TERRAIN-Crew-Cab-Ute';
const r = await fetch(colUrl, { headers: HEADERS });
const data = await r.json();

console.log('Colours:', data.Colours.length);
const codes = {};
for (const c of data.Colours) {
  const code = c.ColourType?.FilterKey || 'unknown';
  const name = c.ColourType?.Name || c.ItemName;
  if (codes[code]) {
    console.log(`DUPE: ${code} (${name}) - already seen as ${codes[code]}`);
  } else {
    codes[code] = name;
  }
  console.log(`  ${code}: ${name} ($${c.ColourType?.Price})`);
}
