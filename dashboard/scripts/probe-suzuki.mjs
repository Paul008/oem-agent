#!/usr/bin/env node
/**
 * Probe Suzuki Australia for color data
 */

const BASE = 'https://www.suzuki.com.au';
const models = ['swift', 'swift-sport', 'ignis', 'jimny', 'vitara', 's-cross', 'fronx'];

async function main() {
  for (const model of models) {
    const url = BASE + '/automobiles/' + model;
    console.log('=== ' + model.toUpperCase() + ' ===');
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log('  Status: ' + r.status); continue; }
      const html = await r.text();
      console.log('  Page size: ' + html.length + ' bytes');

      // Color references
      const colorRefs = [...html.matchAll(/colou?r/gi)];
      console.log('  Color references: ' + colorRefs.length);

      // Look for JSON/inline data with colors
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const s of scripts) {
        const text = s[1].trim();
        if (!text || text.length < 50) continue;
        const lower = text.toLowerCase();
        if ((lower.includes('colour') || lower.includes('color')) &&
            (lower.includes('name') || lower.includes('code') || lower.includes('swatch') || lower.includes('image'))) {
          console.log('  Color script found (' + text.length + ' chars):');
          console.log('    ' + text.substring(0, 3000));
          if (text.length > 3000) console.log('    ...(truncated)');
        }
      }

      // Swatch image URLs
      const swatches = [...html.matchAll(/(?:src|data-src|href)="([^"]*(?:colou?r|swatch|paint|chip)[^"]*)"/gi)];
      const uniqueSwatches = [...new Set(swatches.map(m => m[1]))];
      if (uniqueSwatches.length > 0) {
        console.log('  Swatch URLs: ' + uniqueSwatches.length);
        uniqueSwatches.slice(0, 10).forEach(u => console.log('    ' + u));
      }

      // Hex background colors
      const hexColors = [...html.matchAll(/background(?:-color)?:\s*#([0-9a-fA-F]{6})/gi)];
      if (hexColors.length > 0) {
        const unique = [...new Set(hexColors.map(m => '#' + m[1]))];
        console.log('  Hex colors: ' + unique.length);
        unique.slice(0, 20).forEach(h => console.log('    ' + h));
      }

      // Data attributes
      const dataColors = [...html.matchAll(/data-(?:colou?r|variant|model)[^=]*="([^"]*)"/gi)];
      if (dataColors.length > 0) {
        console.log('  Data attributes: ' + dataColors.length);
        [...new Set(dataColors.map(m => m[0].substring(0, 120)))].slice(0, 10).forEach(d => console.log('    ' + d));
      }

      // Look for CloudFront image patterns
      const cfImages = [...html.matchAll(/(?:src|data-src)="([^"]*cloudfront[^"]*)"/gi)];
      if (cfImages.length > 0) {
        console.log('  CloudFront images: ' + cfImages.length);
        [...new Set(cfImages.map(m => m[1]))].slice(0, 5).forEach(u => console.log('    ' + u));
      }

    } catch(e) {
      console.log('  Error: ' + e.message);
    }
    console.log('');
  }

  // Also check discovered APIs
  console.log('=== Checking Suzuki discovered APIs ===');
  const apiPaths = [
    '/api/colours',
    '/api/models',
    '/automobiles/api/colours',
    '/api/v1/colours',
  ];
  for (const p of apiPaths) {
    try {
      const r = await fetch(BASE + p, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      console.log('  ' + p + ' -> ' + r.status);
      if (r.ok) {
        const text = await r.text();
        console.log('    ' + text.substring(0, 500));
      }
    } catch(e) {
      console.log('  ' + p + ' -> Error: ' + e.message);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
