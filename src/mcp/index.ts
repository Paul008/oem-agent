/**
 * MCP server route mounted at /mcp.
 *
 * Exposes a Remote MCP endpoint over HTTP+SSE using a Durable Object
 * per client session. Auth is required via mcpAuthMiddleware.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { mcpAuthMiddleware } from './auth';
import { McpSession } from './session';

export { McpSession };

const app = new Hono<AppEnv>();

// All MCP endpoints require authentication.
app.use('*', mcpAuthMiddleware);

/**
 * GET /mcp/sse — Establish an SSE stream for the MCP session.
 */
app.get('/sse', async (c: Context<AppEnv>) => {
  const sessionId = crypto.randomUUID();
  const id = c.env.McpSession.idFromName(sessionId);
  const stub = c.env.McpSession.get(id);

  const user = c.get('accessUser');
  const url = new URL(c.req.url);
  url.searchParams.set('sessionId', sessionId);

  const request = new Request(url.toString(), {
    method: 'GET',
    headers: {
      ...Object.fromEntries(c.req.raw.headers.entries()),
      ...(user?.email ? { 'X-MCP-User-Email': user.email } : {}),
      ...(user?.name ? { 'X-MCP-User-Name': user.name } : {}),
    },
  });

  const response = await stub.fetch(request);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
});

/**
 * POST /mcp/messages — Forward a JSON-RPC message to the session DO.
 */
app.post('/messages', async (c: Context<AppEnv>) => {
  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({ error: 'Missing sessionId query parameter' }, 400);
  }

  const id = c.env.McpSession.idFromName(sessionId);
  const stub = c.env.McpSession.get(id);

  const user = c.get('accessUser');
  const url = new URL(c.req.url);

  const request = new Request(url.toString(), {
    method: 'POST',
    headers: {
      ...Object.fromEntries(c.req.raw.headers.entries()),
      ...(user?.email ? { 'X-MCP-User-Email': user.email } : {}),
      ...(user?.name ? { 'X-MCP-User-Name': user.name } : {}),
    },
    body: await c.req.blob(),
  });

  const response = await stub.fetch(request);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
});

export default app;
