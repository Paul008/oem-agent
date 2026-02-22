#!/usr/bin/env node
/**
 * Probe GWM gwmanz.com for color data patterns
 */

const BASE = 'https://www.gwmanz.com';

async function probeModel(path) {
  const r = await fetch(BASE + path, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) { console.log('  ' + path + ' -> ' + r.status); return null; }
  const html = await r.text();
  console.log('  ' + path + ' -> ' + html.length + ' bytes');
  return html;
}

async function main() {
  // Probe cannon page for color data
  console.log('=== Probing GWM Cannon page for color data ===');
  const html = await probeModel('/au/models/ute/cannon/');
  if (!html) process.exit(1);

  // Look for script tags with color data
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  let colorScripts = 0;
  for (const s of scripts) {
    const text = s[1].trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    if (lower.includes('colour') || lower.includes('color') || lower.includes('swatch') || lower.includes('paint')) {
      colorScripts++;
      console.log('\nColor script #' + colorScripts + ' (' + text.length + ' chars):');
      console.log(text.substring(0, 3000));
      if (text.length > 3000) console.log('...(truncated at 3000)');
    }
  }
  if (colorScripts === 0) console.log('No color-related scripts found');

  // Look for storyblok
  if (html.includes('storyblok')) {
    console.log('\n=== Storyblok references ===');
    const matches = [...html.matchAll(/storyblok[^\s"'<]{0,80}/gi)];
    const unique = [...new Set(matches.map(m => m[0]))];
    unique.slice(0, 20).forEach(m => console.log('  ' + m));
  }

  // Look for color-related CSS classes or data attributes
  const colorAttrs = [...html.matchAll(/(data-colou?r|class="[^"]*colou?r[^"]*"|colou?r-swatch|paint-option)[^>]{0,200}/gi)];
  console.log('\n=== Color attributes: ' + colorAttrs.length + ' ===');
  const uniqueAttrs = [...new Set(colorAttrs.map(m => m[0].substring(0, 150)))];
  uniqueAttrs.slice(0, 20).forEach(m => console.log('  ' + m));

  // Look for image patterns with color words
  const colorImgs = [...html.matchAll(/(?:src|data-src|href)="([^"]*(?:colou?r|swatch|paint)[^"]*)"/gi)];
  console.log('\n=== Color image URLs: ' + colorImgs.length + ' ===');
  [...new Set(colorImgs.map(m => m[1]))].slice(0, 20).forEach(u => console.log('  ' + u));

  // Check for __NEXT_DATA__ or similar JSON embeds
  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    console.log('\n=== __NEXT_DATA__ found (' + nextData[1].length + ' chars) ===');
    try {
      const data = JSON.parse(nextData[1]);
      console.log('Keys: ' + Object.keys(data).join(', '));
      console.log(JSON.stringify(data).substring(0, 2000));
    } catch(e) { console.log('Parse error: ' + e.message); }
  }

  // Check for window.__NUXT__ or similar
  const nuxtData = html.match(/window\.__NUXT__\s*=\s*({[\s\S]*?});?\s*<\/script>/i);
  if (nuxtData) console.log('\n=== __NUXT__ data found ===');

  // Look for any JSON objects with color arrays
  const jsonBlobs = [...html.matchAll(/\{[^{}]*"colou?rs?"[^{}]*\}/gi)];
  console.log('\n=== JSON with color keys: ' + jsonBlobs.length + ' ===');
  jsonBlobs.slice(0, 5).forEach(m => console.log('  ' + m[0].substring(0, 300)));

  // Check for Storyblok API token in source
  const tokenMatch = html.match(/token['":\s]+([a-zA-Z0-9]{20,})/);
  if (tokenMatch) {
    console.log('\n=== Possible Storyblok token: ' + tokenMatch[1] + ' ===');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
