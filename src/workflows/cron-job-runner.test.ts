import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CronJobRunnerWorkflow', () => {
  it('records a terminal failure when the execution step is interrupted', () => {
    const source = readFileSync(new URL('./cron-job-runner.ts', import.meta.url), 'utf8');

    expect(source).toContain("step.do('record-cron-failure'");
    expect(source).toContain('markCronJobWorkflowFailed');
    expect(source).toContain('getCronOemWorkflowIds(jobId)');
    expect(source).toContain('for (const [index, oemId] of extractionOemIds.entries())');
    expect(source).toContain('recordCronOemWorkflowStepFailure');
    expect(source).toContain("step.do('complete-oem-extraction'");
  });
});
