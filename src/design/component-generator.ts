/**
 * Component Generator — Bespoke Alpine.js HTML Generation via Claude
 *
 * For the ~10% of sections that don't fit any of the standard templates,
 * generates custom HTML with Alpine.js directives and Tailwind CSS.
 *
 * Input: section data + screenshot + brand profile
 * Output: HTML stored in R2 at components/{oemId}/bespoke-{timestamp}.html
 */

import type { OemId, OemDesignProfile, PageSection } from '../oem/types';
import type { AiRouter } from '../ai/router';

const R2_COMPONENTS_PREFIX = 'components';

export interface BespokeComponentResult {
  success: boolean;
  r2_key?: string;
  template_html?: string;
  tokens_used: number;
  cost_usd: number;
  error?: string;
}

export class ComponentGenerator {
  private aiRouter: AiRouter;
  private r2Bucket: R2Bucket;

  constructor(deps: { aiRouter: AiRouter; r2Bucket: R2Bucket }) {
    this.aiRouter = deps.aiRouter;
    this.r2Bucket = deps.r2Bucket;
  }

  /**
   * Generate a bespoke Alpine.js HTML component for a section that
   * doesn't fit any standard template.
   */
  async generateComponent(
    oemId: OemId,
    section: PageSection,
    brandProfile: OemDesignProfile,
    screenshotBase64?: string,
  ): Promise<BespokeComponentResult> {
    try {
      const brandContext = this.buildBrandContext(brandProfile);

      const prompt = `You are an HTML component generator for an automotive OEM website.

## Task
Generate an HTML snippet with Alpine.js directives and Tailwind CSS that renders the following section data.
The section data is embedded directly in the HTML via Alpine.js x-data attributes.

## Brand Context
${brandContext}

## Section Data
\`\`\`json
${JSON.stringify(section, null, 2)}
\`\`\`

## Requirements
1. Use Tailwind CSS classes only (no custom CSS)
2. Make it responsive (mobile-first)
3. Use Alpine.js directives for interactivity (x-data, x-show, @click, :src, x-text, x-for)
4. Use semantic HTML elements
5. Support dark mode with dark: variants
6. Match the OEM's brand colors where possible
7. Keep the component self-contained — all data inline in x-data, no external API calls
8. Add \`style="display:none;"\` on elements with x-show that start hidden (prevents FOUC)
9. Use x-transition or x-collapse for smooth show/hide animations

## Output Format
Return a JSON object:
{
  "template": "<div x-data=\\"{...}\\" class=\\"...\\">[HTML with Alpine.js directives]</div>",
  "description": "Brief description of what this component renders"
}

The template should use Alpine.js syntax:
- \`x-text="label"\` for dynamic text content
- \`:src="imageUrl"\` for dynamic attributes
- \`x-show="condition"\` for conditional display
- \`x-for="item in items"\` with \`<template>\` wrapper for lists
- \`@click="handler"\` for click interactions`;

      const response = await this.aiRouter.route({
        taskType: 'bespoke_component',
        oemId,
        prompt,
        imageBase64: screenshotBase64,
        imageMimeType: screenshotBase64 ? 'image/jpeg' : undefined,
        requireJson: true,
        maxTokens: 4096,
      });

      const tokensUsed = response.usage.total_tokens;
      const costUsd = tokensUsed * 0.000009; // ~$9/1M avg

      let parsed: { template?: string; description?: string };
      try {
        parsed = JSON.parse(response.content);
      } catch {
        return {
          success: false,
          tokens_used: tokensUsed,
          cost_usd: costUsd,
          error: 'Failed to parse Claude response as JSON',
        };
      }

      if (!parsed.template) {
        return {
          success: false,
          tokens_used: tokensUsed,
          cost_usd: costUsd,
          error: 'Response missing "template" field',
        };
      }

      // Build the HTML component
      const html = this.buildHtml(section.type, parsed.template, parsed.description);

      // Store in R2
      const timestamp = Date.now();
      const r2Key = `${R2_COMPONENTS_PREFIX}/${oemId}/bespoke-${section.type}-${timestamp}.html`;

      await this.r2Bucket.put(r2Key, html, {
        httpMetadata: { contentType: 'text/html' },
        customMetadata: {
          oem_id: oemId,
          section_type: section.type,
          section_id: section.id,
          generated_at: new Date().toISOString(),
        },
      });

      console.log(`[ComponentGenerator] Generated bespoke component at ${r2Key}`);

      return {
        success: true,
        r2_key: r2Key,
        template_html: parsed.template,
        tokens_used: tokensUsed,
        cost_usd: costUsd,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ComponentGenerator] Error:', message);
      return {
        success: false,
        tokens_used: 0,
        cost_usd: 0,
        error: message,
      };
    }
  }

  private buildBrandContext(profile: OemDesignProfile): string {
    const lines: string[] = [];

    if (profile.brand_tokens.primary_color) {
      lines.push(`Primary color: ${profile.brand_tokens.primary_color}`);
    }
    if (profile.brand_tokens.secondary_colors.length > 0) {
      lines.push(`Secondary colors: ${profile.brand_tokens.secondary_colors.join(', ')}`);
    }
    if (profile.brand_tokens.font_family) {
      lines.push(`Font family: ${profile.brand_tokens.font_family}`);
    }
    if (profile.brand_tokens.border_radius) {
      lines.push(`Border radius: ${profile.brand_tokens.border_radius}`);
    }
    if (profile.brand_tokens.button_style) {
      lines.push(`Button style: ${profile.brand_tokens.button_style}`);
    }

    return lines.length > 0 ? lines.join('\n') : 'No brand tokens available — use neutral automotive styling.';
  }

  private buildHtml(sectionType: string, template: string, description?: string): string {
    const desc = description || `Bespoke ${sectionType} section`;
    return `<!-- ${desc} — Auto-generated by ComponentGenerator -->\n${template}`;
  }
}
