/**
 * Recipe Extractor — Screenshot-to-Recipe Pipeline
 *
 * Captures a full-page screenshot via Cloudflare Browser (puppeteer),
 * sends it to Kimi K2.5 Vision, and returns structured section recipes
 * describing the visual patterns found on the page.
 */

import type { OemId } from '../oem/types';
import { AI_ROUTER_CONFIG } from '../ai/router';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedRecipe {
  pattern: string;
  variant: string;
  label: string;
  resolves_to: string;
  defaults_json: Record<string, any>;
  confidence: number;
}

export interface RecipeExtractorDeps {
  browser: Fetcher;
  togetherApiKey: string;
}

// ============================================================================
// Prompt Builder
// ============================================================================

function buildRecipeExtractionPrompt(oemId: OemId): string {
  return `You are an expert UI/UX analyst. Analyze this webpage screenshot and identify the distinct visual sections.

For each section you identify, output a recipe object with:
- pattern: one of "hero", "card-grid", "split-content", "media", "tabs", "data-display", "action-bar", "utility"
- variant: descriptive variant name (e.g., "image-overlay", "icon-title-body", "text-left-image-right")
- label: human-readable label for this recipe (e.g., "Feature Cards (3-col)")
- resolves_to: the section type this maps to. Options: hero, feature-cards, intro, content-block, gallery, video, tabs, specs-grid, comparison-table, color-picker, cta-banner, sticky-bar, enquiry-form, heading, alert, divider, testimonial, stats, logo-strip, embed, pricing-table, countdown, finance-calculator, image, image-showcase, accordion
- defaults_json: styling defaults including:
  - For card-grid: columns (2/3/4), card_composition (array of slots like "image", "icon", "title", "body", "cta"), card_style (background, border, shadow, text_align, border_radius, gap, padding)
  - For hero: heading_size, text_align, text_color, overlay_position, min_height
  - For split-content: image_position (left/right), layout
  - For action-bar: background_color, cta_text
  - section_style: background color, padding
- confidence: 0.0 to 1.0 how confident you are this section exists

Focus on STRUCTURAL patterns, not content. Output JSON: { "recipes": [...] }

OEM: ${oemId}`;
}

// ============================================================================
// RecipeExtractor
// ============================================================================

export class RecipeExtractor {
  private browser: Fetcher;
  private togetherApiKey: string;

  constructor(deps: RecipeExtractorDeps) {
    this.browser = deps.browser;
    this.togetherApiKey = deps.togetherApiKey;
  }

  /**
   * Capture a screenshot of the given URL, send it to Kimi K2.5 Vision,
   * and return the extracted section recipes sorted by confidence.
   */
  async extractRecipes(url: string, oemId: OemId): Promise<ExtractedRecipe[]> {
    const controller = new AbortController();
    const overallTimeout = setTimeout(() => controller.abort(), 60_000);

    try {
      // Step 1: Capture full-page screenshot
      const screenshot = await this.captureScreenshot(url);

      // Step 2: Convert to base64 (chunked to avoid stack overflow)
      const bytes = new Uint8Array(screenshot);
      let binary = '';
      const chunkSize = 0x8000; // 32KB chunks
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const base64Image = btoa(binary);

      // Step 3: Send to Kimi K2.5 Vision
      const prompt = buildRecipeExtractionPrompt(oemId);
      const recipes = await this.callVisionApi(prompt, base64Image, controller.signal);

      // Step 4: Filter low-confidence and sort descending
      return recipes
        .filter((r) => r.confidence > 0.5)
        .sort((a, b) => b.confidence - a.confidence);
    } finally {
      clearTimeout(overallTimeout);
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Capture a full-page PNG screenshot using Cloudflare Browser (puppeteer).
   * Follows the exact pattern from page-cloner.ts.
   */
  private async captureScreenshot(url: string): Promise<Uint8Array> {
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

      console.log(`[RecipeExtractor] Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15_000 });
      // Brief settle time for late-loading elements
      await new Promise((r) => setTimeout(r, 2000));

      console.log(`[RecipeExtractor] Taking full-page screenshot...`);
      const screenshotBuffer = (await page.screenshot({
        type: 'png',
        fullPage: true,
      })) as Buffer;

      const bytes = new Uint8Array(screenshotBuffer);
      console.log(`[RecipeExtractor] Screenshot: ${Math.round(bytes.length / 1024)}KB`);
      return bytes;
    } catch (error) {
      throw new Error(
        `[RecipeExtractor] Screenshot failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await browser.close();
    }
  }

  /**
   * Call Kimi K2.5 Vision API with the screenshot and extraction prompt.
   */
  private async callVisionApi(
    prompt: string,
    base64Image: string,
    signal: AbortSignal,
  ): Promise<ExtractedRecipe[]> {
    const response = await fetch(`${AI_ROUTER_CONFIG.kimi_k2_5.api_base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.togetherApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_ROUTER_CONFIG.kimi_k2_5.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        ...AI_ROUTER_CONFIG.kimi_k2_5.thinking_mode_params,
        response_format: { type: 'json_object' },
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`[RecipeExtractor] Kimi K2.5 API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('[RecipeExtractor] Empty response from Kimi K2.5');
    }

    let parsed: { recipes?: ExtractedRecipe[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`[RecipeExtractor] Invalid JSON from Kimi K2.5: ${content.slice(0, 200)}`);
    }

    if (!Array.isArray(parsed.recipes)) {
      throw new Error('[RecipeExtractor] Response missing "recipes" array');
    }

    return parsed.recipes;
  }
}
