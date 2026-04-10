-- Add source URL tracking columns for R2 image mirroring
-- These store the original OEM CDN URLs so the mirror script can detect
-- when a seed script has overwritten R2 URLs with fresh OEM URLs.

ALTER TABLE variant_colors
  ADD COLUMN IF NOT EXISTS source_hero_url TEXT,
  ADD COLUMN IF NOT EXISTS source_swatch_url TEXT,
  ADD COLUMN IF NOT EXISTS source_gallery_urls JSONB;
