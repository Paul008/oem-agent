/**
 * OpenClaw Agent Spawner
 *
 * Spawns OpenClaw agents to execute autonomous workflows in response to change events.
 * Integrates with the workflow router to dispatch appropriate agents.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChangeEvent, OemId } from '../oem/types';
import type { WorkflowDefinition, MatchedWorkflow } from './router';

// ============================================================================
// Agent Action Types
// ============================================================================

export interface AgentAction {
  id: string;
  workflow_id: string;
  change_event_id: string;
  oem_id: OemId;
  agent_id: string; // OpenClaw agent session ID
  status: 'pending' | 'running' | 'completed' | 'failed' | 'requires_approval';
  confidence_score: number | null;
  actions_taken: string[]; // List of actions performed
  reasoning: string | null; // Agent's explanation
  execution_time_ms: number | null;
  cost_usd: number | null;
  error_message: string | null;
  rollback_data: Record<string, unknown> | null; // Data needed to rollback
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ============================================================================
// OpenClaw Integration
// ============================================================================

export interface OpenClawAgentRequest {
  skill: string; // Skill file to use
  prompt: string; // Initial prompt/task for the agent
  context: Record<string, unknown>; // Additional context data
  tools?: string[]; // Tools available to agent
  max_execution_time?: number; // milliseconds
  callback_url?: string; // Webhook URL for completion notification
}

export interface OpenClawAgentResponse {
  agent_id: string;
  status: 'started' | 'error';
  message?: string;
}

export interface OpenClawSkillResult {
  success: boolean;
  confidence: number; // 0.0-1.0
  actions_taken: string[];
  reasoning: string;
  data: Record<string, unknown>;
  cost_usd?: number;
  execution_time_ms?: number;
  error?: string;
}

// ============================================================================
// Agent Spawner
// ============================================================================

export class AgentSpawner {
  private supabase: SupabaseClient;
  private openclawApiUrl: string;
  private openclawApiKey: string;
  private dashboardUrl: string;

  constructor(
    supabase: SupabaseClient,
    openclawApiUrl: string,
    openclawApiKey: string,
    dashboardUrl: string
  ) {
    this.supabase = supabase;
    this.openclawApiUrl = openclawApiUrl;
    this.openclawApiKey = openclawApiKey;
    this.dashboardUrl = dashboardUrl;
  }

  /**
   * Spawn an OpenClaw agent to execute a workflow
   */
  async spawnAgent(match: MatchedWorkflow): Promise<string> {
    const { workflow, changeEvent } = match;

    console.log(`[AgentSpawner] Spawning ${workflow.agent.skill} for change event ${changeEvent.id}`);

    // Create agent action record
    const agentActionId = crypto.randomUUID();
    const agentAction: Partial<AgentAction> = {
      id: agentActionId,
      workflow_id: workflow.id,
      change_event_id: changeEvent.id,
      oem_id: changeEvent.oem_id,
      agent_id: '', // Will be set after spawn
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

    // Build agent prompt
    const prompt = this.buildAgentPrompt(workflow, changeEvent);

    // Build context data
    const context = await this.buildAgentContext(workflow, changeEvent);

    // Spawn OpenClaw agent
    try {
      const openclawRequest: OpenClawAgentRequest = {
        skill: workflow.agent.skill,
        prompt,
        context,
        tools: workflow.agent.tools,
        max_execution_time: workflow.agent.max_execution_time,
        callback_url: `${this.dashboardUrl}/api/v1/workflows/agent-callback/${agentActionId}`,
      };

      const openclawResponse = await this.callOpenClawAPI(openclawRequest);

      if (openclawResponse.status === 'error') {
        throw new Error(openclawResponse.message || 'OpenClaw agent spawn failed');
      }

      // Update agent action with agent ID
      await this.supabase
        .from('agent_actions')
        .update({
          agent_id: openclawResponse.agent_id,
          status: 'running',
          updated_at: new Date().toISOString(),
        })
        .eq('id', agentActionId);

      console.log(`[AgentSpawner] Agent ${openclawResponse.agent_id} spawned successfully`);

      return openclawResponse.agent_id;
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
   * Build agent prompt based on workflow and change event
   */
  private buildAgentPrompt(workflow: WorkflowDefinition, changeEvent: ChangeEvent): string {
    const prompts: Record<string, string> = {
      'price-validator': `
A price change has been detected for a product.

**Change Event**:
- Entity: ${changeEvent.entity_type} (ID: ${changeEvent.entity_id})
- Event Type: ${changeEvent.event_type}
- Severity: ${changeEvent.severity}
- Summary: ${changeEvent.summary}

**Your Task**:
1. Navigate to the product's source URL
2. Extract the current price from the OEM website
3. Compare with the detected change in our database
4. Validate the price format and currency
5. Check for any pricing disclaimers or conditions
6. Determine confidence level (0.0-1.0) for the extracted price

**Actions**:
- If confidence >= 0.95: Auto-update the price in database
- If confidence < 0.95: Flag for manual review

Provide your analysis in JSON format with:
- confidence: number (0.0-1.0)
- current_price: number | null
- currency: string
- price_type: string (e.g., "driveaway", "rrp")
- disclaimer: string | null
- actions_taken: string[] (list of actions performed)
- reasoning: string (explain your analysis)
      `.trim(),

      'product-enricher': `
A new product has been detected with missing data fields.

**Change Event**:
- Entity: ${changeEvent.entity_type} (ID: ${changeEvent.entity_id})
- Summary: ${changeEvent.summary}

**Your Task**:
1. Analyze the product record to identify missing fields
2. Navigate to the source URL
3. Extract missing data: specs, features, images, descriptions
4. Download and optimize product images
5. Upload images to R2 bucket (if applicable)
6. Determine confidence level for each extracted field

**Actions**:
- If confidence >= 0.85: Auto-enrich product record
- If confidence < 0.85: Flag fields for manual review

Provide your analysis in JSON format with:
- confidence: number (0.0-1.0)
- extracted_fields: Record<string, any>
- images_uploaded: string[] (R2 keys)
- actions_taken: string[]
- reasoning: string
      `.trim(),

      'link-validator': `
Potential broken links have been detected in entity records.

**Change Event**:
- Entity: ${changeEvent.entity_type} (ID: ${changeEvent.entity_id})
- Summary: ${changeEvent.summary}

**Your Task**:
1. Extract all URLs from the entity record
2. Validate each URL (HTTP status code check)
3. For broken links (404, 500, etc.):
   - Search OEM site for correct URL
   - Check sitemap for alternative pages
   - Find replacement URLs on the same domain
4. Determine confidence level for each replacement

**Actions**:
- If replacement URL is on same domain AND confidence >= 0.90: Auto-fix
- If replacement URL is external OR confidence < 0.90: Flag for review

Provide your analysis in JSON format with:
- confidence: number (0.0-1.0)
- broken_links: Array<{ url: string; status: number }>
- replacements: Array<{ old_url: string; new_url: string; confidence: number }>
- actions_taken: string[]
- reasoning: string
      `.trim(),

      'offer-manager': `
An offer validity date update has been detected or expiry is approaching.

**Change Event**:
- Entity: ${changeEvent.entity_type} (ID: ${changeEvent.entity_id})
- Summary: ${changeEvent.summary}

**Your Task**:
1. Check if the offer is still active on the OEM website
2. Verify the expiry date accuracy
3. Determine if the offer should be archived
4. Check if the offer appears on the homepage

**Actions**:
- If offer is confirmed expired (confidence = 1.0): Archive and remove from homepage
- If offer status is uncertain: Flag for manual review

Provide your analysis in JSON format with:
- confidence: number (must be 1.0 for auto-archive)
- is_active_on_site: boolean
- actual_expiry_date: string | null
- actions_taken: string[]
- reasoning: string
      `.trim(),

      'image-validator': `
A product image change has been detected.

**Change Event**:
- Entity: ${changeEvent.entity_type} (ID: ${changeEvent.entity_id})
- Summary: ${changeEvent.summary}

**Your Task**:
1. Download the image from R2 bucket
2. Check image resolution (minimum 1200x800 required)
3. Validate aspect ratio (should be 3:2 or 4:3)
4. Check file size (target < 500KB)
5. Run AI image quality analysis if available
6. If quality issues detected, check source for better version

**Actions**:
- If source has better quality AND confidence >= 0.80: Replace image
- If quality is acceptable: Approve current image
- If uncertain: Flag for manual review

Provide your analysis in JSON format with:
- confidence: number (0.0-1.0)
- resolution: { width: number; height: number }
- file_size_kb: number
- quality_score: number (0.0-1.0)
- actions_taken: string[]
- reasoning: string
      `.trim(),

      'compliance-checker': `
A disclaimer text change has been detected.

**Change Event**:
- Entity: ${changeEvent.entity_type} (ID: ${changeEvent.entity_id})
- Summary: ${changeEvent.summary}

**Your Task**:
1. Extract the disclaimer text
2. Check for required legal terms and phrases
3. Compare against approved compliance templates
4. Validate character limits for display contexts
5. Flag any non-compliant or suspicious content

**Actions**:
- If disclaimer matches approved patterns (confidence >= 0.95): Approve
- If disclaimer has issues: Flag for legal review

Provide your analysis in JSON format with:
- confidence: number (0.0-1.0)
- is_compliant: boolean
- missing_terms: string[]
- issues: string[]
- actions_taken: string[]
- reasoning: string
      `.trim(),

      'variant-sync': `
Variant data changes have been detected for a product.

**Change Event**:
- Entity: ${changeEvent.entity_type} (ID: ${changeEvent.entity_id})
- Summary: ${changeEvent.summary}

**Your Task**:
1. Detect variant additions, removals, or modifications
2. Cross-reference with OEM source data
3. Update variant pricing tables
4. Sync variant colors and specifications
5. Ensure all variants have complete data

**Actions**:
- If variant IDs match source AND confidence >= 0.85: Auto-sync
- If variants removed from source: Flag for approval before deletion

Provide your analysis in JSON format with:
- confidence: number (0.0-1.0)
- variants_added: string[]
- variants_removed: string[]
- variants_updated: string[]
- actions_taken: string[]
- reasoning: string
      `.trim(),
    };

    return prompts[workflow.agent.skill] || `
Analyze and fix the following change event:

**Change Event**:
- Entity: ${changeEvent.entity_type} (ID: ${changeEvent.entity_id})
- Event Type: ${changeEvent.event_type}
- Severity: ${changeEvent.severity}
- Summary: ${changeEvent.summary}

Provide your analysis and recommended actions.
    `.trim();
  }

  /**
   * Build context data for the agent
   */
  private async buildAgentContext(
    workflow: WorkflowDefinition,
    changeEvent: ChangeEvent
  ): Promise<Record<string, unknown>> {
    const context: Record<string, unknown> = {
      workflow_id: workflow.id,
      change_event_id: changeEvent.id,
      entity_type: changeEvent.entity_type,
      entity_id: changeEvent.entity_id,
      oem_id: changeEvent.oem_id,
      event_type: changeEvent.event_type,
      severity: changeEvent.severity,
      summary: changeEvent.summary,
      diff_json: changeEvent.diff_json,
      confidence_threshold: workflow.agent.confidence_threshold,
      auto_approve_actions: workflow.actions.auto_approve,
      require_approval_actions: workflow.actions.require_approval,
    };

    // Fetch entity data from database
    try {
      const entityData = await this.fetchEntityData(
        changeEvent.entity_type,
        changeEvent.entity_id
      );
      context.entity_data = entityData;
    } catch (error) {
      console.error(`[AgentSpawner] Failed to fetch entity data:`, error);
    }

    return context;
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
   * Call OpenClaw API to spawn agent
   */
  private async callOpenClawAPI(request: OpenClawAgentRequest): Promise<OpenClawAgentResponse> {
    // TODO: Implement actual OpenClaw API call
    // For now, return mock response

    console.log(`[AgentSpawner] OpenClaw API request:`, {
      skill: request.skill,
      tools: request.tools,
      max_execution_time: request.max_execution_time,
    });

    // Mock response
    return {
      agent_id: `agent-${crypto.randomUUID()}`,
      status: 'started',
      message: 'Agent spawned successfully (mock)',
    };
  }

  /**
   * Handle agent callback (called when agent completes)
   */
  async handleAgentCallback(
    agentActionId: string,
    result: OpenClawSkillResult
  ): Promise<void> {
    console.log(`[AgentSpawner] Agent callback for action ${agentActionId}`);

    const status = result.success ? 'completed' : 'failed';
    const requiresApproval = result.confidence < 0.85; // Threshold for auto-execution

    await this.supabase
      .from('agent_actions')
      .update({
        status: requiresApproval ? 'requires_approval' : status,
        confidence_score: result.confidence,
        actions_taken: result.actions_taken,
        reasoning: result.reasoning,
        execution_time_ms: result.execution_time_ms || null,
        cost_usd: result.cost_usd || null,
        error_message: result.error || null,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq('id', agentActionId);

    // If requires approval, notify team
    if (requiresApproval) {
      console.log(`[AgentSpawner] Action ${agentActionId} requires manual approval (confidence: ${result.confidence})`);
      // TODO: Send Slack notification
    }

    // If auto-approved, execute actions
    if (!requiresApproval && result.success) {
      await this.executeAgentActions(agentActionId, result);
    }
  }

  /**
   * Execute actions recommended by agent (if auto-approved)
   */
  private async executeAgentActions(
    agentActionId: string,
    result: OpenClawSkillResult
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
    result: OpenClawSkillResult
  ): Promise<Record<string, unknown>> {
    // Fetch current entity state
    const entityData = await this.fetchEntityData(
      agentAction.entity_type,
      agentAction.entity_id
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

    const table = tableMap[agentAction.entity_type];
    if (table && entitySnapshot) {
      await this.supabase
        .from(table)
        .update(entitySnapshot)
        .eq('id', agentAction.entity_id);
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
