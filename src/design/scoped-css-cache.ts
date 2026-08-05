import type { ScopedCssCache } from './production-css-scope';

const CACHE_PREFIX = 'design/scoped-css-cache/';

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function objectKey(cacheKey: string): Promise<string> {
  return `${CACHE_PREFIX}${await sha256Hex(cacheKey)}.css`;
}

/**
 * R2-backed cache of already-scoped external stylesheets. OEM CDN stylesheet URLs are
 * versioned (immutable), so entries never need invalidation — a new stylesheet version is a
 * new URL and therefore a new key. Failures degrade to a cache miss, never a request error.
 */
export function r2ScopedCssCache(bucket: R2Bucket): ScopedCssCache {
  return {
    async get(cacheKey: string): Promise<string | null> {
      try {
        const object = await bucket.get(await objectKey(cacheKey));
        return object ? await object.text() : null;
      } catch {
        return null;
      }
    },
    async put(cacheKey: string, css: string): Promise<void> {
      try {
        await bucket.put(await objectKey(cacheKey), css, {
          httpMetadata: { contentType: 'text/css; charset=utf-8' },
        });
      } catch {
        // Best-effort: a failed cache write only costs the next request a rebuild.
      }
    },
  };
}
