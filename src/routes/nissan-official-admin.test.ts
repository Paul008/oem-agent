import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createMockEnv } from '../test-utils';
import { nissanOfficialAdmin } from './nissan-official-admin';

function app(accessEmail?: string) {
  const instance = new Hono<AppEnv>();
  if (accessEmail) {
    instance.use('*', async (c, next) => {
      c.set('accessUser', { email: accessEmail });
      await next();
    });
  }
  instance.route('/admin/nissan-official', nissanOfficialAdmin);
  return instance;
}

describe('Nissan official admin route', () => {
  it('returns the exact six-model staged plan without credentials', async () => {
    const response = await app().request(
      'https://example.com/admin/nissan-official/plan',
      {},
      createMockEnv(),
    );
    const body = await response.json<{ models: Array<{ pageId: string }>; scheduled: boolean }>();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.scheduled).toBe(false);
    expect(body.models.map(model => model.pageId)).toEqual([
      'nissan-au-qashqai',
      'nissan-au-new-x-trail',
      'nissan-au-patrol',
      'nissan-au-all-new-navara',
      'nissan-au-z',
      'nissan-au-ariya',
    ]);
  });

  it('rejects write attempts and unknown model slugs before any upstream call', async () => {
    const env = createMockEnv();
    const writeResponse = await app().request(
      'https://example.com/admin/nissan-official/dry-run',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_slug: 'qashqai', dry_run: false }) },
      env,
    );
    expect(writeResponse.status).toBe(400);

    const invalidResponse = await app().request(
      'https://example.com/admin/nissan-official/dry-run',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_slug: 'not-a-nissan' }) },
      env,
    );
    expect(invalidResponse.status).toBe(400);

    const invalidChoicesResponse = await app().request(
      'https://example.com/admin/nissan-official/dry-run',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_slug: 'qashqai', choices: { config_code: '../bad', choice_ids: [] } }) },
      env,
    );
    expect(invalidChoicesResponse.status).toBe(400);
  });

  it('requires explicit confirmation for candidate generation and reviewed publication', async () => {
    const env = createMockEnv();
    const buildResponse = await app().request(
      'https://example.com/admin/nissan-official/build-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_slug: 'qashqai' }),
      },
      env,
    );
    expect(buildResponse.status).toBe(400);
    await expect(buildResponse.json()).resolves.toMatchObject({
      error: expect.stringContaining('BUILD_NISSAN_REVIEW_CANDIDATE'),
    });

    const publishResponse = await app().request(
      'https://example.com/admin/nissan-official/publish-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_slug: 'qashqai', candidate_id: 'candidate-001' }),
      },
      env,
    );
    expect(publishResponse.status).toBe(400);
    await expect(publishResponse.json()).resolves.toMatchObject({
      error: expect.stringContaining('PUBLISH_REVIEWED_NISSAN_PAGE'),
    });
  });

  it('requires explicit confirmation and disabled-by-default flags for catalog promotion and rollback', async () => {
    const env = {
      ...createMockEnv(),
      NISSAN_OFFICIAL_OPERATORS: 'developer@example.com',
      OEM_PAGE_BUCKET: {} as R2Bucket,
    };
    const promoteUnconfirmed = await app('developer@example.com').request(
      'https://example.com/admin/nissan-official/promote-catalog',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_slug: 'qashqai', source_run_id: 'run-001' }),
      },
      env,
    );
    expect(promoteUnconfirmed.status).toBe(400);
    await expect(promoteUnconfirmed.json()).resolves.toMatchObject({
      error: expect.stringContaining('PROMOTE_REVIEWED_NISSAN_CATALOG'),
    });

    const promoteDisabled = await app('developer@example.com').request(
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
    expect(promoteDisabled.status).toBe(503);
    await expect(promoteDisabled.json()).resolves.toEqual({
      error: 'Nissan catalog promotion is disabled',
    });

    const rollbackUnconfirmed = await app('developer@example.com').request(
      'https://example.com/admin/nissan-official/rollback-catalog',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promotion_id: '11111111-1111-4111-8111-111111111111' }),
      },
      env,
    );
    expect(rollbackUnconfirmed.status).toBe(400);
    await expect(rollbackUnconfirmed.json()).resolves.toMatchObject({
      error: expect.stringContaining('ROLLBACK_NISSAN_CATALOG'),
    });
  });

  it('keeps staged catalog writes disabled without the exact confirmation and feature flag', async () => {
    const baseEnv = {
      ...createMockEnv(),
      NISSAN_PACE_API_KEY: 'pace-test-key',
      NISSAN_OFFICIAL_OPERATORS: 'developer@example.com',
      OEM_PAGE_BUCKET: {} as R2Bucket,
    };
    const unconfirmed = await app('developer@example.com').request(
      'https://example.com/admin/nissan-official/stage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_slug: 'qashqai' }),
      },
      baseEnv,
    );
    expect(unconfirmed.status).toBe(400);
    await expect(unconfirmed.json()).resolves.toMatchObject({
      error: expect.stringContaining('STAGE_NISSAN_OFFICIAL_DATA'),
    });

    const disabled = await app('developer@example.com').request(
      'https://example.com/admin/nissan-official/stage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_slug: 'qashqai',
          confirmation: 'STAGE_NISSAN_OFFICIAL_DATA',
        }),
      },
      baseEnv,
    );
    expect(disabled.status).toBe(503);
    await expect(disabled.json()).resolves.toEqual({
      error: 'Nissan staged writes are disabled',
    });
  });

  it('refuses offer writes and never falls back to MOLTBOT_BUCKET for staged evidence', async () => {
    const legacyBucket = {
      get: () => { throw new Error('legacy bucket must not be read'); },
      put: () => { throw new Error('legacy bucket must not be written'); },
    } as unknown as R2Bucket;
    const baseEnv = {
      ...createMockEnv(),
      NISSAN_PACE_API_KEY: 'pace-test-key',
      NISSAN_OFFICIAL_OPERATORS: 'developer@example.com',
      NISSAN_STAGED_WRITES_ENABLED: 'true',
      MOLTBOT_BUCKET: legacyBucket,
      OEM_PAGE_BUCKET: undefined,
    };

    const offers = await app('developer@example.com').request(
      'https://example.com/admin/nissan-official/stage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_slug: 'qashqai',
          include_offers: true,
          confirmation: 'STAGE_NISSAN_OFFICIAL_DATA',
        }),
      },
      baseEnv,
    );
    expect(offers.status).toBe(400);
    await expect(offers.json()).resolves.toMatchObject({
      error: expect.stringContaining('offers'),
    });

    const noDedicatedBucket = await app('developer@example.com').request(
      'https://example.com/admin/nissan-official/stage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_slug: 'qashqai',
          confirmation: 'STAGE_NISSAN_OFFICIAL_DATA',
        }),
      },
      baseEnv,
    );
    expect(noDedicatedBucket.status).toBe(503);
    await expect(noDedicatedBucket.json()).resolves.toEqual({
      error: 'OEM_PAGE_BUCKET binding is required for Nissan run evidence',
    });
  });

  it('requires the dedicated OEM page bucket and never falls back to the legacy bucket', async () => {
    const env = {
      ...createMockEnv(),
      NISSAN_OFFICIAL_OPERATORS: 'developer@example.com',
      BROWSER: {} as Fetcher,
      OEM_PAGE_BUCKET: undefined,
      MOLTBOT_BUCKET: {
        get: () => { throw new Error('legacy bucket must not be read'); },
        put: () => { throw new Error('legacy bucket must not be written'); },
      } as unknown as R2Bucket,
    };
    const response = await app('developer@example.com').request(
      'https://example.com/admin/nissan-official/build-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_slug: 'qashqai',
          confirmation: 'BUILD_NISSAN_REVIEW_CANDIDATE',
        }),
      },
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'OEM_PAGE_BUCKET binding is not configured',
    });
  });

  it('requires an explicitly allowlisted operator for Nissan actions', async () => {
    const env = {
      ...createMockEnv(),
      NISSAN_OFFICIAL_OPERATORS: 'approved@example.com',
      BROWSER: {} as Fetcher,
      OEM_PAGE_BUCKET: {} as R2Bucket,
    };
    const request = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_slug: 'qashqai',
        confirmation: 'BUILD_NISSAN_REVIEW_CANDIDATE',
      }),
    };

    const unauthenticated = await app().request(
      'https://example.com/admin/nissan-official/build-candidate',
      request,
      env,
    );
    expect(unauthenticated.status).toBe(401);

    const unauthorized = await app('not-approved@example.com').request(
      'https://example.com/admin/nissan-official/build-candidate',
      request,
      env,
    );
    expect(unauthorized.status).toBe(403);
  });
});
