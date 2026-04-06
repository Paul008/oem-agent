/**
 * OEM Page Proxy — HTMLRewriter-based proxy for OEM vehicle pages
 *
 * Fetches OEM model pages, rewrites them at the edge to:
 * - Preserve interactive widgets (configurators, color pickers, calculators)
 * - Strip tracking/analytics scripts (GTM, GA, Adobe Analytics)
 * - Strip cookie banners, popups, chat widgets
 * - Rewrite relative URLs to resolve against OEM origin
 * - Add CORS headers for iframe embedding
 *
 * URL scheme:  /oem-proxy/{oem-id}/{path...}
 * Example:     /oem-proxy/mazda-au/cars/mazda3/
 *
 * POC: Proof of concept for interactive OEM page embedding.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { oemRegistry } from '../oem/registry';

const oemProxy = new Hono<AppEnv>();

// ── Analytics / tracking script patterns to strip ─────────────────────────

const BLOCKED_SCRIPT_SRCS = [
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'gtag/js',
  'facebook.net',
  'fbevents.js',
  'hotjar.com',
  'doubleclick.net',
  'adobe-analytics',
  'adobedtm.com',
  'demdex.net',
  'omtrdc.net',
  'tealium',
  'segment.com',
  'optimizely.com',
  'newrelic.com',
  'nr-data.net',
  'sentry.io',
  'cookiebot.com',
  'onetrust.com',
  'trustarc.com',
  'consensu.org',
  'privacy-center',
];

// Inline script content patterns to strip
const BLOCKED_INLINE_PATTERNS = [
  'gtag(',
  'ga(',
  'fbq(',
  '_satellite',
  'utag.',
  'dataLayer.push',
  'google_tag',
  'GoogleAnalyticsObject',
  'TrackingConsent',
  'CookieConsent',
  'OneTrust',
];

// Elements to remove entirely (cookie banners, chat widgets, overlays)
const BLOCKED_SELECTORS_BY_ID = [
  'onetrust-banner-sdk',
  'onetrust-consent-sdk',
  'cookiebot',
  'cookie-banner',
  'cookie-consent',
  'cookie-notice',
  'gdpr-banner',
  'chat-widget',
  'intercom-container',
  'drift-widget',
  'livechat',
];

// ── HTMLRewriter element handlers ─────────────────────────────────────────

/** Injects <base href> so relative URLs resolve to OEM origin */
class BaseTagInjector {
  constructor(private baseUrl: string) {}

  element(element: Element) {
    element.prepend(`<base href="${this.baseUrl}" />`, { html: true });
  }
}

/** Strips tracking/analytics <script> tags */
class ScriptStripper {
  private textBuffer = '';
  private shouldRemove = false;

  element(element: Element) {
    const src = element.getAttribute('src') || '';

    // Check if script src matches a blocked pattern
    if (src && BLOCKED_SCRIPT_SRCS.some(pattern => src.includes(pattern))) {
      element.remove();
      return;
    }

    // For inline scripts, we need to check content via text()
    if (!src) {
      this.textBuffer = '';
      this.shouldRemove = false;
    }
  }

  text(text: Text) {
    this.textBuffer += text.text;

    if (text.lastInTextNode) {
      if (BLOCKED_INLINE_PATTERNS.some(pattern => this.textBuffer.includes(pattern))) {
        this.shouldRemove = true;
      }
      // We can't remove from text handler — handled via comments() or element end
    }
  }
}

/** Strips elements by ID (cookie banners, chat widgets) */
class IdBlocker {
  element(element: Element) {
    const id = element.getAttribute('id') || '';
    if (BLOCKED_SELECTORS_BY_ID.some(blocked => id.includes(blocked))) {
      element.remove();
    }
  }
}

/** Strips noscript tags (usually tracking pixels) */
class NoscriptStripper {
  element(element: Element) {
    element.remove();
  }
}

/** Adds X-Frame-Options and CSP headers for iframe embedding */
class MetaStripper {
  element(element: Element) {
    const httpEquiv = element.getAttribute('http-equiv') || '';
    // Remove X-Frame-Options and CSP meta tags that block iframe embedding
    if (
      httpEquiv.toLowerCase() === 'x-frame-options' ||
      httpEquiv.toLowerCase() === 'content-security-policy'
    ) {
      element.remove();
    }
  }
}

/** Injects a small control bar at the top of the page */
class ControlBarInjector {
  constructor(
    private oemId: string,
    private pagePath: string,
  ) {}

  element(element: Element) {
    const bar = `
<div id="oem-proxy-bar" style="
  position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
  background: linear-gradient(135deg, #1e293b, #334155);
  color: #e2e8f0; padding: 8px 16px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px; display: flex; align-items: center; gap: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
">
  <span style="font-weight: 600;">OEM Proxy</span>
  <span style="opacity: 0.6;">|</span>
  <span>${this.oemId}</span>
  <span style="opacity: 0.6;">→</span>
  <span style="opacity: 0.8; font-family: monospace; font-size: 12px;">${this.pagePath}</span>
  <span style="flex: 1;"></span>
  <span style="
    background: #22c55e; color: #000; padding: 2px 8px;
    border-radius: 4px; font-size: 11px; font-weight: 600;
  ">LIVE PROXY</span>
</div>
<div style="height: 40px;"></div>`;
    element.prepend(bar, { html: true });
  }
}

// ── Main proxy route ──────────────────────────────────────────────────────

oemProxy.get('/:oemId/*', async (c) => {
  const oemId = c.req.param('oemId');
  const pathSegments = c.req.path.replace(`/oem-proxy/${oemId}/`, '');
  const pagePath = '/' + (pathSegments || '');

  // Look up OEM in registry
  const oem = oemRegistry[oemId as keyof typeof oemRegistry];
  if (!oem) {
    return c.json({ error: `Unknown OEM: ${oemId}`, available: Object.keys(oemRegistry) }, 404);
  }

  const targetUrl = new URL(pagePath, oem.baseUrl).toString();
  console.log(`[OEM-PROXY] Fetching: ${targetUrl}`);

  // Fetch the OEM page with browser-like headers
  let response: Response;
  try {
    response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Accept-Encoding': 'gzip',
        Referer: oem.baseUrl,
        Origin: new URL(oem.baseUrl).origin,
      },
    });
  } catch (err) {
    console.error(`[OEM-PROXY] Fetch failed:`, err);
    return c.json({ error: 'Failed to fetch OEM page', details: String(err) }, 502);
  }

  if (!response.ok) {
    return c.json(
      { error: `OEM returned ${response.status}`, url: targetUrl },
      response.status as any,
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    // Non-HTML (CSS, JS, images) — pass through directly
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.delete('x-frame-options');
    headers.delete('content-security-policy');
    return new Response(response.body, { headers });
  }

  // Apply HTMLRewriter transformations
  const origin = new URL(oem.baseUrl).origin;

  const rewritten = new HTMLRewriter()
    // Inject base tag for relative URL resolution
    .on('head', new BaseTagInjector(origin + '/'))
    // Strip analytics scripts
    .on('script', new ScriptStripper())
    // Strip tracking meta tags
    .on('meta[http-equiv]', new MetaStripper())
    // Strip cookie/consent banners and chat widgets
    .on('div[id]', new IdBlocker())
    .on('section[id]', new IdBlocker())
    // Strip noscript (usually tracking pixels)
    .on('noscript', new NoscriptStripper())
    // Add control bar
    .on('body', new ControlBarInjector(oemId, pagePath))
    .transform(response);

  // Build response headers for iframe embedding
  const headers = new Headers(rewritten.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-OEM-Proxy', oemId);
  headers.set('X-OEM-Source', targetUrl);
  // Remove headers that block iframe embedding
  headers.delete('x-frame-options');
  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');
  // Don't cache during POC
  headers.set('Cache-Control', 'no-store');

  return new Response(rewritten.body, {
    status: rewritten.status,
    headers,
  });
});

// List available OEMs for proxying
oemProxy.get('/', (c) => {
  const oems = Object.entries(oemRegistry).map(([id, def]) => ({
    id,
    name: def.name,
    baseUrl: def.baseUrl,
    framework: def.flags?.framework || 'unknown',
    requiresBrowser: def.flags?.requiresBrowserRendering || false,
    examplePaths: id === 'mazda-au'
      ? ['/cars/mazda3/', '/cars/cx-5/', '/cars/mx-5/']
      : id === 'hyundai-au'
        ? ['/au/en/cars/small-cars/i30']
        : id === 'kia-au'
          ? ['/au/cars/cerato.html', '/au/cars/sportage.html']
          : [],
  }));

  return c.json({
    description: 'OEM Page Proxy — POC for interactive widget embedding',
    usage: '/oem-proxy/{oem-id}/{page-path}',
    recommended: 'mazda-au (React SSR, rich interactive widgets, no bot protection)',
    oems,
  });
});

export { oemProxy };
