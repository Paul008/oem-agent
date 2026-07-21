import { describe, expect, it, vi } from 'vitest';
import {
  promoteNissanOffers,
  rollbackNissanOffers,
  validateNissanOfferPromotionEvidence,
} from './nissan-offer-lifecycle';
import type { NissanOfficialOfferRunEvidence } from './nissan-official-offer-evidence';

function successfulEvidence(): NissanOfficialOfferRunEvidence {
  return {
    id: 'offer-run-001',
    actor_email: 'stager@example.com',
    mode: 'staged-offers',
    status: 'success',
    recorded_at: '2026-07-21T01:00:02.000Z',
    source: {
      status: 'healthy', requestCount: 1, recordsFetched: 2,
      lastSuccessfulAt: '2026-07-21T01:00:01.000Z', errors: [],
    },
    offers: {
      fetched: 2,
      upserted: 2,
      product_links_upserted: 1,
      errors: [],
    },
    errors: [],
  };
}

describe('Nissan offer promotion evidence', () => {
  it('accepts a complete successful staged offer run', () => {
    expect(validateNissanOfferPromotionEvidence(successfulEvidence(), 'offer-run-001'))
      .toEqual([]);
  });

  it('rejects partial, mismatched, empty, or errored evidence', () => {
    const evidence = successfulEvidence();
    evidence.id = 'other-run';
    evidence.status = 'partial';
    evidence.offers.upserted = 0;
    evidence.offers.errors.push('one write failed');

    expect(validateNissanOfferPromotionEvidence(evidence, 'offer-run-001'))
      .toEqual(expect.arrayContaining([
        'offer run evidence id does not match source_run_id',
        'offer run evidence status must be success',
        'offer run evidence contains no staged offers',
        'offer run evidence contains errors',
      ]));
  });

  it('rejects malformed stored evidence without throwing', () => {
    expect(validateNissanOfferPromotionEvidence({ id: 'offer-run-001' } as any, 'offer-run-001'))
      .toContain('offer run evidence schema is invalid');
  });
});

describe('Nissan offer lifecycle RPC boundary', () => {
  it('promotes exactly the reviewed staged offer count', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        promotion_id: '11111111-1111-4111-8111-111111111111',
        offers_promoted: 2,
        offers_retired: 3,
        source_run_id: 'offer-run-001',
      }],
      error: null,
    }));

    const result = await promoteNissanOffers({ rpc } as any, {
      sourceRunId: 'offer-run-001',
      reviewedBy: 'reviewer@example.com',
      expectedOffers: 2,
    });

    expect(result).toEqual({
      success: true,
      promotionId: '11111111-1111-4111-8111-111111111111',
      offersChanged: 2,
      offersRetired: 3,
      sourceRunId: 'offer-run-001',
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('promote_nissan_offers', {
      p_source_run_id: 'offer-run-001',
      p_reviewer_email: 'reviewer@example.com',
      p_expected_offers: 2,
    });
  });

  it('rolls back only a named promotion through the inverse RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        promotion_id: '11111111-1111-4111-8111-111111111111',
        offers_rolled_back: 5,
        source_run_id: 'offer-run-001',
      }],
      error: null,
    }));

    const result = await rollbackNissanOffers({ rpc } as any, {
      promotionId: '11111111-1111-4111-8111-111111111111',
      reviewedBy: 'rollback-reviewer@example.com',
    });

    expect(result).toMatchObject({
      success: true,
      offersChanged: 5,
      offersRetired: 0,
      sourceRunId: 'offer-run-001',
    });
    expect(rpc).toHaveBeenCalledWith('rollback_nissan_offers', {
      p_promotion_id: '11111111-1111-4111-8111-111111111111',
      p_reviewer_email: 'rollback-reviewer@example.com',
    });
  });

  it('rejects invalid run, reviewer, count, and promotion inputs before RPC', async () => {
    const rpc = vi.fn();
    await expect(promoteNissanOffers({ rpc } as any, {
      sourceRunId: '../run', reviewedBy: ' ', expectedOffers: 0,
    })).resolves.toMatchObject({ success: false });
    await expect(rollbackNissanOffers({ rpc } as any, {
      promotionId: 'not-a-uuid', reviewedBy: 'reviewer@example.com',
    })).resolves.toMatchObject({ success: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});
