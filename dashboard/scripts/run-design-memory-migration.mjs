/**
 * Run the design memory migration against Supabase.
 * Creates extraction_runs table + adds design_profile_json to oems.
 * Run: node dashboard/scripts/run-design-memory-migration.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = 'nnihmdmsglkxpmilmjjc'

if (!SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN env var required. Set it in .env or export it.')
  process.exit(1)
}

const sql = `
-- 1. Extraction run history
CREATE TABLE IF NOT EXISTS extraction_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  model_slug TEXT NOT NULL,
  pipeline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  sections_extracted INT DEFAULT 0,
  quality_score NUMERIC(3,2),
  total_tokens INT,
  total_cost_usd NUMERIC(10,6),
  errors_json JSONB DEFAULT '[]',
  successful_selectors JSONB DEFAULT '[]',
  failed_selectors JSONB DEFAULT '[]',
  prompt_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE extraction_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'extraction_runs' AND policyname = 'extraction_runs_service_role'
  ) THEN
    CREATE POLICY extraction_runs_service_role ON extraction_runs
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_extraction_runs_oem ON extraction_runs(oem_id);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_status ON extraction_runs(status);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_oem_model ON extraction_runs(oem_id, model_slug);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_started ON extraction_runs(started_at DESC);

-- 2. Per-OEM design profile
ALTER TABLE oems ADD COLUMN IF NOT EXISTS design_profile_json JSONB DEFAULT '{}';
`

async function runMigration() {
  console.log('Running design memory migration...')

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    console.error(`Migration failed: ${res.status} ${text}`)
    process.exit(1)
  }

  const result = await res.json()
  console.log('Migration result:', JSON.stringify(result, null, 2))

  // Verify
  const { data: tableCheck, error: tableError } = await supabase
    .from('extraction_runs')
    .select('id')
    .limit(1)

  if (tableError) {
    console.error('Table verification failed:', tableError.message)
  } else {
    console.log('✅ extraction_runs table exists and is accessible')
  }

  const { data: oemCheck, error: oemError } = await supabase
    .from('oems')
    .select('id, design_profile_json')
    .limit(1)

  if (oemError) {
    console.error('OEM column verification failed:', oemError.message)
  } else {
    console.log('✅ oems.design_profile_json column exists:', oemCheck?.[0]?.id)
  }
}

runMigration()
