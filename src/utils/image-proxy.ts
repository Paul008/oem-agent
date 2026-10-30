/**
 * Shared image-proxy helper.
 *
 * Rewrites raw OEM origin URLs to route through this worker's /media edge
 * proxy so the dealer app never hotlinks OEM CDNs directly.
 *
 * Usage:
 *   - Relative mode (same-origin consumer, e.g. page builder):
 *       proxyImage(url, { oemId })  → "/media/foton-au/<base64>"
 *   - Absolute mode (cross-origin consumer, e.g. dealer-api):
 *       proxyImage(url, { oemId, workerOrigin })
 *       → "https://oem-agent.adme-dev.workers.dev/media/foton-au/<base64>"
 */

export interface ProxyImageOptions {
  oemId: string;
  /** When set, returns an absolute URL rooted at this origin. */
  workerOrigin?: string;
}

/**
 * base64url-encode a string (URL-safe, no padding).
 */
export function encodeUrl(url: string): string {
  const bytes = new TextEncoder().encode(url);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * True if the URL already points at our /media proxy.
 *
 * Can't rely on `pathname.startsWith('/media/')` alone — many OEM origins
 * (Foton/Umbraco, Kia, etc.) serve assets under `/media/` themselves, so a
 * naive pathname check would treat raw OEM URLs as already-proxied.
 *
 * Instead:
 *   - Relative "/media/..." is always ours (the worker's own media route).
 *   - Absolute URLs are only considered proxied when their origin matches
 *     `workerOrigin`, so custom domains work but foreign `/media/` hosts
 *     still get proxied.
 */
function isAlreadyProxied(url: string, workerOrigin?: string): boolean {
  if (url.startsWith('/media/')) return true;
  if (!workerOrigin) return false;
  try {
    const parsed = new URL(url);
    return parsed.origin === workerOrigin && parsed.pathname.startsWith('/media/');
  } catch {
    return false;
  }
}

// MotorStack's oem-assets bucket: its rate-limited r2.dev URL maps onto the bucket's R2 custom
// domain, which Cloudflare serves from cache without running a Worker. Never sent through the
// generic proxy (r2.dev is not on its allowlist, and a Worker hop is exactly the cost avoided).
const MOTORSTACK_R2_PREFIX = 'https://pub-150d4c02365b4ffe9e158d72b3b048a1.r2.dev/';
export const MOTORSTACK_MEDIA_CDN = 'https://motorstackmedia.driveagent.io/';

export function isMotorstackR2Url(url: string): boolean {
  return url.startsWith(MOTORSTACK_R2_PREFIX);
}

export function proxyImage(url: string | null | undefined, opts: ProxyImageOptions): string {
  if (!url) return '';
  if (isAlreadyProxied(url, opts.workerOrigin)) return url;
  if (isMotorstackR2Url(url)) return MOTORSTACK_MEDIA_CDN + url.slice(MOTORSTACK_R2_PREFIX.length);

  // Foton hi-res: ensure Umbraco ?width=1920 is set before proxying so the
  // edge cache key captures the upscaled variant.
  let source = url;
  if (source.includes('fotonaustralia.com.au/media/') && !source.includes('width=')) {
    source = source + (source.includes('?') ? '&' : '?') + 'width=1920';
  }

  // Only proxy external URLs — leave relative/internal paths untouched.
  if (!source.startsWith('http')) return source;

  const path = `/media/${opts.oemId}/${encodeUrl(source)}`;
  return opts.workerOrigin ? `${opts.workerOrigin}${path}` : path;
}

/**
 * Public origin for `/media/` URLs handed to consumers (dealer sites, published
 * pages, brochures). MEDIA_BASE_URL (oemmedia.driveagent.io in production) wins so
 * no consumer is ever pointed at the workers.dev hostname; falls back to the
 * request origin when unset (local dev).
 */
export function mediaOrigin(env: { MEDIA_BASE_URL?: string }, requestUrl: string): string {
  return env.MEDIA_BASE_URL?.trim().replace(/\/+$/, '') || new URL(requestUrl).origin;
}
