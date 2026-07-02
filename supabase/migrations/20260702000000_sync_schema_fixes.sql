-- Sync schema fixes — 2026-07-02
--
-- Root-cause fixes for OEM syncs that were silently failing because the code
-- wrote columns / relied on an ON CONFLICT target that the schema didn't have.
-- PostgREST rejects the whole row on the first unknown column, and ON CONFLICT
-- against a partial unique index raises 42P10 — both surfaced as "success"
-- runs with zeroed counters, so the data quietly went stale for months.
--
-- All statements are idempotent; they mirror changes already applied to
-- production via the Supabase API during the 2026-07-02 debugging session.

-- 1. Toyota + Mitsubishi pricing upserts write source_url for provenance.
alter table public.variant_pricing add column if not exists source_url text;

-- 2. Toyota + Mitsubishi color upserts set updated_at.
alter table public.variant_colors    add column if not exists updated_at timestamptz;
alter table public.oem_color_palette  add column if not exists updated_at timestamptz;

-- 3. Portal asset health check rotates through the least-recently-checked rows.
alter table public.portal_assets add column if not exists last_checked_at timestamptz;
create index if not exists portal_assets_health_rotation_idx
  on public.portal_assets (last_checked_at asc nulls first)
  where is_active;

-- 4. Volkswagen product upsert uses onConflict (oem_id, external_key). The
--    unique index was PARTIAL (WHERE external_key IS NOT NULL), which Postgres
--    cannot infer for ON CONFLICT without repeating the predicate — so every VW
--    product upsert failed with 42P10 and (via `continue`) VW colors + pricing
--    never synced. Replace it with a full unique index. NULL external_keys stay
--    allowed (NULLs are distinct in a unique index).
drop index if exists idx_products_oem_external_key_unique;
create unique index if not exists idx_products_oem_external_key_unique
  on public.products (oem_id, external_key);
