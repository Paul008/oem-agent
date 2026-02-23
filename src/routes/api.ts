import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createAccessMiddleware } from '../auth';
import oemAgentRoutes from './oem-agent';
import {
  ensureMoltbotGateway,
  findExistingMoltbotProcess,
  mountR2Storage,
  syncToR2,
  waitForProcess,
} from '../gateway';
import { R2_MOUNT_PATH } from '../config';

// CLI commands can take 10-15 seconds to complete due to WebSocket connection overhead
const CLI_TIMEOUT_MS = 20000;

/**
 * API routes
 * - /api/admin/* - Protected admin API routes (Cloudflare Access required)
 *
 * Note: /api/status is now handled by publicRoutes (no auth required)
 */
const api = new Hono<AppEnv>();

/**
 * Admin API routes - all protected by Cloudflare Access
 */
const adminApi = new Hono<AppEnv>();

// Middleware: Verify Cloudflare Access JWT for all admin routes
adminApi.use('*', createAccessMiddleware({ type: 'json' }));

// GET /api/admin/devices - List pending and paired devices
adminApi.get('/devices', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Ensure moltbot is running first
    await ensureMoltbotGateway(sandbox, c.env);

    // Run OpenClaw CLI to list devices
    // Must specify --url and --token (OpenClaw v2026.2.3 requires explicit credentials with --url)
    const token = c.env.MOLTBOT_GATEWAY_TOKEN;
    const tokenArg = token ? ` --token ${token}` : '';
    const proc = await sandbox.startProcess(
      `openclaw devices list --json --url ws://localhost:18789${tokenArg}`,
    );
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    // Try to parse JSON output
    try {
      // Find JSON in output (may have other log lines)
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return c.json(data);
      }

      // If no JSON found, return raw output for debugging
      return c.json({
        pending: [],
        paired: [],
        raw: stdout,
        stderr,
      });
    } catch {
      return c.json({
        pending: [],
        paired: [],
        raw: stdout,
        stderr,
        parseError: 'Failed to parse CLI output',
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/admin/devices/:requestId/approve - Approve a pending device
adminApi.post('/devices/:requestId/approve', async (c) => {
  const sandbox = c.get('sandbox');
  const requestId = c.req.param('requestId');

  if (!requestId) {
    return c.json({ error: 'requestId is required' }, 400);
  }

  try {
    // Ensure moltbot is running first
    await ensureMoltbotGateway(sandbox, c.env);

    // Run OpenClaw CLI to approve the device
    const token = c.env.MOLTBOT_GATEWAY_TOKEN;
    const tokenArg = token ? ` --token ${token}` : '';
    const proc = await sandbox.startProcess(
      `openclaw devices approve ${requestId} --url ws://localhost:18789${tokenArg}`,
    );
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    // Check for success indicators (case-insensitive, CLI outputs "Approved ...")
    const success = stdout.toLowerCase().includes('approved') || proc.exitCode === 0;

    return c.json({
      success,
      requestId,
      message: success ? 'Device approved' : 'Approval may have failed',
      stdout,
      stderr,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/admin/devices/approve-all - Approve all pending devices
adminApi.post('/devices/approve-all', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Ensure moltbot is running first
    await ensureMoltbotGateway(sandbox, c.env);

    // First, get the list of pending devices
    const token = c.env.MOLTBOT_GATEWAY_TOKEN;
    const tokenArg = token ? ` --token ${token}` : '';
    const listProc = await sandbox.startProcess(
      `openclaw devices list --json --url ws://localhost:18789${tokenArg}`,
    );
    await waitForProcess(listProc, CLI_TIMEOUT_MS);

    const listLogs = await listProc.getLogs();
    const stdout = listLogs.stdout || '';

    // Parse pending devices
    let pending: Array<{ requestId: string }> = [];
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        pending = data.pending || [];
      }
    } catch {
      return c.json({ error: 'Failed to parse device list', raw: stdout }, 500);
    }

    if (pending.length === 0) {
      return c.json({ approved: [], message: 'No pending devices to approve' });
    }

    // Approve each pending device
    const results: Array<{ requestId: string; success: boolean; error?: string }> = [];

    for (const device of pending) {
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential device approval required
        const approveProc = await sandbox.startProcess(
          `openclaw devices approve ${device.requestId} --url ws://localhost:18789${tokenArg}`,
        );
        // eslint-disable-next-line no-await-in-loop
        await waitForProcess(approveProc, CLI_TIMEOUT_MS);

        // eslint-disable-next-line no-await-in-loop
        const approveLogs = await approveProc.getLogs();
        const success =
          approveLogs.stdout?.toLowerCase().includes('approved') || approveProc.exitCode === 0;

        results.push({ requestId: device.requestId, success });
      } catch (err) {
        results.push({
          requestId: device.requestId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const approvedCount = results.filter((r) => r.success).length;
    return c.json({
      approved: results.filter((r) => r.success).map((r) => r.requestId),
      failed: results.filter((r) => !r.success),
      message: `Approved ${approvedCount} of ${pending.length} device(s)`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /api/admin/storage - Get R2 storage status and last sync time
adminApi.get('/storage', async (c) => {
  const sandbox = c.get('sandbox');
  const hasCredentials = !!(
    c.env.R2_ACCESS_KEY_ID &&
    c.env.R2_SECRET_ACCESS_KEY &&
    c.env.CF_ACCOUNT_ID
  );

  // Check which credentials are missing
  const missing: string[] = [];
  if (!c.env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!c.env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!c.env.CF_ACCOUNT_ID) missing.push('CF_ACCOUNT_ID');

  let lastSync: string | null = null;

  // If R2 is configured, check for last sync timestamp
  if (hasCredentials) {
    try {
      // Mount R2 if not already mounted
      await mountR2Storage(sandbox, c.env);

      // Check for sync marker file
      const proc = await sandbox.startProcess(
        `cat ${R2_MOUNT_PATH}/.last-sync 2>/dev/null || echo ""`,
      );
      await waitForProcess(proc, 5000);
      const logs = await proc.getLogs();
      const timestamp = logs.stdout?.trim();
      if (timestamp && timestamp !== '') {
        lastSync = timestamp;
      }
    } catch {
      // Ignore errors checking sync status
    }
  }

  return c.json({
    configured: hasCredentials,
    missing: missing.length > 0 ? missing : undefined,
    lastSync,
    message: hasCredentials
      ? 'R2 storage is configured. Your data will persist across container restarts.'
      : 'R2 storage is not configured. Paired devices and conversations will be lost when the container restarts.',
  });
});

// POST /api/admin/storage/sync - Trigger a manual sync to R2
adminApi.post('/storage/sync', async (c) => {
  const sandbox = c.get('sandbox');

  const result = await syncToR2(sandbox, c.env);

  if (result.success) {
    return c.json({
      success: true,
      message: 'Sync completed successfully',
      lastSync: result.lastSync,
    });
  } else {
    const status = result.error?.includes('not configured') ? 400 : 500;
    return c.json(
      {
        success: false,
        error: result.error,
        details: result.details,
      },
      status,
    );
  }
});

// POST /api/admin/gateway/restart - Kill the current gateway and start a new one
adminApi.post('/gateway/restart', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Find and kill the existing gateway process
    const existingProcess = await findExistingMoltbotProcess(sandbox);

    if (existingProcess) {
      console.log('Killing existing gateway process:', existingProcess.id);
      try {
        await existingProcess.kill();
      } catch (killErr) {
        console.error('Error killing process:', killErr);
      }
      // Wait a moment for the process to die
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Start a new gateway in the background
    const bootPromise = ensureMoltbotGateway(sandbox, c.env).catch((err) => {
      console.error('Gateway restart failed:', err);
    });
    c.executionCtx.waitUntil(bootPromise);

    return c.json({
      success: true,
      message: existingProcess
        ? 'Gateway process killed, new instance starting...'
        : 'No existing process found, starting new instance...',
      previousProcessId: existingProcess?.id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// ============================================================================
// Pages API - Brand Ambassador generated pages
// ============================================================================

// GET /api/pages - List all generated pages or filter by OEM
api.get('/pages', async (c) => {
  const oemId = c.req.query('oem_id');
  const limit = parseInt(c.req.query('limit') || '100');

  try {
    const { PageGenerator } = await import('../design/page-generator');
    const { createSupabaseClient } = await import('../utils/supabase');

    const supabase = createSupabaseClient({
      url: c.env.SUPABASE_URL,
      serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    // Get all vehicle models
    let query = supabase
      .from('vehicle_models')
      .select('oem_id, slug, name, source_url')
      .order('oem_id')
      .order('slug')
      .limit(limit);

    if (oemId) {
      query = query.eq('oem_id', oemId);
    }

    const { data: models, error } = await query;

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    // For each model, check if page exists and get metadata
    const pages = [];
    for (const model of models || []) {
      const r2Key = `pages/definitions/${model.oem_id}/${model.slug}/latest.json`;
      const obj = await c.env.MOLTBOT_BUCKET.get(r2Key);

      if (obj) {
        const page = await obj.json() as any;
        pages.push({
          oem_id: model.oem_id,
          model_slug: model.slug,
          model_name: model.name,
          generated_at: page.generated_at,
          source_data_hash: page.source_data_hash,
          source_data_updated_at: page.source_data_updated_at,
          version: page.version,
          r2_key: r2Key,
        });
      }
    }

    return c.json({
      total: pages.length,
      pages,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /api/pages/:oemId/:modelSlug - Get specific page
api.get('/pages/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId');
  const modelSlug = c.req.param('modelSlug');

  try {
    const r2Key = `pages/definitions/${oemId}/${modelSlug}/latest.json`;
    const obj = await c.env.MOLTBOT_BUCKET.get(r2Key);

    if (!obj) {
      return c.json({ error: 'Page not found' }, 404);
    }

    const page = await obj.json();
    return c.json(page);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /api/pages/:oemId/:modelSlug/should-regenerate - Check if regeneration needed
api.get('/pages/:oemId/:modelSlug/should-regenerate', async (c) => {
  const oemId = c.req.param('oemId') as any;
  const modelSlug = c.req.param('modelSlug');

  try {
    const { PageGenerator } = await import('../design/page-generator');
    const { createSupabaseClient } = await import('../utils/supabase');
    const { AiRouter } = await import('../ai/router');
    const { DesignAgent } = await import('../design/agent');

    const supabase = createSupabaseClient({
      url: c.env.SUPABASE_URL,
      serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    const aiRouter = new AiRouter({
      groq: c.env.GROQ_API_KEY,
      together: c.env.TOGETHER_API_KEY,
      moonshot: c.env.MOONSHOT_API_KEY,
      anthropic: c.env.ANTHROPIC_API_KEY,
      google: c.env.GOOGLE_API_KEY,
    });

    const designAgent = new DesignAgent(
      c.env.TOGETHER_API_KEY,
      c.env.MOLTBOT_BUCKET,
    );

    const generator = new PageGenerator({
      supabase,
      aiRouter,
      designAgent,
      r2Bucket: c.env.MOLTBOT_BUCKET,
      browser: c.env.BROWSER!,
    });

    const decision = await generator.shouldRegeneratePage(oemId, modelSlug);

    return c.json(decision);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /api/pages/stats - Get overall stats
api.get('/pages/stats', async (c) => {
  const oemId = c.req.query('oem_id');

  try {
    const { createSupabaseClient } = await import('../utils/supabase');

    const supabase = createSupabaseClient({
      url: c.env.SUPABASE_URL,
      serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    // Get total models
    let modelsQuery = supabase
      .from('vehicle_models')
      .select('oem_id, slug', { count: 'exact', head: true });

    if (oemId) {
      modelsQuery = modelsQuery.eq('oem_id', oemId);
    }

    const { count: totalModels } = await modelsQuery;

    // Count generated pages in R2
    const prefix = oemId ? `pages/definitions/${oemId}/` : 'pages/definitions/';
    const listing = await c.env.MOLTBOT_BUCKET.list({ prefix });

    // Count pages by checking for latest.json files
    const generatedPages = listing.objects.filter(obj => obj.key.endsWith('/latest.json')).length;

    // Get last brand ambassador run
    const lastRunKey = 'openclaw/cron-runs/oem-brand-ambassador.json';
    const lastRunObj = await c.env.MOLTBOT_BUCKET.get(lastRunKey);
    let lastRun = null;

    if (lastRunObj) {
      const runs = await lastRunObj.json() as any[];
      lastRun = runs && runs.length > 0 ? runs[runs.length - 1] : null;
    }

    return c.json({
      total_models: totalModels || 0,
      generated_pages: generatedPages,
      pending_generation: (totalModels || 0) - generatedPages,
      last_run: lastRun,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// Mount admin API routes under /admin
api.route('/admin', adminApi);

// Mount OEM Agent routes under /oem-agent
api.route('/oem-agent', oemAgentRoutes);

export { api };
