import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runNissanOfficialSync } from './nissan-official-runner';

describe('runNissanOfficialSync', () => {
  it('defaults to dry-run and can fetch one PACE model without touching Supabase', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe('gq-apn-prod.nissanpace.com');
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({
        data: {
          getVersionExplorerInformation: {
            versions: [{
              specCode: 'QASHQAI-ST',
              name: 'QASHQAI ST',
              image: null,
              versionTags: [],
              mainFeatures: [],
              price: { label: 'MLP', amount: 35100, amountFormatted: '$35,100' },
              colors: [],
            }],
            model: { modelName: 'QASHQAI' },
          },
        },
      }), { headers: { 'content-type': 'application/json' } });
    });
    const supabase = new Proxy({}, {
      get() {
        throw new Error('dry-run must not access Supabase');
      },
    }) as SupabaseClient;

    const result = await runNissanOfficialSync(
      supabase,
      { NISSAN_PACE_API_KEY: 'test-pace-key' },
      {
        modelSlugs: ['qashqai'],
        includeOffers: false,
        fetch: fetchMock,
        now: () => new Date('2026-07-21T00:00:00.000Z'),
      },
    );

    expect(result.dryRun).toBe(true);
    expect(result.catalog.modelsFetched).toBe(1);
    expect(result.catalog.versionsFetched).toBe(1);
    expect(result.catalog.modelsUpserted).toBe(0);
    expect(result.offers).toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.health).toMatchObject({
      connector: 'nissan-official-v1',
      sources: {
        pace: { status: 'healthy', requestCount: 1, recordsFetched: 1 },
        choices: { status: 'skipped', requestCount: 0 },
        offers: { status: 'skipped', requestCount: 0 },
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports missing credentials without writing or logging secret values', async () => {
    const supabase = {} as SupabaseClient;
    const result = await runNissanOfficialSync(
      supabase,
      {},
      { modelSlugs: ['ariya'], includeOffers: false },
    );

    expect(result.catalog.modelsFetched).toBe(0);
    expect(result.errors).toEqual([
      'catalog: ariya: NISSAN_PACE_API_KEY is not configured',
    ]);
    expect(result.health.sources.pace).toMatchObject({
      status: 'failed',
      requestCount: 1,
      recordsFetched: 0,
      lastSuccessfulAt: null,
    });
    expect(result.health.sources.pace.errors[0]).not.toContain('test-pace-key');
  });
});
