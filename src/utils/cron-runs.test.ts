import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanStaleRuns, type JobRun } from './cron-runs';

function memoryBucket(initialRuns: JobRun[]) {
  let runs = structuredClone(initialRuns);
  return {
    bucket: {
      get: vi.fn(async () => ({ json: async () => structuredClone(runs) })),
      put: vi.fn(async (_key: string, value: string) => {
        runs = JSON.parse(value) as JobRun[];
      }),
    } as unknown as R2Bucket,
    runs: () => runs,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('cleanStaleRuns', () => {
  it('keeps a healthy extraction running beyond the old ten-minute threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T00:20:00.000Z'));
    const store = memoryBucket([{
      id: 'run-1',
      jobId: 'oem-extract-daily',
      startedAt: '2026-07-21T00:05:00.000Z',
      status: 'running',
    }]);

    await expect(cleanStaleRuns(store.bucket, 'oem-extract-daily')).resolves.toBe(0);
    expect(store.runs()[0].status).toBe('running');
  });

  it('marks a run failed after thirty minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T00:31:00.000Z'));
    const store = memoryBucket([{
      id: 'run-1',
      jobId: 'oem-extract-daily',
      startedAt: '2026-07-21T00:00:00.000Z',
      status: 'running',
    }]);

    await expect(cleanStaleRuns(store.bucket, 'oem-extract-daily')).resolves.toBe(1);
    expect(store.runs()[0]).toMatchObject({
      status: 'failed',
      error: 'Automatically marked as failed — run exceeded 30 min without completion',
    });
  });
});
