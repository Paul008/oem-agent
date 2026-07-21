import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createMockEnv } from '../test-utils';
import type { NissanOfficialRunEvidence } from '../sync/nissan-official-run-evidence';

const mocks = vi.hoisted(() => ({
  promote: vi.fn(),
  rollback: vi.fn(),
}));

vi.mock('../sync/nissan-catalog-lifecycle', async importOriginal => {
  const actual = await importOriginal<typeof import('../sync/nissan-catalog-lifecycle')>();
  return {
    ...actual,
    promoteNissanCatalog: mocks.promote,
    rollbackNissanCatalog: mocks.rollback,
  };
});

vi.mock('../utils/supabase', () => ({
  createSupabaseClient: () => ({ lifecycleDb: true }),
}));

import { nissanOfficialAdmin } from './nissan-official-admin';

function evidence(): NissanOfficialRunEvidence {
  return {
    id: 'run-001',
    actor_email: 'stager@example.com',
    mode: 'staged-catalog',
    status: 'success',
    model_slugs: ['qashqai'],
    recorded_at: '2026-07-21T01:00:02.000Z',
    health: null,
    catalog: {
      models_fetched: 1, versions_fetched: 2, catalogs_rejected: 0,
      models_upserted: 1, products_upserted: 2, colors_upserted: 4,
      pricing_upserted: 2, choices_requests: 0, regional_pricing_rows: 0,
      drift_warnings: [], errors: [],
    },
    offers: { requested: false, written: false },
    errors: [],
  };
}

function reviewedPage() {
  return {
    id: 'nissan-au-qashqai',
    slug: 'qashqai',
    name: 'QASHQAI',
    oem_id: 'nissan-au',
    header: { slides: [] },
    content: {
      rendered: '<main>QASHQAI</main>',
      sections: [
        { id: 'hero', type: 'hero' },
        { id: 'intro', type: 'intro' },
        { id: 'features', type: 'feature-cards' },
        { id: 'colours', type: 'color-picker' },
        { id: 'specs', type: 'specs-grid' },
        { id: 'gallery', type: 'gallery' },
        { id: 'cta', type: 'cta-banner' },
      ],
    },
    form: false,
    variant_link: '/build/qashqai',
    generated_at: '2026-07-21T02:00:00.000Z',
    source_url: 'https://www.nissan.com.au/vehicles/browse-range/qashqai.html',
    version: 1,
  };
}

function bucket() {
  const objects = new Map([
    ['nissan-official/runs/run-001.json', {
      body: evidence(),
      customMetadata: {},
    }],
    ['pages/definitions/nissan-au/qashqai/latest.json', {
      body: reviewedPage(),
      customMetadata: {
        pipeline: 'nissan-official-candidate-v1',
        oem_id: 'nissan-au',
        model_slug: 'qashqai',
        reviewed_by: 'page-reviewer@example.com',
        candidate_id: 'candidate-001',
      },
    }],
  ]);
  return {
    async get(key: string) {
      const value = objects.get(key);
      return value ? {
        customMetadata: value.customMetadata,
        json: async () => structuredClone(value.body),
      } : null;
    },
  } as unknown as R2Bucket;
}

function app() {
  const instance = new Hono<AppEnv>();
  instance.use('*', async (c, next) => {
    c.set('accessUser', { email: 'operator@example.com' });
    await next();
  });
  instance.route('/admin/nissan-official', nissanOfficialAdmin);
  return instance;
}

describe('Nissan catalog lifecycle admin routes', () => {
  it('promotes only a successful run with a reviewed, revalidated page artifact', async () => {
    mocks.promote.mockResolvedValueOnce({
      success: true,
      promotionId: '11111111-1111-4111-8111-111111111111',
      modelSlug: 'qashqai',
      productsChanged: 2,
      sourceRunId: 'run-001',
      error: null,
    });
    const env = createMockEnv({
      NISSAN_OFFICIAL_OPERATORS: 'operator@example.com',
      NISSAN_CATALOG_PROMOTION_ENABLED: 'true',
      OEM_PAGE_BUCKET: bucket(),
    });

    const response = await app().request(
      'https://example.com/admin/nissan-official/promote-catalog',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_slug: 'qashqai',
          source_run_id: 'run-001',
          confirmation: 'PROMOTE_REVIEWED_NISSAN_CATALOG',
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      promotionId: '11111111-1111-4111-8111-111111111111',
      page_candidate_id: 'candidate-001',
      page_reviewed_by: 'page-reviewer@example.com',
    });
    expect(mocks.promote).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleDb: true }),
      {
        modelSlug: 'qashqai',
        sourceRunId: 'run-001',
        reviewedBy: 'operator@example.com',
        expectedProducts: 2,
      },
    );
  });

  it('runs the inverse rollback only behind its own disabled-by-default gate', async () => {
    mocks.rollback.mockResolvedValueOnce({
      success: true,
      promotionId: '11111111-1111-4111-8111-111111111111',
      modelSlug: 'qashqai',
      productsChanged: 2,
      sourceRunId: 'run-001',
      error: null,
    });
    const env = createMockEnv({
      NISSAN_OFFICIAL_OPERATORS: 'operator@example.com',
      NISSAN_CATALOG_ROLLBACK_ENABLED: 'true',
    });

    const response = await app().request(
      'https://example.com/admin/nissan-official/rollback-catalog',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promotion_id: '11111111-1111-4111-8111-111111111111',
          confirmation: 'ROLLBACK_NISSAN_CATALOG',
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(mocks.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleDb: true }),
      {
        promotionId: '11111111-1111-4111-8111-111111111111',
        reviewedBy: 'operator@example.com',
      },
    );
  });
});
