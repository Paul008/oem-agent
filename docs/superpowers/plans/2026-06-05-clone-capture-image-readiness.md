# Clone Capture Image Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wait briefly for unresolved browser images to decode before clone capture serializes the DOM.

**Architecture:** Add a small browser-safe image readiness helper beside the existing font readiness helper in `src/design/page-capturer.ts`. Wire it after the existing post-scroll wait and before font readiness so current lazy-loading behavior stays intact while adding a bounded settle pass.

**Tech Stack:** TypeScript, Puppeteer page evaluation, Vitest, Cloudflare Worker deploy via `pnpm run deploy`.

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import:

```ts
import {
  buildDomCaptureFromHtml,
  CAPTURE_FONT_READY_TIMEOUT_MS,
  CAPTURE_IMAGE_READY_TIMEOUT_MS,
  isCaptureBlockedBySecurityPage,
  normalizeCapturedLazyMedia,
  normalizePseudoElementContentForCapture,
  pseudoElementInlineStyleForCapture,
  waitForCaptureFontsForCapture,
  waitForCaptureImagesForCapture,
} from './page-capturer'
```

Add this test block above `describe('waitForCaptureFontsForCapture', ...)`:

```ts
describe('waitForCaptureImagesForCapture', () => {
  it('returns ready when pending image decodes settle before the timeout', async () => {
    await expect(waitForCaptureImagesForCapture(50, {
      images: [
        { complete: false, decode: () => Promise.resolve() },
        { complete: true, decode: () => Promise.resolve() },
      ],
    } as any)).resolves.toBe('ready')
  })

  it('returns timeout when pending image decodes do not settle in time', async () => {
    await expect(waitForCaptureImagesForCapture(1, {
      images: [{ complete: false, decode: () => new Promise(() => {}) }],
    } as any)).resolves.toBe('timeout')
  })

  it('returns no-images when the image collection is empty', async () => {
    await expect(waitForCaptureImagesForCapture(1, {
      images: [],
    } as any)).resolves.toBe('no-images')
  })

  it('returns unsupported when document images are not available', async () => {
    await expect(waitForCaptureImagesForCapture(1, {} as any)).resolves.toBe('unsupported')
  })
})
```

Update the wiring test:

```ts
describe('PageCapturer readiness wiring', () => {
  it('waits for images, then fonts, before materializing pseudo-element text', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const imageWait = source.indexOf('page.evaluate(waitForCaptureImagesForCapture as any, CAPTURE_IMAGE_READY_TIMEOUT_MS)')
    const fontWait = source.indexOf('page.evaluate(waitForCaptureFontsForCapture as any, CAPTURE_FONT_READY_TIMEOUT_MS)')
    const pseudoMaterialize = source.indexOf('page.evaluate(materializePseudoElementTextForCapture as any)')

    expect(CAPTURE_IMAGE_READY_TIMEOUT_MS).toBe(3000)
    expect(CAPTURE_FONT_READY_TIMEOUT_MS).toBe(2500)
    expect(imageWait).toBeGreaterThan(-1)
    expect(fontWait).toBeGreaterThan(imageWait)
    expect(pseudoMaterialize).toBeGreaterThan(fontWait)
  })
})
```

- [ ] **Step 2: Run focused test to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because `CAPTURE_IMAGE_READY_TIMEOUT_MS` and `waitForCaptureImagesForCapture` are not exported or the wiring string is missing.

### Task 2: Implement Image Readiness Helper

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Add constants, type, and helper**

Add below `CAPTURE_FONT_READY_TIMEOUT_MS`:

```ts
export const CAPTURE_IMAGE_READY_TIMEOUT_MS = 3_000;

export type CaptureImageReadyStatus = 'ready' | 'timeout' | 'unsupported' | 'no-images';
```

Add below `CaptureFontReadyStatus` or immediately before the font helper:

```ts
export async function waitForCaptureImagesForCapture(
  timeoutMs = 3000,
  doc?: { images?: ArrayLike<{ complete?: boolean; decode?: () => Promise<unknown> }> },
): Promise<CaptureImageReadyStatus> {
  const activeDocument = doc ?? (typeof document !== 'undefined' ? document : undefined);
  const images = activeDocument?.images;
  if (!images)
    return 'unsupported';

  const imageList = Array.from(images);
  if (imageList.length === 0)
    return 'no-images';

  const pendingDecodes = imageList
    .filter(img => img.complete !== true && typeof img.decode === 'function')
    .map(img => img.decode!().catch(() => undefined));

  if (pendingDecodes.length === 0)
    return 'ready';

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<CaptureImageReadyStatus>([
      Promise.allSettled(pendingDecodes).then(() => 'ready' as CaptureImageReadyStatus),
      new Promise<CaptureImageReadyStatus>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), Math.max(0, timeoutMs));
      }),
    ]);
  } finally {
    if (timeoutId)
      clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 2: Wire helper into clone capture**

Insert after the existing fixed image wait:

```ts
      const imageReadyStatus = await page.evaluate(waitForCaptureImagesForCapture as any, CAPTURE_IMAGE_READY_TIMEOUT_MS);
      console.log(`[PageCapturer] Image readiness: ${imageReadyStatus}`);

      const fontReadyStatus = await page.evaluate(waitForCaptureFontsForCapture as any, CAPTURE_FONT_READY_TIMEOUT_MS);
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
- Verify: `docs/superpowers/specs/2026-06-05-clone-capture-image-readiness-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-clone-capture-image-readiness.md`

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
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-clone-capture-image-readiness.md
git commit -m "feat(capture): wait for images before clone serialization"
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
