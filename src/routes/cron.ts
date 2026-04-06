/**
 * Cron Management Routes
 * 
 * Provides status, manual triggers, and run history for scheduled jobs.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import cronJobsConfig from '../../config/openclaw/cron-jobs.json';
import cronDashboardHtml from '../assets/cron-dashboard.html';
import { getRunHistory, saveRun, cleanStaleRuns, type JobRun } from '../utils/cron-runs';
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

  // Clean stale "running" R2 records on dashboard load
  await Promise.all(jobs.map(job => cleanStaleRuns(bucket, job.id)));

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

  // Clean any stale "running" R2 records for this job before starting a new one
  const cleaned = await cleanStaleRuns(bucket, jobId);
  if (cleaned > 0) {
    console.log(`[Cron] Cleaned ${cleaned} stale R2 run records for ${jobId}`);
  }

  const runId = `${jobId}-${Date.now()}`;

  const run: JobRun = {
    id: runId,
    jobId,
    startedAt: new Date().toISOString(),
    status: 'running',
  };

  await saveRun(bucket, run);

  // Heavy jobs (oem-extract, brand-ambassador, data-sync) run via waitUntil
  // so the HTTP handler returns immediately. Lightweight jobs run inline.
  const heavySkills = ['oem-extract', 'oem-brand-ambassador', 'oem-data-sync'];
  const isHeavy = heavySkills.includes(job.skill);

  if (isHeavy) {
    // Return immediately, execute in background
    c.executionCtx.waitUntil(
      (async () => {
        try {
          await executeJob(job, run, bucket, c.env);
        } catch (e) {
          console.error(`[Cron] Job ${jobId} failed:`, e);
          run.status = 'failed';
          run.completedAt = new Date().toISOString();
          run.error = e instanceof Error ? e.message : String(e);
        }
        try { await saveRun(bucket, run); } catch {}
      })()
    );

    return c.json({
      message: 'Job started (running in background)',
      jobId,
      runId,
      status: 'running',
    });
  }

  // Lightweight jobs run inline (awaited)
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

      case 'oem-orchestrator': {
        const { executeOrchestratorController } = await import('../sync/orchestrator-controller');
        const { createSupabaseClient } = await import('../utils/supabase');
        const sb = createSupabaseClient({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
        result = await executeOrchestratorController(sb, env.MOLTBOT_BUCKET, env.SLACK_WEBHOOK_URL);
        break;
      }

      case 'crawl-doctor': {
        const { executeCrawlDoctor } = await import('../sync/crawl-doctor');
        const { createSupabaseClient: createSb } = await import('../utils/supabase');
        const sbClient = createSb({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
        result = await executeCrawlDoctor(sbClient, env.SLACK_WEBHOOK_URL) as unknown as Record<string, unknown>;
        break;
      }

      case 'banner-triage': {
        const { executeBannerTriage } = await import('../sync/banner-triage');
        const { createSupabaseClient: createSbTriage } = await import('../utils/supabase');
        const { getOemDefinition } = await import('../oem/registry');
        const sbTriage = createSbTriage({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });

        const oemId = (job.config as any)?.oem_id || 'ldv-au';
        const oemDef = getOemDefinition(oemId);
        const pageUrl = (job.config as any)?.page_url || oemDef?.baseUrl || '';

        const { count: prevCount } = await sbTriage
          .from('banners')
          .select('id', { count: 'exact', head: true })
          .eq('oem_id', oemId);

        result = await executeBannerTriage({
          oemId,
          pageUrl,
          previousBannerCount: prevCount || 0,
          oldSelector: oemDef?.selectors?.heroSlides || null,
          supabase: sbTriage,
          slackWebhookUrl: env.SLACK_WEBHOOK_URL,
        }) as unknown as Record<string, unknown>;
        break;
      }

      case 'competitive-intel': {
        const { executeCompetitiveIntel } = await import('../sync/competitive-intel');
        const { createSupabaseClient: createSbIntel } = await import('../utils/supabase');
        const sbIntel = createSbIntel({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
        result = await executeCompetitiveIntel(sbIntel, env.SLACK_WEBHOOK_URL) as unknown as Record<string, unknown>;
        break;
      }

      case 'weekly-report': {
        const { executeWeeklyReport } = await import('../sync/weekly-report');
        const { createSupabaseClient: createSbWeekly } = await import('../utils/supabase');
        const sbWeekly = createSbWeekly({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
        result = await executeWeeklyReport(sbWeekly, env.SLACK_WEBHOOK_URL) as unknown as Record<string, unknown>;
        break;
      }

      case 'pdf-spec-extract': {
        const { executePdfSpecExtraction } = await import('../sync/pdf-spec-extractor');
        const { createSupabaseClient: createSbSpec } = await import('../utils/supabase');
        const { AiRouter } = await import('../ai/router');
        const sbSpec = createSbSpec({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
        const aiRouter = new AiRouter(env, sbSpec);
        const maxModels = (job.config as any)?.max_models_per_run ?? 20;
        result = await executePdfSpecExtraction(sbSpec, aiRouter, { maxModels }) as unknown as Record<string, unknown>;
        break;
      }

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
  const config = job.config as { action: string; [key: string]: unknown };
  const { createSupabaseClient } = await import('../utils/supabase');
  const supabase = createSupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  switch (config.action) {
    case 'health_check':
      return await executeHealthCheck(supabase, env);

    case 'memory_sync':
      return await executeMemorySync(supabase, env);

    case 'generate_report':
      return await executeWeeklyReport(supabase, env);

    case 'sync_embeddings':
      return await syncEmbeddings(job, env);

    default:
      return { message: `Unknown action: ${config.action}` };
  }
}

/**
 * Health Check — monitors extraction success rate per OEM.
 * Alerts via Slack when an OEM drops below threshold.
 */
async function executeHealthCheck(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  env: AppEnv['Bindings'],
): Promise<Record<string, unknown>> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Query import_runs from last 24h grouped by OEM
  const { data: runs } = await supabase
    .from('import_runs')
    .select('oem_id, status, products_upserted, error_message')
    .gte('started_at', since);

  const oemStats: Record<string, { total: number; success: number; failed: number; products: number; errors: string[] }> = {};

  for (const run of runs ?? []) {
    const oem = run.oem_id;
    if (!oemStats[oem]) oemStats[oem] = { total: 0, success: 0, failed: 0, products: 0, errors: [] };
    oemStats[oem].total++;
    if (run.status === 'completed') {
      oemStats[oem].success++;
      oemStats[oem].products += run.products_upserted || 0;
    } else if (run.status === 'failed') {
      oemStats[oem].failed++;
      if (run.error_message) oemStats[oem].errors.push(run.error_message.slice(0, 100));
    }
  }

  // Check for degraded OEMs (success rate < 70%)
  const degraded: string[] = [];
  for (const [oem, stats] of Object.entries(oemStats)) {
    if (stats.total > 0 && stats.success / stats.total < 0.7) {
      degraded.push(oem);
    }
  }

  // Check for OEMs with zero runs in 24h (missed crawl)
  const { data: activeOems } = await supabase.from('oems').select('id').eq('is_active', true);
  const missedOems = (activeOems ?? [])
    .map(o => o.id)
    .filter(id => !oemStats[id]);

  // Send Slack alert if any issues
  if ((degraded.length > 0 || missedOems.length > 0) && env.SLACK_WEBHOOK_URL) {
    const { SlackNotifier } = await import('../notify/slack');
    const slack = new SlackNotifier(env.SLACK_WEBHOOK_URL);
    const blocks: any[] = [
      { type: 'header', text: { type: 'plain_text', text: '⚠️ OEM Health Check Alert' } },
    ];

    if (degraded.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Degraded OEMs (< 70% success rate):*\n${degraded.map(oem => {
          const s = oemStats[oem];
          return `• \`${oem}\`: ${s.success}/${s.total} success (${Math.round(100 * s.success / s.total)}%)${s.errors.length ? ' — ' + s.errors[0] : ''}`;
        }).join('\n')}` },
      });
    }

    if (missedOems.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*No crawl runs in 24h:*\n${missedOems.map(oem => `• \`${oem}\``).join('\n')}` },
      });
    }

    await slack.send({ blocks, text: `OEM Health Alert: ${degraded.length} degraded, ${missedOems.length} missed` });
  }

  return {
    status: degraded.length > 0 || missedOems.length > 0 ? 'degraded' : 'healthy',
    oems_checked: Object.keys(oemStats).length,
    degraded_oems: degraded,
    missed_oems: missedOems,
    total_runs_24h: runs?.length ?? 0,
  };
}

/**
 * Memory Sync — backup key tables to R2 for disaster recovery.
 */
async function executeMemorySync(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  env: AppEnv['Bindings'],
): Promise<Record<string, unknown>> {
  const bucket = env.MOLTBOT_BUCKET;
  const timestamp = new Date().toISOString().slice(0, 10);
  let synced = 0;

  // Backup OEM configs
  const { data: oems } = await supabase.from('oems').select('*');
  if (oems?.length) {
    await bucket.put(`memory/backups/${timestamp}/oems.json`, JSON.stringify(oems), {
      httpMetadata: { contentType: 'application/json' },
    });
    synced++;
  }

  // Backup discovered APIs
  const { data: apis } = await supabase.from('discovered_apis').select('*').limit(500);
  if (apis?.length) {
    await bucket.put(`memory/backups/${timestamp}/discovered-apis.json`, JSON.stringify(apis), {
      httpMetadata: { contentType: 'application/json' },
    });
    synced++;
  }

  // Backup offer counts per OEM (lightweight summary, not full data)
  const { data: offerCounts } = await supabase.rpc('count_by_oem', undefined as never).catch(() => ({ data: null }));
  if (offerCounts) {
    await bucket.put(`memory/backups/${timestamp}/offer-counts.json`, JSON.stringify(offerCounts), {
      httpMetadata: { contentType: 'application/json' },
    });
    synced++;
  }

  // Clean old backups (keep last 7 days)
  const listing = await bucket.list({ prefix: 'memory/backups/' });
  const prefixes = [...new Set(listing.objects.map(o => o.key.split('/')[2]).filter(Boolean))].sort();
  const toDelete = prefixes.slice(0, Math.max(0, prefixes.length - 7));
  for (const prefix of toDelete) {
    const old = await bucket.list({ prefix: `memory/backups/${prefix}/` });
    for (const obj of old.objects) {
      await bucket.delete(obj.key);
    }
  }

  return {
    message: 'Memory sync completed',
    synced,
    backup_date: timestamp,
    old_backups_cleaned: toDelete.length,
  };
}

/**
 * Weekly Report — aggregate metrics and send to Slack.
 */
async function executeWeeklyReport(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  env: AppEnv['Bindings'],
): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Aggregate import_runs
  const { data: runs } = await supabase
    .from('import_runs')
    .select('oem_id, status, products_upserted, offers_upserted, changes_found')
    .gte('started_at', since);

  const totalRuns = runs?.length ?? 0;
  const successRuns = runs?.filter(r => r.status === 'completed').length ?? 0;
  const totalProducts = runs?.reduce((sum, r) => sum + (r.products_upserted || 0), 0) ?? 0;
  const totalOffers = runs?.reduce((sum, r) => sum + (r.offers_upserted || 0), 0) ?? 0;
  const totalChanges = runs?.reduce((sum, r) => sum + (r.changes_found || 0), 0) ?? 0;

  // Count current data
  const [prodCount, colorCount, offerCount, bannerCount] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('variant_colors').select('id', { count: 'exact', head: true }),
    supabase.from('offers').select('id', { count: 'exact', head: true }),
    supabase.from('banners').select('id', { count: 'exact', head: true }),
  ]);

  const report = {
    period: `${since.slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}`,
    crawl_runs: totalRuns,
    success_rate: totalRuns > 0 ? Math.round(100 * successRuns / totalRuns) + '%' : 'N/A',
    products_upserted: totalProducts,
    offers_upserted: totalOffers,
    changes_detected: totalChanges,
    current_totals: {
      products: prodCount.count,
      colors: colorCount.count,
      offers: offerCount.count,
      banners: bannerCount.count,
    },
  };

  // Send to Slack
  if (env.SLACK_WEBHOOK_URL) {
    const { SlackNotifier } = await import('../notify/slack');
    const slack = new SlackNotifier(env.SLACK_WEBHOOK_URL);
    await slack.send({
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '📊 Weekly OEM Report' } },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Crawl Runs:* ${totalRuns} (${report.success_rate} success)` },
            { type: 'mrkdwn', text: `*Changes Detected:* ${totalChanges}` },
            { type: 'mrkdwn', text: `*Products Upserted:* ${totalProducts}` },
            { type: 'mrkdwn', text: `*Offers Upserted:* ${totalOffers}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Current Totals:* ${report.current_totals.products} products · ${report.current_totals.colors} colors · ${report.current_totals.offers} offers · ${report.current_totals.banners} banners` },
        },
      ],
      text: `Weekly OEM Report: ${totalRuns} runs, ${totalChanges} changes, ${report.success_rate} success rate`,
    });
  }

  return report;
}

/**
 * Sync vector embeddings for new records
 */
/**
 * Sync PDF embeddings — finds brochures not yet in pdf_embeddings
 * and vectorizes them via Gemini 2.5 Flash (text extraction) +
 * gemini-embedding-001 (768-dim vectors).
 */
async function syncEmbeddings(
  _job: CronJob,
  env: AppEnv['Bindings']
): Promise<Record<string, unknown>> {
  const { createSupabaseClient } = await import('../utils/supabase');
  const supabase = createSupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const GOOGLE_API_KEY = env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) {
    return { message: 'GOOGLE_API_KEY not set, skipping embedding sync' };
  }
  if (!env.AI) {
    return { message: 'Workers AI binding not available, skipping embedding sync' };
  }

  // Find brochures not yet embedded
  const { data: models } = await supabase
    .from('vehicle_models')
    .select('id, oem_id, name, brochure_url')
    .not('brochure_url', 'is', null);

  const { data: existing } = await supabase
    .from('pdf_embeddings')
    .select('source_id');

  const alreadyDone = new Set((existing ?? []).map((e: any) => e.source_id));
  const toDo = (models ?? []).filter((m: any) => !alreadyDone.has(m.id));

  if (toDo.length === 0) {
    return { message: 'All brochures already embedded', total: alreadyDone.size };
  }

  console.log(`[EmbeddingSync] ${toDo.length} new brochures to embed`);

  let embedded = 0;
  let failed = 0;
  const errors: string[] = [];

  // Helper: convert Uint8Array to base64 without stack overflow
  function uint8ToBase64(bytes: Uint8Array): string {
    const CHUNK = 8192;
    let result = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      result += String.fromCharCode(...bytes.slice(i, i + CHUNK));
    }
    return btoa(result);
  }

  for (const model of toDo.slice(0, 10)) { // Max 10 per run to stay within Worker CPU limits
    const label = `${model.oem_id}/${model.name}`;
    try {
      // Download PDF
      const res = await fetch(model.brochure_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        redirect: 'follow',
      });
      if (!res.ok) {
        const reason = `download failed: ${res.status} ${res.statusText}`;
        console.warn(`[EmbeddingSync] ${label}: ${reason}`);
        errors.push(`${label}: ${reason}`);
        failed++;
        continue;
      }
      const buffer = new Uint8Array(await res.arrayBuffer());

      // Validate PDF header
      const header = new TextDecoder().decode(buffer.slice(0, 5));
      if (!header.startsWith('%PDF')) {
        const reason = `not a valid PDF (header: ${header})`;
        console.warn(`[EmbeddingSync] ${label}: ${reason}`);
        errors.push(`${label}: ${reason}`);
        failed++;
        continue;
      }

      // Skip excessively large PDFs (>25MB) to avoid timeout
      if (buffer.length > 25 * 1024 * 1024) {
        const reason = `PDF too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`;
        console.warn(`[EmbeddingSync] ${label}: ${reason}`);
        errors.push(`${label}: ${reason}`);
        failed++;
        continue;
      }

      // Extract text via Gemini Vision
      const base64 = uint8ToBase64(buffer);
      const extractRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: 'application/pdf', data: base64 } },
                { text: 'Extract ALL text from this automotive PDF. Include specs, features, prices, disclaimers. Plain text only.' },
              ],
            }],
            generationConfig: { maxOutputTokens: 8192 },
          }),
        },
      );

      if (!extractRes.ok) {
        const errBody = await extractRes.text().catch(() => '');
        const reason = `Gemini extraction failed: ${extractRes.status} ${errBody.slice(0, 200)}`;
        console.warn(`[EmbeddingSync] ${label}: ${reason}`);
        errors.push(`${label}: ${reason}`);
        failed++;
        continue;
      }
      const extractData = await extractRes.json() as any;
      const text = extractData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text.length < 50) {
        const reason = `extracted text too short (${text.length} chars)`;
        console.warn(`[EmbeddingSync] ${label}: ${reason}`);
        errors.push(`${label}: ${reason}`);
        failed++;
        continue;
      }

      // Chunk text
      const CHUNK_SIZE = 800;
      const OVERLAP = 100;
      const chunks: string[] = [];
      let i = 0;
      while (i < text.length) {
        const end = Math.min(i + CHUNK_SIZE, text.length);
        const chunk = text.slice(i, end).trim();
        if (chunk.length > 20) chunks.push(chunk);
        if (end >= text.length) break;
        i = end - OVERLAP;
      }

      // Generate embeddings via Workers AI + insert
      let chunksFailed = 0;
      for (let ci = 0; ci < chunks.length; ci++) {
        let vector: number[] | undefined;
        try {
          const embedResult = await env.AI.run('@cf/google/embeddinggemma-300m', {
            text: [chunks[ci]],
          }) as { data: number[][] };
          vector = embedResult.data?.[0];
        } catch (e) {
          console.warn(`[EmbeddingSync] ${label} chunk ${ci}: Workers AI failed:`, e);
          chunksFailed++;
          continue;
        }
        if (!vector) { chunksFailed++; continue; }

        await supabase.from('pdf_embeddings').upsert({
          source_type: 'brochure',
          source_id: model.id,
          oem_id: model.oem_id,
          pdf_url: model.brochure_url,
          chunk_index: ci,
          chunk_text: chunks[ci],
          embedding: JSON.stringify(vector),
          metadata: { model_name: model.name, chunk_count: chunks.length },
        }, { onConflict: 'source_id,source_type,chunk_index' });
      }

      if (chunksFailed === chunks.length && chunks.length > 0) {
        errors.push(`${label}: all ${chunks.length} embedding calls failed`);
        failed++;
      } else {
        embedded++;
        console.log(`[EmbeddingSync] ${label}: ${chunks.length - chunksFailed}/${chunks.length} chunks embedded`);
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(`[EmbeddingSync] ${label}: ${reason}`);
      errors.push(`${label}: ${reason}`);
      failed++;
    }
  }

  return {
    message: 'Embedding sync completed',
    new_brochures: toDo.length,
    embedded,
    failed,
    errors: errors.slice(0, 20),
    remaining: Math.max(0, toDo.length - 10),
    total_embeddings: (alreadyDone.size) + embedded,
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
