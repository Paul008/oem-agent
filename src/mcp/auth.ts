/**
 * Authentication helpers for the MCP server.
 *
 * Supports the same identity providers as the rest of the worker:
 * - Dev / E2E test mode bypass
 * - Cloudflare Access JWT
 * - Supabase bearer token
 * - Optional dedicated MCP bearer token (MCP_AUTH_TOKEN secret)
 */

import type { Context, Next } from 'hono';
import type { AppEnv, MoltbotEnv } from '../types';
import { verifyAccessJWT } from '../auth/jwt';
import { isDevMode, isE2ETestMode } from '../auth/middleware';

export interface MCPAuthUser {
  email: string;
  name?: string;
}

export function getMcpAuthUser(c: Context<AppEnv>): MCPAuthUser | undefined {
  return c.get('accessUser') as MCPAuthUser | undefined;
}

async function verifySupabaseBearer(
  env: MoltbotEnv,
  authorization: string,
): Promise<MCPAuthUser | undefined> {
  if (!authorization.startsWith('Bearer ')) return undefined;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return undefined;

  try {
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: {
        Authorization: authorization,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) return undefined;

    const user = (await response.json()) as {
      email?: string;
      user_metadata?: { name?: string; full_name?: string };
    };

    if (!user.email) return undefined;

    return {
      email: user.email,
      name: user.user_metadata?.name || user.user_metadata?.full_name,
    };
  } catch (error) {
    console.error('[MCP AUTH] Supabase bearer verification failed:', error);
    return undefined;
  }
}

async function verifyMcpToken(
  env: MoltbotEnv,
  authorization: string,
): Promise<MCPAuthUser | undefined> {
  if (!env.MCP_AUTH_TOKEN) return undefined;
  if (!authorization.startsWith('Bearer ')) return undefined;

  const token = authorization.slice('Bearer '.length);
  if (token !== env.MCP_AUTH_TOKEN) return undefined;

  return { email: 'mcp-token-user' };
}

async function verifyCloudflareAccess(
  env: MoltbotEnv,
  jwt: string,
): Promise<MCPAuthUser | undefined> {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return undefined;
  try {
    const payload = await verifyAccessJWT(jwt, env.CF_ACCESS_TEAM_DOMAIN, env.CF_ACCESS_AUD);
    return { email: payload.email, name: payload.name };
  } catch (error) {
    console.error('[MCP AUTH] Cloudflare Access verification failed:', error);
    return undefined;
  }
}

/**
 * Authenticate an MCP request and set accessUser on the Hono context.
 * Returns 401 if no valid identity can be established.
 */
export async function mcpAuthMiddleware(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  if (isDevMode(c.env) || isE2ETestMode(c.env)) {
    c.set('accessUser', { email: 'dev@localhost', name: 'Dev User' });
    return next();
  }

  const authorization = c.req.header('Authorization') || '';
  const cfJwt = c.req.header('CF-Access-JWT-Assertion');

  let user: MCPAuthUser | undefined;

  if (authorization.startsWith('Bearer ')) {
    user = await verifyMcpToken(c.env, authorization);
    if (!user) {
      user = await verifySupabaseBearer(c.env, authorization);
    }
  }

  if (!user && cfJwt) {
    user = await verifyCloudflareAccess(c.env, cfJwt);
  }

  if (!user) {
    return c.json(
      {
        error: 'Unauthorized',
        hint: 'Provide an Authorization: Bearer <token> header (MCP_AUTH_TOKEN or Supabase session) or connect through Cloudflare Access.',
      },
      401,
    );
  }

  c.set('accessUser', user);
  return next();
}
