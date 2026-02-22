#!/usr/bin/env node
/**
 * Extract structured Suzuki color data from model pages
 */

const BASE = 'https://www.suzuki.com.au';
const MODEL_PAGES = [
  { path: '/vehicles/hatch/swift-hybrid/', slug: 'swift-hybrid' },
  { path: '/vehicles/hatch/swift-sport/', slug: 'swift-sport' },
  { path: '/vehicles/suv/ignis/', slug: 'ignis' },
  { path: '/vehicles/suv/fronx-hybrid/', slug: 'fronx-hybrid' },
  { path: '/vehicles/suv/vitara/', slug: 'vitara' },
  { path: '/vehicles/suv/s-cross/', slug: 's-cross' },
  { path: '/vehicles/4x4/jimny/', slug: 'jimny' },
];

async function extractColorsFromPage(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) return null;
  const html = await r.text();

  // Extract color sections: data-color-variant + data-color-name + hex
  // Pattern: each variant section starts with data-color-variant, followed by color entries
  const variants = {};
  let currentVariant = null;
  let currentColor = null;

  // Find all color-variant and color-name attributes
  const colorElements = [...html.matchAll(/data-color-variant="([^"]*)"|data-color-name="([^"]*)"|data-color-hex="([^"]*)"|background(?:-color)?:\s*#([0-9a-fA-F]{6})/gi)];

  // Also look for the color picker section pattern
  const colorPickerRegex = /data-color-variant="([^"]*)"[\s\S]*?(?=data-color-variant="|$)/gi;
  const variantSections = [...html.matchAll(colorPickerRegex)];

  for (const section of variantSections) {
    const variantName = section[1];
    const sectionText = section[0];

    // Extract colors within this section
    const colors = [];
    const colorEntries = [...sectionText.matchAll(/data-color-name="([^"]*)"[^>]*(?:style="[^"]*background(?:-color)?:\s*#([0-9a-fA-F]{6})[^"]*")?/gi)];

    for (const entry of colorEntries) {
      colors.push({
        name: entry[1].trim(),
        hex: entry[2] || null,
      });
    }

    // Also try to extract hex from nearby style attributes
    const nameAndHex = [...sectionText.matchAll(/data-color-name="([^"]*)"[\s\S]*?background(?:-color)?:\s*#([0-9a-fA-F]{6})/gi)];

    variants[variantName] = colors.length > 0 ? colors : nameAndHex.map(m => ({ name: m[1].trim(), hex: m[2] }));
  }

  return { variants, html };
}

async function main() {
  for (const model of MODEL_PAGES) {
    console.log(`\n=== ${model.slug.toUpperCase()} ===`);
    const result = await extractColorsFromPage(BASE + model.path);
    if (!result) { console.log('  Failed to fetch'); continue; }

    const { variants, html } = result;

    if (Object.keys(variants).length > 0) {
      for (const [variant, colors] of Object.entries(variants)) {
        console.log(`  ${variant}:`);
        colors.forEach(c => console.log(`    ${c.name}${c.hex ? ' #' + c.hex : ''}`));
      }
    }

    // Better approach: extract the structured color picker sections
    // Each color section has a structure like:
    // <div data-color-variant="xxx">
    //   <div data-color-name="Color Name" style="background-color: #hex">
    //   <img src="vehicle-image.jpg" alt="Color Name">
    // Let's look at the actual HTML structure more carefully

    // Find color button patterns - these tend to have hex in inline styles
    const colorButtons = [...html.matchAll(/<(?:div|button|span)[^>]*data-color-name="([^"]*)"[^>]*style="[^"]*background(?:-color)?:\s*#([0-9a-fA-F]{6})/gi)];
    if (colorButtons.length > 0) {
      console.log(`\n  Color buttons (name + hex):`);
      for (const m of colorButtons) {
        console.log(`    ${m[1].trim()} = #${m[2]}`);
      }
    }

    // Also try reversed order (style before data-color-name)
    const colorButtons2 = [...html.matchAll(/style="[^"]*background(?:-color)?:\s*#([0-9a-fA-F]{6})[^"]*"[^>]*data-color-name="([^"]*)"/gi)];
    if (colorButtons2.length > 0) {
      console.log(`  Color buttons reversed (hex + name):`);
      for (const m of colorButtons2) {
        console.log(`    ${m[2].trim()} = #${m[1]}`);
      }
    }

    // Extract vehicle hero images per color (usually <img> with alt="Front Suzuki ... in 'Color Name'")
    const heroImages = [...html.matchAll(/<img[^>]*src="([^"]*)"[^>]*alt="Front[^"]*(?:in a? &quot;|in (?:a )?"?)([^"&]+)(?:&quot;|"?)[^"]*colour"[^>]*/gi)];
    if (heroImages.length > 0) {
      console.log(`  Hero images per color:`);
      for (const m of heroImages) {
        console.log(`    ${m[2].trim()}: ${m[1].substring(0, 100)}`);
      }
    }

    // Also look for swatch image pattern
    const swatchImgs = [...html.matchAll(/<img[^>]*(?:class="[^"]*swatch|class="[^"]*colour)[^>]*src="([^"]*)"/gi)];
    if (swatchImgs.length > 0) {
      console.log(`  Swatch images: ${swatchImgs.length}`);
      [...new Set(swatchImgs.map(m => m[1]))].forEach(u => console.log(`    ${u}`));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
