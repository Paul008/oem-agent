# Clone Studio Captured Viewport Frame Design

## Problem

Worker clone capture stores the actual capture viewport in `content.modes.clone.viewport`, but the dashboard still renders Clone Studio full-width clone mode with a hard-coded `1280px` frame. Recent Worker changes fixed the persisted viewport metadata, so this dashboard fallback now leaves fidelity on the table: a clone captured at `1440`, `1680`, or another desktop width can be rendered through a different media-query width in the editor and standalone preview.

## Goals

- Render full Clone Studio clone mode at the saved capture viewport width when it is available.
- Preserve the existing tablet and mobile preview controls at `768px` and `375px`.
- Keep the fallback behavior stable for legacy pages without clone viewport metadata.
- Keep the change dashboard-only; no Worker schema change, no R2 migration, and no recapture requirement.

## Non-Goals

- Do not capture separate desktop/tablet/mobile DOM snapshots.
- Do not change the Worker capture viewport strategy.
- Do not alter section mode rendering.
- Do not migrate existing clone JSON.

## Design

Add a focused dashboard helper, `getCloneViewport(page)`, in `dashboard/src/pages/dashboard/page-builder/page-modes.ts`. The helper reads `content.modes.clone.viewport`, validates positive finite numeric `width` and `height`, and falls back to `{ width: 1280, height: 1080 }` when metadata is missing or invalid.

`PageBuilderCanvas.vue` will import this helper and use `getCloneViewport(props.page).width` for `previewWidth === 'full'`. The existing tablet/mobile branches stay fixed at `768` and `375`, so the preview buttons keep their current behavior while the full clone frame reflects the stored capture width.

The standalone preview already renders through `PageBuilderCanvas`, so the same helper automatically improves both the dashboard editor and preview page.

## Testing

- Unit-test `getCloneViewport(page)` for stored valid metadata.
- Unit-test fallback behavior for missing, zero, negative, non-finite, or non-numeric viewport values.
- Source-level test that `PageBuilderCanvas.vue` imports `getCloneViewport` and uses it in the full-width clone frame branch.
- Existing Clone Studio frame and preview tests should continue to pass.

## Risks

- Very wide captured viewports can make the scaled iframe smaller in constrained editor panels. This is already how the frame scaling works; using the captured width is more faithful than silently substituting `1280`.
- Existing pages without metadata continue using `1280`, so legacy pages remain stable.

## Acceptance Criteria

- Full clone mode uses the stored capture viewport width when present.
- Tablet and mobile preview buttons continue to render at `768px` and `375px`.
- Missing or invalid viewport data falls back to `1280x1080`.
- Dashboard tests, dashboard typecheck, dashboard production build, and Pages deploy succeed.
