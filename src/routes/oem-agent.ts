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

  // Trigger crawl (don't await - run in background)
  const crawlPromise = orchestrator.crawlOem(oemId);

  // Return immediately with job ID
  const jobId = crypto.randomUUID();
  
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

  // Trigger crawl (don't await - run in background)
  orchestrator.runScheduledCrawl();

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
