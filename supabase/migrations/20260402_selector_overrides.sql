-- selector_overrides: runtime CSS selector storage for banner-triage agent
-- Allows discovered selectors to override registry.ts without redeployment
CREATE TABLE IF NOT EXISTS selector_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  page_type TEXT NOT NULL DEFAULT 'homepage',
  selector_type TEXT NOT NULL,
  selector_value TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  confidence FLOAT NOT NULL DEFAULT 0.75,
  discovered_by TEXT NOT NULL DEFAULT 'banner-triage',
  validated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_selector_overrides_oem_type
  ON selector_overrides(oem_id, page_type, selector_type);

-- Enable RLS
ALTER TABLE selector_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on selector_overrides"
  ON selector_overrides FOR ALL
  USING (true)
  WITH CHECK (true);
