/**
 * Media Proxy Routes — edge-cached image proxy for OEM CDN assets
 *
 * Proxies variant_colors images through Cloudflare's edge cache so the
 * dashboard never hotlinks OEM CDNs directly.
 *
 * URL scheme:  /media/{oem-id}/{base64url-encoded-source-url}
 * Example:     /media/hyundai-au/aHR0cHM6Ly93d3cuaHl1bmRhaS5jb20vY29udGVudC8...
 *
 * The Worker fetches from the origin OEM CDN with appropriate headers,
 * returns the image with a long Cache-Control, and Cloudflare edge caches it.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';

const media = new Hono<AppEnv>();

// ── OEM-specific fetch headers ──────────────────────────────────────────────

const OEM_HEADERS: Record<string, Record<string, string>> = {
  'kgm-au': {
    Origin: 'https://kgm.com.au',
    Referer: 'https://kgm.com.au/',
  },
  'gwm-au': {
    Origin: 'https://www.gwmanz.com',
    Referer: 'https://www.gwmanz.com/',
  },
  'isuzu-au': {
    Origin: 'https://www.isuzuute.com.au',
    Referer: 'https://www.isuzuute.com.au/build-and-quote',
  },
  'nissan-au': {
    Origin: 'https://www.nissan.com.au',
    Referer: 'https://www.nissan.com.au/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
  'hyundai-au': {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
  'mazda-au': {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
  'ford-au': {
    Origin: 'https://www.ford.com.au',
    Referer: 'https://www.ford.com.au/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
  'suzuki-au': {
    Origin: 'https://www.suzuki.com.au',
    Referer: 'https://www.suzuki.com.au/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
};

// ── Base URLs for resolving relative paths ──────────────────────────────────

const OEM_URL_BASES: Record<string, string> = {
  'kgm-au': 'https://payloadb.therefinerydesign.com',
  'hyundai-au': 'https://www.hyundai.com',
  'mazda-au': 'https://www.mazda.com.au',
};

// ── Allowed origin hostnames (security: only proxy known OEM domains) ───────

const ALLOWED_HOSTS = new Set([
  'www.hyundai.com',
  'www.mazda.com.au',
  'www.isuzuute.com.au',
  'cdn-iua.dataweavers.io',
  'www.kia.com',
  'kia.com',
  'www.nissan.com.au',
  'www-asia.nissan-cdn.net',
  'a.storyblok.com',
  'payloadb.therefinerydesign.com',
  'kgm.com.au',
  'www.gwmanz.com',
  'www.ford.com.au',
  'www.gpas-cache.ford.com',
  'www.subaru.com.au',
  'cdn-image-handler.oem-production.subaru.com.au',
  'gn6lyzqet4.execute-api.ap-southeast-2.amazonaws.com',
  'www.suzuki.com.au',
  'd2ivfcfbdvj3sm.cloudfront.net',
  'www.mitsubishi-motors.com.au',
  'configurator.mitsubishi-motors.com.au',
  'cdn.suzuki.com.au',
  'img-ik.cars.co.za',
  'www.volkswagen-genuine-accessories.com',
  'content.dam',
]);

/**
 * Decode a base64url string to the original URL.
 * base64url: + → -, / → _, no padding
 */
function decodeUrl(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  // Pad if needed
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

/**
 * Encode a URL to base64url.
 */
export function encodeUrl(url: string): string {
  return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Resolve a possibly-relative URL for a given OEM.
 */
function resolveUrl(raw: string, oemId: string): string | null {
  if (raw.startsWith('http')) return raw;
  const base = OEM_URL_BASES[oemId];
  return base ? base + raw : null;
}

// GET /media/:oemId/:encodedUrl
media.get('/:oemId/:encodedUrl', async (c) => {
  const { oemId, encodedUrl } = c.req.param();

  // Decode the source URL
  let sourceUrl: string;
  try {
    sourceUrl = decodeUrl(encodedUrl);
  } catch {
    return c.text('Bad encoded URL', 400);
  }

  // Resolve relative paths
  const resolved = resolveUrl(sourceUrl, oemId);
  if (!resolved) {
    return c.text('Cannot resolve URL', 400);
  }

  // Security: validate hostname
  let hostname: string;
  try {
    hostname = new URL(resolved).hostname;
  } catch {
    return c.text('Invalid URL', 400);
  }

  if (!ALLOWED_HOSTS.has(hostname)) {
    return c.text('Host not allowed', 403);
  }

  // Build headers for OEM origin
  const headers: Record<string, string> = {
    Accept: 'image/webp,image/avif,image/png,image/jpeg,image/*,*/*',
    ...OEM_HEADERS[oemId],
  };

  // Fetch from origin with Cloudflare edge cache
  // Only cache 2xx responses; don't cache errors (prevents stale 403s)
  const originResp = await fetch(resolved, {
    headers,
    cf: {
      cacheEverything: true,
      cacheTtlByStatus: { '200-299': 2592000, '300-399': 0, '400-599': -1 },
    },
  });

  if (!originResp.ok) {
    return c.text(`Origin returned ${originResp.status}`, originResp.status as any);
  }

  // Return with cache headers
  const respHeaders = new Headers();
  const ct = originResp.headers.get('content-type');
  if (ct) respHeaders.set('Content-Type', ct);
  respHeaders.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
  respHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(originResp.body, {
    status: 200,
    headers: respHeaders,
  });
});

export { media };
