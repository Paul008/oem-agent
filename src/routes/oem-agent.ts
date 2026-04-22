/**
 * OEM Agent API Routes
 * 
 * Provides HTTP endpoints for:
 * - Triggering manual crawls
 * - Checking crawl status
 * - Triggering design captures
 * - Getting cost estimates
 * - Sales Rep agent interface
 */

import { Hono } from 'hono';
import type { MoltbotEnv, AccessUser } from '../types';
import { createSupabaseClient } from '../utils/supabase';
import { OemAgentOrchestrator } from '../orchestrator';
import { encodeUrl } from './media';
import { proxyImage } from '../utils/image-proxy';
import { AiRouter, TASK_ROUTING, AVAILABLE_MODELS, TASK_TYPE_GROUPS, TASK_TYPE_LABELS } from '../ai/router';
import type { RouteDecision } from '../ai/router';
import { SalesRepAgent } from '../ai/sales-rep';
import { MultiChannelNotifier } from '../notify/slack';
import { allOemIds, getOemDefinition, resolveOemDefinition } from '../oem/registry';
import type { OemId } from '../oem/types';
import onboardingRoutes from './onboarding';
import { rateLimitMiddleware } from '../auth/rate-limit';
import { auditMiddleware } from '../auth/audit-log';

// SSRF protection: validate URL before fetching
function validateUrl(url: string): { valid: boolean; error?: string; parsed?: URL } {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { valid: false, error: 'Invalid URL' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { valid: false, error: 'Only http/https URLs allowed' };
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' ||
      host.startsWith('10.') || host.startsWith('192.168.') || host.endsWith('.local') ||
      host === '169.254.169.254') {
    return { valid: false, error: 'Internal URLs not allowed' };
  }
  // Only block 172.16-31.x.x (private range), not all 172.x
  if (host.startsWith('172.')) {
    const parts = host.split('.');
    const second = parseInt(parts[1]);
    if (second >= 16 && second <= 31) return { valid: false, error: 'Internal URLs not allowed' };
  }
  return { valid: true, parsed };
}

// Shared image download-to-R2 pipeline
async function downloadImagesToR2(
  imageUrls: string[],
  oemId: string,
  slug: string,
  r2Bucket: R2Bucket,
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  const downloads = imageUrls.slice(0, 20).map(async (url) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok || !resp.headers.get('content-type')?.startsWith('image/')) return;
      const buffer = await resp.arrayBuffer();
      if (buffer.byteLength < 500) return;
      const urlPath = new URL(url).pathname;
      const segments = urlPath.split('/').filter(Boolean);
      const imgSegment = segments.find(s => /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(s));
      const filename = imgSegment || segments.pop()?.split('?')[0] || `img-${Date.now()}.jpg`;
      const r2Key = `pages/assets/${oemId}/${slug}/${filename}`;
      await r2Bucket.put(r2Key, buffer, {
        httpMetadata: { contentType: resp.headers.get('content-type') || 'image/jpeg' },
      });
      imageMap.set(url, `/media/${r2Key}`);
    } catch { /* skip failed downloads */ }
  });
  await Promise.all(downloads);
  return imageMap;
}

// Extend AppEnv for OEM agent routes
type OemAgentEnv = {
  Bindings: MoltbotEnv;
  Variables: {
    accessUser?: AccessUser;
    orchestrator?: OemAgentOrchestrator;
  };
};

const app = new Hono<OemAgentEnv>();

// ============================================================================
// Middleware
// ============================================================================

// Initialize orchestrator for each request
app.use('*', async (c, next) => {
  const orchestrator = createOrchestratorFromEnv(c.env);
  c.set('orchestrator', orchestrator);
  await next();
});

// Rate limiting + audit logging for admin routes
app.use('/admin/*', rateLimitMiddleware(100, 60_000));
app.use('/admin/*', auditMiddleware());

// Auth check for admin routes
app.use('/admin/*', async (c, next) => {
  // In production, check Cloudflare Access
  // For now, allow if accessUser is set by auth middleware
  const accessUser = c.get('accessUser');
  if (!accessUser && c.env.DEV_MODE !== 'true') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// Mount onboarding routes (inherits /admin/* auth middleware)
app.route('/admin/onboarding', onboardingRoutes);

// ============================================================================
// Public Routes
// ============================================================================

/**
 * GET /api/v1/oem-agent/health
 * Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/oem-agent/admin/proxy-html?url=...
 * Fetch a webpage and return its HTML for the section capture tool
 */
app.get('/admin/proxy-html', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url parameter required' }, 400);
  const validation = validateUrl(url);
  if (!validation.valid) return c.json({ error: validation.error }, 400);
  const parsed = validation.parsed!;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return c.json({ error: `Fetch failed: ${resp.status}` }, 502);
    const html = await resp.text();
    // Cap response size at 5MB
    if (html.length > 5 * 1024 * 1024) return c.json({ error: 'Page too large (>5MB)' }, 413);
    // Rewrite relative URLs to absolute (attributes + CSS url())
    const origin = parsed.origin;
    const rewritten = html
      .replace(/(href|src|srcset|poster|action)="\/(?!\/)/g, `$1="${origin}/`)
      .replace(/(href|src|srcset|poster|action)='\/(?!\/)/g, `$1='${origin}/`)
      .replace(/url\(\s*'?\//g, `url(${origin}/`)
      .replace(/url\(\s*"\//g, `url("${origin}/`)
      // Strip ALL scripts — we only need rendered HTML + CSS for capture.
      // Scripts crash in srcdoc iframes (Nuxt hydration, tracking, analytics).
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Strip preload links with empty as="" attribute
      .replace(/<link[^>]*rel="preload"[^>]*as=""[^>]*>/gi, '')
      // Strip noscript tags (not needed in capture)
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
    return c.text(rewritten, 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
  } catch (e: any) {
    if (e.name === 'AbortError') return c.json({ error: 'Timeout: page took >10s to load' }, 504);
    return c.json({ error: e.message || 'Fetch failed' }, 502);
  }
});

/**
 * POST /api/v1/oem-agent/admin/capture-screenshot
 * Takes a URL, renders it in a real browser, takes a full-page screenshot,
 * stores it to R2, and returns the media URL.
 */
app.post('/admin/capture-screenshot', async (c) => {
  const body = await c.req.json<{ url: string }>();
  if (!body.url) return c.json({ error: 'url is required' }, 400);
  const urlCheck = validateUrl(body.url);
  if (!urlCheck.valid) return c.json({ error: urlCheck.error }, 400);

  if (!c.env.BROWSER) {
    return c.json({ error: 'Browser rendering not available' }, 503);
  }

  try {
    const puppeteerModule = await import('@cloudflare/puppeteer');
    const puppeteer = puppeteerModule.default;
    const browser = await puppeteer.launch(c.env.BROWSER as any);

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15');

      await page.goto(body.url, { waitUntil: 'networkidle2', timeout: 30_000 });

      // Scroll through the page to trigger lazy-loading
      await page.evaluate(async () => {
        const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
        const step = window.innerHeight;
        const maxScroll = document.body.scrollHeight;
        for (let y = 0; y < maxScroll; y += step) {
          window.scrollTo(0, y);
          await delay(300);
        }
        window.scrollTo(0, 0);
        await delay(500);
      });

      const imageBuffer = await page.screenshot({
        type: 'jpeg',
        quality: 80,
        fullPage: true,
      });

      // Build section map — tag, classes, position, and HTML for each top-level section
      const sectionMap = await page.evaluate(() => {
        const selectors = 'section, article, main > div, body > div > div';
        const elements = document.querySelectorAll(selectors);
        const results: Array<{ tag: string; classes: string; top: number; height: number; html: string }> = [];
        const seen = new Set<Element>();

        for (const el of elements) {
          // Skip tiny elements and duplicates
          if (el.offsetHeight < 50 || el.offsetWidth < 200) continue;
          // Skip if a parent section is already captured
          let skip = false;
          for (const s of seen) { if (s.contains(el) && s !== el) { skip = true; break; } }
          if (skip) continue;
          seen.add(el);

          const html = el.outerHTML;
          results.push({
            tag: el.tagName.toLowerCase(),
            classes: el.className || '',
            top: el.getBoundingClientRect().top + window.scrollY,
            height: el.offsetHeight,
            html: html.length > 200_000 ? html.slice(0, 200_000) : html,
          });
        }
        return results;
      });

      // Store screenshot to R2
      const timestamp = Date.now();
      const r2Key = `screenshots/capture-${timestamp}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await c.env.MOLTBOT_BUCKET.put(r2Key, imageBuffer, {
        httpMetadata: { contentType: 'image/jpeg' },
      });

      const pageHeight = await page.evaluate(() => document.body.scrollHeight);

      return c.json({
        success: true,
        screenshot_url: `/media/${r2Key}`,
        width: 1440,
        height: pageHeight,
        section_map: sectionMap,
      });
    } finally {
      await browser.close();
    }
  } catch (e: any) {
    return c.json({ error: e.message || 'Screenshot failed' }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/smart-capture
 * Takes captured HTML from the section capture tool, parses it deterministically
 * into structured section data, and downloads images to R2.
 * No AI/LLM calls — pure programmatic HTML parsing.
 */
app.post('/admin/smart-capture', async (c) => {
  const body = await c.req.json<{
    html?: string;
    screenshot_base64?: string;
    source_url?: string;
    oem_id?: string;
    model_slug?: string;
    image_urls?: string[];
    root_styles?: Record<string, string>;
    forced_type?: string;
  }>();

  if (!body.html) {
    return c.json({ error: 'html is required. Use iframe capture mode for best results.' }, 400);
  }
  if (body.html.length > 500_000) return c.json({ error: 'HTML too large (>500KB)' }, 413);

  try {
    // Raw HTML → Tailwind mode: send to Claude for conversion
    if (body.forced_type === '_raw_html') {
      const aiRouter = new AiRouter({
        groq: c.env.GROQ_API_KEY,
        together: c.env.TOGETHER_API_KEY,
        moonshot: c.env.MOONSHOT_API_KEY,
        anthropic: c.env.ANTHROPIC_API_KEY,
        google: c.env.GOOGLE_API_KEY,
      }, null);

      const tailwindPrompt = `Convert this HTML to clean Tailwind CSS. Keep ALL content, images, links, and text exactly as-is. Only replace the CSS styling with Tailwind utility classes.

Rules:
1. Output ONLY the converted HTML — no explanation, no markdown fences
2. Use Tailwind utility classes for ALL styling
3. Keep all image src URLs exactly as they are
4. Keep all link href URLs exactly as they are
5. Keep all text content exactly as-is
6. Make it responsive (mobile-first with sm:/md:/lg: breakpoints)
7. Remove all inline styles, replace with Tailwind classes
8. Remove all class names from the original (replace with Tailwind)
9. Strip any <script> tags
10. Use arbitrary values for exact colors: bg-[#C8102E], text-[#1A1A1A]

HTML to convert:

${body.html}`;

      const response = await aiRouter.route({
        taskType: 'bespoke_component',
        prompt: tailwindPrompt,
        maxTokens: 8192,
      });

      let tailwindHtml = response.content || '';
      // Strip markdown fences if present
      tailwindHtml = tailwindHtml.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      // Collect image URLs from the converted HTML for R2 download
      const imageUrls: string[] = [...(body.image_urls || [])];
      const imgMatches = tailwindHtml.matchAll(/(?:src|poster)="(https?:\/\/[^"]+)"/g);
      for (const m of imgMatches) {
        if (!imageUrls.includes(m[1])) imageUrls.push(m[1]);
      }

      let imageMap = new Map<string, string>();

      if (body.oem_id && imageUrls.length > 0) {
        imageMap = await downloadImagesToR2(imageUrls, body.oem_id, body.model_slug || 'captured', c.env.MOLTBOT_BUCKET);

        // Rewrite image URLs in the Tailwind HTML to full worker URLs
        // (v-html doesn't go through Vue's resolveMediaUrl, so /media/ paths don't work)
        const workerOrigin = new URL(c.req.url).origin;
        for (const [origUrl, r2Path] of imageMap) {
          tailwindHtml = tailwindHtml.replaceAll(origUrl, `${workerOrigin}${r2Path}`);
        }
      }

      return c.json({
        type: 'content-block',
        data: {
          title: '',
          content_html: '',
          _generated_html: tailwindHtml,
          animation: 'fade-in',
        },
        images_downloaded: imageMap.size,
        images_found: imageUrls.length,
      });
    }

    // Deterministic parsing — no AI, instant results
    const { parseSection } = await import('../design/section-parser');
    const result = parseSection(body.html);

    // Allow user to override the detected type via right-click menu
    if (body.forced_type && body.forced_type !== '_raw_html') {
      result.type = body.forced_type as any;
    }

    if (!result?.type) {
      return c.json({ error: 'Parser could not identify section type' }, 422);
    }

    const section = result.data || {};

    // Collect image URLs from parser output + explicit client list
    const imageUrls: string[] = [...(body.image_urls || [])];
    function collectImages(obj: any) {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string' && (key.includes('image') || key.includes('url') || key.includes('poster')) && val.startsWith('http')) {
          if (!imageUrls.includes(val)) imageUrls.push(val);
        }
        if (Array.isArray(val)) val.forEach(item => collectImages(item));
        else if (typeof val === 'object') collectImages(val);
      }
    }
    collectImages(section);

    let imageMap = new Map<string, string>();

    if (body.oem_id && imageUrls.length > 0) {
      imageMap = await downloadImagesToR2(imageUrls, body.oem_id, body.model_slug || 'captured', c.env.MOLTBOT_BUCKET);

      // Rewrite image URLs in section data to R2 paths
      function rewriteUrls(obj: any): any {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => rewriteUrls(item));
        const result: any = {};
        for (const [key, val] of Object.entries(obj)) {
          if (typeof val === 'string') {
            if (imageMap.has(val)) {
              result[key] = imageMap.get(val)!;
            } else {
              result[key] = val;
            }
          } else if (typeof val === 'object') {
            result[key] = rewriteUrls(val);
          } else {
            result[key] = val;
          }
        }
        return result;
      }

      const rewritten = rewriteUrls(section);
      Object.assign(section, rewritten);
    }

    // Suggest a default animation based on section type
    const animationDefaults: Record<string, string> = {
      'hero': 'none',
      'heading': 'fade-up',
      'intro': 'fade-up',
      'feature-cards': 'stagger-children',
      'gallery': 'stagger-children',
      'stats': 'count-up',
      'video': 'fade-in',
      'cta-banner': 'fade-up',
      'content-block': 'fade-up',
      'testimonial': 'fade-in',
      'image': 'fade-in',
      'image-showcase': 'fade-in',
      'pricing-table': 'stagger-children',
      'accordion': 'fade-up',
    };
    if (!section.animation) {
      section.animation = animationDefaults[result.type] || 'fade-up';
    }

    return c.json({
      type: result.type,
      data: section,
      images_downloaded: imageMap.size,
      images_found: imageUrls.length,
    });
  } catch (e: any) {
    return c.json({ error: e.message || 'Section parsing failed' }, 500);
  }
});

/**
 * GET /api/v1/oem-agent/oems
 * List all configured OEMs
 */
app.get('/oems', async (c) => {
  // Static registry OEMs
  const staticOems = allOemIds.map(id => {
    const def = getOemDefinition(id);
    return {
      id,
      name: def?.name,
      baseUrl: def?.baseUrl,
      isActive: true,
    };
  });

  // Include dynamically onboarded OEMs from the database
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const { data: dbOems } = await supabase
    .from('oems')
    .select('id, name, base_url, is_active')
    .eq('is_active', true);

  const staticIds = new Set(allOemIds as string[]);
  const dynamicOems = (dbOems || [])
    .filter((o: any) => !staticIds.has(o.id))
    .map((o: any) => ({
      id: o.id,
      name: o.name,
      baseUrl: o.base_url,
      isActive: o.is_active,
    }));

  return c.json({ oems: [...staticOems, ...dynamicOems] });
});

/**
 * GET /api/v1/oem-agent/oems/:oemId
 * Get details for a specific OEM
 */
app.get('/oems/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const def = await resolveOemDefinition(oemId, supabase);

  if (!def) {
    return c.json({ error: 'OEM not found' }, 404);
  }

  return c.json({
    id: def.id,
    name: def.name,
    baseUrl: def.baseUrl,
    config: def.config,
    selectors: def.selectors,
    flags: def.flags,
  });
});

/**
 * GET /api/v1/oem-agent/oems/:oemId/products
 * Get current products for an OEM
 */
app.get('/oems/:oemId/products', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('products')
    .select('id, title, subtitle, availability, price_amount, price_type, body_type, fuel_type, source_url, last_seen_at')
    .eq('oem_id', oemId)
    .eq('availability', 'available')
    .order('title');

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ products: data || [], count: data?.length || 0 });
});

/**
 * GET /api/v1/oem-agent/oems/:oemId/offers
 * Get current offers for an OEM
 */
app.get('/oems/:oemId/offers', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('offers')
    .select('id, title, offer_type, price_amount, saving_amount, validity_raw, applicable_models, last_seen_at')
    .eq('oem_id', oemId)
    .or('validity_end.is.null,validity_end.gte.now()')
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ offers: data || [], count: data?.length || 0 });
});

/**
 * GET /api/v1/oem-agent/oems/:oemId/changes
 * Get recent changes for an OEM
 */
app.get('/oems/:oemId/changes', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const days = parseInt(c.req.query('days') || '7');
  
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('change_events')
    .select('id, entity_type, event_type, severity, summary, created_at')
    .eq('oem_id', oemId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Group by severity
  const bySeverity: Record<string, number> = {};
  data?.forEach((change: any) => {
    bySeverity[change.severity] = (bySeverity[change.severity] || 0) + 1;
  });

  return c.json({ 
    changes: data || [], 
    count: data?.length || 0,
    by_severity: bySeverity,
  });
});

// ============================================================================
// Admin Routes (require authentication)
// ============================================================================

/**
 * GET /api/v1/oem-agent/admin/system-status
 * Run the traffic controller and return system-wide health status.
 */
app.get('/admin/system-status', async (c) => {
  const { executeOrchestratorController } = await import('../sync/orchestrator-controller');
  const supabase = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY });
  const result = await executeOrchestratorController(supabase, c.env.MOLTBOT_BUCKET);
  return c.json(result);
});

/**
 * POST /api/v1/oem-agent/admin/crawl/:oemId
 * Trigger a manual crawl for an OEM
 */
app.post('/admin/crawl/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const orchestrator = c.get('orchestrator');

  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  // Validate OEM (static registry first, then DB for onboarded OEMs)
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const def = await resolveOemDefinition(oemId, supabase);
  if (!def) {
    return c.json({ error: 'OEM not found' }, 404);
  }

  // Return immediately with job ID
  const jobId = crypto.randomUUID();
  const withBrowser = c.req.query('render') === 'true';

  // Trigger crawl in background using waitUntil.
  // skipRender=true by default because HTTP waitUntil budget is ~30s.
  // Pass ?render=true to enable browser rendering (needed for Toyota, VW).
  c.executionCtx.waitUntil(
    orchestrator.crawlOem(oemId, undefined, 'manual', undefined, /* skipRender */ !withBrowser).catch(err => {
      console.error(`[Crawl ${jobId}] Error crawling ${oemId}:`, err);
    })
  );

  return c.json({
    success: true,
    message: `Crawl triggered for ${def.name}${withBrowser ? ' (with browser rendering)' : ' (quick mode — no browser rendering)'}`,
    jobId,
    oemId,
    status: 'running',
  });
});

/**
 * POST /api/v1/oem-agent/admin/crawl
 * Trigger a full crawl for all OEMs
 */
app.post('/admin/crawl', async (c) => {
  const orchestrator = c.get('orchestrator');

  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  // Trigger crawl in background using waitUntil
  c.executionCtx.waitUntil(
    orchestrator.runScheduledCrawl().catch(err => {
      console.error('[Full Crawl] Error:', err);
    })
  );

  return c.json({
    success: true,
    message: 'Full crawl triggered for all OEMs',
    status: 'running',
  });
});

/**
 * POST /api/v1/oem-agent/admin/design-capture/:oemId
 * Trigger a design capture for an OEM
 */
app.post('/admin/design-capture/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const body = await c.req.json<{ pageType?: string }>().catch(() => ({ pageType: undefined }));
  const pageType = body.pageType || 'homepage';

  const orchestrator = c.get('orchestrator');

  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  const result = await orchestrator.triggerDesignCapture(oemId, pageType);

  return c.json(result);
});

/**
 * GET /api/v1/oem-agent/admin/import-runs
 * List recent import runs
 */
app.get('/admin/import-runs', async (c) => {
  const oemId = c.req.query('oemId') as OemId | undefined;
  const limit = parseInt(c.req.query('limit') || '20');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  let query = supabase
    .from('import_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (oemId) {
    query = query.eq('oem_id', oemId);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ importRuns: data || [] });
});

/**
 * GET /api/v1/oem-agent/admin/cost-estimates
 * Get cost estimates for all OEMs
 */
app.get('/admin/cost-estimates', (c) => {
  const orchestrator = c.get('orchestrator');
  const estimates = orchestrator?.getCostEstimates() || [];

  return c.json({ estimates });
});

/**
 * GET /api/v1/oem-agent/admin/source-pages/:oemId
 * View source pages for an OEM (for debugging)
 */
app.get('/admin/source-pages/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('source_pages')
    .select('*')
    .eq('oem_id', oemId)
    .order('last_checked_at', { ascending: true, nullsFirst: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ sourcePages: data || [], count: data?.length || 0 });
});

/**
 * GET /api/v1/oem-agent/admin/discovered-apis/:oemId
 * View discovered APIs for an OEM
 */
app.get('/admin/discovered-apis/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('discovered_apis')
    .select('*')
    .eq('oem_id', oemId)
    .order('reliability_score', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ discoveredApis: data || [], count: data?.length || 0 });
});

/**
 * Fetch detailed vehicle data from Ford pricing page
 */
async function fetchFordVehicleDetails(vehicleCode: string, vehicleName: string): Promise<any> {
  try {
    // Try to fetch from the pricing endpoint
    const pricingUrl = `https://www.ford.com.au/content/ford/au/en_au/home/${vehicleCode.toLowerCase().replace(/_/g, '-')}/pricing.data`;
    
    const response = await fetch(pricingUrl, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Referer': 'https://www.ford.com.au/',
        'Origin': 'https://www.ford.com.au',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    
    if (!response.ok) {
      console.log(`[Ford Detail] No pricing data for ${vehicleName}: ${response.status}`);
      return null;
    }
    
    const body = await response.text();
    const data = JSON.parse(body);
    
    // Extract color options, variants, pricing, and gallery images
    const details: any = {
      colors: [],
      variants: [],
      features: [],
      galleryImages: [],
      pricing: {},
    };
    
    // Look for color data in multiple possible locations
    const colorData = data.colors || data.colours || 
                      data.data?.colors || data.data?.colours ||
                      data.paintOptions || data.paintColours ||
                      data.exteriorColors || data.exteriorColours ||
                      data.colorSwatches || data.colourSwatches ||
                      data.vehicleColors || data.availableColors;
    
    if (Array.isArray(colorData)) {
      for (const color of colorData) {
        if (typeof color === 'string') {
          details.colors.push({ name: color, price: 0 });
          continue;
        }
        
        // Extract swatch image - Ford often uses these fields
        const swatchImage = color.swatchImage || color.swatch || color.thumbnail || 
                           color.image || color.colourImage || color.colorImage ||
                           color.previewImage || color.sampleImage ||
                           (color.images?.[0]) ||
                           (color.swatchImages?.[0]);
        
        const fullImage = color.fullImage || color.vehicleImage || color.renderImage ||
                         color.imageUrl || color.imageURL || color.photo ||
                         (color.images?.[1]) || swatchImage;
        
        details.colors.push({
          name: color.name || color.label || color.colourName || color.colorName || color.title,
          code: color.code || color.id || color.colourCode || color.colorCode || color.swatchCode,
          hex: color.hex || color.colourHex || color.colorHex || color.rgb || color.colourRgb,
          type: color.type || color.category || color.colourType || 
                (color.isPremium ? 'premium' : color.isMetallic ? 'metallic' : 'standard'),
          price: color.price || color.cost || color.colourPrice || color.optionPrice || 
                 color.priceAdjustment || color.additionalCost || 0,
          swatchImage: swatchImage,
          fullImage: fullImage,
          image: swatchImage || fullImage,
          fordColorCode: color.fordColourCode || color.fordColorCode,
          paintType: color.paintType || color.finish || color.colourFinish,
          isPremium: color.isPremium || color.premium || false,
          isMetallic: color.isMetallic || color.metallic || false,
        });
      }
    }
    
    // Look for gallery/images data
    const galleryData = data.gallery || data.images || data.imageGallery ||
                        data.vehicleImages || data.carImages ||
                        data.exteriorImages || data.interiorImages ||
                        data.mediaGallery || data.photoGallery ||
                        data.data?.gallery || data.data?.images;
    
    if (Array.isArray(galleryData)) {
      for (const img of galleryData) {
        if (typeof img === 'string') {
          details.galleryImages.push({ url: img, type: 'gallery' });
          continue;
        }
        
        const imageType = img.type || img.imageType || img.category || 'gallery';
        const isInterior = imageType.toLowerCase().includes('interior') ||
                          (img.tags && img.tags.some((t: string) => t.toLowerCase().includes('interior')));
        
        details.galleryImages.push({
          url: img.url || img.src || img.imageUrl || img.path,
          thumbnail: img.thumbnail || img.thumbUrl || img.preview,
          type: isInterior ? 'interior' : imageType,
          category: img.category || img.section,
          alt: img.alt || img.altText || img.description || img.caption,
          tags: img.tags || img.labels || [],
        });
      }
    }
    
    // Also check for separate interior images
    const interiorData = data.interiorImages || data.interiorGallery || data.cockpitImages;
    if (Array.isArray(interiorData)) {
      for (const img of interiorData) {
        const url = typeof img === 'string' ? img : (img.url || img.src);
        if (!details.galleryImages.some((i: any) => i.url === url)) {
          details.galleryImages.push({
            url: url,
            type: 'interior',
            category: typeof img === 'object' ? (img.category || img.view) : 'interior',
            alt: typeof img === 'object' ? (img.alt || img.description) : null,
          });
        }
      }
    }
    
    // Look for variant/trim data
    if (data.variants || data.trims || data.grades) {
      const variantData = data.variants || data.trims || data.grades || [];
      for (const variant of variantData) {
        details.variants.push({
          code: variant.code,
          name: variant.name || variant.label,
          description: variant.description,
          msrp: variant.msrp,
          driveAwayPrice: variant.driveAwayPrice,
          features: variant.features || [],
        });
      }
    }
    
    // Look for feature highlights
    if (data.features || data.highlights) {
      details.features = data.features || data.highlights || [];
    }
    
    // Look for pricing info
    if (data.pricing) {
      details.pricing = data.pricing;
    }
    
    return details;
  } catch (error) {
    console.error(`[Ford Detail] Error fetching ${vehicleName}:`, error);
    return null;
  }
}

/**
 * POST /api/v1/oem-agent/admin/direct-extract/:oemId
 * Directly extract from known APIs and save to database
 */
app.post('/admin/direct-extract/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  
  if (oemId !== 'ford-au') {
    return c.json({ error: 'Only ford-au supported for direct extract' }, 400);
  }
  
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  
  try {
    // Direct fetch Ford API
    const response = await fetch('https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Referer': 'https://www.ford.com.au/',
        'Origin': 'https://www.ford.com.au',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    
    if (!response.ok) {
      return c.json({ error: 'Ford API failed', status: response.status }, 500);
    }
    
    const body = await response.text();
    const data = JSON.parse(body);
    
    // Extract vehicles with detailed sub-variants
    const vehicles: any[] = [];
    let vehiclesWithDetails = 0;
    
    for (const category of data) {
      const catName = category.category || 'Unknown';
      for (const np of category.nameplates || []) {
        // Extract pricing information
        const pricing = np.pricing || {};
        const minPrice = pricing.min || {};
        const priceAmount = minPrice.priceVat || minPrice.price || null;
        
        // Parse price amount (remove $ and commas)
        let parsedPrice: number | null = null;
        if (priceAmount && typeof priceAmount === 'string') {
          const priceMatch = priceAmount.replace(/[$,]/g, '');
          parsedPrice = parseFloat(priceMatch) || null;
        }
        
        // Fetch detailed vehicle data (colors, variants, pricing)
        const vehicleCode = np.code || '';
        const vehicleName = np.name || '';
        const details = await fetchFordVehicleDetails(vehicleCode, vehicleName);
        if (details) {
          vehiclesWithDetails++;
        }
        
        // Merge API data with detailed data
        const colors = details?.colors || [];
        const variants = details?.variants || [];
        const features = details?.features || [];
        const galleryImages = details?.galleryImages || [];
        const detailedPricing = details?.pricing || {};
        
        // If no detailed variants, use basic models from API
        if (variants.length === 0) {
          for (const model of np.models || []) {
            variants.push({
              code: model.code,
              name: model.name,
              description: model.description,
              bodyStyle: model.bodyStyle,
              engine: model.engine,
              transmission: model.transmission,
              drivetrain: model.drivetrain,
              fuelType: model.fuelType,
              pricing: {
                msrp: model.msrp,
                driveAwayPrice: model.driveAwayPrice,
                priceFrom: model.priceFrom,
              },
            });
          }
        }
        
        // Extract basic features from attributeItemModels if no detailed features
        if (features.length === 0) {
          for (const attr of np.attributeItemModels || []) {
            if (attr.attributeId && attr.attributeId.trim()) {
              features.push(attr.attributeId);
            }
          }
        }
        
        // Build comprehensive meta_json with all sub-variant data
        const metaJson: Record<string, any> = {
          category: catName,
          code: np.code,
          vehicleType: np.vehicleType,
          bodyType: np.bodyType,
          group: np.group,
          // Image information
          image: np.image,
          imgUrlHeader: np.imgUrlHeader,
          imgAltText: np.imgAltText,
          // Color information
          colors: colors,
          colorCount: colors.length,
          // Gallery images (exterior, interior, detail shots)
          galleryImages: galleryImages,
          galleryImageCount: galleryImages.length,
          interiorImages: galleryImages.filter((img: any) => img.type === 'interior'),
          exteriorImages: galleryImages.filter((img: any) => img.type === 'exterior'),
          // CTA information
          additionalCTA: np.additionalCTA,
          additionalLabel: np.additionalLabel,
          exploreLabel: np.exploreLabel,
          // Pricing details
          pricing: {
            min: minPrice,
            parsedAmount: parsedPrice,
            rawString: priceAmount,
            detailed: detailedPricing,
          },
          // Sub-variants/models
          variants: variants,
          variantCount: variants.length,
          // Features
          features: features,
          featureCount: features.length,
          // Additional categories (e.g., color options, trim levels)
          additionalCategories: np.additionalCategories || [],
        };
        
        vehicles.push({
          oem_id: oemId,
          source_url: 'https://www.ford.com.au/',
          title: np.name,
          subtitle: null,
          body_type: catName,
          fuel_type: null,
          availability: 'available',
          price_amount: parsedPrice,
          price_currency: 'AUD',
          price_type: parsedPrice ? 'driveaway' : null,
          price_raw_string: priceAmount,
          disclaimer_text: np.blurbMessage || null,
          key_features: features,
          variants: variants,
          cta_links: np.additionalCTA ? [{ label: np.additionalLabel || 'Build & Price', url: np.additionalCTA }] : [],
          meta_json: metaJson,
          last_seen_at: new Date().toISOString(),
        });
      }
    }
    
    // Insert vehicles (workaround for missing unique constraint)
    let inserted = 0;
    let errors = 0;
    let skipped = 0;
    
    const errorDetails: string[] = [];
    
    // Get existing products first
    const { data: existingProducts } = await supabase
      .from('products')
      .select('title')
      .eq('oem_id', oemId);
    
    const existingTitles = new Set((existingProducts || []).map(p => p.title));
    console.log(`[Direct Extract] Existing products: ${existingTitles.size}`);
    
    for (const vehicle of vehicles) {
      // Skip duplicates in this batch
      if (existingTitles.has(vehicle.title)) {
        skipped++;
        continue;
      }
      
      const { error } = await supabase
        .from('products')
        .insert(vehicle);
      
      if (error) {
        console.error(`[Direct Extract] Error inserting ${vehicle.title}:`, error);
        errors++;
        if (errorDetails.length < 5) {
          errorDetails.push(`${vehicle.title}: ${error.message}`);
        }
      } else {
        inserted++;
        existingTitles.add(vehicle.title); // Mark as existing
      }
    }
    
    // Calculate totals
    const totalVariants = vehicles.reduce((sum, v) => sum + (v.variants?.length || 0), 0);
    const totalFeatures = vehicles.reduce((sum, v) => sum + (v.key_features?.length || 0), 0);
    const totalColors = vehicles.reduce((sum, v) => sum + (v.meta_json?.colors?.length || 0), 0);
    const vehiclesWithPricing = vehicles.filter(v => v.price_amount && v.price_amount > 0).length;
    
    return c.json({
      success: true,
      extracted: vehicles.length,
      inserted,
      skipped,
      errors,
      errorDetails,
      summary: {
        totalVehicles: vehicles.length,
        totalVariants,
        totalFeatures,
        totalColors,
        vehiclesWithPricing,
        vehiclesWithDetails,
      },
      vehicles: vehicles.map(v => ({
        title: v.title,
        price: v.price_amount,
        variantCount: v.variants?.length || 0,
        featureCount: v.key_features?.length || 0,
        colorCount: v.meta_json?.colors?.length || 0,
        variants: v.variants?.map((m: any) => m.name) || [],
        colors: v.meta_json?.colors?.map((c: any) => c.name) || [],
      })),
    });
  } catch (error) {
    console.error('[Direct Extract] Error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/force-crawl/:oemId
 * Force crawl all pages for an OEM (bypasses scheduler check)
 */
app.post('/admin/force-crawl/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const withBrowser = c.req.query('render') === 'true';
  const rehabErrors = c.req.query('rehab') !== 'false'; // default true

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Optionally rehabilitate error'd pages back to active so the crawler retries them.
  let rehabCount = 0;
  if (rehabErrors) {
    const { data: rehabData, error: rehabErr } = await supabase
      .from('source_pages')
      .update({
        status: 'active',
        error_message: null,
        last_checked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('oem_id', oemId)
      .eq('status', 'error')
      .select();
    if (rehabErr) {
      console.error(`[Force Crawl] Rehab failed:`, rehabErr);
      return c.json({ error: rehabErr.message }, 500);
    }
    rehabCount = rehabData?.length || 0;
    console.log(`[Force Crawl] Rehabilitated ${rehabCount} error'd pages for ${oemId}`);
  }

  // Reset last_checked_at for all active pages to force them due
  console.log(`[Force Crawl] Resetting pages for ${oemId}...`);
  const { data: resetData, error: resetError } = await supabase
    .from('source_pages')
    .update({
      last_checked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('oem_id', oemId)
    .eq('status', 'active')
    .select();

  if (resetError) {
    console.error(`[Force Crawl] Reset failed:`, resetError);
    return c.json({ error: resetError.message }, 500);
  }

  console.log(`[Force Crawl] Reset ${resetData?.length || 0} pages for ${oemId}`);

  // Now trigger the crawl
  const orchestrator = c.get('orchestrator');
  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  const jobId = crypto.randomUUID();

  c.executionCtx.waitUntil(
    orchestrator.crawlOem(oemId, undefined, 'manual', undefined, /* skipRender */ !withBrowser).catch(err => {
      console.error(`[Force Crawl ${jobId}] Error crawling ${oemId}:`, err);
    })
  );

  return c.json({
    success: true,
    message: `Force crawl triggered for ${oemId}${withBrowser ? ' (with browser rendering)' : ''}${rehabCount > 0 ? ` — rehabilitated ${rehabCount} error'd pages` : ''}`,
    jobId,
    oemId,
    rehabCount,
    activeCount: resetData?.length || 0,
    status: 'running',
  });
});

/**
 * POST /api/v1/oem-agent/admin/test-crawl
 * Test network capture for a specific URL (debug endpoint)
 */
app.post('/admin/test-crawl', async (c) => {
  const body = await c.req.json<{ url: string }>().catch(() => ({ url: '' }));
  const url = body.url;

  if (!url) {
    return c.json({ error: 'url is required' }, 400);
  }

  console.log(`[Test Crawl] Starting test crawl for ${url}`);

  const networkRequests: any[] = [];
  const networkResponses: any[] = [];

  try {
    // Dynamic import puppeteer
    const puppeteerModule = await import('@cloudflare/puppeteer');
    const puppeteer = puppeteerModule.default;
    const browser = await puppeteer.launch(c.env.BROWSER as any);
    console.log(`[Test Crawl] Browser launched`);

    try {
      const page = await browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
      );

      // Set realistic headers to bypass bot detection
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      });

      // Emulate navigator properties to avoid detection
      await page.evaluateOnNewDocument(() => {
        // Override webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-AU', 'en'],
        });

        // Add chrome property
        (window as any).chrome = { runtime: {} };
      });

      // Enable request interception
      let interceptionEnabled = false;
      try {
        await page.setRequestInterception(true);
        interceptionEnabled = true;
        console.log(`[Test Crawl] Request interception enabled`);
      } catch (err) {
        console.log(`[Test Crawl] Request interception failed: ${err}`);
      }

      // Capture ALL requests
      if (interceptionEnabled) {
        page.on('request', (request) => {
          const reqUrl = request.url();
          const method = request.method();
          const resourceType = request.resourceType();

          networkRequests.push({
            url: reqUrl,
            method,
            resourceType,
          });

          console.log(`[Test Crawl] REQ: ${method} ${resourceType} ${reqUrl.substring(0, 100)}`);
          request.continue();
        });
      }

      // Capture ALL responses
      page.on('response', async (response) => {
        const respUrl = response.url();
        const status = response.status();
        const contentType = response.headers()['content-type'] || '';
        const resourceType = response.request().resourceType();

        const respData: any = {
          url: respUrl,
          status,
          contentType,
          resourceType,
        };

        // Try to capture JSON bodies
        if (contentType.includes('json')) {
          try {
            const body = await response.text();
            respData.bodyLength = body?.length || 0;
            respData.bodyPreview = body?.substring(0, 200);
          } catch (e) {
            respData.bodyError = String(e);
          }
        }

        networkResponses.push(respData);
        console.log(`[Test Crawl] RESP: ${status} ${resourceType} ${contentType} ${respUrl.substring(0, 100)}`);
      });

      // Navigate
      console.log(`[Test Crawl] Navigating to ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      console.log(`[Test Crawl] Navigation complete`);

      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try scrolling
      try {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.log(`[Test Crawl] Scroll error: ${e}`);
      }

      const htmlContent = await page.content();
      const htmlLength = htmlContent.length;
      console.log(`[Test Crawl] Page content: ${htmlLength} chars, Requests: ${networkRequests.length}, Responses: ${networkResponses.length}`);

      // Get page title
      const title = await page.title().catch(() => '');

      // Filter for API-like responses
      const apiResponses = networkResponses.filter((r) =>
        r.contentType?.includes('json') ||
        r.url?.includes('/api/') ||
        r.url?.includes('.data') ||
        r.url?.includes('/content/')
      );

      return c.json({
        success: true,
        url,
        htmlLength,
        htmlPreview: htmlContent.substring(0, 1000), // First 1000 chars of HTML
        title,
        totalRequests: networkRequests.length,
        totalResponses: networkResponses.length,
        interceptionEnabled,
        apiResponses: apiResponses.slice(0, 20), // Limit to first 20
        allRequests: networkRequests.slice(0, 50), // Limit to first 50
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error(`[Test Crawl] Error:`, err);
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      networkRequests: networkRequests.slice(0, 20),
      networkResponses: networkResponses.slice(0, 20),
    }, 500);
  }
});

/**
 * GET /api/v1/oem-agent/admin/test-ford-api
 * Direct test of Ford API from worker
 */
app.get('/admin/test-ford-api', async (c) => {
  try {
    console.log('[Test Ford API] Starting direct fetch');
    
    const response = await fetch('https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.ford.com.au/',
        'Origin': 'https://www.ford.com.au',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    
    console.log(`[Test Ford API] Response status: ${response.status}`);
    
    if (!response.ok) {
      return c.json({ 
        error: 'Ford API request failed', 
        status: response.status,
        statusText: response.statusText 
      }, 500);
    }
    
    const body = await response.text();
    console.log(`[Test Ford API] Body length: ${body.length}`);
    
    let data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      return c.json({ 
        error: 'Failed to parse JSON', 
        bodyPreview: body.substring(0, 500) 
      }, 500);
    }
    
    // Count vehicles
    let totalVehicles = 0;
    const categories: Record<string, number> = {};
    
    if (Array.isArray(data)) {
      for (const cat of data) {
        const catName = cat.category || 'Unknown';
        const count = cat.nameplates?.length || 0;
        categories[catName] = count;
        totalVehicles += count;
      }
    }
    
    return c.json({
      success: true,
      bodyLength: body.length,
      totalVehicles,
      categories,
      sample: data?.[0]?.nameplates?.[0] || null,
    });
  } catch (error) {
    console.error('[Test Ford API] Error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/debug-crawl/:oemId
 * Debug crawl a single page using orchestrator logic and return full results
 */
app.post('/admin/debug-crawl/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const body = await c.req.json<{ url?: string }>().catch(() => ({ url: undefined }));

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Get source pages for this OEM
  const { data: pages, error: pagesError } = await supabase
    .from('source_pages')
    .select('*')
    .eq('oem_id', oemId)
    .eq('status', 'active')
    .limit(1);

  if (pagesError) {
    return c.json({ error: pagesError.message }, 500);
  }

  const page = body.url
    ? { id: 'debug', oem_id: oemId, url: body.url, page_type: 'homepage', status: 'active' }
    : pages?.[0];

  if (!page) {
    return c.json({ error: 'No source pages found' }, 404);
  }

  // Use orchestrator to crawl
  const orchestrator = c.get('orchestrator');
  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  try {
    const result = await orchestrator.crawlPage(oemId, page as any, /* skipRender */ true);

    // Also check what's in discovered_apis and products now
    const { data: apis } = await supabase
      .from('discovered_apis')
      .select('*')
      .eq('oem_id', oemId);

    // Check if products were saved
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, title, source_url')
      .eq('oem_id', oemId)
      .limit(5);

    // Test direct insert to verify database connection
    let testInsertResult = null;
    try {
      const testProduct = {
        id: crypto.randomUUID(),
        oem_id: oemId,
        source_url: 'https://test.example.com/' + Date.now(),
        title: 'Test Product ' + Date.now(),
        availability: 'available',
        price_currency: 'AUD',
        key_features: [],
        variants: [],
        cta_links: [],
        meta_json: {},
        last_seen_at: new Date().toISOString(),
        // Note: created_at is auto-set by the database
      };
      const { error: insertError } = await supabase.from('products').insert(testProduct);
      testInsertResult = insertError ? { error: insertError.message } : { success: true, productId: testProduct.id };
      // Clean up test product
      if (!insertError) {
        await supabase.from('products').delete().eq('id', testProduct.id);
      }
    } catch (e: any) {
      testInsertResult = { exception: e.message };
    }

    return c.json({
      crawlResult: {
        success: result.success,
        url: result.url,
        wasRendered: result.wasRendered,
        smartMode: result.smartMode,
        discoveredApisCount: result.discoveredApis?.length || 0,
        discoveredApis: result.discoveredApis?.slice(0, 10) || [],
        durationMs: result.durationMs,
        error: result.error,
        // Include extraction results for debugging
        extractionResult: result.extractionResult ? {
          productsCount: result.extractionResult.products?.data?.length || 0,
          offersCount: result.extractionResult.offers?.data?.length || 0,
          bannersCount: result.extractionResult.bannerSlides?.data?.length || 0,
          productsMethod: result.extractionResult.products?.method,
          productsConfidence: result.extractionResult.products?.confidence,
          sampleProducts: result.extractionResult.products?.data?.slice(0, 3)?.map((p: any) => ({
            title: p.title,
            body_type: p.body_type,
            source_url: p.source_url,
          })) || [],
        } : null,
        // Page info for debugging
        pageUsed: { id: page.id, url: page.url, page_type: page.page_type },
        // Ford API debug info
        fordApiDebug: (result.extractionResult as any)?.fordApiDebug || null,
      },
      storedApis: apis || [],
      storedApisCount: apis?.length || 0,
      // Products in database after crawl
      productsInDb: products || [],
      productsInDbCount: products?.length || 0,
      productsDbError: productsError?.message || null,
      // Test insert result
      testInsertResult,
    });
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, 500);
  }
});

/**
 * GET /api/v1/oem-agent/admin/ai-usage
 * Get AI inference usage statistics
 */
app.get('/admin/ai-usage', async (c) => {
  const days = parseInt(c.req.query('days') || '30');
  
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('ai_inference_log')
    .select('provider, model, task_type, prompt_tokens, completion_tokens, cost_usd, status')
    .gte('request_timestamp', since.toISOString());

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Aggregate by provider
  const byProvider: Record<string, { calls: number; cost: number; tokens: number }> = {};
  const byTask: Record<string, { calls: number; cost: number }> = {};

  data?.forEach((row: any) => {
    const provider = row.provider;
    if (!byProvider[provider]) {
      byProvider[provider] = { calls: 0, cost: 0, tokens: 0 };
    }
    byProvider[provider].calls++;
    byProvider[provider].cost += row.cost_usd || 0;
    byProvider[provider].tokens += row.prompt_tokens + row.completion_tokens || 0;

    const task = row.task_type;
    if (!byTask[task]) {
      byTask[task] = { calls: 0, cost: 0 };
    }
    byTask[task].calls++;
    byTask[task].cost += row.cost_usd || 0;
  });

  return c.json({
    period: `${days} days`,
    totalCalls: data?.length || 0,
    totalCost: data?.reduce((sum: number, row: any) => sum + (row.cost_usd || 0), 0) || 0,
    byProvider,
    byTask,
  });
});

/**
 * GET /api/v1/oem-agent/admin/products/:oemId
 * View products for an OEM
 */
app.get('/admin/products/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', oemId)
    .order('updated_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ products: data || [], count: data?.length || 0 });
});

/**
 * GET /api/v1/oem-agent/admin/offers/:oemId
 * View offers for an OEM
 */
app.get('/admin/offers/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('oem_id', oemId)
    .order('updated_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ offers: data || [], count: data?.length || 0 });
});

// ============================================================================
// Pages Routes (AI-generated model pages)
// ============================================================================

/**
 * GET /api/v1/oem-agent/pages/stats
 * Get overall statistics for generated pages
 * NOTE: Must be registered BEFORE /pages/:slug to avoid :slug capturing "stats"
 */
app.get('/pages/stats', async (c) => {
  const oemId = c.req.query('oemId') as OemId | undefined;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  try {
    // Get total models count
    let modelsQuery = supabase
      .from('vehicle_models')
      .select('oem_id, slug', { count: 'exact', head: true });

    if (oemId) {
      modelsQuery = modelsQuery.eq('oem_id', oemId);
    }

    const { count: totalModels } = await modelsQuery;

    // Count generated pages in R2
    const prefix = oemId ? `pages/definitions/${oemId}/` : 'pages/definitions/';
    const listing = await c.env.MOLTBOT_BUCKET.list({ prefix });

    // Count pages by checking for latest.json files
    const generatedPages = listing.objects.filter((obj) => obj.key.endsWith('/latest.json')).length;

    // Get last brand ambassador run
    const lastRunKey = 'openclaw/cron-runs/oem-brand-ambassador.json';
    const lastRunObj = await c.env.MOLTBOT_BUCKET.get(lastRunKey);
    let lastRun = null;

    if (lastRunObj) {
      const runs = (await lastRunObj.json()) as any[];
      lastRun = runs && runs.length > 0 ? runs[runs.length - 1] : null;
    }

    return c.json({
      total_models: totalModels || 0,
      generated_pages: generatedPages,
      pending_generation: (totalModels || 0) - generatedPages,
      last_run: lastRun,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * GET /api/v1/oem-agent/pages/:slug
 * Get an AI-generated VehicleModelPage by slug
 */
app.get('/pages/:slug', async (c) => {
  const slug = c.req.param('slug');

  const { PageGenerator } = await import('../design/page-generator');
  const { DesignAgent } = await import('../design/agent');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter({
    groq: c.env.GROQ_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    moonshot: c.env.MOONSHOT_API_KEY,
    anthropic: c.env.ANTHROPIC_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase);

  const designAgent = new DesignAgent(
    c.env.TOGETHER_API_KEY,
    c.env.MOLTBOT_BUCKET,
  );

  const generator = new PageGenerator({
    supabase,
    aiRouter,
    designAgent,
    r2Bucket: c.env.MOLTBOT_BUCKET,
    browser: c.env.BROWSER!,
  });

  const page = await generator.getPageBySlug(slug);

  if (!page) {
    return c.json({ error: 'Page not found', slug }, 404);
  }

  // Attach cost from ai_inference_log if available
  try {
    const { data: costRows } = await supabase
      .from('ai_inference_log')
      .select('cost_usd')
      .eq('task_type', 'page_structuring')
      .eq('status', 'success')
      .or(`metadata_json->>model_slug.eq.${slug.replace(/^[a-z]+-au-/, '')}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (costRows && costRows.length > 0) {
      (page as any).total_cost_usd = costRows[0].cost_usd;
    }
  } catch { /* cost lookup is non-critical */ }

  // Enrich color-picker sections with per-variant color groups from DB
  if (page.content?.sections?.length) {
    // Extract oemId and modelSlug from the page slug (e.g. "foton-au-tunland")
    const pageOemId = page.oem_id || slug.replace(/-[^-]+$/, '');
    const pageModelSlug = slug.replace(/^[a-z]+-[a-z]+-/, '');

    try {
      // Get products for this model
      const { data: modelRows } = await supabase
        .from('vehicle_models')
        .select('name')
        .eq('oem_id', pageOemId)
        .eq('slug', pageModelSlug)
        .limit(1);

      if (modelRows?.[0]) {
        const { data: productRows } = await supabase
          .from('products')
          .select('id, title')
          .eq('oem_id', pageOemId)
          .ilike('title', `%${modelRows[0].name}%`)
          .order('price_amount', { ascending: true });

        const products = productRows || [];
        const productIds = products.map((p: any) => p.id);

        if (productIds.length > 0) {
          const { data: colorRows } = await supabase
            .from('variant_colors')
            .select('product_id, color_name, color_code, swatch_url, hero_image_url, color_type, price_delta, is_standard')
            .in('product_id', productIds)
            .limit(100);

          const oemId = slug.replace(/-[^-]+$/, ''); // foton-au-tunland → foton-au
          const proxy = (url: string | null) => proxyImage(url, { oemId }) || null;

          // Group by product — only create variant_groups when >1 product has colors
          const grouped = new Map<string, any[]>();
          for (const c of colorRows || []) {
            if (!grouped.has(c.product_id)) grouped.set(c.product_id, []);
            const isHex = c.swatch_url?.startsWith('#');
            grouped.get(c.product_id)!.push({
              name: c.color_name,
              code: c.color_code,
              swatch_url: isHex ? null : (c.swatch_url || null),
              hero_image_url: proxy(c.hero_image_url),
              hex: isHex ? c.swatch_url : null,
              price_delta: c.price_delta != null ? Number(c.price_delta) : 0,
              is_standard: c.is_standard ?? false,
              paint_type: c.color_type || 'Solid',
            });
          }

          if (grouped.size > 1) {
            const productMap = new Map(products.map((p: any) => [p.id, p.title]));
            const variantGroups = [...grouped.entries()].map(([pid, colors]) => ({
              variant: productMap.get(pid) || '',
              slug: (productMap.get(pid) || '').toLowerCase().replace(/\s+/g, '-'),
              colors,
            }));

            // Inject variant_groups and upsize flat colors in color-picker sections
            for (const section of page.content.sections) {
              if ((section as any).type === 'color-picker') {
                // Build hex lookup from page's flat colors (R2 data has hex from scraping)
                const hexByName = new Map<string, string>();
                if (Array.isArray((section as any).colors)) {
                  for (const color of (section as any).colors) {
                    if (color.hex && color.name) {
                      hexByName.set(color.name.toLowerCase().replace(/\*$/,'').trim(), color.hex);
                    }
                    color.hero_image_url = proxy(color.hero_image_url);
                  }
                }

                // Merge hex into variant_groups colors (DB may not have hex)
                for (const group of variantGroups) {
                  for (const color of group.colors) {
                    if (!color.hex) {
                      const key = (color.name || '').toLowerCase().replace(/\*$/,'').trim();
                      color.hex = hexByName.get(key) || null;
                    }
                  }
                }

                (section as any).variant_groups = variantGroups;
              }
            }
          }
        }
      }
    } catch { /* color enrichment is non-critical */ }
  }

  // Strip cloned HTML from API response when structured sections exist.
  // The raw HTML stays in R2 for re-extraction but shouldn't be in the API payload.
  const includeRendered = c.req.query('includeRendered') === 'true';
  if (!includeRendered && page.content?.sections?.length) {
    delete (page as any).content.rendered;
  }

  return c.json(page);
});

/**
 * GET /api/v1/oem-agent/recipes/:oemId
 * Public endpoint — returns brand + default recipes for an OEM
 */
app.get('/recipes/:oemId', async (c) => {
  const oemId = c.req.param('oemId');
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const [{ data: brand }, { data: defaults }] = await Promise.all([
    supabase.from('brand_recipes').select('*').eq('oem_id', oemId).eq('is_active', true).order('pattern'),
    supabase.from('default_recipes').select('*').order('pattern'),
  ]);

  return c.json({ oem_id: oemId, brand_recipes: brand ?? [], default_recipes: defaults ?? [] });
});

/**
 * GET /api/v1/oem-agent/pages
 * List generated pages for an OEM
 */
app.get('/pages', async (c) => {
  const oemId = c.req.query('oemId') as OemId | undefined;

  if (!oemId) {
    return c.json({ error: 'oemId query parameter is required' }, 400);
  }

  const { PageGenerator } = await import('../design/page-generator');
  const { DesignAgent } = await import('../design/agent');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter({
    groq: c.env.GROQ_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    moonshot: c.env.MOONSHOT_API_KEY,
    anthropic: c.env.ANTHROPIC_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase);

  const designAgent = new DesignAgent(
    c.env.TOGETHER_API_KEY,
    c.env.MOLTBOT_BUCKET,
  );

  const generator = new PageGenerator({
    supabase,
    aiRouter,
    designAgent,
    r2Bucket: c.env.MOLTBOT_BUCKET,
    browser: c.env.BROWSER!,
  });

  const slugs = await generator.listGeneratedPages(oemId);

  return c.json({ oemId, pages: slugs, count: slugs.length });
});

/**
 * GET /api/v1/oem-agent/pages/:oemId/:modelSlug/should-regenerate
 * Check if a page needs regeneration based on smart regeneration strategy
 */
app.get('/pages/:oemId/:modelSlug/should-regenerate', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');

  const { PageGenerator } = await import('../design/page-generator');
  const { DesignAgent } = await import('../design/agent');
  const { AiRouter } = await import('../ai/router');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter({
    groq: c.env.GROQ_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    moonshot: c.env.MOONSHOT_API_KEY,
    anthropic: c.env.ANTHROPIC_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase);

  const designAgent = new DesignAgent(
    c.env.TOGETHER_API_KEY,
    c.env.MOLTBOT_BUCKET,
  );

  const generator = new PageGenerator({
    supabase,
    aiRouter,
    designAgent,
    r2Bucket: c.env.MOLTBOT_BUCKET,
    browser: c.env.BROWSER!,
  });

  try {
    const decision = await generator.shouldRegeneratePage(oemId, modelSlug);
    return c.json(decision);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/generate-page/:oemId/:modelSlug
 * Manually trigger page generation for a specific model
 */
app.post('/admin/generate-page/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');

  // Accept optional modelOverride in body for A/B testing
  let modelOverride: { provider?: string; model?: string } | undefined;
  try {
    const body = await c.req.json();
    modelOverride = body?.modelOverride;
  } catch { /* no body is fine */ }

  const supabaseForResolve = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const def = await resolveOemDefinition(oemId, supabaseForResolve);
  if (!def) {
    return c.json({ error: 'OEM not found' }, 404);
  }

  const { PageGenerator } = await import('../design/page-generator');
  const { DesignAgent } = await import('../design/agent');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter({
    groq: c.env.GROQ_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    moonshot: c.env.MOONSHOT_API_KEY,
    anthropic: c.env.ANTHROPIC_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase);
  if (modelOverride) await aiRouter.loadModelOverrides();

  const designAgent = new DesignAgent(
    c.env.TOGETHER_API_KEY,
    c.env.MOLTBOT_BUCKET,
  );

  const generator = new PageGenerator({
    supabase,
    aiRouter,
    designAgent,
    r2Bucket: c.env.MOLTBOT_BUCKET,
    browser: c.env.BROWSER!,
  });

  // Derive the Worker's public base URL from the request
  const reqUrl = new URL(c.req.url);
  const workerBaseUrl = `${reqUrl.protocol}//${reqUrl.host}`;

  const result = await generator.generateModelPage(oemId, modelSlug, workerBaseUrl);

  return c.json({
    ...result,
    oemId,
    modelSlug,
  }, result.success ? 200 : 500);
});

/**
 * POST /api/v1/oem-agent/admin/clone-page/:oemId/:modelSlug
 * Capture OEM page via computed-style extraction — pixel-faithful, zero AI cost.
 */
app.post('/admin/clone-page/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');

  // Accept optional source_url override and modelOverride in body
  let bodySourceUrl: string | undefined;
  try {
    const body = await c.req.json();
    bodySourceUrl = body?.source_url;
    // Note: clone-page doesn't use AI, but we accept modelOverride for API consistency
  } catch { /* no body is fine */ }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // For subpage slugs (e.g. haval-h6--performance), look up the parent model
  const dbSlug = modelSlug.includes('--') ? modelSlug.split('--')[0] : modelSlug;

  const { data } = await supabase
    .from('vehicle_models')
    .select('name, source_url')
    .eq('oem_id', oemId)
    .eq('slug', dbSlug)
    .single();

  const sourceUrl = bodySourceUrl || data?.source_url;
  if (!sourceUrl) {
    return c.json({ error: 'No source_url for this model. Provide a source_url in the request body.' }, 400);
  }

  const { PageCapturer } = await import('../design/page-capturer');
  const capturer = new PageCapturer({
    r2Bucket: c.env.MOLTBOT_BUCKET,
    browser: c.env.BROWSER!,
  });

  const result = await capturer.captureModelPage(oemId, modelSlug, sourceUrl, data?.name || modelSlug);
  return c.json({ ...result, oemId, modelSlug }, result.success ? 200 : 500);
});

/**
 * POST /api/v1/oem-agent/admin/structure-page/:oemId/:modelSlug
 * Extract structured sections from a cloned page using Gemini 3.1 Pro.
 */
app.post('/admin/structure-page/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');

  // Accept optional modelOverride in body for A/B testing
  let modelOverride: { provider?: string; model?: string } | undefined;
  try {
    const body = await c.req.json();
    modelOverride = body?.modelOverride;
  } catch { /* no body is fine */ }

  const { PageStructurer } = await import('../design/page-structurer');
  const { DesignMemoryManager } = await import('../design/memory');
  const { SmartPromptBuilder } = await import('../design/prompt-builder');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter({
    groq: c.env.GROQ_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    moonshot: c.env.MOONSHOT_API_KEY,
    anthropic: c.env.ANTHROPIC_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase);
  if (modelOverride) await aiRouter.loadModelOverrides();

  const memoryManager = new DesignMemoryManager(supabase);
  const promptBuilder = new SmartPromptBuilder(memoryManager);

  const structurer = new PageStructurer({
    aiRouter,
    r2Bucket: c.env.MOLTBOT_BUCKET,
    promptBuilder,
    supabase,
  });

  const result = await structurer.structurePage(oemId, modelSlug);

  return c.json({ ...result, oemId, modelSlug }, result.success ? 200 : 500);
});

/**
 * PUT /api/v1/oem-agent/admin/update-sections/:oemId/:modelSlug
 * Save reordered/edited sections back to R2.
 */
app.put('/admin/update-sections/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');

  const body = await c.req.json<{ sections: any[] }>();
  if (!Array.isArray(body.sections)) {
    return c.json({ error: 'sections array is required' }, 400);
  }

  const R2_PREFIX = 'pages/definitions';
  const latestKey = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
  const obj = await c.env.MOLTBOT_BUCKET.get(latestKey);

  if (!obj) {
    return c.json({ error: 'Page not found in R2' }, 404);
  }

  const pageData = await obj.json() as any;
  pageData.content.sections = body.sections;
  pageData.version = (pageData.version || 0) + 1;
  pageData.generated_at = new Date().toISOString();
  // Mark as manually edited — Brand Ambassador will skip this page
  pageData.manually_edited = true;
  pageData.manually_edited_at = new Date().toISOString();

  // Sync hero section images/text back to header.slides so dealer website picks them up
  const heroSection = body.sections.find((s: any) => s.type === 'hero');
  if (heroSection && pageData.header?.slides?.length) {
    const slide = pageData.header.slides[0];
    if (heroSection.desktop_image_url) slide.desktop = heroSection.desktop_image_url;
    if (heroSection.mobile_image_url) slide.mobile = heroSection.mobile_image_url;
    if (heroSection.heading) slide.heading = heroSection.heading;
    if (heroSection.sub_heading) slide.sub_heading = heroSection.sub_heading;
    if (heroSection.cta_text) slide.button = heroSection.cta_text;
  }

  const jsonStr = JSON.stringify(pageData);
  const versionKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;

  await Promise.all([
    c.env.MOLTBOT_BUCKET.put(latestKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'page-builder', oem_id: oemId, model_slug: modelSlug },
    }),
    c.env.MOLTBOT_BUCKET.put(versionKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'page-builder' },
    }),
  ]);

  // Purge dealer network cache so model pages serve fresh data immediately.
  // Fan out to ALL registered webhook subscribers (multi-tenant: multiple dealers per OEM).
  // Falls back to DEALER_NETWORK_URL for backward compat if no webhooks registered.
  c.executionCtx.waitUntil(
    (async () => {
      const purgePayload = { oem_code: oemId, model_slug: modelSlug };
      const hooks = await loadWebhooks(c.env.MOLTBOT_BUCKET);
      const cacheHooks = hooks.filter(h => h.events.includes('page.updated'));

      if (cacheHooks.length > 0) {
        // Fan out to all registered dealer sites
        await Promise.allSettled(cacheHooks.map(h =>
          fetch(h.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(purgePayload),
          }).catch(err => console.error(`[page-builder] Webhook failed ${h.url}:`, err))
        ));
      } else if (c.env.DEALER_NETWORK_URL) {
        // Backward compat: single URL fallback
        await fetch(`${c.env.DEALER_NETWORK_URL}/api/webhooks/purge-model-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(purgePayload),
        }).catch(err => console.error(`[page-builder] Cache purge failed for ${oemId}/${modelSlug}:`, err));
      }
    })()
  );

  return c.json({
    success: true,
    version: pageData.version,
    sections_count: body.sections.length,
  });
});

/**
 * POST /api/v1/oem-agent/admin/import-legacy/:oemId/:modelSlug
 * Import a legacy UIkit vehicle JSON into the page builder.
 * Body: { url: string } — URL to fetch the legacy JSON from
 *   OR { json: object } — the legacy JSON object directly
 */
app.post('/admin/import-legacy/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');
  const body = await c.req.json<{ url?: string; json?: any }>();

  let legacyData: any;

  if (body.url) {
    // Fetch from external URL
    const resp = await fetch(body.url);
    if (!resp.ok) {
      return c.json({ error: `Failed to fetch legacy JSON: ${resp.status} ${resp.statusText}` }, 400);
    }
    legacyData = await resp.json();
  } else if (body.json) {
    legacyData = body.json;
  } else {
    return c.json({ error: 'Provide either "url" or "json" in request body' }, 400);
  }

  const { parseLegacyVehicleJson } = await import('../design/legacy-importer');
  const result = parseLegacyVehicleJson(legacyData);

  if (!result.sections.length) {
    return c.json({ error: 'No sections could be extracted', warnings: result.warnings }, 400);
  }

  // Build the page object and save to R2
  const R2_PREFIX = 'pages/definitions';
  const latestKey = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;

  // Check if a page already exists — merge header if so
  const existing = await c.env.MOLTBOT_BUCKET.get(latestKey);
  const existingData = existing ? await existing.json() as any : null;

  const pageData = {
    id: `${oemId}-${modelSlug}`,
    slug: modelSlug,
    name: result.name,
    oem_id: oemId,
    header: result.header,
    content: {
      rendered: '',
      sections: result.sections,
    },
    form: true,
    variant_link: result.variant_link,
    generated_at: new Date().toISOString(),
    source_url: body.url || 'legacy-import',
    version: existingData ? (existingData.version || 0) + 1 : 1,
    page_type: 'model' as const,
    imported_from: 'legacy-uikit',
    imported_at: new Date().toISOString(),
  };

  const jsonStr = JSON.stringify(pageData);
  const versionKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;

  await Promise.all([
    c.env.MOLTBOT_BUCKET.put(latestKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'legacy-import', oem_id: oemId, model_slug: modelSlug },
    }),
    c.env.MOLTBOT_BUCKET.put(versionKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'legacy-import' },
    }),
  ]);

  return c.json({
    success: true,
    oemId,
    modelSlug,
    sections_count: result.sections.length,
    section_types: result.sections.map(s => s.type),
    warnings: result.warnings,
    version: pageData.version,
  });
});

/**
 * POST /api/v1/oem-agent/admin/preview-legacy-import
 * Preview what sections would be generated from a legacy JSON without saving.
 * Body: { url: string } or { json: object }
 */
app.post('/admin/preview-legacy-import', async (c) => {
  const body = await c.req.json<{ url?: string; json?: any }>();

  let legacyData: any;

  if (body.url) {
    const resp = await fetch(body.url);
    if (!resp.ok) {
      return c.json({ error: `Failed to fetch legacy JSON: ${resp.status} ${resp.statusText}` }, 400);
    }
    legacyData = await resp.json();
  } else if (body.json) {
    legacyData = body.json;
  } else {
    return c.json({ error: 'Provide either "url" or "json" in request body' }, 400);
  }

  const { parseLegacyVehicleJson } = await import('../design/legacy-importer');
  const result = parseLegacyVehicleJson(legacyData);

  return c.json({
    success: true,
    slug: result.slug,
    name: result.name,
    sections_count: result.sections.length,
    sections: result.sections,
    header: result.header,
    warnings: result.warnings,
  });
});

/**
 * POST /api/v1/oem-agent/admin/scrape-oem/:oemId/:modelSlug
 * Scrape a GWM OEM website model page and import into the page builder.
 * Body: { url?: string } — optional override URL (otherwise uses known URL map)
 */
app.post('/admin/scrape-oem/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');
  const body = await c.req.json<{ url?: string }>().catch(() => ({}));

  const { scrapeOemModelPage, GWM_OEM_MODEL_URLS } = await import('../design/oem-scraper');
  const url = body.url || GWM_OEM_MODEL_URLS[modelSlug];

  if (!url) {
    return c.json({ error: `No known OEM URL for model "${modelSlug}". Provide a "url" in the request body.`, known_slugs: Object.keys(GWM_OEM_MODEL_URLS) }, 400);
  }

  // Fetch the OEM page HTML
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OemAgent/1.0)' },
  });
  if (!resp.ok) {
    return c.json({ error: `Failed to fetch OEM page: ${resp.status} ${resp.statusText}`, url }, 400);
  }
  const html = await resp.text();

  const result = scrapeOemModelPage(html, url);

  if (!result.sections.length) {
    return c.json({ error: 'No sections could be extracted from OEM page', url, warnings: result.warnings }, 400);
  }

  // Save to R2
  const R2_PREFIX = 'pages/definitions';
  const latestKey = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
  const existing = await c.env.MOLTBOT_BUCKET.get(latestKey);
  const existingData = existing ? await existing.json() as any : null;

  const pageData = {
    ...(existingData || {}),
    id: `${oemId}-${modelSlug}`,
    slug: modelSlug,
    name: result.name,
    oem_id: oemId,
    header: result.header,
    content: {
      rendered: existingData?.content?.rendered || '',
      sections: result.sections,
    },
    form: true,
    variant_link: existingData?.variant_link || '',
    generated_at: new Date().toISOString(),
    source_url: url,
    version: existingData ? (existingData.version || 0) + 1 : 1,
    page_type: 'model' as const,
    imported_from: 'oem-scraper',
    imported_at: new Date().toISOString(),
    // Protect from Brand Ambassador overwriting
    manually_edited: true,
    manually_edited_at: new Date().toISOString(),
  };

  const jsonStr = JSON.stringify(pageData);
  const versionKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;

  await Promise.all([
    c.env.MOLTBOT_BUCKET.put(latestKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'oem-scraper', oem_id: oemId, model_slug: modelSlug },
    }),
    c.env.MOLTBOT_BUCKET.put(versionKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'oem-scraper' },
    }),
  ]);

  return c.json({
    success: true,
    oemId,
    modelSlug,
    source_url: url,
    sections_count: result.sections.length,
    section_types: result.sections.map(s => s.type),
    warnings: result.warnings,
    version: pageData.version,
  });
});

/**
 * POST /api/v1/oem-agent/admin/scrape-gac/:oemId/:modelSlug
 * Scrape a GAC OEM model page via its Nuxt _payload.json endpoint and import into the page builder.
 * Body: { path?: string } — optional path override (e.g. "/hatchback/aion-ut"); defaults to the GAC_MODEL_PATHS map.
 */
app.post('/admin/scrape-gac/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');
  const body = await c.req.json<{ path?: string }>().catch(() => ({}));

  const { scrapeGacModelPage, GAC_MODEL_PATHS } = await import('../design/gac-scraper');
  const path = body.path || GAC_MODEL_PATHS[modelSlug];

  if (!path) {
    return c.json({ error: `No known GAC path for model "${modelSlug}". Provide a "path" in the request body (e.g. "/hatchback/aion-ut").`, known_slugs: Object.keys(GAC_MODEL_PATHS) }, 400);
  }

  let result;
  try {
    result = await scrapeGacModelPage(path);
  } catch (err) {
    return c.json({ error: (err as Error).message, path }, 400);
  }

  if (!result.sections.length) {
    return c.json({ error: 'No sections could be extracted from GAC page', path, warnings: result.warnings }, 400);
  }

  // Save to R2
  const R2_PREFIX = 'pages/definitions';
  const latestKey = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
  const existing = await c.env.MOLTBOT_BUCKET.get(latestKey);
  const existingData = existing ? await existing.json() as any : null;

  const pageData = {
    ...(existingData || {}),
    id: `${oemId}-${modelSlug}`,
    slug: modelSlug,
    name: result.name,
    oem_id: oemId,
    header: result.header,
    content: {
      rendered: existingData?.content?.rendered || '',
      sections: result.sections,
    },
    form: true,
    variant_link: existingData?.variant_link || '',
    generated_at: new Date().toISOString(),
    source_url: result.source_url,
    version: existingData ? (existingData.version || 0) + 1 : 1,
    page_type: 'model' as const,
    imported_from: 'gac-scraper',
    imported_at: new Date().toISOString(),
    manually_edited: true,
    manually_edited_at: new Date().toISOString(),
  };

  const jsonStr = JSON.stringify(pageData);
  const versionKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;

  await Promise.all([
    c.env.MOLTBOT_BUCKET.put(latestKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'gac-scraper', oem_id: oemId, model_slug: modelSlug },
    }),
    c.env.MOLTBOT_BUCKET.put(versionKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'gac-scraper' },
    }),
  ]);

  return c.json({
    success: true,
    oemId,
    modelSlug,
    source_url: result.source_url,
    sections_count: result.sections.length,
    section_types: result.sections.map(s => s.type),
    warnings: result.warnings,
    version: pageData.version,
  });
});

/**
 * POST /api/v1/oem-agent/admin/preview-gac-scrape
 * Preview what sections would be scraped from a GAC OEM page without saving.
 * Body: { path?: string, model_slug?: string }
 */
app.post('/admin/preview-gac-scrape', async (c) => {
  const body = await c.req.json<{ path?: string; model_slug?: string }>().catch(() => ({}));
  const { scrapeGacModelPage, GAC_MODEL_PATHS } = await import('../design/gac-scraper');
  const path = body.path || (body.model_slug ? GAC_MODEL_PATHS[body.model_slug] : null);

  if (!path) {
    return c.json({ error: 'Provide "path" or "model_slug" in request body', known_slugs: Object.keys(GAC_MODEL_PATHS) }, 400);
  }

  try {
    const result = await scrapeGacModelPage(path);
    return c.json({
      success: result.success,
      source_url: result.source_url,
      slug: result.slug,
      name: result.name,
      sections_count: result.sections.length,
      section_types: result.sections.map(s => s.type),
      sections: result.sections,
      header: result.header,
      warnings: result.warnings,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message, path }, 400);
  }
});

/**
 * POST /api/v1/oem-agent/admin/preview-oem-scrape
 * Preview what sections would be scraped from a GWM OEM page without saving.
 * Body: { url?: string, model_slug?: string }
 */
app.post('/admin/preview-oem-scrape', async (c) => {
  const body = await c.req.json<{ url?: string; model_slug?: string }>().catch(() => ({}));

  const { scrapeOemModelPage, GWM_OEM_MODEL_URLS } = await import('../design/oem-scraper');
  const url = body.url || (body.model_slug ? GWM_OEM_MODEL_URLS[body.model_slug] : null);

  if (!url) {
    return c.json({ error: 'Provide "url" or "model_slug" in request body', known_slugs: Object.keys(GWM_OEM_MODEL_URLS) }, 400);
  }

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OemAgent/1.0)' },
  });
  if (!resp.ok) {
    return c.json({ error: `Failed to fetch OEM page: ${resp.status} ${resp.statusText}`, url }, 400);
  }
  const html = await resp.text();

  const result = scrapeOemModelPage(html, url);

  return c.json({
    success: true,
    source_url: url,
    slug: result.slug,
    name: result.name,
    sections_count: result.sections.length,
    sections: result.sections,
    header: result.header,
    warnings: result.warnings,
  });
});

/**
 * POST /api/v1/oem-agent/admin/upload-media/:oemId/:modelSlug
 * Upload a media file (image/video) to R2 for use in page sections.
 */
app.post('/admin/upload-media/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId');
  const modelSlug = c.req.param('modelSlug');

  const ALLOWED_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm',
  ]);
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Invalid multipart/form-data' }, 400);
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'file field is required' }, 400);
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return c.json({ error: `Unsupported file type: ${file.type}` }, 400);
  }

  const isVideo = file.type.startsWith('video/');
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    return c.json({ error: `File too large (max ${maxSize / 1024 / 1024}MB)` }, 400);
  }

  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
  const filename = `${Date.now()}-${sanitized}`;
  const r2Key = `pages/assets/${oemId}/${modelSlug}/${filename}`;

  await c.env.MOLTBOT_BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { oem_id: oemId, model_slug: modelSlug, original_name: file.name },
  });

  return c.json({
    success: true,
    url: `/media/pages/assets/${oemId}/${modelSlug}/${filename}`,
    filename,
    size: file.size,
    type: file.type,
  });
});

/**
 * GET /api/v1/oem-agent/admin/list-media/:oemId
 * List uploaded media files from R2 for a given OEM.
 * Optional query params: ?modelSlug=xxx&cursor=xxx
 */
app.get('/admin/list-media/:oemId', async (c) => {
  const oemId = c.req.param('oemId');
  const modelSlug = c.req.query('modelSlug');
  const cursor = c.req.query('cursor') || undefined;

  const prefix = modelSlug
    ? `pages/assets/${oemId}/${modelSlug}/`
    : `pages/assets/${oemId}/`;

  const listing = await c.env.MOLTBOT_BUCKET.list({ prefix, cursor, limit: 1000 });

  const items = listing.objects.map((obj) => {
    const parts = obj.key.split('/');
    const filename = parts[parts.length - 1];
    const objModelSlug = parts.length >= 4 ? parts[3] : '';
    // Parse timestamp from filename prefix: {Date.now()}-{sanitized_name}
    const dashIdx = filename.indexOf('-');
    const ts = dashIdx > 0 ? Number(filename.slice(0, dashIdx)) : 0;

    return {
      key: obj.key,
      url: `/media/${obj.key}`,
      filename,
      size: obj.size,
      contentType: obj.httpMetadata?.contentType || '',
      modelSlug: objModelSlug,
      uploadedAt: ts > 0 ? new Date(ts).toISOString() : obj.uploaded?.toISOString() || '',
    };
  });

  return c.json({
    success: true,
    items,
    cursor: listing.truncated ? listing.cursor : null,
  });
});

/**
 * POST /api/v1/oem-agent/admin/regenerate-section/:oemId/:modelSlug
 * Regenerate a single section via Gemini.
 */
app.post('/admin/regenerate-section/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');

  const body = await c.req.json<{ sectionId: string; sectionType: string }>();
  if (!body.sectionId || !body.sectionType) {
    return c.json({ error: 'sectionId and sectionType are required' }, 400);
  }

  const { PageStructurer } = await import('../design/page-structurer');
  const { DesignMemoryManager } = await import('../design/memory');
  const { SmartPromptBuilder } = await import('../design/prompt-builder');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter({
    groq: c.env.GROQ_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    moonshot: c.env.MOONSHOT_API_KEY,
    anthropic: c.env.ANTHROPIC_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase);

  const memoryManager = new DesignMemoryManager(supabase);
  const promptBuilder = new SmartPromptBuilder(memoryManager);

  const structurer = new PageStructurer({
    aiRouter,
    r2Bucket: c.env.MOLTBOT_BUCKET,
    promptBuilder,
    supabase,
  });

  const result = await structurer.regenerateSection(oemId, modelSlug, body.sectionId, body.sectionType);

  if (!result.success) {
    return c.json({ error: result.error, ...result }, 500);
  }

  // Find the regenerated section
  const section = result.page?.content?.sections?.find((s: any) => s.id === body.sectionId);

  return c.json({
    success: true,
    section,
    version: result.page?.version,
    cost_usd: result.gemini_cost_usd,
    tokens_used: result.gemini_tokens_used,
    structuring_time_ms: result.structuring_time_ms,
  });
});

/**
 * PUT /api/v1/oem-agent/admin/screenshot/:oemId/:modelSlug
 * Upload a pre-captured screenshot for page generation pipeline.
 * Accepts raw PNG body (Content-Type: image/png).
 */
app.put('/admin/screenshot/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');

  const supabaseForResolve = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const def = await resolveOemDefinition(oemId, supabaseForResolve);
  if (!def) {
    return c.json({ error: 'OEM not found' }, 404);
  }

  const imageData = await c.req.arrayBuffer();
  if (!imageData || imageData.byteLength < 1000) {
    return c.json({ error: 'No image data or image too small' }, 400);
  }

  const r2Key = `pages/captures/${oemId}/${modelSlug}/desktop.png`;
  await c.env.MOLTBOT_BUCKET.put(r2Key, imageData, {
    httpMetadata: { contentType: 'image/png' },
    customMetadata: {
      oem_id: oemId,
      model_slug: modelSlug,
      uploaded_at: new Date().toISOString(),
      source: 'manual-upload',
    },
  });

  return c.json({
    success: true,
    r2_key: r2Key,
    size_bytes: imageData.byteLength,
    message: `Screenshot uploaded for ${oemId}/${modelSlug}. Run generate-page to use it.`,
  });
});

/**
 * GET /api/v1/oem-agent/admin/debug-screenshot/:oemId/:modelSlug
 * Check if pre-captured screenshot exists in R2
 */
app.get('/admin/debug-screenshot/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId');
  const modelSlug = c.req.param('modelSlug');
  const r2Key = `pages/captures/${oemId}/${modelSlug}/desktop.png`;
  try {
    const obj = await c.env.MOLTBOT_BUCKET.head(r2Key);
    if (!obj) {
      return c.json({ exists: false, r2Key });
    }
    return c.json({
      exists: true,
      r2Key,
      size: obj.size,
      contentType: obj.httpMetadata?.contentType,
      uploaded: obj.uploaded?.toISOString(),
      customMetadata: obj.customMetadata,
    });
  } catch (e) {
    return c.json({ error: String(e), r2Key }, 500);
  }
});

/**
 * GET /api/v1/oem-agent/admin/debug-moonshot
 * Test Moonshot API connectivity from Worker
 */
app.get('/admin/debug-moonshot', async (c) => {
  const key = c.env.MOONSHOT_API_KEY;
  const hasKey = !!key;
  const keyPrefix = key ? key.substring(0, 8) + '...' : 'MISSING';

  try {
    const resp = await fetch('https://api.moonshot.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    const body = await resp.text();
    return c.json({
      hasKey,
      keyPrefix,
      status: resp.status,
      models: resp.ok ? JSON.parse(body) : body,
    });
  } catch (e) {
    return c.json({
      hasKey,
      keyPrefix,
      error: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});

// ============================================================================
// Recipes API
// ============================================================================

app.get('/recipes/:oemId', async (c) => {
  const oemId = c.req.param('oemId');
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Fetch OEM-specific recipes
  const { data: brandRecipes } = await supabase
    .from('brand_recipes')
    .select('id, oem_id, pattern, variant, label, resolves_to, defaults_json')
    .eq('oem_id', oemId)
    .eq('is_active', true)
    .order('pattern');

  // Fetch default recipes
  const { data: defaultRecipes } = await supabase
    .from('default_recipes')
    .select('id, pattern, variant, label, resolves_to, defaults_json')
    .order('pattern');

  // Merge: OEM recipes override defaults for matching pattern+variant
  const oemKeys = new Set((brandRecipes ?? []).map(r => `${r.pattern}:${r.variant}`));
  const merged = [
    ...(brandRecipes ?? []).map(r => ({ ...r, source: 'brand' as const })),
    ...(defaultRecipes ?? [])
      .filter(r => !oemKeys.has(`${r.pattern}:${r.variant}`))
      .map(r => ({ ...r, oem_id: null, source: 'default' as const })),
  ];

  return c.json({ recipes: merged, oem_id: oemId });
});

app.get('/admin/brand-tokens/:oemId', async (c) => {
  const oemId = c.req.param('oemId')
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  const { data } = await supabase
    .from('brand_tokens')
    .select('tokens_json')
    .eq('oem_id', oemId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return c.json(data?.tokens_json ?? null)
});

app.get('/admin/style-guide/:oemId', async (c) => {
  const oemId = c.req.param('oemId')
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  const [
    { data: tokenRow },
    { data: brandRecipes },
    { data: defaultRecipes },
    { data: oem },
  ] = await Promise.all([
    supabase
      .from('brand_tokens')
      .select('tokens_json')
      .eq('oem_id', oemId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('brand_recipes')
      .select('*')
      .eq('oem_id', oemId)
      .eq('is_active', true)
      .order('pattern'),
    supabase
      .from('default_recipes')
      .select('*')
      .order('pattern'),
    supabase
      .from('oems')
      .select('id, name')
      .eq('id', oemId)
      .single(),
  ])

  return c.json({
    oem_id: oemId,
    oem_name: oem?.name ?? oemId,
    brand_tokens: tokenRow?.tokens_json ?? null,
    brand_recipes: brandRecipes ?? [],
    default_recipes: defaultRecipes ?? [],
  })
});

app.get('/admin/recipes', async (c) => {
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  const [{ data: brand }, { data: defaults }] = await Promise.all([
    supabase.from('brand_recipes').select('*').order('pattern').order('label'),
    supabase.from('default_recipes').select('*').order('pattern').order('label'),
  ])

  return c.json({ brand_recipes: brand ?? [], default_recipes: defaults ?? [] })
});

app.delete('/admin/recipes/:id', async (c) => {
  const id = c.req.param('id')
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  const { error } = await supabase.from('brand_recipes').delete().eq('id', id)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
});

app.post('/admin/recipes', async (c) => {
  const body = await c.req.json<{
    oem_id: string
    pattern: string
    variant: string
    label: string
    resolves_to: string
    defaults_json: Record<string, any>
  }>();

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data, error } = await supabase
    .from('brand_recipes')
    .upsert({
      oem_id: body.oem_id,
      pattern: body.pattern,
      variant: body.variant,
      label: body.label,
      resolves_to: body.resolves_to,
      defaults_json: body.defaults_json,
      is_active: true,
    }, { onConflict: 'oem_id,pattern,variant' })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

app.post('/admin/recipes/extract', async (c) => {
  const body = await c.req.json<{ url: string; oem_id: string; provider?: 'gemini' | 'workers_ai' }>();

  if (!body.url || !body.oem_id) {
    return c.json({ error: 'url and oem_id are required' }, 400);
  }

  try {
    const { RecipeExtractor } = await import('../design/recipe-extractor');
    const extractor = new RecipeExtractor({
      browser: c.env.BROWSER!,
      googleApiKey: c.env.GOOGLE_API_KEY,
      aiBinding: c.env.AI,
    });

    const result = await extractor.extractRecipes(body.url, body.oem_id as any, body.provider);
    return c.json({
      suggestions: result.suggestions,
      screenshot_base64: result.screenshot_base64,
      model_used: result.model_used,
      url: body.url,
      oem_id: body.oem_id,
    });
  } catch (err: any) {
    console.error('[RecipeExtract] Error:', err.message);
    return c.json({ error: err.message || 'Extraction failed' }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/recipes/upload-thumbnail
 * Upload a recipe thumbnail (base64 JPEG) to R2.
 */
app.post('/admin/recipes/upload-thumbnail', async (c) => {
  const body = await c.req.json<{ oem_id: string; recipe_key: string; image_base64: string }>();
  if (!body.oem_id || !body.recipe_key || !body.image_base64) {
    return c.json({ error: 'oem_id, recipe_key, and image_base64 are required' }, 400);
  }

  const filename = `${body.recipe_key}.jpg`;
  const r2Key = `recipes/thumbnails/${body.oem_id}/${filename}`;
  const imageData = Uint8Array.from(atob(body.image_base64), c => c.charCodeAt(0));

  await c.env.MOLTBOT_BUCKET.put(r2Key, imageData, {
    httpMetadata: { contentType: 'image/jpeg' },
  });

  const url = `${new URL(c.req.url).origin}/media/recipes/thumbnails/${body.oem_id}/${filename}`;
  return c.json({ url });
});

// ============================================================================
// Webhooks
// ============================================================================

interface WebhookEntry { id: string; url: string; events: string[]; created_at: string }

async function loadWebhooks(bucket: R2Bucket): Promise<WebhookEntry[]> {
  try {
    const obj = await bucket.get('config/webhooks.json');
    return obj ? await obj.json() as WebhookEntry[] : [];
  } catch { return []; }
}

async function saveWebhooks(bucket: R2Bucket, hooks: WebhookEntry[]): Promise<void> {
  await bucket.put('config/webhooks.json', JSON.stringify(hooks), { httpMetadata: { contentType: 'application/json' } });
}

async function fireWebhooks(bucket: R2Bucket, event: string, data: Record<string, any>): Promise<void> {
  const hooks = await loadWebhooks(bucket);
  const matching = hooks.filter(h => h.events.includes(event));
  const payload = JSON.stringify({ event, timestamp: new Date().toISOString(), data });
  await Promise.allSettled(matching.map(h =>
    fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }).catch(() => {})
  ));
}

app.get('/admin/webhooks', async (c) => {
  return c.json({ webhooks: await loadWebhooks(c.env.MOLTBOT_BUCKET) });
});

app.post('/admin/webhooks', async (c) => {
  const body = await c.req.json<{ url: string; events: string[] }>();
  if (!body.url || !body.events?.length) return c.json({ error: 'url and events required' }, 400);

  const hooks = await loadWebhooks(c.env.MOLTBOT_BUCKET);
  const entry: WebhookEntry = { id: `wh-${Date.now().toString(36)}`, url: body.url, events: body.events, created_at: new Date().toISOString() };
  hooks.push(entry);
  await saveWebhooks(c.env.MOLTBOT_BUCKET, hooks);
  return c.json({ success: true, webhook: entry });
});

app.delete('/admin/webhooks/:id', async (c) => {
  const id = c.req.param('id');
  const hooks = await loadWebhooks(c.env.MOLTBOT_BUCKET);
  const filtered = hooks.filter(h => h.id !== id);
  await saveWebhooks(c.env.MOLTBOT_BUCKET, filtered);
  return c.json({ success: true });
});

// ============================================================================
// Quality Scoring
// ============================================================================

app.post('/admin/quality/score', async (c) => {
  const body = await c.req.json<{ oem_id: string; component_r2_key?: string; component_html?: string; thumbnail_base64: string }>();
  if (!body.oem_id || !body.thumbnail_base64) {
    return c.json({ error: 'oem_id and thumbnail_base64 are required' }, 400);
  }

  try {
    const { GEMINI_CONFIG, GEMINI_31_CONFIG } = await import('../ai/router');

    const prompt = `Compare these two images. The first is a screenshot from a real OEM automotive website. The second is an AI-generated component meant to replicate that section.

Rate the similarity on a scale of 0-100 where:
- 90-100: Nearly identical layout, colors, and structure
- 70-89: Same general layout with minor differences
- 50-69: Similar concept but noticeable differences
- 30-49: Loosely related but significantly different
- 0-29: Very different

Respond with JSON: { "score": number, "feedback": "brief explanation of differences" }`;

    const model = GEMINI_31_CONFIG.model;
    const url = `${GEMINI_CONFIG.api_base}/models/${model}:generateContent?key=${c.env.GOOGLE_API_KEY}`;

    const parts: any[] = [
      { inlineData: { mimeType: 'image/jpeg', data: body.thumbnail_base64 } },
      { text: prompt },
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512, responseMimeType: 'application/json' },
      }),
    });

    if (!response.ok) {
      return c.json({ error: `Gemini error: ${response.status}` }, 500);
    }

    const data = await response.json() as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return c.json({ error: 'Empty response' }, 500);

    const parsed = JSON.parse(content);
    return c.json({ score: parsed.score, feedback: parsed.feedback, scored_at: new Date().toISOString() });
  } catch (err: any) {
    return c.json({ error: err.message || 'Scoring failed' }, 500);
  }
});

// ============================================================================
// Design Health
// ============================================================================

app.get('/admin/design-health', async (c) => {
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data: tokens } = await supabase
    .from('brand_tokens')
    .select('oem_id, tokens_json, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  const seen = new Set<string>();
  const oems = (tokens ?? []).filter(t => {
    if (seen.has(t.oem_id)) return false;
    seen.add(t.oem_id);
    return true;
  }).map(t => ({
    oem_id: t.oem_id,
    last_crawled: t.tokens_json?.crawled_at || null,
    token_count: Object.keys(t.tokens_json?.colors || {}).length + Object.keys(t.tokens_json?.typography?.scale || {}).length,
    has_fonts: (t.tokens_json?.typography?.font_faces?.length || 0) > 0,
  }));

  return c.json({ oems });
});

app.post('/admin/design-health/check-drift', async (c) => {
  const body = await c.req.json<{ oem_id: string }>();
  if (!body.oem_id) return c.json({ error: 'oem_id required' }, 400);

  try {
    const supabase = createSupabaseClient({
      url: c.env.SUPABASE_URL,
      serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    // Get OEM base URL
    const { data: oem } = await supabase.from('oems').select('base_url').eq('id', body.oem_id).single();
    const url = oem?.base_url || `https://www.${body.oem_id.replace('-au', '')}.com.au`;

    // Crawl
    const { TokenCrawler } = await import('../design/token-crawler');
    const crawler = new TokenCrawler({ browser: c.env.BROWSER! });
    const crawled = await crawler.crawlTokens(url, body.oem_id);

    // Get existing
    const { data: tokenRow } = await supabase
      .from('brand_tokens')
      .select('tokens_json')
      .eq('oem_id', body.oem_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const existing = tokenRow?.tokens_json ?? {};

    // Build diff
    const diff: Array<{ field: string; current: string; crawled: string; changed: boolean }> = [];
    const addDiff = (field: string, current: any, crawledVal: any) => {
      const c = String(current || '—');
      const v = String(crawledVal || '—');
      diff.push({ field, current: c, crawled: v, changed: c !== v && v !== '—' });
    };

    addDiff('colors.primary', existing.colors?.primary, crawled.colors.primary);
    addDiff('colors.background', existing.colors?.background, crawled.colors.background);
    addDiff('colors.text_primary', existing.colors?.text_primary, crawled.colors.text_primary);
    addDiff('colors.cta_fill', existing.colors?.cta_fill, crawled.colors.cta_fill);
    addDiff('typography.font_primary', existing.typography?.font_primary, crawled.typography.font_primary);
    addDiff('buttons.background', existing.buttons?.primary?.background, crawled.buttons.primary.background);
    addDiff('buttons.border_radius', existing.borders?.radius_md, crawled.buttons.primary.border_radius);

    const changeCount = diff.filter(d => d.changed).length;
    const severity = changeCount === 0 ? 'none' : changeCount <= 3 ? 'low' : changeCount <= 6 ? 'medium' : 'high';

    // Slack alert for medium+ drift
    if ((severity === 'medium' || severity === 'high') && c.env.SLACK_WEBHOOK_URL) {
      const changed = diff.filter(d => d.changed).map(d => `${d.field}: ${d.current} → ${d.crawled}`).join('\n');
      await fetch(c.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🎨 Design drift detected: *${body.oem_id}* (${severity})\n${changed}` }),
      }).catch(() => {});
    }

    return c.json({ oem_id: body.oem_id, severity, changes: diff, change_count: changeCount, crawled_at: crawled.crawled_at });
  } catch (err: any) {
    return c.json({ error: err.message || 'Drift check failed' }, 500);
  }
});

// ============================================================================
// Page Templates
// ============================================================================

const PAGE_TEMPLATES = [
  {
    id: 'suv-standard', name: 'SUV Standard', category: 'suv',
    description: 'Hero banner, feature highlights, specs, gallery, and CTA',
    sections: [
      { type: 'hero', defaults: { heading: 'Model Name', sub_heading: 'Starting from $XX,XXX', cta_text: 'Enquire Now', heading_size: '4xl', overlay_position: 'bottom-left', show_overlay: true } },
      { type: 'feature-cards', defaults: { title: 'Key Features', columns: 3, cards: [{ title: 'Performance', description: '', image_url: '' }, { title: 'Safety', description: '', image_url: '' }, { title: 'Technology', description: '', image_url: '' }] } },
      { type: 'tabs', defaults: { title: 'Explore', tabs: [{ label: 'Design', content_html: '', image_url: '' }, { label: 'Performance', content_html: '', image_url: '' }, { label: 'Safety', content_html: '', image_url: '' }] } },
      { type: 'specs-grid', defaults: { title: 'Specifications', categories: [] } },
      { type: 'gallery', defaults: { title: 'Gallery', images: [], layout: 'carousel' } },
      { type: 'cta-banner', defaults: { heading: 'Ready to experience it?', body: 'Book a test drive today.', cta_text: 'Book Now', cta_url: '#' } },
    ],
  },
  {
    id: 'ev-showcase', name: 'EV Showcase', category: 'ev',
    description: 'Range + charging focus, environmental messaging, tech specs',
    sections: [
      { type: 'hero', defaults: { heading: 'All-Electric', sub_heading: 'Zero emissions. Maximum performance.', cta_text: 'Explore Range', heading_size: '5xl', overlay_position: 'center', show_overlay: true } },
      { type: 'feature-cards', defaults: { title: 'Electric Advantages', columns: 4, cards: [{ title: 'Range', description: '' }, { title: 'Charging', description: '' }, { title: 'Performance', description: '' }, { title: 'Sustainability', description: '' }] } },
      { type: 'content-block', defaults: { title: 'Charging Made Simple', content_html: '', layout: 'two-column', image_url: '' } },
      { type: 'specs-grid', defaults: { title: 'Technical Specifications', categories: [] } },
      { type: 'gallery', defaults: { title: 'Gallery', images: [], layout: 'grid' } },
      { type: 'enquiry-form', defaults: { heading: 'Register Your Interest', form_type: 'contact' } },
    ],
  },
  {
    id: 'sedan-classic', name: 'Sedan Classic', category: 'sedan',
    description: 'Elegant layout with design focus and comfort highlights',
    sections: [
      { type: 'hero', defaults: { heading: 'Model Name', sub_heading: 'Refined elegance', cta_text: 'Discover More', heading_size: '4xl', overlay_position: 'bottom-center' } },
      { type: 'intro', defaults: { title: 'Designed to Impress', body_html: '', image_url: '', image_position: 'right' } },
      { type: 'feature-cards', defaults: { title: 'Comfort & Convenience', columns: 3, cards: [{ title: 'Interior', description: '' }, { title: 'Technology', description: '' }, { title: 'Safety', description: '' }] } },
      { type: 'gallery', defaults: { title: 'Gallery', images: [], layout: 'carousel' } },
      { type: 'cta-banner', defaults: { heading: 'Experience the drive', cta_text: 'Book a Test Drive', cta_url: '#' } },
    ],
  },
  {
    id: 'commercial-ute', name: 'Commercial / Ute', category: 'commercial',
    description: 'Towing, payload, and work-ready features',
    sections: [
      { type: 'hero', defaults: { heading: 'Built for Work', sub_heading: 'Tough. Reliable. Ready.', cta_text: 'View Specs', heading_size: '4xl' } },
      { type: 'feature-cards', defaults: { title: 'Work-Ready Features', columns: 3, cards: [{ title: 'Towing Capacity', description: '' }, { title: 'Payload', description: '' }, { title: 'Durability', description: '' }] } },
      { type: 'specs-grid', defaults: { title: 'Specifications', categories: [] } },
      { type: 'content-block', defaults: { title: 'Accessories', content_html: '', layout: 'contained' } },
      { type: 'cta-banner', defaults: { heading: 'Get a quote', cta_text: 'Enquire Now', cta_url: '#' } },
    ],
  },
  {
    id: 'landing-promo', name: 'Landing / Promo', category: 'landing',
    description: 'Promotional landing page with countdown and offers',
    sections: [
      { type: 'hero', defaults: { heading: 'Special Offer', sub_heading: 'Limited time only', cta_text: 'View Offer', heading_size: '5xl', overlay_position: 'center' } },
      { type: 'countdown', defaults: { title: 'Offer Ends', subtitle: "Don't miss out", target_date: '', expired_message: 'This offer has ended.', cta_text: 'Enquire Now' } },
      { type: 'feature-cards', defaults: { title: 'What You Get', columns: 3, cards: [{ title: 'Bonus 1', description: '' }, { title: 'Bonus 2', description: '' }, { title: 'Bonus 3', description: '' }] } },
      { type: 'enquiry-form', defaults: { heading: 'Claim This Offer', form_type: 'contact' } },
    ],
  },
];

app.get('/admin/page-templates', async (c) => {
  // Merge static + custom templates
  let custom: any[] = [];
  try {
    const obj = await c.env.MOLTBOT_BUCKET.get('templates/custom.json');
    if (obj) custom = await obj.json() as any[];
  } catch {}
  return c.json({ templates: [...PAGE_TEMPLATES, ...custom] });
});

app.post('/admin/page-templates/save', async (c) => {
  const body = await c.req.json<{ name: string; category: string; description?: string; oem_id: string; model_slug: string }>();
  if (!body.name || !body.oem_id || !body.model_slug) {
    return c.json({ error: 'name, oem_id, and model_slug are required' }, 400);
  }

  // Read source page
  const r2Key = `pages/definitions/${body.oem_id}/${body.model_slug}/latest.json`;
  const obj = await c.env.MOLTBOT_BUCKET.get(r2Key);
  if (!obj) return c.json({ error: 'Page not found' }, 404);
  const page = await obj.json() as any;

  // Extract section structure
  const sections = (page.content?.sections || []).map((s: any) => ({
    type: s.type,
    defaults: { ...s, type: undefined, id: undefined, order: undefined },
  }));

  const template = {
    id: `custom-${Date.now().toString(36)}`,
    name: body.name,
    category: body.category || 'custom',
    description: body.description || `Custom template from ${body.oem_id}/${body.model_slug}`,
    sections,
    custom: true,
    created_at: new Date().toISOString(),
  };

  // Load existing custom templates
  let custom: any[] = [];
  try {
    const existing = await c.env.MOLTBOT_BUCKET.get('templates/custom.json');
    if (existing) custom = await existing.json() as any[];
  } catch {}

  custom.push(template);
  await c.env.MOLTBOT_BUCKET.put('templates/custom.json', JSON.stringify(custom), {
    httpMetadata: { contentType: 'application/json' },
  });

  return c.json({ success: true, template_id: template.id });
});

app.put('/admin/dealer-overrides/:oemId/:modelSlug', async (c) => {
  const { oemId, modelSlug } = c.req.param();
  const overrides = await c.req.json<{ dealer_name?: string; logo_url?: string; phone?: string; address?: string; special_offer?: string }>();

  const r2Key = `pages/definitions/${oemId}/${modelSlug}/latest.json`;
  const obj = await c.env.MOLTBOT_BUCKET.get(r2Key);
  if (!obj) return c.json({ error: 'Page not found' }, 404);

  const page = await obj.json() as any;
  page.dealer_overrides = { ...page.dealer_overrides, ...overrides };

  await c.env.MOLTBOT_BUCKET.put(r2Key, JSON.stringify(page), {
    httpMetadata: { contentType: 'application/json' },
  });

  return c.json({ success: true, dealer_overrides: page.dealer_overrides });
});

app.get('/admin/dealer-overrides/:oemId/:modelSlug', async (c) => {
  const { oemId, modelSlug } = c.req.param();
  const r2Key = `pages/definitions/${oemId}/${modelSlug}/latest.json`;
  const obj = await c.env.MOLTBOT_BUCKET.get(r2Key);
  if (!obj) return c.json({ error: 'Page not found' }, 404);
  const page = await obj.json() as any;
  return c.json({ dealer_overrides: page.dealer_overrides || {} });
});

app.post('/admin/page-templates/apply', async (c) => {
  const body = await c.req.json<{ template_id: string; oem_id: string; model_slug: string }>();
  if (!body.template_id || !body.oem_id || !body.model_slug) {
    return c.json({ error: 'template_id, oem_id, and model_slug are required' }, 400);
  }

  const template = PAGE_TEMPLATES.find(t => t.id === body.template_id);
  if (!template) return c.json({ error: 'Template not found' }, 404);

  const sections = template.sections.map((s, i) => ({
    ...s.defaults,
    type: s.type,
    id: `section-${s.type}-${i}`,
    order: i,
  }));

  const page = {
    id: `${body.oem_id}-${body.model_slug}`,
    slug: body.model_slug,
    name: body.model_slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    oem_id: body.oem_id,
    header: { slides: [] },
    content: { sections },
    form: null,
    variant_link: null,
    generated_at: new Date().toISOString(),
    source_url: null,
    version: 1,
  };

  const R2_PREFIX = 'pages/definitions';
  const r2Key = `${R2_PREFIX}/${body.oem_id}/${body.model_slug}/latest.json`;
  await c.env.MOLTBOT_BUCKET.put(r2Key, JSON.stringify(page), {
    httpMetadata: { contentType: 'application/json' },
  });

  return c.json({ success: true, slug: body.model_slug, sections: sections.length });
});

/**
 * GET /api/v1/oem-agent/admin/recipe-analytics
 * Recipe coverage stats across all OEMs.
 */
app.get('/admin/recipe-analytics', async (c) => {
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const [{ data: brandRecipes }, { data: defaultRecipes }] = await Promise.all([
    supabase.from('brand_recipes').select('oem_id, pattern').eq('is_active', true),
    supabase.from('default_recipes').select('pattern'),
  ]);

  const patterns = ['hero', 'card-grid', 'split-content', 'media', 'tabs', 'data-display', 'action-bar', 'utility'];

  // Group by OEM
  const byOem: Record<string, Record<string, number>> = {};
  const byPattern: Record<string, number> = {};

  for (const r of brandRecipes ?? []) {
    if (!byOem[r.oem_id]) byOem[r.oem_id] = {};
    byOem[r.oem_id][r.pattern] = (byOem[r.oem_id][r.pattern] || 0) + 1;
    byPattern[r.pattern] = (byPattern[r.pattern] || 0) + 1;
  }

  // Find gaps
  const gaps = Object.entries(byOem).map(([oemId, counts]) => {
    const missing = patterns.filter(p => !counts[p]);
    return missing.length ? { oem_id: oemId, missing_patterns: missing } : null;
  }).filter(Boolean);

  // OEMs with no recipes at all
  const allOems = ['kia-au', 'nissan-au', 'ford-au', 'volkswagen-au', 'mitsubishi-au', 'ldv-au', 'isuzu-au', 'mazda-au', 'kgm-au', 'gwm-au', 'suzuki-au', 'hyundai-au', 'toyota-au', 'subaru-au', 'gmsv-au', 'foton-au', 'gac-au', 'chery-au'];
  for (const oem of allOems) {
    if (!byOem[oem]) {
      gaps.push({ oem_id: oem, missing_patterns: patterns });
    }
  }

  return c.json({
    total_brand: brandRecipes?.length ?? 0,
    total_default: defaultRecipes?.length ?? 0,
    by_oem: byOem,
    by_pattern: byPattern,
    gaps,
    patterns,
  });
});

/**
 * POST /api/v1/oem-agent/admin/tokens/crawl
 * Crawl an OEM site to extract live CSS tokens.
 */
app.post('/admin/tokens/crawl', async (c) => {
  const body = await c.req.json<{ oem_id: string; url: string }>();
  if (!body.oem_id || !body.url) {
    return c.json({ error: 'oem_id and url are required' }, 400);
  }

  try {
    const { TokenCrawler } = await import('../design/token-crawler');
    const crawler = new TokenCrawler({ browser: c.env.BROWSER! });
    const crawled = await crawler.crawlTokens(body.url, body.oem_id);

    // Fetch existing tokens for diff
    const supabase = createSupabaseClient({
      url: c.env.SUPABASE_URL,
      serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    const { data: tokenRow } = await supabase
      .from('brand_tokens')
      .select('tokens_json')
      .eq('oem_id', body.oem_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const existing = tokenRow?.tokens_json ?? {};

    // Build diff
    const diff: Array<{ field: string; current: string; crawled: string; changed: boolean }> = [];
    const addDiff = (field: string, current: any, crawledVal: any) => {
      const c = String(current || '—');
      const v = String(crawledVal || '—');
      diff.push({ field, current: c, crawled: v, changed: c !== v && v !== '—' });
    };

    addDiff('colors.primary', existing.colors?.primary, crawled.colors.primary);
    addDiff('colors.background', existing.colors?.background, crawled.colors.background);
    addDiff('colors.text_primary', existing.colors?.text_primary, crawled.colors.text_primary);
    addDiff('colors.cta_fill', existing.colors?.cta_fill, crawled.colors.cta_fill);
    addDiff('typography.font_primary', existing.typography?.font_primary, crawled.typography.font_primary);
    addDiff('typography.font_secondary', existing.typography?.font_secondary, crawled.typography.font_secondary);
    addDiff('buttons.background', existing.buttons?.primary?.background, crawled.buttons.primary.background);
    addDiff('buttons.border_radius', existing.buttons?.primary?.border_radius || existing.borders?.radius_md, crawled.buttons.primary.border_radius);
    addDiff('spacing.container_max_width', existing.spacing?.container_max_width, crawled.spacing.container_max_width);

    return c.json({ crawled, existing, diff });
  } catch (err: any) {
    console.error('[TokenCrawl] Error:', err.message);
    return c.json({ error: err.message || 'Crawl failed' }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/tokens/apply-crawled
 * Apply crawled tokens to brand_tokens (preserving font_faces).
 */
app.post('/admin/tokens/apply-crawled', async (c) => {
  const body = await c.req.json<{ oem_id: string; crawled: any }>();
  if (!body.oem_id || !body.crawled) {
    return c.json({ error: 'oem_id and crawled are required' }, 400);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data: tokenRow } = await supabase
    .from('brand_tokens')
    .select('tokens_json')
    .eq('oem_id', body.oem_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const existing = tokenRow?.tokens_json ?? {};
  const crawled = body.crawled;

  // Merge: crawled values override, but preserve font_faces and font_cdn_urls from R2
  const merged = {
    ...existing,
    colors: { ...existing.colors, ...crawled.colors },
    typography: {
      ...existing.typography,
      font_primary: crawled.typography.font_primary || existing.typography?.font_primary,
      font_secondary: crawled.typography.font_secondary || existing.typography?.font_secondary,
      scale: { ...existing.typography?.scale, ...crawled.typography.scale },
      // PRESERVE font_faces from R2 hosting
      font_faces: existing.typography?.font_faces || [],
      font_cdn_urls: existing.typography?.font_cdn_urls || [],
    },
    spacing: { ...existing.spacing, ...crawled.spacing },
    borders: { ...existing.borders, ...crawled.borders },
    buttons: { ...existing.buttons, primary: { ...existing.buttons?.primary, ...crawled.buttons.primary } },
  };

  const { error } = await supabase
    .from('brand_tokens')
    .update({ tokens_json: merged })
    .eq('oem_id', body.oem_id)
    .eq('is_active', true);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Count affected pages for auto-regeneration flag
  let affectedPages = 0;
  try {
    const listing = await c.env.MOLTBOT_BUCKET.list({ prefix: `pages/definitions/${body.oem_id}/` });
    affectedPages = listing.objects.filter(o => o.key.endsWith('/latest.json')).length;
    if (affectedPages > 0) {
      console.log(`[AutoRegen] ${body.oem_id}: ${affectedPages} pages may need regeneration`);
    }
  } catch {}

  return c.json({ success: true, affected_pages: affectedPages });
});

/**
 * POST /api/v1/oem-agent/admin/recipes/generate-component
 * Generate an Alpine.js + Tailwind component from a recipe using AI.
 */
app.post('/admin/recipes/generate-component', async (c) => {
  const body = await c.req.json<{ oem_id: string; recipe: any; thumbnail_base64?: string }>();
  if (!body.oem_id || !body.recipe) {
    return c.json({ error: 'oem_id and recipe are required' }, 400);
  }

  try {
    const supabase = createSupabaseClient({
      url: c.env.SUPABASE_URL,
      serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    // Build brand profile from brand_tokens table
    const { data: tokenRow } = await supabase
      .from('brand_tokens')
      .select('tokens_json')
      .eq('oem_id', body.oem_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const tokens = tokenRow?.tokens_json ?? {};
    const brandProfile = {
      brand_tokens: {
        primary_color: tokens.colors?.primary || '',
        secondary_colors: [tokens.colors?.secondary, tokens.colors?.accent].filter(Boolean) as string[],
        font_family: tokens.typography?.font_primary || '',
        border_radius: tokens.borders?.radius || '8px',
        button_style: tokens.buttons?.primary?.background ? `bg:${tokens.buttons.primary.background} text:${tokens.buttons.primary.text_color}` : '',
      },
      extraction_hints: { hero_selectors: [], gallery_selectors: [], tab_selectors: [], known_failures: [], bot_detection: 'none' as const, wait_ms_after_load: 0 },
      quality_history: { avg_quality_score: 0, total_runs: 0, last_run_at: '', common_errors: [] },
      last_updated: new Date().toISOString(),
    };

    // Fetch OEM-specific images (banners + product images) to avoid cross-brand contamination
    const { data: banners } = await supabase
      .from('banners')
      .select('headline, image_url_desktop')
      .eq('oem_id', body.oem_id)
      .not('image_url_desktop', 'is', null)
      .limit(5);

    const { data: products } = await supabase
      .from('products')
      .select('title, source_url')
      .eq('oem_id', body.oem_id)
      .limit(10);

    const oemImages = (banners ?? []).map((b: any) => b.image_url_desktop).filter(Boolean);
    const oemProductNames = (products ?? []).map((p: any) => p.title).filter(Boolean).slice(0, 5);

    // Build section-like object from recipe with OEM media context
    const recipe = body.recipe;
    const section = {
      type: recipe.resolves_to || recipe.pattern || 'feature-cards',
      id: `gen-${Date.now().toString(36)}`,
      order: 0,
      title: recipe.label || '',
      ...recipe.defaults_json,
      // Inject OEM-specific context for the AI
      _oem_context: {
        oem_id: body.oem_id,
        oem_name: body.oem_id.replace('-au', '').replace(/^\w/, (c: string) => c.toUpperCase()),
        image_urls: oemImages,
        product_names: oemProductNames,
      },
    };

    // Instantiate AI router and component generator
    const { AiRouter } = await import('../ai/router');
    const { ComponentGenerator } = await import('../design/component-generator');

    const aiRouter = new AiRouter({
      groq: c.env.GROQ_API_KEY,
      together: c.env.TOGETHER_API_KEY,
      moonshot: c.env.MOONSHOT_API_KEY,
      anthropic: c.env.ANTHROPIC_API_KEY,
      google: c.env.GOOGLE_API_KEY,
    }, supabase);

    const generator = new ComponentGenerator({
      aiRouter,
      r2Bucket: c.env.MOLTBOT_BUCKET,
    });

    const result = await generator.generateComponent(
      body.oem_id as any,
      section as any,
      brandProfile,
      body.thumbnail_base64,
    );

    return c.json(result);
  } catch (err: any) {
    console.error('[GenerateComponent] Error:', err.message);
    return c.json({ success: false, error: err.message || 'Generation failed' }, 500);
  }
});

// ============================================================================
// AI Model Configuration Routes
// ============================================================================

/**
 * GET /api/v1/oem-agent/admin/ai-model-config
 * Read current model routing config (defaults + overrides + available models)
 */
app.get('/admin/ai-model-config', async (c) => {
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  let overrides: Record<string, Partial<RouteDecision>> = {};
  try {
    const { data } = await supabase
      .from('workflow_settings')
      .select('config')
      .eq('id', 'ai-model-routing')
      .single();

    const config = data?.config as Record<string, unknown> | undefined;
    overrides = (config?.ai_model_overrides as Record<string, Partial<RouteDecision>>) || {};
  } catch { /* no overrides yet */ }

  // Build a serialisable version of defaults (strip modelConfig which has internal details)
  const defaults: Record<string, { provider: string; model: string; fallbackProvider?: string; fallbackModel?: string }> = {};
  for (const [key, val] of Object.entries(TASK_ROUTING)) {
    defaults[key] = {
      provider: val.provider,
      model: val.model,
      ...(val.fallbackProvider ? { fallbackProvider: val.fallbackProvider } : {}),
      ...(val.fallbackModel ? { fallbackModel: val.fallbackModel } : {}),
    };
  }

  return c.json({
    defaults,
    overrides,
    availableModels: AVAILABLE_MODELS,
    taskTypeGroups: TASK_TYPE_GROUPS,
    taskTypeLabels: TASK_TYPE_LABELS,
  });
});

/**
 * PUT /api/v1/oem-agent/admin/ai-model-config
 * Save per-task-type model overrides
 */
app.put('/admin/ai-model-config', async (c) => {
  const body = await c.req.json<{
    overrides: Record<string, { provider?: string; model?: string; fallbackProvider?: string; fallbackModel?: string }>;
  }>();

  if (!body.overrides || typeof body.overrides !== 'object') {
    return c.json({ error: 'overrides object is required' }, 400);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Upsert into workflow_settings with id = 'ai-model-routing'
  const { error } = await supabase
    .from('workflow_settings')
    .upsert({
      id: 'ai-model-routing',
      enabled: true,
      priority: 0,
      confidence_threshold: 0,
      config: { ai_model_overrides: body.overrides },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true, overridesCount: Object.keys(body.overrides).length });
});

// ============================================================================
// Sales Rep Agent Routes
// ============================================================================

/**
 * POST /api/v1/oem-agent/sales-rep/chat
 * Chat with the Sales Rep agent
 */
app.post('/sales-rep/chat', async (c) => {
  const body = await c.req.json<{ oemId: OemId; message: string }>();
  
  if (!body.oemId || !body.message) {
    return c.json({ error: 'oemId and message are required' }, 400);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const salesRep = new SalesRepAgent(supabase);

  // Simple command parsing
  const message = body.message.toLowerCase();
  
  if (message.includes('product') || message.includes('vehicle')) {
    const result = await salesRep.getCurrentProducts({ oem_id: body.oemId });
    return c.json(result);
  }

  if (message.includes('offer') || message.includes('deal')) {
    const result = await salesRep.getCurrentOffers({ oem_id: body.oemId });
    return c.json(result);
  }

  if (message.includes('change') || message.includes('update')) {
    const result = await salesRep.getRecentChanges({ oem_id: body.oemId, days: 7 });
    return c.json(result);
  }

  // Default: return available commands
  return c.json({
    response: 'I can help you with: products, offers, recent changes, or generating content. What would you like to know?',
    availableCommands: [
      'products - List current vehicles',
      'offers - Show active promotions',
      'changes - Recent updates',
      'social post - Generate social media content',
      'email - Generate email copy',
    ],
  });
});

/**
 * POST /api/v1/oem-agent/sales-rep/generate
 * Generate content (social post or email)
 */
app.post('/sales-rep/generate', async (c) => {
  const body = await c.req.json<{
    oemId: OemId;
    type: 'social' | 'email';
    platform?: 'facebook' | 'instagram' | 'linkedin' | 'twitter';
    campaignType?: 'new_model' | 'offer' | 'event' | 'clearance';
    topic?: string;
  }>();

  if (!body.oemId || !body.type) {
    return c.json({ error: 'oemId and type are required' }, 400);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const salesRep = new SalesRepAgent(supabase);

  if (body.type === 'social') {
    const result = await salesRep.draftSocialPost({
      oem_id: body.oemId,
      platform: body.platform || 'facebook',
      topic: body.topic || 'latest offers',
    });
    return c.json(result);
  }

  if (body.type === 'email') {
    const result = await salesRep.draftEdmCopy({
      oem_id: body.oemId,
      campaign_type: body.campaignType || 'offer',
    });
    return c.json(result);
  }

  return c.json({ error: 'Invalid type. Use "social" or "email"' }, 400);
});

/**
 * POST /api/v1/oem-agent/admin/enrich-ford/:oemId
 * Enrich Ford products with variants, colors, and gallery using browser capture.
 * Uses headless browser to intercept pricing API responses.
 */
app.post('/admin/enrich-ford/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  
  if (oemId !== 'ford-au') {
    return c.json({ error: 'This endpoint only supports ford-au' }, 400);
  }

  const body = await c.req.json<{ maxVehicles?: number }>().catch(() => ({ maxVehicles: 5 }));
  const maxVehicles = body.maxVehicles || 5;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Get existing Ford products
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*')
    .eq('oem_id', oemId)
    .order('title');

  if (productsError) {
    return c.json({ error: 'Failed to fetch products', details: productsError.message }, 500);
  }

  if (!products || products.length === 0) {
    return c.json({ error: 'No Ford products found in database' }, 404);
  }

  console.log(`[Enrich Ford] Starting enrichment for ${products.length} products, max ${maxVehicles} to process`);

  // Create orchestrator and run enrichment
  const orchestrator = createOrchestratorFromEnv(c.env);
  
  try {
    const { enriched, captureResults } = await orchestrator.enrichFordProductsWithBrowserCapture(
      products.slice(0, maxVehicles)
    );

    // Count variants created
    const baseCount = products.filter(p => 
      enriched.some(e => e.id === p.id)
    ).length;
    const variantCount = enriched.length - baseCount;

    return c.json({
      success: true,
      summary: {
        baseProducts: baseCount,
        variantProducts: variantCount,
        totalProducts: enriched.length,
        vehiclesProcessed: captureResults.length,
        successfulCaptures: captureResults.filter(r => r.success).length,
      },
      captureResults,
      enrichedProducts: enriched.map(p => ({
        title: p.title,
        external_key: p.external_key,
        isVariant: !!p.parent_nameplate,
        parent: p.parent_nameplate,
        variants: p.variants?.length || 0,
        colors: p.meta?.colorCount || 0,
        images: p.meta?.galleryImageCount || 0,
      })),
    });
  } catch (error: any) {
    console.error('[Enrich Ford] Error:', error);
    return c.json({
      error: 'Enrichment failed',
      details: error?.message || 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/capture-ford-pricing
 * Capture Ford pricing API for a specific vehicle using browser.
 */
app.post('/admin/capture-ford-pricing', async (c) => {
  const body = await c.req.json<{
    vehicleCode: string;
    vehicleName: string;
  }>();

  if (!body.vehicleCode || !body.vehicleName) {
    return c.json({ error: 'vehicleCode and vehicleName are required' }, 400);
  }

  const orchestrator = createOrchestratorFromEnv(c.env);

  try {
    const result = await orchestrator['captureFordPricingApiWithBrowser'](
      body.vehicleCode,
      body.vehicleName
    );

    if (!result) {
      return c.json({
        success: false,
        message: 'No pricing data captured',
      });
    }

    // Extract data using existing methods
    const variants = orchestrator['extractVariantsFromPricingData'](result.data, body.vehicleName);
    const colors = orchestrator['extractColorsFromPricingData'](result.data);
    const galleryImages = orchestrator['extractGalleryImagesFromPricingData'](result.data);

    return c.json({
      success: true,
      source: result.source,
      extracted: {
        variants: variants.length,
        colors: colors.length,
        galleryImages: galleryImages.length,
      },
      variants: variants.slice(0, 10), // Limit response size
      colors: colors.slice(0, 10),
      galleryImages: galleryImages.slice(0, 5),
      rawDataKeys: Object.keys(result.data),
    });
  } catch (error: any) {
    console.error('[Capture Ford Pricing] Error:', error);
    return c.json({
      error: 'Capture failed',
      details: error?.message || 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/network-capture
 * Enhanced network capture with response body capture.
 * Uses request queuing to prevent buffer wiping.
 */
app.post('/admin/network-capture', async (c) => {
  const body = await c.req.json<{
    url: string;
    waitAfterLoad?: number;
    urlPatterns?: string[];
    captureBodies?: boolean;
  }>();

  if (!body.url) {
    return c.json({ error: 'url is required' }, 400);
  }

  try {
    const { captureNetworkActivity } = await import('../utils/network-capture');
    
    const result = await captureNetworkActivity(c.env.BROWSER!, body.url, {
      waitAfterLoad: body.waitAfterLoad || 5000,
      urlPatterns: body.urlPatterns || ['.*'],
      captureBodies: body.captureBodies !== false,
    });

    // Build analysis
    const analysis = {
      duration: result.duration,
      totalRequests: result.requests.length,
      totalResponses: result.responses.length,
      jsonResponses: result.jsonResponses.length,
      apiResponses: result.apiResponses.length,
      htmlResponses: result.htmlResponses.length,
      errors: result.errors.length,
      uniqueUrls: result.responsesByUrl.size,
      statusCodes: {} as Record<number, number>,
      contentTypes: {} as Record<string, number>,
      domains: {} as Record<string, number>,
    };

    // Count status codes
    for (const r of result.responses) {
      analysis.statusCodes[r.status] = (analysis.statusCodes[r.status] || 0) + 1;
    }

    // Count content types
    for (const r of result.responses) {
      if (r.contentType) {
        analysis.contentTypes[r.contentType] = (analysis.contentTypes[r.contentType] || 0) + 1;
      }
    }

    // Count domains
    for (const r of result.responses) {
      try {
        const domain = new URL(r.url).hostname;
        analysis.domains[domain] = (analysis.domains[domain] || 0) + 1;
      } catch {
        // Invalid URL
      }
    }

    // Find potential APIs (JSON responses with bodies)
    const potentialApis = result.jsonResponses
      .filter(r => r.status === 200 && r.body && r.body.length > 50)
      .map(r => {
        let parsedPreview = null;
        try {
          const parsed = JSON.parse(r.body!.substring(0, 500));
          parsedPreview = {
            keys: Object.keys(parsed),
            type: Array.isArray(parsed) ? 'array' : 'object',
            length: Array.isArray(parsed) ? parsed.length : undefined,
          };
        } catch (e) {
          // Not JSON
        }

        return {
          url: r.url.substring(0, 120),
          status: r.status,
          contentType: r.contentType,
          bodySize: r.bodyLength,
          bodyPreview: r.body?.substring(0, 300) + (r.body && r.body.length > 300 ? '...' : ''),
          parsedPreview,
        };
      })
      .slice(0, 20);

    return c.json({
      success: true,
      url: body.url,
      analysis,
      potentialApis,
      allJsonResponses: result.jsonResponses.map(r => ({
        url: r.url.substring(0, 100),
        status: r.status,
        contentType: r.contentType,
        bodySize: r.bodyLength,
      })),
      errors: result.errors,
    });

  } catch (error: any) {
    console.error('[Network Capture] Error:', error);
    return c.json({
      error: 'Network capture failed',
      details: error?.message || 'Unknown error',
    }, 500);
  }
});

/**
 * POST /api/v1/oem-agent/admin/capture-ford-advanced
 * Enhanced Ford pricing capture using new network capture utility.
 * Uses request queuing for reliable response body capture.
 */
app.post('/admin/capture-ford-advanced', async (c) => {
  const body = await c.req.json<{
    vehicleCode: string;
    vehicleName: string;
    useChaining?: boolean;
  }>();

  if (!body.vehicleCode || !body.vehicleName) {
    return c.json({ error: 'vehicleCode and vehicleName are required' }, 400);
  }

  try {
    const { captureFordPricing, captureWithChaining } = await import('../utils/network-capture');

    // Primary method: Direct Ford pricing capture
    console.log(`[Capture Ford Advanced] Capturing ${body.vehicleName} pricing data`);
    
    const fordResult = await captureFordPricing(
      c.env.BROWSER!,
      body.vehicleName,
      body.vehicleCode
    );

    const response = {
      success: fordResult.pricingData.length > 0 || fordResult.configData.length > 0,
      vehicleCode: body.vehicleCode,
      vehicleName: body.vehicleName,
      capture: {
        duration: fordResult.result.duration,
        totalRequests: fordResult.result.requests.length,
        totalResponses: fordResult.result.responses.length,
        jsonResponses: fordResult.result.jsonResponses.length,
        apiResponses: fordResult.result.apiResponses.length,
        pricingDataSources: fordResult.pricingData.length,
        configDataSources: fordResult.configData.length,
        tokensExtracted: Object.keys(fordResult.tokens),
        errors: fordResult.result.errors,
      },
      pricingData: fordResult.pricingData.map(p => ({
        url: p.url.substring(0, 100),
        dataKeys: Object.keys(p.data),
      })),
      configData: fordResult.configData.map(c => ({
        url: c.url.substring(0, 100),
        dataKeys: Object.keys(c.data),
      })),
      tokens: fordResult.tokens,
    };

    // Optional: API chaining
    if (body.useChaining && Object.keys(fordResult.tokens).length > 0) {
      console.log(`[Capture Ford Advanced] Attempting API chaining`);
      
      const chainResult = await captureWithChaining(
        c.env.BROWSER!,
        `https://www.ford.com.au/content/ford/au/en_au/home/${body.vehicleCode}/pricing.data`,
        {
          tokenExtractor: () => fordResult.tokens,
          subsequentUrls: [
            `https://www.ford.com.au/api/vehicleconfig/${body.vehicleCode}`,
          ],
          delayBetween: 2000,
        },
        {
          waitAfterLoad: 3000,
          captureBodies: true,
        }
      );

      // @ts-ignore
      response.chaining = {
        success: chainResult.chained.length > 0,
        stepsCompleted: chainResult.chained.length,
        additionalResponses: chainResult.chained.reduce((sum, r) => sum + r.responses.length, 0),
      };
    }

    return c.json(response);

  } catch (error: any) {
    console.error('[Capture Ford Advanced] Error:', error);
    return c.json({
      error: 'Advanced capture failed',
      details: error?.message || 'Unknown error',
    }, 500);
  }
});

// ============================================================================
// Design Memory Endpoints
// ============================================================================

/**
 * GET /api/v1/oem-agent/design-memory/:oemId
 * Get the OEM's accumulated design profile.
 */
app.get('/design-memory/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const { DesignMemoryManager } = await import('../design/memory');

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const memory = new DesignMemoryManager(supabase);
  const profile = await memory.getOemProfile(oemId);

  return c.json({ oemId, profile });
});

/**
 * GET /api/v1/oem-agent/extraction-runs
 * List recent extraction runs, optionally filtered by OEM.
 */
app.get('/extraction-runs', async (c) => {
  const oemId = c.req.query('oemId') as OemId | undefined;
  const limit = parseInt(c.req.query('limit') || '20', 10);

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  let query = supabase
    .from('extraction_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (oemId) {
    query = query.eq('oem_id', oemId);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ runs: data || [], count: data?.length || 0 });
});

// ============================================================================
// Adaptive Pipeline
// ============================================================================

app.post('/admin/adaptive-pipeline/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');

  if (!allOemIds.includes(oemId)) {
    return c.json({ error: `Unknown OEM: ${oemId}` }, 400);
  }

  // Accept optional source_url override and modelOverride in body
  let bodySourceUrl: string | undefined;
  let modelOverride: { provider?: string; model?: string } | undefined;
  try {
    const body = await c.req.json();
    bodySourceUrl = body?.source_url;
    modelOverride = body?.modelOverride;
  } catch { /* no body is fine */ }

  // Look up source URL from vehicle_models
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // For subpage slugs (e.g. haval-h6--performance), look up the parent model
  const dbSlug = modelSlug.includes('--') ? modelSlug.split('--')[0] : modelSlug;

  const { data: model } = await supabase
    .from('vehicle_models')
    .select('name, source_url')
    .eq('oem_id', oemId)
    .eq('slug', dbSlug)
    .single();

  const sourceUrl = bodySourceUrl || model?.source_url;
  if (!sourceUrl) {
    return c.json({ error: `No source URL found for ${oemId}/${modelSlug}. Provide a source_url in the request body.` }, 404);
  }

  const { AdaptivePipeline } = await import('../design/pipeline');

  const aiRouter = new AiRouter({
    groq: c.env.GROQ_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    moonshot: c.env.MOONSHOT_API_KEY,
    anthropic: c.env.ANTHROPIC_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase);
  if (modelOverride) await aiRouter.loadModelOverrides();

  if (!c.env.BROWSER) {
    return c.json({ error: 'BROWSER binding not configured' }, 500);
  }

  const pipeline = new AdaptivePipeline({
    aiRouter,
    r2Bucket: c.env.MOLTBOT_BUCKET,
    browser: c.env.BROWSER,
    supabase,
    vectorize: c.env.UX_KNOWLEDGE,
    googleApiKey: c.env.GOOGLE_API_KEY,
  });

  const result = await pipeline.run(oemId, modelSlug, sourceUrl, model?.name);
  return c.json(result);
});

// POST /admin/create-custom-page/:oemId/:slug — Create a blank custom page in R2
app.post('/admin/create-custom-page/:oemId/:slug', async (c) => {
  const { oemId, slug } = c.req.param();

  // Validate slug format
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) {
    return c.json({ error: 'Slug must be lowercase alphanumeric with hyphens, not starting/ending with hyphen' }, 400);
  }

  let body: { name?: string; page_type?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const name = String(body.name || '').trim().replace(/[<>]/g, '').substring(0, 100);
  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  const bucket = c.env.MOLTBOT_BUCKET;
  const key = `pages/definitions/${oemId}/${slug}/latest.json`;

  // Check for existing page with this slug
  const existing = await bucket.head(key);
  if (existing) {
    return c.json({ error: 'A page with this slug already exists' }, 409);
  }

  const page = {
    id: crypto.randomUUID(),
    slug,
    name,
    oem_id: oemId,
    header: { slides: [] },
    content: { rendered: '', sections: [] },
    form: false,
    variant_link: '',
    generated_at: new Date().toISOString(),
    source_url: '',
    version: 1,
    page_type: 'custom',
  };

  await bucket.put(key, JSON.stringify(page), {
    httpMetadata: { contentType: 'application/json' },
  });

  return c.json({ success: true, slug, page });
});

// POST /admin/create-subpage/:oemId/:modelSlug/:subpageSlug — Create a subpage under a model page
app.post('/admin/create-subpage/:oemId/:modelSlug/:subpageSlug', async (c) => {
  const { oemId, modelSlug, subpageSlug } = c.req.param();

  // Validate subpage slug format
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(subpageSlug) && !/^[a-z0-9]$/.test(subpageSlug)) {
    return c.json({ error: 'Subpage slug must be lowercase alphanumeric with hyphens' }, 400);
  }

  let body: { name?: string; subpage_type?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const name = String(body.name || '').trim().replace(/[<>]/g, '').substring(0, 100);
  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  const bucket = c.env.MOLTBOT_BUCKET;

  // Check parent model page exists
  const parentKey = `pages/definitions/${oemId}/${modelSlug}/latest.json`;
  const parentExists = await bucket.head(parentKey);
  if (!parentExists) {
    return c.json({ error: 'Parent model page not found' }, 404);
  }

  // Build composite slug and check for collision
  const compositeSlug = `${modelSlug}--${subpageSlug}`;
  const key = `pages/definitions/${oemId}/${compositeSlug}/latest.json`;

  const existing = await bucket.head(key);
  if (existing) {
    return c.json({ error: 'A subpage with this slug already exists' }, 409);
  }

  const subpageType = body.subpage_type || 'custom';
  const page = {
    id: crypto.randomUUID(),
    slug: compositeSlug,
    name,
    oem_id: oemId,
    header: { slides: [] },
    content: { rendered: '', sections: [] },
    form: false,
    variant_link: '',
    generated_at: new Date().toISOString(),
    source_url: '',
    version: 1,
    page_type: 'subpage' as const,
    parent_slug: modelSlug,
    subpage_type: subpageType,
    subpage_name: name,
  };

  await bucket.put(key, JSON.stringify(page), {
    httpMetadata: { contentType: 'application/json' },
  });

  return c.json({ success: true, slug: compositeSlug, page });
});

// DELETE /admin/delete-subpage/:oemId/:modelSlug/:subpageSlug — Delete a subpage from R2
app.delete('/admin/delete-subpage/:oemId/:modelSlug/:subpageSlug', async (c) => {
  const { oemId, modelSlug, subpageSlug } = c.req.param();
  const bucket = c.env.MOLTBOT_BUCKET;
  const compositeSlug = `${modelSlug}--${subpageSlug}`;
  const key = `pages/definitions/${oemId}/${compositeSlug}/latest.json`;

  const obj = await bucket.get(key);
  if (!obj) {
    return c.json({ error: 'Subpage not found' }, 404);
  }

  const page = await obj.json<{ page_type?: string }>();
  if (page.page_type !== 'subpage') {
    return c.json({ error: 'Only subpages can be deleted via this endpoint' }, 403);
  }

  await bucket.delete(key);
  return c.json({ success: true });
});

// DELETE /admin/delete-custom-page/:oemId/:slug — Delete a custom page from R2
app.delete('/admin/delete-custom-page/:oemId/:slug', async (c) => {
  const { oemId, slug } = c.req.param();
  const bucket = c.env.MOLTBOT_BUCKET;
  const key = `pages/definitions/${oemId}/${slug}/latest.json`;

  const obj = await bucket.get(key);
  if (!obj) {
    return c.json({ error: 'Page not found' }, 404);
  }

  const page = await obj.json<{ page_type?: string }>();
  if (page.page_type !== 'custom') {
    return c.json({ error: 'Only custom pages can be deleted' }, 403);
  }

  await bucket.delete(key);
  return c.json({ success: true });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createOrchestratorFromEnv(env: MoltbotEnv): OemAgentOrchestrator {
  const supabaseClient = createSupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const aiRouter = new AiRouter({
    groq: env.GROQ_API_KEY,
    together: env.TOGETHER_API_KEY,
    moonshot: env.MOONSHOT_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    google: env.GOOGLE_API_KEY,
  }, supabaseClient);

  const notifier = env.SLACK_WEBHOOK_URL
    ? new MultiChannelNotifier({ slackWebhookUrl: env.SLACK_WEBHOOK_URL })
    : new MultiChannelNotifier({ slackWebhookUrl: '' });

  return new OemAgentOrchestrator({
    supabaseClient,
    r2Bucket: env.MOLTBOT_BUCKET,
    browser: env.BROWSER!,
    aiRouter,
    notifier,
    lightpandaUrl: env.LIGHTPANDA_URL,
  });
}

export default app;
