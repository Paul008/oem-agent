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
  return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

export function proxyImage(url: string | null | undefined, opts: ProxyImageOptions): string {
  if (!url) return '';
  if (isAlreadyProxied(url, opts.workerOrigin)) return url;

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
