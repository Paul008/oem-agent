# Client Capture Pseudo-Element Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve simple CSS pseudo-element text in the dashboard iframe Smart Capture path.

**Architecture:** Keep backend capture unchanged. Add self-contained pseudo-element materialization helpers to the injected script returned by `buildCaptureInjection()`, and lock the injection shape with source-regression tests.

**Tech Stack:** Vue dashboard composables, TypeScript, Vitest source-regression tests, Cloudflare Pages dashboard.

---

## Task 1: Regression Tests

**Files:**
- Modify: `dashboard/src/composables/use-capture-injection.test.ts`

- [x] **Step 1: Add failing source-regression tests**

Assert the injected script contains:

- `normalizePseudoElementContentForCapture`
- `pseudoElementInlineStyleForCapture`
- `materializePseudoElementForCapture`
- `window.getComputedStyle(src, '::' + pseudo)`
- `span.setAttribute('data-oem-pseudo', pseudo)`
- `span.setAttribute('data-oem-pseudo-capture', 'true')`
- `span.textContent = text`
- `materializePseudoElementsForCapture(el, clone, true)` after Tailwind conversion
- `materializePseudoElementsForCapture(el, clone, false)` in `cleanHtml()`

- [x] **Step 2: Run focused test and confirm failure**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-capture-injection.test.ts
```

Expected: FAIL because the injected script does not materialize pseudo-elements yet.

## Task 2: Injected Script Materializer

**Files:**
- Modify: `dashboard/src/composables/use-capture-injection.ts`

- [x] **Step 1: Add self-contained helpers**

Add ES5-style helper functions inside the injected script before `tailwindHtml()`:

- `normalizePseudoElementContentForCapture(content)`
- `pseudoElementInlineStyleForCapture(style)`
- `isVisiblePseudoElementForCapture(style)`
- `materializePseudoElementForCapture(src, cln, pseudo, includeStyle)`
- `materializePseudoElementsForCapture(src, cln, includeStyle)`

- [x] **Step 2: Wire Tailwind clone output**

Call `materializePseudoElementsForCapture(el, clone, true)` once after `convert(el, clone)` so inserted pseudo spans do not offset source/clone child alignment.

- [x] **Step 3: Wire clean parser output**

Call `materializePseudoElementsForCapture(el, clone, false)` inside `cleanHtml()` after styles are stripped and before returning `clone.outerHTML`.

- [x] **Step 4: Run focused test**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-capture-injection.test.ts
```

Expected: PASS.

## Task 3: Verify, Commit, Push, Deploy

**Files:**
- Verify dashboard and repo.

- [x] **Step 1: Run verification**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-capture-injection.test.ts
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production
pnpm --dir dashboard exec vue-tsc -b
git diff --check
CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build
```

- [ ] **Step 2: Commit and push**

```bash
git add docs/superpowers/specs/2026-06-05-client-capture-pseudo-elements-design.md docs/superpowers/plans/2026-06-05-client-capture-pseudo-elements.md dashboard/src/composables/use-capture-injection.ts dashboard/src/composables/use-capture-injection.test.ts
git commit -m "feat(capture): materialize pseudo text in client capture"
git push
```

- [ ] **Step 3: Deploy dashboard**

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
curl -I https://oem-dashboard.pages.dev
```

No worker deploy is required because this slice only changes dashboard-side capture injection and docs.
