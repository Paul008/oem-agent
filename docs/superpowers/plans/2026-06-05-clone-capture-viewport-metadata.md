# Clone Capture Viewport Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the actual DOM capture viewport in clone-mode metadata.

**Architecture:** Add viewport data to `DomCaptureResult` in `src/design/page-capturer.ts`. Live DOM capture records the randomized viewport it already uses, external capture keeps a deterministic default unless a viewport is supplied, and clone-mode persistence writes `capture.viewport`.

**Tech Stack:** TypeScript, Vitest, Cloudflare Worker deploy via `pnpm run deploy`.

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Write external capture viewport tests**

Add this block near the existing `buildDomCaptureFromHtml` tests:

```ts
describe('buildDomCaptureFromHtml viewport metadata', () => {
  const html = `
    <html>
      <head><title>Viewport Model</title></head>
      <body>
        <main>
          <h1>Viewport Model</h1>
          <section>${'<p>Vehicle content</p>'.repeat(80)}</section>
        </main>
      </body>
    </html>
  `

  it('defaults external captures to the standard desktop viewport', () => {
    const result = buildDomCaptureFromHtml({ html }, 'https://example.test/model')

    expect('bot_blocked' in result).toBe(false)
    if ('bot_blocked' in result)
      return

    expect(result.viewport).toEqual({ width: 1440, height: 1080 })
  })

  it('preserves supplied external capture viewport metadata', () => {
    const result = buildDomCaptureFromHtml({
      html,
      viewport: { width: 1680, height: 1080 },
    }, 'https://example.test/model')

    expect('bot_blocked' in result).toBe(false)
    if ('bot_blocked' in result)
      return

    expect(result.viewport).toEqual({ width: 1680, height: 1080 })
  })
})
```

- [ ] **Step 2: Write clone-mode save-path wiring test**

Add this source-level test near the readiness wiring test:

```ts
describe('PageCapturer viewport metadata wiring', () => {
  it('persists the capture viewport into clone mode instead of a hard-coded viewport', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const applyCloneModeCall = source.indexOf('const pageData = applyCloneMode(basePage, {')
    const captureViewport = source.indexOf('viewport: capture.viewport', applyCloneModeCall)
    const hardCodedViewport = source.indexOf('viewport: { width: 1440, height: 1080 }', applyCloneModeCall)

    expect(applyCloneModeCall).toBeGreaterThan(-1)
    expect(captureViewport).toBeGreaterThan(applyCloneModeCall)
    expect(hardCodedViewport).toBe(-1)
  })
})
```

- [ ] **Step 3: Run focused test to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because external captures do not expose `viewport`, and the clone-mode save path still uses hard-coded `{ width: 1440, height: 1080 }`.

### Task 2: Implement Viewport Metadata

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Add viewport to capture types**

Update `ExternalHtmlCaptureInput`:

```ts
export interface ExternalHtmlCaptureInput {
  html: string;
  title?: string;
  finalUrl?: string;
  stylesheetUrls?: string[];
  viewport?: {
    width: number;
    height: number;
  };
}
```

Update `DomCaptureResult`:

```ts
export interface DomCaptureResult {
  html: string;
  stylesheetLinks: string[];
  imageUrls: string[];
  heroUrl: string;
  title: string;
  elementCount: number;
  viewport: {
    width: number;
    height: number;
  };
}
```

- [ ] **Step 2: Return viewport from external capture builder**

In `buildDomCaptureFromHtml()`, add `viewport` to the object passed into `normalizeCapturedLazyMedia()`:

```ts
    viewport: input.viewport ?? { width: 1440, height: 1080 },
```

- [ ] **Step 3: Return viewport from live DOM capture**

In the object returned from the browser `page.evaluate()` result, add:

```ts
          viewport: { width: viewportWidth, height: 1080 },
```

This must be added after the `page.evaluate()` result is returned in Node scope, because `viewportWidth` is not available inside the browser callback. Use:

```ts
      const resultWithViewport: DomCaptureResult = {
        ...result,
        viewport: { width: viewportWidth, height: 1080 },
      };

      const normalized = normalizeCapturedLazyMedia(resultWithViewport, sourceUrl);
```

- [ ] **Step 4: Persist capture viewport in clone mode**

Replace the hard-coded clone viewport in the `applyCloneMode()` input:

```ts
        viewport: capture.viewport,
```

- [ ] **Step 5: Run focused test to verify GREEN**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: PASS for all `page-capturer.test.ts` tests.

### Task 3: Full Verification, Commit, Push, Deploy

**Files:**
- Verify: `src/design/page-capturer.ts`
- Verify: `src/design/page-capturer.test.ts`
- Verify: `docs/superpowers/specs/2026-06-05-clone-capture-viewport-metadata-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-clone-capture-viewport-metadata.md`

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
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-clone-capture-viewport-metadata.md
git commit -m "fix(capture): persist actual clone viewport metadata"
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
