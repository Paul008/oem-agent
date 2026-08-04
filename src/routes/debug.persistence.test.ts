import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../types';
import { createMockEnv, createMockProcess, createMockSandbox } from '../test-utils';

const gatewayMocks = vi.hoisted(() => ({
  mountR2Storage: vi.fn(),
  waitForProcess: vi.fn(),
  findExistingMoltbotProcess: vi.fn(),
}));

vi.mock('../gateway', async () => ({
  ...(await vi.importActual<typeof import('../gateway')>('../gateway')),
  ...gatewayMocks,
}));

import { debug } from './debug';

function createDebugApp(sandbox: AppEnv['Variables']['sandbox']) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('sandbox', sandbox);
    await next();
  });
  app.route('/debug', debug);
  return app;
}

describe('E2E persistence probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gatewayMocks.mountR2Storage.mockResolvedValue(true);
  });

  it('writes and reads a URL-safe marker through the mounted bucket', async () => {
    const marker = 'probe-12345678-base';
    const { sandbox, startProcessMock } = createMockSandbox();
    startProcessMock
      .mockResolvedValueOnce(createMockProcess(''))
      .mockResolvedValueOnce(createMockProcess(`${marker}\n`));
    const app = createDebugApp(sandbox);
    const env = createMockEnv({ E2E_TEST_MODE: 'true' });

    const writeResponse = await app.request('/debug/persistence-probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marker }),
    }, env);
    const readResponse = await app.request(`/debug/persistence-probe?marker=${marker}`, {}, env);

    expect(writeResponse.status).toBe(200);
    expect(await writeResponse.json()).toEqual({ written: true, marker });
    expect(startProcessMock.mock.calls[0][0]).toContain("printf '%s' 'probe-12345678-base'");
    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toEqual({ persisted: true, marker });
  });

  it('is unavailable outside E2E mode', async () => {
    const { sandbox } = createMockSandbox();
    const response = await createDebugApp(sandbox).request(
      '/debug/persistence-probe?marker=probe-12345678',
      {},
      createMockEnv(),
    );

    expect(response.status).toBe(404);
    expect(gatewayMocks.mountR2Storage).not.toHaveBeenCalled();
  });

  it('rejects markers that could escape the shell argument', async () => {
    const { sandbox } = createMockSandbox();
    const response = await createDebugApp(sandbox).request('/debug/persistence-probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marker: "probe'; touch /tmp/owned" }),
    }, createMockEnv({ E2E_TEST_MODE: 'true' }));

    expect(response.status).toBe(400);
    expect(gatewayMocks.mountR2Storage).not.toHaveBeenCalled();
  });

  it('empties only a prefix-guarded E2E bucket', async () => {
    const { sandbox, startProcessMock } = createMockSandbox();
    startProcessMock.mockResolvedValue(createMockProcess(''));
    const app = createDebugApp(sandbox);

    const denied = await app.request('/debug/e2e-storage', { method: 'DELETE' }, createMockEnv({
      E2E_TEST_MODE: 'true',
      R2_BUCKET_NAME: 'oem-agent-assets',
    }));
    const allowed = await app.request('/debug/e2e-storage', { method: 'DELETE' }, createMockEnv({
      E2E_TEST_MODE: 'true',
      R2_BUCKET_NAME: 'moltbot-e2e-123-base',
    }));

    expect(denied.status).toBe(404);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ emptied: true, bucket: 'moltbot-e2e-123-base' });
    expect(startProcessMock).toHaveBeenCalledWith('find /data/moltbot -mindepth 1 -delete');
  });
});
