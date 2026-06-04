# Clone Region Convert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Clone Studio `Convert to editable section...` as a raw editable `content-block` conversion in the dashboard builder and standalone preview.

**Architecture:** The iframe bridge serializes the selected region's cleaned HTML and sends it through the existing context-menu event chain. A small helper turns that HTML into a Page Builder `content-block`; the builder and preview hosts insert it with `addSectionFromLiveData()` and switch local mode to `sections`.

**Tech Stack:** Vue 3, TypeScript, Vitest, existing Clone Studio iframe bridge.

---

## File Structure

- Modify `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`: add selected region HTML to context-menu bridge payload.
- Modify `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`: forward region HTML from bridge messages.
- Modify `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`: retain region HTML in clone menu state and include it in `regionAction`.
- Create `dashboard/src/pages/dashboard/components/page-builder/clone-region-converter.ts`: build raw `content-block` section payloads from region HTML.
- Modify `dashboard/src/pages/dashboard/page-builder/[slug].vue`: convert clone region to a section in the dashboard builder.
- Modify `dashboard/src/pages/preview/[slug].vue`: convert clone region to a section in standalone preview.
- Modify tests under `dashboard/src/pages/dashboard/components/page-builder/`.

### Task 1: Write Failing Tests

- [ ] **Step 1: Add helper tests**

Create `dashboard/src/pages/dashboard/components/page-builder/clone-region-converter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { buildRawHtmlSectionFromCloneRegion } from './clone-region-converter'

describe('buildRawHtmlSectionFromCloneRegion', () => {
  it('wraps clone region HTML in an editable content block', () => {
    expect(buildRawHtmlSectionFromCloneRegion(' <section><h2>Offer</h2></section> ')).toEqual({
      type: 'content-block',
      title: '',
      content_html: '',
      _generated_html: '<section><h2>Offer</h2></section>',
      animation: 'fade-in',
    })
  })

  it('rejects blank clone region HTML', () => {
    expect(buildRawHtmlSectionFromCloneRegion('   ')).toBeNull()
  })
})
```

- [ ] **Step 2: Add source-level bridge and host tests**

Extend `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts` with assertions that:
- `clone-studio-html.ts` contains `function getRegionHtml(element)` and `regionHtml: getRegionHtml(region)`.
- `CloneStudioCanvas.vue` forwards `html: typeof data.regionHtml === 'string' ? data.regionHtml : ''`.
- `PageBuilderCanvas.vue` emits `html: region.html` for structural region actions.
- Both builder and preview import `buildRawHtmlSectionFromCloneRegion`, call `addSectionFromLiveData(section)`, and call `setActiveMode('sections')`.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-region-converter.test.ts dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: FAIL because `clone-region-converter.ts` does not exist and the bridge/host strings are not present.

### Task 2: Implement Bridge Payload

- [ ] **Step 1: Add `getRegionHtml()`**

In `clone-studio-html.ts`, add a bridge-local function that clones the selected region, removes `[data-clone-studio-bridge]`, removes hover/selected attributes, then returns `sanitizeHtml(stripPreviewScaffolding(clone.outerHTML))`.

- [ ] **Step 2: Add context-menu payload field**

In the bridge `contextmenu` handler, include:

```js
regionHtml: getRegionHtml(region)
```

- [ ] **Step 3: Forward region HTML**

In `CloneStudioCanvas.vue`, add `html` to the emitted `contextMenu` payload:

```ts
html: typeof data.regionHtml === 'string' ? data.regionHtml : '',
```

- [ ] **Step 4: Thread through PageBuilderCanvas**

In `PageBuilderCanvas.vue`, add `html?: string` to context menu and action payload types, store it in `CloneMenuRegion`, and emit it on `convert`/`duplicate`/`delete` structural actions. Only `convert` uses the field.

### Task 3: Implement Host Conversion

- [ ] **Step 1: Create conversion helper**

Create `clone-region-converter.ts`:

```ts
export function buildRawHtmlSectionFromCloneRegion(html: string | null | undefined): Record<string, any> | null {
  const trimmed = typeof html === 'string' ? html.trim() : ''
  if (!trimmed)
    return null
  return {
    type: 'content-block',
    title: '',
    content_html: '',
    _generated_html: trimmed,
    animation: 'fade-in',
  }
}
```

- [ ] **Step 2: Wire dashboard builder conversion**

In `dashboard/src/pages/dashboard/page-builder/[slug].vue`, import the helper, destructure `setActiveMode`, and update `onRegionAction` so `convert` builds a section, handles blank HTML with `toast.error`, calls `addSectionFromLiveData(section)`, then `setActiveMode('sections')`.

- [ ] **Step 3: Wire standalone preview conversion**

In `dashboard/src/pages/preview/[slug].vue`, import the helper, destructure `addSectionFromLiveData` and `setActiveMode`, and use the same conversion logic in `onRegionAction`.

### Task 4: Verify and Ship

- [ ] **Step 1: Run focused tests**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/clone-region-converter.test.ts dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --dir dashboard exec vue-tsc -b
```

Expected: exit 0.

- [ ] **Step 3: Run full dashboard tests**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production
```

Expected: all tests pass.

- [ ] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Commit, push, build, and deploy**

Commit:

```bash
git add docs/superpowers/specs/2026-06-05-clone-region-convert-design.md docs/superpowers/plans/2026-06-05-clone-region-convert.md dashboard/src/pages/dashboard/components/page-builder/clone-region-converter.ts dashboard/src/pages/dashboard/components/page-builder/clone-region-converter.test.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts dashboard/src/pages/dashboard/page-builder/[slug].vue dashboard/src/pages/preview/[slug].vue
git commit -m "feat(page-builder): convert clone regions to sections"
git push
```

Build and deploy:

```bash
CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```
