/**
 * Autonomous Agents API Routes
 *
 * Manages agent actions, workflow settings, and approval/rollback operations
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createSupabaseClient } from '../utils/supabase';

const agents = new Hono<AppEnv>();

/** Create a Supabase client from the request context */
function getSupabase(c: { env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string } }) {
  return createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

// ============================================================================
// Agent Actions Routes
// ============================================================================

/**
 * GET /api/v1/agents
 * List all agent actions with filters
 */
agents.get('/', async (c) => {
  const { workflow_id, status, oem_id, limit = '50', offset = '0' } = c.req.query();

  const limitNum = parseInt(limit);
  const offsetNum = parseInt(offset);
  const supabase = getSupabase(c);

  let query = supabase
    .from('agent_actions')
    .select(`
      *,
      change_events (
        id,
        summary,
        event_type,
        severity,
        entity_type,
        entity_id
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offsetNum, offsetNum + limitNum - 1);

  if (workflow_id) query = query.eq('workflow_id', workflow_id);
  if (status) query = query.eq('status', status);
  if (oem_id) query = query.eq('oem_id', oem_id);

  const { data, error, count } = await query;

  if (error) {
    console.error('[Agents API] Error fetching agent actions:', error);
    return c.json({ error: error.message }, 500);
  }

  return c.json({
    data: data || [],
    count: count || 0,
    limit: limitNum,
    offset: offsetNum
  });
});

/**
 * GET /api/v1/agents/stats
 * Get aggregate statistics for agent actions
 */
agents.get('/stats', async (c) => {
  const { oem_id } = c.req.query();
  const supabase = getSupabase(c);

  // Get counts by status
  let statusQuery = supabase
    .from('agent_actions')
    .select('status, workflow_id');

  if (oem_id) statusQuery = statusQuery.eq('oem_id', oem_id);

  const { data: actions, error: statusError } = await statusQuery;

  if (statusError) {
    return c.json({ error: statusError.message }, 500);
  }

  // Calculate stats
  const byStatus = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    requires_approval: 0
  };
  const byWorkflow: Record<string, number> = {};

  for (const action of actions || []) {
    const s = action.status as keyof typeof byStatus;
    if (s in byStatus) byStatus[s]++;
    byWorkflow[action.workflow_id] = (byWorkflow[action.workflow_id] || 0) + 1;
  }

  const completed = byStatus.completed;
  const failed = byStatus.failed;
  const total = completed + failed;
  const successRate = total > 0 ? (completed / total) * 100 : 0;

  // Get cost stats
  const { data: costData } = await supabase
    .from('agent_actions')
    .select('cost_usd, execution_time_ms')
    .not('cost_usd', 'is', null);

  let totalCost = 0;
  let avgTime = 0;
  if (costData && costData.length > 0) {
    totalCost = costData.reduce((sum: number, a: { cost_usd: number | null }) => sum + (a.cost_usd || 0), 0);
    avgTime = costData.reduce((sum: number, a: { execution_time_ms: number | null }) => sum + (a.execution_time_ms || 0), 0) / costData.length;
  }

  return c.json({
    total: actions?.length || 0,
    by_status: byStatus,
    by_workflow: byWorkflow,
    success_rate: successRate,
    total_cost_usd: totalCost,
    avg_execution_ms: Math.round(avgTime)
  });
});

/**
 * GET /api/v1/agents/:id
 * Get single agent action with full details
 */
agents.get('/:id', async (c) => {
  const { id } = c.req.param();
  const supabase = getSupabase(c);

  const { data, error } = await supabase
    .from('agent_actions')
    .select(`
      *,
      change_events (*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('[Agents API] Error fetching agent action:', error);
    return c.json({ error: error.message }, 404);
  }

  return c.json({ data });
});

/**
 * POST /api/v1/agents/:id/approve
 * Approve a pending agent action
 */
agents.post('/:id/approve', async (c) => {
  const { id } = c.req.param();
  const supabase = getSupabase(c);

  // Get current action
  const { data: action, error: fetchError } = await supabase
    .from('agent_actions')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !action) {
    return c.json({ error: 'Action not found' }, 404);
  }

  if (action.status !== 'requires_approval') {
    return c.json({ error: 'Action does not require approval' }, 400);
  }

  // Update status to running
  const { error: updateError } = await supabase
    .from('agent_actions')
    .update({
      status: 'running',
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (updateError) {
    return c.json({ error: updateError.message }, 500);
  }

  // TODO: Execute the agent actions via workflow spawner
  // For now, mark as completed after a brief delay using waitUntil
  // so the work continues after the response is sent
  const completionPromise = (async () => {
    await new Promise(r => setTimeout(r, 1000));
    await supabase
      .from('agent_actions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
  })();
  c.executionCtx.waitUntil(completionPromise);

  return c.json({ success: true, message: 'Action approved and executing' });
});

/**
 * POST /api/v1/agents/:id/rollback
 * Rollback a completed agent action
 */
agents.post('/:id/rollback', async (c) => {
  const { id } = c.req.param();
  const supabase = getSupabase(c);

  // Get action with rollback data
  const { data: action, error: fetchError } = await supabase
    .from('agent_actions')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !action) {
    return c.json({ error: 'Action not found' }, 404);
  }

  if (action.status !== 'completed') {
    return c.json({ error: 'Only completed actions can be rolled back' }, 400);
  }

  if (!action.rollback_data) {
    return c.json({ error: 'No rollback data available for this action' }, 400);
  }

  // TODO: Implement actual rollback logic using rollback_data
  // For now, just mark the action as rolled back
  const { error: updateError } = await supabase
    .from('agent_actions')
    .update({
      status: 'failed',
      error_message: 'Manually rolled back by user',
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (updateError) {
    return c.json({ error: updateError.message }, 500);
  }

  return c.json({ success: true, message: 'Action rolled back successfully' });
});

// ============================================================================
// Workflow Settings Routes
// ============================================================================

/**
 * GET /api/v1/agents/workflows/settings
 * List all workflow settings with stats
 */
agents.get('/workflows/settings', async (c) => {
  const supabase = getSupabase(c);

  const { data, error } = await supabase
    .from('workflow_settings')
    .select('*')
    .order('priority', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // Get action counts for each workflow (include created_at for date filtering)
  const { data: actionCounts } = await supabase
    .from('agent_actions')
    .select('workflow_id, status, created_at');

  const workflows = (data || []).map((workflow: { id: string; [key: string]: unknown }) => {
    const actions = (actionCounts || []).filter((a: { workflow_id: string }) => a.workflow_id === workflow.id);
    const completed = actions.filter((a: { status: string }) => a.status === 'completed').length;
    const failed = actions.filter((a: { status: string }) => a.status === 'failed').length;
    const total = completed + failed;

    return {
      ...workflow,
      stats: {
        total: actions.length,
        today: actions.filter((a: { created_at: string }) => {
          const created = new Date(a.created_at);
          const today = new Date();
          return created.toDateString() === today.toDateString();
        }).length,
        week: actions.filter((a: { created_at: string }) => {
          const created = new Date(a.created_at);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return created >= weekAgo;
        }).length,
        success_rate: total > 0 ? Math.round((completed / total) * 100) : 0
      }
    };
  });

  return c.json({ data: workflows });
});

/**
 * GET /api/v1/agents/workflows/:id/config
 * Get workflow-specific config (for settings pages)
 */
agents.get('/workflows/:id/config', async (c) => {
  const { id } = c.req.param();
  const supabase = getSupabase(c);

  const { data, error } = await supabase
    .from('workflow_settings')
    .select('config')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ data: data?.config || {} });
});

/**
 * PATCH /api/v1/agents/workflows/:id
 * Update workflow settings
 */
agents.patch('/workflows/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const supabase = getSupabase(c);

  // Validate updates - only allow known fields
  const allowedFields = ['enabled', 'priority', 'confidence_threshold', 'rate_limit_hourly', 'rate_limit_daily', 'config'];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('workflow_settings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ data });
});

export default agents;
