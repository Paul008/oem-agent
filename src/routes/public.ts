import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { MOLTBOT_PORT } from '../config';
import { findExistingMoltbotProcess } from '../gateway';
import oemLandingHtml from '../assets/oem-landing.html';

/**
 * Public routes - NO Cloudflare Access authentication required
 *
 * These routes are mounted BEFORE the auth middleware is applied.
 * Includes: health checks, static assets, and public API endpoints.
 *
 * Note: The root `/` path is NOT handled here - it falls through to the
 * catch-all proxy which routes to the Moltbot/OpenClaw web chat UI.
 */
const publicRoutes = new Hono<AppEnv>();

// GET /oem - OEM Agent landing page (moved from / to allow chat UI at root)
publicRoutes.get('/oem', (c) => {
  return c.html(oemLandingHtml);
});

// GET /sandbox-health - Health check endpoint
publicRoutes.get('/sandbox-health', (c) => {
  return c.json({
    status: 'ok',
    service: 'moltbot-sandbox',
    gateway_port: MOLTBOT_PORT,
  });
});

// Logo assets are served by the OpenClaw gateway via catch-all proxy

// GET /api/status - Public health check for gateway status (no auth required)
publicRoutes.get('/api/status', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    const process = await findExistingMoltbotProcess(sandbox);
    if (!process) {
      return c.json({ ok: false, status: 'not_running' });
    }

    // Process exists, check if it's actually responding
    // Try to reach the gateway with a short timeout
    try {
      await process.waitForPort(18789, { mode: 'tcp', timeout: 5000 });
      return c.json({ ok: true, status: 'running', processId: process.id });
    } catch {
      return c.json({ ok: false, status: 'not_responding', processId: process.id });
    }
  } catch (err) {
    return c.json({
      ok: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// GET /_admin/assets/* - Redirect to root (admin UI is now served by OpenClaw Control UI)
publicRoutes.get('/_admin/assets/*', (c) => {
  const url = new URL(c.req.url);
  return c.redirect(`${url.origin}/`);
});

export { publicRoutes };
