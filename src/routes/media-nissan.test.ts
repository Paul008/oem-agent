import { describe, expect, it } from 'vitest';
import { isAllowedMediaHost } from './media';

describe('Nissan media allowlist', () => {
  it('allows only the reviewed exact Nissan hosts needed by the builder', () => {
    expect(isAllowedMediaHost('www.nissan.com.au')).toBe(true);
    expect(isAllowedMediaHost('navara.nissan.com.au')).toBe(true);
    expect(isAllowedMediaHost('www-asia.nissan-cdn.net')).toBe(true);
    expect(isAllowedMediaHost('ms-prd.apn.mediaserver.heliosnissan.net')).toBe(true);
    expect(isAllowedMediaHost('nissan-adme.adus.com.au')).toBe(false);
    expect(isAllowedMediaHost('evil.navara.nissan.com.au.example.com')).toBe(false);
  });
});
