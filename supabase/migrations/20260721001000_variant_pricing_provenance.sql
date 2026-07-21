-- Preserve the location and upstream price taxonomy used for regional pricing.
-- This prevents a postcode-specific driveaway price being mistaken for a
-- national figure or for PACE MLP/RRP.

ALTER TABLE variant_pricing
  ADD COLUMN IF NOT EXISTS source_price_type TEXT,
  ADD COLUMN IF NOT EXISTS source_postcodes JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN variant_pricing.source_price_type IS
  'Upstream price taxonomy, e.g. Nissan Choices Retail with VAT.';

COMMENT ON COLUMN variant_pricing.source_postcodes IS
  'State-to-postcode map used to calculate the stored driveaway fields.';
