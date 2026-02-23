/**
 * Autonomous Workflow Router
 *
 * Routes change events to appropriate workflows and spawns OpenClaw agents
 * to investigate, analyze, and fix issues autonomously.
 */

import type { ChangeEvent, OemId } from '../oem/types';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Workflow Definitions
// ============================================================================

export interface WorkflowTrigger {
  entity_type?: string[];
  event_type?: string[];
  severity?: string[];
  condition?: string; // SQL-like condition for advanced matching
}

export interface AgentConfig {
  type: string; // OpenClaw agent type
  skill: string; // Skill file to use
  tools: string[]; // Tools available to agent
  confidence_threshold: number; // 0.0-1.0
  max_execution_time?: number; // milliseconds
}

export interface WorkflowActions {
  auto_approve: string[]; // Actions that can auto-execute
  require_approval: string[]; // Actions needing human approval
  rollback_enabled: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number; // 1-10, higher = more important
  trigger: WorkflowTrigger;
  agent: AgentConfig;
  actions: WorkflowActions;
  rate_limit?: {
    max_per_hour?: number;
    max_per_day?: number;
  };
}

// ============================================================================
// Built-in Workflows
// ============================================================================

export const WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'price-validation',
    name: 'Price Validation & Correction',
    description: 'Validates price changes against OEM source and corrects mismatches',
    enabled: true,
    priority: 10, // Highest priority
    trigger: {
      entity_type: ['product'],
      event_type: ['price_changed'],
      severity: ['critical', 'high'],
    },
    agent: {
      type: 'browser-validator',
      skill: 'price-validator',
      tools: ['browser', 'read', 'edit'],
      confidence_threshold: 0.95,
      max_execution_time: 120000, // 2 minutes
    },
    actions: {
      auto_approve: ['update_price', 'log_validation'],
      require_approval: ['flag_mismatch', 'notify_team'],
      rollback_enabled: true,
    },
    rate_limit: {
      max_per_hour: 50,
      max_per_day: 500,
    },
  },
  {
    id: 'product-enrichment',
    name: 'Missing Product Data Enrichment',
    description: 'Extracts and enriches missing product data from OEM source',
    enabled: true,
    priority: 8,
    trigger: {
      entity_type: ['product'],
      event_type: ['created'],
      severity: ['critical'],
    },
    agent: {
      type: 'data-enricher',
      skill: 'product-enricher',
      tools: ['browser', 'exec', 'read', 'write', 'edit', 'image'],
      confidence_threshold: 0.85,
      max_execution_time: 300000, // 5 minutes
    },
    actions: {
      auto_approve: ['add_specs', 'upload_images', 'update_features'],
      require_approval: ['major_field_changes'],
      rollback_enabled: true,
    },
    rate_limit: {
      max_per_hour: 20,
      max_per_day: 200,
    },
  },
  {
    id: 'link-repair',
    name: 'Broken Link Repair',
    description: 'Detects and repairs broken URLs in product/offer records',
    enabled: true,
    priority: 7,
    trigger: {
      entity_type: ['product', 'offer', 'banner'],
      event_type: ['updated'],
    },
    agent: {
      type: 'link-validator',
      skill: 'link-validator',
      tools: ['web_fetch', 'exec', 'read', 'edit'],
      confidence_threshold: 0.90,
      max_execution_time: 60000, // 1 minute
    },
    actions: {
      auto_approve: ['fix_same_domain_links'],
      require_approval: ['external_domain_links', 'remove_links'],
      rollback_enabled: true,
    },
    rate_limit: {
      max_per_hour: 30,
      max_per_day: 300,
    },
  },
  {
    id: 'offer-expiry',
    name: 'Offer Expiry Management',
    description: 'Manages expiring offers and archives when confirmed expired',
    enabled: true,
    priority: 6,
    trigger: {
      entity_type: ['offer'],
      event_type: ['updated'],
    },
    agent: {
      type: 'offer-manager',
      skill: 'offer-manager',
      tools: ['browser', 'read', 'edit'],
      confidence_threshold: 1.0, // Require 100% confidence for auto-archive
      max_execution_time: 90000, // 1.5 minutes
    },
    actions: {
      auto_approve: ['archive_expired', 'update_homepage'],
      require_approval: ['delete_offer'],
      rollback_enabled: true,
    },
    rate_limit: {
      max_per_hour: 10,
      max_per_day: 100,
    },
  },
  {
    id: 'image-quality',
    name: 'Image Quality Validation',
    description: 'Validates image quality and re-downloads if issues detected',
    enabled: true,
    priority: 5,
    trigger: {
      entity_type: ['product'],
      event_type: ['image_changed'],
    },
    agent: {
      type: 'image-validator',
      skill: 'image-validator',
      tools: ['browser', 'exec', 'read', 'write', 'image'],
      confidence_threshold: 0.80,
      max_execution_time: 180000, // 3 minutes
    },
    actions: {
      auto_approve: ['replace_low_quality', 'optimize_filesize'],
      require_approval: ['manual_image_selection'],
      rollback_enabled: true,
    },
    rate_limit: {
      max_per_hour: 15,
      max_per_day: 150,
    },
  },
  {
    id: 'new-model-page',
    name: 'New Model Page Generation',
    description: 'Generates marketing pages for newly discovered vehicle models',
    enabled: false, // Disabled by default, requires Brand Ambassador
    priority: 9,
    trigger: {
      entity_type: ['product'],
      event_type: ['created'],
      severity: ['critical'],
    },
    agent: {
      type: 'brand-ambassador',
      skill: 'page-generator',
      tools: ['browser', 'read', 'write', 'image'],
      confidence_threshold: 0.90,
      max_execution_time: 600000, // 10 minutes
    },
    actions: {
      auto_approve: ['generate_page', 'publish_r2', 'update_sitemap'],
      require_approval: ['major_content_changes'],
      rollback_enabled: true,
    },
    rate_limit: {
      max_per_hour: 5,
      max_per_day: 50,
    },
  },
  {
    id: 'disclaimer-compliance',
    name: 'Disclaimer Text Compliance Check',
    description: 'Validates disclaimer text against compliance templates',
    enabled: true,
    priority: 8,
    trigger: {
      entity_type: ['product', 'offer'],
      event_type: ['disclaimer_changed'],
    },
    agent: {
      type: 'compliance-checker',
      skill: 'compliance-checker',
      tools: ['read'],
      confidence_threshold: 0.95,
      max_execution_time: 30000, // 30 seconds
    },
    actions: {
      auto_approve: ['approve_compliant'],
      require_approval: ['flag_non_compliant', 'notify_legal'],
      rollback_enabled: true,
    },
    rate_limit: {
      max_per_hour: 20,
      max_per_day: 200,
    },
  },
  {
    id: 'variant-sync',
    name: 'Variant Data Synchronization',
    description: 'Syncs variant data with OEM source when changes detected',
    enabled: true,
    priority: 7,
    trigger: {
      entity_type: ['product'],
      event_type: ['updated'],
    },
    agent: {
      type: 'variant-sync',
      skill: 'variant-sync',
      tools: ['browser', 'read', 'edit'],
      confidence_threshold: 0.85,
      max_execution_time: 240000, // 4 minutes
    },
    actions: {
      auto_approve: ['sync_variants', 'update_pricing'],
      require_approval: ['remove_variants'],
      rollback_enabled: true,
    },
    rate_limit: {
      max_per_hour: 15,
      max_per_day: 150,
    },
  },
];

// ============================================================================
// Workflow Router
// ============================================================================

export interface MatchedWorkflow {
  workflow: WorkflowDefinition;
  changeEvent: ChangeEvent;
  matchScore: number; // 0.0-1.0, higher = better match
}

export class WorkflowRouter {
  private supabase: SupabaseClient;
  private workflows: WorkflowDefinition[];
  private rateLimitCounters: Map<string, { hourly: number; daily: number; lastReset: Date }>;

  constructor(supabase: SupabaseClient, customWorkflows?: WorkflowDefinition[]) {
    this.supabase = supabase;
    this.workflows = customWorkflows || WORKFLOWS;
    this.rateLimitCounters = new Map();
  }

  /**
   * Match a change event to applicable workflows
   */
  matchWorkflows(changeEvent: ChangeEvent): MatchedWorkflow[] {
    const matches: MatchedWorkflow[] = [];

    for (const workflow of this.workflows) {
      if (!workflow.enabled) continue;

      const matchScore = this.calculateMatchScore(workflow, changeEvent);
      if (matchScore > 0) {
        matches.push({ workflow, changeEvent, matchScore });
      }
    }

    // Sort by priority (descending) then match score (descending)
    return matches.sort((a, b) => {
      if (a.workflow.priority !== b.workflow.priority) {
        return b.workflow.priority - a.workflow.priority;
      }
      return b.matchScore - a.matchScore;
    });
  }

  /**
   * Calculate how well a workflow matches a change event
   * Returns 0.0-1.0 score
   */
  private calculateMatchScore(workflow: WorkflowDefinition, event: ChangeEvent): number {
    let score = 0;
    let maxScore = 0;

    // Entity type match (weight: 0.4)
    maxScore += 0.4;
    if (!workflow.trigger.entity_type || workflow.trigger.entity_type.includes(event.entity_type)) {
      score += 0.4;
    } else {
      return 0; // Hard requirement
    }

    // Event type match (weight: 0.3)
    maxScore += 0.3;
    if (!workflow.trigger.event_type || workflow.trigger.event_type.includes(event.event_type)) {
      score += 0.3;
    }

    // Severity match (weight: 0.3)
    maxScore += 0.3;
    if (!workflow.trigger.severity || workflow.trigger.severity.includes(event.severity)) {
      score += 0.3;
    }

    // Condition match (advanced SQL-like conditions)
    // TODO: Implement condition evaluation if needed

    return score / maxScore;
  }

  /**
   * Check if workflow is within rate limits
   */
  checkRateLimit(workflowId: string): { allowed: boolean; reason?: string } {
    const workflow = this.workflows.find(w => w.id === workflowId);
    if (!workflow?.rate_limit) return { allowed: true };

    const counter = this.rateLimitCounters.get(workflowId) || {
      hourly: 0,
      daily: 0,
      lastReset: new Date(),
    };

    const now = new Date();
    const hoursSinceReset = (now.getTime() - counter.lastReset.getTime()) / (1000 * 60 * 60);

    // Reset hourly counter
    if (hoursSinceReset >= 1) {
      counter.hourly = 0;
    }

    // Reset daily counter
    if (hoursSinceReset >= 24) {
      counter.daily = 0;
      counter.lastReset = now;
    }

    // Check hourly limit
    if (workflow.rate_limit.max_per_hour && counter.hourly >= workflow.rate_limit.max_per_hour) {
      return {
        allowed: false,
        reason: `Hourly rate limit exceeded (${workflow.rate_limit.max_per_hour}/hour)`,
      };
    }

    // Check daily limit
    if (workflow.rate_limit.max_per_day && counter.daily >= workflow.rate_limit.max_per_day) {
      return {
        allowed: false,
        reason: `Daily rate limit exceeded (${workflow.rate_limit.max_per_day}/day)`,
      };
    }

    // Increment counters
    counter.hourly++;
    counter.daily++;
    this.rateLimitCounters.set(workflowId, counter);

    return { allowed: true };
  }

  /**
   * Process a change event by routing to appropriate workflows
   */
  async processChangeEvent(changeEvent: ChangeEvent): Promise<{
    matched: MatchedWorkflow[];
    spawned: string[]; // Agent IDs
    skipped: { workflow: string; reason: string }[];
  }> {
    const matched = this.matchWorkflows(changeEvent);
    const spawned: string[] = [];
    const skipped: { workflow: string; reason: string }[] = [];

    console.log(`[WorkflowRouter] Found ${matched.length} matching workflows for event ${changeEvent.id}`);

    for (const match of matched) {
      // Check rate limits
      const rateCheck = this.checkRateLimit(match.workflow.id);
      if (!rateCheck.allowed) {
        console.log(`[WorkflowRouter] Skipping ${match.workflow.id}: ${rateCheck.reason}`);
        skipped.push({ workflow: match.workflow.id, reason: rateCheck.reason || 'Rate limit' });
        continue;
      }

      // Spawn agent (to be implemented)
      // const agentId = await this.spawnAgent(match);
      // spawned.push(agentId);

      console.log(`[WorkflowRouter] Would spawn ${match.workflow.agent.skill} for ${match.workflow.id} (score: ${match.matchScore.toFixed(2)})`);
    }

    return { matched, spawned, skipped };
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.find(w => w.id === workflowId);
  }

  /**
   * Enable/disable workflow
   */
  async setWorkflowEnabled(workflowId: string, enabled: boolean): Promise<void> {
    const workflow = this.workflows.find(w => w.id === workflowId);
    if (workflow) {
      workflow.enabled = enabled;
      console.log(`[WorkflowRouter] Workflow ${workflowId} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(): WorkflowDefinition[] {
    return this.workflows;
  }
}
