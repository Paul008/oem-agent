/**
 * Shared cron run tracking — used by both OpenClaw cron routes and Cloudflare scheduled triggers.
 * Stores run history as JSON arrays in R2 at `openclaw/cron-runs/{jobId}.json`.
 */

export interface JobRun {
  id: string;
  jobId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'failed';
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Get run history from R2
 */
export async function getRunHistory(
  bucket: R2Bucket,
  jobId: string,
  limit = 10
): Promise<JobRun[]> {
  try {
    const key = `openclaw/cron-runs/${jobId}.json`;
    const obj = await bucket.get(key);
    if (!obj) return [];

    const runs: JobRun[] = await obj.json();
    return runs.slice(-limit).reverse(); // Most recent first
  } catch (e) {
    console.error(`[Cron] Failed to get run history for ${jobId}:`, e);
    return [];
  }
}

/**
 * Save run to history in R2
 */
export async function saveRun(bucket: R2Bucket, run: JobRun): Promise<void> {
  try {
    const key = `openclaw/cron-runs/${run.jobId}.json`;
    const obj = await bucket.get(key);

    let runs: JobRun[] = [];
    if (obj) {
      runs = await obj.json();
    }

    // Update existing run or add new one
    const existingIdx = runs.findIndex(r => r.id === run.id);
    if (existingIdx >= 0) {
      runs[existingIdx] = run;
    } else {
      runs.push(run);
    }

    // Keep last 100 runs
    if (runs.length > 100) {
      runs = runs.slice(-100);
    }

    await bucket.put(key, JSON.stringify(runs, null, 2));
  } catch (e) {
    console.error(`[Cron] Failed to save run:`, e);
  }
}

/**
 * Clean stale R2 run records: any run stuck in "running" for >10 min
 * gets marked as "failed" with a timeout message.
 */
export async function cleanStaleRuns(bucket: R2Bucket, jobId: string): Promise<number> {
  try {
    const key = `openclaw/cron-runs/${jobId}.json`;
    const obj = await bucket.get(key);
    if (!obj) return 0;

    const runs: JobRun[] = await obj.json();
    const now = Date.now();
    const STALE_MS = 10 * 60 * 1000; // 10 minutes
    let cleaned = 0;

    for (const run of runs) {
      if (run.status === 'running' && run.startedAt) {
        const age = now - new Date(run.startedAt).getTime();
        if (age > STALE_MS) {
          run.status = 'failed';
          run.completedAt = new Date().toISOString();
          run.error = 'Automatically marked as failed — run exceeded 10 min without completion';
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      await bucket.put(key, JSON.stringify(runs, null, 2));
    }
    return cleaned;
  } catch {
    return 0;
  }
}
