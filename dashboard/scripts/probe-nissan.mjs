#!/usr/bin/env node
/**
 * Probe Nissan browse-range pages for color data
 */

const BASE = 'https://www.nissan.com.au';
const models = ['qashqai', 'x-trail', 'pathfinder', 'patrol', 'navara', 'juke', 'ariya', 'z'];

async function main() {
  for (const model of models) {
    const url = BASE + '/vehicles/browse-range/' + model + '.html';
    console.log('=== ' + model.toUpperCase() + ' ===');
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log('  Status: ' + r.status); continue; }
      const html = await r.text();
      console.log('  Page size: ' + html.length + ' bytes');

      // Look for color-related data
      const colorRefs = [...html.matchAll(/colou?r/gi)];
      console.log('  Color references: ' + colorRefs.length);

      // Look for color swatch patterns
      const swatches = [...html.matchAll(/(?:src|data-src|href)="([^"]*(?:colou?r|swatch|paint|chip)[^"]*)"/gi)];
      const uniqueSwatches = [...new Set(swatches.map(m => m[1]))];
      if (uniqueSwatches.length > 0) {
        console.log('  Swatch URLs: ' + uniqueSwatches.length);
        uniqueSwatches.slice(0, 10).forEach(u => console.log('    ' + u));
      }

      // Look for JSON data with color info
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const s of scripts) {
        const text = s[1].trim();
        if (!text || text.length < 50) continue;
        const lower = text.toLowerCase();
        if ((lower.includes('colour') || lower.includes('color')) &&
            (lower.includes('name') || lower.includes('code') || lower.includes('swatch'))) {
          console.log('  Color script found (' + text.length + ' chars):');
          console.log('    ' + text.substring(0, 2000));
          if (text.length > 2000) console.log('    ...(truncated)');
        }
      }

      // Look for data-color attributes
      const dataColors = [...html.matchAll(/data-colou?r[^=]*="([^"]*)"/gi)];
      if (dataColors.length > 0) {
        console.log('  data-color attributes: ' + dataColors.length);
        [...new Set(dataColors.map(m => m[0].substring(0, 100)))].slice(0, 10).forEach(d => console.log('    ' + d));
      }

      // Look for color names in specific HTML structures
      const colorLabels = [...html.matchAll(/(?:class="[^"]*colou?r[^"]*"[^>]*>([^<]+)<|aria-label="([^"]*colou?r[^"]*)")/gi)];
      if (colorLabels.length > 0) {
        console.log('  Color labels: ' + colorLabels.length);
        colorLabels.slice(0, 10).forEach(m => console.log('    ' + (m[1] || m[2])));
      }

      // Look for hex color codes in style attributes near color sections
      const hexColors = [...html.matchAll(/background(?:-color)?:\s*#([0-9a-fA-F]{6})/gi)];
      if (hexColors.length > 0) {
        console.log('  Hex colors in styles: ' + [...new Set(hexColors.map(m => m[1]))].length);
        [...new Set(hexColors.map(m => '#' + m[1]))].slice(0, 20).forEach(h => console.log('    ' + h));
      }

      // Search for specific patterns like "Ivory Pearl" etc
      const colorNamePattern = [...html.matchAll(/([\w\s]+(?:Pearl|Metallic|Black|White|Silver|Grey|Gray|Blue|Red|Green|Brown|Bronze|Gold))/gi)];
      const uniqueNames = [...new Set(colorNamePattern.map(m => m[1].trim()))].filter(n => n.length > 3 && n.length < 40);
      if (uniqueNames.length > 0) {
        console.log('  Potential color names: ' + uniqueNames.length);
        uniqueNames.slice(0, 15).forEach(n => console.log('    ' + n));
      }

    } catch(e) {
      console.log('  Error: ' + e.message);
    }
    console.log('');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
