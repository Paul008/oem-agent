/**
 * Adaptive Pipeline — 7-Step Multi-Model Extraction
 *
 * Orchestrates the complete extraction flow:
 *   0. CLONE       — Ensure page is cloned to R2 (Puppeteer, skips if exists)
 *   1. SCREENSHOT  — Element-level screenshots per section (Puppeteer)
 *   2. CLASSIFY    — Quick layout scan via Groq (fast/cheap)
 *   3. EXTRACT     — Structured extraction via Gemini + memory injection
 *   4. VALIDATE    — Quality check via Groq (fast/cheap)
 *   5. GENERATE    — Bespoke component gen via Claude (10% of pages)
 *   6. LEARN       — Update OEM design profile + log run
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OemId,
  PageSection,
  PipelineResult,
  PipelineStepResult,
  QuickScanResult,
  QualityCheckResult,
} from '../oem/types';
import type { AiRouter } from '../ai/router';
import { PageCapturer } from './page-capturer';
import { PageStructurer, type PageStructurerDeps } from './page-structurer';
import { DesignMemoryManager } from './memory';
import { SmartPromptBuilder } from './prompt-builder';
import { UxKnowledgeManager } from './ux-knowledge';

// ============================================================================
// Pipeline Configuration
// ============================================================================

/** Skip bespoke generation unless quality drops below this threshold */
const BESPOKE_QUALITY_THRESHOLD = 0.6;

// ============================================================================
// AdaptivePipeline Class
// ============================================================================

export interface AdaptivePipelineDeps {
  aiRouter: AiRouter;
  r2Bucket: R2Bucket;
  browser: Fetcher;
  supabase: SupabaseClient;
  vectorize?: VectorizeIndex;
  googleApiKey?: string;
}

export class AdaptivePipeline {
  private aiRouter: AiRouter;
  private r2Bucket: R2Bucket;
  private browser: Fetcher;
  private memoryManager: DesignMemoryManager;
  private promptBuilder: SmartPromptBuilder;
  private uxKnowledge: UxKnowledgeManager | null;
  private capturer: PageCapturer;
  private structurer: PageStructurer;

  constructor(deps: AdaptivePipelineDeps) {
    this.aiRouter = deps.aiRouter;
    this.r2Bucket = deps.r2Bucket;
    this.browser = deps.browser;
    this.memoryManager = new DesignMemoryManager(deps.supabase);

    // Set up UX Knowledge Manager if Vectorize is available
    this.uxKnowledge = deps.vectorize && deps.googleApiKey
      ? new UxKnowledgeManager(deps.vectorize, deps.googleApiKey)
      : null;

    this.promptBuilder = new SmartPromptBuilder(this.memoryManager, this.uxKnowledge || undefined);
    this.capturer = new PageCapturer({ r2Bucket: deps.r2Bucket, browser: deps.browser });

    const structurerDeps: PageStructurerDeps = {
      aiRouter: deps.aiRouter,
      r2Bucket: deps.r2Bucket,
      promptBuilder: this.promptBuilder,
      supabase: deps.supabase,
    };
    this.structurer = new PageStructurer(structurerDeps);
  }

  /**
   * Run the full 7-step adaptive pipeline for a model page.
   */
  async run(oemId: OemId, modelSlug: string, sourceUrl: string, modelName?: string): Promise<PipelineResult> {
    const pipelineStart = Date.now();
    const steps: PipelineStepResult[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    let screenshotsCaptured = 0;
    let sections: PageSection[] = [];
    let qualityScore = 0;

    // Log extraction run
    const runId = await this.memoryManager.logExtractionRun({
      oem_id: oemId,
      model_slug: modelSlug,
      pipeline: 'adaptive',
      prompt_version: 'adaptive-v1',
    });

    try {
      // ================================================================
      // Step 0: CLONE — Ensure page is cloned to R2
      // ================================================================
      const step0Start = Date.now();
      try {
        const latestKey = `pages/definitions/${oemId}/${modelSlug}/latest.json`;
        const existing = await this.r2Bucket.head(latestKey);

        if (existing) {
          console.log(`[Pipeline] Clone exists at ${latestKey}, skipping clone step`);
          steps.push({
            step: 'clone',
            status: 'skipped',
            duration_ms: Date.now() - step0Start,
            details: { reason: 'Clone already exists in R2' },
          });
        } else {
          console.log(`[Pipeline] No clone found, capturing page from ${sourceUrl}`);
          const cloneResult = await this.capturer.captureModelPage(oemId, modelSlug, sourceUrl, modelName);

          if (!cloneResult.success) {
            steps.push({
              step: 'clone',
              status: 'failed',
              duration_ms: Date.now() - step0Start,
              details: {
                error: cloneResult.error,
                bot_blocked: cloneResult.bot_blocked,
              },
            });
            throw new Error(cloneResult.error || 'Page clone failed');
          }

          steps.push({
            step: 'clone',
            status: 'success',
            duration_ms: Date.now() - step0Start,
            details: {
              elements_captured: cloneResult.elements_captured,
              images_uploaded: cloneResult.images_uploaded,
              html_size_kb: cloneResult.html_size_kb,
            },
          });
        }
      } catch (err) {
        if (steps.length === 0 || steps[steps.length - 1].step !== 'clone') {
          steps.push({
            step: 'clone',
            status: 'failed',
            duration_ms: Date.now() - step0Start,
            details: { error: err instanceof Error ? err.message : String(err) },
          });
        }
        // Can't continue without a clone
        throw err;
      }

      // ================================================================
      // Step 1: SCREENSHOT — Capture section-level screenshots
      // ================================================================
      const step1Start = Date.now();
      let screenshots = new Map<string, string>();
      try {
        screenshots = await this.capturer.captureSectionScreenshots(sourceUrl, oemId, modelSlug);
        screenshotsCaptured = screenshots.size;
        steps.push({
          step: 'screenshot',
          status: 'success',
          duration_ms: Date.now() - step1Start,
          details: { count: screenshots.size },
        });
      } catch (err) {
        console.warn(`[Pipeline] Screenshot step failed:`, err);
        steps.push({
          step: 'screenshot',
          status: 'failed',
          duration_ms: Date.now() - step1Start,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
        // Continue — screenshots are optional
      }

      // ================================================================
      // Step 2: CLASSIFY — Quick layout scan of screenshots
      // ================================================================
      const step2Start = Date.now();
      let quickScans: QuickScanResult[] = [];
      try {
        if (screenshots.size > 0) {
          quickScans = await this.classifySections(screenshots);
          const classifyTokens = quickScans.length * 200; // Estimated
          totalTokens += classifyTokens;
          steps.push({
            step: 'classify',
            status: 'success',
            duration_ms: Date.now() - step2Start,
            tokens_used: classifyTokens,
            details: { sections_classified: quickScans.length },
          });
        } else {
          steps.push({ step: 'classify', status: 'skipped', duration_ms: 0 });
        }
      } catch (err) {
        console.warn('[Pipeline] Classify step failed:', err);
        steps.push({
          step: 'classify',
          status: 'failed',
          duration_ms: Date.now() - step2Start,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
      }

      // ================================================================
      // Step 3: EXTRACT — Gemini extraction with memory injection
      // ================================================================
      const step3Start = Date.now();
      try {
        const result = await this.structurer.structurePage(oemId, modelSlug);
        sections = result.page?.content?.sections || [];
        const extractTokens = result.gemini_tokens_used || 0;
        const extractCost = result.gemini_cost_usd || 0;
        totalTokens += extractTokens;
        totalCost += extractCost;
        steps.push({
          step: 'extract',
          status: result.success ? 'success' : 'failed',
          duration_ms: Date.now() - step3Start,
          tokens_used: extractTokens,
          cost_usd: extractCost,
          details: {
            sections_extracted: result.sections_extracted,
            section_types: result.section_types,
          },
        });
      } catch (err) {
        console.error('[Pipeline] Extract step failed:', err);
        steps.push({
          step: 'extract',
          status: 'failed',
          duration_ms: Date.now() - step3Start,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
        // Can't continue without sections
        throw err;
      }

      // ================================================================
      // Step 4: VALIDATE — Groq quality check
      // ================================================================
      const step4Start = Date.now();
      let qualityCheck: QualityCheckResult | null = null;
      try {
        qualityCheck = await this.validateExtraction(oemId, sections);
        qualityScore = qualityCheck.overall_score;
        const validateTokens = 1500; // Estimated per quality check
        totalTokens += validateTokens;
        totalCost += 0.001; // ~$0.001 per quality check
        steps.push({
          step: 'validate',
          status: 'success',
          duration_ms: Date.now() - step4Start,
          tokens_used: validateTokens,
          cost_usd: 0.001,
          details: {
            quality_score: qualityScore,
            issues_count: qualityCheck.issues.length,
            missing_types: qualityCheck.missing_section_types,
          },
        });
      } catch (err) {
        console.warn('[Pipeline] Validate step failed:', err);
        qualityScore = 0.5; // Default when validation fails
        steps.push({
          step: 'validate',
          status: 'failed',
          duration_ms: Date.now() - step4Start,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
      }

      // ================================================================
      // Step 5: GENERATE — Bespoke component (Claude, 10% of pages)
      // ================================================================
      const step5Start = Date.now();
      const needsBespoke = qualityScore < BESPOKE_QUALITY_THRESHOLD
        && qualityCheck
        && qualityCheck.issues.some(i => i.severity === 'critical');

      if (needsBespoke) {
        try {
          // Regenerate the worst section using Claude
          const criticalIssue = qualityCheck!.issues.find(i => i.severity === 'critical');
          if (criticalIssue?.section_id) {
            const bespokeResult = await this.aiRouter.route({
              taskType: 'bespoke_component',
              oemId,
              prompt: `Fix this section extraction issue: "${criticalIssue.message}".
The section ID is "${criticalIssue.section_id}".
Current sections: ${JSON.stringify(sections.find(s => s.id === criticalIssue.section_id))}
Return the fixed section as JSON matching the PageSection schema.`,
              requireJson: true,
              maxTokens: 4096,
            });
            const bespokeTokens = bespokeResult.usage.total_tokens;
            totalTokens += bespokeTokens;
            const bespokeCost = bespokeTokens * 0.000009; // ~$9/1M tokens avg
            totalCost += bespokeCost;
            steps.push({
              step: 'generate',
              status: 'success',
              duration_ms: Date.now() - step5Start,
              tokens_used: bespokeTokens,
              cost_usd: bespokeCost,
              details: { section_id: criticalIssue.section_id },
            });

            // Try to replace the problematic section
            try {
              const fixedSection = JSON.parse(bespokeResult.content);
              const idx = sections.findIndex(s => s.id === criticalIssue.section_id);
              if (idx !== -1 && fixedSection.type) {
                sections[idx] = fixedSection;
              }
            } catch { /* JSON parse failed, keep original */ }
          } else {
            steps.push({ step: 'generate', status: 'skipped', duration_ms: 0 });
          }
        } catch (err) {
          console.warn('[Pipeline] Generate step failed:', err);
          steps.push({
            step: 'generate',
            status: 'failed',
            duration_ms: Date.now() - step5Start,
            details: { error: err instanceof Error ? err.message : String(err) },
          });
        }
      } else {
        steps.push({ step: 'generate', status: 'skipped', duration_ms: 0 });
      }

      // ================================================================
      // Step 6: LEARN — Update OEM profile from this run
      // ================================================================
      const step6Start = Date.now();
      try {
        // Determine successful/failed selectors from quick scans
        const successfulSelectors = quickScans
          .filter(s => s.confidence > 0.7)
          .map(s => `${s.layout_type}:${s.section_id}`);
        const failedSelectors = quickScans
          .filter(s => s.confidence < 0.3)
          .map(s => `${s.layout_type}:${s.section_id}`);

        // Collect errors from quality check
        const errors = qualityCheck
          ? qualityCheck.issues
              .filter(i => i.severity !== 'info')
              .map(i => ({ message: i.message, selector: i.section_id }))
          : [];

        await this.memoryManager.completeExtractionRun(runId, {
          sections_extracted: sections.length,
          quality_score: qualityScore,
          total_tokens: totalTokens,
          total_cost_usd: totalCost,
          errors,
          successful_selectors: successfulSelectors,
          failed_selectors: failedSelectors,
        });

        await this.memoryManager.learnFromRun(runId);

        // Index into Vectorize if available
        let vectorsIndexed = 0;
        if (this.uxKnowledge && qualityScore >= 0.5) {
          try {
            vectorsIndexed = await this.uxKnowledge.indexExtractionResult(
              oemId, modelSlug, sections, qualityScore,
            );
          } catch (err) {
            console.warn('[Pipeline] Vectorize indexing failed:', err);
          }
        }

        steps.push({
          step: 'learn',
          status: 'success',
          duration_ms: Date.now() - step6Start,
          details: { run_id: runId, vectors_indexed: vectorsIndexed },
        });
      } catch (err) {
        console.warn('[Pipeline] Learn step failed:', err);
        steps.push({
          step: 'learn',
          status: 'failed',
          duration_ms: Date.now() - step6Start,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
      }

      return {
        success: true,
        oem_id: oemId,
        model_slug: modelSlug,
        steps,
        sections,
        quality_score: qualityScore,
        total_tokens: totalTokens,
        total_cost_usd: totalCost,
        total_duration_ms: Date.now() - pipelineStart,
        screenshots_captured: screenshotsCaptured,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.memoryManager.failExtractionRun(runId, message);

      return {
        success: false,
        oem_id: oemId,
        model_slug: modelSlug,
        steps,
        sections: [],
        quality_score: 0,
        total_tokens: totalTokens,
        total_cost_usd: totalCost,
        total_duration_ms: Date.now() - pipelineStart,
        screenshots_captured: screenshotsCaptured,
        error: message,
      };
    }
  }

  // ============================================================================
  // Step 2: Quick Classification via Groq
  // ============================================================================

  private async classifySections(
    screenshots: Map<string, string>,
  ): Promise<QuickScanResult[]> {
    const results: QuickScanResult[] = [];

    // Process screenshots sequentially to avoid rate limits
    for (const [sectionId, r2Key] of screenshots) {
      try {
        // Read screenshot from R2
        const obj = await this.r2Bucket.get(r2Key);
        if (!obj) continue;

        const imageData = await obj.arrayBuffer();
        // Chunk-safe base64 encoding (spread operator crashes on large buffers)
        const bytes = new Uint8Array(imageData);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
        }
        const base64 = btoa(binary);

        const response = await this.aiRouter.route({
          taskType: 'quick_scan',
          prompt: `Classify this website section screenshot. Return JSON:
{
  "layout_type": "hero"|"gallery"|"tabs"|"video"|"feature-cards"|"specs"|"cta"|"content"|"unknown",
  "has_video": boolean,
  "has_carousel": boolean,
  "dominant_colors": ["#hex1", "#hex2"],
  "confidence": 0.0-1.0
}`,
          imageBase64: base64,
          imageMimeType: 'image/jpeg',
          requireJson: true,
        });

        const parsed = JSON.parse(response.content);
        results.push({
          section_id: sectionId,
          layout_type: parsed.layout_type || 'unknown',
          has_video: parsed.has_video || false,
          has_carousel: parsed.has_carousel || false,
          dominant_colors: parsed.dominant_colors || [],
          confidence: parsed.confidence || 0.5,
        });
      } catch (err) {
        console.warn(`[Pipeline] Classification failed for ${sectionId}:`, err);
        results.push({
          section_id: sectionId,
          layout_type: 'unknown',
          has_video: false,
          has_carousel: false,
          dominant_colors: [],
          confidence: 0,
        });
      }
    }

    return results;
  }

  // ============================================================================
  // Step 4: Quality Validation via Groq
  // ============================================================================

  private async validateExtraction(
    oemId: OemId,
    sections: PageSection[],
  ): Promise<QualityCheckResult> {
    const sectionSummary = sections.map(s => ({
      id: s.id,
      type: s.type,
      order: s.order,
      // Include a content preview for validation
      ...(s.type === 'hero' ? { heading: (s as any).heading, has_image: !!(s as any).desktop_image_url } : {}),
      ...(s.type === 'tabs' ? { tab_count: (s as any).tabs?.length } : {}),
      ...(s.type === 'gallery' ? { image_count: (s as any).images?.length } : {}),
      ...(s.type === 'color-picker' ? { color_count: (s as any).colors?.length } : {}),
      ...(s.type === 'specs-grid' ? { category_count: (s as any).categories?.length } : {}),
    }));

    const response = await this.aiRouter.route({
      taskType: 'extraction_quality_check',
      oemId,
      prompt: `You are a quality checker for automotive OEM page extraction.
Analyze this extraction result and identify issues.

## Extracted Sections
${JSON.stringify(sectionSummary, null, 2)}

## Validation Rules
1. A page SHOULD have a hero section
2. Section IDs must be unique
3. Sections should have content (not empty)
4. Tab sections should have at least 2 tabs
5. Gallery should have at least 2 images
6. Color picker should have at least 1 color
7. Expected section types for a car model page: hero, intro/tabs, color-picker, specs-grid, gallery, cta-banner

## Output
Return JSON:
{
  "overall_score": 0.0-1.0,
  "issues": [{ "severity": "critical"|"warning"|"info", "message": "string", "section_id": "string|null" }],
  "missing_section_types": ["type1", "type2"],
  "empty_content_sections": ["section-id-1"],
  "broken_url_count": 0
}`,
      requireJson: true,
    });

    try {
      const result = JSON.parse(response.content);
      return {
        overall_score: Math.max(0, Math.min(1, result.overall_score || 0)),
        issues: Array.isArray(result.issues) ? result.issues : [],
        missing_section_types: Array.isArray(result.missing_section_types) ? result.missing_section_types : [],
        empty_content_sections: Array.isArray(result.empty_content_sections) ? result.empty_content_sections : [],
        broken_url_count: result.broken_url_count || 0,
      };
    } catch {
      return {
        overall_score: 0.5,
        issues: [{ severity: 'warning', message: 'Quality check response was not valid JSON' }],
        missing_section_types: [],
        empty_content_sections: [],
        broken_url_count: 0,
      };
    }
  }
}
