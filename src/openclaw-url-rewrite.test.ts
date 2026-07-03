import { describe, expect, it } from 'vitest';

import { rewriteOpenClawNestedAssetPath } from './openclaw-url-rewrite';

describe('rewriteOpenClawNestedAssetPath', () => {
  it.each([
    ['/vault/assets/index.css', '/assets/index.css'],
    ['/vault/__openclaw/control-ui-config.json', '/__openclaw/control-ui-config.json'],
    ['/vault/favicon.svg', '/favicon.svg'],
    ['/vault/favicon-32.png', '/favicon-32.png'],
    ['/vault/apple-touch-icon.png', '/apple-touch-icon.png'],
    ['/vault/manifest.webmanifest', '/manifest.webmanifest'],
  ])('rewrites nested OpenClaw UI path %s to %s', (input, expected) => {
    expect(rewriteOpenClawNestedAssetPath(input)).toBe(expected);
  });

  it.each([
    '/',
    '/assets/index.css',
    '/__openclaw/control-ui-config.json',
    '/api/v1/oem-agent/pages/volkswagen-au-amarok',
    '/media/pages/assets/volkswagen-au/amarok/hero.jpg',
    '/vault/dashboard/page-builder',
  ])('leaves non-OpenClaw nested asset path %s unchanged', (input) => {
    expect(rewriteOpenClawNestedAssetPath(input)).toBe(input);
  });
});
