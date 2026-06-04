# Clone Studio `duplicate` Region Action — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click a Clone Studio region → **Duplicate** inserts an identical copy immediately after the source as a first-class region (selectable, croppable, persisted in `section_index`).

**Architecture:** Mirror the existing `set-height` / `switch-panel` round-trip. A new bridge message `clone-studio:duplicate-region` clones the region DOM subtree, strips every nested `data-oem-region-id` so ids re-assign collision-free, inserts the clone after the source, and posts `dom-updated` with `newRegion: regionPayload(clone)`. The two-layer host (`CloneStudioCanvas` inside `PageBuilderCanvas`) relays a new `regionAdded` / `cloneRegionAdded` event up to `[slug].vue`, which persists the HTML (existing path) and adds the new `CloneRegion` to drafts via `addCloneRegion`.

**Tech Stack:** Vue 3 `<script setup>` SFCs, TypeScript, Vitest. Bridge is a hand-written ES5 IIFE inside a TS template literal in `clone-studio-html.ts`. `.vue` wiring and bridge handlers are tested via **source-string / `buildCloneStudioHtml` string assertions** and duck-typed fake nodes (node env, no jsdom) — the established convention in this codebase.

**Conventions to honor (from project memory + handoff):**
- ANY element the bridge injects MUST carry `data-clone-studio-bridge` (else it leaks into persisted HTML). Duplicate clones existing OEM nodes, not injected ones, so this does not apply to the clone itself — but do not strip/alter the `data-clone-studio-bridge` serialize logic.
- **No backticks** anywhere in the bridge string (it is a TS template literal).
- ES5 `var`-in-loop closure trap: not triggered here (attribute walk only, no per-element handlers), but use `var` + index loops to match surrounding bridge style.
- Ship build: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` (`vue-tsc -b` is currently 0 errors — keep clean).
- Full test run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production` (214 pass today — keep green).

---

## File Structure

- **Modify** `dashboard/src/composables/use-page-builder.ts` — add `addCloneRegion(region)`; export it. (~lines 333–339 sibling `upsertCloneRegionDraft`; return block ~832+.)
- **Modify** `dashboard/src/composables/use-page-builder.test.ts` — behavioral test for `addCloneRegion`.
- **Modify** `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts` — `MESSAGE_DUPLICATE_REGION` const (~line 208), handler in the message listener (~after line 1745), and exported pure helper `reassignClonedRegionIdsForTest` (~near other `*ForTest` exports, line 1776+).
- **Modify** `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts` — pure-helper test + bridge string-assertion test.
- **Modify** `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue` — `regionAdded` emit (~line 99), `duplicateRegion` fn (~line 234) + `defineExpose` (~line 272), `regionAdded` emit in the `dom-updated` branch (~line 181).
- **Modify** `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue` — `cloneRegionAdded` emit, `duplicateRegion` fn + `defineExpose` (~line 69), `@region-added` binding on `<CloneStudioCanvas>` (~line 527).
- **Modify** `dashboard/src/pages/dashboard/page-builder/[slug].vue` — widen `pageBuilderCanvas` ref type (~line 129), `onRegionAction` `'duplicate'` branch (~line 220), `@clone-region-added` binding (~line 1040).
- **Modify** `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts` — source-string wiring assertions for the `.vue` changes.

Spec: `docs/superpowers/specs/2026-06-04-clone-studio-duplicate-region-design.md`.

---

## Task 1: Composable `addCloneRegion`

Adds the new region to the draft list so it flows through `saveClone` into `section_index`. Drafts already win in `cloneRegionsForSave`.

**Files:**
- Modify: `dashboard/src/composables/use-page-builder.ts` (sibling of `upsertCloneRegionDraft` ~line 339; return block ~line 878 next to `setRegionHeight`)
- Test: `dashboard/src/composables/use-page-builder.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `dashboard/src/composables/use-page-builder.test.ts` (inside a `describe`, top-level imports `usePageBuilder` already present):

```ts
describe('usePageBuilder addCloneRegion', () => {
  it('adds a region to cloneRegionsForSave and marks the builder dirty', () => {
    const builder = usePageBuilder()
    const region = {
      id: 'clone-region-99',
      label: 'Hero (copy)',
      selector: '[data-oem-region-id="clone-region-99"]',
      tag: 'section',
      classes: ['hero'],
      top: 120,
      height: 480,
      type_hint: 'hero',
      editable_fields: [],
    }

    expect(builder.cloneRegionsForSave.value.some(r => r.id === 'clone-region-99')).toBe(false)

    builder.addCloneRegion(region as any)

    expect(builder.cloneRegionsForSave.value.some(r => r.id === 'clone-region-99')).toBe(true)
    expect(builder.isDirty.value).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-page-builder.test.ts -t "addCloneRegion"`
Expected: FAIL — `builder.addCloneRegion is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `dashboard/src/composables/use-page-builder.ts`, immediately after the `upsertCloneRegionDraft` function (the one ending ~line 339), add:

```ts
  // Add a brand-new clone region (e.g. from a duplicate action) to the draft list so it
  // persists into section_index via saveClone. Drafts win in cloneRegionsForSave.
  function addCloneRegion(region: CloneRegion) {
    upsertCloneRegionDraft(region)
    isDirty.value = true
  }
```

Then add `addCloneRegion,` to the returned object, next to `setRegionHeight,` (~line 878):

```ts
    setRegionHeight,
    addCloneRegion,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-page-builder.test.ts -t "addCloneRegion"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/composables/use-page-builder.ts dashboard/src/composables/use-page-builder.test.ts
git commit -m "feat(clone-studio): addCloneRegion composable for first-class duplicates"
```

---

## Task 2: Bridge re-ID pure helper

The trickiest bit of duplication is avoiding duplicate `data-oem-region-id` values. Extract the strip walk as a real exported TS helper (duck-typed, node-testable) that the bridge handler in Task 3 mirrors in ES5. Follows the existing `stripCloneStudioBridgeNodesForTest` pattern (a TS mirror of bridge DOM behavior).

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts` (near the other `*ForTest` exports, ~line 1776)
- Test: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `clone-studio-html.test.ts`. First extend the import block (lines 3–11) to include `reassignClonedRegionIdsForTest`:

```ts
import {
  buildCloneStudioHtml,
  reassignClonedRegionIdsForTest,
  sanitizeCloneStudioHtmlForTest,
  sanitizeCloneStudioUrlForTest,
  serializeCloneStudioBodyForTest,
  stopCloneStudioBlockedEventForTest,
  stripCloneStudioBridgeNodesForTest,
  stripCloneStudioScaffoldingForTest,
} from './clone-studio-html'
```

Then add the test (mirrors the fake-clone duck-typing at the existing `stripCloneStudioBridgeNodesForTest` test ~line 742):

```ts
describe('reassignClonedRegionIdsForTest', () => {
  it('removes the clone root id and every nested region id so ids re-assign collision-free', () => {
    const removed: string[] = []
    const makeNode = (id: string) => ({
      removeAttribute: (name: string) => {
        if (name === 'data-oem-region-id')
          removed.push(id)
      },
    })
    const nested = [makeNode('nested-1'), makeNode('nested-2')]
    const fakeClone = {
      removeAttribute: (name: string) => {
        if (name === 'data-oem-region-id')
          removed.push('root')
      },
      querySelectorAll: (selector: string) =>
        (selector === '[data-oem-region-id]' ? nested : []) as any,
    }

    const count = reassignClonedRegionIdsForTest(fakeClone as any)

    expect(count).toBe(2)
    expect(removed).toEqual(['root', 'nested-1', 'nested-2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "reassignClonedRegionIdsForTest"`
Expected: FAIL — `reassignClonedRegionIdsForTest is not exported` / not a function.

- [ ] **Step 3: Write minimal implementation**

In `clone-studio-html.ts`, near the other `*ForTest` exports (after `stripCloneStudioBridgeNodesForTest`, ~line 1786), add:

```ts
interface CloneStudioReassignNode {
  removeAttribute: (name: string) => void
  querySelectorAll: (selector: string) => ArrayLike<{ removeAttribute: (name: string) => void }>
}

// Strip the clone root's region id plus every nested region id. After this, ids re-acquire
// lazily and collision-free via ensureRegionId. The bridge duplicate-region handler runs the
// equivalent ES5 walk in the iframe — keep the two in sync.
export function reassignClonedRegionIdsForTest(clone: CloneStudioReassignNode): number {
  clone.removeAttribute('data-oem-region-id')
  const nested = clone.querySelectorAll('[data-oem-region-id]')
  for (let i = 0; i < nested.length; i++)
    nested[i].removeAttribute('data-oem-region-id')
  return nested.length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "reassignClonedRegionIdsForTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
git commit -m "feat(clone-studio): reassignClonedRegionIds helper for duplicate re-ID"
```

---

## Task 3: Bridge `duplicate-region` handler

Add the message constant and the handler in the iframe bridge. The handler clones the region, strips nested ids (ES5 mirror of Task 2), inserts after the source, assigns the clone a fresh root id via `ensureRegionId`, and posts `dom-updated` carrying `newRegion`.

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts` (message const ~line 208; handler ~after line 1745)
- Test: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `clone-studio-html.test.ts` (reuse the `extractBridgeScript` helper already defined at the top of the file, ~line 21):

```ts
describe('buildCloneStudioHtml duplicate-region bridge handler', () => {
  it('wires the duplicate-region message to clone, re-ID and post newRegion', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main data-oem-region-id="r1"><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/',
      selectedRegionId: null,
    })
    const bridge = extractBridgeScript(html)

    expect(bridge).toContain('clone-studio:duplicate-region')
    expect(bridge).toContain('cloneNode(true)')
    expect(bridge).toContain('insertBefore')
    // strips every nested region id before re-assigning, so ids stay collision-free
    expect(bridge).toContain("querySelectorAll('[data-oem-region-id]')")
    // posts the new region payload alongside the updated DOM
    expect(bridge).toContain('newRegion')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "duplicate-region bridge handler"`
Expected: FAIL — `clone-studio:duplicate-region` not found in bridge.

- [ ] **Step 3a: Add the message constant**

In `clone-studio-html.ts`, in the bridge constant block, after `var MESSAGE_SWITCH_PANEL = 'clone-studio:switch-panel'` (line 208), add:

```js
  var MESSAGE_DUPLICATE_REGION = 'clone-studio:duplicate-region'
```

- [ ] **Step 3b: Add the handler**

In the `window.addEventListener('message', ...)` block, immediately after the `MESSAGE_SWITCH_PANEL` handler (the block ending ~line 1745, before the closing `})`), add:

```js
    if (message.type === MESSAGE_DUPLICATE_REGION) {
      var dupRegionId = message.regionId || message.selectedRegionId || message.id
      var dupSource = findRegionById(dupRegionId)
      if (!dupSource || !dupSource.parentNode)
        return
      var dupClone = dupSource.cloneNode(true)
      // Strip the clone's own region id and every nested region id so ensureRegionId
      // re-assigns collision-free (descendants re-acquire ids lazily on interaction).
      if (dupClone.removeAttribute)
        dupClone.removeAttribute('data-oem-region-id')
      var dupNested = dupClone.querySelectorAll('[data-oem-region-id]')
      for (var di = 0; di < dupNested.length; di++)
        dupNested[di].removeAttribute('data-oem-region-id')
      dupSource.parentNode.insertBefore(dupClone, dupSource.nextSibling)
      ensureRegionId(dupClone)
      post(MESSAGE_DOM_UPDATED, { regionId: dupClone.getAttribute('data-oem-region-id'), newRegion: regionPayload(dupClone) })
      return
    }
```

(No backticks used. `var`/index loop matches bridge style. `regionPayload`, `ensureRegionId`, `findRegionById`, `post`, `MESSAGE_DOM_UPDATED` are all already defined earlier in the bridge.)

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts -t "duplicate-region bridge handler"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
git commit -m "feat(clone-studio): bridge duplicate-region handler (clone + re-ID + post newRegion)"
```

---

## Task 4: `CloneStudioCanvas` — `duplicateRegion` + `regionAdded`

The inner host posts the message to the frame and relays the bridge's `newRegion` up as a `regionAdded` event.

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue` (emits ~line 99; `dom-updated` branch ~line 181; new fn ~line 234; `defineExpose` ~line 272)
- Test: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `page-builder-canvas-preview.test.ts`:

```ts
describe('CloneStudioCanvas duplicate-region relay', () => {
  it('exposes duplicateRegion and re-emits the bridge newRegion as regionAdded', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('regionAdded: [region: CloneRegion]')
    expect(source).toContain("type: 'clone-studio:duplicate-region'")
    expect(source).toContain('duplicateRegion,')
    expect(source).toContain("emit('regionAdded', data.newRegion)")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts -t "duplicate-region relay"`
Expected: FAIL — strings not found in `CloneStudioCanvas.vue`.

- [ ] **Step 3a: Add the emit type**

In `CloneStudioCanvas.vue` `defineEmits` (lines 99–104), add the `regionAdded` line. Ensure `CloneRegion` is imported (it is — `import type { CloneRegion ... } from '@/pages/dashboard/page-builder/page-modes'`; if absent in this file, add it to the existing type import from `./` or `@/pages/dashboard/page-builder/page-modes`):

```ts
const emit = defineEmits<{
  selectRegion: [region: any]
  domUpdated: [html: string]
  regionAdded: [region: CloneRegion]
  contextMenu: [menu: { regionId: any, fields: any, typeHint: any, x: number, y: number }]
  regionHeight: [payload: { regionId: any, height: number | null }]
}>()
```

If `CloneRegion` is not yet imported in this SFC, add at the top with the other imports:

```ts
import type { CloneRegion } from '@/pages/dashboard/page-builder/page-modes'
```

- [ ] **Step 3b: Emit `regionAdded` from the `dom-updated` branch**

In `onMessage`, the `clone-studio:dom-updated` branch (lines 181–186), after `emit('domUpdated', html)`:

```ts
  if (data.type === 'clone-studio:dom-updated') {
    const html = typeof data.bodyHtml === 'string' ? data.bodyHtml : data.html
    if (typeof html === 'string')
      emit('domUpdated', html)
    if (data.newRegion && typeof data.newRegion === 'object')
      emit('regionAdded', data.newRegion as CloneRegion)
    return
  }
```

- [ ] **Step 3c: Add `duplicateRegion` and expose it**

Next to `setHeight` (~line 234) add:

```ts
function duplicateRegion(regionId: string) {
  postToFrame({ type: 'clone-studio:duplicate-region', regionId, bridgeToken })
}
```

Add it to `defineExpose` (lines 272–278):

```ts
defineExpose({
  postToFrame,
  patchField,
  beginEdit,
  switchPanel,
  setHeight,
  duplicateRegion,
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts -t "duplicate-region relay"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
git commit -m "feat(clone-studio): CloneStudioCanvas duplicateRegion + regionAdded relay"
```

---

## Task 5: `PageBuilderCanvas` + `[slug].vue` wiring

The wrapper host exposes `duplicateRegion` and re-emits `cloneRegionAdded`; the page dispatches `'duplicate'` and persists the new region via `addCloneRegion`.

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue` (emits block; `defineExpose` ~line 69; `<CloneStudioCanvas>` bindings ~line 527; `cloneStudioCanvas` ref ~line 61)
- Modify: `dashboard/src/pages/dashboard/page-builder/[slug].vue` (ref type ~line 129; `onRegionAction` ~line 220; composable destructure ~line 56; `<PageBuilderCanvas>` bindings ~line 1040)
- Test: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `page-builder-canvas-preview.test.ts`:

```ts
describe('duplicate region wiring through the host layers', () => {
  it('threads duplicateRegion and cloneRegionAdded from page to bridge', () => {
    const canvasSource = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')

    // Wrapper exposes duplicateRegion and re-emits cloneRegionAdded
    expect(canvasSource).toContain('cloneRegionAdded: [region: CloneRegion]')
    expect(canvasSource).toContain('cloneStudioCanvas.value?.duplicateRegion(regionId)')
    expect(canvasSource).toContain('duplicateRegion,')
    expect(canvasSource).toContain("@region-added=\"!props.readOnly && emit('cloneRegionAdded', $event)\"")

    // Page dispatches duplicate and persists the new region
    expect(pageSource).toContain('pageBuilderCanvas.value?.duplicateRegion(regionId)')
    expect(pageSource).toContain('@clone-region-added="addCloneRegion"')
    expect(pageSource).toContain('addCloneRegion,')
    // convert stays a toast; duplicate no longer hits the coming-soon path
    expect(pageSource).toContain("action === 'convert'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts -t "wiring through the host layers"`
Expected: FAIL — strings not found.

- [ ] **Step 3a: `PageBuilderCanvas.vue` — emit + fn + expose + binding**

Add `cloneRegionAdded` to `defineEmits` (the block containing `cloneDomUpdated` / `regionAction`). Ensure `CloneRegion` type is imported in this SFC (add `import type { CloneRegion } from '@/pages/dashboard/page-builder/page-modes'` if absent):

```ts
  cloneDomUpdated: [html: string]
  cloneRegionAdded: [region: CloneRegion]
  regionAction: [payload: { action: RegionActionId, regionId: string }]
```

Add the `duplicateRegion` function next to `patchCloneField` (~line 63):

```ts
function duplicateRegion(regionId: string) {
  if (props.readOnly)
    return
  cloneStudioCanvas.value?.duplicateRegion(regionId)
}
```

Add it to `defineExpose` (lines 69–71):

```ts
defineExpose({
  patchCloneField,
  duplicateRegion,
})
```

On the `<CloneStudioCanvas>` element, after `@dom-updated="..."` (line 527), add:

```html
            @region-added="!props.readOnly && emit('cloneRegionAdded', $event)"
```

- [ ] **Step 3b: `[slug].vue` — ref type, dispatch, destructure, binding**

Widen the `pageBuilderCanvas` ref type (line 129):

```ts
const pageBuilderCanvas = ref<{
  patchCloneField: (payload: Record<string, unknown>) => void
  duplicateRegion: (regionId: string) => void
} | null>(null)
```

In `onRegionAction` (lines 206–223), replace the combined duplicate/convert stub so `duplicate` dispatches and only `convert` toasts:

```ts
  if (action === 'duplicate') {
    pageBuilderCanvas.value?.duplicateRegion(regionId)
    return
  }
  if (action === 'convert') {
    toast('Convert coming soon')
  }
```

Add `addCloneRegion` to the `usePageBuilder()` destructure (the `const { ... } = ` block starting ~line 56 — add near `setRegionHeight`):

```ts
  setRegionHeight,
  addCloneRegion,
```

On the `<PageBuilderCanvas>` element, after `@clone-dom-updated="onCloneDomUpdated"` (line 1038), add:

```html
            @clone-region-added="addCloneRegion"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts -t "wiring through the host layers"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue dashboard/src/pages/dashboard/page-builder/[slug].vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
git commit -m "feat(clone-studio): wire duplicate region through canvas hosts to page persistence"
```

---

## Task 6: Full suite + typecheck + build

- [ ] **Step 1: Run the full test suite**

Run: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production`
Expected: PASS — 214 prior + the new tests (no regressions).

- [ ] **Step 2: Typecheck**

Run: `pnpm --dir dashboard exec vue-tsc -b`
Expected: 0 errors. Fix any type errors (most likely a missing `CloneRegion` import in `CloneStudioCanvas.vue` or `PageBuilderCanvas.vue`).

- [ ] **Step 3: Production build**

Run: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build`
Expected: build succeeds.

- [ ] **Step 4: Commit (only if Steps 2–3 required fixes)**

```bash
git add -A
git commit -m "chore(clone-studio): typecheck/build fixes for duplicate-region"
```

---

## Manual verification (post-merge, in the running dashboard)

Not automatable through the sandboxed iframe — do by hand on a real clone (e.g. a Ford model page in Clone Studio):

1. Right-click a region → **Duplicate** → a copy appears immediately below the source.
2. The copy is selectable (click it → region selected); right-click → menu shows.
3. Crop the copy's height via the drag-handle → **Save** → reload → the copy AND its crop persist (confirms it landed in `section_index`, not HTML-only).
4. **Convert** still shows the "coming soon" toast (out of scope).

## Deployment

Dashboard-only — no worker deploy. Per project deploy workflow:

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

---

## Self-review notes (addressed)

- **Spec coverage:** Bridge handler (Task 3) ✓, re-ID first-class via section_index (Tasks 1+5) ✓, two-layer host relay (Tasks 4+5) ✓, `convert` stays toast (Task 5) ✓, 5 test areas (Tasks 1–5) ✓, build/typecheck (Task 6) ✓.
- **Type consistency:** `duplicateRegion(regionId: string)` and `regionAdded`/`cloneRegionAdded: [region: CloneRegion]` and `addCloneRegion(region: CloneRegion)` are consistent across CloneStudioCanvas → PageBuilderCanvas → `[slug].vue` → composable.
- **No placeholders:** every code/command step is concrete.
