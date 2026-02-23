/**
 * AI Agent Spawner
 *
 * Spawns AI agents to execute autonomous workflows in response to change events.
 * Uses multi-provider client (Groq, Kimi, Gemini, Claude) for cost-optimized inference.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChangeEvent, OemId } from '../oem/types';
import type { WorkflowDefinition, MatchedWorkflow } from './router';
import { MultiProviderClient, buildMessages, type AIRequest, type AIResponse } from '../ai/multi-provider';

// ============================================================================
// Agent Action Types
// ============================================================================

export interface AgentAction {
  id: string;
  workflow_id: string;
  change_event_id: string;
  oem_id: OemId;
  agent_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'requires_approval';
  confidence_score: number | null;
  actions_taken: string[];
  reasoning: string | null;
  execution_time_ms: number | null;
  cost_usd: number | null;
  error_message: string | null;
  rollback_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AgentResult {
  success: boolean;
  confidence: number;
  actions_taken: string[];
  reasoning: string;
  data: Record<string, unknown>;
  cost_usd?: number;
  execution_time_ms?: number;
  error?: string;
}

// ============================================================================
// Model Selection Strategy
// ============================================================================

const WORKFLOW_MODELS: Record<string, { provider: 'groq' | 'kimi' | 'gemini' | 'claude'; model: string }> = {
  'price-validation': { provider: 'groq', model: 'llama-3.1-8b-instant' },
  'product-enrichment': { provider: 'gemini', model: 'gemini-2.0-flash' },
  'link-repair': { provider: 'groq', model: 'llama-3.1-8b-instant' },
  'offer-expiry': { provider: 'groq', model: 'llama-3.1-8b-instant' },
  'image-quality': { provider: 'groq', model: 'openai/gpt-oss-20b' },
  'new-model-page': { provider: 'gemini', model: 'gemini-2.0-flash-thinking' },
  'disclaimer-compliance': { provider: 'groq', model: 'llama-3.1-8b-instant' },
  'variant-sync': { provider: 'groq', model: 'openai/gpt-oss-20b' },
};

// ============================================================================
// Agent Spawner
// ============================================================================

export class AgentSpawner {
  private supabase: SupabaseClient;
  private aiClient: MultiProviderClient;

  constructor(supabase: SupabaseClient, aiClient: MultiProviderClient) {
    this.supabase = supabase;
    this.aiClient = aiClient;
  }

  /**
   * Spawn an AI agent to execute a workflow
   */
  async spawnAgent(match: MatchedWorkflow): Promise<string> {
    const { workflow, changeEvent } = match;

    console.log(`[AgentSpawner] Spawning ${workflow.id} for change event ${changeEvent.id}`);

    // Create agent action record
    const agentActionId = crypto.randomUUID();
    const agentAction: Partial<AgentAction> = {
      id: agentActionId,
      workflow_id: workflow.id,
      change_event_id: changeEvent.id,
      oem_id: changeEvent.oem_id,
      agent_id: `agent-${agentActionId.slice(0, 8)}`,
      status: 'pending',
      confidence_score: null,
      actions_taken: [],
      reasoning: null,
      execution_time_ms: null,
      cost_usd: null,
      error_message: null,
      rollback_data: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await this.supabase.from('agent_actions').insert(agentAction);

    // Execute agent workflow
    try {
      const startTime = Date.now();

      // Update status to running
      await this.supabase
        .from('agent_actions')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', agentActionId);

      // Execute the agent
      const result = await this.executeAgent(workflow, changeEvent);

      const executionTime = Date.now() - startTime;

      // Determine if requires approval
      const requiresApproval = result.confidence < workflow.agent.confidence_threshold;
      const status = requiresApproval ? 'requires_approval' : (result.success ? 'completed' : 'failed');

      // Update agent action with results
      await this.supabase
        .from('agent_actions')
        .update({
          status,
          confidence_score: result.confidence,
          actions_taken: result.actions_taken,
          reasoning: result.reasoning,
          execution_time_ms: executionTime,
          cost_usd: result.cost_usd || 0,
          error_message: result.error || null,
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', agentActionId);

      // If auto-approved, execute actions
      if (!requiresApproval && result.success) {
        await this.executeAgentActions(agentActionId, result);
      } else if (requiresApproval) {
        console.log(`[AgentSpawner] Action ${agentActionId} requires manual approval (confidence: ${result.confidence})`);
      }

      return agentAction.agent_id!;
    } catch (error) {
      console.error(`[AgentSpawner] Failed to spawn agent:`, error);

      // Update agent action with error
      await this.supabase
        .from('agent_actions')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', agentActionId);

      throw error;
    }
  }

  /**
   * Execute agent using multi-provider AI client
   */
  private async executeAgent(
    workflow: WorkflowDefinition,
    changeEvent: ChangeEvent
  ): Promise<AgentResult> {
    // Get model selection for this workflow
    const modelConfig = WORKFLOW_MODELS[workflow.id] || { provider: 'groq', model: 'llama-3.1-8b-instant' };

    // Build agent prompt
    const systemPrompt = this.buildSystemPrompt(workflow);
    const userPrompt = this.buildUserPrompt(workflow, changeEvent);

    // Fetch entity data for context
    const entityData = await this.fetchEntityData(changeEvent.entity_type, changeEvent.entity_id);

    // Add entity data to user prompt
    const fullUserPrompt = `${userPrompt}\n\n**Entity Data**:\n\`\`\`json\n${JSON.stringify(entityData, null, 2)}\n\`\`\``;

    const messages = buildMessages(systemPrompt, fullUserPrompt);

    // Execute AI request
    const request: AIRequest = {
      provider: modelConfig.provider,
      model: modelConfig.model,
      messages,
      temperature: 0.1,
      max_tokens: 4096,
      response_format: 'json',
    };

    let totalCost = 0;
    const aiResponse = await this.aiClient.chat(request);
    totalCost += aiResponse.usage.cost_usd;

    // Parse response
    try {
      const result: AgentResult = JSON.parse(aiResponse.content);
      result.cost_usd = totalCost;

      return result;
    } catch (error) {
      console.error('[AgentSpawner] Failed to parse AI response:', aiResponse.content);
      return {
        success: false,
        confidence: 0,
        actions_taken: [],
        reasoning: 'Failed to parse AI response as JSON',
        data: {},
        error: error instanceof Error ? error.message : String(error),
        cost_usd: totalCost,
      };
    }
  }

  /**
   * Build system prompt for agent
   */
  private buildSystemPrompt(workflow: WorkflowDefinition): string {
    return `You are an autonomous AI agent executing the "${workflow.name}" workflow.

**Your Task**: ${workflow.description}

**Confidence Threshold**: ${workflow.agent.confidence_threshold} (minimum confidence required for auto-execution)

**Auto-Approve Actions**: ${workflow.actions.auto_approve.join(', ')}
**Require Approval Actions**: ${workflow.actions.require_approval.join(', ')}

**Response Format**: You MUST respond with valid JSON matching this schema:
\`\`\`json
{
  "success": boolean,
  "confidence": number (0.0-1.0),
  "actions_taken": string[],
  "reasoning": string,
  "data": object
}
\`\`\`

**Guidelines**:
- Analyze the change event and entity data carefully
- Only recommend actions from the auto-approve or require-approval lists
- Set confidence based on how certain you are about your analysis
- If confidence >= threshold, your actions will execute automatically
- If confidence < threshold, human approval will be required
- Provide clear reasoning for your decisions`;
  }

  /**
   * Build user prompt with change event details
   */
  private buildUserPrompt(workflow: WorkflowDefinition, changeEvent: ChangeEvent): string {
    return `**Change Event Detected**:
- ID: ${changeEvent.id}
- Entity Type: ${changeEvent.entity_type}
- Entity ID: ${changeEvent.entity_id}
- Event Type: ${changeEvent.event_type}
- Severity: ${changeEvent.severity}
- Summary: ${changeEvent.summary}
- OEM: ${changeEvent.oem_id}

**Your Task**: Investigate this change event and recommend actions based on the workflow guidelines.`;
  }

  /**
   * Fetch entity data from database
   */
  private async fetchEntityData(entityType: string, entityId: string): Promise<Record<string, unknown> | null> {
    const tableMap: Record<string, string> = {
      product: 'products',
      offer: 'offers',
      banner: 'banners',
    };

    const table = tableMap[entityType];
    if (!table) return null;

    const { data } = await this.supabase
      .from(table)
      .select('*')
      .eq('id', entityId)
      .single();

    return data || null;
  }

  /**
   * Execute actions recommended by agent (if auto-approved)
   */
  private async executeAgentActions(
    agentActionId: string,
    result: AgentResult
  ): Promise<void> {
    console.log(`[AgentSpawner] Executing auto-approved actions for ${agentActionId}`);

    // Fetch agent action details
    const { data: agentAction } = await this.supabase
      .from('agent_actions')
      .select('*')
      .eq('id', agentActionId)
      .single();

    if (!agentAction) {
      console.error(`[AgentSpawner] Agent action ${agentActionId} not found`);
      return;
    }

    // Store rollback data before making changes
    const rollbackData = await this.createRollbackData(agentAction, result);

    await this.supabase
      .from('agent_actions')
      .update({ rollback_data: rollbackData })
      .eq('id', agentActionId);

    // Execute each action
    for (const action of result.actions_taken) {
      try {
        await this.executeAction(agentAction, action, result.data);
      } catch (error) {
        console.error(`[AgentSpawner] Failed to execute action ${action}:`, error);
        // Trigger rollback if execution fails
        await this.rollbackAction(agentActionId);
        break;
      }
    }
  }

  /**
   * Create rollback data before executing actions
   */
  private async createRollbackData(
    agentAction: any,
    result: AgentResult
  ): Promise<Record<string, unknown>> {
    // Fetch current entity state
    const entityData = await this.fetchEntityData(
      agentAction.change_event?.entity_type || 'product',
      agentAction.change_event?.entity_id || agentAction.entity_id
    );

    return {
      entity_snapshot: entityData,
      timestamp: new Date().toISOString(),
      actions: result.actions_taken,
    };
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    agentAction: any,
    action: string,
    data: Record<string, unknown>
  ): Promise<void> {
    console.log(`[AgentSpawner] Executing action: ${action}`);

    // Map action names to database operations
    // TODO: Implement actual action execution based on workflow type
    // For now, just log the action
  }

  /**
   * Rollback an agent action
   */
  async rollbackAction(agentActionId: string): Promise<void> {
    console.log(`[AgentSpawner] Rolling back action ${agentActionId}`);

    const { data: agentAction } = await this.supabase
      .from('agent_actions')
      .select('*')
      .eq('id', agentActionId)
      .single();

    if (!agentAction?.rollback_data) {
      console.error(`[AgentSpawner] No rollback data available for ${agentActionId}`);
      return;
    }

    const rollbackData = agentAction.rollback_data as Record<string, unknown>;
    const entitySnapshot = rollbackData.entity_snapshot as Record<string, unknown>;

    // Restore entity to previous state
    const tableMap: Record<string, string> = {
      product: 'products',
      offer: 'offers',
      banner: 'banners',
    };

    const entityType = agentAction.change_event?.entity_type || 'product';
    const table = tableMap[entityType];
    if (table && entitySnapshot) {
      await this.supabase
        .from(table)
        .update(entitySnapshot)
        .eq('id', agentAction.change_event?.entity_id || agentAction.entity_id);
    }

    // Update agent action status
    await this.supabase
      .from('agent_actions')
      .update({
        status: 'failed',
        error_message: 'Action execution failed, rolled back to previous state',
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentActionId);

    console.log(`[AgentSpawner] Rollback completed for ${agentActionId}`);
  }
}
