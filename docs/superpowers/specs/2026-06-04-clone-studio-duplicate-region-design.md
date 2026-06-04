# Spec — Clone Studio `duplicate` region action

> 2026-06-04. Fills the deferred `duplicate` menu stub in the Clone Studio editing system
> (currently a `Duplicate / Convert coming soon` toast in `[slug].vue` `onRegionAction`).
> `convert` stays out of scope (separate design pass — overlaps the structurer/`mapAndPersist`).
> Builds on `project_clone_studio_editing`, `project_clone_studio_v1`, `project_section_mapper`.

## Goal

Right-click a clone region → **Duplicate** → an identical copy is inserted immediately after
the source in the cloned page, and is a **first-class region**: selectable, croppable, and its
own `height_override`/fields persist across reload (tracked in `section_index`).

## Why first-class (not HTML-only)

Regions are DOM-derived live, so an HTML-only clone would render and be selectable in the
session — but its `section_index` entry would be missing, so `height_override` (a headline
feature of this editing system, applied on load via `applyRegionOverrides` reading from
`section_index`) would not survive reload on the copy. The bridge already has
`regionPayload(el)` returning the exact `CloneRegion` shape, so making the duplicate
first-class is small incremental cost. Decision locked with the user 2026-06-04.

## Flow

Mirrors the existing `patch-field` / `set-height` round-trip exactly. Note the two-layer
host wiring: `[slug].vue` holds a `pageBuilderCanvas` ref → `PageBuilderCanvas` (`defineExpose`)
embeds `CloneStudioCanvas` (`cloneStudioCanvas` ref). `dom-updated` is re-emitted by
`PageBuilderCanvas` as `cloneDomUpdated`; region metadata changes flow via `updateField` emits.

```
context-menu "Duplicate"
  -> PageBuilderCanvas emits regionAction({ action: 'duplicate', regionId })   [existing, line ~233]
  -> [slug].vue onRegionAction -> pageBuilderCanvas.value.duplicateRegion(regionId)
  -> PageBuilderCanvas.duplicateRegion -> cloneStudioCanvas.value.duplicateRegion(regionId)
  -> CloneStudioCanvas posts 'clone-studio:duplicate-region'
  -> bridge: clone subtree, re-ID clone + all nested region ids, insert after source,
             post 'clone-studio:dom-updated' { bodyHtml, newRegion: regionPayload(clone) }
  -> CloneStudioCanvas dom-updated branch: emit domUpdated(html) AND emit regionAdded(newRegion)
  -> PageBuilderCanvas re-emits cloneDomUpdated(html) [existing] AND cloneRegionAdded(newRegion) [new]
  -> [slug].vue: cloneDraftHtml persists (existing path) + addCloneRegion(newRegion) -> drafts
  -> saveClone writes edited_rendered + section_index (clone now first-class)
```

## Components

### 1. Bridge — `clone-studio-html.ts`

- New message constant `MESSAGE_DUPLICATE_REGION = 'clone-studio:duplicate-region'`.
- Handler in the `addEventListener('message', ...)` block (alongside `MESSAGE_SET_HEIGHT` /
  `MESSAGE_SWITCH_PANEL`):
  1. `var source = findRegionById(message.regionId || message.selectedRegionId || message.id)`;
     bail if missing or no `parentNode`.
  2. `var clone = source.cloneNode(true)`.
  3. **Re-ID:** remove `data-oem-region-id` from the clone root, then iterate
     `clone.querySelectorAll('[data-oem-region-id]')` and `removeAttribute('data-oem-region-id')`
     on each — so every nested region id is stripped and `ensureRegionId` reassigns fresh,
     collision-free ids (it loops until `document.querySelector` finds no match). Plain
     attribute walk — the ES5 `var`-in-loop closure trap does NOT apply (no per-element
     handlers are created here).
  4. `source.parentNode.insertBefore(clone, source.nextSibling)`.
  5. `ensureRegionId(clone)` to assign the clone root a fresh id.
  6. `post(MESSAGE_DOM_UPDATED, { regionId: <clone id>, newRegion: regionPayload(clone) })`.
     Single message — `getBodyHtml()` (called inside `post`) already strips
     `[data-clone-studio-bridge]` on serialize, so injected handles never leak into the
     persisted HTML.
- No backticks in any added bridge string/comment (bridge is a TS template literal).

### 2. Inner host — `CloneStudioCanvas.vue`

- Add `regionAdded: [region: CloneRegion]` to the emits type (next to `domUpdated`).
- `duplicateRegion(regionId: string)` posts
  `{ type: 'clone-studio:duplicate-region', regionId, bridgeToken }` via `postToFrame`;
  expose it through `defineExpose` alongside `patchField` / `switchPanel` / `setHeight`.
- Extend the `clone-studio:dom-updated` branch of `onMessage`: after `emit('domUpdated', html)`,
  if `data.newRegion` is a non-null object, `emit('regionAdded', data.newRegion)`.

### 3. Wrapper host — `PageBuilderCanvas.vue`

- `duplicateRegion(regionId: string)` = `cloneStudioCanvas.value?.duplicateRegion(regionId)`;
  add it to the existing `defineExpose` (alongside `patchCloneField`).
- On the embedded `<CloneStudioCanvas>`, bind `@region-added` to re-emit a new
  `cloneRegionAdded` event (gate on `!props.readOnly`, mirroring the existing
  `@dom-updated="!props.readOnly && emit('cloneDomUpdated', $event)"`). Add `cloneRegionAdded`
  to the component's emits.

### 4. Page — `page-builder/[slug].vue`

- Widen the `pageBuilderCanvas` ref type to include
  `duplicateRegion: (regionId: string) => void`.
- `onRegionAction` `'duplicate'` branch: guard `isWriteProtectedPage`, then call
  `pageBuilderCanvas.value?.duplicateRegion(regionId)`. Remove `'duplicate'` from the
  `coming soon` toast (leave `convert` on the toast).
- Bind `@clone-region-added="addCloneRegion"` on `<PageBuilderCanvas>`; the `cloneDomUpdated`
  path is unchanged.

### 5. Composable — `use-page-builder.ts`

- New `addCloneRegion(region: CloneRegion)` = `upsertCloneRegionDraft(region)` and set
  `isDirty`. Drafts already win in `cloneRegionsForSave`, so the new region flows through
  `saveClone` into `section_index`. Export it from the composable return.

## Data flow / persistence

- `dom-updated` → existing `domUpdated` emit → `cloneDraftHtml` → `saveClone(edited_rendered, …)`.
- `regionAdded` → `addCloneRegion` → draft → `cloneRegionsForSave` → `saveClone(section_index)`.
- On reload, `applyRegionOverrides(window.__CLONE_STUDIO_REGION_OVERRIDES__)` reads the
  clone's `height_override` from `section_index` and re-applies the crop — so the duplicate
  behaves identically to the source.

## Error handling

- Bridge: missing source region or missing `parentNode` → no-op, no post (nothing persists).
- Canvas: `dom-updated` with no/invalid `newRegion` → emit `domUpdated` only (HTML still
  persists; degrades to HTML-only rather than throwing). Defensive, not the happy path.
- Page: `isWriteProtectedPage` guard before dispatch, matching `delete`/`hide`.

## Testing (vitest — mirror existing clone-studio specs)

1. **Bridge re-ID** (via `stripCloneStudioScaffoldingForTest` / existing bridge-eval harness if
   present, else a focused DOM unit): after duplicate, the document has no duplicate
   `data-oem-region-id` values; the clone root has a fresh id distinct from source.
2. **Insertion order:** clone is the immediate next sibling of source.
3. **Message payload:** duplicate handler posts `dom-updated` carrying a `newRegion` object
   whose `selector` is `[data-oem-region-id="<clone id>"]`.
4. **Composable:** `addCloneRegion(region)` makes the region appear in `cloneRegionsForSave`
   and sets `isDirty`.
5. **Canvas emit:** `dom-updated` with `newRegion` emits both `domUpdated` and `regionAdded`;
   without `newRegion`, emits only `domUpdated`.

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production` (214 pass today
— keep green). Build to ship: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build`
(`vue-tsc -b` currently 0 errors — keep it clean).

## Out of scope

- `convert` (clone region → structured worker section) — separate design; overlaps the
  structurer / `mapAndPersist`. Stays a toast.
- No auto-advance / no new interactivity changes.
- Worker side untouched (dashboard-only) — no worker deploy.
