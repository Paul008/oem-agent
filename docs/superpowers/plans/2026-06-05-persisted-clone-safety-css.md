# Persisted Clone Safety CSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist static clone safety CSS so stored clone HTML remains readable outside the Clone Studio wrapper.

**Architecture:** Add a named CSS constant in `src/design/page-capturer.ts` and include it in the Worker clone HTML override assembly. Tests verify the selectors/rules and that the persistence path includes the named constant.

**Tech Stack:** TypeScript, Vitest, Cloudflare Worker deploy via `pnpm run deploy`.

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Import the safety CSS constant**

Update the import:

```ts
import {
  buildDomCaptureFromHtml,
  CAPTURE_DOM_QUIET_TIMEOUT_MS,
  CAPTURE_DOM_QUIET_WINDOW_MS,
  CAPTURE_FONT_READY_TIMEOUT_MS,
  CAPTURE_IMAGE_READY_TIMEOUT_MS,
  CAPTURE_STATIC_CLONE_SAFETY_CSS,
  isCaptureBlockedBySecurityPage,
  normalizeCapturedLazyMedia,
  normalizePseudoElementContentForCapture,
  pseudoElementInlineStyleForCapture,
  waitForCaptureDomQuietForCapture,
  waitForCaptureFontsForCapture,
  waitForCaptureImagesForCapture,
} from './page-capturer'
```

- [ ] **Step 2: Add CSS behavior tests**

Add this block near the existing `PageCapturer readiness wiring` test:

```ts
describe('CAPTURE_STATIC_CLONE_SAFETY_CSS', () => {
  it('forces OEM desktop-only image variants visible', () => {
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('img.imgdesktop')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('.dsktoponly > img')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/display:\s*block\s*!important/i)
  })

  it('keeps OEM mobile-only image variants hidden in desktop clones', () => {
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('img.imgmobile')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('.mobonly > img')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/display:\s*none\s*!important/i)
  })

  it('reveals common scroll-animation classes left hidden by stripped scripts', () => {
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('.animated')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('.animate__animated')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('[data-aos]')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('[class*="fadeIn"]')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/opacity:\s*1\s*!important/i)
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/visibility:\s*visible\s*!important/i)
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/transform:\s*none\s*!important/i)
  })
})
```

- [ ] **Step 3: Add persistence wiring test**

Add this source-level test near the viewport metadata wiring test:

```ts
describe('PageCapturer persisted clone safety CSS wiring', () => {
  it('includes the static clone safety CSS in persisted override CSS', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const overrideCssStart = source.indexOf('const overrideCss = [')
    const safetyCssUsage = source.indexOf('CAPTURE_STATIC_CLONE_SAFETY_CSS', overrideCssStart)
    const assembledStyle = source.indexOf('`<style>${overrideCss}</style>`', overrideCssStart)

    expect(overrideCssStart).toBeGreaterThan(-1)
    expect(safetyCssUsage).toBeGreaterThan(overrideCssStart)
    expect(assembledStyle).toBeGreaterThan(safetyCssUsage)
  })
})
```

- [ ] **Step 4: Run focused test to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because `CAPTURE_STATIC_CLONE_SAFETY_CSS` is not exported and the override CSS assembly does not reference it.

### Task 2: Implement Persisted Safety CSS

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Add the CSS constant**

Add near the capture readiness constants:

```ts
export const CAPTURE_STATIC_CLONE_SAFETY_CSS = `
img.imgdesktop,
img.dsktoponly,
.imgdesktop > img,
.dsktoponly > img {
  display: block !important;
}

img.imgmobile,
img.mobonly,
.imgmobile > img,
.mobonly > img {
  display: none !important;
}

.animated,
.animate__animated,
.wow,
.aos-init,
[data-aos],
[class*="fadeIn"] {
  opacity: 1 !important;
  visibility: visible !important;
  transform: none !important;
}
`.trim();
```

- [ ] **Step 2: Add the constant to persisted override CSS**

In the `overrideCss` array inside `capturePage()`, insert:

```ts
        CAPTURE_STATIC_CLONE_SAFETY_CSS,
```

Keep the existing tab visibility and basic reset rules in the same array.

- [ ] **Step 3: Run focused test to verify GREEN**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: PASS for all `page-capturer.test.ts` tests.

### Task 3: Full Verification, Commit, Push, Deploy

**Files:**
- Verify: `src/design/page-capturer.ts`
- Verify: `src/design/page-capturer.test.ts`
- Verify: `docs/superpowers/specs/2026-06-05-persisted-clone-safety-css-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-persisted-clone-safety-css.md`

- [ ] **Step 1: Run full tests**

Run:

```bash
npx vitest run
```

Expected: all test files pass.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Check patch hygiene**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-persisted-clone-safety-css.md
git commit -m "fix(capture): persist static clone safety css"
```

Expected: commit created on `main`.

- [ ] **Step 5: Push**

Run:

```bash
git push
```

Expected: `main` pushes to `origin/main`.

- [ ] **Step 6: Deploy Worker**

Run:

```bash
pnpm run deploy
```

Expected: Cloudflare Worker deployment completes and prints a version ID.

- [ ] **Step 7: Verify live Worker**

Run:

```bash
curl -I https://oem-agent.adme-dev.workers.dev
```

Expected: HTTP 200.
