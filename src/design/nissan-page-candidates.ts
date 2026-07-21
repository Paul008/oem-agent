/** Review-before-publication storage workflow for Nissan model-page builds. */

import type { VehicleModelPage } from '../oem/types';
import {
  assertNissanOfficialUrl,
} from '../sync/nissan-sync';
import {
  validateNissanPageSections,
  type NissanModelPageBuildTarget,
  type NissanPagePipeline,
} from './nissan-page-builder';

interface NissanPageCandidateObject {
  customMetadata?: Record<string, string>;
  httpMetadata?: R2HTTPMetadata;
  arrayBuffer(): Promise<ArrayBuffer>;
  json<T = unknown>(): Promise<T>;
}

export interface NissanPageCandidateStore {
  get(key: string): Promise<NissanPageCandidateObject | null>;
  put(key: string, value: string | ArrayBuffer, options?: R2PutOptions): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export interface NissanPageCandidateOptions {
  candidateId?: string;
  forceClone?: boolean;
  now?: () => Date;
}

export interface NissanPageCandidateResult {
  success: boolean;
  candidateId: string;
  candidateKey: string | null;
  stagingSlug: string;
  errors: string[];
}

export interface NissanPageCandidatePublishOptions {
  reviewedBy: string;
  now?: () => Date;
}

export interface NissanPageCandidatePublishResult {
  success: boolean;
  candidateId: string;
  candidateKey: string;
  publishedKey: string | null;
  versionKey: string | null;
  errors: string[];
}

function normalizedUrl(value: string): string | null {
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

export function validateNissanModelPageArtifact(
  target: NissanModelPageBuildTarget,
  page: VehicleModelPage,
): string[] {
  const errors: string[] = [];
  if (page.id !== target.pageId) errors.push(`page id must be ${target.pageId}`);
  if (page.oem_id !== target.oemId) errors.push(`oem_id must be ${target.oemId}`);
  if (page.slug !== target.modelSlug) errors.push(`page slug must be ${target.modelSlug}`);

  const expectedSource = assertNissanOfficialUrl(target.sourceUrl).toString();
  const actualSource = normalizedUrl(page.source_url);
  if (actualSource !== expectedSource) {
    errors.push('source_url does not match the reviewed Nissan model source');
  }

  const sections = Array.isArray(page.content?.sections) ? page.content.sections : [];
  errors.push(...validateNissanPageSections(sections));

  const serialized = JSON.stringify(page).toLowerCase();
  if (serialized.includes('adus.com.au') || serialized.includes('nissan-adme')) {
    errors.push('artifact contains a prohibited ADUS/ADME reference');
  }
  return [...new Set(errors)];
}

function resolveCandidateId(value: string | undefined): string {
  const candidateId = value || crypto.randomUUID();
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(candidateId)) {
    throw new Error('candidateId must be lowercase alphanumeric with hyphens');
  }
  return candidateId;
}

/**
 * Run the adaptive page pipeline under a non-public staging slug, copy the
 * validated result to the candidate namespace, and remove staging latest.json.
 * The public `{modelSlug}/latest.json` key is never read or written.
 */
export async function stageNissanModelPageCandidate(
  store: NissanPageCandidateStore,
  pipeline: NissanPagePipeline,
  target: NissanModelPageBuildTarget,
  options: NissanPageCandidateOptions = {},
): Promise<NissanPageCandidateResult> {
  const candidateId = resolveCandidateId(options.candidateId);
  const stagingSlug = `${target.modelSlug}--candidate-${candidateId}`;
  const stagingKey = `pages/definitions/${target.oemId}/${stagingSlug}/latest.json`;
  const candidateKey = `pages/candidates/${target.oemId}/${target.modelSlug}/${candidateId}.json`;
  const result: NissanPageCandidateResult = {
    success: false,
    candidateId,
    candidateKey: null,
    stagingSlug,
    errors: [],
  };

  try {
    const sourceUrl = assertNissanOfficialUrl(target.sourceUrl).toString();
    const pipelineResult = await pipeline.run(
      target.oemId,
      stagingSlug,
      sourceUrl,
      target.modelName,
      {
        forceClone: options.forceClone,
        validateSections: validateNissanPageSections,
      },
    );
    if (!pipelineResult.success) {
      result.errors.push(pipelineResult.error || 'Adaptive pipeline failed');
      return result;
    }

    const generatedObject = await store.get(stagingKey);
    if (!generatedObject) {
      result.errors.push('Adaptive pipeline did not produce a staging artifact');
      return result;
    }

    const generated = await generatedObject.json<VehicleModelPage>();
    const candidate: VehicleModelPage = {
      ...generated,
      id: target.pageId,
      slug: target.modelSlug,
      oem_id: target.oemId,
    };
    const validationErrors = validateNissanModelPageArtifact(target, candidate);
    if (validationErrors.length > 0) {
      result.errors.push(...validationErrors);
      return result;
    }

    const stagedAt = (options.now || (() => new Date()))().toISOString();
    await store.put(candidateKey, JSON.stringify(candidate), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        candidate_status: 'pending-review',
        candidate_id: candidateId,
        oem_id: target.oemId,
        model_slug: target.modelSlug,
        source_url: sourceUrl,
        staged_at: stagedAt,
      },
    });
    result.success = true;
    result.candidateKey = candidateKey;
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  } finally {
    await store.delete(stagingKey);
  }
}

/** Promote one explicitly reviewed, revalidated candidate to public latest.json. */
export async function publishNissanModelPageCandidate(
  store: NissanPageCandidateStore,
  target: NissanModelPageBuildTarget,
  requestedCandidateId: string,
  options: NissanPageCandidatePublishOptions,
): Promise<NissanPageCandidatePublishResult> {
  const reviewedBy = options.reviewedBy?.trim();
  const initialCandidateId = requestedCandidateId || '';
  const initialCandidateKey = `pages/candidates/${target.oemId}/${target.modelSlug}/${initialCandidateId}.json`;
  const result: NissanPageCandidatePublishResult = {
    success: false,
    candidateId: initialCandidateId,
    candidateKey: initialCandidateKey,
    publishedKey: null,
    versionKey: null,
    errors: [],
  };
  if (!reviewedBy) {
    result.errors.push('reviewedBy is required before candidate publication');
    return result;
  }
  if (reviewedBy.length > 200 || /[\u0000-\u001f\u007f]/.test(reviewedBy)) {
    result.errors.push('reviewedBy contains invalid characters or exceeds 200 characters');
    return result;
  }

  try {
    const candidateId = resolveCandidateId(requestedCandidateId);
    const candidateKey = `pages/candidates/${target.oemId}/${target.modelSlug}/${candidateId}.json`;
    result.candidateId = candidateId;
    result.candidateKey = candidateKey;

    const candidateObject = await store.get(candidateKey);
    if (!candidateObject) {
      result.errors.push('Nissan page candidate was not found');
      return result;
    }
    const candidate = await candidateObject.json<VehicleModelPage>();
    const validationErrors = validateNissanModelPageArtifact(target, candidate);
    if (candidateObject.customMetadata?.candidate_status !== 'pending-review') {
      validationErrors.push('candidate status must be pending-review');
    }
    if (validationErrors.length > 0) {
      result.errors.push(...validationErrors);
      return result;
    }

    const publishedAt = (options.now || (() => new Date()))();
    if (Number.isNaN(publishedAt.getTime())) {
      result.errors.push('publication timestamp is invalid');
      return result;
    }
    const body = JSON.stringify(candidate);
    const publishedKey = `pages/definitions/${target.oemId}/${target.modelSlug}/latest.json`;
    const versionKey = `pages/definitions/${target.oemId}/${target.modelSlug}/v-${publishedAt.getTime()}-${candidateId}.json`;
    const publicationMetadata = {
      pipeline: 'nissan-official-candidate-v1',
      oem_id: target.oemId,
      model_slug: target.modelSlug,
      candidate_id: candidateId,
      reviewed_by: reviewedBy,
      published_at: publishedAt.toISOString(),
    };

    await store.put(versionKey, body, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: publicationMetadata,
    });
    await store.put(publishedKey, body, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: publicationMetadata,
    });
    await store.put(candidateKey, body, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        ...(candidateObject.customMetadata || {}),
        candidate_status: 'published',
        reviewed_by: reviewedBy,
        published_at: publishedAt.toISOString(),
        published_key: publishedKey,
      },
    });

    result.success = true;
    result.publishedKey = publishedKey;
    result.versionKey = versionKey;
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
}
