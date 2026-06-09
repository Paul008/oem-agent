import { describe, expect, it } from 'vitest';

import { isProductionArtifactPath, shouldAttachSandboxForPath } from './sandbox-paths';

describe('isProductionArtifactPath', () => {
  it.each([
    '/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-html',
    '/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-manifest',
  ])('matches external production artifact endpoint %s', (pathname) => {
    expect(isProductionArtifactPath(pathname)).toBe(true);
  });

  it.each([
    '/api/v1/oem-agent/pages/mitsubishi-au-outlander',
    '/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-json',
    '/api/oem-agent/pages/mitsubishi-au-outlander/production-html',
    '/media/pages/assets/mitsubishi-au/outlander/hero.jpg',
  ])('does not match non-artifact path %s', (pathname) => {
    expect(isProductionArtifactPath(pathname)).toBe(false);
  });
});

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
