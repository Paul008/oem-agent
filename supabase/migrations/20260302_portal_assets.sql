-- Portal assets table: generic storage for OEM marketing portal assets
-- Initially populated from Kia AU Sesimi portal (Algolia → Cloudinary)

-- ═══════════════ TABLE ═══════════════

CREATE TABLE IF NOT EXISTS portal_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  portal_id UUID REFERENCES oem_portals(id) ON DELETE SET NULL,

  -- External IDs
  external_id TEXT NOT NULL,
  external_source TEXT NOT NULL,  -- 'sesimi_algolia', 'adobe_dam', etc.

  -- Metadata
  name TEXT NOT NULL,
  description TEXT,
  asset_type TEXT NOT NULL DEFAULT 'IMAGE',  -- IMAGE, VIDEO, TEMPLATE, DOCUMENT, OTHER

  -- Tags/categories (JSONB arrays)
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- CDN info
  cdn_provider TEXT,      -- 'cloudinary', 's3', etc.
  cdn_id TEXT,            -- Cloudinary public_id
  cdn_url TEXT NOT NULL,  -- Full public URL (original quality)

  -- Dimensions/format
  width INT,
  height INT,
  original_format TEXT,   -- 'png', 'jpg', 'mp4'
  file_size_bytes BIGINT,

  -- Pre-computed export sizes from Sesimi
  export_sizes JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Parsed from asset name
  parsed_model TEXT,
  parsed_trim TEXT,
  parsed_color TEXT,
  parsed_angle TEXT,  -- 'profile', 'front', 'rear', 'side'

  -- Tracking
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(oem_id, external_source, external_id)
);

-- ═══════════════ FK ON variant_colors ═══════════════

ALTER TABLE variant_colors
  ADD COLUMN IF NOT EXISTS portal_asset_id UUID REFERENCES portal_assets(id) ON DELETE SET NULL;

-- ═══════════════ INDEXES ═══════════════

CREATE INDEX IF NOT EXISTS idx_portal_assets_oem_id ON portal_assets(oem_id);
CREATE INDEX IF NOT EXISTS idx_portal_assets_portal_id ON portal_assets(portal_id);
CREATE INDEX IF NOT EXISTS idx_portal_assets_asset_type ON portal_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_portal_assets_parsed_model ON portal_assets(parsed_model);
CREATE INDEX IF NOT EXISTS idx_portal_assets_external_id ON portal_assets(external_id);
CREATE INDEX IF NOT EXISTS idx_portal_assets_tags ON portal_assets USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_variant_colors_portal_asset ON variant_colors(portal_asset_id);

-- ═══════════════ RLS ═══════════════

ALTER TABLE portal_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_portal_assets" ON portal_assets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_portal_assets" ON portal_assets
  FOR SELECT TO authenticated USING (true);

-- ═══════════════ REALTIME ═══════════════

ALTER PUBLICATION supabase_realtime ADD TABLE portal_assets;

-- ═══════════════ COVERAGE VIEW ═══════════════

CREATE OR REPLACE VIEW portal_asset_coverage AS
SELECT
  oem_id,
  parsed_model,
  COUNT(*) AS total_assets,
  COUNT(*) FILTER (WHERE asset_type = 'IMAGE') AS image_count,
  COUNT(*) FILTER (WHERE parsed_angle IS NOT NULL) AS render_count,
  COUNT(DISTINCT parsed_color) AS unique_colors,
  COUNT(DISTINCT parsed_angle) AS unique_angles,
  array_agg(DISTINCT parsed_angle) FILTER (WHERE parsed_angle IS NOT NULL) AS angles_available
FROM portal_assets
WHERE is_active = true
GROUP BY oem_id, parsed_model;
