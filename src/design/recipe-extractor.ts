/**
 * Recipe Extractor — Screenshot-to-Recipe Pipeline
 *
 * Captures a full-page screenshot via Cloudflare Browser (puppeteer),
 * sends it to Kimi K2.5 Vision, and returns structured section recipes
 * describing the visual patterns found on the page.
 */

import type { OemId } from '../oem/types';
import { GEMINI_CONFIG, GEMINI_31_CONFIG, GEMMA4_CONFIG } from '../ai/router';

// ============================================================================
// Types
// ============================================================================

export type VisionProvider = 'gemini' | 'workers_ai';

export interface ExtractedRecipe {
  pattern: string;
  variant: string;
  label: string;
  resolves_to: string;
  defaults_json: Record<string, any>;
  confidence: number;
  bounds?: { top_pct: number; height_pct: number };
}

export interface ExtractionResult {
  suggestions: ExtractedRecipe[];
  screenshot_base64: string;
  model_used: string;
}

export interface RecipeExtractorDeps {
  browser: Fetcher;
  googleApiKey?: string;
  /** Workers AI binding for Gemma 4 vision */
  aiBinding?: Ai;
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
- bounds: { top_pct: number (0-100), height_pct: number (0-100) } — the vertical position and height of this section as a percentage of the full page height. top_pct=0 is the very top of the page.

Focus on STRUCTURAL patterns, not content. Output JSON: { "recipes": [...] }

OEM: ${oemId}`;
}

// ============================================================================
// RecipeExtractor
// ============================================================================

export class RecipeExtractor {
  private browser: Fetcher;
  private googleApiKey?: string;
  private aiBinding?: Ai;

  constructor(deps: RecipeExtractorDeps) {
    this.browser = deps.browser;
    this.googleApiKey = deps.googleApiKey;
    this.aiBinding = deps.aiBinding;
  }

  /**
   * Determine which vision provider to use.
   * Prefers Workers AI (Gemma 4) when available — zero egress, on-network.
   * Falls back to Gemini 3.1 Pro when Workers AI binding is not available.
   */
  private resolveProvider(override?: VisionProvider): VisionProvider {
    if (override) return override;
    if (this.aiBinding) return 'workers_ai';
    if (this.googleApiKey) return 'gemini';
    throw new Error('[RecipeExtractor] No vision provider available — need either env.AI or GOOGLE_API_KEY');
  }

  /**
   * Capture a screenshot of the given URL, send it to a vision model,
   * and return the extracted section recipes sorted by confidence plus the screenshot.
   */
  async extractRecipes(url: string, oemId: OemId, provider?: VisionProvider): Promise<ExtractionResult> {
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

      // Step 3: Send to vision model
      const prompt = buildRecipeExtractionPrompt(oemId);
      const resolvedProvider = this.resolveProvider(provider);
      let recipes: ExtractedRecipe[];
      let modelUsed: string;

      if (resolvedProvider === 'workers_ai') {
        recipes = await this.callWorkersAiVision(prompt, base64Image);
        modelUsed = GEMMA4_CONFIG.model;
      } else {
        recipes = await this.callGeminiVision(prompt, base64Image, controller.signal);
        modelUsed = GEMINI_31_CONFIG.model;
      }

      // Step 4: Filter low-confidence and sort descending
      const suggestions = recipes
        .filter((r) => r.confidence > 0.5)
        .sort((a, b) => b.confidence - a.confidence);

      return { suggestions, screenshot_base64: base64Image, model_used: modelUsed };
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
   * Call Gemini 3.1 Pro Vision API with the screenshot and extraction prompt.
   */
  private async callGeminiVision(
    prompt: string,
    base64Image: string,
    signal: AbortSignal,
  ): Promise<ExtractedRecipe[]> {
    if (!this.googleApiKey) {
      throw new Error('[RecipeExtractor] GOOGLE_API_KEY not set for Gemini provider');
    }

    const model = GEMINI_31_CONFIG.model;
    const url = `${GEMINI_CONFIG.api_base}/models/${model}:generateContent?key=${this.googleApiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64Image } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: GEMINI_31_CONFIG.default_params.temperature,
          maxOutputTokens: GEMINI_31_CONFIG.default_params.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`[RecipeExtractor] Gemini 3.1 Pro API error: ${response.status} — ${error.slice(0, 200)}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const candidates = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    const content = candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('[RecipeExtractor] Empty response from Gemini 3.1 Pro');
    }

    return this.parseRecipeResponse(content, 'Gemini 3.1 Pro');
  }

  /**
   * Call Workers AI (Gemma 4 26B A4B) for vision-based recipe extraction.
   * Zero egress, on-network — runs directly on Cloudflare's infrastructure.
   */
  private async callWorkersAiVision(
    prompt: string,
    base64Image: string,
  ): Promise<ExtractedRecipe[]> {
    if (!this.aiBinding) {
      throw new Error('[RecipeExtractor] Workers AI binding (env.AI) not available');
    }

    console.log(`[RecipeExtractor] Using Workers AI: ${GEMMA4_CONFIG.model}`);

    const response = await this.aiBinding.run(GEMMA4_CONFIG.model as any, {
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } },
          { type: 'text', text: prompt + '\n\nRespond with valid JSON only. Format: { "recipes": [...] }' },
        ],
      }],
      temperature: GEMMA4_CONFIG.default_params.temperature,
      max_tokens: GEMMA4_CONFIG.default_params.max_tokens,
    }) as any;

    const content = typeof response === 'string'
      ? response
      : response?.response || response?.choices?.[0]?.message?.content || '';

    if (!content) {
      throw new Error('[RecipeExtractor] Empty response from Workers AI (Gemma 4)');
    }

    return this.parseRecipeResponse(content, 'Gemma 4 26B (Workers AI)');
  }

  /**
   * Parse and validate recipe JSON from any vision model response.
   */
  private parseRecipeResponse(content: string, modelName: string): ExtractedRecipe[] {
    // Strip markdown code fences if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: { recipes?: ExtractedRecipe[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`[RecipeExtractor] Invalid JSON from ${modelName}: ${cleaned.slice(0, 200)}`);
    }

    if (!Array.isArray(parsed.recipes)) {
      throw new Error(`[RecipeExtractor] Response from ${modelName} missing "recipes" array`);
    }

    return parsed.recipes;
  }
}
