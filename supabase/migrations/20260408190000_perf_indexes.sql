-- Performance indexes for cron + dashboard hot paths
-- Design: docs/superpowers/specs/2026-04-08-db-perf-indexes-design.md
-- All indexes use IF NOT EXISTS so this migration is safe to re-run.

-- ============================================================================
-- Tier 1 — Critical (hot cron paths)
-- ============================================================================

-- 1. products(oem_id, title)
-- Serves: src/orchestrator.ts:3406 upsertProduct() title lookup.
-- Thousands of calls per sync run. Currently filtered by oem_id index then
-- linearly scanned; composite converts to single seek.
CREATE INDEX IF NOT EXISTS idx_products_oem_title
  ON products (oem_id, title);

-- 2. source_pages(oem_id, last_checked_at) WHERE status='active'
-- Serves: src/orchestrator.ts:1244 getDuePages() crawl scheduler.
-- Runs 100+ times/day. Existing idx_source_pages_due and
-- idx_source_pages_active_oem don't match the oem_id + last_checked_at ORDER BY
-- pattern, forcing an in-memory sort. Partial index scoped to 'active' rows.
CREATE INDEX IF NOT EXISTS idx_source_pages_oem_due
  ON source_pages (oem_id, last_checked_at)
  WHERE status = 'active';

-- 3. offers(validity_end) WHERE validity_end IS NOT NULL
-- Serves: src/sync/crawl-doctor.ts:217 nightly expiry sweep.
-- Partial index avoids indexing the (likely majority) NULL rows.
CREATE INDEX IF NOT EXISTS idx_offers_validity_end_active
  ON offers (validity_end)
  WHERE validity_end IS NOT NULL;

-- ============================================================================
-- Tier 2 — High value
-- ============================================================================

-- 4. source_pages error triage for crawl-doctor
-- Serves: src/sync/crawl-doctor.ts:74
-- idx_source_pages_status indexes all statuses; this partial is smaller
-- and directly matches the error-only query.
CREATE INDEX IF NOT EXISTS idx_source_pages_oem_error
  ON source_pages (oem_id)
  WHERE status = 'error';

-- 5. import_runs(started_at DESC)
-- Serves: src/sync/crawl-doctor.ts:164 recent runs by started_at.
-- Note: existing idx_import_runs_created_at is on created_at, a different column.
CREATE INDEX IF NOT EXISTS idx_import_runs_started_at
  ON import_runs (started_at DESC);

-- 6. products(oem_id, updated_at DESC) WHERE specs_json IS NOT NULL
-- Serves: src/routes/specs-api.ts:136 latest-specs fallback.
-- Partial composite replaces bitmap merge of two single-column indexes.
CREATE INDEX IF NOT EXISTS idx_products_oem_updated_specs
  ON products (oem_id, updated_at DESC)
  WHERE specs_json IS NOT NULL;

-- ============================================================================
-- Tier 3 — Dashboard listing composites
-- ============================================================================

-- 7. change_events(oem_id, created_at DESC)
-- Serves: dashboard "recent events for OEM" pattern.
-- Replaces bitmap merge of idx_change_events_oem_id + idx_change_events_created_at.
CREATE INDEX IF NOT EXISTS idx_change_events_oem_created
  ON change_events (oem_id, created_at DESC);

-- 8. agent_actions(oem_id, status, created_at DESC)
-- Serves: agent actions admin listing per OEM, often filtered by status.
CREATE INDEX IF NOT EXISTS idx_agent_actions_oem_status_created
  ON agent_actions (oem_id, status, created_at DESC);

-- 9. ai_inference_log(oem_id, request_timestamp DESC)
-- Serves: AI inference log dashboard pagination per OEM.
CREATE INDEX IF NOT EXISTS idx_ai_inference_log_oem_ts
  ON ai_inference_log (oem_id, request_timestamp DESC);
