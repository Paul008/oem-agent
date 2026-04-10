-- Add (oem_id, external_key) unique constraint on products
--
-- Background: src/sync/all-oem-sync.ts (VW path), src/sync/suzuki-sync.ts
-- (planned), and other syncs need
--   .upsert(row, { onConflict: 'oem_id,external_key' })
-- to work. Today there is no such constraint — only (oem_id, title) from
-- migration 00011 — so onConflict silently fails with "no unique or exclusion
-- constraint matching the ON CONFLICT specification".
--
-- The 7 historical (oem_id, external_key) collisions on Apr 8 2026 (Nissan
-- ST/ST+/Advance+ trims and Isuzu LS-U/LS-U+) were resolved manually before
-- this migration ran — the seed scripts (seed-nissan-products.mjs,
-- seed-isuzu-colors.mjs, seed-isuzu-specs.mjs) were also patched so their
-- slugify() preserves "+" as "-plus" instead of stripping it.
--
-- Partial index: NULL external_keys (legacy rows from older OEMs that never
-- set the field) are excluded so we don't fight historical data.

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_oem_external_key_unique
  ON products (oem_id, external_key)
  WHERE external_key IS NOT NULL;
