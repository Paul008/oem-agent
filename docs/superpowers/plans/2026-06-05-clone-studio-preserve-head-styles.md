# Clone Studio Preserve Head Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep original captured Clone Studio head styles available when rendering body-only edited clone HTML.

**Architecture:** Add a dashboard page-mode helper that combines original captured link/style head parts with the current edited clone body. Wire `CloneStudioCanvas.vue` to feed that helper into the existing `buildCloneStudioHtml()` sanitizer and iframe builder.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite dashboard build, Cloudflare Pages deploy.

---

### Task 1: Add Clone Studio Source HTML Helper

**Files:**
- Modify: `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/page-modes.ts`

- [ ] **Step 1: Write failing tests for edited clone head preservation**

Update the import in `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`:

```ts
import {
  applyRegionHeightOverride,
  getActivePageMode,
  getAvailablePageModes,
  getCloneHtml,
  getCloneRegions,
  getCloneStudioHtml,
  getCloneStylesheetUrls,
  getCloneViewport,
  getSectionItems,
  normalizeDashboardPageModes,
} from './page-modes'
```

Add these tests inside `describe('dashboard page modes', () => { ... })`, after the `getCloneViewport()` tests:

```ts
  it('combines original captured head parts with the edited clone body for Clone Studio', () => {
    const page = {
      content: {
        modes: {
          clone: {
            rendered: '<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen"><style>.hero { color: red; }</style><main><h1>Original</h1></main>',
            edited_rendered: '<main><h1>Edited</h1></main>',
          },
        },
      },
    }

    const html = getCloneStudioHtml(page)

    expect(html).toContain('<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen">')
    expect(html).toContain('<style>.hero { color: red; }</style>')
    expect(html).toContain('<main><h1>Edited</h1></main>')
    expect(html).not.toContain('<main><h1>Original</h1></main>')
  })

  it('returns normal clone html for Clone Studio when no edited body exists', () => {
    const rendered = '<link rel="stylesheet" href="https://cdn.example.test/site.css"><main><h1>Original</h1></main>'
    const page = {
      content: {
        modes: {
          clone: {
            rendered,
          },
        },
      },
    }

    expect(getCloneStudioHtml(page)).toBe(rendered)
  })
```

- [ ] **Step 2: Run focused page-mode tests to verify RED**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/page-builder/page-modes.test.ts
```

Expected: FAIL because `getCloneStudioHtml` is not exported.

- [ ] **Step 3: Implement the helper**

In `dashboard/src/pages/dashboard/page-builder/page-modes.ts`, add this constant near `PAGE_MODE_ORDER`:

```ts
const CLONE_HEAD_PART_PATTERN = /<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/gi
```

Add this exported helper after `getCloneHtml()`:

```ts
export function getCloneStudioHtml(page: DashboardPage | null | undefined): string {
  const clone = getCloneMode(page)
  const editedRendered = clone?.edited_rendered
  if (typeof editedRendered !== 'string' || editedRendered.length === 0) {
    return getCloneHtml(page)
  }

  const originalRendered = typeof clone?.rendered === 'string' ? clone.rendered : ''
  return [
    ...extractCloneHeadParts(originalRendered),
    editedRendered,
  ].filter(part => part.length > 0).join('\n')
}
```

Add this local helper near `extractStylesheetHrefs()`:

```ts
function extractCloneHeadParts(html: string): string[] {
  return [...html.matchAll(CLONE_HEAD_PART_PATTERN)].map(match => match[0])
}
```

- [ ] **Step 4: Run focused page-mode tests to verify GREEN**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/page-builder/page-modes.test.ts
```

Expected: PASS.

### Task 2: Wire Clone Studio Canvas to Preserved Source HTML

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`

- [ ] **Step 1: Write failing source-level canvas wiring test**

Add this test inside `describe('PageBuilderCanvas preview mode', () => { ... })` in `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`, near the other Clone Studio canvas tests:

```ts
  it('feeds preserved clone studio source html into the iframe builder', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')
    const helperImport = source.indexOf('getCloneStudioHtml')
    const builderUsage = source.indexOf('rendered: getCloneStudioHtml(options.page)')

    expect(helperImport).toBeGreaterThan(-1)
    expect(builderUsage).toBeGreaterThan(helperImport)
    expect(source).not.toContain('rendered: getCloneHtml(options.page)')
  })
```

- [ ] **Step 2: Write failing integration test for edited clone iframe output**

Add this test inside `describe('Clone Studio components', () => { ... })` in `dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts`, after the `builds canvas srcdoc independently of selected region changes` test:

```ts
  it('preserves original captured head styles when rendering an edited clone body', () => {
    const page = {
      content: {
        modes: {
          clone: {
            rendered: '<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen"><style>.hero { color: red; }</style><main><h1>Original</h1></main>',
            edited_rendered: '<main data-oem-region-id="hero"><h1>Edited</h1></main>',
            stylesheet_urls: ['https://cdn.example.test/site.css'],
          },
        },
      },
    }

    const html = buildCloneStudioFrameHtmlForCanvas({
      page,
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/',
      workerBase: '',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const head = html.slice(0, html.indexOf('</head>'))

    expect(head).toContain('<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen">')
    expect((head.match(/href="https:\/\/cdn\.example\.test\/site\.css"/g) || []).length).toBe(1)
    expect(head).toContain('<style>.hero { color: red; }</style>')
    expect(html).toContain('<h1>Edited</h1>')
    expect(html).not.toContain('<h1>Original</h1>')
  })
```

- [ ] **Step 3: Run focused canvas/component tests to verify RED**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts
```

Expected: FAIL because `CloneStudioCanvas.vue` still passes `getCloneHtml(options.page)`.

- [ ] **Step 4: Implement canvas wiring**

In `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`, replace:

```ts
import { getCloneHtml, getCloneRegions, getCloneStylesheetUrls } from '../../page-builder/page-modes'
```

with:

```ts
import { getCloneRegions, getCloneStudioHtml, getCloneStylesheetUrls } from '../../page-builder/page-modes'
```

Then replace the `buildCloneStudioHtml()` rendered input:

```ts
    rendered: getCloneHtml(options.page),
```

with:

```ts
    rendered: getCloneStudioHtml(options.page),
```

- [ ] **Step 5: Run focused dashboard tests to verify GREEN**

Run:

```bash
CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/page-builder/page-modes.test.ts dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts
```

Expected: PASS.

### Task 3: Full Verification, Commit, Push, Deploy

**Files:**
- Verify: `dashboard/src/pages/dashboard/page-builder/page-modes.ts`
- Verify: `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`
- Verify: `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`
- Verify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`
- Verify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts`
- Verify: `docs/superpowers/specs/2026-06-05-clone-studio-preserve-head-styles-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-clone-studio-preserve-head-styles.md`

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
git add dashboard/src/pages/dashboard/page-builder/page-modes.ts dashboard/src/pages/dashboard/page-builder/page-modes.test.ts dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts docs/superpowers/plans/2026-06-05-clone-studio-preserve-head-styles.md
git commit -m "fix(page-builder): preserve clone head styles after edits"
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

- [ ] **Step 8: Verify live dashboard**

Run:

```bash
curl -I https://oem-dashboard.pages.dev
```

Expected: HTTP 200.
