-- Add extracted_specs columns to vehicle_models for AI-extracted PDF specs
ALTER TABLE vehicle_models
  ADD COLUMN IF NOT EXISTS extracted_specs JSONB,
  ADD COLUMN IF NOT EXISTS extracted_specs_source TEXT,
  ADD COLUMN IF NOT EXISTS extracted_specs_at TIMESTAMPTZ;

COMMENT ON COLUMN vehicle_models.extracted_specs IS 'AI-extracted structured specs from brochure PDF — flexible categorised JSON with well-known keys';
COMMENT ON COLUMN vehicle_models.extracted_specs_source IS 'Source of extraction: pdf_brochure, pdf_spec_sheet, manual';
COMMENT ON COLUMN vehicle_models.extracted_specs_at IS 'When specs were last extracted';

-- Index for finding models needing extraction
CREATE INDEX IF NOT EXISTS idx_vehicle_models_specs_status
  ON vehicle_models(oem_id) WHERE brochure_url IS NOT NULL AND extracted_specs IS NULL;
