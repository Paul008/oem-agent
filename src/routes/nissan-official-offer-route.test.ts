import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createMockEnv } from '../test-utils';
import type { NissanOfficialOfferRunEvidence } from '../sync/nissan-official-offer-evidence';

const mocks = vi.hoisted(() => ({
  syncOffers: vi.fn(),
  saveEvidence: vi.fn(),
  promote: vi.fn(),
  rollback: vi.fn(),
}));

vi.mock('../sync/nissan-sync', async importOriginal => {
  const actual = await importOriginal<typeof import('../sync/nissan-sync')>();
  return { ...actual, syncNissanOffers: mocks.syncOffers };
});

vi.mock('../sync/nissan-official-offer-evidence', async importOriginal => {
  const actual = await importOriginal<typeof import('../sync/nissan-official-offer-evidence')>();
  return { ...actual, saveNissanOfficialOfferRunEvidence: mocks.saveEvidence };
});

vi.mock('../sync/nissan-offer-lifecycle', async importOriginal => {
  const actual = await importOriginal<typeof import('../sync/nissan-offer-lifecycle')>();
  return {
    ...actual,
    promoteNissanOffers: mocks.promote,
    rollbackNissanOffers: mocks.rollback,
  };
});

vi.mock('../utils/supabase', () => ({
  createSupabaseClient: () => ({ offerLifecycleDb: true }),
}));

import { nissanOfficialAdmin } from './nissan-official-admin';

function evidence(): NissanOfficialOfferRunEvidence {
  return {
    id: 'offer-run-001',
    actor_email: 'operator@example.com',
    mode: 'staged-offers',
    status: 'success',
    recorded_at: '2026-07-21T01:00:02.000Z',
    source: {
      status: 'healthy', requestCount: 1, recordsFetched: 2,
      lastSuccessfulAt: '2026-07-21T01:00:01.000Z', errors: [],
    },
    offers: { fetched: 2, upserted: 2, product_links_upserted: 1, errors: [] },
    errors: [],
  };
}

function bucket() {
  return {
    async get(key: string) {
      if (key !== 'nissan-official/offer-runs/offer-run-001.json') return null;
      return { json: async () => evidence() };
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

describe('Nissan offer lifecycle admin routes', () => {
  it('stages official offers with a source run id and durable OEM page evidence', async () => {
    mocks.syncOffers.mockResolvedValueOnce({
      dryRun: false, offersFetched: 2, offersUpserted: 2,
      productLinksUpserted: 1, errors: [],
    });
    mocks.saveEvidence.mockImplementationOnce(async (_bucket, input) => ({
      key: `nissan-official/offer-runs/${input.runId}.json`,
      evidence: evidence(),
    }));
    const pageBucket = bucket();
    const env = createMockEnv({
      NISSAN_OFFICIAL_OPERATORS: 'operator@example.com',
      NISSAN_OFFER_STAGING_ENABLED: 'true',
      NISSAN_CHOICES_API_KEY: 'choices-key',
      NISSAN_CHOICES_CLIENT_KEY: 'client-key',
      OEM_PAGE_BUCKET: pageBucket,
    });

    const response = await app().request(
      'https://example.com/admin/nissan-official/stage-offers',
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'STAGE_NISSAN_OFFICIAL_OFFERS' }),
      },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ offersUpserted: 2 });
    expect(body.run_id).toEqual(expect.any(String));
    expect(mocks.syncOffers).toHaveBeenCalledWith(
      expect.objectContaining({ offerLifecycleDb: true }),
      expect.objectContaining({ dryRun: false, sourceRunId: body.run_id }),
    );
    expect(mocks.saveEvidence).toHaveBeenCalledWith(
      pageBucket,
      expect.objectContaining({ actorEmail: 'operator@example.com', runId: body.run_id }),
    );
  });

  it('promotes only a successful immutable offer run behind explicit confirmation', async () => {
    mocks.promote.mockResolvedValueOnce({
      success: true,
      promotionId: '11111111-1111-4111-8111-111111111111',
      offersChanged: 2,
      offersRetired: 3,
      sourceRunId: 'offer-run-001',
      error: null,
    });
    const env = createMockEnv({
      NISSAN_OFFICIAL_OPERATORS: 'operator@example.com',
      NISSAN_OFFER_PROMOTION_ENABLED: 'true',
      OEM_PAGE_BUCKET: bucket(),
    });

    const response = await app().request(
      'https://example.com/admin/nissan-official/promote-offers',
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_run_id: 'offer-run-001',
          confirmation: 'PROMOTE_REVIEWED_NISSAN_OFFERS',
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(mocks.promote).toHaveBeenCalledWith(
      expect.objectContaining({ offerLifecycleDb: true }),
      {
        sourceRunId: 'offer-run-001',
        reviewedBy: 'operator@example.com',
        expectedOffers: 2,
      },
    );
  });

  it('runs offer rollback only behind its separate disabled-by-default gate', async () => {
    mocks.rollback.mockResolvedValueOnce({
      success: true,
      promotionId: '11111111-1111-4111-8111-111111111111',
      offersChanged: 5,
      offersRetired: 0,
      sourceRunId: 'offer-run-001',
      error: null,
    });
    const env = createMockEnv({
      NISSAN_OFFICIAL_OPERATORS: 'operator@example.com',
      NISSAN_OFFER_ROLLBACK_ENABLED: 'true',
    });

    const response = await app().request(
      'https://example.com/admin/nissan-official/rollback-offers',
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promotion_id: '11111111-1111-4111-8111-111111111111',
          confirmation: 'ROLLBACK_NISSAN_OFFERS',
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(mocks.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ offerLifecycleDb: true }),
      {
        promotionId: '11111111-1111-4111-8111-111111111111',
        reviewedBy: 'operator@example.com',
      },
    );
  });
});
