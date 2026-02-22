/**
 * Page Cloner v2 — AI-Designed Tailwind Pages from OEM Content
 *
 * 1. Puppeteer navigates to OEM model page, extracts structured content
 *    (headings, images, copy text, brand colors, sections)
 * 2. Enriches with Supabase data (specs, colors, pricing, brochure)
 * 3. Kimi K2 (via Groq) generates a clean Tailwind CSS page
 * 4. Images downloaded to R2, URLs rewritten to proxy paths
 * 5. Result stored as VehicleModelPage in R2
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OemId, VehicleModelPage } from '../oem/types';
import type { DesignMemoryManager } from './memory';

// ============================================================================
// Types
// ============================================================================

export interface PageCloneResult {
  success: boolean;
  page?: VehicleModelPage;
  r2_key?: string;
  clone_time_ms: number;
  elements_extracted?: number;
  images_uploaded?: number;
  sections_found?: number;
  bot_blocked?: boolean;
  error?: string;
}

interface ExtractedContent {
  /** Page title / model name from the page */
  title: string;
  /** Hero section: headline, subheadline, CTA text, background image */
  hero: {
    headline: string;
    subheadline: string;
    cta_text: string;
    image_url: string;
  };
  /** Content sections extracted from the page */
  sections: Array<{
    type: 'features' | 'gallery' | 'specs' | 'text' | 'cta' | 'unknown';
    heading: string;
    text: string;
    image_urls: string[];
  }>;
  /** Brand colors detected via getComputedStyle */
  brand: {
    primary_color: string;
    secondary_color: string;
    text_color: string;
    bg_color: string;
    font_family: string;
  };
  /** All image URLs found on the page */
  all_image_urls: string[];
  /** Full-page screenshot as base64 JPEG for vision model */
  screenshot_base64?: string;
}

interface SupabaseEnrichment {
  model_name: string;
  oem_name: string;
  brochure_url?: string;
  source_url: string;
  products: Array<{
    title: string;
    price_amount?: number;
    price_type?: string;
    body_type?: string;
    fuel_type?: string;
    key_features?: string[];
    specs?: Record<string, any>;
  }>;
  colors: Array<{
    color_name: string;
    color_code?: string;
    swatch_url?: string;
    hero_image_url?: string;
  }>;
  pricing: Array<{
    product_title: string;
    state: string;
    driveaway_price: number;
  }>;
}

const R2_PREFIX = 'pages/definitions';
const R2_ASSETS_PREFIX = 'pages/assets';
const MAX_IMAGE_DOWNLOADS = 40;
const IMAGE_DOWNLOAD_TIMEOUT = 8_000;

// Selectors tried in order to find the main content container
const CONTAINER_SELECTORS = [
  'main', '[role="main"]', '#content', '#main-content',
  '.main-content', '.page-content', '.site-content',
  '#container', '#wrap', '.wrapper', 'article',
];

// ============================================================================
// PageCloner Class
// ============================================================================

export class PageCloner {
  private r2Bucket: R2Bucket;
  private browser: Fetcher;
  private moonshotApiKey: string;
  private supabase: SupabaseClient;
  private memoryManager?: DesignMemoryManager;

  constructor(deps: {
    r2Bucket: R2Bucket;
    browser: Fetcher;
    moonshotApiKey: string;
    supabase: SupabaseClient;
    memoryManager?: DesignMemoryManager;
  }) {
    this.r2Bucket = deps.r2Bucket;
    this.browser = deps.browser;
    this.moonshotApiKey = deps.moonshotApiKey;
    this.supabase = deps.supabase;
    this.memoryManager = deps.memoryManager;
  }

  async cloneModelPage(
    oemId: OemId,
    modelSlug: string,
    sourceUrl: string,
    modelName?: string,
  ): Promise<PageCloneResult> {
    const startTime = Date.now();

    try {
      // ================================================================
      // Step 1: Extract content from live OEM page via Puppeteer
      // ================================================================
      const extraction = await this.extractPageContent(sourceUrl);
      if ('bot_blocked' in extraction) {
        return {
          success: false,
          clone_time_ms: Date.now() - startTime,
          bot_blocked: true,
          error: 'Cloudflare challenge detected',
        };
      }

      console.log(`[PageCloner] Extracted: "${extraction.title}", ${extraction.sections.length} sections, ${extraction.all_image_urls.length} images`);

      // Override unreliable getComputedStyle brand colors with design memory profile
      if (this.memoryManager) {
        try {
          const profile = await this.memoryManager.getOemProfile(oemId);
          if (profile.brand_tokens.primary_color) {
            extraction.brand.primary_color = profile.brand_tokens.primary_color;
          }
          if (profile.brand_tokens.font_family) {
            extraction.brand.font_family = profile.brand_tokens.font_family;
          }
        } catch (err) {
          console.warn('[PageCloner] Failed to load design profile, using extracted brand:', err);
        }
      }
      console.log(`[PageCloner] Brand: ${extraction.brand.primary_color} / ${extraction.brand.font_family}`);

      // ================================================================
      // Step 2: Enrich with Supabase data
      // ================================================================
      const enrichment = await this.getSupabaseEnrichment(oemId, modelSlug, modelName || extraction.title, sourceUrl);

      // ================================================================
      // Step 3: Download images to R2
      // ================================================================
      const allImageUrls = new Set(extraction.all_image_urls);
      // Add Supabase color images
      for (const c of enrichment.colors) {
        if (c.hero_image_url?.startsWith('http')) allImageUrls.add(c.hero_image_url);
        if (c.swatch_url?.startsWith('http')) allImageUrls.add(c.swatch_url);
      }

      const imageUrls = [...allImageUrls].slice(0, MAX_IMAGE_DOWNLOADS);
      const urlMapping = await this.downloadImages(oemId, modelSlug, imageUrls);

      // Replace URLs in extraction data
      const replaceUrl = (url: string) => urlMapping.get(url) || url;

      if (extraction.hero.image_url) {
        extraction.hero.image_url = replaceUrl(extraction.hero.image_url);
      }
      for (const section of extraction.sections) {
        section.image_urls = section.image_urls.map(replaceUrl);
      }
      for (const color of enrichment.colors) {
        if (color.hero_image_url) color.hero_image_url = replaceUrl(color.hero_image_url);
        if (color.swatch_url) color.swatch_url = replaceUrl(color.swatch_url);
      }

      // ================================================================
      // Step 4: AI generates Tailwind page
      // ================================================================
      console.log(`[PageCloner] Generating Tailwind page with Kimi K2...`);
      const tailwindHtml = await this.generateTailwindPage(extraction, enrichment);
      console.log(`[PageCloner] Generated ${tailwindHtml.length} chars of Tailwind HTML`);

      // ================================================================
      // Step 5: Assemble VehicleModelPage and store in R2
      // ================================================================
      const name = modelName || enrichment.model_name || extraction.title;

      const pageData: VehicleModelPage = {
        id: `${oemId}-${modelSlug}`,
        slug: modelSlug,
        name,
        oem_id: oemId,
        header: {
          slides: extraction.hero.image_url ? [{
            heading: extraction.hero.headline || name,
            sub_heading: extraction.hero.subheadline || '',
            button: extraction.hero.cta_text || '',
            desktop: extraction.hero.image_url,
            mobile: extraction.hero.image_url,
            bottom_strip: [],
          }] : [],
        },
        content: { rendered: tailwindHtml },
        form: false,
        variant_link: `/models/${modelSlug}/variants`,
        generated_at: new Date().toISOString(),
        source_url: sourceUrl,
        version: 1,
      };

      const r2Key = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
      const versionedKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;
      const pageJson = JSON.stringify(pageData, null, 2);

      await this.r2Bucket.put(r2Key, pageJson, {
        httpMetadata: { contentType: 'application/json' },
        customMetadata: {
          oem_id: oemId,
          model_slug: modelSlug,
          generated_at: pageData.generated_at,
          pipeline: 'ai-tailwind-v2',
        },
      });
      await this.r2Bucket.put(versionedKey, pageJson, {
        httpMetadata: { contentType: 'application/json' },
      });

      return {
        success: true,
        page: pageData,
        r2_key: r2Key,
        clone_time_ms: Date.now() - startTime,
        elements_extracted: extraction.sections.length,
        images_uploaded: urlMapping.size,
        sections_found: extraction.sections.length,
      };
    } catch (error) {
      console.error(`[PageCloner] Error:`, error);
      return {
        success: false,
        clone_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================================
  // Step 1: Puppeteer Content Extraction
  // ============================================================================

  private async extractPageContent(
    sourceUrl: string,
  ): Promise<ExtractedContent | { bot_blocked: true }> {
    const puppeteerModule = await import('@cloudflare/puppeteer');
    const puppeteer = puppeteerModule.default;
    const browser = await puppeteer.launch(this.browser as any);

    try {
      const page = await browser.newPage();

      const viewportWidth = 1440 + Math.floor(Math.random() * 480);
      await page.setViewport({ width: viewportWidth, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-AU,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      });
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      console.log(`[PageCloner] Navigating to ${sourceUrl}`);
      await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 45_000 });
      await new Promise(r => setTimeout(r, 3000));

      // Bot check
      const html = await page.content();
      if (html.length < 5000 && (html.includes('cf-challenge') || html.includes('Just a moment'))) {
        return { bot_blocked: true };
      }

      // Take full-page screenshot for vision model
      console.log(`[PageCloner] Taking full-page screenshot...`);
      const screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality: 70,
        fullPage: true,
      }) as Buffer;
      // Convert to base64 in chunks to avoid stack overflow
      const bytes = new Uint8Array(screenshotBuffer);
      let binary = '';
      const chunkSize = 0x8000; // 32KB chunks
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const screenshotBase64 = btoa(binary);
      console.log(`[PageCloner] Screenshot: ${Math.round(screenshotBase64.length / 1024)}KB base64`);

      // Extract structured content
      const extraction = await page.evaluate((containerSelectors: string[]) => {
        const baseUrl = document.location.origin;

        function abs(url: string): string {
          if (!url || url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
          if (url.startsWith('//')) return 'https:' + url;
          try { return new URL(url, document.location.href).href; } catch { return baseUrl + '/' + url; }
        }

        /** Extract best image URL from an element (handles <img>, <picture>, srcset, background-image) */
        function getImageUrl(el: Element): string {
          // <picture> → first <source> srcset or fallback <img>
          if (el.tagName === 'PICTURE') {
            const source = el.querySelector('source[srcset]') as HTMLSourceElement;
            if (source?.srcset) {
              const best = source.srcset.split(',').pop()?.trim().split(/\s+/)[0];
              if (best) return abs(best);
            }
            const img = el.querySelector('img') as HTMLImageElement;
            if (img?.src) return abs(img.src);
            if (img?.srcset) {
              const best = img.srcset.split(',').pop()?.trim().split(/\s+/)[0];
              if (best) return abs(best);
            }
          }
          // <img> with srcset or src
          if (el.tagName === 'IMG') {
            const img = el as HTMLImageElement;
            if (img.srcset) {
              const best = img.srcset.split(',').pop()?.trim().split(/\s+/)[0];
              if (best) return abs(best);
            }
            if (img.src) return abs(img.src);
          }
          // CSS background-image
          if (el instanceof HTMLElement) {
            const bg = window.getComputedStyle(el).backgroundImage;
            const m = bg?.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
            if (m) return m[1];
          }
          return '';
        }

        // Find main container
        let container: Element = document.body;
        for (const sel of containerSelectors) {
          try {
            const el = document.querySelector(sel);
            if (el && el.innerHTML.length > 1000) { container = el; break; }
          } catch {}
        }

        // Extract hero section
        const hero = { headline: '', subheadline: '', cta_text: '', image_url: '' };
        {
          // Try <picture> elements first (modern responsive images — used by Kia etc.)
          const pictures = container.querySelectorAll('picture');
          for (const pic of pictures) {
            const rect = pic.getBoundingClientRect();
            if (rect.width > 600 && rect.top < 800) {
              hero.image_url = getImageUrl(pic);
              if (hero.image_url) break;
            }
          }
          // Try large <img> with srcset or src
          if (!hero.image_url) {
            const imgs = container.querySelectorAll('img');
            for (const img of imgs) {
              const rect = img.getBoundingClientRect();
              if (rect.width > 600 && rect.top < 800) {
                hero.image_url = getImageUrl(img);
                if (hero.image_url) break;
              }
            }
          }
          // Try background-image on hero-like containers
          if (!hero.image_url) {
            const heroSels = ['.hero', '.banner', '[class*="hero"]', '[class*="banner"]', '[class*="kv-"]', '.splash'];
            for (const sel of heroSels) {
              try {
                const el = container.querySelector(sel) as HTMLElement;
                if (el) {
                  hero.image_url = getImageUrl(el);
                  if (hero.image_url) break;
                  // Check children for <picture> or <img>
                  const pic = el.querySelector('picture');
                  if (pic) { hero.image_url = getImageUrl(pic); if (hero.image_url) break; }
                  const img = el.querySelector('img');
                  if (img) { hero.image_url = getImageUrl(img); if (hero.image_url) break; }
                }
              } catch {}
            }
          }
          // Find hero headline
          const h1 = container.querySelector('h1');
          if (h1) hero.headline = h1.textContent?.trim() || '';
          if (h1?.nextElementSibling) {
            const tag = h1.nextElementSibling.tagName.toLowerCase();
            if (['p', 'h2', 'span', 'div'].includes(tag)) {
              hero.subheadline = h1.nextElementSibling.textContent?.trim().substring(0, 200) || '';
            }
          }
          const cta = container.querySelector('a[class*="btn"], a[class*="cta"], button[class*="btn"]') as HTMLElement;
          if (cta) hero.cta_text = cta.textContent?.trim().substring(0, 50) || '';
        }

        // Extract content sections
        const sections: Array<{
          type: 'features' | 'gallery' | 'specs' | 'text' | 'cta' | 'unknown';
          heading: string;
          text: string;
          image_urls: string[];
        }> = [];

        const sectionEls = container.querySelectorAll('section, [class*="section"], [class*="module"], [class*="block"]');
        const processed = new Set<Element>();

        Array.from(sectionEls.length > 0 ? sectionEls : container.children).forEach((el: Element) => {
          if (processed.has(el)) return;
          if (!(el instanceof HTMLElement)) return;
          if (el.offsetHeight < 50) return;
          processed.add(el);

          const heading = el.querySelector('h2, h3')?.textContent?.trim().substring(0, 100) || '';
          const text = el.querySelector('p, .description, [class*="desc"]')?.textContent?.trim().substring(0, 500) || '';
          const imgs: string[] = [];

          // Collect images from <picture>, <img> with srcset, <img> with src, and background-image
          el.querySelectorAll('picture').forEach(pic => {
            const url = getImageUrl(pic);
            if (url && url.startsWith('http')) imgs.push(url);
          });
          el.querySelectorAll('img').forEach(img => {
            const url = getImageUrl(img);
            if (url && url.startsWith('http') && !url.includes('tracking') && !url.includes('pixel') && !imgs.includes(url)) {
              imgs.push(url);
            }
          });
          // Check the section element itself and direct children for background images
          const bgUrl = getImageUrl(el);
          if (bgUrl && bgUrl.startsWith('http') && !imgs.includes(bgUrl)) imgs.push(bgUrl);
          for (const child of el.children) {
            if (child instanceof HTMLElement && child.offsetHeight > 100) {
              const childBg = getImageUrl(child);
              if (childBg && childBg.startsWith('http') && !imgs.includes(childBg)) imgs.push(childBg);
            }
          }

          if (!heading && !text && imgs.length === 0) return;

          const classes = el.className?.toLowerCase() || '';
          const headingLower = heading.toLowerCase();
          let type: typeof sections[0]['type'] = 'unknown';
          if (classes.includes('feature') || headingLower.includes('feature')) type = 'features';
          else if (classes.includes('gallery') || headingLower.includes('gallery') || imgs.length > 3) type = 'gallery';
          else if (classes.includes('spec') || headingLower.includes('spec') || headingLower.includes('dimension')) type = 'specs';
          else if (classes.includes('cta') || classes.includes('enquir')) type = 'cta';
          else if (text.length > 100) type = 'text';

          sections.push({ type, heading, text, image_urls: imgs });
        });

        // Detect brand colors
        const brand = { primary_color: '', secondary_color: '', text_color: '', bg_color: '', font_family: '' };
        {
          const bodyStyle = window.getComputedStyle(document.body);
          brand.bg_color = bodyStyle.backgroundColor || '#ffffff';
          brand.text_color = bodyStyle.color || '#000000';
          brand.font_family = bodyStyle.fontFamily?.split(',')[0]?.trim().replace(/['"]/g, '') || 'sans-serif';

          const btn = container.querySelector('a[class*="btn"], button[class*="btn"], a[class*="cta"]') as HTMLElement;
          if (btn) {
            const btnStyle = window.getComputedStyle(btn);
            brand.primary_color = btnStyle.backgroundColor || '#0066cc';
            brand.secondary_color = btnStyle.color || '#ffffff';
          }
          if (!brand.primary_color || brand.primary_color === 'rgba(0, 0, 0, 0)') {
            const h2 = container.querySelector('h2') as HTMLElement;
            if (h2) brand.primary_color = window.getComputedStyle(h2).color || '#333333';
          }
        }

        // Collect ALL image URLs (including <picture> srcsets and background-image)
        const allImages = new Set<string>();
        if (hero.image_url) allImages.add(hero.image_url);
        for (const s of sections) {
          for (const url of s.image_urls) allImages.add(url);
        }
        // Standalone images not in sections
        container.querySelectorAll('picture, img').forEach(el => {
          const url = getImageUrl(el);
          if (url && url.startsWith('http')) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 200 || el.tagName === 'PICTURE') allImages.add(url);
          }
        });
        // Background images on any visible element
        container.querySelectorAll('*').forEach(el => {
          if (!(el instanceof HTMLElement) || el.offsetHeight < 100) return;
          const bg = window.getComputedStyle(el).backgroundImage;
          const m = bg?.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
          if (m) allImages.add(m[1]);
        });

        return {
          title: hero.headline || document.title.split('|')[0].trim(),
          hero,
          sections,
          brand,
          all_image_urls: [...allImages],
        };
      }, CONTAINER_SELECTORS);

      return { ...extraction, screenshot_base64: screenshotBase64 };
    } finally {
      await browser.close();
    }
  }

  // ============================================================================
  // Step 2: Supabase Enrichment
  // ============================================================================

  private async getSupabaseEnrichment(
    oemId: OemId,
    modelSlug: string,
    modelName: string,
    sourceUrl: string,
  ): Promise<SupabaseEnrichment> {
    const oem = oemId.replace('-au', '').toUpperCase();

    // Model info
    const { data: modelRow } = await this.supabase
      .from('vehicle_models')
      .select('name, brochure_url')
      .eq('oem_id', oemId)
      .eq('slug', modelSlug)
      .single();

    // Products (variants/grades)
    const { data: productRows } = await this.supabase
      .from('products')
      .select('id, title, price_amount, price_type, body_type, fuel_type, key_features, specs_json')
      .eq('oem_id', oemId)
      .ilike('title', `%${modelRow?.name || modelName}%`)
      .order('price_amount', { ascending: true })
      .limit(20);

    const products = (productRows || []).map((p: any) => ({
      title: p.title,
      price_amount: p.price_amount,
      price_type: p.price_type,
      body_type: p.body_type,
      fuel_type: p.fuel_type,
      key_features: p.key_features,
      specs: p.specs_json,
    }));

    const productIds = (productRows || []).map((p: any) => p.id);

    // Colors
    let colors: SupabaseEnrichment['colors'] = [];
    if (productIds.length > 0) {
      const { data: colorRows } = await this.supabase
        .from('variant_colors')
        .select('color_name, color_code, swatch_url, hero_image_url')
        .in('product_id', productIds)
        .limit(30);
      colors = colorRows || [];
    }

    // Pricing
    let pricing: SupabaseEnrichment['pricing'] = [];
    if (productIds.length > 0) {
      const { data: pricingRows } = await this.supabase
        .from('variant_pricing')
        .select('product_id, state, driveaway_price')
        .in('product_id', productIds)
        .eq('state', 'nsw')
        .limit(20);
      pricing = (pricingRows || []).map((row: any) => ({
        product_title: products.find(p => productIds[products.indexOf(p)] === row.product_id)?.title || '',
        state: row.state,
        driveaway_price: row.driveaway_price,
      }));
    }

    return {
      model_name: modelRow?.name || modelName,
      oem_name: oem,
      brochure_url: modelRow?.brochure_url || undefined,
      source_url: sourceUrl,
      products,
      colors,
      pricing,
    };
  }

  // ============================================================================
  // Step 3: AI Generates Tailwind Page
  // ============================================================================

  private async generateTailwindPage(
    extraction: ExtractedContent,
    enrichment: SupabaseEnrichment,
  ): Promise<string> {
    // Build structured data for the AI
    const pageData = {
      model_name: enrichment.model_name,
      oem_name: enrichment.oem_name,
      hero: extraction.hero,
      brand: extraction.brand,
      sections: extraction.sections.slice(0, 8),
      products: enrichment.products.slice(0, 6).map(p => ({
        title: p.title,
        price: p.price_amount ? `$${p.price_amount.toLocaleString()}` : null,
        price_type: p.price_type,
        body_type: p.body_type,
        fuel_type: p.fuel_type,
        key_features: p.key_features?.slice(0, 5),
        engine: p.specs?.engine,
        transmission: p.specs?.transmission,
      })),
      colors: enrichment.colors.slice(0, 12).map(c => ({
        name: c.color_name,
        hex: c.color_code,
        swatch: c.swatch_url,
        hero: c.hero_image_url,
      })),
      pricing: enrichment.pricing.slice(0, 6),
      brochure_url: enrichment.brochure_url,
    };

    const prompt = `You are a senior automotive web designer. I'm showing you a screenshot of the real OEM model page. Generate a Tailwind CSS page that matches the visual design of the BODY CONTENT from this screenshot.

## Critical Rules
1. Output ONLY raw HTML — no \`\`\`html fences, no <html>/<head>/<body> tags
2. Start with: <script src="https://cdn.tailwindcss.com"></script>
3. Use ONLY Tailwind CSS classes — no <style> blocks, no custom CSS
4. **DO NOT include any site header, navigation bar, or footer.** Only the main page body content.
5. Use ONLY the real image URLs from the JSON data below — NEVER invent or guess URLs
6. For the hero section, use the "hero.image_url" from the data as a background image (bg-cover bg-center)
7. If a color has a "swatch" URL, use <img src="..."> — do NOT fake CSS circles
8. If a color has a "hero" URL, use it as the car-in-color image
9. For section feature images, use the "image_urls" from the sections data
10. If no image URL is provided in the data for a section, leave it out — do NOT hallucinate URLs
11. Make it responsive (mobile-first)

## What to replicate from the screenshot
- The layout structure and section ordering of the BODY (skip nav/footer)
- The color scheme, typography feel, and visual hierarchy
- Full-bleed hero with background image, overlay text, CTA button style
- Section backgrounds (alternating light/dark), card styles, spacing
- The premium automotive brand aesthetic

## What to replace with real data
- Use the structured data below instead of any text visible in the screenshot
- Real variant names, prices, specs from the database
- Real color swatches and hero images from the database
- Real brochure download URL

## Brand: ${enrichment.oem_name} ${enrichment.model_name}
- Primary: ${extraction.brand.primary_color}
- Font: ${extraction.brand.font_family}

## Data
\`\`\`json
${JSON.stringify(pageData, null, 2)}
\`\`\`

Generate the HTML now. Body content only — no nav, no footer.`;

    // Build multimodal message with screenshot + text
    const messageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    // Add screenshot if available
    if (extraction.screenshot_base64) {
      messageContent.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${extraction.screenshot_base64}` },
      });
    }

    messageContent.push({ type: 'text', text: prompt });

    const response = await fetch('https://api.moonshot.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.moonshotApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'kimi-k2.5',
        messages: [
          { role: 'user', content: messageContent },
        ],
        temperature: 1,
        max_tokens: 16384,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Moonshot API ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response — Kimi K2.5 returned no content');

    const usage = data.usage;
    if (usage) {
      console.log(`[PageCloner] Kimi K2.5: ${usage.prompt_tokens} in / ${usage.completion_tokens} out / ${usage.total_tokens} total`);
    }

    // Strip markdown code fences if present
    let html = content
      .replace(/^```html?\s*\n?/i, '')
      .replace(/\n?\s*```$/i, '')
      .trim();

    // Ensure Tailwind CDN is included
    if (!html.includes('cdn.tailwindcss.com')) {
      html = `<script src="https://cdn.tailwindcss.com"></script>\n${html}`;
    }

    return html;
  }

  // ============================================================================
  // Image Download
  // ============================================================================

  private async downloadImages(
    oemId: OemId,
    modelSlug: string,
    imageUrls: string[],
  ): Promise<Map<string, string>> {
    const urlMapping = new Map<string, string>();
    const seenFilenames = new Set<string>();

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

    const uniqueUrls = [...new Set(imageUrls)].filter(url => {
      try { new URL(url); return true; } catch { return false; }
    });

    console.log(`[PageCloner] Downloading ${uniqueUrls.length} images for ${oemId}/${modelSlug}`);

    let failCount = 0;
    const extraHeaders = oemHeaders[oemId] || {};

    const batchSize = 5;
    for (let i = 0; i < uniqueUrls.length; i += batchSize) {
      const batch = uniqueUrls.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (originalUrl, batchIdx) => {
          try {
            const urlObj = new URL(originalUrl);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            let filename = pathParts[pathParts.length - 1] || 'image';
            filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

            if (seenFilenames.has(filename)) {
              const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
              const base = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
              filename = `${base}_${i}_${batchIdx}${ext}`;
            }
            seenFilenames.add(filename);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT);

            const response = await fetch(originalUrl, {
              headers: {
                'Accept': 'image/webp,image/avif,image/png,image/jpeg,image/*,*/*',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
                ...extraHeaders,
              },
              signal: controller.signal,
            });

            clearTimeout(timeoutId);
            if (!response.ok) { failCount++; return; }

            const contentType = response.headers.get('content-type') || 'image/jpeg';
            if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
              failCount++;
              return;
            }

            const imageData = await response.arrayBuffer();
            if (imageData.byteLength < 500) return;

            const r2Key = `${R2_ASSETS_PREFIX}/${oemId}/${modelSlug}/${filename}`;
            await this.r2Bucket.put(r2Key, imageData, {
              httpMetadata: { contentType },
            });

            const proxyPath = `/media/pages/${oemId}/${modelSlug}/${filename}`;
            urlMapping.set(originalUrl, proxyPath);
          } catch {
            failCount++;
          }
        }),
      );
    }

    console.log(`[PageCloner] Uploaded ${urlMapping.size}/${uniqueUrls.length} images (${failCount} failed)`);
    return urlMapping;
  }
}
