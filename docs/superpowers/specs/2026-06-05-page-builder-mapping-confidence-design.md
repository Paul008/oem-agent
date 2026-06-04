# Page Builder Mapping Confidence Design

Written 2026-06-05.

## Goal

Make clone-to-section promotion safer and cheaper by showing Page Builder operators the deterministic mapper's confidence before structuring, then routing the Structure action through the deterministic-first persistence path with AI fallback.

## Current State

The worker already exposes:

- `POST /admin/map-page/:oemId/:modelSlug` for a read-only deterministic mapping preview.
- `POST /admin/map-and-structure/:oemId/:modelSlug` for deterministic persistence when confidence is high, with AI structuring as fallback.
- `POST /admin/structure-page/:oemId/:modelSlug` for direct AI structuring.

The dashboard already imports `fetchCaptureDiagnostics` and shows a capture badge in `page-builder/[slug].vue`, but it does not surface mapping confidence. The **Structure** button still calls the AI-only structuring path, so high-confidence clone pages pay the AI cost even when deterministic mapping would be sufficient.

One related issue is in the worker path: route handlers accept a `modelOverride` body for Page Builder A/B testing, but `PageStructurer.structurePage()` does not currently receive or apply that override to `AiRouter.route()`. The new deterministic-first path should not regress model-selector behavior; when fallback AI is needed, the selected model must still be respected.

## Approach

Add a compact mapping-status layer in the Page Builder, parallel to capture diagnostics:

- Load `mapPagePreview(oemId, modelSlug)` once after the page loads when a cloned page exists.
- Refresh it after clone-producing actions and after structuring, because the clone or sections may have changed.
- Render a small badge near the existing workflow/capture status showing confidence, section count, and whether AI fallback is expected.
- Keep errors non-blocking: failed mapping preview should clear the badge and not stop editing.

Change Structure to call deterministic-first persistence:

- Dashboard `runStructure()` will call a composable handler backed by `mapAndStructurePage()`.
- The worker endpoint and client method will accept an optional `modelOverride`.
- `PageStructurer.mapAndPersist()` will pass that override into `structurePage()` only when AI fallback is used.
- `PageStructurer.structurePage()` will forward the override to `AiRouter.route({ overrideRoute })`.

## UI Behavior

The badge should only appear for clone-capable pages after a successful mapping preview.

- High confidence/no fallback: label `Map 73%`, green tone, title includes section count and "deterministic structure".
- Low confidence/fallback expected: label `AI fallback 57%`, amber tone, title includes section count and "AI fallback expected".
- Error/no clone/no result: no badge.

The badge is informational. It does not disable Structure or Pipeline. Operators can still explicitly run the adaptive pipeline when they need a full recapture/regeneration flow.

## Data Flow

1. Page Builder loads a page with clone HTML.
2. Dashboard calls `mapPagePreview()` and stores the mapping summary locally.
3. The toolbar/stepper renders the summary.
4. Operator clicks **Structure**.
5. Dashboard calls `mapAndStructurePage(oemId, modelSlug, modelOverride)`.
6. Worker persists deterministic sections when `needs_ai_fallback === false`; otherwise it calls AI structuring with the selected model override.
7. Dashboard refreshes the page and mapping summary.

## Testing

Add focused tests before implementation:

- Dashboard source-level test: Page Builder imports `mapPagePreview`, loads mapping diagnostics after page load, refreshes after clone and structure/pipeline, renders confidence/fallback labels, and routes Structure through a deterministic-first handler rather than the AI-only handler.
- Dashboard API test: `mapAndStructurePage()` serializes `modelOverride` in the request body when provided.
- Worker structurer test: `structurePage()` forwards `overrideRoute` into `AiRouter.route()`.
- Worker structurer fallback test: `mapAndPersist()` passes the override through to AI fallback and does not call AI on the high-confidence deterministic path.

## Out of Scope

- Listing mapping confidence across the model-pages table.
- Changing mapper scoring thresholds.
- Persisting mapping preview results.
- Running live structuring against protected OEMs.
- Reworking the adaptive pipeline.

## Self-Review

- No placeholder requirements remain.
- The worker and dashboard responsibilities are separate: worker owns deterministic/AI routing, dashboard owns status presentation and button wiring.
- The scope is one Page Builder workflow slice and one related model-override correctness fix.
