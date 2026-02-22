/**
 * Component Generator — Bespoke Vue SFC Generation via Claude
 *
 * For the ~10% of sections that don't fit any of the standard templates,
 * generates a custom Vue 3 <template> block with Tailwind CSS.
 *
 * Input: section data + screenshot + brand profile
 * Output: Vue SFC stored in R2 at components/{oemId}/bespoke-{timestamp}.vue
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
   * Generate a bespoke Vue 3 component for a section that doesn't
   * fit any standard template.
   */
  async generateComponent(
    oemId: OemId,
    section: PageSection,
    brandProfile: OemDesignProfile,
    screenshotBase64?: string,
  ): Promise<BespokeComponentResult> {
    try {
      const brandContext = this.buildBrandContext(brandProfile);

      const prompt = `You are a Vue 3 component generator for an automotive OEM dashboard.

## Task
Generate a Vue 3 Single File Component (SFC) template block that renders the following section data.
The component receives a \`section\` prop with the data below.

## Brand Context
${brandContext}

## Section Data
\`\`\`json
${JSON.stringify(section, null, 2)}
\`\`\`

## Requirements
1. Use Tailwind CSS classes only (no custom CSS)
2. Make it responsive (mobile-first)
3. Handle missing/null fields gracefully with v-if
4. Use semantic HTML elements
5. Support dark mode with dark: variants
6. Match the OEM's brand colors where possible
7. Keep the component self-contained (no external dependencies)

## Output Format
Return a JSON object:
{
  "template": "<div class=\\"...\\">[Vue template HTML with v-if, v-for, :src bindings]</div>",
  "description": "Brief description of what this component renders"
}

The template should use Vue 3 template syntax:
- \`{{ section.title }}\` for text interpolation
- \`:src="section.image_url"\` for dynamic attributes
- \`v-if="section.title"\` for conditional rendering
- \`v-for="item in section.items"\` for lists`;

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

      // Build a complete Vue SFC
      const sfc = this.buildSfc(section.type, parsed.template, parsed.description);

      // Store in R2
      const timestamp = Date.now();
      const r2Key = `${R2_COMPONENTS_PREFIX}/${oemId}/bespoke-${section.type}-${timestamp}.vue`;

      await this.r2Bucket.put(r2Key, sfc, {
        httpMetadata: { contentType: 'text/plain' },
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

  private buildSfc(sectionType: string, template: string, description?: string): string {
    const desc = description || `Bespoke ${sectionType} component`;

    return `<script lang="ts" setup>
/**
 * ${desc}
 * Auto-generated by ComponentGenerator
 */
defineProps<{
  section: Record<string, any>
}>()
</script>

<template>
  ${template}
</template>
`;
  }
}
