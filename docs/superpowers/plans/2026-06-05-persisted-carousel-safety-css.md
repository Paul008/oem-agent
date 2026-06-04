# Persisted Carousel Safety CSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist static carousel overflow safeguards so stored clone HTML is constrained outside the Clone Studio wrapper.

**Architecture:** Add a separate carousel safety CSS constant in `src/design/page-capturer.ts` and include it in the Worker clone HTML override assembly after the existing static clone safety CSS. Tests verify selectors/rules and persistence ordering.

**Tech Stack:** TypeScript, Vitest, Cloudflare Worker deploy via `pnpm run deploy`.

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Import the carousel CSS constant**

Update the import:

```ts
import {
  buildDomCaptureFromHtml,
  CAPTURE_DOM_QUIET_TIMEOUT_MS,
  CAPTURE_DOM_QUIET_WINDOW_MS,
  CAPTURE_FONT_READY_TIMEOUT_MS,
  CAPTURE_IMAGE_READY_TIMEOUT_MS,
  CAPTURE_STATIC_CAROUSEL_SAFETY_CSS,
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

Add this block after `describe('CAPTURE_STATIC_CLONE_SAFETY_CSS', ...)`:

```ts
describe('CAPTURE_STATIC_CAROUSEL_SAFETY_CSS', () => {
  it('constrains common carousel wrappers and containers', () => {
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.slick-list')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.swiper-container')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.splide__track')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('[class*="carousel"]')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/max-width:\s*100%\s*!important/i)
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/overflow:\s*hidden\s*!important/i)
  })

  it('normalizes carousel tracks that would otherwise retain scripted offsets', () => {
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.slick-track')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.swiper-wrapper')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.splide__list')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/width:\s*100%\s*!important/i)
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/transform:\s*none\s*!important/i)
  })

  it('keeps carousel slide items inside the static clone frame', () => {
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.slick-slide')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.swiper-slide')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.splide__slide')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.carousel-item')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/flex-shrink:\s*0\s*!important/i)
  })
})
```

- [ ] **Step 3: Add persistence wiring test**

Add this source-level test near the persisted clone safety CSS wiring test:

```ts
describe('PageCapturer persisted carousel safety CSS wiring', () => {
  it('includes carousel safety CSS after general clone safety CSS in persisted override CSS', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const overrideCssStart = source.indexOf('const overrideCss = [')
    const cloneSafetyUsage = source.indexOf('CAPTURE_STATIC_CLONE_SAFETY_CSS', overrideCssStart)
    const carouselSafetyUsage = source.indexOf('CAPTURE_STATIC_CAROUSEL_SAFETY_CSS', overrideCssStart)
    const assembledStyle = source.indexOf('`<style>${overrideCss}</style>`', overrideCssStart)

    expect(overrideCssStart).toBeGreaterThan(-1)
    expect(cloneSafetyUsage).toBeGreaterThan(overrideCssStart)
    expect(carouselSafetyUsage).toBeGreaterThan(cloneSafetyUsage)
    expect(assembledStyle).toBeGreaterThan(carouselSafetyUsage)
  })
})
```

- [ ] **Step 4: Run focused test to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because `CAPTURE_STATIC_CAROUSEL_SAFETY_CSS` is not exported and the override CSS assembly does not reference it.

### Task 2: Implement Persisted Carousel Safety CSS

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Add the carousel CSS constant**

Add after `CAPTURE_STATIC_CLONE_SAFETY_CSS`:

```ts
export const CAPTURE_STATIC_CAROUSEL_SAFETY_CSS = `
.slick-list,
.swiper,
.swiper-container,
.swiper-wrapper,
.splide,
.splide__track,
.splide__list,
.carousel,
.carousel-inner,
[class*="swiper"],
[class*="carousel"],
[class*="slider"] {
  max-width: 100% !important;
  overflow: hidden !important;
}

.slick-track,
.swiper-wrapper,
.splide__list,
.carousel-inner {
  width: 100% !important;
  max-width: 100% !important;
  transform: none !important;
}

.slick-slide,
.swiper-slide,
.splide__slide,
.carousel-item {
  width: 100% !important;
  max-width: 100% !important;
  flex-shrink: 0 !important;
}
`.trim();
```

- [ ] **Step 2: Add the constant to persisted override CSS**

In the `overrideCss` array inside `capturePage()`, insert after `CAPTURE_STATIC_CLONE_SAFETY_CSS`:

```ts
        CAPTURE_STATIC_CAROUSEL_SAFETY_CSS,
```

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
- Verify: `docs/superpowers/specs/2026-06-05-persisted-carousel-safety-css-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-persisted-carousel-safety-css.md`

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
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-persisted-carousel-safety-css.md
git commit -m "fix(capture): persist static carousel safety css"
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
