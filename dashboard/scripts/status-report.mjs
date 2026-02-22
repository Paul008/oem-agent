#!/usr/bin/env node
/**
 * Comprehensive status report for variant_colors, accessories, and accessory_models tables.
 * Grouped by OEM with coverage percentages and grand totals.
 * Uses pagination to fetch all rows (Supabase JS default limit is 1000).
 *
 * Run: cd dashboard/scripts && node status-report.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

const PAGE_SIZE = 1000;
const PAD_OEM = 20;
const PAD_NUM = 8;
const PAD_PCT = 10;

/**
 * Fetch all rows from a table with pagination.
 * @param {string} table - table name
 * @param {string} selectStr - select columns string
 * @returns {Promise<Array>} all rows
 */
async function fetchAll(table, selectStr) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectStr)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} query error: ${error.message}`);
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function pct(n, total) {
  if (total === 0) return '   -   ';
  return `${((n / total) * 100).toFixed(1)}%`.padStart(PAD_PCT);
}

function num(n) {
  return String(n).padStart(PAD_NUM);
}

function divider(len) {
  return '-'.repeat(len);
}

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║          OEM AGENT — DATABASE STATUS REPORT                         ║');
console.log('║          Generated:', new Date().toISOString().slice(0, 19), '                      ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: variant_colors by OEM
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
console.log('│  SECTION 1: variant_colors by OEM                                   │');
console.log('└──────────────────────────────────────────────────────────────────────┘\n');

const colors = await fetchAll('variant_colors', `
  id, swatch_url, hero_image_url, gallery_urls,
  product:products!inner(
    id,
    model:vehicle_models!inner(id, name, oem_id)
  )
`);

// Aggregate by OEM
const colorStats = {};
for (const c of colors) {
  const oem = c.product.model.oem_id;
  if (!colorStats[oem]) colorStats[oem] = { total: 0, swatch: 0, hero: 0, gallery: 0 };
  colorStats[oem].total++;
  if (c.swatch_url) colorStats[oem].swatch++;
  if (c.hero_image_url) colorStats[oem].hero++;
  if (c.gallery_urls && c.gallery_urls.length > 0) colorStats[oem].gallery++;
}

const colorOems = Object.keys(colorStats).sort();

const COL_HDR = [
  'OEM'.padEnd(PAD_OEM),
  'Count'.padStart(PAD_NUM),
  'Swatch %'.padStart(PAD_PCT),
  'Hero %'.padStart(PAD_PCT),
  'Gallery %'.padStart(PAD_PCT),
];
const colLineLen = COL_HDR.join('').length;

console.log(COL_HDR.join(''));
console.log(divider(colLineLen));

let totColors = 0, totSwatch = 0, totHero = 0, totGallery = 0;
for (const oem of colorOems) {
  const s = colorStats[oem];
  totColors += s.total;
  totSwatch += s.swatch;
  totHero += s.hero;
  totGallery += s.gallery;
  console.log(
    oem.padEnd(PAD_OEM) +
    num(s.total) +
    pct(s.swatch, s.total) +
    pct(s.hero, s.total) +
    pct(s.gallery, s.total)
  );
}
console.log(divider(colLineLen));
console.log(
  'TOTAL'.padEnd(PAD_OEM) +
  num(totColors) +
  pct(totSwatch, totColors) +
  pct(totHero, totColors) +
  pct(totGallery, totColors)
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: accessories by OEM
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
console.log('│  SECTION 2: accessories by OEM                                      │');
console.log('└──────────────────────────────────────────────────────────────────────┘\n');

const accessories = await fetchAll('accessories', 'id, oem_id, price, image_url');

const accStats = {};
for (const a of accessories) {
  const oem = a.oem_id;
  if (!accStats[oem]) accStats[oem] = { total: 0, withPrice: 0, withImage: 0 };
  accStats[oem].total++;
  if (a.price !== null && a.price !== undefined && a.price > 0) accStats[oem].withPrice++;
  if (a.image_url) accStats[oem].withImage++;
}

const accOems = Object.keys(accStats).sort();

const ACC_HDR = [
  'OEM'.padEnd(PAD_OEM),
  'Count'.padStart(PAD_NUM),
  'w/ Price %'.padStart(PAD_PCT + 2),
  'w/ Image %'.padStart(PAD_PCT + 2),
];
const accLineLen = ACC_HDR.join('').length;

console.log(ACC_HDR.join(''));
console.log(divider(accLineLen));

let totAcc = 0, totWithPrice = 0, totWithImage = 0;
for (const oem of accOems) {
  const s = accStats[oem];
  totAcc += s.total;
  totWithPrice += s.withPrice;
  totWithImage += s.withImage;
  const pPrice = `${((s.withPrice / s.total) * 100).toFixed(1)}%`.padStart(PAD_PCT + 2);
  const pImage = `${((s.withImage / s.total) * 100).toFixed(1)}%`.padStart(PAD_PCT + 2);
  console.log(oem.padEnd(PAD_OEM) + num(s.total) + pPrice + pImage);
}
console.log(divider(accLineLen));
const gPPrice = totAcc > 0 ? `${((totWithPrice / totAcc) * 100).toFixed(1)}%`.padStart(PAD_PCT + 2) : '   -   ';
const gPImage = totAcc > 0 ? `${((totWithImage / totAcc) * 100).toFixed(1)}%`.padStart(PAD_PCT + 2) : '   -   ';
console.log('TOTAL'.padEnd(PAD_OEM) + num(totAcc) + gPPrice + gPImage);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: accessory_models by OEM
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
console.log('│  SECTION 3: accessory_models (join rows) by OEM                     │');
console.log('└──────────────────────────────────────────────────────────────────────┘\n');

const joins = await fetchAll('accessory_models', `
  id,
  accessory:accessories!inner(oem_id)
`);

const joinStats = {};
for (const j of joins) {
  const oem = j.accessory.oem_id;
  joinStats[oem] = (joinStats[oem] || 0) + 1;
}

const joinOems = Object.keys(joinStats).sort();

const JOIN_HDR = [
  'OEM'.padEnd(PAD_OEM),
  'Join Rows'.padStart(PAD_NUM + 2),
];
const joinLineLen = JOIN_HDR.join('').length;

console.log(JOIN_HDR.join(''));
console.log(divider(joinLineLen));

let totJoins = 0;
for (const oem of joinOems) {
  totJoins += joinStats[oem];
  console.log(oem.padEnd(PAD_OEM) + String(joinStats[oem]).padStart(PAD_NUM + 2));
}
console.log(divider(joinLineLen));
console.log('TOTAL'.padEnd(PAD_OEM) + String(totJoins).padStart(PAD_NUM + 2));

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Grand Totals
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  GRAND TOTALS                                                        ║');
console.log('╠══════════════════════════════════════════════════════════════════════╣');
console.log(`║  variant_colors:     ${String(totColors).padStart(6)}  (swatch: ${((totSwatch/totColors)*100).toFixed(1)}%, hero: ${((totHero/totColors)*100).toFixed(1)}%, gallery: ${((totGallery/totColors)*100).toFixed(1)}%)`);
console.log(`║  accessories:        ${String(totAcc).padStart(6)}  (w/ price: ${((totWithPrice/totAcc)*100).toFixed(1)}%, w/ image: ${((totWithImage/totAcc)*100).toFixed(1)}%)`);
console.log(`║  accessory_models:   ${String(totJoins).padStart(6)}`);
console.log(`║  OEMs with colors:   ${String(colorOems.length).padStart(6)}`);
console.log(`║  OEMs with accs:     ${String(accOems.length).padStart(6)}`);
console.log('╚══════════════════════════════════════════════════════════════════════╝');
