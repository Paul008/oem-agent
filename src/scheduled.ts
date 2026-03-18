/**
 * Scheduled Crawl Handler
 *
 * Handles Cloudflare Cron Triggers for the OEM Agent.
 * Each cron interval corresponds to a different crawl frequency.
 * Run history is saved to R2 alongside OpenClaw cron runs.
 */

import type { MoltbotEnv } from './types';
import { OemAgentOrchestrator } from './orchestrator';
import { createSupabaseClient } from './utils/supabase';
import { AiRouter } from './ai/router';
import { MultiChannelNotifier } from './notify/slack';
import { saveRun, type JobRun } from './utils/cron-runs';

/**
 * Cloudflare Workers cron trigger definitions.
 * Shared with cron.ts so the dashboard can display these alongside OpenClaw jobs.
 */
export const CLOUDFLARE_TRIGGERS = [
  {
    id: 'cf-homepage-crawl',
    name: 'Homepage Crawl',
    description: 'Crawl OEM homepages for changes',
    schedule: '0 */2 * * *',
    timezone: 'Australia/Sydney',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'homepage' },
  },
  {
    id: 'cf-offers-crawl',
    name: 'Offers Crawl',
    description: 'Crawl OEM offers and promotions pages',
    schedule: '0 */4 * * *',
    timezone: 'Australia/Sydney',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'offers' },
  },
  {
    id: 'cf-vehicles-crawl',
    name: 'Vehicles Crawl',
    description: 'Crawl OEM vehicle model pages',
    schedule: '0 */12 * * *',
    timezone: 'Australia/Sydney',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'vehicles' },
  },
  {
    id: 'cf-news-crawl',
    name: 'News Crawl',
    description: 'Daily crawl of OEM news and announcements',
    schedule: '0 6 * * *',
    timezone: 'Australia/Sydney',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'news' },
  },
  {
    id: 'cf-sitemap-crawl',
    name: 'Sitemap & Design Checks',
    description: 'Daily sitemap discovery and design capture',
    schedule: '0 7 * * *',
    timezone: 'Australia/Sydney',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'sitemap' },
  },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  schedule: string;
  timezone: string;
  skill: string;
  enabled: boolean;
  config: Record<string, unknown>;
}>;

/** Map cron expression → trigger definition */
const TRIGGER_BY_CRON = new Map<string, (typeof CLOUDFLARE_TRIGGERS)[number]>(
  CLOUDFLARE_TRIGGERS.map(t => [t.schedule, t])
);

/**
 * Cron trigger handler
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: MoltbotEnv,
  ctx: ExecutionContext
): Promise<void> {
  const cronExpr = event.cron;
  console.log(`[Scheduled] Triggered with cron: ${cronExpr}`);

  const trigger = TRIGGER_BY_CRON.get(cronExpr);
  const jobId = trigger?.id ?? `cf-unknown-${cronExpr.replace(/\s+/g, '-')}`;
  const label = trigger?.name ?? `Unknown (${cronExpr})`;

  const orchestrator = createOrchestratorFromEnv(env);
  const bucket = env.MOLTBOT_BUCKET;

  // Create run record
  const run: JobRun = {
    id: `${jobId}-${Date.now()}`,
    jobId,
    startedAt: new Date().toISOString(),
    status: 'running',
  };
  await saveRun(bucket, run);

  ctx.waitUntil(
    (async () => {
      try {
        const crawlType = trigger?.config.crawl_type as string | undefined;
        console.log(`[Scheduled] Running ${label} (crawl_type: ${crawlType ?? 'full'})`);
        const result = await orchestrator.runScheduledCrawl(crawlType);
        console.log(`[${label}] Processed ${result.jobsProcessed} pages, ${result.pagesChanged} changed`);

        run.status = 'success';
        run.completedAt = new Date().toISOString();
        run.result = {
          crawl_type: trigger?.config.crawl_type ?? 'full',
          jobsProcessed: result.jobsProcessed,
          pagesChanged: result.pagesChanged,
          errors: result.errors,
        };
      } catch (e) {
        console.error(`[Scheduled] ${label} failed:`, e);
        run.status = 'failed';
        run.completedAt = new Date().toISOString();
        run.error = e instanceof Error ? e.message : String(e);
      }

      await saveRun(bucket, run);
    })()
  );
}

/**
 * Create orchestrator from environment.
 *
 * The orchestrator crawls ALL registered OEMs (including GMSV) on each
 * cron trigger — no per-OEM scheduling is needed here.
 *
 * Browser rendering priority:
 *   1. Lightpanda (env.LIGHTPANDA_URL) — fast, low-cost headless browser
 *   2. Cloudflare Browser (env.BROWSER)  — fallback when Lightpanda is unset
 */
function createOrchestratorFromEnv(env: MoltbotEnv): OemAgentOrchestrator {
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

  return new OemAgentOrchestrator({
    supabaseClient,
    r2Bucket: env.MOLTBOT_BUCKET,
    browser: env.BROWSER!,
    aiRouter,
    notifier,
    lightpandaUrl: env.LIGHTPANDA_URL,
  });
}
