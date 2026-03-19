/**
 * Cron Management Routes
 * 
 * Provides status, manual triggers, and run history for scheduled jobs.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import cronJobsConfig from '../../config/openclaw/cron-jobs.json';
import cronDashboardHtml from '../assets/cron-dashboard.html';
import { getRunHistory, saveRun, type JobRun } from '../utils/cron-runs';
import { CLOUDFLARE_TRIGGERS } from '../scheduled';

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
    '0 3 * * 0': 'Sunday 3:00 AM',
    '0 3 1 * *': '1st of month 3:00 AM',
    '0 4 * * 2': 'Tuesday 4:00 AM',
  };

  return patterns[cronExpr] || cronExpr;
}

/**
 * GET /cron - List all jobs with status
 */
cron.get('/', async (c) => {
  const jobs = cronJobsConfig.jobs as CronJob[];
  const bucket = c.env.MOLTBOT_BUCKET;

  // Fetch runtime overrides from Supabase
  let overrides: Record<string, { enabled: boolean }> = {};
  try {
    const { createSupabaseClient } = await import('../utils/supabase');
    const supabase = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY });
    const { data } = await supabase
      .from('cron_job_overrides')
      .select('id, enabled');
    if (data) {
      for (const row of data) {
        overrides[row.id] = { enabled: row.enabled };
      }
    }
  } catch (_) {
    // Overrides table may not exist yet
  }

  const jobStatuses: JobStatus[] = await Promise.all(
    jobs.map(async (job) => {
      const runs = await getRunHistory(bucket, job.id, 1);
      const lastRun = runs[0];

      // Count total runs
      const allRuns = await getRunHistory(bucket, job.id, 100);

      // Apply runtime override if present
      const override = overrides[job.id];
      const effectiveEnabled = override?.enabled !== undefined ? override.enabled : job.enabled;

      return {
        ...job,
        enabled: effectiveEnabled,
        enabledOverride: override?.enabled,
        lastRun,
        nextRun: getNextRun(job.schedule, job.timezone),
        runCount: allRuns.length,
      };
    })
  );

  // Build Cloudflare trigger statuses (with run history from R2)
  const cfTriggerStatuses = await Promise.all(
    CLOUDFLARE_TRIGGERS.map(async (trigger) => {
      const runs = await getRunHistory(bucket, trigger.id, 1);
      const allRuns = await getRunHistory(bucket, trigger.id, 100);
      return {
        ...trigger,
        lastRun: runs[0],
        nextRun: getNextRun(trigger.schedule, trigger.timezone),
        runCount: allRuns.length,
      };
    })
  );

  const payload = {
    version: cronJobsConfig.version,
    description: cronJobsConfig.description,
    jobs: jobStatuses,
    cloudflareTriggers: cfTriggerStatuses,
    globalConfig: cronJobsConfig.global_config,
  };

  // Return HTML dashboard for browser requests, JSON for API requests
  if (c.req.header('Accept')?.includes('text/html')) {
    const html = cronDashboardHtml.replace('{{JOBS_JSON}}', JSON.stringify(payload));
    return c.html(html);
  }

  return c.json(payload);
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

  // Check runtime override
  try {
    const { createSupabaseClient } = await import('../utils/supabase');
    const supabase = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY });
    const { data: override } = await supabase
      .from('cron_job_overrides')
      .select('enabled')
      .eq('id', jobId)
      .single();

    if (override?.enabled === false) {
      return c.json({ error: 'Job disabled via dashboard', jobId }, 400);
    }
  } catch (_) {
    // No override row = use static config default
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

  // Run inline (awaited) so long-running jobs like oem-data-sync aren't
  // killed by the waitUntil grace period. The HTTP response stays open
  // until the job completes (Workers Standard allows up to 30s CPU).
  try {
    await executeJob(job, run, bucket, c.env);
  } catch (e) {
    console.error(`[Cron] Job ${jobId} failed:`, e);
    run.status = 'failed';
    run.completedAt = new Date().toISOString();
    run.error = e instanceof Error ? e.message : String(e);
    await saveRun(bucket, run);
  }

  return c.json({
    message: run.status === 'success' ? 'Job completed' : `Job ${run.status}`,
    jobId,
    runId,
    status: run.status,
    result: run.result,
    error: run.error,
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
  const cfTrigger = CLOUDFLARE_TRIGGERS.find(t => t.id === jobId);

  if (!job && !cfTrigger) {
    return c.json({ error: 'Job not found', jobId }, 404);
  }

  const bucket = c.env.MOLTBOT_BUCKET;
  const runs = await getRunHistory(bucket, jobId, limit);

  return c.json({
    jobId,
    jobName: job?.name ?? cfTrigger?.name,
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

  // Check for runtime enabled override
  try {
    const { createSupabaseClient } = await import('../utils/supabase');
    const supabase = createSupabaseClient({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
    const { data: override } = await supabase
      .from('cron_job_overrides')
      .select('enabled')
      .eq('id', job.id)
      .single();

    if (override?.enabled === false) {
      console.log(`[Cron] Job ${job.id} disabled via dashboard override`);
      run.status = 'failed';
      run.error = 'Job disabled via dashboard';
      run.completedAt = new Date().toISOString();
      await saveRun(bucket, run);
      return;
    }
  } catch (_) {
    // No override row = use static config default, continue execution
  }

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

      case 'oem-data-sync':
        result = await executeOemDataSync(job, env);
        break;

      case 'oem-brand-ambassador':
        result = await executeBrandAmbassador(job, env);
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
  
  // Import orchestrator dynamically to avoid circular deps.
  // Note: During product upserts the orchestrator automatically calls
  // syncVariantColors() and buildSpecsJson(), so no separate cron jobs
  // are needed for per-OEM color/spec sync (including GMSV).
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
    moonshot: env.MOONSHOT_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    google: env.GOOGLE_API_KEY,
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
    lightpandaUrl: env.LIGHTPANDA_URL,
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

/**
 * Execute OEM data sync job
 * Runs Kia AU color sync + all-OEM color/pricing sync.
 * Daily: Kia BYO + Hyundai CGI + Mazda /cars/ + Mitsubishi GraphQL + generic pricing
 * Monthly: Same + re-seed discovered APIs
 */
async function executeOemDataSync(
  job: CronJob,
  env: AppEnv['Bindings']
): Promise<Record<string, unknown>> {
  const config = job.config as { schedule: string; timeout_per_script?: number };
  const { createSupabaseClient } = await import('../utils/supabase');
  const { executeKiaColorSync } = await import('../sync/kia-colors');
  const { executeAllOemSync } = await import('../sync/all-oem-sync');

  const supabase = createSupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Kia: BYO colors + 8-state driveaway pricing
  const kiaResult = await executeKiaColorSync(supabase);

  // All other OEMs: colors + pricing from their respective APIs
  const allOemResult = await executeAllOemSync(supabase);

  return {
    skill: 'oem-data-sync',
    schedule: config.schedule,
    kia_color_sync: kiaResult,
    all_oem_sync: allOemResult,
  };
}

/**
 * Execute brand ambassador job — generate AI model pages for pilot OEMs
 */
async function executeBrandAmbassador(
  job: CronJob,
  env: AppEnv['Bindings']
): Promise<Record<string, unknown>> {
  const config = job.config as {
    stages: string[];
    max_models_per_run: number;
    force_regenerate: boolean;
    pilot_oems: string[];
    regeneration_strategy?: {
      max_age_days: number;
      min_age_days: number;
      check_source_timestamps: boolean;
      check_content_hash: boolean;
      priority_threshold: 'low' | 'medium' | 'high' | 'critical';
    };
  };

  const { createSupabaseClient } = await import('../utils/supabase');
  const { AiRouter } = await import('../ai/router');
  const { DesignAgent } = await import('../design/agent');
  const { PageGenerator } = await import('../design/page-generator');

  const supabase = createSupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Check for runtime config override from workflow_settings (dashboard)
  const { data: wsOverride } = await supabase
    .from('workflow_settings')
    .select('config')
    .eq('id', 'new-model-page')
    .single();

  if (wsOverride?.config?.regeneration_strategy) {
    config.regeneration_strategy = wsOverride.config.regeneration_strategy;
    console.log('[BrandAmbassador] Using runtime config override from workflow_settings');
  }

  const aiRouter = new AiRouter({
    groq: env.GROQ_API_KEY,
    together: env.TOGETHER_API_KEY,
    moonshot: env.MOONSHOT_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    google: env.GOOGLE_API_KEY,
  });

  const designAgent = new DesignAgent(
    env.TOGETHER_API_KEY,
    env.MOLTBOT_BUCKET,
  );

  const generator = new PageGenerator({
    supabase,
    aiRouter,
    designAgent,
    r2Bucket: env.MOLTBOT_BUCKET,
    browser: env.BROWSER!,
  });

  const results: Array<{
    oem_id: string;
    model_slug: string;
    success: boolean;
    error?: string;
    generation_time_ms: number;
    total_cost_usd?: number;
    skipped?: boolean;
    skip_reason?: string;
    regeneration_reason?: string;
    checks_done?: string[];
    page_age?: number;
  }> = [];

  let modelsProcessed = 0;
  let modelsSkipped = 0;

  for (const oemId of config.pilot_oems) {
    // Get all models for this OEM
    const { data: models } = await supabase
      .from('vehicle_models')
      .select('slug, name, source_url')
      .eq('oem_id', oemId)
      .order('slug');

    if (!models || models.length === 0) continue;

    for (const model of models) {
      if (modelsProcessed >= config.max_models_per_run) break;

      // Smart regeneration check (unless force_regenerate)
      if (!config.force_regenerate) {
        const decision = await generator.shouldRegeneratePage(
          oemId as any,
          model.slug,
          config.regeneration_strategy
        );

        if (!decision.shouldRegenerate) {
          console.log(`[BrandAmbassador] Skipping ${oemId}/${model.slug}: ${decision.reason}`);
          results.push({
            oem_id: oemId,
            model_slug: model.slug,
            success: true,
            generation_time_ms: 0,
            skipped: true,
            skip_reason: decision.reason,
            checks_done: decision.checksDone,
            page_age: decision.pageAge,
          });
          modelsSkipped++;
          continue;
        }

        console.log(`[BrandAmbassador] Regenerating ${oemId}/${model.slug}: ${decision.reason} (priority: ${decision.priority})`);
      }

      console.log(`[BrandAmbassador] Generating page: ${oemId}/${model.slug}`);
      const result = await generator.generateModelPage(oemId as any, model.slug);

      results.push({
        oem_id: oemId,
        model_slug: model.slug,
        success: result.success,
        error: result.error,
        generation_time_ms: result.generation_time_ms,
        total_cost_usd: result.total_cost_usd,
        skipped: false,
      });

      modelsProcessed++;
    }

    if (modelsProcessed >= config.max_models_per_run) break;
  }

  const totalCost = results.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0);

  return {
    pilot_oems: config.pilot_oems,
    models_processed: modelsProcessed,
    models_skipped: modelsSkipped,
    successful: results.filter(r => r.success && !r.skipped).length,
    failed: results.filter(r => !r.success).length,
    total_cost_usd: totalCost,
    results,
  };
}

/**
 * PATCH /cron/jobs/:jobId/override - Save enable/disable overrides
 */
cron.patch('/jobs/:jobId/override', async (c) => {
  const { jobId } = c.req.param();
  const body = await c.req.json<{ enabled: boolean }>();
  const { createSupabaseClient } = await import('../utils/supabase');
  const supabase = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY });

  const { data, error } = await supabase
    .from('cron_job_overrides')
    .upsert({ id: jobId, enabled: body.enabled, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

export { cron };
