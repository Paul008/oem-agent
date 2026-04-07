# Database Performance Indexes — Verification

**Date**: 2026-04-08
**Migration**: `supabase/migrations/20260408_perf_indexes.sql`
**Design**: `2026-04-08-db-perf-indexes-design.md`

## Status

Migration applied to production. Index usage confirmed on the representative query for Tier 2 #6.

## Verified: `idx_products_oem_updated_specs`

**Query** (`src/routes/specs-api.ts:136` — latest-specs fallback):

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, specs_json FROM products
WHERE oem_id = 'kia-au' AND specs_json IS NOT NULL
ORDER BY updated_at DESC LIMIT 1;
```

**Plan**:

```
Limit  (cost=0.28..1.17 rows=1 width=647) (actual time=0.061..0.061 rows=1 loops=1)
  Buffers: shared hit=1 read=2
  ->  Index Scan using idx_products_oem_updated_specs on products
        (cost=0.28..84.30 rows=94 width=647) (actual time=0.060..0.060 rows=1 loops=1)
        Index Cond: (oem_id = 'kia-au'::text)
        Buffers: shared hit=1 read=2
Planning Time: 0.165 ms
Execution Time: 0.100 ms
```

**Analysis**:

- Planner picked `idx_products_oem_updated_specs` — the new partial composite.
- **No `Filter` node** for `specs_json IS NOT NULL` — the partial index predicate excluded NULL rows at build time, so the condition is implicit in the index and requires no post-scan filter.
- **No `Sort` node** — the index ordering `(oem_id, updated_at DESC)` provides the required `ORDER BY` directly; `LIMIT 1` just grabs the top entry.
- **0.1 ms execution, 3 buffer reads** — effectively optimal.

Before this index, the planner would have had to `BitmapAnd` the single-column `idx_products_oem_id` and `idx_products_updated_at` indexes, then filter for `specs_json IS NOT NULL`, then sort. The new partial composite replaces all three steps with a single index range seek.

## Not yet verified

The remaining Tier 1/2 indexes have not been EXPLAIN-checked in production. They are expected to work based on pattern analysis but should be confirmed opportunistically:

- `idx_products_oem_title` — run any `upsertProduct` sync, check logs
- `idx_source_pages_oem_due` — next crawl trigger, check `EXPLAIN` on the `getDuePages` query
- `idx_offers_validity_end_active` — next `crawl-doctor` nightly run
- `idx_source_pages_oem_error` — next `crawl-doctor` error sweep
- `idx_import_runs_started_at` — next `crawl-doctor` diagnostics pass

Tier 3 indexes (`change_events`, `agent_actions`, `ai_inference_log` composites) are speculative and should be reviewed once `pg_stat_statements` is enabled (see follow-ups below).

## Follow-ups

1. **Enable `pg_stat_statements`** (Supabase dashboard → Database → Extensions). Single click. After a few days of production traffic, re-run the top-20-slow-queries check to see:
   - Whether the Tier 1/2 indexes moved the needle (expected: yes)
   - Whether the Tier 3 indexes are being used at all (expected: usage varies by dashboard traffic)
   - What's *still* slow that wasn't visible in the code-path survey

2. **Drop candidates** — flagged but not acted on:
   - `idx_source_pages_last_checked_at` — likely redundant now that `idx_source_pages_due` covers the same pattern
   - `idx_source_pages_is_active` — looks legacy; the `status` column is the active signal, not `is_active`

   Dropping these needs write-rate evidence from `pg_stat_user_indexes.idx_scan` over a few days.

3. **N+1 in dealer API** (`src/routes/dealer-api.ts:173`) — flagged by the code-path survey. Indexes won't fix this; it's a batching refactor in a separate task.
