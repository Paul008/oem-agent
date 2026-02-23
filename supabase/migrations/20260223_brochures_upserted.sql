-- ============================================================================
-- Add brochures_upserted column to import_runs table
-- ============================================================================

ALTER TABLE import_runs
  ADD COLUMN IF NOT EXISTS brochures_upserted INTEGER DEFAULT 0;

COMMENT ON COLUMN import_runs.brochures_upserted IS 'Number of vehicle models with brochure_url created or updated during this import run';
