import { describe, expect, it, vi } from 'vitest';
import { saveNissanOfficialOfferRunEvidence } from './nissan-official-offer-evidence';

class MemoryBucket {
  readonly objects = new Map<string, string>();
  readonly head = vi.fn(async (key: string) => this.objects.has(key) ? {} : null);
  readonly put = vi.fn(async (key: string, value: string | ArrayBuffer) => {
    this.objects.set(key, typeof value === 'string' ? value : new TextDecoder().decode(value));
  });
}

describe('Nissan official offer run evidence', () => {
  it('stores immutable and latest redacted evidence only in OEM page storage', async () => {
    const bucket = new MemoryBucket();
    const saved = await saveNissanOfficialOfferRunEvidence(bucket as unknown as R2Bucket, {
      actorEmail: 'operator@example.com',
      result: {
        dryRun: false,
        offersFetched: 2,
        offersUpserted: 2,
        productLinksUpserted: 1,
        errors: ['url https://ap.nissan-api.net/v2/offers?apiKey=choices-secret'],
      },
      secretValues: ['choices-secret'],
      runId: 'offer-run-001',
      recordedAt: '2026-07-21T01:00:02.000Z',
    });

    expect(saved.key).toBe('nissan-official/offer-runs/offer-run-001.json');
    expect([...bucket.objects.keys()]).toEqual([
      'nissan-official/offer-runs/offer-run-001.json',
      'nissan-official/offer-runs/latest.json',
    ]);
    const serialized = bucket.objects.get(saved.key)!;
    expect(serialized).not.toContain('choices-secret');
    expect(serialized).not.toContain('apiKey=');
    expect(serialized).not.toContain('MOLTBOT_BUCKET');
    expect(JSON.parse(serialized)).toMatchObject({
      id: 'offer-run-001',
      actor_email: 'operator@example.com',
      mode: 'staged-offers',
      status: 'partial',
      offers: { fetched: 2, upserted: 2, product_links_upserted: 1 },
    });
  });

  it('refuses to overwrite an immutable named run', async () => {
    const bucket = new MemoryBucket();
    const input = {
      actorEmail: 'operator@example.com',
      result: {
        dryRun: false,
        offersFetched: 1,
        offersUpserted: 1,
        productLinksUpserted: 0,
        errors: [],
      },
      runId: 'offer-run-001',
      recordedAt: '2026-07-21T01:00:02.000Z',
    };
    await saveNissanOfficialOfferRunEvidence(bucket as unknown as R2Bucket, input);
    await expect(saveNissanOfficialOfferRunEvidence(bucket as unknown as R2Bucket, input))
      .rejects.toThrow('already exists');
  });
});
