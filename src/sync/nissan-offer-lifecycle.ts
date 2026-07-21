/** Atomic reviewed promotion and rollback boundary for staged Nissan offers. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NissanOfficialOfferRunEvidence } from './nissan-official-offer-evidence';

export interface NissanOfferPromotionInput {
  sourceRunId: string;
  reviewedBy: string;
  expectedOffers: number;
}

export interface NissanOfferRollbackInput {
  promotionId: string;
  reviewedBy: string;
}

export interface NissanOfferLifecycleResult {
  success: boolean;
  promotionId: string | null;
  offersChanged: number;
  offersRetired: number;
  sourceRunId: string | null;
  error: string | null;
}

interface NissanOfferLifecycleRpcRow {
  promotion_id?: unknown;
  offers_promoted?: unknown;
  offers_retired?: unknown;
  offers_rolled_back?: unknown;
  source_run_id?: unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validEvidenceShape(value: unknown): value is NissanOfficialOfferRunEvidence {
  if (!isRecord(value) || !isRecord(value.offers)) return false;
  const source = value.source;
  return typeof value.id === 'string'
    && typeof value.mode === 'string'
    && typeof value.status === 'string'
    && Number.isInteger(value.offers.upserted)
    && Array.isArray(value.offers.errors)
    && Array.isArray(value.errors)
    && (source === null || (isRecord(source) && Array.isArray(source.errors)));
}

function validReviewer(value: string): boolean {
  const reviewer = value.trim();
  return reviewer.length >= 3
    && reviewer.length <= 200
    && reviewer.includes('@')
    && !/[\u0000-\u001f\u007f]/.test(reviewer);
}

function failed(error: string): NissanOfferLifecycleResult {
  return {
    success: false,
    promotionId: null,
    offersChanged: 0,
    offersRetired: 0,
    sourceRunId: null,
    error,
  };
}

function firstRpcRow(data: unknown): NissanOfferLifecycleRpcRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row as NissanOfferLifecycleRpcRow : null;
}

function successfulResult(
  row: NissanOfferLifecycleRpcRow | null,
  countField: 'offers_promoted' | 'offers_rolled_back',
): NissanOfferLifecycleResult {
  const promotionId = typeof row?.promotion_id === 'string' ? row.promotion_id : null;
  const sourceRunId = typeof row?.source_run_id === 'string' ? row.source_run_id : null;
  const offersChanged = Number(row?.[countField]);
  const offersRetired = countField === 'offers_promoted'
    ? Number(row?.offers_retired)
    : 0;
  if (
    !promotionId
    || !sourceRunId
    || !Number.isInteger(offersChanged)
    || offersChanged < 1
    || !Number.isInteger(offersRetired)
    || offersRetired < 0
  ) {
    return failed('Nissan offer lifecycle RPC returned an invalid result');
  }
  return {
    success: true,
    promotionId,
    offersChanged,
    offersRetired,
    sourceRunId,
    error: null,
  };
}

export function validateNissanOfferPromotionEvidence(
  evidence: unknown,
  sourceRunId: string,
): string[] {
  if (!validEvidenceShape(evidence)) return ['offer run evidence schema is invalid'];
  const errors: string[] = [];
  if (evidence.id !== sourceRunId) {
    errors.push('offer run evidence id does not match source_run_id');
  }
  if (evidence.mode !== 'staged-offers') {
    errors.push('offer run evidence mode must be staged-offers');
  }
  if (evidence.status !== 'success') {
    errors.push('offer run evidence status must be success');
  }
  if (evidence.offers.upserted < 1) {
    errors.push('offer run evidence contains no staged offers');
  }
  if (
    evidence.offers.errors.length > 0
    || evidence.errors.length > 0
    || evidence.source?.errors.length
  ) {
    errors.push('offer run evidence contains errors');
  }
  return [...new Set(errors)];
}

export async function promoteNissanOffers(
  supabase: Pick<SupabaseClient, 'rpc'>,
  input: NissanOfferPromotionInput,
): Promise<NissanOfferLifecycleResult> {
  const reviewer = input.reviewedBy.trim().toLowerCase();
  if (!RUN_ID_PATTERN.test(input.sourceRunId)) return failed('Invalid Nissan offer source run id');
  if (!validReviewer(input.reviewedBy)) return failed('A valid named offer reviewer is required');
  if (!Number.isInteger(input.expectedOffers) || input.expectedOffers < 1) {
    return failed('Expected Nissan offer count must be a positive integer');
  }

  const { data, error } = await supabase.rpc('promote_nissan_offers', {
    p_source_run_id: input.sourceRunId,
    p_reviewer_email: reviewer,
    p_expected_offers: input.expectedOffers,
  });
  if (error) return failed(`Nissan offer promotion failed: ${error.message}`);
  return successfulResult(firstRpcRow(data), 'offers_promoted');
}

export async function rollbackNissanOffers(
  supabase: Pick<SupabaseClient, 'rpc'>,
  input: NissanOfferRollbackInput,
): Promise<NissanOfferLifecycleResult> {
  const reviewer = input.reviewedBy.trim().toLowerCase();
  if (!UUID_PATTERN.test(input.promotionId)) return failed('Invalid Nissan offer promotion id');
  if (!validReviewer(input.reviewedBy)) return failed('A valid named offer rollback reviewer is required');

  const { data, error } = await supabase.rpc('rollback_nissan_offers', {
    p_promotion_id: input.promotionId,
    p_reviewer_email: reviewer,
  });
  if (error) return failed(`Nissan offer rollback failed: ${error.message}`);
  return successfulResult(firstRpcRow(data), 'offers_rolled_back');
}
