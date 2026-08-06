import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';

import type { MoltbotEnv } from '../types';
import {
  completeCronOemWorkflow,
  executeCronJobWorkflow,
  executeCronOemWorkflowStep,
  getCronOemWorkflowIds,
  markCronJobWorkflowFailed,
  recordCronOemWorkflowStepFailure,
  type CronJobWorkflowParams,
} from '../routes/cron';

/**
 * Durable runner for dashboard-triggered cron jobs.
 *
 * Manual HTTP requests are routinely disconnected at the edge before the
 * crawler's first 60-second OEM timeout. A Workflow owns the execution after
 * the route returns 202, so browser navigation cannot strand the R2 run row.
 */
export class CronJobRunnerWorkflow extends WorkflowEntrypoint<MoltbotEnv, CronJobWorkflowParams> {
  async run(event: WorkflowEvent<CronJobWorkflowParams>, step: WorkflowStep) {
    const { jobId, runId, startedAt, oemIds } = event.payload;
    const params = { jobId, runId, startedAt, oemIds };
    const extractionOemIds = oemIds?.length ? oemIds : getCronOemWorkflowIds(jobId);

    try {
      if (extractionOemIds.length) {
        for (const [index, oemId] of extractionOemIds.entries()) {
          try {
            await step.do(
              `crawl-${index + 1}-${oemId}`,
              {
                retries: { limit: 0, delay: '1 second', backoff: 'constant' },
                timeout: '90 seconds',
              },
              () => executeCronOemWorkflowStep(params, oemId, index + 1, extractionOemIds.length, this.env),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await step.do(`record-${index + 1}-${oemId}-failure`, () =>
              recordCronOemWorkflowStepFailure(
                params,
                oemId,
                index + 1,
                extractionOemIds.length,
                this.env,
                message,
              ));
          }
        }

        return step.do('complete-oem-extraction', () => completeCronOemWorkflow(params, this.env));
      }

      return await step.do(
        'execute-cron-job',
        {
          retries: { limit: 0, delay: '1 second', backoff: 'constant' },
          timeout: '10 minutes',
        },
        async () => {
          const run = await executeCronJobWorkflow(params, this.env);
          return {
            runId: run.id,
            status: run.status,
            error: run.error ?? null,
          };
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return step.do('record-cron-failure', async () => {
        const run = await markCronJobWorkflowFailed(
          params,
          this.env,
          `Workflow execution failed: ${message}`,
        );
        return { runId: run.id, status: run.status, error: run.error ?? null };
      });
    }
  }
}
