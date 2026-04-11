import { describe, it, expect } from 'vitest';
import { proxyImage, encodeUrl } from './image-proxy';

const WORKER = 'https://oem-agent.adme-dev.workers.dev';
const FOTON = 'https://www.fotonaustralia.com.au/media/mith44mu/foton-my26-tunland-v7-c-4x2-flare-white.png';
const HYUNDAI = 'https://www.hyundai.com/content/dam/hyundai/au/en/images/vehicles/tucson/my26/tucson.png';

/** Decode a base64url string back to the original URL (pads correctly). */
function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (b64.length % 4)) % 4;
  return atob(b64 + '='.repeat(pad));
}

/** Extract the base64url payload from a proxied URL. */
function extractPayload(proxied: string, workerOrigin: string, oemId: string): string {
  return proxied.replace(`${workerOrigin}/media/${oemId}/`, '');
}

describe('proxyImage', () => {
  describe('null/empty handling', () => {
    it('returns empty string for null', () => {
      expect(proxyImage(null, { oemId: 'foton-au' })).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(proxyImage(undefined, { oemId: 'foton-au' })).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(proxyImage('', { oemId: 'foton-au' })).toBe('');
    });
  });

  describe('relative mode (page builder)', () => {
    it('proxies an http URL to a /media/ path', () => {
      const result = proxyImage(HYUNDAI, { oemId: 'hyundai-au' });
      expect(result.startsWith('/media/hyundai-au/')).toBe(true);
      expect(result).not.toContain('https://');
    });

    it('leaves an already-proxied /media/ path untouched', () => {
      const existing = '/media/foton-au/abc123';
      expect(proxyImage(existing, { oemId: 'foton-au' })).toBe(existing);
    });

    it('passes through non-http relative paths unchanged', () => {
      expect(proxyImage('/assets/logo.png', { oemId: 'foton-au' })).toBe('/assets/logo.png');
    });
  });

  describe('absolute mode (dealer API)', () => {
    it('prefixes worker origin on the output', () => {
      const result = proxyImage(HYUNDAI, { oemId: 'hyundai-au', workerOrigin: WORKER });
      expect(result.startsWith(`${WORKER}/media/hyundai-au/`)).toBe(true);
    });

    it('leaves already-proxied URLs from the same worker origin untouched', () => {
      const existing = `${WORKER}/media/foton-au/abc123`;
      expect(proxyImage(existing, { oemId: 'foton-au', workerOrigin: WORKER })).toBe(existing);
    });

    it('proxies URLs from a DIFFERENT host even if their pathname is /media/*', () => {
      // Regression guard: Foton's own CDN serves assets under /media/. A naive
      // pathname check would incorrectly treat this as already-proxied.
      const result = proxyImage(FOTON, { oemId: 'foton-au', workerOrigin: WORKER });
      expect(result.startsWith(`${WORKER}/media/foton-au/`)).toBe(true);
      expect(result).not.toContain('www.fotonaustralia.com.au');
    });

    it('works with a custom worker domain', () => {
      const custom = 'https://images.adme.com.au';
      const result = proxyImage(HYUNDAI, { oemId: 'hyundai-au', workerOrigin: custom });
      expect(result.startsWith(`${custom}/media/hyundai-au/`)).toBe(true);
    });

    it('leaves already-proxied URLs from a custom worker domain untouched', () => {
      const custom = 'https://images.adme.com.au';
      const existing = `${custom}/media/foton-au/abc123`;
      expect(proxyImage(existing, { oemId: 'foton-au', workerOrigin: custom })).toBe(existing);
    });
  });

  describe('foton hi-res upscale', () => {
    it('appends ?width=1920 to foton media URLs before encoding', () => {
      const result = proxyImage(FOTON, { oemId: 'foton-au', workerOrigin: WORKER });
      const decoded = decodeBase64Url(extractPayload(result, WORKER, 'foton-au'));
      expect(decoded).toContain('width=1920');
    });

    it('preserves existing ?width= param', () => {
      const url = `${FOTON}?width=800`;
      const result = proxyImage(url, { oemId: 'foton-au', workerOrigin: WORKER });
      const decoded = decodeBase64Url(extractPayload(result, WORKER, 'foton-au'));
      expect(decoded).toContain('width=800');
      expect(decoded).not.toContain('width=1920');
    });

    it('appends width with & when other query params exist', () => {
      const url = `${FOTON}?rmode=max`;
      const result = proxyImage(url, { oemId: 'foton-au', workerOrigin: WORKER });
      const decoded = decodeBase64Url(extractPayload(result, WORKER, 'foton-au'));
      expect(decoded).toContain('rmode=max&width=1920');
    });

    it('does not add width= to non-foton URLs', () => {
      const result = proxyImage(HYUNDAI, { oemId: 'hyundai-au', workerOrigin: WORKER });
      const decoded = decodeBase64Url(extractPayload(result, WORKER, 'hyundai-au'));
      expect(decoded).not.toContain('width=1920');
    });
  });
});

describe('encodeUrl', () => {
  it('produces a base64url string (no +, /, =)', () => {
    const encoded = encodeUrl(FOTON);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('round-trips through atob with base64 padding', () => {
    const encoded = encodeUrl(HYUNDAI);
    expect(decodeBase64Url(encoded)).toBe(HYUNDAI);
  });
});
