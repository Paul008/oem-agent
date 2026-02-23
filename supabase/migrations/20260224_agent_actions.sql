-- ============================================================================
-- Agent Actions Table
-- ============================================================================
-- Tracks autonomous agent actions in response to change events

CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id TEXT NOT NULL,
  change_event_id UUID REFERENCES change_events(id) ON DELETE CASCADE,
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  agent_id TEXT, -- OpenClaw agent session ID
  status TEXT NOT NULL DEFAULT 'pending',
  confidence_score NUMERIC(3, 2), -- 0.00-1.00
  actions_taken TEXT[] DEFAULT '{}',
  reasoning TEXT,
  execution_time_ms INTEGER,
  cost_usd NUMERIC(10, 6),
  error_message TEXT,
  rollback_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'requires_approval')),
  CONSTRAINT valid_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

COMMENT ON TABLE agent_actions IS 'Autonomous agent actions executed in response to change events';
COMMENT ON COLUMN agent_actions.workflow_id IS 'ID of the workflow that triggered this action';
COMMENT ON COLUMN agent_actions.change_event_id IS 'Change event that triggered this workflow';
COMMENT ON COLUMN agent_actions.agent_id IS 'OpenClaw agent session identifier';
COMMENT ON COLUMN agent_actions.status IS 'Current status: pending, running, completed, failed, requires_approval';
COMMENT ON COLUMN agent_actions.confidence_score IS 'Agent confidence score (0.0-1.0) for the action';
COMMENT ON COLUMN agent_actions.actions_taken IS 'List of actions performed by the agent';
COMMENT ON COLUMN agent_actions.reasoning IS 'Agent explanation of its analysis and decisions';
COMMENT ON COLUMN agent_actions.execution_time_ms IS 'Time taken to execute the workflow in milliseconds';
COMMENT ON COLUMN agent_actions.cost_usd IS 'Cost of AI API calls and compute for this action';
COMMENT ON COLUMN agent_actions.error_message IS 'Error message if the action failed';
COMMENT ON COLUMN agent_actions.rollback_data IS 'Data needed to rollback this action (entity snapshot)';

-- Indexes
CREATE INDEX idx_agent_actions_workflow_id ON agent_actions(workflow_id);
CREATE INDEX idx_agent_actions_change_event_id ON agent_actions(change_event_id);
CREATE INDEX idx_agent_actions_oem_id ON agent_actions(oem_id);
CREATE INDEX idx_agent_actions_status ON agent_actions(status);
CREATE INDEX idx_agent_actions_created_at ON agent_actions(created_at);

-- RLS Policies
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_actions_service_role_policy ON agent_actions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Workflow Settings Table
-- ============================================================================
-- Configuration for autonomous workflows

CREATE TABLE IF NOT EXISTS workflow_settings (
  id TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 5,
  confidence_threshold NUMERIC(3, 2) DEFAULT 0.85,
  rate_limit_hourly INTEGER,
  rate_limit_daily INTEGER,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 10),
  CONSTRAINT valid_threshold CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1)
);

COMMENT ON TABLE workflow_settings IS 'Configuration for autonomous agent workflows';
COMMENT ON COLUMN workflow_settings.id IS 'Workflow identifier (e.g., price-validation, product-enrichment)';
COMMENT ON COLUMN workflow_settings.enabled IS 'Whether this workflow is currently active';
COMMENT ON COLUMN workflow_settings.priority IS 'Workflow priority (1-10, higher = more important)';
COMMENT ON COLUMN workflow_settings.confidence_threshold IS 'Minimum confidence score for auto-execution';
COMMENT ON COLUMN workflow_settings.rate_limit_hourly IS 'Maximum executions per hour';
COMMENT ON COLUMN workflow_settings.rate_limit_daily IS 'Maximum executions per day';
COMMENT ON COLUMN workflow_settings.config IS 'Additional workflow-specific configuration';

-- RLS Policies
ALTER TABLE workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_settings_service_role_policy ON workflow_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Insert Default Workflow Settings
-- ============================================================================

INSERT INTO workflow_settings (id, enabled, priority, confidence_threshold, rate_limit_hourly, rate_limit_daily, config) VALUES
  ('price-validation', true, 10, 0.95, 50, 500, '{"auto_approve_threshold": 0.95}'::jsonb),
  ('product-enrichment', true, 8, 0.85, 20, 200, '{"min_fields_required": 5}'::jsonb),
  ('link-repair', true, 7, 0.90, 30, 300, '{"same_domain_only": true}'::jsonb),
  ('offer-expiry', true, 6, 1.0, 10, 100, '{"archive_grace_period_days": 0}'::jsonb),
  ('image-quality', true, 5, 0.80, 15, 150, '{"min_resolution": "1200x800", "max_filesize_kb": 500}'::jsonb),
  ('new-model-page', false, 9, 0.90, 5, 50, '{"require_manual_review": true}'::jsonb),
  ('disclaimer-compliance', true, 8, 0.95, 20, 200, '{"require_legal_terms": ["driveaway", "excludes"]}'::jsonb),
  ('variant-sync', true, 7, 0.85, 15, 150, '{"allow_deletions": false}'::jsonb)
ON CONFLICT (id) DO NOTHING;
