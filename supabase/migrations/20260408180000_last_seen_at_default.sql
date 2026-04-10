-- Fix: last_seen_at columns have no default, causing NULL for seeded rows
-- which renders as 1/1/1970 (Unix epoch) in the dashboard.

-- Add default NOW() so future inserts always get a timestamp
ALTER TABLE products ALTER COLUMN last_seen_at SET DEFAULT now();
ALTER TABLE offers ALTER COLUMN last_seen_at SET DEFAULT now();
ALTER TABLE banners ALTER COLUMN last_seen_at SET DEFAULT now();

-- Backfill NULL values with created_at (best available approximation)
UPDATE products SET last_seen_at = COALESCE(updated_at, created_at, now()) WHERE last_seen_at IS NULL;
UPDATE offers SET last_seen_at = COALESCE(updated_at, created_at, now()) WHERE last_seen_at IS NULL;
UPDATE banners SET last_seen_at = COALESCE(updated_at, created_at, now()) WHERE last_seen_at IS NULL;
