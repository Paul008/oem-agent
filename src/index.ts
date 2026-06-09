/**
 * Moltbot + Cloudflare Sandbox
 *
 * This Worker runs Moltbot personal AI assistant in a Cloudflare Sandbox container.
 * It proxies all requests to the Moltbot Gateway's web UI and WebSocket endpoint.
 *
 * Features:
 * - Web UI (Control Dashboard + WebChat) at /
 * - WebSocket support for real-time communication
 * - Admin UI at /_admin/ for device management
 * - Configuration via environment secrets
 *
 * Required secrets (set via `wrangler secret put`):
 * - ANTHROPIC_API_KEY: Your Anthropic API key
 *
 * Optional secrets:
 * - MOLTBOT_GATEWAY_TOKEN: Token to protect gateway access
 * - TELEGRAM_BOT_TOKEN: Telegram bot token
 * - DISCORD_BOT_TOKEN: Discord bot token
 * - SLACK_BOT_TOKEN + SLACK_APP_TOKEN: Slack tokens
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { getSandbox, Sandbox, type SandboxOptions } from '@cloudflare/sandbox';

import type { AppEnv, MoltbotEnv } from './types';
import { MOLTBOT_PORT } from './config';
import { createAccessMiddleware } from './auth';
import { ensureMoltbotGateway, findExistingMoltbotProcess, syncToR2 } from './gateway';
import { publicRoutes, api, adminUi, debug, cdp, cron, media, oemAgent, agentRoutes, dealerApi, specsApi, oemProxy } from './routes';
import { handleScheduled as handleOemScheduled } from './scheduled';
import { redactSensitiveParams } from './utils/logging';
import { isProductionArtifactPath, shouldAttachSandboxForPath } from './sandbox-paths';
import loadingPageHtml from './assets/loading.html';
import configErrorHtml from './assets/config-error.html';

/**
 * Transform error messages from the gateway to be more user-friendly.
 */
function transformErrorMessage(message: string, host: string): string {
  if (message.includes('gateway token missing') || message.includes('gateway token mismatch')) {
    return `Invalid or missing token. Visit https://${host}?token={REPLACE_WITH_YOUR_TOKEN}`;
  }

  if (message.includes('pairing required')) {
    return `Pairing required. Visit https://${host}/_admin/`;
  }

  return message;
}

export { Sandbox };

/**
 * Validate required environment variables.
 * Returns an array of missing variable descriptions, or empty array if all are set.
 */
function validateRequiredEnv(env: MoltbotEnv): string[] {
  const missing: string[] = [];

  if (!env.MOLTBOT_GATEWAY_TOKEN) {
    missing.push('MOLTBOT_GATEWAY_TOKEN');
  }

  // Check for AI provider configuration (at least one must be set)
  const hasCloudflareGateway = !!(
    env.CLOUDFLARE_AI_GATEWAY_API_KEY &&
    env.CF_AI_GATEWAY_ACCOUNT_ID &&
    env.CF_AI_GATEWAY_GATEWAY_ID
  );
  const hasLegacyGateway = !!(env.AI_GATEWAY_API_KEY && env.AI_GATEWAY_BASE_URL);
  const hasAnthropicKey = !!env.ANTHROPIC_API_KEY;
  const hasOpenAIKey = !!env.OPENAI_API_KEY;

  if (!hasCloudflareGateway && !hasLegacyGateway && !hasAnthropicKey && !hasOpenAIKey) {
    missing.push(
      'ANTHROPIC_API_KEY, OPENAI_API_KEY, or CLOUDFLARE_AI_GATEWAY_API_KEY + CF_AI_GATEWAY_ACCOUNT_ID + CF_AI_GATEWAY_GATEWAY_ID',
    );
  }

  return missing;
}

/**
 * Build sandbox options based on environment configuration.
 *
 * SANDBOX_SLEEP_AFTER controls how long the container stays alive after inactivity:
 * - 'never' (default): Container stays alive indefinitely (recommended due to long cold starts)
 * - Duration string: e.g., '10m', '1h', '30s' - container sleeps after this period of inactivity
 *
 * To reduce costs at the expense of cold start latency, set SANDBOX_SLEEP_AFTER to a duration:
 *   npx wrangler secret put SANDBOX_SLEEP_AFTER
 *   # Enter: 10m (or 1h, 30m, etc.)
 */
function buildSandboxOptions(env: MoltbotEnv): SandboxOptions {
  const sleepAfter = env.SANDBOX_SLEEP_AFTER?.toLowerCase() || 'never';

  // 'never' means keep the container alive indefinitely
  if (sleepAfter === 'never') {
    return { keepAlive: true };
  }

  // Otherwise, use the specified duration
  return { sleepAfter };
}

async function authenticateSupabaseBearer(c: Context<AppEnv>): Promise<boolean> {
  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) return false;

  try {
    const response = await fetch(`${c.env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: {
        Authorization: authorization,
        apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) return false;

    const user = await response.json() as {
      email?: string;
      user_metadata?: { name?: string; full_name?: string };
    };

    if (!user.email) return false;

    c.set('accessUser', {
      email: user.email,
      name: user.user_metadata?.name || user.user_metadata?.full_name,
    });
    return true;
  } catch (error) {
    console.error('[AUTH] Supabase bearer verification failed:', error);
    return false;
  }
}

function canUseSupabaseDashboardAuth(pathname: string): boolean {
  return pathname.startsWith('/api/') || pathname === '/cron' || pathname.startsWith('/cron/');
}

function requiresWorkerAuth(pathname: string): boolean {
  return (
    pathname === '/cron' ||
    pathname.startsWith('/cron/') ||
    pathname === '/_admin' ||
    pathname.startsWith('/_admin/') ||
    pathname === '/debug' ||
    pathname.startsWith('/debug/') ||
    pathname === '/api/admin' ||
    pathname.startsWith('/api/admin/') ||
    pathname === '/api/oem-agent/admin' ||
    pathname.startsWith('/api/oem-agent/admin/') ||
    pathname === '/api/oem-agent/sales-rep' ||
    pathname.startsWith('/api/oem-agent/sales-rep/') ||
    pathname === '/api/oem-agent/design-memory' ||
    pathname.startsWith('/api/oem-agent/design-memory/') ||
    pathname === '/api/oem-agent/extraction-runs' ||
    pathname.startsWith('/api/oem-agent/extraction-runs') ||
    pathname === '/api/v1/oem-agent/admin' ||
    pathname.startsWith('/api/v1/oem-agent/admin/') ||
    pathname === '/api/v1/oem-agent/sales-rep' ||
    pathname.startsWith('/api/v1/oem-agent/sales-rep/') ||
    pathname === '/api/v1/oem-agent/design-memory' ||
    pathname.startsWith('/api/v1/oem-agent/design-memory/') ||
    pathname === '/api/v1/oem-agent/extraction-runs' ||
    pathname.startsWith('/api/v1/oem-agent/extraction-runs') ||
    pathname === '/api/v1/agents' ||
    pathname.startsWith('/api/v1/agents/') ||
    pathname === '/api/v1/admin' ||
    pathname.startsWith('/api/v1/admin/')
  );
}

function shouldInjectGatewayToken(c: Context<AppEnv>, url: URL): boolean {
  if (!c.env.MOLTBOT_GATEWAY_TOKEN || url.searchParams.has('token')) return false;
  return c.env.DEV_MODE === 'true' || c.env.E2E_TEST_MODE === 'true' || !!c.get('accessUser');
}

// Main app
const app = new Hono<AppEnv>();

function isMediaHostRequest(requestUrl: string, mediaBaseUrl?: string): boolean {
  const configured = mediaBaseUrl?.trim();
  if (!configured) return false;

  try {
    return new URL(requestUrl).host === new URL(configured).host;
  } catch {
    return false;
  }
}

// =============================================================================
// MIDDLEWARE: Applied to ALL routes
// =============================================================================

// Middleware: CORS — allow dashboard and external API consumers
app.use('*', cors({
  origin: (origin) => origin,
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'CF-Access-Jwt-Assertion'],
  exposeHeaders: [
    'Content-Length',
    'ETag',
    'X-OEM-Content-Bytes',
    'X-OEM-Content-SHA256',
    'X-OEM-Page-Mode',
    'X-OEM-Page-Version',
  ],
}));

// Middleware: Log every request
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const redactedSearch = redactSensitiveParams(url);
  console.log(`[REQ] ${c.req.method} ${url.pathname}${redactedSearch}`);
  console.log(`[REQ] Has ANTHROPIC_API_KEY: ${!!c.env.ANTHROPIC_API_KEY}`);
  console.log(`[REQ] DEV_MODE: ${c.env.DEV_MODE}`);
  console.log(`[REQ] DEBUG_ROUTES: ${c.env.DEBUG_ROUTES}`);
  await next();
});

// Dedicated media hostnames should only serve public media routes.
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const isMediaPath = url.pathname === '/media' || url.pathname.startsWith('/media/');
  if (isMediaHostRequest(c.req.url, c.env.MEDIA_BASE_URL) && !isMediaPath) {
    return c.notFound();
  }

  await next();
});

// Middleware: Initialize sandbox for all requests
app.use('*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  if (!shouldAttachSandboxForPath(pathname)) {
    return next();
  }

  const options = buildSandboxOptions(c.env);
  const sandbox = getSandbox(c.env.Sandbox, 'moltbot-v2', options);
  c.set('sandbox', sandbox);
  await next();
});

// =============================================================================
// PUBLIC ROUTES: No Cloudflare Access authentication required
// =============================================================================

// Mount public routes first (before auth middleware)
// Includes: /sandbox-health, /logo.png, /logo-small.png, /api/status, /_admin/assets/*
app.route('/', publicRoutes);

// Mount CDP routes (uses shared secret auth via query param, not CF Access)
app.route('/cdp', cdp);

// Mount media proxy (public — images must be loadable by browsers without auth)
app.route('/media', media);

// Mount dealer API (public — consumed by dealer websites without auth)
app.route('/api/wp/v2', dealerApi);

// Mount OEM page proxy (public — POC for interactive widget embedding)
app.route('/oem-proxy', oemProxy);

// =============================================================================
// PROTECTED ROUTES: Cloudflare Access authentication required
// =============================================================================

// Dashboard users are authenticated with Supabase. Accept that bearer token for
// dashboard API calls, while keeping Cloudflare Access support for deployments
// that configure CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD.
app.use('*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  if (canUseSupabaseDashboardAuth(pathname)) {
    await authenticateSupabaseBearer(c);
  }
  return next();
});

// Middleware: Validate required environment variables (skip in dev mode and for debug routes)
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);

  // Skip validation for debug routes (they have their own enable check)
  if (url.pathname.startsWith('/debug')) {
    return next();
  }

  // Production page artifacts are static R2-backed output for external sites.
  // They must not depend on OpenClaw gateway or AI provider configuration.
  if (isProductionArtifactPath(url.pathname)) {
    return next();
  }

  // Skip validation in dev mode
  if (c.env.DEV_MODE === 'true') {
    return next();
  }

  let missingVars = validateRequiredEnv(c.env);
  if (c.get('accessUser')) {
    missingVars = missingVars.filter(variable =>
      variable !== 'CF_ACCESS_TEAM_DOMAIN' && variable !== 'CF_ACCESS_AUD',
    );
  }
  if (missingVars.length > 0) {
    console.error('[CONFIG] Missing required environment variables:', missingVars.join(', '));

    const acceptsHtml = c.req.header('Accept')?.includes('text/html');
    if (acceptsHtml) {
      // Return a user-friendly HTML error page
      const html = configErrorHtml.replace('{{MISSING_VARS}}', missingVars.join(', '));
      return c.html(html, 503);
    }

    // Return JSON error for API requests
    return c.json(
      {
        error: 'Configuration error',
        message: 'Required environment variables are not configured',
        missing: missingVars,
        hint: 'Set these using: wrangler secret put <VARIABLE_NAME>',
      },
      503,
    );
  }

  return next();
});

// Middleware: authenticate protected Worker-owned routes.
// Cloudflare Access is only a fallback here; dashboard requests normally arrive
// with a Supabase bearer token and OpenClaw catch-all traffic relies on the
// gateway's own token/session handling.
app.use('*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  if (!requiresWorkerAuth(pathname)) {
    return next();
  }

  // Determine response type based on Accept header
  const acceptsHtml = c.req.header('Accept')?.includes('text/html');
  const middleware = createAccessMiddleware({
    type: acceptsHtml ? 'html' : 'json',
    redirectOnMissing: false,
  });

  return middleware(c, next);
});

// Mount API routes (protected by Cloudflare Access)
app.route('/api', api);

// Mount OEM Agent routes (protected by Cloudflare Access)
app.route('/api/v1/oem-agent', oemAgent);

// Mount Specs API routes (public + admin, protected by Cloudflare Access for admin paths)
app.route('/api/v1', specsApi);

// Mount Autonomous Agents routes (protected by Cloudflare Access)
app.route('/api/v1/agents', agentRoutes);

// Mount Cron management routes (protected by Cloudflare Access)
app.route('/cron', cron);

// Mount Admin UI routes (protected by Cloudflare Access)
app.route('/_admin', adminUi);

// Mount debug routes (protected by Cloudflare Access, only when DEBUG_ROUTES is enabled)
app.use('/debug/*', async (c, next) => {
  if (c.env.DEBUG_ROUTES !== 'true') {
    return c.json({ error: 'Debug routes are disabled' }, 404);
  }
  return next();
});
app.route('/debug', debug);

// =============================================================================
// CATCH-ALL: Proxy to Moltbot gateway
// =============================================================================

app.all('*', async (c) => {
  const sandbox = c.get('sandbox');
  const request = c.req.raw;
  const url = new URL(request.url);

  console.log('[PROXY] Handling request:', url.pathname);

  // Check if gateway is already running
  const existingProcess = await findExistingMoltbotProcess(sandbox);
  const isGatewayReady = existingProcess !== null && existingProcess.status === 'running';

  // For browser requests (non-WebSocket, non-API), show loading page if gateway isn't ready
  const isWebSocketRequest = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  const acceptsHtml = request.headers.get('Accept')?.includes('text/html');

  if (!isGatewayReady && !isWebSocketRequest && acceptsHtml) {
    console.log('[PROXY] Gateway not ready, serving loading page');

    // Start the gateway in the background (don't await)
    c.executionCtx.waitUntil(
      ensureMoltbotGateway(sandbox, c.env).catch((err: Error) => {
        console.error('[PROXY] Background gateway start failed:', err);
      }),
    );

    // Return the loading page immediately
    return c.html(loadingPageHtml);
  }

  // Ensure moltbot is running (this will wait for startup)
  try {
    await ensureMoltbotGateway(sandbox, c.env);
  } catch (error) {
    console.error('[PROXY] Failed to start Moltbot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    let hint = 'Check worker logs with: wrangler tail';
    if (!c.env.ANTHROPIC_API_KEY) {
      hint = 'ANTHROPIC_API_KEY is not set. Run: wrangler secret put ANTHROPIC_API_KEY';
    } else if (errorMessage.includes('heap out of memory') || errorMessage.includes('OOM')) {
      hint = 'Gateway ran out of memory. Try again or check for memory leaks.';
    }

    return c.json(
      {
        error: 'Moltbot gateway failed to start',
        details: errorMessage,
        hint,
      },
      503,
    );
  }

  // Proxy to Moltbot with WebSocket message interception
  if (isWebSocketRequest) {
    const debugLogs = c.env.DEBUG_ROUTES === 'true';
    const redactedSearch = redactSensitiveParams(url);

    console.log('[WS] Proxying WebSocket connection to Moltbot');
    if (debugLogs) {
      console.log('[WS] URL:', url.pathname + redactedSearch);
    }

    // Only forward the gateway token for requests the Worker has already
    // authenticated. Anonymous catch-all traffic should use OpenClaw's own
    // token/session flow instead.
    let wsRequest = request;
    const hasToken = url.searchParams.has('token');
    const hasGatewayToken = !!c.env.MOLTBOT_GATEWAY_TOKEN;
    console.log('[WS] Token check - hasToken:', hasToken, 'hasGatewayToken:', hasGatewayToken);

    const gatewayToken = c.env.MOLTBOT_GATEWAY_TOKEN;
    if (gatewayToken && shouldInjectGatewayToken(c, url)) {
      console.log('[WS] Injecting gateway token into WebSocket request');
      const tokenUrl = new URL(url.toString());
      tokenUrl.searchParams.set('token', gatewayToken);
      wsRequest = new Request(tokenUrl.toString(), request);
      console.log('[WS] Token injected, new URL has token:', new URL(wsRequest.url).searchParams.has('token'));
    }

    // Get WebSocket connection to the container
    const containerResponse = await sandbox.wsConnect(wsRequest, MOLTBOT_PORT);
    console.log('[WS] wsConnect response status:', containerResponse.status);

    // Get the container-side WebSocket
    const containerWs = containerResponse.webSocket;
    if (!containerWs) {
      console.error('[WS] No WebSocket in container response - falling back to direct proxy');
      return containerResponse;
    }

    if (debugLogs) {
      console.log('[WS] Got container WebSocket, setting up interception');
    }

    // Create a WebSocket pair for the client
    const [clientWs, serverWs] = Object.values(new WebSocketPair());

    // Accept both WebSockets
    serverWs.accept();
    containerWs.accept();

    if (debugLogs) {
      console.log('[WS] Both WebSockets accepted');
      console.log('[WS] containerWs.readyState:', containerWs.readyState);
      console.log('[WS] serverWs.readyState:', serverWs.readyState);
    }

    // Relay messages from client to container
    serverWs.addEventListener('message', (event) => {
      if (debugLogs) {
        console.log(
          '[WS] Client -> Container:',
          typeof event.data,
          typeof event.data === 'string' ? event.data.slice(0, 200) : '(binary)',
        );
      }
      if (containerWs.readyState === WebSocket.OPEN) {
        containerWs.send(event.data);
      } else if (debugLogs) {
        console.log('[WS] Container not open, readyState:', containerWs.readyState);
      }
    });

    // Relay messages from container to client, with error transformation
    containerWs.addEventListener('message', (event) => {
      if (debugLogs) {
        console.log(
          '[WS] Container -> Client (raw):',
          typeof event.data,
          typeof event.data === 'string' ? event.data.slice(0, 500) : '(binary)',
        );
      }
      let data = event.data;

      // Try to intercept and transform error messages
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          if (debugLogs) {
            console.log('[WS] Parsed JSON, has error.message:', !!parsed.error?.message);
          }
          if (parsed.error?.message) {
            if (debugLogs) {
              console.log('[WS] Original error.message:', parsed.error.message);
            }
            parsed.error.message = transformErrorMessage(parsed.error.message, url.host);
            if (debugLogs) {
              console.log('[WS] Transformed error.message:', parsed.error.message);
            }
            data = JSON.stringify(parsed);
          }
        } catch (e) {
          if (debugLogs) {
            console.log('[WS] Not JSON or parse error:', e);
          }
        }
      }

      if (serverWs.readyState === WebSocket.OPEN) {
        serverWs.send(data);
      } else if (debugLogs) {
        console.log('[WS] Server not open, readyState:', serverWs.readyState);
      }
    });

    // Handle close events
    serverWs.addEventListener('close', (event) => {
      if (debugLogs) {
        console.log('[WS] Client closed:', event.code, event.reason);
      }
      containerWs.close(event.code, event.reason);
    });

    containerWs.addEventListener('close', (event) => {
      if (debugLogs) {
        console.log('[WS] Container closed:', event.code, event.reason);
      }
      // Transform the close reason (truncate to 123 bytes max for WebSocket spec)
      let reason = transformErrorMessage(event.reason, url.host);
      if (reason.length > 123) {
        reason = reason.slice(0, 120) + '...';
      }
      if (debugLogs) {
        console.log('[WS] Transformed close reason:', reason);
      }
      serverWs.close(event.code, reason);
    });

    // Handle errors
    serverWs.addEventListener('error', (event) => {
      console.error('[WS] Client error:', event);
      containerWs.close(1011, 'Client error');
    });

    containerWs.addEventListener('error', (event) => {
      console.error('[WS] Container error:', event);
      serverWs.close(1011, 'Container error');
    });

    if (debugLogs) {
      console.log('[WS] Returning intercepted WebSocket response');
    }
    return new Response(null, {
      status: 101,
      webSocket: clientWs,
    });
  }

  console.log('[HTTP] Proxying:', url.pathname + url.search);

  // Only forward the gateway token for requests the Worker has already
  // authenticated. Anonymous catch-all traffic should use OpenClaw's own
  // token/session flow instead.
  let httpRequest = request;
  const gatewayToken = c.env.MOLTBOT_GATEWAY_TOKEN;
  if (gatewayToken && shouldInjectGatewayToken(c, url)) {
    const tokenUrl = new URL(url.toString());
    tokenUrl.searchParams.set('token', gatewayToken);
    httpRequest = new Request(tokenUrl.toString(), request);
  }

  const httpResponse = await sandbox.containerFetch(httpRequest, MOLTBOT_PORT);
  console.log('[HTTP] Response status:', httpResponse.status);

  // Add debug header to verify worker handled the request
  const newHeaders = new Headers(httpResponse.headers);
  newHeaders.set('X-Worker-Debug', 'proxy-to-moltbot');
  newHeaders.set('X-Debug-Path', url.pathname);

  return new Response(httpResponse.body, {
    status: httpResponse.status,
    statusText: httpResponse.statusText,
    headers: newHeaders,
  });
});

/**
 * Scheduled handler for cron triggers.
 * 
 * Handles:
 * 1. Moltbot backup sync to R2
 * 2. OEM Agent scheduled crawls (homepage, offers, vehicles, news, sitemap)
 */
async function scheduled(
  event: ScheduledEvent,
  env: MoltbotEnv,
  ctx: ExecutionContext,
): Promise<void> {
  // Run OEM Agent scheduled tasks
  console.log('[cron] Running OEM Agent scheduled tasks...');
  await handleOemScheduled(event, env, ctx);

  // Run Moltbot backup sync
  const options = buildSandboxOptions(env);
  const sandbox = getSandbox(env.Sandbox, 'moltbot-v2', options);

  const gatewayProcess = await findExistingMoltbotProcess(sandbox);
  if (!gatewayProcess) {
    console.log('[cron] Gateway not running yet, skipping sync');
    return;
  }

  console.log('[cron] Starting backup sync to R2...');
  const result = await syncToR2(sandbox, env);

  if (result.success) {
    console.log('[cron] Backup sync completed successfully at', result.lastSync);
  } else {
    console.error('[cron] Backup sync failed:', result.error, result.details || '');
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};
