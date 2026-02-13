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
import { AiRouter } from '../ai/router';
import { SalesRepAgent } from '../ai/sales-rep';
import { MultiChannelNotifier } from '../notify/slack';
import { allOemIds, getOemDefinition } from '../oem/registry';
import type { OemId } from '../oem/types';

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
 * GET /api/v1/oem-agent/oems
 * List all configured OEMs
 */
app.get('/oems', (c) => {
  const oems = allOemIds.map(id => {
    const def = getOemDefinition(id);
    return {
      id,
      name: def?.name,
      baseUrl: def?.baseUrl,
      isActive: true,
    };
  });

  return c.json({ oems });
});

/**
 * GET /api/v1/oem-agent/oems/:oemId
 * Get details for a specific OEM
 */
app.get('/oems/:oemId', (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const def = getOemDefinition(oemId);

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
 * POST /api/v1/oem-agent/admin/crawl/:oemId
 * Trigger a manual crawl for an OEM
 */
app.post('/admin/crawl/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const orchestrator = c.get('orchestrator');

  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  // Validate OEM
  const def = getOemDefinition(oemId);
  if (!def) {
    return c.json({ error: 'OEM not found' }, 404);
  }

  // Return immediately with job ID
  const jobId = crypto.randomUUID();

  // Trigger crawl in background using waitUntil
  // This keeps the worker alive until the crawl completes
  c.executionCtx.waitUntil(
    orchestrator.crawlOem(oemId).catch(err => {
      console.error(`[Crawl ${jobId}] Error crawling ${oemId}:`, err);
    })
  );

  return c.json({
    success: true,
    message: `Crawl triggered for ${def.name}`,
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
 * POST /api/v1/oem-agent/admin/force-crawl/:oemId
 * Force crawl all pages for an OEM (bypasses scheduler check)
 */
app.post('/admin/force-crawl/:oemId', async (c) => {
  const oemId = c.req.param('oemId') as OemId;

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Reset last_checked_at for all active pages to force them due
  const { error: resetError } = await supabase
    .from('source_pages')
    .update({
      last_checked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('oem_id', oemId)
    .eq('status', 'active');

  if (resetError) {
    return c.json({ error: resetError.message }, 500);
  }

  // Now trigger the crawl
  const orchestrator = c.get('orchestrator');
  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not initialized' }, 500);
  }

  const jobId = crypto.randomUUID();

  c.executionCtx.waitUntil(
    orchestrator.crawlOem(oemId).catch(err => {
      console.error(`[Force Crawl ${jobId}] Error crawling ${oemId}:`, err);
    })
  );

  return c.json({
    success: true,
    message: `Force crawl triggered for ${oemId} - all pages reset to due`,
    jobId,
    oemId,
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
    const result = await orchestrator.crawlPage(oemId, page as any);

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
    anthropic: env.ANTHROPIC_API_KEY,
  });

  const notifier = env.SLACK_WEBHOOK_URL
    ? new MultiChannelNotifier({ slackWebhookUrl: env.SLACK_WEBHOOK_URL })
    : new MultiChannelNotifier({ slackWebhookUrl: '' });

  return new OemAgentOrchestrator({
    supabaseClient,
    r2Bucket: env.MOLTBOT_BUCKET,
    browser: env.BROWSER!,
    aiRouter,
    notifier,
  });
}

export default app;
