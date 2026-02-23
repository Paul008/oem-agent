-- Cron job runtime overrides (enable/disable from dashboard)
CREATE TABLE IF NOT EXISTS cron_job_overrides (
  id TEXT PRIMARY KEY,  -- matches cron-jobs.json job id
  enabled BOOLEAN,      -- NULL = use static default, true/false = override
  config JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cron_job_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY cron_job_overrides_service_role ON cron_job_overrides
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY cron_job_overrides_authenticated ON cron_job_overrides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
