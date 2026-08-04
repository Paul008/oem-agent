import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../types';
import { createMockEnv, createMockProcess, createMockSandbox } from '../test-utils';

const gatewayMocks = vi.hoisted(() => ({
  mountR2Storage: vi.fn(),
}));

vi.mock('../gateway', async () => ({
  ...(await vi.importActual<typeof import('../gateway')>('../gateway')),
  mountR2Storage: gatewayMocks.mountR2Storage,
}));

import { api } from './api';

function createStorageApp(sandbox: AppEnv['Variables']['sandbox']) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('sandbox', sandbox);
    await next();
  });
  app.route('/api', api);
  return app;
}

describe('GET /api/admin/storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports configured and mounted without R2 secrets or an account id', async () => {
    const { sandbox, startProcessMock } = createMockSandbox();
    startProcessMock.mockResolvedValue(createMockProcess('2026-08-05T10:00:00+10:00\n'));
    gatewayMocks.mountR2Storage.mockResolvedValue(true);
    const env = createMockEnv({
      DEV_MODE: 'true',
      R2_ACCESS_KEY_ID: undefined,
      R2_SECRET_ACCESS_KEY: undefined,
      CF_ACCOUNT_ID: undefined,
    });

    const response = await createStorageApp(sandbox).request('/api/admin/storage', {}, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: true,
      mounted: true,
      lastSync: '2026-08-05T10:00:00+10:00',
      message: 'R2 storage is mounted. Your data will persist across container restarts.',
    });
  });

  it('reports a configured binding but an unsuccessful mount accurately', async () => {
    const { sandbox, startProcessMock } = createMockSandbox();
    gatewayMocks.mountR2Storage.mockResolvedValue(false);
    const env = createMockEnv({ DEV_MODE: 'true' });

    const response = await createStorageApp(sandbox).request('/api/admin/storage', {}, env);

    expect(await response.json()).toEqual({
      configured: true,
      mounted: false,
      lastSync: null,
      message: 'R2 storage is configured but is not mounted. Data is not currently persistent.',
    });
    expect(startProcessMock).not.toHaveBeenCalled();
  });

  it('reports the missing binding without checking credential names', async () => {
    const { sandbox } = createMockSandbox();
    const env = createMockEnv({
      DEV_MODE: 'true',
      MOLTBOT_BUCKET: undefined as unknown as R2Bucket,
    });

    const response = await createStorageApp(sandbox).request('/api/admin/storage', {}, env);

    expect(await response.json()).toEqual({
      configured: false,
      mounted: false,
      missing: ['MOLTBOT_BUCKET'],
      lastSync: null,
      message: 'R2 storage binding is not configured. Data will not persist across container restarts.',
    });
    expect(gatewayMocks.mountR2Storage).not.toHaveBeenCalled();
  });
});
