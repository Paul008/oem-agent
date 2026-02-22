#!/usr/bin/env node
// Deep dive into Kia color data from model pages

const models = [
  'seltos', 'sportage', 'sorento', 'carnival', 'stinger',
  'ev6', 'ev9', 'cerato', 'picanto', 'stonic', 'niro', 'rio',
  'k4', 'syros', 'ev5', 'ev3'
];

const baseUrl = 'https://www.kia.com/au/cars';

for (const model of models) {
  const url = `${baseUrl}/${model}.html`;
  try {
    const r = await fetch(url);
    if (!r.ok) { console.log(`❌ ${model}: ${r.status}`); continue; }
    const html = await r.text();

    // Extract color chip images
    const chipMatches = html.match(/color-chip\/[^"')<>\s]+/g) || [];
    const chips = [...new Set(chipMatches)];

    // Extract colorUrl patterns
    const colorUrlMatches = html.match(/colorUrl\s*=\s*['"][^'"]+/g) || [];

    // Look for color data in JSON/script blocks
    const colorJsonMatch = html.match(/"colors?":\s*\[[\s\S]{0,5000}?\]/g) || [];

    // Look for exterior color sections
    const extColorMatch = html.match(/exterior[_-]?colou?r[^"]{0,500}/gi) || [];

    // Look for specific color image patterns like car renders
    const carImageMatches = html.match(/https?:\/\/[^"'<>\s]*(?:exterior|color|colour|paint)[^"'<>\s]*/gi) || [];
    const uniqueCarImages = [...new Set(carImageMatches)].slice(0, 5);

    // Look for the color data in script blocks
    const scriptColorData = html.match(/colorchip[^;]{0,300}/gi) || [];

    console.log(`\n✅ ${model}:`);
    if (chips.length) console.log(`  Chips (${chips.length}):`, chips);
    if (colorUrlMatches.length) console.log(`  ColorUrls:`, colorUrlMatches.slice(0, 3));
    if (uniqueCarImages.length) console.log(`  Car images:`, uniqueCarImages);
    if (scriptColorData.length) console.log(`  Script color:`, scriptColorData.slice(0, 2));
    if (colorJsonMatch.length) console.log(`  Color JSON:`, colorJsonMatch[0]?.substring(0, 200));
    if (!chips.length && !colorUrlMatches.length && !uniqueCarImages.length) {
      // Check if page has any color references at all
      const anyColor = (html.match(/colou?r/gi) || []).length;
      console.log(`  No color chips found. ${anyColor} color references in page.`);
    }
  } catch (e) {
    console.log(`❌ ${model}: ${e.message}`);
  }
}
