/**
 * Scheduled Crawl Handler
 * 
 * Handles Cloudflare Cron Triggers for the OEM Agent.
 * Each cron interval corresponds to a different crawl frequency.
 */

import type { MoltbotEnv } from './types';
import { OemAgentOrchestrator } from './orchestrator';
import { createSupabaseClient } from './utils/supabase';
import { AiRouter } from './ai/router';
import { MultiChannelNotifier } from './notify/slack';

/**
 * Cron trigger handler
 * 
 * Cron schedules from wrangler.jsonc:
 * - 0 * /2 * * *  - Every 2 hours (homepage crawl)
 * - 0 * /4 * * *  - Every 4 hours (offers crawl)
 * - 0 * /12 * * * - Every 12 hours (vehicles crawl)
 * - 0 6 * * *     - Daily at 6am (news crawl)
 * - 0 7 * * *     - Daily at 7am (sitemap crawl)
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: MoltbotEnv,
  ctx: ExecutionContext
): Promise<void> {
  const cron = event.cron;
  console.log(`[Scheduled] Triggered with cron: ${cron}`);

  const orchestrator = createOrchestratorFromEnv(env);

  switch (cron) {
    case '0 */2 * * *':
      // Every 2 hours - Homepage crawl
      console.log('[Scheduled] Running homepage crawl cycle');
      ctx.waitUntil(runHomepageCrawl(orchestrator));
      break;

    case '0 */4 * * *':
      // Every 4 hours - Offers crawl
      console.log('[Scheduled] Running offers crawl cycle');
      ctx.waitUntil(runOffersCrawl(orchestrator));
      break;

    case '0 */12 * * *':
      // Every 12 hours - Vehicles crawl
      console.log('[Scheduled] Running vehicles crawl cycle');
      ctx.waitUntil(runVehiclesCrawl(orchestrator));
      break;

    case '0 6 * * *':
      // Daily at 6am - News crawl
      console.log('[Scheduled] Running news crawl cycle');
      ctx.waitUntil(runNewsCrawl(orchestrator));
      break;

    case '0 7 * * *':
      // Daily at 7am - Sitemap and design checks
      console.log('[Scheduled] Running sitemap and design checks');
      ctx.waitUntil(runSitemapCrawl(orchestrator));
      break;

    default:
      // Full crawl for any other trigger
      console.log('[Scheduled] Running full scheduled crawl');
      ctx.waitUntil(orchestrator.runScheduledCrawl());
  }
}

/**
 * Run homepage crawl for all OEMs
 */
async function runHomepageCrawl(orchestrator: OemAgentOrchestrator): Promise<void> {
  // Get pages due for homepage crawl
  const result = await orchestrator.runScheduledCrawl();
  console.log(`[Homepage Crawl] Processed ${result.jobsProcessed} pages, ${result.pagesChanged} changed`);
}

/**
 * Run offers crawl for all OEMs
 */
async function runOffersCrawl(orchestrator: OemAgentOrchestrator): Promise<void> {
  const result = await orchestrator.runScheduledCrawl();
  console.log(`[Offers Crawl] Processed ${result.jobsProcessed} pages, ${result.pagesChanged} changed`);
}

/**
 * Run vehicles crawl for all OEMs
 */
async function runVehiclesCrawl(orchestrator: OemAgentOrchestrator): Promise<void> {
  const result = await orchestrator.runScheduledCrawl();
  console.log(`[Vehicles Crawl] Processed ${result.jobsProcessed} pages, ${result.pagesChanged} changed`);
}

/**
 * Run news crawl for all OEMs
 */
async function runNewsCrawl(orchestrator: OemAgentOrchestrator): Promise<void> {
  const result = await orchestrator.runScheduledCrawl();
  console.log(`[News Crawl] Processed ${result.jobsProcessed} pages, ${result.pagesChanged} changed`);
}

/**
 * Run sitemap crawl for all OEMs
 */
async function runSitemapCrawl(orchestrator: OemAgentOrchestrator): Promise<void> {
  const result = await orchestrator.runScheduledCrawl();
  console.log(`[Sitemap Crawl] Processed ${result.jobsProcessed} pages, ${result.pagesChanged} changed`);
}

/**
 * Create orchestrator from environment
 */
function createOrchestratorFromEnv(env: MoltbotEnv): OemAgentOrchestrator {
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

  return new OemAgentOrchestrator({
    supabaseClient,
    r2Bucket: env.MOLTBOT_BUCKET,
    browser: env.BROWSER!,
    aiRouter,
    notifier,
  });
}
