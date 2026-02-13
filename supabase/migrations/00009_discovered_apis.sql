-- ============================================================================
-- Table: discovered_apis
-- Smart Mode API Discovery
-- Stores APIs discovered during browser rendering for direct future calls
-- ============================================================================

CREATE TABLE discovered_apis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  source_page_id UUID REFERENCES source_pages(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  content_type TEXT,
  response_type TEXT DEFAULT 'json',
  sample_request_headers JSONB,
  sample_request_body TEXT,
  sample_response_hash TEXT,
  data_type TEXT, -- products, offers, inventory, pricing, config, other
  schema_json JSONB,
  reliability_score NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'discovered', -- discovered, verified, stale, error
  last_successful_call TIMESTAMPTZ,
  call_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  discovered_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint on OEM + URL combination
ALTER TABLE discovered_apis ADD CONSTRAINT discovered_apis_oem_url_unique UNIQUE (oem_id, url);

-- Enable RLS
ALTER TABLE discovered_apis ENABLE ROW LEVEL SECURITY;

CREATE POLICY discovered_apis_service_role_policy ON discovered_apis
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes for common queries
CREATE INDEX idx_discovered_apis_oem_id ON discovered_apis(oem_id);
CREATE INDEX idx_discovered_apis_data_type ON discovered_apis(data_type);
CREATE INDEX idx_discovered_apis_status ON discovered_apis(status);
CREATE INDEX idx_discovered_apis_reliability ON discovered_apis(reliability_score DESC);
CREATE INDEX idx_discovered_apis_source_page ON discovered_apis(source_page_id);

-- ============================================================================
-- Table: api_call_logs
-- Tracks individual API calls for monitoring and optimization
-- ============================================================================

CREATE TABLE api_call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discovered_api_id UUID NOT NULL REFERENCES discovered_apis(id) ON DELETE CASCADE,
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  import_run_id UUID REFERENCES import_runs(id) ON DELETE SET NULL,
  request_timestamp TIMESTAMPTZ DEFAULT now(),
  response_timestamp TIMESTAMPTZ,
  status_code INT,
  response_size INT,
  latency_ms INT,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  response_hash TEXT,
  items_extracted INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE api_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_call_logs_service_role_policy ON api_call_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_api_call_logs_api_id ON api_call_logs(discovered_api_id);
CREATE INDEX idx_api_call_logs_oem_id ON api_call_logs(oem_id);
CREATE INDEX idx_api_call_logs_created_at ON api_call_logs(created_at);
CREATE INDEX idx_api_call_logs_success ON api_call_logs(success);

-- Add updated_at trigger for discovered_apis
CREATE OR REPLACE FUNCTION update_discovered_apis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_discovered_apis_updated_at
  BEFORE UPDATE ON discovered_apis
  FOR EACH ROW
  EXECUTE FUNCTION update_discovered_apis_updated_at();

-- ============================================================================
-- View: high_value_apis
-- Pre-filtered view of reliable, data-rich APIs
-- ============================================================================

CREATE VIEW high_value_apis AS
SELECT
  da.*,
  sp.url AS source_page_url,
  sp.page_type AS source_page_type
FROM discovered_apis da
LEFT JOIN source_pages sp ON da.source_page_id = sp.id
WHERE da.reliability_score >= 0.7
  AND da.status IN ('discovered', 'verified')
  AND da.data_type IN ('products', 'offers', 'inventory', 'pricing')
ORDER BY da.reliability_score DESC, da.call_count DESC;

-- Grant access to view
GRANT SELECT ON high_value_apis TO service_role;
