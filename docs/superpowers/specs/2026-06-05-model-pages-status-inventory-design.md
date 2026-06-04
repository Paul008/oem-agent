# Model Pages Status Inventory Design

Written 2026-06-05.

## Goal

Make the Model Pages dashboard reliably identify which generated model pages are structured, clone-only, or still legacy/generated so operators can choose the next clone-only pages to promote into editable sections.

## Current State

`dashboard/src/pages/dashboard/model-pages.vue` lists generated page slugs, prefetches page details for the first batch, and renders a status badge per created model. The current status helper checks only:

- `content.sections.length` for `Structured`
- `content.rendered` containing Tailwind or stylesheet links for `Cloned`
- otherwise `Generated`

This misses mode-aware pages where sections are stored under `content.modes.sections.items`, and it can label uncached page details as `Generated` because `getModelPageData()` returns `null` before the detail request completes.

## Design

Extract page status logic into a small dashboard helper module:

- `getGeneratedPageSectionCount(page)` reads both legacy `content.sections` and mode-aware `content.modes.sections.items`.
- `hasGeneratedPageClone(page)` reads legacy `content.rendered` and mode-aware `content.modes.clone.rendered` / `edited_rendered`.
- `getGeneratedPageStatus(page)` returns:
  - `unknown` when page detail data has not loaded.
  - `structured` when any persisted section list exists, including mode-aware sections.
  - `cloned` when clone HTML exists but no persisted sections exist.
  - `generated` when page detail data exists but neither structured sections nor clone HTML are present.
- `summarizeGeneratedPageStatuses(pages)` counts known statuses for cached page details.

Update `model-pages.vue` to use the helper for section counts, row badges, and summary cards. Fetch generated page details with `{ includeModes: true }` so mode-aware section metadata is available to the dashboard.

## UI Behavior

- Created model rows with uncached detail data show `Loading` rather than `Generated`.
- Loaded clone-only pages show `Clone-only`.
- Loaded pages with mode-aware sections show `Structured`, even when `active_mode` is still `clone`; the inventory answers “does this page have editable sections available?”, not “which mode is currently active?”.
- Summary cards show cached status inventory counts: `Structured`, `Clone-only`, and `Loaded details`, making it clear the count is based on loaded detail data.

## Data Flow

1. Model Pages loads OEMs, vehicle models, and generated page slugs.
2. It prefetches page detail JSON for the first batch and visible grid pages using `fetchGeneratedPage(slug, { includeModes: true })`.
3. Cached page details are classified by the helper.
4. Coverage and grid rows display mode-aware status badges.
5. Refresh clears the cache and reloads details with the same mode-aware request shape.

## Testing

Add focused dashboard tests before implementation:

- Helper tests for legacy sections, mode-aware sections, clone-only mode data, legacy clone HTML, loaded generated pages, uncached pages, section counts, and summary counts.
- Source-level integration test for `model-pages.vue` asserting that it imports the helper, uses `fetchGeneratedPage(fullSlug(item), { includeModes: true })`, includes an `unknown` status config, and renders cached status summary cards.

## Out of Scope

- Running live structuring or clone actions.
- Fetching every generated page detail eagerly across the fleet.
- Adding model-pages table filters for each status.
- Changing worker API response shape.
- Changing Page Builder mode semantics.

## Self-Review

- No placeholder requirements remain.
- Scope is a single dashboard status fidelity slice.
- The design avoids live writes and avoids turning the model-pages screen into an eager fleet-wide clone HTML fetch.
