/**
 * MCP tools for triggering OEM data sync and crawl jobs.
 */

import type { RegisteredTool } from '.';
import { createSupabaseClient } from '../../utils/supabase';
import { AiRouter } from '../../ai/router';
import { MultiChannelNotifier } from '../../notify/slack';
import { OemAgentOrchestrator } from '../../orchestrator';
import { allOemIds } from '../../oem/registry';
import { resolveOemDefinition } from '../../oem/registry';
import type { OemId } from '../../oem/types';
import { jsonResult, textResult } from '.';

function createOrchestrator(env: import('../../types').MoltbotEnv): OemAgentOrchestrator {
  const supabaseClient = createSupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter(
    {
      groq: env.GROQ_API_KEY,
      together: env.TOGETHER_API_KEY,
      moonshot: env.MOONSHOT_API_KEY,
      anthropic: env.ANTHROPIC_API_KEY,
      google: env.GOOGLE_API_KEY,
    },
    supabaseClient,
  );

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

export const triggerOemSyncTool: RegisteredTool = {
  definition: {
    name: 'trigger_oem_sync',
    description:
      'Trigger a data sync/crawl for one or all OEMs. This queues a background crawl that updates products, offers, banners, and pages.',
    inputSchema: {
      type: 'object',
      properties: {
        oem_id: {
          type: 'string',
          description: 'OEM identifier, e.g. "toyota-au". Omit to sync all OEMs.',
        },
        render: {
          type: 'boolean',
          description: 'Use browser rendering (slower but required for some sites like Toyota/VW). Default false.',
        },
      },
    },
  },
  handler: async (args, ctx) => {
    const oemId = String(args.oem_id || '');
    const render = args.render === true;

    // In a Worker we cannot return a background promise to the MCP client, but
    // we can start the work and return a job id. The ctx object here does not
    // carry executionCtx, so callers must use the dedicated HTTP endpoint for
    // long-running background crawls. This tool instead validates and starts a
    // lightweight non-render crawl synchronously when possible.
    const supabase = createSupabaseClient({
      url: ctx.env.SUPABASE_URL,
      serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    if (oemId) {
      if (!allOemIds.includes(oemId as OemId)) {
        return textResult(`Unknown OEM: ${oemId}`, true);
      }
      const def = await resolveOemDefinition(oemId as OemId, supabase);
      if (!def) {
        return textResult(`OEM not found: ${oemId}`, true);
      }

      const orchestrator = createOrchestrator(ctx.env);
      const jobId = crypto.randomUUID();

      // Fire-and-forget crawl; in an HTTP handler this would be waitUntil.
      // Here we start it and return immediately so the client is not blocked.
      orchestrator
        .crawlOem(oemId as OemId, undefined, 'manual', undefined, /* skipRender */ !render)
        .catch((err: unknown) => {
          console.error(`[MCP Sync ${jobId}] Error crawling ${oemId}:`, err);
        });

      return jsonResult({
        success: true,
        job_id: jobId,
        oem_id: oemId,
        message: `Crawl triggered for ${def.name}${render ? ' (with browser rendering)' : ' (quick mode)'}`,
        status: 'running',
      });
    }

    // Sync all OEMs
    const orchestrator = createOrchestrator(ctx.env);
    const jobId = crypto.randomUUID();
    orchestrator.runScheduledCrawl().catch((err: unknown) => {
      console.error(`[MCP Sync ${jobId}] Error running full crawl:`, err);
    });

    return jsonResult({
      success: true,
      job_id: jobId,
      message: 'Full crawl triggered for all OEMs',
      status: 'running',
    });
  },
};
