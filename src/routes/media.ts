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
  'renault-au': {
    Origin: 'https://www.renault.com.au',
    Referer: 'https://www.renault.com.au/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
  'foton-au': {
    Origin: 'https://www.fotonaustralia.com.au',
    Referer: 'https://www.fotonaustralia.com.au/',
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
  'ms-prd.apn.mediaserver.heliosnissan.net',
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
  'cdn.rotorint.com',
  'cdn.cms-uploads.i-motor.me',
  'www.renault.com.au',
  'www.fotonaustralia.com.au',
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

// Re-export encodeUrl from utils for existing consumers.
export { encodeUrl } from '../utils/image-proxy';

/**
 * Resolve a possibly-relative URL for a given OEM.
 */
function resolveUrl(raw: string, oemId: string): string | null {
  if (raw.startsWith('http')) return raw;
  const base = OEM_URL_BASES[oemId];
  return base ? base + raw : null;
}

// GET /media/fonts/:oemId/:filename — serve OEM fonts from R2
media.get('/fonts/:oemId/:filename', async (c) => {
  const { oemId, filename } = c.req.param();
  const r2Key = `fonts/${oemId}/${filename}`;
  const bucket = (c.env as any).MOLTBOT_BUCKET as R2Bucket;

  const obj = await bucket.get(r2Key);
  if (!obj) {
    return c.notFound();
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  const contentType = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : 'font/ttf';

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(obj.body, { status: 200, headers });
});

// GET /media/recipes/thumbnails/:oemId/:filename — serve recipe thumbnails from R2
media.get('/recipes/thumbnails/:oemId/:filename', async (c) => {
  const { oemId, filename } = c.req.param();
  const r2Key = `recipes/thumbnails/${oemId}/${filename}`;
  const bucket = (c.env as any).MOLTBOT_BUCKET as R2Bucket;

  const obj = await bucket.get(r2Key);
  if (!obj) return c.notFound();

  const headers = new Headers();
  headers.set('Content-Type', 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(obj.body, { status: 200, headers });
});

// GET /media/screenshots/:filename — serve capture screenshots from R2
media.get('/screenshots/:filename', async (c) => {
  const { filename } = c.req.param();
  const r2Key = `screenshots/${filename}`;
  const bucket = (c.env as any).MOLTBOT_BUCKET as R2Bucket;

  const obj = await bucket.get(r2Key);
  if (!obj) return c.notFound();

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=3600');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(obj.body, { status: 200, headers });
});

// Shared handler for serving R2-stored page assets
async function servePageAsset(c: any) {
  const { oemId, modelSlug, filename } = c.req.param();
  const r2Key = `pages/assets/${oemId}/${modelSlug}/${filename}`;
  const bucket = (c.env as any).MOLTBOT_BUCKET as R2Bucket;

  const obj = await bucket.get(r2Key);
  if (!obj) {
    return c.notFound();
  }

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(obj.body, { status: 200, headers });
}

// GET /media/brochures/:oemId/:slug/:filename — serve uploaded brochure PDFs
media.get('/brochures/:oemId/:slug/:filename', async (c) => {
  const { oemId, slug, filename } = c.req.param();
  const r2Key = `brochures/${oemId}/${slug}/${filename}`;
  const bucket = (c.env as any).MOLTBOT_BUCKET as R2Bucket;

  const obj = await bucket.get(r2Key);
  if (!obj) return c.notFound();

  const headers = new Headers();
  headers.set('Content-Type', 'application/pdf');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Content-Disposition', `inline; filename="${filename}"`);

  return new Response(obj.body, { status: 200, headers });
});

// GET /media/pages/assets/:oemId/:modelSlug/:filename — canonical path
// Must be registered BEFORE the catch-all /:oemId/:encodedUrl route
media.get('/pages/assets/:oemId/:modelSlug/:filename', servePageAsset);

// GET /media/pages/:oemId/:modelSlug/:filename — compat for pages captured
// before the /assets/ segment was added to the proxy path (pre-Apr 2026)
media.get('/pages/:oemId/:modelSlug/:filename', servePageAsset);

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

  // ── Edge cache via Cache API ──────────────────────────────────────────
  // `cf: { cacheEverything }` on the subrequest only works when the worker
  // is accessed through a zone-bound custom domain — it's silently ignored
  // on *.workers.dev. Using the explicit Cache API instead so images are
  // edge-cached regardless of which hostname serves the worker.
  const cache = (caches as any).default as Cache;
  const cacheKey = new Request(c.req.url, { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Build headers for OEM origin
  const headers: Record<string, string> = {
    Accept: 'image/webp,image/avif,image/png,image/jpeg,image/*,*/*',
    ...OEM_HEADERS[oemId],
  };

  const originResp = await fetch(resolved, { headers });

  if (!originResp.ok) {
    return c.text(`Origin returned ${originResp.status}`, originResp.status as any);
  }

  // Build cacheable response
  const respHeaders = new Headers();
  const ct = originResp.headers.get('content-type');
  if (ct) respHeaders.set('Content-Type', ct);
  respHeaders.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
  respHeaders.set('Access-Control-Allow-Origin', '*');

  const response = new Response(originResp.body, { status: 200, headers: respHeaders });

  // Store in edge cache (non-blocking — don't delay the response)
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
});

export { media };
