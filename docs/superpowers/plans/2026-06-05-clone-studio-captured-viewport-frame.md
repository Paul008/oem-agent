# Clone Studio Captured Viewport Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make full Clone Studio clone previews render at the viewport width stored with the captured clone.

**Architecture:** Add a dashboard page-mode helper that validates and returns clone viewport metadata with a legacy fallback. Wire `PageBuilderCanvas.vue` full clone frame width to that helper while preserving fixed tablet and mobile widths.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite dashboard build, Cloudflare Pages deploy.

---

### Task 1: Add Clone Viewport Helper

**Files:**
- Modify: `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/page-modes.ts`

- [ ] **Step 1: Write failing tests for stored and fallback clone viewport metadata**

Update the import in `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`:

```ts
import {
  applyRegionHeightOverride,
  getActivePageMode,
  getAvailablePageModes,
  getCloneHtml,
  getCloneRegions,
  getCloneStylesheetUrls,
  getCloneViewport,
  getSectionItems,
  normalizeDashboardPageModes,
} from './page-modes'
```

Add these tests inside `describe('dashboard page modes', () => { ... })`, after the stylesheet URL tests:

```ts
  it('returns the stored clone viewport metadata', () => {
    const page = {
      content: {
        modes: {
          clone: {
            rendered: '<main>clone</main>',
            viewport: { width: 1680, height: 1080 },
          },
        },
      },
    }

    expect(getCloneViewport(page)).toEqual({ width: 1680, height: 1080 })
  })

  it('falls back to the standard desktop viewport when clone viewport metadata is missing or invalid', () => {
    const invalidPages = [
      {},
      { content: { modes: { clone: { rendered: '<main>clone</main>' } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: 0, height: 1080 } } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: -1, height: 1080 } } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: Number.POSITIVE_INFINITY, height: 1080 } } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: '1440', height: 1080 } } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: 1440, height: 0 } } } } },
    ]

    for (const page of invalidPages) {
      expect(getCloneViewport(page)).toEqual({ width: 1280, height: 1080 })
    }
  })
```

- [ ] **Step 2: Run focused page-mode tests to verify RED**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/page-builder/page-modes.test.ts
```

Expected: FAIL because `getCloneViewport` is not exported.

- [ ] **Step 3: Implement the helper**

In `dashboard/src/pages/dashboard/page-builder/page-modes.ts`, add viewport typing near `CloneRegion`:

```ts
export interface CloneViewport {
  width: number
  height: number
}
```

Extend `CloneModeContent`:

```ts
interface CloneModeContent extends Record<string, unknown> {
  rendered?: unknown
  edited_rendered?: unknown
  section_index?: unknown
  stylesheet_urls?: unknown
  viewport?: unknown
}
```

Add this fallback constant near `PAGE_MODE_ORDER`:

```ts
const FALLBACK_CLONE_VIEWPORT: CloneViewport = { width: 1280, height: 1080 }
```

Add this exported helper after `getCloneStylesheetUrls()`:

```ts
export function getCloneViewport(page: DashboardPage | null | undefined): CloneViewport {
  const viewport = getCloneMode(page)?.viewport
  if (!isRecord(viewport))
    return { ...FALLBACK_CLONE_VIEWPORT }

  const width = viewport.width
  const height = viewport.height
  if (!isPositiveFiniteNumber(width) || !isPositiveFiniteNumber(height))
    return { ...FALLBACK_CLONE_VIEWPORT }

  return { width, height }
}
```

Add this local helper near `isRecord()`:

```ts
function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
```

- [ ] **Step 4: Run focused page-mode tests to verify GREEN**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/page-builder/page-modes.test.ts
```

Expected: PASS.

### Task 2: Wire Clone Studio Full Frame Width

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`

- [ ] **Step 1: Write failing source-level canvas wiring test**

Add this test inside `describe('PageBuilderCanvas preview mode', () => { ... })` in `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`, near the existing Clone Studio preview tests:

```ts
  it('uses captured clone viewport metadata for the full clone frame width', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const helperImport = source.indexOf('getCloneViewport')
    const viewportComputed = source.indexOf('const cloneViewport = computed(() => getCloneViewport(props.page))')
    const fullWidthBranch = source.indexOf('return cloneViewport.value.width')
    const tabletBranch = source.indexOf("if (previewWidth.value === 'tablet')")
    const mobileBranch = source.indexOf("if (previewWidth.value === 'mobile')")

    expect(helperImport).toBeGreaterThan(-1)
    expect(viewportComputed).toBeGreaterThan(helperImport)
    expect(tabletBranch).toBeGreaterThan(viewportComputed)
    expect(mobileBranch).toBeGreaterThan(tabletBranch)
    expect(fullWidthBranch).toBeGreaterThan(mobileBranch)
    expect(source).not.toContain('return 1280')
  })
```

- [ ] **Step 2: Run focused canvas tests to verify RED**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: FAIL because `PageBuilderCanvas.vue` does not import or use `getCloneViewport`.

- [ ] **Step 3: Implement canvas wiring**

In `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`, replace the type-only import:

```ts
import type { CloneRegion, PageMode } from '../../page-builder/page-modes'
```

with:

```ts
import { getCloneViewport, type CloneRegion, type PageMode } from '../../page-builder/page-modes'
```

Add this computed before `cloneFrameWidth`:

```ts
const cloneViewport = computed(() => getCloneViewport(props.page))
```

Update `cloneFrameWidth`:

```ts
const cloneFrameWidth = computed(() => {
  if (previewWidth.value === 'tablet')
    return 768
  if (previewWidth.value === 'mobile')
    return 375
  return cloneViewport.value.width
})
```

- [ ] **Step 4: Run focused dashboard tests to verify GREEN**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/page-builder/page-modes.test.ts dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: PASS.

### Task 3: Full Verification, Commit, Push, Deploy

**Files:**
- Verify: `dashboard/src/pages/dashboard/page-builder/page-modes.ts`
- Verify: `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`
- Verify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`
- Verify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`
- Verify: `docs/superpowers/specs/2026-06-05-clone-studio-captured-viewport-frame-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-clone-studio-captured-viewport-frame.md`

- [ ] **Step 1: Run dashboard unit tests**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production
```

Expected: dashboard tests pass.

- [ ] **Step 2: Run dashboard typecheck**

Run:

```bash
pnpm --dir dashboard exec vue-tsc -b
```

Expected: exit code 0.

- [ ] **Step 3: Run dashboard production build**

Run:

```bash
CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build
```

Expected: build succeeds and writes `dashboard/dist`.

- [ ] **Step 4: Check patch hygiene**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add dashboard/src/pages/dashboard/page-builder/page-modes.ts dashboard/src/pages/dashboard/page-builder/page-modes.test.ts dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts docs/superpowers/plans/2026-06-05-clone-studio-captured-viewport-frame.md
git commit -m "fix(page-builder): use captured clone viewport frame"
```

Expected: commit created on `main`.

- [ ] **Step 6: Push**

Run:

```bash
git push
```

Expected: `main` pushes to `origin/main`.

- [ ] **Step 7: Deploy dashboard**

Run:

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

Expected: Cloudflare Pages deployment completes and prints a deployment URL.
