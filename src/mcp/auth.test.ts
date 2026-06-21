/**
 * Tests for MCP authentication middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'hono';
import type { AppEnv, MoltbotEnv } from '../types';
import { mcpAuthMiddleware } from './auth';
import { createMockEnv } from '../test-utils';

function createMockContext(options: {
  env?: Partial<MoltbotEnv>;
  authorization?: string;
  cfJwt?: string;
}): {
  c: Context<AppEnv>;
  jsonMock: ReturnType<typeof vi.fn>;
  setMock: ReturnType<typeof vi.fn>;
} {
  const headers = new Headers();
  if (options.authorization) {
    headers.set('Authorization', options.authorization);
  }
  if (options.cfJwt) {
    headers.set('CF-Access-JWT-Assertion', options.cfJwt);
  }

  const jsonMock = vi.fn().mockReturnValue(new Response());
  const setMock = vi.fn();

  const c = {
    req: {
      header: (name: string) => headers.get(name),
      raw: { headers },
    },
    env: createMockEnv(options.env),
    json: jsonMock,
    set: setMock,
  } as unknown as Context<AppEnv>;

  return { c, jsonMock, setMock };
}

describe('mcpAuthMiddleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('bypasses auth and sets dev user in DEV_MODE', async () => {
    const { c, setMock } = createMockContext({ env: { DEV_MODE: 'true' } });
    const next = vi.fn();

    const result = await mcpAuthMiddleware(c, next);

    expect(next).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith('accessUser', {
      email: 'dev@localhost',
      name: 'Dev User',
    });
    expect(result).toBeUndefined();
  });

  it('authenticates with MCP_AUTH_TOKEN bearer', async () => {
    const { c, setMock, jsonMock } = createMockContext({
      env: { MCP_AUTH_TOKEN: 'secret-mcp-token' },
      authorization: 'Bearer secret-mcp-token',
    });
    const next = vi.fn();

    const result = await mcpAuthMiddleware(c, next);

    expect(next).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith('accessUser', { email: 'mcp-token-user' });
    expect(jsonMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('rejects invalid MCP_AUTH_TOKEN bearer', async () => {
    const { c, jsonMock } = createMockContext({
      env: { MCP_AUTH_TOKEN: 'secret-mcp-token' },
      authorization: 'Bearer wrong-token',
    });
    const next = vi.fn();

    await mcpAuthMiddleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' }),
      401,
    );
  });

  it('returns 401 when no credentials are provided', async () => {
    const { c, jsonMock } = createMockContext({ env: {} });
    const next = vi.fn();

    await mcpAuthMiddleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' }),
      401,
    );
  });
});
