import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createMockEnv } from '../test-utils';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
}));

vi.mock('../sync/nissan-official-runner', () => ({
  runNissanOfficialSync: mocks.run,
}));

vi.mock('../utils/supabase', () => ({
  createSupabaseClient: () => ({ staged: true }),
}));

import { nissanOfficialAdmin } from './nissan-official-admin';

function successResult() {
  return {
    dryRun: false,
    catalog: {
      dryRun: false,
      modelsFetched: 1,
      versionsFetched: 2,
      catalogsRejected: 0,
      modelsUpserted: 1,
      productsUpserted: 2,
      colorsUpserted: 4,
      pricingUpserted: 2,
      choicesRequests: 0,
      regionalPricingRows: 0,
      driftWarnings: [],
      errors: [],
    },
    offers: null,
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
    errors: [],
  };
}

describe('Nissan staged write route success path', () => {
  it('forces offers off, writes staged data, and records dedicated-bucket evidence', async () => {
    mocks.run.mockResolvedValueOnce(successResult());
    const objects = new Map<string, string>();
    const pageBucket = {
      async put(key: string, value: string | ArrayBuffer) {
        objects.set(key, typeof value === 'string' ? value : new TextDecoder().decode(value));
      },
    } as unknown as R2Bucket;
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('accessUser', { email: 'operator@example.com' });
      await next();
    });
    app.route('/admin/nissan-official', nissanOfficialAdmin);
    const env = createMockEnv({
      NISSAN_PACE_API_KEY: 'pace-secret-that-must-not-be-stored',
      NISSAN_OFFICIAL_OPERATORS: 'operator@example.com',
      NISSAN_STAGED_WRITES_ENABLED: 'true',
      OEM_PAGE_BUCKET: pageBucket,
      MOLTBOT_BUCKET: {
        put: () => { throw new Error('legacy bucket must not be written'); },
      } as unknown as R2Bucket,
    });

    const response = await app.request(
      'https://example.com/admin/nissan-official/stage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_slug: 'qashqai',
          catalog_postcode: '3083',
          confirmation: 'STAGE_NISSAN_OFFICIAL_DATA',
        }),
      },
      env,
    );
    const body = await response.json<{ run_id: string; evidence_key: string }>();

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ staged: true }),
      env,
      expect.objectContaining({
        dryRun: false,
        modelSlugs: ['qashqai'],
        catalogPostcode: '3083',
        includeOffers: false,
        sourceRunId: body.run_id,
      }),
    );
    expect(body.evidence_key).toBe(`nissan-official/runs/${body.run_id}.json`);
    expect(objects.has(body.evidence_key)).toBe(true);
    expect(objects.has('nissan-official/runs/latest.json')).toBe(true);
    expect(objects.get(body.evidence_key)).not.toContain('pace-secret-that-must-not-be-stored');
  });
});
