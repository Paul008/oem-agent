# Clone Region Convert Design

## Goal

Enable the Clone Studio right-click action `Convert to editable section...` in both the dashboard page builder and standalone preview.

## Decision

The first implementation converts the selected clone region into a raw editable `content-block` section. It preserves the selected DOM region's cleaned HTML in `_generated_html`, then inserts that section into sections mode and selects it.

This intentionally does not run deterministic typed parsing yet. Typed conversion can be added later as a separate action when `parseSection()` quality is strong enough to avoid surprising layout loss.

## Data Flow

1. The iframe bridge handles `contextmenu` on the chosen clone region.
2. The bridge serializes only that region's cleaned `outerHTML`, stripping editor-only bridge nodes and hover/selection attributes.
3. `CloneStudioCanvas.vue` forwards the region HTML with the context menu payload.
4. `PageBuilderCanvas.vue` stores the HTML in clone menu state and includes it when emitting `regionAction`.
5. The dashboard editor and standalone preview handle `convert` by building a `content-block` section:

   ```ts
   {
     type: 'content-block',
     title: '',
     content_html: '',
     _generated_html: trimmedRegionHtml,
     animation: 'fade-in',
   }
   ```

6. The host inserts the section with `addSectionFromLiveData()`, switches local active mode to `sections`, and shows a toast.

## Scope

Included:
- Dashboard page-builder clone context menu conversion.
- Standalone preview clone context menu conversion.
- Focused tests for bridge payload threading and host conversion wiring.

Excluded:
- Server-side `/admin/smart-capture` calls.
- Typed section inference.
- Auto-saving converted sections.
- Removing the original clone region after conversion.

## Error Handling

If a convert action reaches the host without non-empty region HTML, the host shows an error toast and does not mutate sections.

## Testing

Tests cover:
- The bridge includes selected region HTML in context-menu messages.
- `CloneStudioCanvas.vue` and `PageBuilderCanvas.vue` forward HTML to `regionAction`.
- The raw conversion helper produces the expected `content-block` payload and rejects blank HTML.
- Both dashboard editor and standalone preview call the helper, insert the section, and switch to sections mode.
