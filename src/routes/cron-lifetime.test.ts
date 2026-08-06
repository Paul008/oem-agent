import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('manual cron execution lifetime', () => {
  it('starts a durable Workflow instead of relying on an HTTP or waitUntil lifetime', () => {
    const source = readFileSync(new URL('./cron.ts', import.meta.url), 'utf8');
    const manualRoute = source.slice(
      source.indexOf("cron.post('/run/:jobId'"),
      source.indexOf("cron.get('/runs/:jobId'"),
    );

    expect(manualRoute).not.toContain('executionCtx.waitUntil');
    expect(manualRoute).not.toContain('await executeJob(job, run, bucket, c.env)');
    expect(manualRoute).toContain('c.env.CRON_JOB_RUNNER.create');
    expect(manualRoute).toContain('}, 202)');
  });
});
