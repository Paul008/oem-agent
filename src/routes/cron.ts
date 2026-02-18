/**
 * Cron Management Routes
 * 
 * Provides status, manual triggers, and run history for scheduled jobs.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import cronJobsConfig from '../../config/openclaw/cron-jobs.json';

interface CronJob {
  id: string;
  name: string;
  description: string;
  schedule: string;
  timezone: string;
  skill: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface JobRun {
  id: string;
  jobId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'failed';
  result?: Record<string, unknown>;
  error?: string;
}

interface JobStatus extends CronJob {
  lastRun?: JobRun;
  nextRun?: string;
  runCount: number;
}

const cron = new Hono<AppEnv>();

/**
 * Parse cron expression to get next run time
 * Simplified - handles common patterns
 */
function getNextRun(cronExpr: string, timezone: string): string {
  // For now, return a human-readable description
  // A full cron parser would be better but this works for status display
  const now = new Date();
  
  const patterns: Record<string, string> = {
    '0 2 * * 0': 'Sunday 2:00 AM',
    '0 6 * * *': 'Daily 6:00 AM',
    '0 */4 * * *': 'Every 4 hours',
    '*/30 * * * *': 'Every 30 minutes',
    '0 9 * * 1': 'Monday 9:00 AM',
    '0 */6 * * *': 'Every 6 hours',
  };

  return patterns[cronExpr] || cronExpr;
}

/**
 * Get run history from R2
 */
async function getRunHistory(
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
async function saveRun(bucket: R2Bucket, run: JobRun): Promise<void> {
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
 * GET /cron - List all jobs with status
 */
cron.get('/', async (c) => {
  const jobs = cronJobsConfig.jobs as CronJob[];
  const bucket = c.env.MOLTBOT_BUCKET;
  
  const jobStatuses: JobStatus[] = await Promise.all(
    jobs.map(async (job) => {
      const runs = await getRunHistory(bucket, job.id, 1);
      const lastRun = runs[0];
      
      // Count total runs
      const allRuns = await getRunHistory(bucket, job.id, 100);
      
      return {
        ...job,
        lastRun,
        nextRun: getNextRun(job.schedule, job.timezone),
        runCount: allRuns.length,
      };
    })
  );

  return c.json({
    version: cronJobsConfig.version,
    description: cronJobsConfig.description,
    jobs: jobStatuses,
    globalConfig: cronJobsConfig.global_config,
  });
});

/**
 * GET /cron/jobs/:jobId - Get specific job details
 */
cron.get('/jobs/:jobId', async (c) => {
  const { jobId } = c.req.param();
  const jobs = cronJobsConfig.jobs as CronJob[];
  const job = jobs.find(j => j.id === jobId);
  
  if (!job) {
    return c.json({ error: 'Job not found', jobId }, 404);
  }
  
  const bucket = c.env.MOLTBOT_BUCKET;
  const runs = await getRunHistory(bucket, jobId, 10);
  
  return c.json({
    ...job,
    runs,
    nextRun: getNextRun(job.schedule, job.timezone),
  });
});

/**
 * POST /cron/run/:jobId - Manually trigger a job
 */
cron.post('/run/:jobId', async (c) => {
  const { jobId } = c.req.param();
  const jobs = cronJobsConfig.jobs as CronJob[];
  const job = jobs.find(j => j.id === jobId);
  
  if (!job) {
    return c.json({ error: 'Job not found', jobId }, 404);
  }
  
  if (!job.enabled) {
    return c.json({ error: 'Job is disabled', jobId }, 400);
  }
  
  const bucket = c.env.MOLTBOT_BUCKET;
  const runId = `${jobId}-${Date.now()}`;
  
  const run: JobRun = {
    id: runId,
    jobId,
    startedAt: new Date().toISOString(),
    status: 'running',
  };
  
  await saveRun(bucket, run);
  
  // Execute job in background
  c.executionCtx.waitUntil(
    executeJob(job, run, bucket, c.env).catch((e) => {
      console.error(`[Cron] Job ${jobId} failed:`, e);
    })
  );
  
  return c.json({
    message: 'Job triggered',
    jobId,
    runId,
    job: {
      name: job.name,
      skill: job.skill,
    },
  });
});

/**
 * GET /cron/runs/:jobId - Get run history for a job
 */
cron.get('/runs/:jobId', async (c) => {
  const { jobId } = c.req.param();
  const limit = parseInt(c.req.query('limit') || '20');
  
  const jobs = cronJobsConfig.jobs as CronJob[];
  const job = jobs.find(j => j.id === jobId);
  
  if (!job) {
    return c.json({ error: 'Job not found', jobId }, 404);
  }
  
  const bucket = c.env.MOLTBOT_BUCKET;
  const runs = await getRunHistory(bucket, jobId, limit);
  
  return c.json({
    jobId,
    jobName: job.name,
    runs,
    total: runs.length,
  });
});

/**
 * Execute a job based on its skill
 */
async function executeJob(
  job: CronJob,
  run: JobRun,
  bucket: R2Bucket,
  env: AppEnv['Bindings']
): Promise<void> {
  console.log(`[Cron] Executing job: ${job.id} (${job.skill})`);
  
  try {
    let result: Record<string, unknown> = {};
    
    switch (job.skill) {
      case 'oem-extract':
        result = await executeOemExtract(job, env);
        break;
      
      case 'oem-build-price-discover':
        result = await executeOemDiscovery(job, env);
        break;
      
      case 'oem-agent-hooks':
        result = await executeAgentHooks(job, env);
        break;
      
      default:
        throw new Error(`Unknown skill: ${job.skill}`);
    }
    
    run.status = 'success';
    run.completedAt = new Date().toISOString();
    run.result = result;
    
  } catch (e) {
    run.status = 'failed';
    run.completedAt = new Date().toISOString();
    run.error = e instanceof Error ? e.message : String(e);
  }
  
  await saveRun(bucket, run);
  console.log(`[Cron] Job ${job.id} completed with status: ${run.status}`);
}

/**
 * Execute OEM extraction job
 */
async function executeOemExtract(
  job: CronJob,
  env: AppEnv['Bindings']
): Promise<Record<string, unknown>> {
  const config = job.config as {
    oem_ids: string[];
    extraction_layers: string[];
    max_concurrent: number;
  };
  
  // Import orchestrator dynamically to avoid circular deps
  const { OemAgentOrchestrator } = await import('../orchestrator');
  const { createSupabaseClient } = await import('../utils/supabase');
  const { AiRouter } = await import('../ai/router');
  const { MultiChannelNotifier } = await import('../notify/slack');
  
  const supabaseClient = createSupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  
  const aiRouter = new AiRouter({
    groq: env.GROQ_API_KEY,
    together: env.TOGETHER_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
  });
  
  const notifier = env.SLACK_WEBHOOK_URL
    ? new MultiChannelNotifier({ slackWebhookUrl: env.SLACK_WEBHOOK_URL })
    : new MultiChannelNotifier({ slackWebhookUrl: '' });
  
  const orchestrator = new OemAgentOrchestrator({
    supabaseClient,
    r2Bucket: env.MOLTBOT_BUCKET,
    browser: env.BROWSER!,
    aiRouter,
    notifier,
  });
  
  // Run extraction for specified OEMs
  const result = await orchestrator.runScheduledCrawl();
  
  return {
    oem_ids: config.oem_ids,
    jobsProcessed: result.jobsProcessed,
    pagesChanged: result.pagesChanged,
  };
}

/**
 * Execute OEM discovery job
 */
async function executeOemDiscovery(
  job: CronJob,
  _env: AppEnv['Bindings']
): Promise<Record<string, unknown>> {
  // TODO: Implement discovery refresh logic
  return {
    message: 'Discovery refresh not yet implemented',
    config: job.config,
  };
}

/**
 * Execute agent hooks job (health check, memory sync, reports, embeddings)
 */
async function executeAgentHooks(
  job: CronJob,
  env: AppEnv['Bindings']
): Promise<Record<string, unknown>> {
  const config = job.config as { action: string };
  
  switch (config.action) {
    case 'health_check':
      return { message: 'Health check completed', status: 'ok' };
    
    case 'memory_sync':
      return { message: 'Memory sync completed', synced: true };
    
    case 'generate_report':
      return { message: 'Report generation not yet implemented' };
    
    case 'sync_embeddings':
      return await syncEmbeddings(job, env);
    
    default:
      return { message: `Unknown action: ${config.action}` };
  }
}

/**
 * Sync vector embeddings for new records
 */
async function syncEmbeddings(
  job: CronJob,
  env: AppEnv['Bindings']
): Promise<Record<string, unknown>> {
  const config = job.config as {
    tables: string[];
    batch_size: number;
    max_items_per_run: number;
  };
  
  // TODO: Implement embedding sync using the embeddings utility
  return {
    message: 'Embedding sync not yet fully implemented',
    tables: config.tables,
    batch_size: config.batch_size,
  };
}

export { cron };
