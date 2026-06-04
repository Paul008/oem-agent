# Clone Capture Adaptive Scroll Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed clone-capture scroll sweep with a bounded adaptive sweep that re-measures page height as lazy content appears.

**Architecture:** Add a browser-safe exported helper in `src/design/page-capturer.ts` and pass its timing/limit constants as `page.evaluate()` options so the serialized function has no module-scope dependencies. The helper scrolls in viewport-sized steps, re-measures document height after each delay, always returns to top, and reports a status for logs.

**Tech Stack:** TypeScript, Puppeteer-in-Worker `page.evaluate`, Vitest, Cloudflare Worker deploy.

---

### Task 1: Add Failing Adaptive Scroll Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Extend the imports**

Update the import from `./page-capturer` near the top of `src/design/page-capturer.test.ts` to include:

```ts
  CAPTURE_SCROLL_SWEEP_FINAL_DELAY_MS,
  CAPTURE_SCROLL_SWEEP_MAX_STEPS,
  CAPTURE_SCROLL_SWEEP_STEP_DELAY_MS,
  CAPTURE_SCROLL_SWEEP_TIMEOUT_MS,
  sweepCaptureScrollForCapture,
```

- [ ] **Step 2: Add a fake scroll-window helper**

Add this helper above the first `describe(...)` block in `src/design/page-capturer.test.ts`:

```ts
function createScrollSweepWindow(options: {
  innerHeight?: number;
  scrollHeight: number;
  onScroll?: (y: number, win: any) => void;
}) {
  const calls: Array<[number, number]> = []
  const win: any = {
    innerHeight: options.innerHeight ?? 1000,
    scrollY: 0,
    document: {
      body: { scrollHeight: options.scrollHeight },
      documentElement: { scrollHeight: options.scrollHeight },
    },
    Date: { now: () => 0 },
    setTimeout: ((callback: () => void) => {
      callback()
      return 0 as any
    }) as typeof setTimeout,
    scrollTo: (x: number, y: number) => {
      calls.push([x, y])
      win.scrollY = y
      options.onScroll?.(y, win)
    },
  }

  return { win, calls }
}
```

- [ ] **Step 3: Add helper behavior tests**

Add this `describe` block after the import/helper setup and before `describe('waitForCaptureImagesForCapture', ...)`:

```ts
describe('sweepCaptureScrollForCapture', () => {
  it('returns complete and scrolls back to top for a stable page', async () => {
    const { win, calls } = createScrollSweepWindow({ scrollHeight: 2500 })

    await expect(sweepCaptureScrollForCapture({
      stepDelayMs: 0,
      finalDelayMs: 0,
      timeoutMs: 1000,
      maxSteps: 10,
      win,
    })).resolves.toBe('complete')

    expect(calls).toEqual([
      [0, 1000],
      [0, 1500],
      [0, 0],
    ])
  })

  it('continues beyond the initially measured height when content grows during scrolling', async () => {
    const { win, calls } = createScrollSweepWindow({
      scrollHeight: 1800,
      onScroll: (y, activeWindow) => {
        if (y >= 800) {
          activeWindow.document.body.scrollHeight = 3200
          activeWindow.document.documentElement.scrollHeight = 3200
        }
      },
    })

    await expect(sweepCaptureScrollForCapture({
      stepDelayMs: 0,
      finalDelayMs: 0,
      timeoutMs: 1000,
      maxSteps: 10,
      win,
    })).resolves.toBe('complete')

    expect(calls.some(([, y]) => y > 800)).toBe(true)
    expect(calls.at(-1)).toEqual([0, 0])
  })

  it('returns max-steps when content keeps growing beyond the configured step limit', async () => {
    const { win, calls } = createScrollSweepWindow({
      scrollHeight: 3000,
      onScroll: (_y, activeWindow) => {
        activeWindow.document.body.scrollHeight += 1000
        activeWindow.document.documentElement.scrollHeight += 1000
      },
    })

    await expect(sweepCaptureScrollForCapture({
      stepDelayMs: 0,
      finalDelayMs: 0,
      timeoutMs: 1000,
      maxSteps: 2,
      win,
    })).resolves.toBe('max-steps')

    expect(calls).toHaveLength(3)
    expect(calls.at(-1)).toEqual([0, 0])
  })

  it('returns timeout when the configured elapsed limit is already reached', async () => {
    const { win, calls } = createScrollSweepWindow({ scrollHeight: 3000 })

    await expect(sweepCaptureScrollForCapture({
      stepDelayMs: 0,
      finalDelayMs: 0,
      timeoutMs: 0,
      maxSteps: 10,
      win,
    })).resolves.toBe('timeout')

    expect(calls).toEqual([[0, 0]])
  })

  it('returns unsupported when the viewport cannot scroll', async () => {
    await expect(sweepCaptureScrollForCapture({
      win: {
        innerHeight: 0,
        document: { body: { scrollHeight: 1000 }, documentElement: { scrollHeight: 1000 } },
        scrollTo: () => {},
      },
    })).resolves.toBe('unsupported')
  })
})
```

- [ ] **Step 4: Update the readiness wiring source test**

In `describe('PageCapturer readiness wiring', ...)`, add a source-order assertion for the scroll sweep before image readiness:

```ts
    const scrollSweep = source.indexOf('page.evaluate(sweepCaptureScrollForCapture as any')
    const imageWait = source.indexOf('page.evaluate(waitForCaptureImagesForCapture as any, CAPTURE_IMAGE_READY_TIMEOUT_MS)')
```

Then add these expectations:

```ts
    expect(CAPTURE_SCROLL_SWEEP_STEP_DELAY_MS).toBe(300)
    expect(CAPTURE_SCROLL_SWEEP_FINAL_DELAY_MS).toBe(500)
    expect(CAPTURE_SCROLL_SWEEP_TIMEOUT_MS).toBe(10000)
    expect(CAPTURE_SCROLL_SWEEP_MAX_STEPS).toBe(30)
    expect(scrollSweep).toBeGreaterThan(-1)
    expect(imageWait).toBeGreaterThan(scrollSweep)
```

Keep the existing assertions that image readiness precedes font readiness, DOM quiet, and pseudo-element materialization.

- [ ] **Step 5: Run focused tests to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because `sweepCaptureScrollForCapture` and the scroll sweep constants are not exported yet.

### Task 2: Implement the Adaptive Scroll Sweep

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Add constants and types**

Near the existing readiness constants in `src/design/page-capturer.ts`, add:

```ts
export const CAPTURE_SCROLL_SWEEP_STEP_DELAY_MS = 300;
export const CAPTURE_SCROLL_SWEEP_FINAL_DELAY_MS = 500;
export const CAPTURE_SCROLL_SWEEP_TIMEOUT_MS = 10_000;
export const CAPTURE_SCROLL_SWEEP_MAX_STEPS = 30;
```

Near the existing `CaptureFontReadyStatus`, `CaptureImageReadyStatus`, and `CaptureDomQuietStatus` types, add:

```ts
export type CaptureScrollSweepStatus = 'complete' | 'max-steps' | 'timeout' | 'unsupported';

type CaptureScrollSweepWindow = {
  innerHeight?: number;
  scrollY?: number;
  scrollTo?: (x: number, y: number) => void;
  setTimeout?: (callback: () => void, timeout?: number) => ReturnType<typeof setTimeout>;
  Date?: Pick<typeof Date, 'now'>;
  document?: {
    body?: { scrollHeight?: number };
    documentElement?: { scrollHeight?: number };
  };
};
```

- [ ] **Step 2: Add the browser-safe helper**

Add this helper before `waitForCaptureImagesForCapture()`:

```ts
export async function sweepCaptureScrollForCapture(options?: {
  stepDelayMs?: number;
  finalDelayMs?: number;
  timeoutMs?: number;
  maxSteps?: number;
  win?: CaptureScrollSweepWindow;
}): Promise<CaptureScrollSweepStatus> {
  const activeWindow = options?.win ?? (typeof window !== 'undefined'
    ? window as unknown as CaptureScrollSweepWindow
    : undefined);
  const activeDocument = activeWindow?.document ?? (typeof document !== 'undefined'
    ? document
    : undefined);
  const viewportHeight = Number(activeWindow?.innerHeight ?? 0);
  const scrollTo = activeWindow?.scrollTo;

  if (!activeWindow || !activeDocument || typeof scrollTo !== 'function' || !Number.isFinite(viewportHeight) || viewportHeight <= 0)
    return 'unsupported';

  const stepDelayMs = Math.max(0, options?.stepDelayMs ?? 300);
  const finalDelayMs = Math.max(0, options?.finalDelayMs ?? 500);
  const timeoutMs = Math.max(0, options?.timeoutMs ?? 10000);
  const maxSteps = Math.max(1, options?.maxSteps ?? 30);
  const clock = activeWindow.Date ?? Date;
  const sleep = (delayMs: number) => new Promise<void>((resolve) => {
    const timer = activeWindow.setTimeout ?? setTimeout;
    timer(resolve, delayMs);
  });
  const scrollHeight = () => Math.max(
    0,
    Number(activeDocument.documentElement?.scrollHeight ?? 0),
    Number(activeDocument.body?.scrollHeight ?? 0),
  );
  const startedAt = clock.now();

  try {
    let y = Math.max(0, Number(activeWindow.scrollY ?? 0));
    let steps = 0;

    while (true) {
      if (clock.now() - startedAt >= timeoutMs)
        return 'timeout';

      const maxY = Math.max(0, scrollHeight() - viewportHeight);
      if (y >= maxY)
        return 'complete';

      if (steps >= maxSteps)
        return 'max-steps';

      y = Math.min(y + viewportHeight, maxY);
      scrollTo.call(activeWindow, 0, y);
      steps++;
      await sleep(stepDelayMs);
    }
  } finally {
    scrollTo.call(activeWindow, 0, 0);
    await sleep(finalDelayMs);
  }
}
```

Important: keep this helper self-contained. It is serialized into the browser by Puppeteer, so do not reference module constants or module-scope helper functions inside the function body. The caller passes constant values as options.

- [ ] **Step 3: Replace the fixed scroll block**

In `PageCapturer.captureDom()`, replace the current fixed scroll block:

```ts
      // Scroll to trigger lazy-loaded images (now that hidden panels are visible)
      await page.evaluate(async () => {
        const step = window.innerHeight;
        const maxScroll = document.body.scrollHeight;
        for (let y = 0; y < maxScroll; y += step) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 300));
        }
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 500));
      });
```

with:

```ts
      // Scroll to trigger lazy-loaded images (now that hidden panels are visible).
      // Re-measure height during the sweep because OEM pages may append content near the bottom.
      const scrollSweepStatus = await page.evaluate(sweepCaptureScrollForCapture as any, {
        stepDelayMs: CAPTURE_SCROLL_SWEEP_STEP_DELAY_MS,
        finalDelayMs: CAPTURE_SCROLL_SWEEP_FINAL_DELAY_MS,
        timeoutMs: CAPTURE_SCROLL_SWEEP_TIMEOUT_MS,
        maxSteps: CAPTURE_SCROLL_SWEEP_MAX_STEPS,
      });
      console.log(`[PageCapturer] Scroll sweep: ${scrollSweepStatus}`);
```

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: PASS.

### Task 3: Full Verification, Commit, Push, Deploy

**Files:**
- Verify: `src/design/page-capturer.ts`
- Verify: `src/design/page-capturer.test.ts`
- Verify: `docs/superpowers/specs/2026-06-05-clone-capture-adaptive-scroll-sweep-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-clone-capture-adaptive-scroll-sweep.md`

- [ ] **Step 1: Run full tests**

Run:

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: exit 0 with no output.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-clone-capture-adaptive-scroll-sweep.md
git commit -m "feat(capture): adapt scroll sweep to lazy content growth"
```

- [ ] **Step 5: Push and deploy**

Run:

```bash
git push
pnpm run deploy
```

Expected: push succeeds and Wrangler reports a new Worker version ID.

- [ ] **Step 6: Live-check and final status**

Run:

```bash
curl -I https://oem-agent.adme-dev.workers.dev
git status --short --branch
```

Expected: Worker returns `HTTP/2 200`; git status is clean and `main...origin/main`.
