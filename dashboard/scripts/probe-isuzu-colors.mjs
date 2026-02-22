#!/usr/bin/env node
// Probe Isuzu GetCarColours for colour data structure
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.isuzuute.com.au/build-and-quote',
  'Origin': 'https://www.isuzuute.com.au',
};

// Fetch D-MAX range data
const rangeRes = await fetch('https://www.isuzuute.com.au/isuzuapi/RangeAPI/GetRangeData?dataSourceId=%7B58ED1496-0A3E-4C26-84B5-4A9A766BF139%7D', { headers: HEADERS });
const rangeData = await rangeRes.json();

console.log('D-MAX Cars:', rangeData.Cars.length);
for (const c of rangeData.Cars) console.log('  ', c.Name);

// Pick a non-2.2L car
const car = rangeData.Cars.find(c => !c.Name.includes('2.2L'));
let clean = car.Name.replace(/\s*\(\d+\.\d+L\)\s*/g, '').trim();
clean = clean.replace(/\s*-\s*High Ride/g, '-High-Ride');
clean = clean.replace(/\s+/g, '-').replace(/\+/g, '');
const carName = 'D-MAX-' + clean;
console.log('\nUsing carName:', carName);

// Fetch GetCarColours
const colUrl = `https://www.isuzuute.com.au/isuzuapi/BuildandQuote/GetCarColours?carName=${encodeURIComponent(carName)}`;
const colRes = await fetch(colUrl, { headers: HEADERS });
const colData = await colRes.json();

console.log('\nTop-level keys:', Object.keys(colData));

// Show Colours array
if (colData.Colours) {
  console.log('\nColours count:', colData.Colours.length);
  for (const c of colData.Colours) {
    console.log(`  ${c.ColourName || c.Name}: code=${c.ColourCode || c.Code}, price=${c.Price}`);
  }
  if (colData.Colours.length > 0) {
    console.log('\nFirst colour FULL:', JSON.stringify(colData.Colours[0], null, 2));
  }
}

if (colData.DefaultColour) {
  console.log('\nDefaultColour:', JSON.stringify(colData.DefaultColour, null, 2));
}

// Also show car-level info
const carLevelKeys = Object.keys(colData).filter(k => !['Colours', 'AccessoriesExteriorFrontAndSide', 'AccessoriesExteriorRear', 'AccessoriesRoofAndInterior', 'GenuineTrayBodies'].includes(k));
console.log('\nOther keys:', carLevelKeys);
for (const k of carLevelKeys) {
  const val = colData[k];
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    console.log(`  ${k}: ${val}`);
  } else if (val && typeof val === 'object' && !Array.isArray(val)) {
    console.log(`  ${k}: ${JSON.stringify(val).substring(0, 200)}`);
  }
}
