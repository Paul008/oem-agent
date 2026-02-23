import { Hono } from 'hono';
import type { AppEnv } from '../types';

/**
 * Admin UI routes
 * Redirects to the OpenClaw Control UI served by the gateway container.
 *
 * Auth is applied centrally in index.ts before this app is mounted.
 */
const adminUi = new Hono<AppEnv>();

// Redirect all admin routes to the OpenClaw Control UI at root
adminUi.get('*', (c) => {
  const url = new URL(c.req.url);
  return c.redirect(`${url.origin}/`);
});

export { adminUi };
