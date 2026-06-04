# Preview Edit Context Menu Design

## Context

The dashboard page builder already supports right-click editing through `PageBuilderCanvas.vue`. The standalone preview route at `dashboard/src/pages/preview/[slug].vue` reuses the canvas, but it hardcodes `read-only="true"`. That disables structured-section context menus, clone-region context menus, clone inline editing, height crops, duplicate-region, and save-worthy DOM update events.

## Goal

Allow users to right-click in the chrome-free preview and make the same lightweight edits available in the builder canvas, while preserving write protection for OEMs marked read-only.

## Selected Approach

Reuse the existing canvas and composable wiring inside the preview route:

- Pass `:read-only="isWriteProtectedPage"` instead of `true`.
- Keep `allow-same-origin` iframe sandboxing only for write-protected/read-only preview, never for editable preview.
- Wire `PageBuilderCanvas` edit events to `usePageBuilder()` methods.
- Track clone DOM edits in `cloneDraftHtml` and save them with `saveClone(cloneDraftHtml ?? cloneHtml, cloneRegionsForSave)`.
- Save structured edits with `saveSections()`.
- Add a small floating preview action bar with save state and an “Open builder” link.
- Add `SectionEditorDialog` only for structured `Edit Section` actions; clone edits continue through the existing right-click menu and inline bridge.

## Alternatives Considered

1. Enable menus without persistence. This is small but loses work and makes destructive actions risky.
2. Redirect preview users back to the builder for edits. This avoids new wiring but does not satisfy the “right-click menu to the preview” request.
3. Reuse the builder route inside preview. This duplicates too much dashboard chrome and makes the preview less useful.

## Behavior

- Non-write-protected pages show context menus in preview.
- Write-protected pages remain read-only in preview and show a read-only indicator.
- Editable clone preview uses the normal sandboxed editor bridge without `allow-same-origin`.
- Structured sections support select, background color, duplicate, delete, drag reorder, full section dialog edits, and save.
- Clone pages support region select, inline text edit, image/link/alt/background patches, height crop, duplicate, hide/delete-as-visibility, and save.
- Convert remains the existing “coming soon” action.

## Testing

Add source-level regression coverage in `page-builder-canvas-preview.test.ts` because current tests for this area already verify route/component wiring by inspecting Vue sources. The tests should fail before implementation by detecting the old `:read-only="true"` route and missing preview event handlers.

## Out Of Scope

- No new clone-region side inspector in preview.
- No change to capture fidelity, border emission, or duplicate-region bridge internals.
- No deployment as part of this change unless requested later.
