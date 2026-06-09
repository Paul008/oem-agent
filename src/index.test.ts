import { describe, expect, it } from 'vitest';

import { shouldAttachSandboxForPath } from './sandbox-paths';

describe('shouldAttachSandboxForPath', () => {
  it.each([
    '/media',
    '/media/pages/assets/mitsubishi-au/outlander/hero.jpg',
    '/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-html',
    '/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-manifest',
  ])('does not attach the OpenClaw sandbox for lightweight public artifact path %s', (pathname) => {
    expect(shouldAttachSandboxForPath(pathname)).toBe(false);
  });

  it.each([
    '/',
    '/_admin',
    '/api/status',
    '/api/admin/devices',
    '/api/v1/oem-agent/pages/mitsubishi-au-outlander',
    '/api/v1/oem-agent/admin/clone-page/mitsubishi-au/outlander',
    '/debug/processes',
  ])('keeps the OpenClaw sandbox available for existing gateway/admin path %s', (pathname) => {
    expect(shouldAttachSandboxForPath(pathname)).toBe(true);
  });
});
