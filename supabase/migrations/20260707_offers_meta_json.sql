-- Generic per-offer metadata (e.g. full source payload snapshots).
-- Added for the toyota-theme migration off the DriveAgent WP offers feed:
-- seeded offers store the complete WP post here so consumers keep full fidelity.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS meta_json JSONB DEFAULT '{}'::jsonb;
