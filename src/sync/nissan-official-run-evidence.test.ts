import { describe, expect, it, vi } from 'vitest';
import type { NissanOfficialSyncResult } from './nissan-official-runner';
import { saveNissanOfficialRunEvidence } from './nissan-official-run-evidence';

class MemoryBucket {
  readonly objects = new Map<string, string>();
  readonly put = vi.fn(async (key: string, value: string | ArrayBuffer) => {
    this.objects.set(
      key,
      typeof value === 'string' ? value : new TextDecoder().decode(value),
    );
  });
}

function syncResult(): NissanOfficialSyncResult {
  return {
    dryRun: false,
    catalog: {
      dryRun: false,
      modelsFetched: 1,
      versionsFetched: 4,
      catalogsRejected: 0,
      modelsUpserted: 1,
      productsUpserted: 4,
      colorsUpserted: 8,
      pricingUpserted: 4,
      choicesRequests: 0,
      regionalPricingRows: 0,
      driftWarnings: [],
      errors: ['upstream https://gq-apn-prod.nissanpace.com/graphql?apiKey=pace-secret'],
    },
    offers: null,
    health: {
      connector: 'nissan-official-v1',
      startedAt: '2026-07-21T01:00:00.000Z',
      completedAt: '2026-07-21T01:00:01.000Z',
      durationMs: 1000,
      sources: {
        pace: {
          status: 'degraded',
          requestCount: 1,
          recordsFetched: 4,
          lastSuccessfulAt: '2026-07-21T01:00:01.000Z',
          errors: ['PACE key pace-secret was rejected'],
        },
        choices: {
          status: 'skipped', requestCount: 0, recordsFetched: 0, lastSuccessfulAt: null, errors: [],
        },
        offers: {
          status: 'skipped', requestCount: 0, recordsFetched: 0, lastSuccessfulAt: null, errors: [],
        },
      },
    },
    errors: ['catalog: PACE key pace-secret was rejected'],
  };
}

describe('Nissan official run evidence', () => {
  it('stores immutable and latest redacted evidence outside the legacy Moltbot path', async () => {
    const bucket = new MemoryBucket();
    const saved = await saveNissanOfficialRunEvidence(
      bucket as unknown as R2Bucket,
      {
        actorEmail: 'operator@example.com',
        modelSlugs: ['qashqai'],
        result: syncResult(),
        secretValues: ['pace-secret'],
        runId: 'run-001',
        recordedAt: '2026-07-21T01:00:02.000Z',
      },
    );

    expect(saved.key).toBe('nissan-official/runs/run-001.json');
    expect([...bucket.objects.keys()]).toEqual([
      'nissan-official/runs/run-001.json',
      'nissan-official/runs/latest.json',
    ]);
    const serialized = bucket.objects.get(saved.key)!;
    expect(serialized).not.toContain('pace-secret');
    expect(serialized).not.toContain('apiKey=');
    expect(serialized).not.toContain('openclaw/cron-runs');
    expect(JSON.parse(serialized)).toMatchObject({
      id: 'run-001',
      actor_email: 'operator@example.com',
      mode: 'staged-catalog',
      status: 'partial',
      model_slugs: ['qashqai'],
      catalog: {
        models_upserted: 1,
        products_upserted: 4,
      },
      offers: { requested: false, written: false },
    });
  });
});
