/**
 * Smart Prompt Builder — Memory-Injected Extraction Prompts
 *
 * Builds extraction prompts that include OEM-specific context from the
 * design memory system. Each extraction benefits from past knowledge.
 */

import type { OemId, OemDesignProfile } from '../oem/types';
import type { DesignMemoryManager } from './memory';
import type { UxKnowledgeManager } from './ux-knowledge';

export class SmartPromptBuilder {
  private uxKnowledge: UxKnowledgeManager | null;

  constructor(
    private memoryManager: DesignMemoryManager,
    uxKnowledge?: UxKnowledgeManager,
  ) {
    this.uxKnowledge = uxKnowledge || null;
  }

  /**
   * Build an extraction prompt with OEM-specific memory injected.
   */
  async buildExtractionPrompt(
    oemId: OemId,
    html: string,
    context?: { modelSlug: string; sourceUrl: string },
  ): Promise<string> {
    const profile = await this.memoryManager.getOemProfile(oemId);
    const recentRuns = await this.memoryManager.getRecentRuns(oemId, 3);

    const oemContext = this.buildOemContext(oemId, profile);
    const hintsBlock = this.buildHintsBlock(profile);
    const issuesBlock = this.buildIssuesBlock(profile, recentRuns);
    const similarBlock = await this.buildSimilarExtractionsBlock(oemId, context?.modelSlug);
    const basePrompt = this.buildBasePrompt(html);

    const parts = [basePrompt];

    if (oemContext) {
      parts.unshift(oemContext);
    }
    if (hintsBlock) {
      parts.splice(1, 0, hintsBlock);
    }
    if (similarBlock) {
      parts.splice(parts.length - 1, 0, similarBlock);
    }
    if (issuesBlock) {
      parts.splice(parts.length - 1, 0, issuesBlock);
    }

    if (context) {
      parts.splice(1, 0, `\n## Context\nModel: ${context.modelSlug}\nSource: ${context.sourceUrl}\n`);
    }

    return parts.join('\n');
  }

  private buildOemContext(oemId: OemId, profile: OemDesignProfile): string {
    const parts: string[] = [];
    parts.push(`## OEM Identity: ${oemId}`);

    if (profile.brand_tokens.primary_color) {
      parts.push(`Primary color: ${profile.brand_tokens.primary_color}`);
    }
    if (profile.brand_tokens.secondary_colors.length > 0) {
      parts.push(`Secondary colors: ${profile.brand_tokens.secondary_colors.join(', ')}`);
    }
    if (profile.brand_tokens.font_family) {
      parts.push(`Font: ${profile.brand_tokens.font_family}`);
    }

    if (profile.quality_history.total_runs > 0) {
      parts.push(`Average quality: ${profile.quality_history.avg_quality_score}/1.00 over ${profile.quality_history.total_runs} runs`);
    }

    return parts.length > 1 ? parts.join('\n') + '\n' : '';
  }

  private buildHintsBlock(profile: OemDesignProfile): string {
    const hints = profile.extraction_hints;
    const lines: string[] = [];

    if (hints.hero_selectors.length > 0) {
      lines.push(`- Hero selectors: ${hints.hero_selectors.join(', ')}`);
    }
    if (hints.gallery_selectors.length > 0) {
      lines.push(`- Gallery selectors: ${hints.gallery_selectors.join(', ')}`);
    }
    if (hints.tab_selectors.length > 0) {
      lines.push(`- Tab selectors: ${hints.tab_selectors.join(', ')}`);
    }

    if (lines.length === 0) return '';

    return `## Extraction Hints (from past runs)\n${lines.join('\n')}\n`;
  }

  private buildIssuesBlock(
    profile: OemDesignProfile,
    recentRuns: Array<{ quality_score?: number | null; errors_json?: Array<{ message: string }> }>,
  ): string {
    const lines: string[] = [];

    // Known failures
    const failures = profile.extraction_hints.known_failures;
    if (failures.length > 0) {
      lines.push(`AVOID these selectors (failed previously): ${failures.slice(0, 5).join(', ')}`);
    }

    // Common errors
    const topErrors = profile.quality_history.common_errors.slice(0, 3);
    if (topErrors.length > 0) {
      lines.push('Common errors to avoid:');
      for (const err of topErrors) {
        lines.push(`  - "${err.message}" (occurred ${err.count}x)`);
      }
    }

    // Recent run context
    const lastRun = recentRuns[0];
    if (lastRun && typeof lastRun.quality_score === 'number') {
      lines.push(`Last run score: ${lastRun.quality_score}/1.00`);
    }

    if (lines.length === 0) return '';

    return `## Known Issues\n${lines.join('\n')}\n`;
  }

  private async buildSimilarExtractionsBlock(
    oemId: OemId,
    modelSlug?: string,
  ): Promise<string> {
    if (!this.uxKnowledge) return '';

    try {
      const query = `automotive model page extraction for ${oemId} ${modelSlug || ''}`.trim();
      const similar = await this.uxKnowledge.findSimilarExtractions(query, {
        topK: 5,
      });

      // Filter to high-quality matches
      const goodMatches = similar.filter(s => s.quality_score >= 0.7 && s.similarity_score > 0.5);
      if (goodMatches.length === 0) return '';

      const lines = goodMatches.map(m =>
        `- ${m.oem_id}/${m.model_slug}: ${m.section_summary} (score: ${m.quality_score.toFixed(2)})`,
      );

      return `## Similar Successful Extractions\n${lines.join('\n')}\n`;
    } catch (err) {
      console.warn('[SmartPromptBuilder] Failed to retrieve similar extractions:', err);
      return '';
    }
  }

  private buildBasePrompt(html: string): string {
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
  "images": [{ "url": "string", "alt": "string|null", "caption": "string|null" }],
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

### 10. content-block (universal fallback)
{ "type": "content-block", "id": "section-content-block-9", "order": 9,
  "title": "string|null", "content_html": "<p>cleaned HTML</p>",
  "layout": "full-width|contained|two-column",
  "background": "#hex|null", "image_url": "string|null" }
Use this type for content sections that don't clearly fit any of the 9 typed sections above (e.g., award badges, comparison charts, download sections, disclaimer blocks, unique marketing layouts).

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
14. **Detect galleries** — look for image grids, sliders, carousels, .gallery, .swiper, .slick, [class*=carousel], [class*=slider], multiple <img> tags within a container that isn't a feature/card grid. Extract all image URLs with alt text.

## HTML to analyze:

${html}`;
  }
}
