# Persisted Media Frame Safety CSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist static document and media frame safeguards so stored clone HTML is constrained outside the Clone Studio wrapper.

**Architecture:** Add a separate media frame safety CSS constant in `src/design/page-capturer.ts` and include it in the Worker clone HTML override assembly after carousel safety CSS. Tests verify selectors/rules and persistence ordering.

**Tech Stack:** TypeScript, Vitest, Cloudflare Worker deploy via `pnpm run deploy`.

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Import the media frame CSS constant**

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
  CAPTURE_STATIC_MEDIA_FRAME_CSS,
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

Add this block after `describe('CAPTURE_STATIC_CAROUSEL_SAFETY_CSS', ...)`:

```ts
describe('CAPTURE_STATIC_MEDIA_FRAME_CSS', () => {
  it('clips document-level horizontal overflow', () => {
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('html,')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('body')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toMatch(/max-width:\s*100%/i)
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toMatch(/overflow-x:\s*clip\s*!important/i)
  })

  it('caps common media elements to the clone frame', () => {
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('picture')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('video')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('canvas')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('svg')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toMatch(/max-width:\s*100%\s*!important/i)
  })

  it('keeps image and video height proportional', () => {
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toMatch(/img,[\s\S]*video[\s\S]*height:\s*auto\s*!important/i)
  })
})
```

- [ ] **Step 3: Add persistence wiring test**

Add this source-level test near the persisted carousel safety CSS wiring test:

```ts
describe('PageCapturer persisted media frame CSS wiring', () => {
  it('includes media frame CSS after carousel safety CSS in persisted override CSS', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const overrideCssStart = source.indexOf('const overrideCss = [')
    const carouselSafetyUsage = source.indexOf('CAPTURE_STATIC_CAROUSEL_SAFETY_CSS', overrideCssStart)
    const mediaFrameUsage = source.indexOf('CAPTURE_STATIC_MEDIA_FRAME_CSS', overrideCssStart)
    const assembledStyle = source.indexOf('`<style>${overrideCss}</style>`', overrideCssStart)

    expect(overrideCssStart).toBeGreaterThan(-1)
    expect(carouselSafetyUsage).toBeGreaterThan(overrideCssStart)
    expect(mediaFrameUsage).toBeGreaterThan(carouselSafetyUsage)
    expect(assembledStyle).toBeGreaterThan(mediaFrameUsage)
  })
})
```

- [ ] **Step 4: Run focused test to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because `CAPTURE_STATIC_MEDIA_FRAME_CSS` is not exported and the override CSS assembly does not reference it.

### Task 2: Implement Persisted Media Frame Safety CSS

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Add the media frame CSS constant**

Add after `CAPTURE_STATIC_CAROUSEL_SAFETY_CSS`:

```ts
export const CAPTURE_STATIC_MEDIA_FRAME_CSS = `
html,
body {
  max-width: 100%;
  overflow-x: clip !important;
}

@media (min-width: 1024px) {
  img,
  picture,
  video,
  canvas,
  svg {
    max-width: 100% !important;
  }

  img,
  video {
    height: auto !important;
  }
}
`.trim();
```

- [ ] **Step 2: Add the constant to persisted override CSS**

In the `overrideCss` array inside `capturePage()`, insert after `CAPTURE_STATIC_CAROUSEL_SAFETY_CSS`:

```ts
        CAPTURE_STATIC_MEDIA_FRAME_CSS,
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
- Verify: `docs/superpowers/specs/2026-06-05-persisted-media-frame-safety-css-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-persisted-media-frame-safety-css.md`

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
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-persisted-media-frame-safety-css.md
git commit -m "fix(capture): persist static media frame safety css"
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
