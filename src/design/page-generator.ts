/**
 * Page Generator — Two-stage AI pipeline for OEM model page generation
 *
 * Stage 1 (Gemini 2.5 Pro Vision): Analyzes screenshot + HTML to extract
 * structured visual data — hero images, section layout, image URLs, key specs.
 *
 * Stage 2 (Claude Sonnet 4.5): Takes Gemini's extraction + DB data and
 * generates the final VehicleModelPage JSON with polished HTML content.
 *
 * Output matches the VehicleModelPage interface consumed by
 * the promotion-knoxgwmhaval Nuxt app at pages/models/[slug].vue.
 */

import type {
  OemId,
  OemDesignProfile,
  VehicleModelPage,
  PageGenerationResult,
} from '../oem/types';
import type { AiRouter, InferenceResponse } from '../ai/router';
import type { DesignAgent } from './agent';
import { OEM_BRAND_NOTES } from './agent';
import type { DesignMemoryManager } from './memory';
import type { SupabaseClient } from '@supabase/supabase-js';
import { allOemIds } from '../oem/registry';

// ============================================================================
// Utilities
// ============================================================================

/** Strip markdown code fences (```json ... ```) that LLMs sometimes add despite instructions */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

// ============================================================================
// Configuration
// ============================================================================

const R2_PREFIX = 'pages/definitions';
const R2_ASSETS_PREFIX = 'pages/assets';
const MAX_HTML_LENGTH = 80_000; // Truncate cleaned HTML to fit Gemini context
const MIN_CONTENT_LENGTH = 500; // Minimum content.rendered length
const MAX_IMAGE_DOWNLOADS = 30; // Limit concurrent image downloads per page
const IMAGE_DOWNLOAD_TIMEOUT = 8_000; // 8s per image download

// ============================================================================
// Data Assembly
// ============================================================================

interface ModelData {
  model: { slug: string; name: string; source_url: string; brochure_url: string | null };
  products: Array<{
    title: string;
    price_amount: number | null;
    price_type: string | null;
    body_type: string | null;
    fuel_type: string | null;
    key_features: string[];
    specs_json: Record<string, any> | null;
  }>;
  colors: Array<{
    color_name: string;
    color_code: string | null;
    swatch_url: string | null;
    hero_image_url: string | null;
  }>;
  pricing: Array<{
    product_title: string;
    state: string;
    driveaway_price: number | null;
  }>;
  accessories: Array<{
    name: string;
    price: number | null;
    category: string | null;
  }>;
  offers: Array<{
    title: string;
    offer_type: string | null;
    price_amount: number | null;
    saving_amount: number | null;
  }>;
}

/** Structured output from Stage 1 (Gemini visual extraction) */
interface VisualExtraction {
  hero: {
    desktop_image_url: string;
    mobile_image_url: string;
    heading: string;
    sub_heading: string;
    cta_text: string;
  };
  key_specs: Array<{ label: string; value: string }>;
  sections: Array<{
    type: string; // e.g. "features", "specs", "gallery", "technology", "safety", "colors"
    title: string;
    image_urls: string[];
    description: string;
  }>;
  all_image_urls: string[];
  page_style: {
    primary_color: string;
    tone: string; // e.g. "premium", "sporty", "rugged", "family"
    layout_style: string; // e.g. "full-width-sections", "card-grid", "editorial"
  };
}

async function assembleModelData(
  supabase: SupabaseClient,
  oemId: OemId,
  modelSlug: string,
): Promise<ModelData | null> {
  // 1. Get the vehicle model
  const { data: modelRows } = await supabase
    .from('vehicle_models')
    .select('slug, name, source_url, brochure_url')
    .eq('oem_id', oemId)
    .eq('slug', modelSlug)
    .limit(1);

  const model = modelRows?.[0];
  if (!model) return null;

  // 2. Get products for this model
  const { data: productRows } = await supabase
    .from('products')
    .select('id, title, price_amount, price_type, body_type, fuel_type, key_features, specs_json')
    .eq('oem_id', oemId)
    .ilike('title', `%${model.name}%`)
    .order('price_amount', { ascending: true });

  const products = productRows || [];
  const productIds = products.map((p: any) => p.id);

  // 3. Get colors for these products
  let colors: ModelData['colors'] = [];
  if (productIds.length > 0) {
    const { data: colorRows } = await supabase
      .from('variant_colors')
      .select('color_name, color_code, swatch_url, hero_image_url')
      .in('product_id', productIds)
      .limit(50);
    colors = colorRows || [];
  }

  // 4. Get pricing for these products
  let pricing: ModelData['pricing'] = [];
  if (productIds.length > 0) {
    const { data: pricingRows } = await supabase
      .from('variant_pricing')
      .select('product_id, state, driveaway_price')
      .in('product_id', productIds);

    pricing = (pricingRows || []).map((row: any) => ({
      product_title: products.find((p: any) => p.id === row.product_id)?.title || '',
      state: row.state,
      driveaway_price: row.driveaway_price,
    }));
  }

  // 5. Get accessories for this model
  const { data: accessoryRows } = await supabase
    .from('accessory_models')
    .select('accessory_id, accessories(name, price, category)')
    .eq('vehicle_model_id', model.slug)
    .limit(30);

  let accessories: ModelData['accessories'] = [];
  if (accessoryRows && accessoryRows.length > 0) {
    accessories = accessoryRows.map((row: any) => ({
      name: row.accessories?.name || '',
      price: row.accessories?.price || null,
      category: row.accessories?.category || null,
    }));
  }

  // 6. Get relevant offers
  const { data: offerRows } = await supabase
    .from('offers')
    .select('title, offer_type, price_amount, saving_amount')
    .eq('oem_id', oemId)
    .or(`applicable_models.cs.{${model.name}},applicable_models.cs.{${modelSlug}}`)
    .limit(10);

  const offers = offerRows || [];

  return { model, products, colors, pricing, accessories, offers };
}

// ============================================================================
// Stage 1 Prompt — Gemini Visual Extraction
// ============================================================================

function buildExtractionPrompt(cleanedHtml: string): string {
  const html = cleanedHtml.length > MAX_HTML_LENGTH
    ? cleanedHtml.substring(0, MAX_HTML_LENGTH) + '\n<!-- truncated -->'
    : cleanedHtml;

  return `Analyze this OEM vehicle model page screenshot and HTML. Extract structured visual data.

## Source HTML
\`\`\`html
${html}
\`\`\`

## Task
Extract the following from the screenshot and HTML. Focus on WHAT you see — image URLs, layout structure, visual hierarchy. Do NOT generate content or marketing copy.

Return a JSON object with this structure:

{
  "hero": {
    "desktop_image_url": "Absolute URL of the main hero/banner image",
    "mobile_image_url": "Mobile version URL (or same as desktop if not found)",
    "heading": "The main heading text visible on the hero",
    "sub_heading": "The subheading or tagline on the hero",
    "cta_text": "The primary call-to-action button text"
  },
  "key_specs": [
    { "label": "Engine", "value": "2.0L Turbo" },
    { "label": "Power", "value": "180kW" },
    { "label": "Transmission", "value": "8-Speed Auto" }
  ],
  "sections": [
    {
      "type": "features|specs|gallery|technology|safety|colors|interior|performance|design|accessories",
      "title": "Section heading as it appears on the page",
      "image_urls": ["Absolute URLs of images in this section"],
      "description": "Brief factual description of what this section shows (1-2 sentences)"
    }
  ],
  "all_image_urls": ["Every absolute image URL found on the page, deduplicated"],
  "page_style": {
    "primary_color": "Hex color of the brand/accent color used on the page",
    "tone": "premium|sporty|rugged|family|luxury|eco|adventure",
    "layout_style": "full-width-sections|card-grid|editorial|magazine|minimal"
  }
}

## Rules
- All image URLs must be absolute (https://...)
- Extract real URLs from the HTML src/srcset attributes, not placeholder text
- Order sections as they appear on the page (top to bottom)
- For key_specs, extract 3-5 headline specifications visible on the page
- If a section has no images, return an empty array for image_urls
- Return ONLY the JSON, no markdown fences`;
}

// ============================================================================
// Stage 2 Prompt — Claude Content Generation
// ============================================================================

/** Format OEM name for display (e.g., 'kia-au' → 'Kia', 'gwm-au' → 'GWM') */
function formatOemName(oemId: OemId): string {
  const names: Record<string, string> = {
    'kia-au': 'Kia', 'gwm-au': 'GWM', 'hyundai-au': 'Hyundai',
    'toyota-au': 'Toyota', 'mazda-au': 'Mazda', 'nissan-au': 'Nissan',
    'ford-au': 'Ford', 'mitsubishi-au': 'Mitsubishi', 'subaru-au': 'Subaru',
    'suzuki-au': 'Suzuki', 'isuzu-au': 'Isuzu', 'kgm-au': 'KGM',
    'volkswagen-au': 'Volkswagen', 'ldv-au': 'LDV',
  };
  return names[oemId] || oemId.replace('-au', '').toUpperCase();
}

function buildContentPrompt(
  oemId: OemId,
  modelData: ModelData,
  extraction: VisualExtraction,
  profileOverride?: OemDesignProfile,
): string {
  const oemName = formatOemName(oemId);
  const brand = OEM_BRAND_NOTES[oemId];
  // Prefer design memory profile over hardcoded brand notes
  const primaryColor = profileOverride?.brand_tokens?.primary_color || brand?.colors?.[0] || '#333333';
  const secondaryColors = profileOverride?.brand_tokens?.secondary_colors || brand?.colors?.slice(1) || [];
  const brandNotes = brand?.notes || '';

  const productsJson = JSON.stringify(modelData.products.slice(0, 10), null, 2);
  const colorsJson = JSON.stringify(modelData.colors.slice(0, 20), null, 2);
  const pricingJson = JSON.stringify(modelData.pricing.slice(0, 20), null, 2);
  const offersJson = JSON.stringify(modelData.offers.slice(0, 5), null, 2);
  const accessoriesJson = JSON.stringify(modelData.accessories.slice(0, 15), null, 2);
  const extractionJson = JSON.stringify(extraction, null, 2);

  // Build specs summary from first product's specs_json
  const specs = modelData.products[0]?.specs_json;
  let specsBlock = '';
  if (specs) {
    specsBlock = `\n### Technical Specifications (from first variant)\n\`\`\`json\n${JSON.stringify(specs, null, 2)}\n\`\`\`\n`;
  }

  return `You are replicating the design language of ${oemName}'s official Australian website for the ${modelData.model.name}.

## Brand Identity (CRITICAL — replicate this OEM's style)
- **Brand**: ${oemName} Australia
- **Primary Color**: ${primaryColor}
${secondaryColors.length > 0 ? `- **Secondary Colors**: ${secondaryColors.join(', ')}` : ''}
- **Design Language**: ${brandNotes}
- **Page Tone**: ${extraction.page_style.tone}
- **Layout Style**: ${extraction.page_style.layout_style}

Your goal is to produce HTML that looks as close as possible to ${oemName}'s actual model page.
Use their brand colors for headings, CTAs, accents, and section dividers — NOT generic gray.
The generated page should feel like a natural extension of ${oemName}'s website.

## Visual Extraction (from OEM page analysis)
${extractionJson}

## Database Records

### Products/Variants
${productsJson}
${specsBlock}
### Color Options
${colorsJson}

### State Driveaway Pricing (AUD)
${pricingJson}

### Current Offers
${offersJson}

### Popular Accessories
${accessoriesJson}

## Task
Generate a complete VehicleModelPage JSON object. Faithfully replicate ${oemName}'s visual design using their brand colors, layout patterns, and section structure. Use the database records for accurate data.

Return this exact JSON structure:

{
  "id": "${oemId}-${modelData.model.slug}",
  "slug": "${modelData.model.slug}",
  "name": "${modelData.model.name}",
  "header": {
    "slides": [{
      "heading": "${modelData.model.name}",
      "sub_heading": "Tagline from visual extraction or brand-appropriate tagline",
      "button": "Book a Test Drive",
      "desktop": "hero.desktop_image_url from visual extraction",
      "mobile": "hero.mobile_image_url from visual extraction",
      "bottom_strip": [
        { "heading": "Spec Label", "sub_heading": "Spec Value" }
      ]
    }]
  },
  "content": {
    "rendered": "<div>Full HTML content body</div>"
  },
  "form": true,
  "variant_link": "/models/${modelData.model.slug}/variants"
}

## Content Body Rules (content.rendered)

This HTML renders BELOW the hero section and variant carousel (both handled separately). Generate the body content only.

### Section Ordering (follow this hierarchy)
1. **Highlights** — 2-3 key selling points with images (if available from extraction)
2. **Variants** — Price comparison cards for each variant/grade
3. **Specifications** — Key specs in a clean grid layout
4. **Colour Range** — Color swatches/hero images from the colors data
5. **Current Offers** — Promotional banners (if offers exist)
6. **Accessories** — Top accessories grid (if available)
7. **Brochure CTA** — Download brochure button (if brochure_url exists)

### Brand-Faithful Styling
- Use Tailwind/UnoCSS utility classes exclusively
- **Brand color usage** — apply \`${primaryColor}\` via inline style for:
  - Section headings: \`style="color: ${primaryColor}"\`
  - CTA buttons: \`style="background-color: ${primaryColor}"\` with \`text-white\`
  - Accent borders: \`style="border-color: ${primaryColor}"\`
  - Price highlights: \`style="color: ${primaryColor}"\`
- **Layout patterns**:
  - Full-width sections with generous padding: \`py-16 px-6 md:px-12\`
  - Alternate section backgrounds: white → \`bg-gray-50\` → white for visual rhythm
  - Image-heavy: use large hero-style images, not thumbnails
  - Cards: \`rounded-xl shadow-lg overflow-hidden\`
- **Typography hierarchy**:
  - Section titles: \`text-3xl md:text-4xl font-bold mb-6\`
  - Subtitles: \`text-xl font-semibold\`
  - Body: \`text-gray-600 leading-relaxed\`
  - Price display: \`text-2xl font-bold\` with brand color

### Images — CRITICAL RULES
- **ONLY use image URLs provided in the data above** (hero_image_url, swatch_url from Color Options, image_urls from Visual Extraction)
- **NEVER invent, generate, or use placeholder image URLs** (no unsplash.com, no placehold.co, no picsum.photos, no stock photo URLs)
- If no image URL is available for a section, use a colored background div instead — do NOT fabricate an image URL
- Use hero_image_url from variant_colors as prominent vehicle images
- Use image URLs from visual extraction sections (all_image_urls)
- All \`src\` values MUST come from the data provided above
- Include descriptive \`alt\` text on all images
- Use \`loading="lazy"\` on images below the fold
- Display vehicle images large: \`w-full aspect-video object-cover\`

### Data Integration
- Display REAL pricing from the database (driveaway prices per state)
- Show variant comparison with actual price_amount values
- Render color swatches using swatch_url (small circles) and hero_image_url (large vehicle shots)
- Show color_name beneath each swatch
- If offers exist, display as a highlighted promotional section with saving amounts
- Include top 5-8 accessories with prices in a grid

### Brochure
${modelData.model.brochure_url ? `- Include a "Download Brochure" CTA button linking to: ${modelData.model.brochure_url}
- Style it with brand color background: \`style="background-color: ${primaryColor}"\` + \`text-white rounded-lg px-8 py-4 text-lg font-semibold\`
- Place in a dedicated section near the bottom` : '- No brochure available for this model — skip this section'}

### Content Quality
- Write concise, brand-appropriate marketing copy matching ${oemName}'s voice
- Match the tone: ${extraction.page_style.tone} (e.g. premium = refined language, sporty = dynamic language, rugged = tough/capable language)
- Do NOT include navigation, header, footer, or variant carousel
- Do NOT use generic gray for accents — always use the brand's ${primaryColor}
- Target 4000-8000 characters of HTML

## Header Rules
- Use hero image URLs from the visual extraction (or first variant_color hero_image_url)
- Use key_specs from the visual extraction for bottom_strip (limit to 3-4 items)
- The heading should be the model name: "${modelData.model.name}"
- The sub_heading should capture ${oemName}'s brand voice

Return ONLY the JSON object. No markdown fences, no explanation.`;
}

// ============================================================================
// Kimi K2.5 Screenshot-to-Code Prompt
// ============================================================================

function buildScreenshotToCodePrompt(
  oemId: OemId,
  modelData: ModelData,
  imageUrlMapping: Map<string, string>,
  profileOverride?: OemDesignProfile,
): string {
  const oemName = formatOemName(oemId);
  const brand = OEM_BRAND_NOTES[oemId];
  const primaryColor = profileOverride?.brand_tokens?.primary_color || brand?.colors?.[0] || '#333333';

  // Build available images list (R2 URLs that Claude can reference)
  const availableImages: string[] = [];
  for (const [, r2Url] of imageUrlMapping) {
    availableImages.push(r2Url);
  }
  // Also include DB color images
  for (const color of modelData.colors) {
    if (color.hero_image_url) availableImages.push(color.hero_image_url);
    if (color.swatch_url) availableImages.push(color.swatch_url);
  }

  const productsJson = JSON.stringify(modelData.products.slice(0, 10), null, 2);
  const colorsJson = JSON.stringify(modelData.colors.slice(0, 20), null, 2);
  const pricingJson = JSON.stringify(modelData.pricing.slice(0, 20), null, 2);
  const offersJson = JSON.stringify(modelData.offers.slice(0, 5), null, 2);
  const accessoriesJson = JSON.stringify(modelData.accessories.slice(0, 15), null, 2);

  // Specs from first product
  const specs = modelData.products[0]?.specs_json;
  let specsBlock = '';
  if (specs) {
    specsBlock = `\n### Technical Specifications\n\`\`\`json\n${JSON.stringify(specs, null, 2)}\n\`\`\`\n`;
  }

  return `You are an expert HTML/CSS developer. Your task is to recreate the web page shown in the screenshot as faithfully as possible.

## CRITICAL INSTRUCTIONS

1. **Pixel-faithful reproduction**: Match the layout, colors, typography, spacing, and visual hierarchy of the screenshot EXACTLY
2. **Use REAL data**: Replace any text/numbers visible in the screenshot with the real data provided below
3. **Use REAL images**: ONLY use image URLs from the lists provided below. NEVER invent or fabricate image URLs.
4. **Tailwind CSS**: Use Tailwind utility classes for styling
5. **Brand color**: ${oemName}'s primary brand color is ${primaryColor}

## Available Image URLs (USE ONLY THESE)
${availableImages.slice(0, 30).map(url => `- ${url}`).join('\n')}

## Real Data to Inject

### Products/Variants (use real prices and names)
${productsJson}
${specsBlock}
### Color Options
${colorsJson}

### State Driveaway Pricing (AUD)
${pricingJson}

### Current Offers
${offersJson}

### Accessories
${accessoriesJson}

### Brochure
${modelData.model.brochure_url ? `Download URL: ${modelData.model.brochure_url}` : 'No brochure available'}

## Output Format

Return a JSON object with this exact structure:

{
  "id": "${oemId}-${modelData.model.slug}",
  "slug": "${modelData.model.slug}",
  "name": "${modelData.model.name}",
  "header": {
    "slides": [{
      "heading": "${modelData.model.name}",
      "sub_heading": "Tagline matching the screenshot",
      "button": "Book a Test Drive",
      "desktop": "URL of the hero image from the Available Images list above",
      "mobile": "Same or alternate hero image URL",
      "bottom_strip": [
        { "heading": "Spec Label", "sub_heading": "Spec Value" }
      ]
    }]
  },
  "content": {
    "rendered": "<div>Full HTML body content replicating the screenshot layout</div>"
  },
  "form": true,
  "variant_link": "/models/${modelData.model.slug}/variants"
}

## Rules for content.rendered

- Replicate the EXACT section layout, visual hierarchy, and design patterns from the screenshot
- Match the screenshot's color scheme (headings, buttons, accents, backgrounds)
- Use the same section ordering as the screenshot
- Replace placeholder or generic images with URLs from the Available Images list ONLY
- Use real product names, prices, and specifications from the data above
- Include all sections visible in the screenshot
- Use Tailwind utility classes
- Apply \`loading="lazy"\` to images below the fold
- Do NOT include navigation, header, footer, or scripts
- Do NOT invent any URLs — only use URLs from the Available Images list

Return ONLY the JSON object. No markdown fences, no explanation.`;
}

// ============================================================================
// Validation
// ============================================================================

function validatePage(page: VehicleModelPage): string[] {
  const errors: string[] = [];

  if (!page.slug) errors.push('Missing slug');
  if (!page.name) errors.push('Missing name');

  // Header validation
  if (!page.header?.slides?.length) {
    errors.push('Missing header slides');
  } else {
    const slide = page.header.slides[0];
    if (!slide.heading) errors.push('Missing hero heading');
    if (!slide.desktop) errors.push('Missing hero desktop image URL');
  }

  // Content validation
  if (!page.content?.rendered) {
    errors.push('Missing content.rendered');
  } else if (page.content.rendered.length < MIN_CONTENT_LENGTH) {
    errors.push(`content.rendered too short (${page.content.rendered.length} chars, minimum ${MIN_CONTENT_LENGTH})`);
  }

  // Check for relative URLs in content
  const relativeUrlMatch = page.content?.rendered?.match(/src=["'](?!https?:\/\/|data:)/);
  if (relativeUrlMatch) {
    errors.push(`Found relative URL in content: ${relativeUrlMatch[0]}`);
  }

  return errors;
}

// ============================================================================
// PageGenerator Class
// ============================================================================

export class PageGenerator {
  private supabase: SupabaseClient;
  private aiRouter: AiRouter;
  private designAgent: DesignAgent;
  private r2Bucket: R2Bucket;
  private browser: Fetcher;
  private memoryManager?: DesignMemoryManager;

  constructor(deps: {
    supabase: SupabaseClient;
    aiRouter: AiRouter;
    designAgent: DesignAgent;
    r2Bucket: R2Bucket;
    browser: Fetcher;
    memoryManager?: DesignMemoryManager;
  }) {
    this.supabase = deps.supabase;
    this.aiRouter = deps.aiRouter;
    this.designAgent = deps.designAgent;
    this.r2Bucket = deps.r2Bucket;
    this.browser = deps.browser;
    this.memoryManager = deps.memoryManager;
  }

  /**
   * Download images from OEM CDN and upload to R2 for permanent storage.
   * Returns a mapping of original URL → R2 public URL.
   */
  private async extractAndUploadImages(
    oemId: OemId,
    modelSlug: string,
    imageUrls: string[],
    workerBaseUrl: string,
  ): Promise<Map<string, string>> {
    const urlMapping = new Map<string, string>();
    const seenFilenames = new Set<string>();

    // OEM-specific headers for CDN access (mirrors media.ts OEM_HEADERS)
    const oemHeaders: Record<string, Record<string, string>> = {
      'kia-au': { Origin: 'https://www.kia.com', Referer: 'https://www.kia.com/au/' },
      'kgm-au': { Origin: 'https://kgm.com.au', Referer: 'https://kgm.com.au/' },
      'gwm-au': { Origin: 'https://www.gwmanz.com', Referer: 'https://www.gwmanz.com/' },
      'isuzu-au': { Origin: 'https://www.isuzuute.com.au', Referer: 'https://www.isuzuute.com.au/' },
      'nissan-au': { Origin: 'https://www.nissan.com.au', Referer: 'https://www.nissan.com.au/' },
      'hyundai-au': { Origin: 'https://www.hyundai.com', Referer: 'https://www.hyundai.com/au/en/' },
      'mazda-au': { Origin: 'https://www.mazda.com.au', Referer: 'https://www.mazda.com.au/' },
      'ford-au': { Origin: 'https://www.ford.com.au', Referer: 'https://www.ford.com.au/' },
      'suzuki-au': { Origin: 'https://www.suzuki.com.au', Referer: 'https://www.suzuki.com.au/' },
      'toyota-au': { Origin: 'https://www.toyota.com.au', Referer: 'https://www.toyota.com.au/' },
      'mitsubishi-au': { Origin: 'https://www.mitsubishi-motors.com.au', Referer: 'https://www.mitsubishi-motors.com.au/' },
      'subaru-au': { Origin: 'https://www.subaru.com.au', Referer: 'https://www.subaru.com.au/' },
      'volkswagen-au': { Origin: 'https://www.volkswagen.com.au', Referer: 'https://www.volkswagen.com.au/' },
      'ldv-au': { Origin: 'https://www.ldvautomotive.com.au', Referer: 'https://www.ldvautomotive.com.au/' },
    };

    // Filter: skip URLs already pointing to our Worker (media proxy)
    const workerHost = new URL(workerBaseUrl).hostname;
    const uniqueUrls = [...new Set(imageUrls)]
      .filter(url => {
        try {
          const u = new URL(url);
          return u.hostname !== workerHost; // Skip our own media proxy URLs
        } catch { return false; }
      })
      .slice(0, MAX_IMAGE_DOWNLOADS);

    console.log(`[PageGenerator] Downloading ${uniqueUrls.length} images for ${oemId}/${modelSlug}`);

    let failCount = 0;
    const extraHeaders = oemHeaders[oemId] || {};

    // Download in parallel batches of 5
    const batchSize = 5;
    for (let i = 0; i < uniqueUrls.length; i += batchSize) {
      const batch = uniqueUrls.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (originalUrl) => {
          try {
            // Extract a clean filename from the URL
            const urlObj = new URL(originalUrl);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            let filename = pathParts[pathParts.length - 1] || 'image';

            // Clean filename: keep only safe chars
            filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

            // Ensure unique filenames
            if (seenFilenames.has(filename)) {
              const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
              const base = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
              filename = `${base}_${i}_${batch.indexOf(originalUrl)}${ext}`;
            }
            seenFilenames.add(filename);

            // Download with OEM-specific headers
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT);

            const response = await fetch(originalUrl, {
              headers: {
                'Accept': 'image/webp,image/avif,image/png,image/jpeg,image/*,*/*',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
                ...extraHeaders,
              },
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              failCount++;
              console.warn(`[PageGenerator] Image download ${response.status}: ${originalUrl.substring(0, 80)}`);
              return;
            }

            const contentType = response.headers.get('content-type') || 'image/jpeg';

            // Skip non-image responses (HTML error pages etc.)
            if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
              failCount++;
              return;
            }

            const imageData = await response.arrayBuffer();

            // Skip tiny images (likely tracking pixels)
            if (imageData.byteLength < 500) return;

            // Upload to R2
            const r2Key = `${R2_ASSETS_PREFIX}/${oemId}/${modelSlug}/${filename}`;
            await this.r2Bucket.put(r2Key, imageData, {
              httpMetadata: { contentType },
            });

            // Build the public URL using the media route
            const publicUrl = `${workerBaseUrl}/media/pages/${oemId}/${modelSlug}/${filename}`;
            urlMapping.set(originalUrl, publicUrl);
          } catch (err) {
            failCount++;
            console.warn(`[PageGenerator] Image download error: ${originalUrl?.substring(0, 80)}`, err);
          }
        }),
      );
    }

    console.log(`[PageGenerator] Uploaded ${urlMapping.size}/${uniqueUrls.length} images to R2 (${failCount} failed)`);
    return urlMapping;
  }

  /**
   * Replace OEM CDN URLs with R2 URLs in the visual extraction data.
   */
  private replaceUrlsInExtraction(
    extraction: VisualExtraction,
    urlMapping: Map<string, string>,
  ): VisualExtraction {
    const replace = (url: string): string => urlMapping.get(url) || url;

    return {
      ...extraction,
      hero: {
        ...extraction.hero,
        desktop_image_url: replace(extraction.hero.desktop_image_url),
        mobile_image_url: replace(extraction.hero.mobile_image_url),
      },
      sections: extraction.sections.map(s => ({
        ...s,
        image_urls: s.image_urls.map(replace),
      })),
      all_image_urls: extraction.all_image_urls.map(replace),
    };
  }

  /**
   * Replace OEM CDN URLs with R2 URLs in the model data (colors).
   */
  private replaceUrlsInModelData(
    modelData: ModelData,
    urlMapping: Map<string, string>,
  ): ModelData {
    const replace = (url: string | null): string | null =>
      url ? (urlMapping.get(url) || url) : null;

    return {
      ...modelData,
      colors: modelData.colors.map(c => ({
        ...c,
        hero_image_url: replace(c.hero_image_url),
        swatch_url: replace(c.swatch_url),
      })),
    };
  }

  /**
   * Generate a VehicleModelPage using the two-stage AI pipeline.
   *
   * Stage 1 — Gemini Vision: Screenshot + HTML → structured visual extraction
   * Stage 2 — Claude Sonnet: Visual extraction + DB data → final VehicleModelPage JSON
   */
  async generateModelPage(
    oemId: OemId,
    modelSlug: string,
    workerBaseUrl?: string,
  ): Promise<PageGenerationResult> {
    const startTime = Date.now();
    const validationErrors: string[] = [];

    try {
      // Step 1: Assemble database data
      let modelData = await assembleModelData(this.supabase, oemId, modelSlug);
      if (!modelData) {
        return {
          success: false,
          generation_time_ms: Date.now() - startTime,
          validation_errors: [],
          error: `Model not found: ${oemId}/${modelSlug}`,
        };
      }

      // Step 2: Get screenshot — check R2 for pre-captured, then try live browser
      let screenshotBase64 = '';
      let cleanedHtml = '';
      let capturedImageUrls: string[] = [];

      // 2a. Check R2 for a pre-captured screenshot (uploaded via Chrome MCP or prior run)
      let screenshotMimeType = 'image/png';
      const screenshotR2Key = `pages/captures/${oemId}/${modelSlug}/desktop.png`;
      try {
        const existingScreenshot = await this.r2Bucket.get(screenshotR2Key);
        if (existingScreenshot) {
          const bytes = new Uint8Array(await existingScreenshot.arrayBuffer());
          // Chunked base64 encoding to avoid stack overflow with large images
          const CHUNK = 8192;
          let binary = '';
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
          }
          screenshotBase64 = btoa(binary);
          screenshotMimeType = existingScreenshot.httpMetadata?.contentType || 'image/png';
          console.log(`[PageGenerator] Found pre-captured screenshot in R2 for ${oemId}/${modelSlug} (${bytes.length} bytes, ${screenshotMimeType})`);
        }
      } catch (r2Error) {
        console.warn(`[PageGenerator] R2 screenshot lookup failed:`, r2Error);
      }

      // 2b. If no pre-captured screenshot, try live browser capture
      if (!screenshotBase64) {
        try {
          const capture = await this.designAgent.capturePageForGeneration(
            modelData.model.source_url,
            this.browser,
          );
          screenshotBase64 = capture.screenshotBase64;
          cleanedHtml = capture.cleanedHtml;
          capturedImageUrls = capture.extractedImageUrls || [];
        } catch (captureError) {
          console.warn(`[PageGenerator] Browser capture failed for ${modelData.model.source_url}:`, captureError);
        }
      }

      // ================================================================
      // Image Extraction: Download OEM images → R2
      // ================================================================
      const baseUrl = workerBaseUrl || 'https://oem-agent.adme-dev.workers.dev';

      // Collect all image URLs from: browser DOM + DB colors
      const allImageUrls = new Set<string>();

      // From browser capture
      for (const url of capturedImageUrls) allImageUrls.add(url);

      // From DB variant_colors
      for (const color of modelData.colors) {
        if (color.hero_image_url?.startsWith('http')) allImageUrls.add(color.hero_image_url);
        if (color.swatch_url?.startsWith('http')) allImageUrls.add(color.swatch_url);
      }

      console.log(`[PageGenerator] Collected ${allImageUrls.size} unique image URLs for ${oemId}/${modelSlug}`);

      // Download and upload to R2
      const urlMapping = await this.extractAndUploadImages(
        oemId,
        modelSlug,
        [...allImageUrls],
        baseUrl,
      );

      // Replace OEM CDN URLs with R2 URLs in model data
      if (urlMapping.size > 0) {
        modelData = this.replaceUrlsInModelData(modelData, urlMapping);
      }

      // ================================================================
      // AI Generation: Kimi K2.5 (screenshot) or Gemini+Claude (fallback)
      // ================================================================

      // Load design profile for brand token injection (prefer memory over hardcoded)
      let designProfile: OemDesignProfile | undefined;
      if (this.memoryManager) {
        try {
          designProfile = await this.memoryManager.getOemProfile(oemId);
        } catch (err) {
          console.warn('[PageGenerator] Failed to load design profile:', err);
        }
      }

      let page: VehicleModelPage;
      let geminiTokens = 0;
      let geminiCost = 0;
      let claudeTokens = 0;
      let claudeCost = 0;

      if (screenshotBase64) {
        // ── PRIMARY: Kimi K2.5 Screenshot-to-Code ──────────────────────
        console.log(`[PageGenerator] Using Kimi K2.5 screenshot-to-code for ${oemId}/${modelSlug}`);

        const kimiPrompt = buildScreenshotToCodePrompt(oemId, modelData, urlMapping, designProfile);

        const kimiResponse: InferenceResponse = await this.aiRouter.route({
          taskType: 'page_screenshot_to_code',
          prompt: kimiPrompt,
          imageBase64: screenshotBase64,
          imageMimeType: screenshotMimeType,
          oemId,
          requireJson: true,
          maxTokens: 32768,
        });

        // Track as "claude" cost slots for backward compat in response
        claudeTokens = kimiResponse.usage.total_tokens;
        claudeCost = (kimiResponse.usage.prompt_tokens / 1_000_000) * 0.60 +
                     (kimiResponse.usage.completion_tokens / 1_000_000) * 2.50;

        try {
          const parsed = JSON.parse(stripCodeFences(kimiResponse.content));
          page = {
            ...parsed,
            oem_id: oemId,
            generated_at: new Date().toISOString(),
            source_url: modelData.model.source_url,
            version: 1,
          };
        } catch (parseError) {
          return {
            success: false,
            generation_time_ms: Date.now() - startTime,
            validation_errors: [],
            claude_tokens_used: claudeTokens,
            claude_cost_usd: claudeCost,
            total_cost_usd: claudeCost,
            images_uploaded: urlMapping.size,
            error: `Failed to parse Kimi K2.5 response as JSON: ${parseError}`,
          };
        }
      } else {
        // ── FALLBACK: Gemini Extract + Claude Generate ─────────────────
        console.log(`[PageGenerator] Fallback: Gemini+Claude pipeline for ${oemId}/${modelSlug} (no screenshot)`);

        const extraction = buildFallbackExtraction(modelData, oemId, designProfile);

        // Replace URLs in extraction too
        let finalExtraction = extraction;
        if (urlMapping.size > 0) {
          finalExtraction = this.replaceUrlsInExtraction(extraction, urlMapping);
        }

        const contentPrompt = buildContentPrompt(oemId, modelData, finalExtraction, designProfile);

        const claudeResponse: InferenceResponse = await this.aiRouter.route({
          taskType: 'page_content_generation',
          prompt: contentPrompt,
          oemId,
          requireJson: true,
          maxTokens: 16384,
        });

        claudeTokens = claudeResponse.usage.total_tokens;
        claudeCost = (claudeResponse.usage.prompt_tokens / 1_000_000) * 3.0 +
                     (claudeResponse.usage.completion_tokens / 1_000_000) * 15.0;

        try {
          const parsed = JSON.parse(stripCodeFences(claudeResponse.content));
          page = {
            ...parsed,
            oem_id: oemId,
            generated_at: new Date().toISOString(),
            source_url: modelData.model.source_url,
            version: 1,
          };
        } catch (parseError) {
          return {
            success: false,
            generation_time_ms: Date.now() - startTime,
            validation_errors: [],
            claude_tokens_used: claudeTokens,
            claude_cost_usd: claudeCost,
            total_cost_usd: claudeCost,
            images_uploaded: urlMapping.size,
            error: `Failed to parse Claude response as JSON: ${parseError}`,
          };
        }
      }

      // Step 5: Validate
      const errors = validatePage(page);
      validationErrors.push(...errors);

      // Step 6: Store in R2
      const r2Key = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
      const versionedKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;
      const pageJson = JSON.stringify(page, null, 2);

      const pipelineUsed = screenshotBase64 ? 'kimi-screenshot-to-code' : 'claude-fallback';
      await this.r2Bucket.put(r2Key, pageJson, {
        httpMetadata: { contentType: 'application/json' },
        customMetadata: {
          oem_id: oemId,
          model_slug: modelSlug,
          generated_at: page.generated_at,
          pipeline: pipelineUsed,
        },
      });

      await this.r2Bucket.put(versionedKey, pageJson, {
        httpMetadata: { contentType: 'application/json' },
      });

      // Store screenshot in R2 if available
      if (screenshotBase64) {
        const screenshotKey = `pages/captures/${oemId}/${modelSlug}/desktop.png`;
        const screenshotBytes = Uint8Array.from(atob(screenshotBase64), c => c.charCodeAt(0));
        await this.r2Bucket.put(screenshotKey, screenshotBytes, {
          httpMetadata: { contentType: 'image/png' },
        });
      }

      return {
        success: errors.length === 0,
        page,
        r2_key: r2Key,
        generation_time_ms: Date.now() - startTime,
        gemini_tokens_used: geminiTokens,
        gemini_cost_usd: geminiCost,
        claude_tokens_used: claudeTokens,
        claude_cost_usd: claudeCost,
        total_cost_usd: geminiCost + claudeCost,
        images_uploaded: urlMapping.size,
        validation_errors: validationErrors,
        _debug: {
          colors_count: modelData.colors.length,
          products_count: modelData.products.length,
          image_urls_collected: allImageUrls.size,
          has_screenshot: !!screenshotBase64,
          pipeline: screenshotBase64 ? 'kimi-screenshot-to-code' : 'gemini-extract+claude-generate',
        },
      };
    } catch (error) {
      return {
        success: false,
        generation_time_ms: Date.now() - startTime,
        validation_errors: validationErrors,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Read a generated page from R2.
   */
  async getGeneratedPage(
    oemId: OemId,
    modelSlug: string,
  ): Promise<VehicleModelPage | null> {
    const r2Key = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
    const obj = await this.r2Bucket.get(r2Key);
    if (!obj) return null;
    return obj.json();
  }

  /**
   * Read a generated page by slug (searches all OEMs).
   */
  async getPageBySlug(slug: string): Promise<VehicleModelPage | null> {
    // Try each known OEM ID as prefix (e.g. "gwm-au-haval-h6" → oem_id=gwm-au, model=haval-h6)
    for (const oemId of allOemIds) {
      const prefix = `${oemId}-`;
      if (slug.startsWith(prefix) && slug.length > prefix.length) {
        const modelSlug = slug.slice(prefix.length);
        const page = await this.getGeneratedPage(oemId, modelSlug);
        if (page) return page;
      }
    }

    // Fallback: try exact slug match against all OEMs
    for (const oemId of allOemIds) {
      const page = await this.getGeneratedPage(oemId, slug);
      if (page) return page;
    }

    return null;
  }

  /**
   * List all generated pages for an OEM.
   */
  async listGeneratedPages(oemId: OemId): Promise<string[]> {
    const prefix = `${R2_PREFIX}/${oemId}/`;
    const listing = await this.r2Bucket.list({ prefix, delimiter: '/' });
    return listing.delimitedPrefixes.map(p => p.replace(prefix, '').replace('/', ''));
  }
}

// ============================================================================
// Fallback Extraction (when browser capture fails)
// ============================================================================

/** OEM tone mapping — matches each brand's marketing personality */
const OEM_TONE: Record<string, string> = {
  'kia-au': 'sporty',
  'toyota-au': 'pragmatic',
  'mazda-au': 'premium',
  'nissan-au': 'adventurous',
  'ford-au': 'rugged',
  'mitsubishi-au': 'adventurous',
  'subaru-au': 'adventurous',
  'suzuki-au': 'family',
  'isuzu-au': 'rugged',
  'kgm-au': 'family',
  'gwm-au': 'premium',
  'hyundai-au': 'premium',
  'volkswagen-au': 'premium',
  'ldv-au': 'rugged',
};

/** OEM layout style mapping — matches each brand's page structure */
const OEM_LAYOUT: Record<string, string> = {
  'kia-au': 'full-width-sections',
  'gwm-au': 'card-grid',
  'hyundai-au': 'full-width-sections',
  'toyota-au': 'editorial',
  'mazda-au': 'editorial',
  'nissan-au': 'full-width-sections',
  'ford-au': 'full-width-sections',
  'volkswagen-au': 'minimal',
  'mitsubishi-au': 'full-width-sections',
  'subaru-au': 'full-width-sections',
  'suzuki-au': 'card-grid',
  'isuzu-au': 'full-width-sections',
  'kgm-au': 'card-grid',
  'ldv-au': 'full-width-sections',
};

function buildFallbackExtraction(modelData: ModelData, oemId?: OemId, profileOverride?: OemDesignProfile): VisualExtraction {
  const brand = oemId ? OEM_BRAND_NOTES[oemId] : undefined;
  const primaryColor = profileOverride?.brand_tokens?.primary_color || brand?.colors?.[0] || '#333333';
  const tone = (oemId ? OEM_TONE[oemId] : undefined) || 'premium';
  const layoutStyle = (oemId ? OEM_LAYOUT[oemId] : undefined) || 'full-width-sections';

  // Use first hero image from variant_colors
  const heroImages = modelData.colors
    .map(c => c.hero_image_url)
    .filter((url): url is string => !!url);
  const firstHero = heroImages[0] || '';

  // Build key_specs from specs_json of the first product
  const specs = modelData.products[0]?.specs_json;
  const keySpecs: Array<{ label: string; value: string }> = [];
  if (specs) {
    if (specs.engine?.displacement_cc) {
      keySpecs.push({ label: 'Engine', value: `${(specs.engine.displacement_cc / 1000).toFixed(1)}L ${specs.engine.fuel_type || ''}`.trim() });
    }
    if (specs.engine?.power_kw) {
      keySpecs.push({ label: 'Power', value: `${specs.engine.power_kw}kW` });
    }
    if (specs.transmission?.type) {
      keySpecs.push({ label: 'Transmission', value: `${specs.transmission.gears ? specs.transmission.gears + '-Speed ' : ''}${specs.transmission.type}` });
    }
    if (specs.transmission?.drive) {
      keySpecs.push({ label: 'Drive', value: specs.transmission.drive });
    }
    if (specs.performance?.fuel_combined_l100km) {
      keySpecs.push({ label: 'Fuel Economy', value: `${specs.performance.fuel_combined_l100km}L/100km` });
    }
  }
  // Fallback to key_features if no specs_json
  if (keySpecs.length === 0 && modelData.products[0]?.key_features?.length) {
    modelData.products[0].key_features.slice(0, 4).forEach(f => {
      keySpecs.push({ label: f, value: '' });
    });
  }

  // Build sections from available DB data
  const sections: VisualExtraction['sections'] = [];

  // Gallery section from color hero images
  if (heroImages.length > 1) {
    sections.push({
      type: 'gallery',
      title: `${modelData.model.name} Gallery`,
      image_urls: heroImages.slice(0, 8),
      description: `Explore the ${modelData.model.name} from every angle`,
    });
  }

  // Specs section
  if (keySpecs.length > 0) {
    sections.push({
      type: 'specs',
      title: 'Specifications',
      image_urls: [],
      description: `Key specifications for the ${modelData.model.name} range`,
    });
  }

  // Colors section
  if (modelData.colors.length > 0) {
    const swatchUrls = modelData.colors
      .map(c => c.swatch_url)
      .filter((url): url is string => !!url);
    sections.push({
      type: 'colors',
      title: 'Colour Range',
      image_urls: swatchUrls.slice(0, 12),
      description: `Choose from ${modelData.colors.length} available colours`,
    });
  }

  // Offers section
  if (modelData.offers.length > 0) {
    sections.push({
      type: 'features',
      title: 'Current Offers',
      image_urls: [],
      description: `${modelData.offers.length} special offers available`,
    });
  }

  // Accessories section
  if (modelData.accessories.length > 0) {
    sections.push({
      type: 'accessories',
      title: 'Accessories',
      image_urls: [],
      description: `Personalise your ${modelData.model.name} with genuine accessories`,
    });
  }

  return {
    hero: {
      desktop_image_url: firstHero,
      mobile_image_url: firstHero,
      heading: modelData.model.name,
      sub_heading: '',
      cta_text: 'Book a Test Drive',
    },
    key_specs: keySpecs.slice(0, 5),
    sections,
    all_image_urls: heroImages,
    page_style: {
      primary_color: primaryColor,
      tone,
      layout_style: layoutStyle,
    },
  };
}
