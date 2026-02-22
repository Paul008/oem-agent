/**
 * Design Memory Manager
 *
 * Accumulates per-OEM design knowledge from extraction runs.
 * Each run feeds back into the OEM profile, making the next run smarter.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OemId,
  OemDesignProfile,
  ExtractionRun,
  ExtractionRunInput,
  ExtractionRunResult,
} from '../oem/types';

const DEFAULT_PROFILE: OemDesignProfile = {
  brand_tokens: {
    primary_color: '',
    secondary_colors: [],
    font_family: '',
    border_radius: '',
    button_style: '',
  },
  extraction_hints: {
    hero_selectors: [],
    gallery_selectors: [],
    tab_selectors: [],
    known_failures: [],
    bot_detection: 'none',
    wait_ms_after_load: 0,
  },
  quality_history: {
    avg_quality_score: 0,
    total_runs: 0,
    last_run_at: '',
    common_errors: [],
  },
  last_updated: '',
};

export class DesignMemoryManager {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get the design profile for an OEM, returning defaults if not yet populated.
   */
  async getOemProfile(oemId: OemId): Promise<OemDesignProfile> {
    const { data, error } = await this.supabase
      .from('oems')
      .select('design_profile_json')
      .eq('id', oemId)
      .single();

    if (error || !data) {
      console.warn(`[DesignMemory] Could not load profile for ${oemId}:`, error?.message);
      return { ...DEFAULT_PROFILE };
    }

    const stored = data.design_profile_json as Partial<OemDesignProfile> | null;
    if (!stored || Object.keys(stored).length === 0) {
      return { ...DEFAULT_PROFILE };
    }

    // Merge with defaults to fill any missing fields
    return {
      brand_tokens: { ...DEFAULT_PROFILE.brand_tokens, ...stored.brand_tokens },
      extraction_hints: { ...DEFAULT_PROFILE.extraction_hints, ...stored.extraction_hints },
      quality_history: { ...DEFAULT_PROFILE.quality_history, ...stored.quality_history },
      last_updated: stored.last_updated || '',
    };
  }

  /**
   * Partially update the OEM design profile.
   */
  async updateOemProfile(oemId: OemId, updates: Partial<OemDesignProfile>): Promise<void> {
    const current = await this.getOemProfile(oemId);

    const merged: OemDesignProfile = {
      brand_tokens: { ...current.brand_tokens, ...updates.brand_tokens },
      extraction_hints: { ...current.extraction_hints, ...updates.extraction_hints },
      quality_history: { ...current.quality_history, ...updates.quality_history },
      last_updated: new Date().toISOString(),
    };

    const { error } = await this.supabase
      .from('oems')
      .update({ design_profile_json: merged })
      .eq('id', oemId);

    if (error) {
      console.error(`[DesignMemory] Failed to update profile for ${oemId}:`, error.message);
    }
  }

  /**
   * Log the start of an extraction run. Returns the run ID.
   */
  async logExtractionRun(input: ExtractionRunInput): Promise<string> {
    const { data, error } = await this.supabase
      .from('extraction_runs')
      .insert({
        oem_id: input.oem_id,
        model_slug: input.model_slug,
        pipeline: input.pipeline,
        status: 'running',
        prompt_version: input.prompt_version || null,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[DesignMemory] Failed to log extraction run:', error?.message);
      // Return a placeholder so callers don't break
      return 'error-no-id';
    }

    return data.id;
  }

  /**
   * Complete an extraction run with results.
   */
  async completeExtractionRun(runId: string, result: ExtractionRunResult): Promise<void> {
    if (runId === 'error-no-id') return;

    const { error } = await this.supabase
      .from('extraction_runs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        sections_extracted: result.sections_extracted,
        quality_score: result.quality_score,
        total_tokens: result.total_tokens,
        total_cost_usd: result.total_cost_usd,
        errors_json: result.errors,
        successful_selectors: result.successful_selectors,
        failed_selectors: result.failed_selectors,
      })
      .eq('id', runId);

    if (error) {
      console.error('[DesignMemory] Failed to complete extraction run:', error.message);
    }
  }

  /**
   * Mark a run as failed.
   */
  async failExtractionRun(runId: string, errorMessage: string): Promise<void> {
    if (runId === 'error-no-id') return;

    const { error } = await this.supabase
      .from('extraction_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        errors_json: [{ message: errorMessage }],
      })
      .eq('id', runId);

    if (error) {
      console.error('[DesignMemory] Failed to mark run as failed:', error.message);
    }
  }

  /**
   * Get recent extraction runs for an OEM.
   */
  async getRecentRuns(oemId: OemId, limit = 10): Promise<ExtractionRun[]> {
    const { data, error } = await this.supabase
      .from('extraction_runs')
      .select('*')
      .eq('oem_id', oemId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      console.warn('[DesignMemory] Failed to fetch recent runs:', error?.message);
      return [];
    }

    return data as ExtractionRun[];
  }

  /**
   * Analyze a completed run and update the OEM profile with learnings.
   *
   * Updates:
   * - New successful selectors → add to extraction_hints
   * - New failed selectors → add to known_failures
   * - Error patterns → increment common_errors count
   * - Quality score → update running average
   */
  async learnFromRun(runId: string): Promise<void> {
    if (runId === 'error-no-id') return;

    const { data: run, error } = await this.supabase
      .from('extraction_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error || !run) {
      console.warn('[DesignMemory] Could not load run for learning:', error?.message);
      return;
    }

    const oemId = run.oem_id as OemId;
    const profile = await this.getOemProfile(oemId);

    // Update successful selectors
    const newHeroSelectors = new Set(profile.extraction_hints.hero_selectors);
    const newGallerySelectors = new Set(profile.extraction_hints.gallery_selectors);
    const newTabSelectors = new Set(profile.extraction_hints.tab_selectors);

    for (const sel of (run.successful_selectors || []) as string[]) {
      const lower = sel.toLowerCase();
      if (lower.includes('hero') || lower.includes('banner') || lower.includes('slider')) {
        newHeroSelectors.add(sel);
      } else if (lower.includes('gallery') || lower.includes('carousel') || lower.includes('swiper')) {
        newGallerySelectors.add(sel);
      } else if (lower.includes('tab') || lower.includes('panel')) {
        newTabSelectors.add(sel);
      }
    }

    // Update known failures
    const knownFailures = new Set(profile.extraction_hints.known_failures);
    for (const sel of (run.failed_selectors || []) as string[]) {
      knownFailures.add(sel);
    }

    // Update error patterns
    const errorCounts = new Map<string, number>();
    for (const err of profile.quality_history.common_errors) {
      errorCounts.set(err.message, err.count);
    }
    for (const err of (run.errors_json || []) as Array<{ message: string }>) {
      const key = err.message.substring(0, 100); // Truncate long messages
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
    }

    // Update running average quality score
    const prevTotal = profile.quality_history.avg_quality_score * profile.quality_history.total_runs;
    const newTotalRuns = profile.quality_history.total_runs + 1;
    const qualityScore = typeof run.quality_score === 'number' ? run.quality_score : 0;
    const newAvg = newTotalRuns > 0 ? (prevTotal + qualityScore) / newTotalRuns : 0;

    await this.updateOemProfile(oemId, {
      extraction_hints: {
        hero_selectors: [...newHeroSelectors],
        gallery_selectors: [...newGallerySelectors],
        tab_selectors: [...newTabSelectors],
        known_failures: [...knownFailures],
        bot_detection: profile.extraction_hints.bot_detection,
        wait_ms_after_load: profile.extraction_hints.wait_ms_after_load,
      },
      quality_history: {
        avg_quality_score: Math.round(newAvg * 100) / 100,
        total_runs: newTotalRuns,
        last_run_at: new Date().toISOString(),
        common_errors: [...errorCounts.entries()]
          .map(([message, count]) => ({ message, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20), // Keep top 20 errors
      },
    });
  }
}
