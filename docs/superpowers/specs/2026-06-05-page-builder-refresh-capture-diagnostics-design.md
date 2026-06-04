# Page Builder Capture Diagnostics Refresh Design

## Context

`dashboard/src/pages/dashboard/page-builder/[slug].vue` already reads persisted capture diagnostics
after the page loads and renders a compact status badge in the toolbar. The Worker records a fresh
diagnostics record for clone captures and adaptive pipeline runs.

The current dashboard state can become stale inside a single builder session: after the user runs
Clone or Adaptive Pipeline, the badge still reflects whatever diagnostics were loaded on initial
page load until the user reloads the builder.

## Goal

Refresh the existing capture diagnostics badge immediately after page-builder actions that can write
new capture diagnostics.

## Scope

In scope:

- Refresh diagnostics after `runClone()` completes.
- Refresh diagnostics after `runAdaptivePipeline()` completes.
- Keep the existing `fetchCaptureDiagnostics()` API and `describeCaptureStatus()` formatter.
- Keep the existing badge placement, color mapping, and neutral-hidden behavior.
- Add source-regression coverage so this wiring cannot silently regress.

Out of scope:

- Dashboard visual redesign.
- Per-row model-pages diagnostics.
- New Worker endpoints or diagnostics fields.
- Refreshing after section-only save/structure actions; those do not create capture diagnostics.
- Live browser verification of challenge-page states; this slice is local wiring only.

## Design

`[slug].vue` keeps `loadCaptureDiagnostics()` as the single local fetch helper. `runClone()` and
`runAdaptivePipeline()` call it after their existing awaited action:

```ts
await handleClone()
await loadCaptureDiagnostics()
```

```ts
await handleAdaptivePipeline(modelOverride)
await loadCaptureDiagnostics()
```

`runStructure()` remains unchanged because structuring does not create a new capture diagnostics
record. If `handleClone()` or `handleAdaptivePipeline()` records an error or blocked capture and then
returns normally, the refreshed badge will show the latest persisted failure. If those functions
throw, the current error behavior remains unchanged; this slice does not add a `finally` refresh
because the composable action currently owns error handling semantics.

## Test Strategy

Add a dashboard source-regression test that reads
`dashboard/src/pages/dashboard/page-builder/[slug].vue` and verifies:

- `loadCaptureDiagnostics()` is called after initial `loadPage(slug)`.
- `runClone()` awaits `handleClone()` before awaiting `loadCaptureDiagnostics()`.
- `runAdaptivePipeline()` awaits `handleAdaptivePipeline(modelOverride)` before awaiting
  `loadCaptureDiagnostics()`.
- `runStructure()` does not call `loadCaptureDiagnostics()`.

Run the focused dashboard test with:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Then run full dashboard tests and dashboard typecheck.

## Risks

The extra API read happens only after capture-producing actions and only in the builder detail view,
so the runtime cost is small. The main risk is refreshing diagnostics before the Worker has persisted
the record. The existing `handleClone()` / `handleAdaptivePipeline()` calls are awaited, and the
Worker records diagnostics as part of those actions, so sequencing the refresh after the awaited
action is the safest minimal behavior.
