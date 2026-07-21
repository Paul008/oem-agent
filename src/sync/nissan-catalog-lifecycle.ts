/** Atomic reviewed promotion and rollback boundary for staged Nissan catalogs. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NissanOfficialRunEvidence } from './nissan-official-run-evidence';
import type { NissanModelSlug } from './nissan-sync';

export interface NissanCatalogPromotionInput {
  modelSlug: NissanModelSlug;
  sourceRunId: string;
  reviewedBy: string;
  expectedProducts: number;
}

export interface NissanCatalogRollbackInput {
  promotionId: string;
  reviewedBy: string;
}

export interface NissanCatalogLifecycleResult {
  success: boolean;
  promotionId: string | null;
  modelSlug: NissanModelSlug | null;
  productsChanged: number;
  sourceRunId: string | null;
  error: string | null;
}

interface NissanCatalogLifecycleRpcRow {
  promotion_id?: unknown;
  model_slug?: unknown;
  products_promoted?: unknown;
  products_rolled_back?: unknown;
  source_run_id?: unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/;

function validReviewer(value: string): boolean {
  const reviewer = value.trim();
  return reviewer.length > 0
    && reviewer.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(reviewer);
}

function failed(error: string): NissanCatalogLifecycleResult {
  return {
    success: false,
    promotionId: null,
    modelSlug: null,
    productsChanged: 0,
    sourceRunId: null,
    error,
  };
}

function firstRpcRow(data: unknown): NissanCatalogLifecycleRpcRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row as NissanCatalogLifecycleRpcRow : null;
}

function successfulResult(
  row: NissanCatalogLifecycleRpcRow | null,
  countField: 'products_promoted' | 'products_rolled_back',
): NissanCatalogLifecycleResult {
  const promotionId = typeof row?.promotion_id === 'string' ? row.promotion_id : null;
  const modelSlug = typeof row?.model_slug === 'string' ? row.model_slug as NissanModelSlug : null;
  const sourceRunId = typeof row?.source_run_id === 'string' ? row.source_run_id : null;
  const productsChanged = Number(row?.[countField]);
  if (
    !promotionId
    || !modelSlug
    || !sourceRunId
    || !Number.isInteger(productsChanged)
    || productsChanged < 1
  ) {
    return failed('Nissan catalog lifecycle RPC returned an invalid result');
  }
  return {
    success: true,
    promotionId,
    modelSlug,
    productsChanged,
    sourceRunId,
    error: null,
  };
}

export function validateNissanCatalogPromotionEvidence(
  evidence: NissanOfficialRunEvidence,
  modelSlug: NissanModelSlug,
  sourceRunId: string,
): string[] {
  const errors: string[] = [];
  if (evidence.id !== sourceRunId) errors.push('run evidence id does not match source_run_id');
  if (evidence.mode !== 'staged-catalog') errors.push('run evidence mode must be staged-catalog');
  if (evidence.status !== 'success') errors.push('run evidence status must be success');
  if (evidence.model_slugs.length !== 1 || evidence.model_slugs[0] !== modelSlug) {
    errors.push(`run evidence must contain only ${modelSlug}`);
  }
  if (evidence.catalog.models_upserted !== 1) {
    errors.push('run evidence must contain exactly one staged model');
  }
  if (evidence.catalog.products_upserted < 1) {
    errors.push('run evidence contains no staged products');
  }
  if (evidence.catalog.catalogs_rejected > 0) {
    errors.push('run evidence contains a rejected catalog');
  }
  if (evidence.catalog.errors.length > 0 || evidence.errors.length > 0) {
    errors.push('run evidence contains catalog errors');
  }
  if (evidence.offers.requested || evidence.offers.written) {
    errors.push('catalog promotion evidence must not include offer writes');
  }
  return [...new Set(errors)];
}

export async function promoteNissanCatalog(
  supabase: Pick<SupabaseClient, 'rpc'>,
  input: NissanCatalogPromotionInput,
): Promise<NissanCatalogLifecycleResult> {
  const reviewer = input.reviewedBy.trim().toLowerCase();
  if (!RUN_ID_PATTERN.test(input.sourceRunId)) return failed('Invalid Nissan source run id');
  if (!validReviewer(input.reviewedBy)) return failed('A valid named reviewer is required');
  if (!Number.isInteger(input.expectedProducts) || input.expectedProducts < 1) {
    return failed('Expected Nissan product count must be a positive integer');
  }

  const { data, error } = await supabase.rpc('promote_nissan_catalog', {
    p_model_slug: input.modelSlug,
    p_source_run_id: input.sourceRunId,
    p_reviewer_email: reviewer,
    p_expected_products: input.expectedProducts,
  });
  if (error) return failed(`Nissan catalog promotion failed: ${error.message}`);
  return successfulResult(firstRpcRow(data), 'products_promoted');
}

export async function rollbackNissanCatalog(
  supabase: Pick<SupabaseClient, 'rpc'>,
  input: NissanCatalogRollbackInput,
): Promise<NissanCatalogLifecycleResult> {
  const reviewer = input.reviewedBy.trim().toLowerCase();
  if (!UUID_PATTERN.test(input.promotionId)) return failed('Invalid Nissan promotion id');
  if (!validReviewer(input.reviewedBy)) return failed('A valid named rollback reviewer is required');

  const { data, error } = await supabase.rpc('rollback_nissan_catalog', {
    p_promotion_id: input.promotionId,
    p_reviewer_email: reviewer,
  });
  if (error) return failed(`Nissan catalog rollback failed: ${error.message}`);
  return successfulResult(firstRpcRow(data), 'products_rolled_back');
}
