# Database Performance Indexes

**Date**: 2026-04-08
**Status**: Approved
**Scope**: Add targeted btree indexes to Supabase Postgres to speed up cron jobs and dashboard/dealer API queries.

## Problem

Cron jobs and high-traffic API routes hit query patterns that either:
- Scan tables sequentially because no index matches the `WHERE` clause
- Match an index on one column but still need an in-memory sort for the `ORDER BY`
- Match two single-column indexes via `BitmapAnd` merge instead of one composite

None of this is catastrophic at today's data volume (~1k products, ~6k variant_colors, ~5k source_pages), but cron work compounds: `source_pages` crawl scheduling runs 100+ times/day, `upsertProduct` title lookups fire thousands of times per sync, and every extra millisecond is paid back repeatedly.

## Evidence

Combined input from:
1. **Code path survey** (Explore agent, see brainstorming transcript) — mapped hot queries across `src/orchestrator.ts`, `src/sync/*`, `src/routes/*`, with file:line references.
2. **Live existing-index dump** (`pg_index` query on production) — confirmed what's already there so we don't duplicate.

`pg_stat_statements` was not available, so "total time" measurements are unavailable. Post-deploy we should enable the extension and re-check. This is a known gap.

## Design

One migration: `supabase/migrations/20260408_perf_indexes.sql`.

9 indexes, grouped into three tiers. All use `CREATE INDEX IF NOT EXISTS` (matching existing project convention — tables are small enough that concurrent index creation isn't needed).

### Tier 1 — Critical (hot cron paths)

**1. `products (oem_id, title)`**
- **Query**: `src/orchestrator.ts:3406` — `SELECT id, title FROM products WHERE oem_id = ? AND title = ? LIMIT 1`
- **Context**: Called for every extracted product during `upsertProduct()`. Thousands per sync, blocks downstream variant_colors/pricing inserts.
- **Current**: only `idx_products_oem_id` — planner filters by oem_id then does a linear scan of matching rows for title match.
- **Gap**: composite index converts the lookup to a single index seek.

**2. `source_pages (oem_id, last_checked_at) WHERE status = 'active'`**
- **Query**: `src/orchestrator.ts:1244` — `SELECT * FROM source_pages WHERE oem_id = ? AND status = 'active' ORDER BY last_checked_at ASC LIMIT 100`
- **Context**: Every crawl trigger; 5+ times/day per OEM × 19 OEMs.
- **Current**: `idx_source_pages_due (last_checked_at, status) WHERE status='active'` and `idx_source_pages_active_oem (oem_id, status) WHERE status='active'`. Neither matches `WHERE oem_id=? ORDER BY last_checked_at` — planner picks one, then sorts.
- **Gap**: this composite exactly matches the access pattern — index scan, no sort.

**3. `offers (validity_end) WHERE validity_end IS NOT NULL`**
- **Query**: `src/sync/crawl-doctor.ts:217` — `WHERE validity_end IS NOT NULL AND validity_end < NOW()`
- **Context**: Nightly crawl-doctor expiry sweep. Grows unbounded as offers accumulate.
- **Current**: no index on `validity_end`.
- **Gap**: partial index on the only rows we ever query.

### Tier 2 — High value

**4. `source_pages (oem_id) WHERE status = 'error'`**
- **Query**: `src/sync/crawl-doctor.ts:74` — error page triage.
- **Current**: no matching index. `idx_source_pages_status` exists but indexes all status values.
- **Gap**: partial index is much smaller and direct.

**5. `import_runs (started_at DESC)`**
- **Query**: `src/sync/crawl-doctor.ts:164` — `WHERE started_at >= ?`
- **Current**: has `created_at` index, not `started_at` (different columns).
- **Gap**: range scan instead of seq scan.

**6. `products (oem_id, updated_at DESC) WHERE specs_json IS NOT NULL`**
- **Query**: `src/routes/specs-api.ts:136` — fallback spec lookup.
- **Current**: `idx_products_oem_id` + `idx_products_updated_at` separately — requires bitmap merge.
- **Gap**: partial covering index hits the exact pattern.

### Tier 3 — Dashboard listing composites (new findings from schema review)

These are lower-confidence than Tier 1/2 because we haven't measured them directly, but the pattern is textbook: individual single-column indexes exist but the dashboard queries combine them.

**7. `change_events (oem_id, created_at DESC)`**
- Dashboard "recent events for OEM" pattern.

**8. `agent_actions (oem_id, status, created_at DESC)`**
- Agent actions admin listing per OEM.

**9. `ai_inference_log (oem_id, request_timestamp DESC)`**
- AI inference log dashboard pagination per OEM.

## Not in scope

Explicitly deferred to keep this focused:

- **No code changes** — N+1 risks in the dealer API (flagged by the explore agent) need a batching refactor, not an index. Separate task.
- **No index drops** — `source_pages` has 8 indexes, some likely redundant (`idx_source_pages_last_checked_at` standalone now that `idx_source_pages_due` exists; `idx_source_pages_is_active` looks legacy). Dropping needs write-rate evidence we don't have.
- **No materialized views** — the `model_overview` view aggregates across 4 tables and could benefit, but that's an architectural change.
- **No `pg_stat_statements` enablement** — one-line Supabase dashboard toggle. Should be done separately so we can measure index impact post-deploy.

## Verification plan

After applying the migration:

1. Run `EXPLAIN (ANALYZE, BUFFERS)` on each Tier 1 representative query. Confirm planner picks the new index and `Seq Scan` → `Index Scan` or `Index Only Scan`.
2. Capture output to `docs/superpowers/specs/2026-04-08-db-perf-indexes-verification.md`.
3. **Follow-up** (separate): enable `pg_stat_statements`, let it run for a few days, then re-check the top-20-slow-queries list to see what still needs work.

## Rollback

Each index is independent. To roll back, drop by name:
```sql
DROP INDEX IF EXISTS idx_products_oem_title;
-- etc.
```
No data risk.

## Write-cost considerations

Every index adds overhead to INSERT/UPDATE on its table. For the tables touched here:

- `products`: heavy write path (upsertProduct). Adding 2 indexes. Each `UPDATE` with a covered column now updates 2 extra index entries. Low concern — writes are batched per sync, not per request.
- `source_pages`: moderate write (last_checked_at update per crawl). Adding 2 partial indexes. Partial indexes only update when the row matches the predicate — low overhead.
- `offers`: low write volume. Adding 1 partial. Negligible.
- `import_runs`, `change_events`, `agent_actions`, `ai_inference_log`: append-heavy but low row rate. Negligible.

Net: index cost is well under the read savings on any plausible workload.
