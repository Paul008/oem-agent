-- Preserve dedicated 360 frame sets separately from ordinary colour galleries.
-- Nissan Helios uses exterior E01-E36 and interior I01-I36 sequences.

ALTER TABLE variant_colors
  ADD COLUMN IF NOT EXISTS exterior_360_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS interior_360_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN variant_colors.exterior_360_urls IS
  'Ordered exterior 360 frame URLs; empty when the source has no approved 360 set.';

COMMENT ON COLUMN variant_colors.interior_360_urls IS
  'Ordered interior 360 frame URLs; empty when the source has no approved 360 set.';
