ALTER TABLE banners
  ADD COLUMN IF NOT EXISTS has_graphics BOOLEAN,
  ADD COLUMN IF NOT EXISTS graphics_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS graphics_confidence NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS graphics_summary TEXT,
  ADD COLUMN IF NOT EXISTS graphics_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS graphics_model TEXT;

CREATE INDEX IF NOT EXISTS idx_banners_has_graphics
  ON banners(has_graphics)
  WHERE has_graphics IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_banners_graphics_tags
  ON banners USING GIN(graphics_tags);
