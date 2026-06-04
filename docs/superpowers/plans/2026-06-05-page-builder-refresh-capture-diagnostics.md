# Page Builder Capture Diagnostics Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the Page Builder capture diagnostics badge immediately after clone and adaptive pipeline runs.

**Architecture:** Keep diagnostics state local to `dashboard/src/pages/dashboard/page-builder/[slug].vue`. Reuse the existing `loadCaptureDiagnostics()` helper after capture-producing actions, and protect the behavior with a source-regression test.

**Tech Stack:** Vue 3 SFC, TypeScript, Vitest dashboard source-regression tests.

---

## File Structure

- Modify `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`: add a source-regression test for diagnostics refresh wiring in the page-builder host.
- Modify `dashboard/src/pages/dashboard/page-builder/[slug].vue`: call `loadCaptureDiagnostics()` after clone and adaptive pipeline actions finish.

## Task 1: Add Failing Diagnostics Refresh Test

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test near the other page-builder host wiring tests:

```ts
it('refreshes capture diagnostics after capture-producing page builder actions', () => {
  const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')
  const mountedStart = pageSource.indexOf('onMounted(async () => {')
  const mountedEnd = pageSource.indexOf('const captureDiagnostics = ref', mountedStart)
  const mountedSource = pageSource.slice(mountedStart, mountedEnd)
  const cloneStart = pageSource.indexOf('async function runClone()')
  const cloneEnd = pageSource.indexOf('async function runStructure', cloneStart)
  const cloneSource = pageSource.slice(cloneStart, cloneEnd)
  const structureStart = pageSource.indexOf('async function runStructure')
  const structureEnd = pageSource.indexOf('async function runAdaptivePipeline', structureStart)
  const structureSource = pageSource.slice(structureStart, structureEnd)
  const pipelineStart = pageSource.indexOf('async function runAdaptivePipeline')
  const pipelineEnd = pageSource.indexOf('function handleKeyboard', pipelineStart)
  const pipelineSource = pageSource.slice(pipelineStart, pipelineEnd)

  expect(mountedSource).toContain('await loadPage(slug)')
  expect(mountedSource).toContain('void loadCaptureDiagnostics()')

  expect(cloneSource).toContain('await handleClone()')
  expect(cloneSource).toContain('await loadCaptureDiagnostics()')
  expect(cloneSource.indexOf('await loadCaptureDiagnostics()')).toBeGreaterThan(cloneSource.indexOf('await handleClone()'))

  expect(structureSource).toContain('await handleStructure(modelOverride)')
  expect(structureSource).not.toContain('loadCaptureDiagnostics')

  expect(pipelineSource).toContain('await handleAdaptivePipeline(modelOverride)')
  expect(pipelineSource).toContain('await loadCaptureDiagnostics()')
  expect(pipelineSource.indexOf('await loadCaptureDiagnostics()')).toBeGreaterThan(pipelineSource.indexOf('await handleAdaptivePipeline(modelOverride)'))
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts -t "refreshes capture diagnostics"
```

Expected: FAIL because `runClone()` and `runAdaptivePipeline()` do not yet call
`await loadCaptureDiagnostics()`.

## Task 2: Refresh Diagnostics After Capture Actions

**Files:**
- Modify: `dashboard/src/pages/dashboard/page-builder/[slug].vue`

- [ ] **Step 1: Update `runClone()`**

Change:

```ts
await handleClone()
```

to:

```ts
await handleClone()
await loadCaptureDiagnostics()
```

- [ ] **Step 2: Update `runAdaptivePipeline()`**

Change:

```ts
await handleAdaptivePipeline(modelOverride)
```

to:

```ts
await handleAdaptivePipeline(modelOverride)
await loadCaptureDiagnostics()
```

- [ ] **Step 3: Run focused test and verify GREEN**

Run:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts -t "refreshes capture diagnostics"
```

Expected: PASS.

## Task 3: Full Verification and Commit

**Files:**
- Verify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`
- Verify: `dashboard/src/pages/dashboard/page-builder/[slug].vue`

- [ ] **Step 1: Run focused page-builder tests**

Run:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 2: Run full dashboard tests**

Run:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production
```

Expected: dashboard suite exits 0.

- [ ] **Step 3: Run dashboard typecheck**

Run:

```bash
pnpm --dir dashboard exec vue-tsc -b
```

Expected: exits 0.

- [ ] **Step 4: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: exits 0.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts dashboard/src/pages/dashboard/page-builder/[slug].vue
git commit -m "fix(page-builder): refresh capture diagnostics after capture"
```

## Task 4: Push and Deploy

**Files:**
- No source edits.

- [ ] **Step 1: Push main**

Run:

```bash
git push
```

Expected: `main -> main`.

- [ ] **Step 2: Build dashboard**

Run:

```bash
CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build
```

Expected: dashboard build exits 0 and writes `dashboard/dist`.

- [ ] **Step 3: Deploy dashboard**

Run:

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

Expected: Cloudflare Pages deployment succeeds and prints a production URL.

- [ ] **Step 4: Final repository check**

Run:

```bash
git status --short --branch
```

Expected: `## main...origin/main` with no modified files.
