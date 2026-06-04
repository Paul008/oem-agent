# Clone Studio Editing System — Design Spec

> Written 2026-06-04. Scope: a unified in-place editing system for the Clone Studio
> page builder, covering a context-aware right-click menu, inline HTML5 editing, a
> visible-height control, and handling of interactive objects (tabs/carousels).
> Built on the existing clone iframe bridge — no new persistence model.

## Goal

Let an editor select a region of a cloned OEM page and edit it directly — text,
images, links, background, height — via a right-click menu and inline editing, and
make interactive blocks (tabs/carousels) both editable and viewable. All edits
persist through the existing clone pipeline.

## Context (what already exists)

- **Clone iframe bridge** (`dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`):
  sandboxed (`allow-scripts`) `srcdoc` iframe with an injected bridge. It already:
  - extracts `editable_fields` per element,
  - captures region geometry incl. `height` (`getBoundingClientRect`),
  - exposes a `clone-studio:patch-field` message channel,
  - detects text/`contenteditable` elements,
  - posts a `section-capture-menu` event on right-click (currently for picking a
    capture type).
- **Canvas host** (`CloneStudioCanvas.vue`): renders the iframe, relays bridge
  messages (`selectRegion`, `domUpdated`), exposes `patchField()`. `PageBuilderCanvas.vue`
  wraps it and already has a section-mode context menu + inline-edit handlers and a
  `readOnly` prop.
- **State/persistence** (`use-page-builder.ts`, `page-modes.ts`): clone regions live
  in `modes.clone.section_index` (`CloneRegion` with `top`, `height`, `editable_fields`);
  `saveClone` / `updateClonePage` persist `edited_rendered` + `section_index` to R2
  (versioned).
- **Interactivity decision** (`docs/superpowers/INTERACTIVITY-DECISION.md`): the
  `allow-scripts` sandbox throttles JS; a flagged `allow-scripts allow-same-origin`
  path is already spiked behind a hardened sanitizer.
- **Read-only preview** (`/preview/<slug>`): renders the clone via `PageBuilderCanvas`
  read-only, full-screen.

## Components

### 1. Context menu (right-click on a selected region)

- **Trigger:** right-click inside the clone iframe on (or after selecting) a region.
  The bridge posts a `clone-studio:context-menu` message: `{ region, fields, x, y }`
  where `fields` is the region's editable-field inventory and `x/y` are viewport
  coords (translated to parent coords using the iframe rect + frame scale).
- **Rendering:** a Vue menu in the parent (not inside the sandbox), anchored at the
  translated coords. Reuses the existing parent context-menu pattern from
  `PageBuilderCanvas.vue`.
- **Context-awareness:** actions are filtered by what the region contains:
  - has text → **Edit text**
  - has `<img>` → **Replace image…**, **Alt text…**
  - has `<a>`/button → **Edit link / button…**
  - always → **Background colour…**, **Set visible height…**,
    **Convert to editable section…**, **Hide**, **Duplicate**, **Delete**
  - `type_hint` ∈ {tabs, carousel} → panel actions (§4)
- **Action → effect:** each action either (a) toggles inline edit (§2), (b) opens a
  small parent popover (image/link/alt/colour/height) that writes via `patch-field`,
  or (c) performs a structural op (hide/duplicate/delete/convert) on `section_index`
  + `edited_rendered`.

### 2. Inline editing (HTML5 `contenteditable`)

- **Default: plain text.** "Edit text" (or double-click a text region) sets the
  target element `contenteditable=plaintext-only` inside the iframe. Enter or blur
  commits; Escape cancels. The bridge reads the new `textContent`, posts
  `clone-studio:patch-field` `{ regionId, field, value }`, and the parent applies it
  to `edited_rendered` and marks dirty.
- **OEM styling preserved** — we replace text content, not markup/classes.
- **Rich formatting (bold/italic/lists) is explicitly deferred** (YAGNI). Link, image,
  alt, and colour edits are handled by menu actions + popovers, not a floating
  rich-text toolbar.
- **Persistence:** committed edits flow to `saveClone` (existing), versioned in R2.

### 3. Visible-height control

- **UI:** menu "Set visible height…" opens a popover with the current height and a
  numeric input; additionally a **drag handle** on the region's bottom edge for direct
  resize.
- **Effect:** stores a `height_override` (px) on the region's `section_index` entry.
  At render time the region gets `max-height: <override>; overflow: hidden` (crop) —
  used to trim over-tall captured blocks. Clearing the override restores natural height.
- **Scope:** per region. Does not alter the captured DOM, only the stored override +
  injected style.

### 4. Interactive objects (tabs / carousels)

- **Detection:** the bridge classifies a region as `tabs` or `carousel` via existing
  selector heuristics (`[role=tablist]`/`.tabs`/`[class*=tab]`, `.swiper`/`.slick`/
  `[class*=carousel]`), recording `type_hint` + the panel/slide elements.
- **Editing:** each panel/slide is exposed as its own selectable + editable sub-region,
  so otherwise-hidden panels can be edited. In the editor (scripts throttled) a small
  **panel stepper** in the menu switches the visible panel by toggling the active class
  / `hidden` attribute via the bridge (no script execution needed).
- **Preview interactivity:** the `/preview/<slug>` route renders the clone with the
  **same-origin** sandbox (`allow-scripts allow-same-origin`) behind the hardened
  sanitizer + flag, so the OEM's own tab/carousel scripts run and the viewer sees real
  behaviour. The editor stays `allow-scripts` (safe, throttled).

## Architecture & data flow

```
iframe bridge (sandbox)
  ├─ contextmenu → postMessage clone-studio:context-menu {region,fields,x,y}
  ├─ inline edit commit → postMessage clone-studio:patch-field {regionId,field,value}
  └─ panel switch / structural op ← postMessage from parent
        │
CloneStudioCanvas.vue  (relays messages, exposes patchField/op handlers)
        │
PageBuilderCanvas.vue  (renders parent context menu + popovers; emits edits)
        │
use-page-builder.ts    (applies edits to edited_rendered + section_index, dirty)
        │
saveClone / updateClonePage → R2 pages/definitions/{oem}/{slug}/latest.json (versioned)
```

No new persistence model: edits mutate `edited_rendered` (HTML) and per-region
`section_index` entries (adds `height_override`, `hidden`, panel metadata).

## Boundaries (units)

- **Bridge edit protocol** (`clone-studio-html.ts`): message types + DOM ops inside
  the sandbox. Pure string/DOM; testable via the existing `clone-studio-html.test.ts`.
- **Region action model** (new small module, e.g. `region-actions.ts`): pure mapping
  `region + fields → available actions`, and action → patch payload. Unit-tested in
  isolation.
- **Menu/popover UI** (PageBuilderCanvas + small components): presentation only.
- **Persistence** (`use-page-builder.ts`): unchanged contract (`saveClone`).

## Security

- Inline editing and structural ops run in the existing `allow-scripts` sandbox (no
  same-origin needed for editing).
- Same-origin is used **only** in the preview, behind the hardened sanitizer and the
  existing flag (`VITE_CLONE_STUDIO_SAME_ORIGIN` / `allowSameOriginSandbox`). No
  change to the sanitizer's guarantees.
- All patched HTML continues through the existing clone sanitizer before render.

## Testing

- **Unit:** region-type → menu-action mapping (`region-actions.ts`); patch-field
  round-trip (edit text → updated `edited_rendered`); height-override apply/clear;
  tab/carousel detection → panel sub-regions.
- **Bridge:** extend `clone-studio-html.test.ts` for the new message types + DOM ops
  (contenteditable commit, panel switch, height crop) — deterministic string assertions.
- **Browser smoke:** inline edit a heading and persist; replace an image; set a region
  height; step through tab panels in editor; verify tabs animate in same-origin preview.

## Defaults chosen (override at review)

- Inline editing = **plain text** (rich text deferred).
- Visible height = **crop via `max-height` + overflow override** stored per region.
- Tabs = **edit panels as sub-regions** in the editor + **same-origin interactivity**
  in preview.
- Editing lives in the **Clone Studio editor**; the preview stays read-only (plus
  working tab/carousel playback).

## Out of scope (future)

- Rich-text formatting toolbar.
- Replacing interactive blocks with bespoke trusted "islands" (the deferred
  interactivity Phase 2 option) — we use the OEM's own scripts via same-origin instead.
- Multi-region / multi-select editing.
