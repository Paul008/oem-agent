/**
 * Page Structurer — Structured Section Extraction
 *
 * Takes a cloned OEM page (raw HTML from PageCapturer) and sends it to
 * Gemini 3.1 Pro for structured JSON extraction. The result is an array
 * of typed PageSection objects that the dashboard renders with
 * interactive Vue components instead of a static HTML iframe.
 *
 * Pipeline:  Clone (PageCapturer) → Structure (PageStructurer) → Render (Vue)
 */

import type {
  OemId,
  VehicleModelPage,
  PageSection,
  PageSectionType,
  PageStructuringResult,
} from '../oem/types';
import type { AiRouter } from '../ai/router';
import type { SmartPromptBuilder } from './prompt-builder';

const R2_PREFIX = 'pages/definitions';

const VALID_SECTION_TYPES: PageSectionType[] = [
  'hero', 'intro', 'tabs', 'color-picker', 'specs-grid',
  'gallery', 'feature-cards', 'video', 'cta-banner', 'content-block',
];

/** Strip HTML tags from a string, keeping only text content. */
function stripHtml(str: string | null | undefined): string {
  if (!str || typeof str !== 'string') return str ?? '';
  return str.replace(/<[^>]*>/g, '').trim();
}

// ============================================================================
// Extraction Prompt
// ============================================================================

function buildExtractionPrompt(html: string): string {
  return `You are a structured data extractor. Analyze the following OEM automotive model page HTML and extract its visual sections into a JSON array.

## Output Schema

Return a JSON object: { "sections": PageSection[] }

Each section has a "type" discriminator. Here are ALL 10 section types:

### 1. hero
{ "type": "hero", "id": "section-hero-0", "order": 0,
  "heading": "string", "sub_heading": "string",
  "cta_text": "string", "cta_url": "string",
  "desktop_image_url": "string", "mobile_image_url": "string",
  "background_image_url": "string|null", "video_url": "string|null" }
Note: Use background_image_url for CSS background-image heroes. Use video_url for hero sections with autoplay background video.

### 2. intro
{ "type": "intro", "id": "section-intro-1", "order": 1,
  "title": "string|null", "body_html": "<p>cleaned HTML</p>",
  "image_url": "string|null", "image_position": "left|right|background" }

### 3. tabs
{ "type": "tabs", "id": "section-tabs-2", "order": 2,
  "title": "string|null",
  "tabs": [{ "label": "Tab Name", "content_html": "<p>...</p>", "image_url": "string|null" }],
  "default_tab": 0 }

### 4. color-picker
{ "type": "color-picker", "id": "section-color-picker-3", "order": 3,
  "title": "string|null",
  "colors": [{ "name": "Aurora Black Pearl", "code": "WK", "swatch_url": "string|null",
               "hero_image_url": "string|null", "hex": "#1a1a1a" }] }

### 5. specs-grid
{ "type": "specs-grid", "id": "section-specs-grid-4", "order": 4,
  "title": "string|null",
  "categories": [{ "name": "Engine", "specs": [{ "label": "Displacement", "value": "2.0L", "unit": "null" }] }] }

### 6. gallery
{ "type": "gallery", "id": "section-gallery-5", "order": 5,
  "title": "string|null",
  "images": [{ "url": "string", "alt": "string|null", "caption": "string|null", "description": "string|null" }],
  "layout": "carousel|grid" }

### 7. feature-cards
{ "type": "feature-cards", "id": "section-feature-cards-6", "order": 6,
  "title": "string|null",
  "cards": [{ "title": "Feature Name", "description": "Details...", "image_url": "string|null" }],
  "columns": 3 }

### 8. video
{ "type": "video", "id": "section-video-7", "order": 7,
  "title": "string|null",
  "video_url": "string|null", "poster_url": "string|null", "autoplay": false }
Note: video_url can be null if the video has no src (e.g. lazy-loaded or JS-injected). Always extract poster_url from the poster or data-poster attribute — this serves as the visual placeholder.

### 9. cta-banner
{ "type": "cta-banner", "id": "section-cta-banner-8", "order": 8,
  "heading": "string", "body": "string|null",
  "cta_text": "string", "cta_url": "string",
  "background_color": "#hex|null" }

## Extraction Rules

1. **Output absolute URLs** — convert relative paths (e.g. /images/hero.jpg) to full URLs using the page's origin. Keep /media/ paths and already-absolute URLs verbatim.
2. **Clean content_html** — strip inline styles, keep semantic tags (p, h2, h3, ul, li, strong, em, a).
3. **Detect tabs** via [role="tabpanel"], .tab-content, .tab_contents, .tabs, data-tab, aria-controls patterns.
4. **Detect colors** via .color-swatch, data-color, color picker widgets, paint/colour selectors.
5. **Detect specs** via specification tables, .specs, data grids with label/value pairs.
6. **Detect videos** via \`<video>\`, \`<source>\` with .mp4/.webm, YouTube/Vimeo \`<iframe>\`, Brightcove players, \`data-video-url\`, \`[class*=video]\` containers, \`data-account\`/\`data-player\` attributes. Full-width autoplay videos should be "video" sections. Hero background videos go in the hero's video_url field.
7. **Detect background images** — sections using CSS \`background-image\`, \`style="background:url(...)"\`, or \`data-bg\` should capture those URLs. For intro sections, set \`image_position: "background"\`. For hero sections, use \`background_image_url\`.
8. **Order sections top-to-bottom** as they appear in the DOM.
9. **Generate unique IDs**: section-{type}-{index} where index is the order number.
10. **Skip nav, footer, cookie banners, scripts** — only extract main content sections.
11. If a section doesn't clearly fit any type, use "intro" with body_html containing the cleaned content.
12. Aim for 5-15 sections per page. Merge very small adjacent blocks into a single section.
13. **Keep ALL /media/ proxy paths verbatim** — these are pre-downloaded images stored in our bucket. They will be resolved to absolute URLs by the dashboard.
14. **Detect galleries** — look for image grids, sliders, carousels, .gallery, .swiper, .slick, [class*=carousel], [class*=slider], multiple <img> tags within a container that isn't a feature/card grid. Extract all image URLs with alt text. Also look for lightbox/modal content associated with gallery images — these often contain a feature title (caption) and a longer description paragraph. Check for hidden sibling elements, data attributes, or adjacent text containers that provide per-image descriptions.

## HTML to analyze:

${html}`;
}

// ============================================================================
// PageStructurer Class
// ============================================================================

export interface PageStructurerDeps {
  aiRouter: AiRouter;
  r2Bucket: R2Bucket;
  promptBuilder?: SmartPromptBuilder;
  supabase?: any;
}

export class PageStructurer {
  private aiRouter: AiRouter;
  private r2Bucket: R2Bucket;
  private promptBuilder?: SmartPromptBuilder;
  private supabase?: any;

  constructor(deps: PageStructurerDeps) {
    this.aiRouter = deps.aiRouter;
    this.r2Bucket = deps.r2Bucket;
    this.promptBuilder = deps.promptBuilder;
    this.supabase = deps.supabase;
  }

  private async getRecipeContext(oemId: OemId): Promise<string> {
    if (!this.supabase) return '';
    try {
      const { data } = await this.supabase
        .from('brand_recipes')
        .select('pattern, variant, label, resolves_to')
        .eq('oem_id', oemId)
        .eq('is_active', true)
        .order('pattern');

      if (!data?.length) return '';

      return `\n\n## OEM Section Recipes\nThis OEM has pre-defined section recipes. When the content matches a recipe, use the corresponding section type:\n${data.map((r: any) => `- "${r.label}" → type: "${r.resolves_to}" (pattern: ${r.pattern}/${r.variant})`).join('\n')}\n`;
    } catch {
      return '';
    }
  }

  async structurePage(oemId: OemId, modelSlug: string): Promise<PageStructuringResult> {
    const startTime = Date.now();

    try {
      // 1. Load existing page from R2
      const latestKey = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
      const obj = await this.r2Bucket.get(latestKey);

      if (!obj) {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          error: `No cloned page found at ${latestKey}. Run clone-page first.`,
        };
      }

      const pageData: VehicleModelPage = await obj.json();

      if (!pageData.content?.rendered) {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          error: 'Page has no rendered content to structure.',
        };
      }

      // 2. Build prompt (smart or basic) and call Gemini 3.1 Pro
      let prompt = this.promptBuilder
        ? await this.promptBuilder.buildExtractionPrompt(oemId, pageData.content.rendered, {
            modelSlug,
            sourceUrl: pageData.source_url || '',
          })
        : buildExtractionPrompt(pageData.content.rendered);

      // Inject OEM recipe context if available
      const recipeContext = await this.getRecipeContext(oemId);
      if (recipeContext) {
        prompt += recipeContext;
      }

      console.log(`[PageStructurer] Extracting sections for ${oemId}/${modelSlug} (${Math.round(pageData.content.rendered.length / 1024)}KB HTML, smart=${!!this.promptBuilder}, recipes=${recipeContext ? 'yes' : 'no'})`);

      const response = await this.aiRouter.route({
        taskType: 'page_structuring',
        prompt,
        oemId,
        requireJson: true,
      });

      // 3. Parse JSON response
      let parsed: { sections: PageSection[] };
      try {
        parsed = JSON.parse(response.content);
      } catch {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          gemini_tokens_used: response.usage.total_tokens,
          error: 'Failed to parse Gemini response as JSON.',
        };
      }

      if (!Array.isArray(parsed.sections)) {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          gemini_tokens_used: response.usage.total_tokens,
          error: 'Response missing "sections" array.',
        };
      }

      // 4. Validate, clean, and resolve URLs
      const sections = this.validateSections(parsed.sections, pageData.source_url);

      if (sections.length === 0) {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          gemini_tokens_used: response.usage.total_tokens,
          error: 'No valid sections extracted.',
        };
      }

      // 5. Calculate cost
      const promptM = response.usage.prompt_tokens / 1_000_000;
      const completionM = response.usage.completion_tokens / 1_000_000;
      const costUsd = promptM * 2.00 + completionM * 12.00;

      // 6. Update page with sections, bump version
      pageData.content.sections = sections;
      pageData.version = (pageData.version || 0) + 1;
      pageData.generated_at = new Date().toISOString();

      // 7. Store back to R2
      const jsonStr = JSON.stringify(pageData);
      const versionKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;

      await Promise.all([
        this.r2Bucket.put(latestKey, jsonStr, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { pipeline: 'structurer-v1', oem_id: oemId, model_slug: modelSlug },
        }),
        this.r2Bucket.put(versionKey, jsonStr, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { pipeline: 'structurer-v1' },
        }),
      ]);

      const sectionTypes = [...new Set(sections.map(s => s.type))] as PageSectionType[];

      console.log(`[PageStructurer] Extracted ${sections.length} sections [${sectionTypes.join(', ')}] for ${oemId}/${modelSlug} ($${costUsd.toFixed(4)})`);

      return {
        success: true,
        page: pageData,
        r2_key: latestKey,
        structuring_time_ms: Date.now() - startTime,
        sections_extracted: sections.length,
        section_types: sectionTypes,
        gemini_tokens_used: response.usage.total_tokens,
        gemini_cost_usd: costUsd,
      };
    } catch (err: any) {
      console.error(`[PageStructurer] Error:`, err);
      return {
        success: false,
        structuring_time_ms: Date.now() - startTime,
        sections_extracted: 0,
        section_types: [],
        error: err.message || String(err),
      };
    }
  }

  /**
   * Regenerate a single section by ID, replacing it in the existing page.
   */
  async regenerateSection(
    oemId: OemId,
    modelSlug: string,
    sectionId: string,
    sectionType: string,
  ): Promise<PageStructuringResult> {
    const startTime = Date.now();

    try {
      const latestKey = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
      const obj = await this.r2Bucket.get(latestKey);

      if (!obj) {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          error: `No page found at ${latestKey}.`,
        };
      }

      const pageData: VehicleModelPage = await obj.json();

      if (!pageData.content?.rendered) {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          error: 'Page has no rendered content.',
        };
      }

      const existingSections = pageData.content.sections || [];
      const targetIndex = existingSections.findIndex(s => s.id === sectionId);

      if (targetIndex === -1) {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          error: `Section "${sectionId}" not found.`,
        };
      }

      // Build focused prompt for single section with full schema
      const existingSection = existingSections[targetIndex];
      const sectionSchemas: Record<string, string> = {
        'hero': '{ "type": "hero", "heading": "string", "sub_heading": "string", "cta_text": "string", "cta_url": "string", "desktop_image_url": "string", "mobile_image_url": "string", "background_image_url": "string|null", "video_url": "string|null" }',
        'intro': '{ "type": "intro", "title": "string|null", "body_html": "<p>cleaned HTML</p>", "image_url": "string|null", "image_position": "left|right|background" }',
        'tabs': '{ "type": "tabs", "title": "string|null", "tabs": [{ "label": "Tab Name", "content_html": "<p>...</p>", "image_url": "string|null" }], "default_tab": 0 }',
        'color-picker': '{ "type": "color-picker", "title": "string|null", "colors": [{ "name": "string", "code": "string", "swatch_url": "string|null", "hero_image_url": "string|null", "hex": "#hex" }] }',
        'specs-grid': '{ "type": "specs-grid", "title": "string|null", "categories": [{ "name": "string", "specs": [{ "label": "string", "value": "string" }] }] }',
        'gallery': '{ "type": "gallery", "title": "string|null", "images": [{ "url": "string", "alt": "string|null", "caption": "string|null", "description": "string|null" }], "layout": "carousel|grid" }',
        'feature-cards': '{ "type": "feature-cards", "title": "string|null", "cards": [{ "title": "string", "description": "string", "image_url": "string|null" }], "columns": 3 }',
        'video': '{ "type": "video", "title": "string|null", "video_url": "string|null", "poster_url": "string|null", "autoplay": false }',
        'cta-banner': '{ "type": "cta-banner", "heading": "string", "body": "string|null", "cta_text": "string", "cta_url": "string", "background_color": "#hex|null" }',
        'content-block': '{ "type": "content-block", "title": "string|null", "content_html": "<div>...</div>", "layout": "contained|full-width" }',
      };

      const schema = sectionSchemas[sectionType] || sectionSchemas['intro'];
      const hasRenderedHtml = pageData.content.rendered && pageData.content.rendered.length > 100;

      const prompt = `You are a structured data extractor. Regenerate a "${sectionType}" section for an OEM automotive model page.

Return a JSON object: { "section": <PageSection> }

## Section Schema for "${sectionType}"
${schema}

Use id "${sectionId}" and order ${existingSection.order}.

## Current Section Data (improve upon this)
${JSON.stringify(existingSection, null, 2)}

${hasRenderedHtml ? `## Source HTML (extract better data from this if available):\n\n${pageData.content.rendered.substring(0, 60000)}` : '## No source HTML available — regenerate by improving the existing section data above. Keep all existing image URLs and enhance the text content.'}

## Rules
- All image URLs must be absolute (https://...) or /media/ proxy paths
- Keep existing image URLs if the HTML doesn't provide better ones
- For hero: heading OR desktop_image_url is REQUIRED (section will fail validation without at least one)
- Output ONLY the JSON object, no markdown fences`;

      const response = await this.aiRouter.route({
        taskType: 'page_structuring',
        prompt,
        oemId,
        requireJson: true,
      });

      let parsed: { section: PageSection };
      try {
        parsed = JSON.parse(response.content);
      } catch {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          gemini_tokens_used: response.usage.total_tokens,
          error: 'Failed to parse Gemini response as JSON.',
        };
      }

      if (!parsed.section || typeof parsed.section !== 'object') {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          gemini_tokens_used: response.usage.total_tokens,
          error: 'Response missing "section" object.',
        };
      }

      // Validate the single section
      const validated = this.validateSections([parsed.section], pageData.source_url);
      if (validated.length === 0) {
        return {
          success: false,
          structuring_time_ms: Date.now() - startTime,
          sections_extracted: 0,
          section_types: [],
          gemini_tokens_used: response.usage.total_tokens,
          error: 'Regenerated section failed validation.',
        };
      }

      // Calculate cost
      const promptM = response.usage.prompt_tokens / 1_000_000;
      const completionM = response.usage.completion_tokens / 1_000_000;
      const costUsd = promptM * 2.00 + completionM * 12.00;

      // Replace in array
      const newSection = { ...validated[0], id: sectionId, order: existingSections[targetIndex].order };
      existingSections[targetIndex] = newSection;
      pageData.content.sections = existingSections;
      pageData.version = (pageData.version || 0) + 1;
      pageData.generated_at = new Date().toISOString();

      // Store back to R2
      const jsonStr = JSON.stringify(pageData);
      const versionKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;

      await Promise.all([
        this.r2Bucket.put(latestKey, jsonStr, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { pipeline: 'structurer-v1-section', oem_id: oemId, model_slug: modelSlug },
        }),
        this.r2Bucket.put(versionKey, jsonStr, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { pipeline: 'structurer-v1-section' },
        }),
      ]);

      console.log(`[PageStructurer] Regenerated section "${sectionId}" (${sectionType}) for ${oemId}/${modelSlug} ($${costUsd.toFixed(4)})`);

      return {
        success: true,
        page: pageData,
        r2_key: latestKey,
        structuring_time_ms: Date.now() - startTime,
        sections_extracted: 1,
        section_types: [newSection.type as PageSectionType],
        gemini_tokens_used: response.usage.total_tokens,
        gemini_cost_usd: costUsd,
      };
    } catch (err: any) {
      console.error(`[PageStructurer] Regenerate section error:`, err);
      return {
        success: false,
        structuring_time_ms: Date.now() - startTime,
        sections_extracted: 0,
        section_types: [],
        error: err.message || String(err),
      };
    }
  }

  /**
   * Resolve a URL against a base origin.
   * - Already absolute (http/https) → return as-is
   * - Already proxied (/media/) → return as-is
   * - Relative (/path or ./path) → resolve against sourceUrl origin
   * - Data URIs → return as-is
   */
  private resolveUrl(url: string | null | undefined, baseOrigin: string | null): string | null {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/media/')) return url;
    if (!baseOrigin) return url;
    // Relative URL — resolve against origin
    try {
      return new URL(url, baseOrigin).href;
    } catch {
      return url;
    }
  }

  /**
   * Resolve all image/video URLs in a section to absolute URLs.
   */
  private resolveSectionUrls(section: any, baseOrigin: string | null): void {
    const r = (url: string | null | undefined) => this.resolveUrl(url, baseOrigin);

    switch (section.type) {
      case 'hero':
        section.desktop_image_url = r(section.desktop_image_url);
        section.mobile_image_url = r(section.mobile_image_url);
        section.background_image_url = r(section.background_image_url);
        section.video_url = r(section.video_url);
        section.cta_url = r(section.cta_url);
        break;
      case 'intro':
        section.image_url = r(section.image_url);
        break;
      case 'tabs':
        if (Array.isArray(section.tabs)) {
          for (const tab of section.tabs) {
            tab.image_url = r(tab.image_url);
          }
        }
        break;
      case 'color-picker':
        if (Array.isArray(section.colors)) {
          for (const color of section.colors) {
            color.swatch_url = r(color.swatch_url);
            color.hero_image_url = r(color.hero_image_url);
          }
        }
        break;
      case 'gallery':
        if (Array.isArray(section.images)) {
          for (const img of section.images) {
            img.url = r(img.url) || img.url;
          }
        }
        break;
      case 'feature-cards':
        if (Array.isArray(section.cards)) {
          for (const card of section.cards) {
            card.image_url = r(card.image_url);
          }
        }
        break;
      case 'video':
        section.video_url = r(section.video_url) || section.video_url;
        section.poster_url = r(section.poster_url);
        break;
      case 'cta-banner':
        section.cta_url = r(section.cta_url);
        break;
    }
  }

  /**
   * Validate and clean extracted sections.
   * Filters invalid types, deduplicates IDs, ensures required fields,
   * and resolves relative URLs to absolute using the page's source_url.
   */
  private validateSections(raw: any[], sourceUrl?: string): PageSection[] {
    const seenIds = new Set<string>();
    const sections: PageSection[] = [];

    // Extract origin from source URL for resolving relative paths
    let baseOrigin: string | null = null;
    if (sourceUrl) {
      try {
        const u = new URL(sourceUrl);
        baseOrigin = u.origin;
      } catch { /* ignore invalid source_url */ }
    }

    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (!s || typeof s !== 'object') continue;

      // Validate type
      if (!VALID_SECTION_TYPES.includes(s.type)) continue;

      // Ensure unique ID
      let id = s.id || `section-${s.type}-${i}`;
      if (seenIds.has(id)) {
        id = `section-${s.type}-${i}-${Date.now()}`;
      }
      seenIds.add(id);

      // Set order
      const order = typeof s.order === 'number' ? s.order : i;

      // Resolve relative URLs to absolute
      this.resolveSectionUrls(s, baseOrigin);

      // Strip HTML from plain-text fields (headings, titles)
      if (s.title) s.title = stripHtml(s.title);

      // Type-specific validation
      switch (s.type) {
        case 'hero':
          if (!s.heading && !s.desktop_image_url) continue;
          s.heading = stripHtml(s.heading);
          s.sub_heading = stripHtml(s.sub_heading);
          s.cta_text = stripHtml(s.cta_text);
          sections.push({ ...s, id, order });
          break;
        case 'intro':
          if (!s.body_html) continue;
          sections.push({
            ...s, id, order,
            image_position: s.image_position || 'right',
          });
          break;
        case 'tabs':
          if (!Array.isArray(s.tabs) || s.tabs.length === 0) continue;
          // Strip HTML from tab labels (e.g. <sup>TM</sup> → TM)
          for (const tab of s.tabs) {
            tab.label = stripHtml(tab.label);
          }
          sections.push({
            ...s, id, order,
            default_tab: s.default_tab || 0,
          });
          break;
        case 'color-picker':
          if (!Array.isArray(s.colors) || s.colors.length === 0) continue;
          sections.push({ ...s, id, order });
          break;
        case 'specs-grid':
          if (!Array.isArray(s.categories) || s.categories.length === 0) continue;
          sections.push({ ...s, id, order });
          break;
        case 'gallery':
          if (!Array.isArray(s.images) || s.images.length === 0) continue;
          sections.push({
            ...s, id, order,
            layout: s.layout || 'carousel',
          });
          break;
        case 'feature-cards':
          if (!Array.isArray(s.cards) || s.cards.length === 0) continue;
          // Strip HTML from card titles, keep description as-is (rendered via v-html)
          for (const card of s.cards) {
            card.title = stripHtml(card.title);
          }
          sections.push({
            ...s, id, order,
            columns: [2, 3, 4].includes(s.columns) ? s.columns : 3,
          });
          break;
        case 'video':
          if (!s.video_url && !s.poster_url) continue;
          sections.push({
            ...s, id, order,
            video_url: s.video_url || null,
            autoplay: s.autoplay ?? false,
          });
          break;
        case 'cta-banner':
          if (!s.heading || !s.cta_text) continue;
          sections.push({ ...s, id, order });
          break;
        case 'content-block':
          if (!s.content_html) continue;
          sections.push({
            ...s, id, order,
            layout: s.layout || 'contained',
          });
          break;
      }
    }

    // Sort by order
    sections.sort((a, b) => a.order - b.order);

    return sections;
  }
}
