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
    description: 'Daily crawl of OEM homepages for changes (4am AEDT)',
    schedule: '0 17 * * *',
    timezone: 'Australia/Melbourne',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'homepage' },
  },
  {
    id: 'cf-offers-crawl',
    name: 'Offers Crawl',
    description: 'Daily crawl of OEM offers and promotions pages (5am AEDT)',
    schedule: '0 18 * * *',
    timezone: 'Australia/Melbourne',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'offers' },
  },
  {
    id: 'cf-vehicles-crawl',
    name: 'Vehicles Crawl',
    description: 'Crawl OEM vehicle model pages (5am + 5pm AEDT)',
    schedule: '0 6,18 * * *',
    timezone: 'Australia/Melbourne',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'vehicles' },
  },
  {
    id: 'cf-news-crawl',
    name: 'News Crawl',
    description: 'Daily crawl of OEM news and announcements (6am AEDT)',
    schedule: '0 19 * * *',
    timezone: 'Australia/Melbourne',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'news' },
  },
  {
    id: 'cf-sitemap-crawl',
    name: 'Sitemap & Design Checks',
    description: 'Daily sitemap discovery and design capture (7am AEDT)',
    schedule: '0 20 * * *',
    timezone: 'Australia/Melbourne',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'sitemap' },
  },
  {
    id: 'cf-banner-health',
    name: 'Banner Image Health Check',
    description: 'Daily graveyard-shift HEAD-check of all banner image URLs (4:30am AEDT)',
    schedule: '30 17 * * *',
    timezone: 'Australia/Melbourne',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'banner-health' },
  },
  {
    id: 'cf-design-drift',
    name: 'Design Drift Check',
    description: 'Weekly design drift detection across all OEMs (Sunday 3am AEDT)',
    schedule: '0 16 1 * *',
    timezone: 'Australia/Melbourne',
    skill: 'cloudflare-scheduled',
    enabled: true,
    config: { crawl_type: 'design-drift' },
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

        // Banner image health check — daily graveyard shift
        if (crawlType === 'banner-health') {
          const { executeBannerImageHealthCheck } = await import('./sync/crawl-doctor');
          const supabase = createSupabaseClient({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
          const result = await executeBannerImageHealthCheck(supabase, env.SLACK_WEBHOOK_URL);

          run.status = 'success';
          run.completedAt = new Date().toISOString();
          run.result = { crawl_type: 'banner-health', ...result };
          await saveRun(bucket, run);
          return;
        }

        // Design drift check — special handler
        if (crawlType === 'design-drift') {
          const { TokenCrawler } = await import('./design/token-crawler');
          const crawler = new TokenCrawler({ browser: env.BROWSER! });
          const supabase = createSupabaseClient({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
          const notifier = new MultiChannelNotifier(env.SLACK_WEBHOOK_URL);

          const allOems = ['kia-au','nissan-au','ford-au','volkswagen-au','mitsubishi-au','ldv-au','isuzu-au','mazda-au','kgm-au','gwm-au','suzuki-au','hyundai-au','toyota-au','subaru-au','gmsv-au','foton-au','gac-au','chery-au'];
          let driftCount = 0;
          const errors: string[] = [];

          for (const oemId of allOems) {
            try {
              const { data: oem } = await supabase.from('oems').select('base_url').eq('id', oemId).single();
              const url = oem?.base_url || `https://www.${oemId.replace('-au', '')}.com.au`;
              const crawled = await crawler.crawlTokens(url, oemId);

              const { data: tokenRow } = await supabase.from('brand_tokens').select('tokens_json').eq('oem_id', oemId).eq('is_active', true).order('created_at', { ascending: false }).limit(1).single();
              const existing = tokenRow?.tokens_json ?? {};

              // Quick diff on key fields
              let changes = 0;
              if (String(existing.colors?.primary) !== String(crawled.colors.primary)) changes++;
              if (String(existing.typography?.font_primary) !== String(crawled.typography.font_primary)) changes++;
              if (String(existing.colors?.cta_fill) !== String(crawled.colors.cta_fill)) changes++;
              if (changes > 0) driftCount++;

              console.log(`[DesignDrift] ${oemId}: ${changes} changes`);
            } catch (e) {
              errors.push(`${oemId}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          if (driftCount > 0) {
            await notifier.send(`🎨 Weekly drift check: ${driftCount} of ${allOems.length} OEMs have design changes`).catch(() => {});
          }

          run.status = 'success';
          run.completedAt = new Date().toISOString();
          run.result = { crawl_type: 'design-drift', oems_checked: allOems.length, oems_with_drift: driftCount, errors };
          await saveRun(bucket, run);
          return;
        }

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
      } finally {
        // Always save the run record — even on Worker kill, partial results are better than "running" forever
        try {
          await saveRun(bucket, run);
        } catch (saveErr) {
          console.error(`[Scheduled] Failed to save run record:`, saveErr);
        }
      }
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
