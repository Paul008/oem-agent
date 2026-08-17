/** Nissan Australia model-page plan for the existing adaptive page builder. */

import type { OemId, PageSection, PipelineResult } from '../oem/types';
import {
  NISSAN_AU_MODELS,
  type NissanModelSlug,
} from '../sync/nissan-sync';

const NISSAN_OEM_ID = 'nissan-au' as const;

export interface NissanModelPageBuildTarget {
  pageId: string;
  oemId: typeof NISSAN_OEM_ID;
  modelSlug: NissanModelSlug;
  modelName: string;
  sourceUrl: string;
}

export const NISSAN_MODEL_PAGE_BUILD_PLAN: readonly NissanModelPageBuildTarget[] = (
  Object.entries(NISSAN_AU_MODELS) as Array<[
    NissanModelSlug,
    (typeof NISSAN_AU_MODELS)[NissanModelSlug],
  ]>
).map(([modelSlug, model]) => Object.freeze({
  pageId: `${NISSAN_OEM_ID}-${modelSlug}`,
  oemId: NISSAN_OEM_ID,
  modelSlug,
  modelName: model.name,
  sourceUrl: model.sourceUrl,
}));

export function validateNissanPageSections(sections: PageSection[]): string[] {
  const types = new Set(sections.map(section => section.type));
  const errors: string[] = [];

  if (!types.has('hero')) errors.push('missing hero section');
  if (!types.has('intro') && !types.has('content-block')) {
    errors.push('missing model introduction section');
  }
  if (!types.has('feature-cards') && !types.has('tabs')) {
    errors.push('missing feature/story section');
  }
  if (!types.has('color-picker')) errors.push('missing color-picker section');
  if (!types.has('specs-grid')) errors.push('missing specifications section');
  if (!types.has('gallery') && !types.has('video')) errors.push('missing gallery/360 section');
  if (!types.has('cta-banner') && !types.has('enquiry-form')) {
    errors.push('missing price, offer, or enquiry CTA section');
  }

  return errors;
}

export interface NissanPagePipeline {
  run(
    oemId: OemId,
    modelSlug: string,
    sourceUrl: string,
    modelName?: string,
    options?: {
      forceClone?: boolean;
      cloneOnly?: boolean;
      validateSections?: (sections: PageSection[]) => string[];
    },
  ): Promise<PipelineResult>;
}

export interface BuildNissanModelPagesOptions {
  /** Defaults to true. Direct publication is rejected even when false. */
  dryRun?: boolean;
  modelSlugs?: NissanModelSlug[];
  forceClone?: boolean;
}

export interface NissanPageBuildResult {
  dryRun: boolean;
  planned: NissanModelPageBuildTarget[];
  succeeded: string[];
  failed: Array<{ pageId: string; error: string }>;
  pipelineResults: PipelineResult[];
}

/**
 * Return the six-model builder plan. Direct pipeline publication is refused:
 * write-capable Nissan generation must use `stageNissanModelPageCandidate`,
 * which isolates the artifact until a named reviewer promotes it.
 */
export async function buildNissanModelPages(
  _pipeline: NissanPagePipeline,
  options: BuildNissanModelPagesOptions = {},
): Promise<NissanPageBuildResult> {
  const dryRun = options.dryRun !== false;
  const selected = new Set(options.modelSlugs || NISSAN_MODEL_PAGE_BUILD_PLAN.map(item => item.modelSlug));
  const planned = NISSAN_MODEL_PAGE_BUILD_PLAN.filter(item => selected.has(item.modelSlug));
  const result: NissanPageBuildResult = {
    dryRun,
    planned: [...planned],
    succeeded: [],
    failed: [],
    pipelineResults: [],
  };

  if (!dryRun) {
    result.failed = planned.map(target => ({
      pageId: target.pageId,
      error: 'Direct Nissan page publication is disabled; use the review-candidate workflow',
    }));
  }

  return result;
}
