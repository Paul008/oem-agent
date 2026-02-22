-- ============================================================================
-- Design Memory: extraction_runs + oems.design_profile_json
-- ============================================================================

-- 1. Extraction run history — tracks every page extraction with quality metrics
CREATE TABLE IF NOT EXISTS extraction_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  model_slug TEXT NOT NULL,
  pipeline TEXT NOT NULL,                    -- 'capturer' | 'cloner' | 'structurer' | 'generator'
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  sections_extracted INT DEFAULT 0,
  quality_score NUMERIC(3,2),                -- 0.00–1.00
  total_tokens INT,
  total_cost_usd NUMERIC(10,6),
  errors_json JSONB DEFAULT '[]',
  successful_selectors JSONB DEFAULT '[]',
  failed_selectors JSONB DEFAULT '[]',
  prompt_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE extraction_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY extraction_runs_service_role ON extraction_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_extraction_runs_oem ON extraction_runs(oem_id);
CREATE INDEX idx_extraction_runs_status ON extraction_runs(status);
CREATE INDEX idx_extraction_runs_oem_model ON extraction_runs(oem_id, model_slug);
CREATE INDEX idx_extraction_runs_started ON extraction_runs(started_at DESC);

-- 2. Per-OEM design profile (accumulated learning) on existing oems table
ALTER TABLE oems ADD COLUMN IF NOT EXISTS design_profile_json JSONB DEFAULT '{}';
