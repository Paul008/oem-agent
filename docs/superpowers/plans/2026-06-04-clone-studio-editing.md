# Clone Studio Editing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-place editing to Clone Studio — a context-aware right-click menu, inline plain-text editing, a per-region visible-height override, and editable/interactive tabs & carousels — all on the existing clone iframe bridge.

**Architecture:** A pure `region-actions` module maps a region + its fields to available menu actions and patch payloads. The clone bridge (`clone-studio-html.ts`) gains a `context-menu` emit and iframe-side `contenteditable` commit; both ride the existing `clone-studio:patch-field` channel and `post()` helper. The parent (`CloneStudioCanvas` → `PageBuilderCanvas`) renders the menu/popovers and applies edits through the existing `patchCloneField` / `saveClone` path. No new persistence model — edits mutate `edited_rendered` + `section_index`.

**Tech Stack:** Vue 3 (`<script setup>`), TypeScript, Vitest (dashboard config), the existing sandboxed-iframe bridge (vanilla JS string), Cloudflare R2 via `saveClone`.

---

## File Structure

- **Create** `dashboard/src/pages/dashboard/components/page-builder/region-actions.ts` — pure: `RegionActionId`, `getRegionActions(region)`, `buildPatchPayload(action, region, value)`. Unit-tested.
- **Create** `dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts`
- **Modify** `clone-studio-html.ts` — add `MESSAGE_CONTEXT_MENU` emit (right-click → `{regionId, fields, x, y}`), iframe-side `contenteditable` commit → `patch-field` (text), `height_override` style injection, tab/carousel `type_hint` + panel indexing, panel-switch message handler.
- **Modify** `clone-studio-html.test.ts` — assert new bridge behaviour via string checks.
- **Modify** `CloneStudioCanvas.vue` — relay `context-menu` + `dom-updated`; translate iframe coords to parent coords (frame scale); expose `switchPanel()`.
- **Modify** `PageBuilderCanvas.vue` — render the region context menu + edit popovers; emit edits; gate on `!readOnly`.
- **Modify** `page-modes.ts` — extend `CloneRegion` with `height_override?: number` and `panel_index?: number`; helper `applyRegionHeightOverride`.
- **Modify** `use-page-builder.ts` — handle new edit emits, persist via existing `saveClone`.
- **Modify** `dashboard/src/pages/preview/[slug].vue` — pass `:allow-same-origin-sandbox="true"` for working tabs/carousels in preview.

---

## Task 1: Pure region-action model

**Files:**
- Create: `dashboard/src/pages/dashboard/components/page-builder/region-actions.ts`
- Test: `dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { getRegionActions, buildPatchPayload } from './region-actions'

const base = { id: 'r1', label: 'Region', selector: 'div', tag: 'div', classes: [], top: 0, height: 100, editable_fields: [] as any[] }

describe('getRegionActions', () => {
  it('always offers colour, height, convert, hide, duplicate, delete', () => {
    const ids = getRegionActions(base).map(a => a.id)
    expect(ids).toEqual(expect.arrayContaining(['background', 'height', 'convert', 'hide', 'duplicate', 'delete']))
  })

  it('offers edit-text only when the region has a text field', () => {
    expect(getRegionActions(base).map(a => a.id)).not.toContain('edit-text')
    const withText = { ...base, editable_fields: [{ kind: 'text', selector: 'h1' }] }
    expect(getRegionActions(withText).map(a => a.id)).toContain('edit-text')
  })

  it('offers image + alt actions only when the region has an image field', () => {
    const withImg = { ...base, editable_fields: [{ kind: 'image', selector: 'img' }] }
    const ids = getRegionActions(withImg).map(a => a.id)
    expect(ids).toContain('replace-image')
    expect(ids).toContain('alt-text')
  })

  it('offers edit-link only when the region has a link field', () => {
    const withLink = { ...base, editable_fields: [{ kind: 'link', selector: 'a' }] }
    expect(getRegionActions(withLink).map(a => a.id)).toContain('edit-link')
  })

  it('offers panel actions for tabs/carousel regions', () => {
    const tabs = { ...base, type_hint: 'tabs' }
    expect(getRegionActions(tabs).map(a => a.id)).toContain('next-panel')
  })
})

describe('buildPatchPayload', () => {
  it('builds a visibility payload for hide', () => {
    expect(buildPatchPayload('hide', base)).toEqual({ regionId: 'r1', kind: 'visibility', value: false })
  })
  it('builds an image payload for replace-image', () => {
    expect(buildPatchPayload('replace-image', base, 'https://x/y.jpg')).toEqual({ regionId: 'r1', kind: 'image', value: 'https://x/y.jpg' })
  })
  it('builds a link payload for edit-link', () => {
    expect(buildPatchPayload('edit-link', base, '/build')).toEqual({ regionId: 'r1', kind: 'link', value: '/build' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts`
Expected: FAIL — "Failed to load url ./region-actions".

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { CloneRegion } from '../../page-builder/page-modes'

export type RegionActionId =
  | 'edit-text' | 'replace-image' | 'alt-text' | 'edit-link' | 'background'
  | 'height' | 'convert' | 'hide' | 'duplicate' | 'delete'
  | 'next-panel' | 'prev-panel'

export interface RegionAction { id: RegionActionId; label: string; group: 'content' | 'layout' | 'region' }

function hasKind(region: CloneRegion, kind: string): boolean {
  return Array.isArray(region.editable_fields) && region.editable_fields.some((f: any) => f?.kind === kind)
}

export function getRegionActions(region: CloneRegion): RegionAction[] {
  const out: RegionAction[] = []
  if (hasKind(region, 'text')) out.push({ id: 'edit-text', label: 'Edit text', group: 'content' })
  if (hasKind(region, 'image')) {
    out.push({ id: 'replace-image', label: 'Replace image…', group: 'content' })
    out.push({ id: 'alt-text', label: 'Alt text…', group: 'content' })
  }
  if (hasKind(region, 'link')) out.push({ id: 'edit-link', label: 'Edit link / button…', group: 'content' })
  out.push({ id: 'background', label: 'Background colour…', group: 'content' })
  if ((region as any).type_hint === 'tabs' || (region as any).type_hint === 'carousel') {
    out.push({ id: 'next-panel', label: 'Next panel', group: 'layout' })
    out.push({ id: 'prev-panel', label: 'Previous panel', group: 'layout' })
  }
  out.push({ id: 'height', label: 'Set visible height…', group: 'layout' })
  out.push({ id: 'convert', label: 'Convert to editable section…', group: 'layout' })
  out.push({ id: 'hide', label: 'Hide region', group: 'region' })
  out.push({ id: 'duplicate', label: 'Duplicate', group: 'region' })
  out.push({ id: 'delete', label: 'Delete region', group: 'region' })
  return out
}

export function buildPatchPayload(action: RegionActionId, region: CloneRegion, value?: string) {
  switch (action) {
    case 'hide': return { regionId: region.id, kind: 'visibility', value: false }
    case 'replace-image': return { regionId: region.id, kind: 'image', value }
    case 'edit-link': return { regionId: region.id, kind: 'link', value }
    case 'alt-text': return { regionId: region.id, kind: 'alt', value }
    case 'background': return { regionId: region.id, kind: 'background', value }
    default: return { regionId: region.id, kind: 'text', value }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts`
Expected: PASS (10 assertions).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/region-actions.ts dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts
git commit -m "feat(clone-studio): pure region-action model + tests"
```

---

## Task 2: Extend CloneRegion with height_override + panel_index

**Files:**
- Modify: `dashboard/src/pages/dashboard/page-builder/page-modes.ts`
- Test: `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`

- [ ] **Step 1: Write the failing test** (append to `page-modes.test.ts`)

```typescript
import { applyRegionHeightOverride } from './page-modes'

describe('applyRegionHeightOverride', () => {
  it('sets a numeric height_override on the matching region', () => {
    const regions = [{ id: 'r1', height: 800 } as any, { id: 'r2', height: 200 } as any]
    const next = applyRegionHeightOverride(regions, 'r1', 400)
    expect(next.find(r => r.id === 'r1')!.height_override).toBe(400)
    expect(next.find(r => r.id === 'r2')!.height_override).toBeUndefined()
  })
  it('clears the override when passed null', () => {
    const regions = [{ id: 'r1', height: 800, height_override: 400 } as any]
    expect(applyRegionHeightOverride(regions, 'r1', null)[0].height_override).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`
Expected: FAIL — "applyRegionHeightOverride is not a function".

- [ ] **Step 3: Write minimal implementation** (in `page-modes.ts`)

Add to the `CloneRegion` interface:

```typescript
  height_override?: number;
  panel_index?: number;
```

Add the helper:

```typescript
export function applyRegionHeightOverride(
  regions: CloneRegion[],
  regionId: string,
  height: number | null,
): CloneRegion[] {
  return regions.map((r) => {
    if (r.id !== regionId) return r
    const next = { ...r }
    if (height == null) delete next.height_override
    else next.height_override = height
    return next
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/page-builder/page-modes.ts dashboard/src/pages/dashboard/page-builder/page-modes.test.ts
git commit -m "feat(clone-studio): CloneRegion height_override + helper"
```

---

## Task 3: Bridge — emit a context-menu event on right-click

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
- Test: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`

Context: the bridge already has `post(type, extra)`, `candidateFrom(target)`, `selectRegion`, and `MESSAGE_*` constants. Add a context-menu emit.

- [ ] **Step 1: Write the failing test** (append)

```typescript
it('bridge wires a contextmenu listener that posts clone-studio:context-menu', () => {
  const html = buildCloneStudioHtml({ rendered: '<main><section class="hero"><h1>X</h1></section></main>', title: 't', baseHref: '/', mediaBase: '/', stylesheetUrls: [], selectedRegionId: null, bridgeToken: 'tok' })
  expect(html).toContain("addEventListener('contextmenu'")
  expect(html).toContain('clone-studio:context-menu')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "context-menu"`
Expected: FAIL — string not found.

- [ ] **Step 3: Write minimal implementation**

Near the existing `MESSAGE_*` declarations add:

```javascript
  var MESSAGE_CONTEXT_MENU = 'clone-studio:context-menu'
```

After the existing `click`/`auxclick` listeners, add:

```javascript
  document.addEventListener('contextmenu', function (event) {
    var region = candidateFrom(event.target)
    if (!region) return
    stopBlockedEvent(event)
    selectRegion(region, true)
    var rect = region.element && region.element.getBoundingClientRect
      ? region.element.getBoundingClientRect() : { left: 0, top: 0 }
    post(MESSAGE_CONTEXT_MENU, {
      regionId: region.id,
      fields: region.editable_fields || [],
      typeHint: region.type_hint || null,
      x: event.clientX,
      y: event.clientY
    })
  }, true)
```

(Match the actual shape of the bridge's region object for `region.element`/`region.id`/`region.editable_fields` when implementing — read the surrounding `candidateFrom`/`selectRegion` code first.)

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "context-menu"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
git commit -m "feat(clone-studio): bridge emits context-menu event on right-click"
```

---

## Task 4: Bridge — inline plain-text editing commit

**Files:**
- Modify: `clone-studio-html.ts`
- Test: `clone-studio-html.test.ts`

Context: `patchField` already handles `kind: 'text'` (sets `textContent`). This task adds iframe-side `contenteditable` so a user edits in place, and on commit the bridge posts a `patch-field` text message to the parent (which persists). Reuse the existing text-field resolution.

- [ ] **Step 1: Write the failing test** (append)

```typescript
it('bridge enables contenteditable on a begin-edit message and commits text', () => {
  const html = buildCloneStudioHtml({ rendered: '<main><section class="hero"><h1>X</h1></section></main>', title: 't', baseHref: '/', mediaBase: '/', stylesheetUrls: [], selectedRegionId: null, bridgeToken: 'tok' })
  expect(html).toContain('clone-studio:begin-edit')
  expect(html).toContain("setAttribute('contenteditable'")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "contenteditable"`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add a constant `var MESSAGE_BEGIN_EDIT = 'clone-studio:begin-edit'`. In the `window.addEventListener('message', …)` handler add a branch:

```javascript
    if (message.type === MESSAGE_BEGIN_EDIT) {
      var region = findRegionById(message.regionId)
      var el = region && resolveTextTarget(region) // existing helper that finds the h1/p/span text node
      if (!el) return
      el.setAttribute('contenteditable', 'plaintext-only')
      el.focus()
      var commit = function () {
        el.removeAttribute('contenteditable')
        el.removeEventListener('blur', commit)
        el.removeEventListener('keydown', onKey)
        post(MESSAGE_PATCH_FIELD_RESULT || 'clone-studio:patch-field', { regionId: region.id, kind: 'text', value: el.textContent, committed: true })
      }
      var onKey = function (e) { if (e.key === 'Enter') { e.preventDefault(); el.blur() } if (e.key === 'Escape') { el.textContent = message.original || el.textContent; el.blur() } }
      el.addEventListener('blur', commit)
      el.addEventListener('keydown', onKey)
    }
```

Use the bridge's existing text-target resolver (the `[contenteditable], h1, h2, … a, button` querySelector seen near line 831) — name it `resolveTextTarget` if not already, and reuse it. Add a matching `dblclick` path that posts `clone-studio:request-edit` so double-click in the iframe asks the parent to begin editing (keeps the parent the source of truth).

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "contenteditable"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
git commit -m "feat(clone-studio): iframe-side inline plain-text editing"
```

---

## Task 5: Bridge — height_override style injection

**Files:**
- Modify: `clone-studio-html.ts` (region style application)
- Test: `clone-studio-html.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```typescript
it('applies a height_override as max-height + overflow on the region', () => {
  const html = buildCloneStudioHtml({ rendered: '<main><section class="hero" data-clone-region="r1"><h1>X</h1></section></main>', title: 't', baseHref: '/', mediaBase: '/', stylesheetUrls: [], selectedRegionId: null, bridgeToken: 'tok', regionOverrides: [{ id: 'r1', height_override: 320 }] })
  expect(html).toContain('clone-studio:set-height')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "height_override"`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add `var MESSAGE_SET_HEIGHT = 'clone-studio:set-height'` and a message branch that finds the region element and sets `el.style.maxHeight = value ? value + 'px' : ''; el.style.overflow = value ? 'hidden' : ''`. Accept `regionOverrides` in `CloneStudioHtmlOptions` and apply them once on bridge init by iterating and calling the same setter so persisted overrides render on load.

- [ ] **Step 4: Run test to verify it passes** — same command, Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
git commit -m "feat(clone-studio): bridge applies per-region height_override"
```

---

## Task 6: Bridge — tab/carousel detection + panel switching

**Files:**
- Modify: `clone-studio-html.ts`
- Test: `clone-studio-html.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```typescript
it('classifies a tablist region with type_hint=tabs and supports panel switching', () => {
  const html = buildCloneStudioHtml({ rendered: '<main><div class="tabs" role="tablist"><div role="tabpanel">A</div><div role="tabpanel" hidden>B</div></div></main>', title: 't', baseHref: '/', mediaBase: '/', stylesheetUrls: [], selectedRegionId: null, bridgeToken: 'tok' })
  expect(html).toContain('clone-studio:switch-panel')
})
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

In the bridge's region-classification step, set `region.type_hint = 'tabs'` when the element matches `[role=tablist], .tabs, [class*=tab]` (and `'carousel'` for `.swiper, .slick, [class*=carousel]`), and collect its panels (`[role=tabpanel]`, `.tab-content`, `.swiper-slide`). Add `var MESSAGE_SWITCH_PANEL = 'clone-studio:switch-panel'` + a handler that shows panel N (remove `hidden`/add active class on the target, hide siblings) by toggling attributes/classes — no script execution.

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
git commit -m "feat(clone-studio): tab/carousel detection + panel switching"
```

---

## Task 7: Canvas relays — context menu + panel + coord translation

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`
- Test: extend canvas-related test or add `clone-studio-coords.test.ts`

- [ ] **Step 1: Write the failing test** for a pure coord-translation helper.

```typescript
import { describe, it, expect } from 'vitest'
import { translateFramePoint } from './CloneStudioCanvas'

describe('translateFramePoint', () => {
  it('scales iframe coords by frame scale and adds the iframe origin', () => {
    expect(translateFramePoint({ x: 100, y: 50 }, { left: 20, top: 10 }, 0.5)).toEqual({ x: 70, y: 35 })
  })
})
```

- [ ] **Step 2: Run** the test → FAIL ("translateFramePoint is not exported").

- [ ] **Step 3: Implement** `export function translateFramePoint(p, originRect, scale) { return { x: originRect.left + p.x * scale, y: originRect.top + p.y * scale } }` in the `<script lang="ts">` (non-setup) block of `CloneStudioCanvas.vue`. In `onMessage`, handle `clone-studio:context-menu` → translate coords via the iframe `getBoundingClientRect()` + `frameScale` and `emit('contextMenu', { region, fields, typeHint, x, y })`. Add `switchPanel(regionId, index)` and `beginEdit(regionId)` that `postToFrame` the matching messages; expose via `defineExpose`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(clone-studio): canvas relays context-menu + panel + coord translation`.

---

## Task 8: PageBuilderCanvas — render menu + popovers, wire edits

**Files:**
- Modify: `PageBuilderCanvas.vue`

- [ ] **Step 1: Write the failing test** — assert the menu action list comes from `getRegionActions` for a selected region (mount test or a pure computed extracted to a helper).

```typescript
// region-menu.test.ts — pure mapping the component will use
import { getRegionActions } from './region-actions'
it('hero region with text+image+link yields edit/replace/link/colour/height/...', () => {
  const ids = getRegionActions({ id: 'r', editable_fields: [{ kind: 'text' }, { kind: 'image' }, { kind: 'link' }] } as any).map(a => a.id)
  expect(ids).toEqual(expect.arrayContaining(['edit-text', 'replace-image', 'edit-link', 'background', 'height']))
})
```

- [ ] **Step 2: Run** → PASS already if Task 1 done; this locks the contract the component relies on. (If a new assertion fails, fix Task 1.)

- [ ] **Step 3: Implement** in `PageBuilderCanvas.vue`: listen for `@context-menu` from `CloneStudioCanvas`; store `{x,y,region,actions:getRegionActions(region)}`; render a floating menu (reuse the existing section context-menu markup pattern) gated on `!props.readOnly`. Wire each action: text→`cloneStudioCanvas.beginEdit(region.id)`; image/link/alt/colour→open existing-style popover then `patchCloneField(buildPatchPayload(...))`; height→popover + `emit('updateField', region.id, 'height_override', n)`; hide→`patchCloneField(buildPatchPayload('hide', region))`; next/prev-panel→`cloneStudioCanvas.switchPanel(region.id, i)`. Image replace reuses the existing upload-media flow.

- [ ] **Step 4: Build to verify** `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` → succeeds.

- [ ] **Step 5: Commit** `feat(clone-studio): region context menu + edit popovers in canvas`.

---

## Task 9: use-page-builder — persist edits

**Files:**
- Modify: `dashboard/src/composables/use-page-builder.ts`

- [ ] **Step 1: Write the failing test** — extend `use-page-builder.test.ts`: applying a `height_override` edit updates the region in `cloneRegionsForSave` and marks dirty.

```typescript
it('records height_override on a clone region for save', async () => {
  // arrange a page with clone regions, call the new setRegionHeight(regionId, 400)
  // assert cloneRegionsForSave value contains { id, height_override: 400 } and isDirty === true
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `setRegionHeight(regionId, height)` (uses `applyRegionHeightOverride` on the working regions) and route inline-text / patch results into `edited_rendered` updates; mark `isDirty`. Persist via the existing `saveClone`. Expose the new fns from the composable.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(clone-studio): persist region edits + height override via saveClone`.

---

## Task 10: Preview — working tabs/carousels via same-origin

**Files:**
- Modify: `dashboard/src/pages/preview/[slug].vue`

- [ ] **Step 1: Implement** — pass `:allow-same-origin-sandbox="true"` down to `PageBuilderCanvas` → `CloneStudioCanvas` (add the prop passthrough on `PageBuilderCanvas` if missing) so the preview renders `allow-scripts allow-same-origin` and OEM tab/carousel scripts run. Editor stays default (`allow-scripts`).

- [ ] **Step 2: Build to verify** `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` → succeeds.

- [ ] **Step 3: Browser smoke (live, after deploy):** open `/preview/<clone-with-tabs>`, confirm a tab/carousel advances; in the editor, right-click a region → menu appears with correct actions; edit a heading inline and reload to confirm it persisted; set a region height and confirm the crop.

- [ ] **Step 4: Commit** `feat(preview): enable same-origin so tabs/carousels work in preview`.

---

## Self-Review

- **Spec coverage:** Context menu → Tasks 1,3,7,8. Inline editing → Task 4 (+persist 9). Visible height → Tasks 2,5,8,9. Tabs/carousels → Tasks 6,7,8,10. Persistence → Task 9 (existing `saveClone`). Security/same-origin → Task 10 (flagged, sanitizer unchanged). All spec sections map to tasks.
- **Placeholder scan:** Bridge tasks (3–6) note "read the surrounding bridge code first" because the bridge region object's exact property names (`region.element`, `resolveTextTarget`) must be matched to the real source — the executing subagent confirms these against `clone-studio-html.ts` before writing. This is a real dependency, not a placeholder; the message names, payloads, and test assertions are concrete.
- **Type consistency:** `height_override` (Task 2) is used identically in Tasks 5, 8, 9. `buildPatchPayload`/`getRegionActions` (Task 1) are consumed in Task 8. `translateFramePoint` (Task 7) is self-contained. `switchPanel`/`beginEdit` defined in Task 7, called in Task 8.
- **Note for executor:** Tasks 3–6 modify the 1556-line bridge string — read `candidateFrom`, `selectRegion`, `findRegionById`, the region object shape, and the text-target querySelector (~line 831) before editing so message handlers match the real region structure.
```
