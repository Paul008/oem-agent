# Client Capture Pseudo Helper Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract dashboard iframe pseudo-element capture rules into a self-contained, directly tested helper factory.

**Architecture:** Mirror the existing `tailwindRules()` pattern. `capturePseudoElementRules()` is unit-tested directly and injected into `buildCaptureInjection()` with `.toString()`.

**Tech Stack:** Vue dashboard composables, TypeScript, Vitest.

---

## Task 1: Direct Helper Tests

**Files:**
- Add: `dashboard/src/composables/capture-pseudo-elements.test.ts`
- Add: `dashboard/src/composables/capture-pseudo-elements.ts`

- [x] **Step 1: Write failing helper tests**

Cover:

- quoted text content
- CSS newline escape
- CSS hex escape, including a code point above `0xffff`
- escaped quote content
- rejected `none`, `normal`, quote keywords, `url(...)`, `counter(...)`, `counters(...)`, `attr(...)`, and empty quoted content
- inline style serialization with conservative properties
- stripping unsafe style characters

- [x] **Step 2: Run focused helper test and confirm failure**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-pseudo-elements.test.ts
```

Expected: FAIL because the helper module does not exist.

- [x] **Step 3: Implement `capturePseudoElementRules()`**

Keep the exported factory self-contained. Return methods with explicit string keys:

```ts
return {
  normalizePseudoElementContentForCapture: normalizePseudoElementContentForCapture,
  pseudoElementInlineStyleForCapture: pseudoElementInlineStyleForCapture,
  materializePseudoElementsForCapture: materializePseudoElementsForCapture,
}
```

- [x] **Step 4: Run focused helper test**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-pseudo-elements.test.ts
```

Expected: PASS.

## Task 2: Injection Wiring

**Files:**
- Modify: `dashboard/src/composables/use-capture-injection.ts`
- Modify: `dashboard/src/composables/use-capture-injection.test.ts`

- [x] **Step 1: Update source-regression test**

Assert:

- `var P=(`
- `P.materializePseudoElementsForCapture(el, clone, true)`
- `P.materializePseudoElementsForCapture(el, clone, false)`
- `function capturePseudoElementRules`
- no leftover inline `function normalizePseudoElementContentForCapture` outside the injected factory count

- [x] **Step 2: Run focused injection test and confirm failure**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-capture-injection.test.ts
```

Expected: FAIL until `use-capture-injection.ts` imports and injects the helper factory.

- [x] **Step 3: Wire helper factory injection**

Import `capturePseudoElementRules`, inject it once near `tailwindRules`, remove the inline pseudo helper block, and call `P.materializePseudoElementsForCapture(...)`.

- [x] **Step 4: Run focused injection test**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/use-capture-injection.test.ts
```

Expected: PASS.

## Task 3: Verification, Commit, Push, Deploy

**Files:**
- Verify dashboard and repo.

- [x] **Step 1: Run verification**

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/composables/capture-pseudo-elements.test.ts dashboard/src/composables/use-capture-injection.test.ts
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production
pnpm --dir dashboard exec vue-tsc -b
git diff --check
CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build
```

- [ ] **Step 2: Commit and push**

```bash
git add docs/superpowers/specs/2026-06-05-client-capture-pseudo-helper-extraction-design.md docs/superpowers/plans/2026-06-05-client-capture-pseudo-helper-extraction.md dashboard/src/composables/capture-pseudo-elements.ts dashboard/src/composables/capture-pseudo-elements.test.ts dashboard/src/composables/use-capture-injection.ts dashboard/src/composables/use-capture-injection.test.ts
git commit -m "refactor(capture): test client pseudo helpers directly"
git push
```

- [ ] **Step 3: Deploy dashboard**

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
curl -I https://oem-dashboard.pages.dev
```

No worker deploy is required.
