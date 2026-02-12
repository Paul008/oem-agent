-- ============================================================================
-- AI Inference Logging (Section 10.6 — Cost tracking and quality review)
-- ============================================================================

CREATE TABLE ai_inference_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT REFERENCES oems(id) ON DELETE SET NULL,
  import_run_id UUID REFERENCES import_runs(id) ON DELETE SET NULL,
  -- Request tracking
  provider TEXT NOT NULL, -- 'groq', 'together', 'anthropic', 'cloudflare_ai_gateway'
  model TEXT NOT NULL, -- e.g., 'openai/gpt-oss-120b', 'moonshotai/Kimi-K2.5'
  task_type TEXT NOT NULL, -- 'html_normalisation', 'llm_extraction', 'diff_classification', 'change_summary', 'design_pre_screening', 'design_vision', 'sales_conversation', 'content_generation'
  -- Token usage (from provider response)
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  -- Cost tracking
  cost_usd NUMERIC(10, 6),
  -- Request/response metadata
  latency_ms INTEGER,
  request_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_timestamp TIMESTAMPTZ,
  -- Content hashes (for deduplication/debugging, not full content)
  prompt_hash TEXT, -- SHA256 of prompt
  response_hash TEXT, -- SHA256 of response
  -- Status and errors
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'timeout', 'rate_limited')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  -- Routing info
  was_fallback BOOLEAN DEFAULT false, -- Whether this was a fallback model call
  fallback_reason TEXT, -- Why fallback was used
  -- Batch info
  batch_id UUID, -- For grouping batch API calls
  batch_discount_applied BOOLEAN DEFAULT false,
  -- Extra metadata
  metadata_json JSONB DEFAULT '{}'
);

ALTER TABLE ai_inference_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_inference_log_service_role_policy ON ai_inference_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes for cost analysis and debugging
CREATE INDEX idx_ai_inference_log_oem_id ON ai_inference_log(oem_id);
CREATE INDEX idx_ai_inference_log_import_run_id ON ai_inference_log(import_run_id);
CREATE INDEX idx_ai_inference_log_provider ON ai_inference_log(provider);
CREATE INDEX idx_ai_inference_log_model ON ai_inference_log(model);
CREATE INDEX idx_ai_inference_log_task_type ON ai_inference_log(task_type);
CREATE INDEX idx_ai_inference_log_request_timestamp ON ai_inference_log(request_timestamp);
CREATE INDEX idx_ai_inference_log_status ON ai_inference_log(status);

-- View for monthly cost analysis
CREATE VIEW ai_inference_cost_summary AS
SELECT
  date_trunc('month', request_timestamp) AS month,
  provider,
  model,
  task_type,
  COUNT(*) AS call_count,
  SUM(prompt_tokens) AS total_prompt_tokens,
  SUM(completion_tokens) AS total_completion_tokens,
  SUM(total_tokens) AS total_tokens,
  SUM(cost_usd) AS total_cost_usd,
  AVG(latency_ms)::INTEGER AS avg_latency_ms
FROM ai_inference_log
WHERE status = 'success'
GROUP BY date_trunc('month', request_timestamp), provider, model, task_type
ORDER BY month DESC, total_cost_usd DESC;

-- ============================================================================
-- Update source_pages with additional columns from spec
-- ============================================================================

ALTER TABLE source_pages
  ADD COLUMN IF NOT EXISTS last_rendered_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'removed', 'error', 'blocked')),
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_source_pages_status ON source_pages(status);
CREATE INDEX IF NOT EXISTS idx_source_pages_type ON source_pages(oem_id, page_type);

-- ============================================================================
-- Update import_runs with additional columns from spec
-- ============================================================================

ALTER TABLE import_runs
  ADD COLUMN IF NOT EXISTS pages_changed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages_errored INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS products_upserted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offers_upserted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS banners_upserted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_json JSONB;

-- ============================================================================
-- Update brand_tokens with additional columns from spec
-- ============================================================================

ALTER TABLE brand_tokens
  ADD COLUMN IF NOT EXISTS source_pages_json JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS screenshot_r2_keys_json JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_brand_tokens_active ON brand_tokens(oem_id) WHERE is_active = true;

-- ============================================================================
-- Update page_layouts with additional columns from spec
-- ============================================================================

ALTER TABLE page_layouts
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_tokens_id UUID REFERENCES brand_tokens(id),
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_page_layouts_active ON page_layouts(oem_id, page_type) WHERE is_active = true;

-- ============================================================================
-- Update design_captures with additional columns from spec
-- ============================================================================

ALTER TABLE design_captures
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS trigger_type TEXT CHECK (trigger_type IN ('initial', 'visual_change', 'manual', 'quarterly_audit')),
  ADD COLUMN IF NOT EXISTS phash_desktop TEXT,
  ADD COLUMN IF NOT EXISTS phash_mobile TEXT,
  ADD COLUMN IF NOT EXISTS phash_distance_from_previous NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS kimi_request_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS kimi_response_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS kimi_cost_usd NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_design_captures_status ON design_captures(status);
CREATE INDEX IF NOT EXISTS idx_design_captures_trigger ON design_captures(oem_id, trigger_type);
