import { describe, expect, it, vi } from 'vitest';
import type { NissanOfficialRunEvidence } from './nissan-official-run-evidence';
import {
  promoteNissanCatalog,
  rollbackNissanCatalog,
  validateNissanCatalogPromotionEvidence,
} from './nissan-catalog-lifecycle';

function successfulEvidence(): NissanOfficialRunEvidence {
  return {
    id: 'run-001',
    actor_email: 'stager@example.com',
    mode: 'staged-catalog',
    status: 'success',
    model_slugs: ['qashqai'],
    recorded_at: '2026-07-21T01:00:02.000Z',
    health: {
      connector: 'nissan-official-v1',
      startedAt: '2026-07-21T01:00:00.000Z',
      completedAt: '2026-07-21T01:00:01.000Z',
      durationMs: 1000,
      sources: {
        pace: {
          status: 'healthy', requestCount: 1, recordsFetched: 2,
          lastSuccessfulAt: '2026-07-21T01:00:01.000Z', errors: [],
        },
        choices: {
          status: 'skipped', requestCount: 0, recordsFetched: 0,
          lastSuccessfulAt: null, errors: [],
        },
        offers: {
          status: 'skipped', requestCount: 0, recordsFetched: 0,
          lastSuccessfulAt: null, errors: [],
        },
      },
    },
    catalog: {
      models_fetched: 1,
      versions_fetched: 2,
      catalogs_rejected: 0,
      models_upserted: 1,
      products_upserted: 2,
      colors_upserted: 4,
      pricing_upserted: 2,
      choices_requests: 0,
      regional_pricing_rows: 0,
      drift_warnings: [],
      errors: [],
    },
    offers: { requested: false, written: false },
    errors: [],
  };
}

describe('Nissan catalog promotion evidence', () => {
  it('accepts one complete successful staged model run', () => {
    expect(validateNissanCatalogPromotionEvidence(successfulEvidence(), 'qashqai', 'run-001'))
      .toEqual([]);
  });

  it('rejects partial, mismatched, or rejected run evidence before any activation', () => {
    const evidence = successfulEvidence();
    evidence.status = 'partial';
    evidence.model_slugs = ['ariya'];
    evidence.catalog.catalogs_rejected = 1;
    evidence.catalog.errors = ['catalog drift rejected'];

    expect(validateNissanCatalogPromotionEvidence(evidence, 'qashqai', 'run-001'))
      .toEqual(expect.arrayContaining([
        'run evidence status must be success',
        'run evidence must contain only qashqai',
        'run evidence contains a rejected catalog',
        'run evidence contains catalog errors',
      ]));
  });
});

describe('Nissan catalog lifecycle RPC boundary', () => {
  it('promotes exactly the reviewed model and expected staged product count', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        promotion_id: '11111111-1111-4111-8111-111111111111',
        model_slug: 'qashqai',
        products_promoted: 2,
        source_run_id: 'run-001',
      }],
      error: null,
    }));

    const result = await promoteNissanCatalog({ rpc } as any, {
      modelSlug: 'qashqai',
      sourceRunId: 'run-001',
      reviewedBy: 'reviewer@example.com',
      expectedProducts: 2,
    });

    expect(result).toEqual({
      success: true,
      promotionId: '11111111-1111-4111-8111-111111111111',
      modelSlug: 'qashqai',
      productsChanged: 2,
      sourceRunId: 'run-001',
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('promote_nissan_catalog', {
      p_model_slug: 'qashqai',
      p_source_run_id: 'run-001',
      p_reviewer_email: 'reviewer@example.com',
      p_expected_products: 2,
    });
  });

  it('rolls back only a named promotion through the inverse RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        promotion_id: '11111111-1111-4111-8111-111111111111',
        model_slug: 'qashqai',
        products_rolled_back: 2,
        source_run_id: 'run-001',
      }],
      error: null,
    }));

    const result = await rollbackNissanCatalog({ rpc } as any, {
      promotionId: '11111111-1111-4111-8111-111111111111',
      reviewedBy: 'rollback-reviewer@example.com',
    });

    expect(result).toMatchObject({
      success: true,
      promotionId: '11111111-1111-4111-8111-111111111111',
      modelSlug: 'qashqai',
      productsChanged: 2,
      sourceRunId: 'run-001',
    });
    expect(rpc).toHaveBeenCalledWith('rollback_nissan_catalog', {
      p_promotion_id: '11111111-1111-4111-8111-111111111111',
      p_reviewer_email: 'rollback-reviewer@example.com',
    });
  });

  it('rejects invalid reviewer, run, count, and promotion inputs before the database', async () => {
    const rpc = vi.fn();
    await expect(promoteNissanCatalog({ rpc } as any, {
      modelSlug: 'qashqai',
      sourceRunId: '../run',
      reviewedBy: '   ',
      expectedProducts: 0,
    })).resolves.toMatchObject({ success: false });
    await expect(rollbackNissanCatalog({ rpc } as any, {
      promotionId: 'not-a-uuid',
      reviewedBy: 'reviewer@example.com',
    })).resolves.toMatchObject({ success: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});
