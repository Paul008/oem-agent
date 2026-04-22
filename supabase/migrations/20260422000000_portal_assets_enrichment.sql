-- Enrich portal_assets with per-asset metadata captured from DAM detail
-- endpoints (initially Ford Image Library metaList). Relationships between
-- assets are derived via shared metadata (nameplate, interface_id) rather
-- than explicit edges, since FIL does not expose a graph.

ALTER TABLE portal_assets
  ADD COLUMN IF NOT EXISTS record_name TEXT,
  ADD COLUMN IF NOT EXISTS nameplate TEXT,
  ADD COLUMN IF NOT EXISTS model_label TEXT,
  ADD COLUMN IF NOT EXISTS color_label TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS asset_type_label TEXT,  -- F_AssetTypes select value ("Campaign Material", etc.)
  ADD COLUMN IF NOT EXISTS usage_rights TEXT,
  ADD COLUMN IF NOT EXISTS job_number TEXT,
  ADD COLUMN IF NOT EXISTS copyright_notice TEXT,
  ADD COLUMN IF NOT EXISTS keywords TEXT[],
  ADD COLUMN IF NOT EXISTS discontinued BOOLEAN,
  ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appearance_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS modified_by TEXT,
  ADD COLUMN IF NOT EXISTS interface_id TEXT,        -- groups variants of the same asset in DAM
  ADD COLUMN IF NOT EXISTS category_id TEXT,          -- leaf category (cid from search results)
  ADD COLUMN IF NOT EXISTS category_path TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,            -- full metaList map, one row per field
  ADD COLUMN IF NOT EXISTS metadata_hydrated_at TIMESTAMPTZ;

-- Filter-friendly indexes for common queries
CREATE INDEX IF NOT EXISTS idx_portal_assets_nameplate      ON portal_assets (nameplate)      WHERE nameplate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_assets_interface_id   ON portal_assets (interface_id)   WHERE interface_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_assets_media_type     ON portal_assets (media_type)     WHERE media_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_assets_asset_type_lbl ON portal_assets (asset_type_label) WHERE asset_type_label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_assets_category_id    ON portal_assets (category_id)    WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_assets_keywords       ON portal_assets USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_portal_assets_metadata       ON portal_assets USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_portal_assets_name_trgm      ON portal_assets USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_portal_assets_not_expired    ON portal_assets (expiry_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_portal_assets_hydrate_queue  ON portal_assets (oem_id) WHERE metadata_hydrated_at IS NULL;

-- pg_trgm is needed for the ILIKE-friendly GIN index above.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ═══════════════ RELATIONSHIPS ═══════════════
-- Campaigns: group by (oem_id, nameplate). Exposes a canonical hero
-- (first IMAGE by appearance_date) and sibling counts.
CREATE OR REPLACE VIEW portal_asset_campaigns AS
SELECT
  oem_id,
  nameplate,
  COUNT(*)                                            AS asset_count,
  COUNT(*) FILTER (WHERE asset_type = 'IMAGE')        AS image_count,
  COUNT(*) FILTER (WHERE asset_type = 'VIDEO')        AS video_count,
  COUNT(DISTINCT parsed_model)                        AS model_count,
  MIN(appearance_date)                                AS first_appearance_at,
  MAX(expiry_date)                                    AS last_expiry_at,
  (ARRAY_AGG(cdn_url ORDER BY appearance_date DESC NULLS LAST)
    FILTER (WHERE asset_type = 'IMAGE'))[1]           AS hero_cdn_url,
  (ARRAY_AGG(id ORDER BY appearance_date DESC NULLS LAST)
    FILTER (WHERE asset_type = 'IMAGE'))[1]           AS hero_asset_id
FROM portal_assets
WHERE is_active = true AND nameplate IS NOT NULL
GROUP BY oem_id, nameplate;

-- Update coverage view to be resilient if parsed_model gets normalised later.
-- (Keeping original definition — this migration doesn't change it.)
