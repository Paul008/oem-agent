# Clone Capture DOM Quiet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wait for a short mutation-free window before clone capture freezes the DOM.

**Architecture:** Add a browser-safe MutationObserver readiness helper beside the existing image and font readiness helpers in `src/design/page-capturer.ts`. Wire it after image and font readiness and before pseudo-element materialization so JavaScript-driven DOM mutations get one bounded settle pass before static serialization.

**Tech Stack:** TypeScript, browser `MutationObserver`, Puppeteer page evaluation, Vitest, Cloudflare Worker deploy via `pnpm run deploy`.

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `src/design/page-capturer.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import:

```ts
import {
  buildDomCaptureFromHtml,
  CAPTURE_DOM_QUIET_TIMEOUT_MS,
  CAPTURE_DOM_QUIET_WINDOW_MS,
  CAPTURE_FONT_READY_TIMEOUT_MS,
  CAPTURE_IMAGE_READY_TIMEOUT_MS,
  isCaptureBlockedBySecurityPage,
  normalizeCapturedLazyMedia,
  normalizePseudoElementContentForCapture,
  pseudoElementInlineStyleForCapture,
  waitForCaptureDomQuietForCapture,
  waitForCaptureFontsForCapture,
  waitForCaptureImagesForCapture,
} from './page-capturer'
```

Add this test block after `describe('waitForCaptureImagesForCapture', ...)`:

```ts
class TestMutationObserver {
  static instances: TestMutationObserver[] = []

  callback: () => void
  disconnected = false

  constructor(callback: () => void) {
    this.callback = callback
    TestMutationObserver.instances.push(this)
  }

  observe() {}

  disconnect() {
    this.disconnected = true
  }
}

describe('waitForCaptureDomQuietForCapture', () => {
  it('returns quiet when no mutations arrive during the quiet window', async () => {
    TestMutationObserver.instances = []

    await expect(waitForCaptureDomQuietForCapture(1, 50, {
      target: {},
      MutationObserverCtor: TestMutationObserver as any,
    })).resolves.toBe('quiet')

    expect(TestMutationObserver.instances[0]?.disconnected).toBe(true)
  })

  it('returns timeout when mutations keep arriving before the quiet window elapses', async () => {
    TestMutationObserver.instances = []
    const result = waitForCaptureDomQuietForCapture(20, 35, {
      target: {},
      MutationObserverCtor: TestMutationObserver as any,
    })

    const mutation = setInterval(() => {
      TestMutationObserver.instances[0]?.callback()
    }, 5)

    await expect(result).resolves.toBe('timeout')
    clearInterval(mutation)
    expect(TestMutationObserver.instances[0]?.disconnected).toBe(true)
  })

  it('returns unsupported when target or MutationObserver is unavailable', async () => {
    await expect(waitForCaptureDomQuietForCapture(1, 1, {
      target: undefined,
      MutationObserverCtor: TestMutationObserver as any,
    })).resolves.toBe('unsupported')

    await expect(waitForCaptureDomQuietForCapture(1, 1, {
      target: {},
      MutationObserverCtor: undefined,
    })).resolves.toBe('unsupported')
  })
})
```

Update the wiring test:

```ts
describe('PageCapturer readiness wiring', () => {
  it('waits for images, fonts, and DOM quiet before materializing pseudo-element text', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const imageWait = source.indexOf('page.evaluate(waitForCaptureImagesForCapture as any, CAPTURE_IMAGE_READY_TIMEOUT_MS)')
    const fontWait = source.indexOf('page.evaluate(waitForCaptureFontsForCapture as any, CAPTURE_FONT_READY_TIMEOUT_MS)')
    const domQuietWait = source.indexOf('page.evaluate(waitForCaptureDomQuietForCapture as any, CAPTURE_DOM_QUIET_WINDOW_MS, CAPTURE_DOM_QUIET_TIMEOUT_MS)')
    const pseudoMaterialize = source.indexOf('page.evaluate(materializePseudoElementTextForCapture as any)')

    expect(CAPTURE_IMAGE_READY_TIMEOUT_MS).toBe(3000)
    expect(CAPTURE_FONT_READY_TIMEOUT_MS).toBe(2500)
    expect(CAPTURE_DOM_QUIET_WINDOW_MS).toBe(250)
    expect(CAPTURE_DOM_QUIET_TIMEOUT_MS).toBe(1500)
    expect(imageWait).toBeGreaterThan(-1)
    expect(fontWait).toBeGreaterThan(imageWait)
    expect(domQuietWait).toBeGreaterThan(fontWait)
    expect(pseudoMaterialize).toBeGreaterThan(domQuietWait)
  })
})
```

- [ ] **Step 2: Run focused test to verify RED**

Run:

```bash
CI=1 npx vitest run src/design/page-capturer.test.ts
```

Expected: FAIL because `CAPTURE_DOM_QUIET_TIMEOUT_MS`, `CAPTURE_DOM_QUIET_WINDOW_MS`, and `waitForCaptureDomQuietForCapture` are not exported or the wiring string is missing.

### Task 2: Implement DOM Quiet Helper

**Files:**
- Modify: `src/design/page-capturer.ts`

- [ ] **Step 1: Add constants, type, and helper**

Add below `CAPTURE_IMAGE_READY_TIMEOUT_MS`:

```ts
export const CAPTURE_DOM_QUIET_WINDOW_MS = 250;
export const CAPTURE_DOM_QUIET_TIMEOUT_MS = 1_500;
```

Add below `CaptureImageReadyStatus`:

```ts
export type CaptureDomQuietStatus = 'quiet' | 'timeout' | 'unsupported';

type CaptureMutationObserver = {
  observe: (target: unknown, options: MutationObserverInit) => void;
  disconnect: () => void;
};

type CaptureMutationObserverConstructor = new (callback: () => void) => CaptureMutationObserver;
```

Add below `waitForCaptureImagesForCapture()`:

```ts
export async function waitForCaptureDomQuietForCapture(
  quietWindowMs = 250,
  timeoutMs = 1500,
  options?: {
    target?: unknown;
    MutationObserverCtor?: CaptureMutationObserverConstructor;
  },
): Promise<CaptureDomQuietStatus> {
  const activeDocument = typeof document !== 'undefined' ? document : undefined;
  const target = options?.target ?? activeDocument?.body;
  const ObserverCtor = options?.MutationObserverCtor
    ?? (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined);

  if (!target || !ObserverCtor)
    return 'unsupported';

  return new Promise<CaptureDomQuietStatus>((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = (status: CaptureDomQuietStatus) => {
      if (settled)
        return;

      settled = true;
      observer.disconnect();
      if (quietTimer)
        clearTimeout(quietTimer);
      if (timeoutTimer)
        clearTimeout(timeoutTimer);
      resolve(status);
    };

    const scheduleQuiet = () => {
      if (quietTimer)
        clearTimeout(quietTimer);
      quietTimer = setTimeout(() => cleanup('quiet'), Math.max(0, quietWindowMs));
    };

    const observer = new ObserverCtor(() => scheduleQuiet());
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    timeoutTimer = setTimeout(() => cleanup('timeout'), Math.max(0, timeoutMs));
    scheduleQuiet();
  });
}
```

- [ ] **Step 2: Wire helper into clone capture**

Insert after the existing font readiness log:

```ts
      const domQuietStatus = await page.evaluate(waitForCaptureDomQuietForCapture as any, CAPTURE_DOM_QUIET_WINDOW_MS, CAPTURE_DOM_QUIET_TIMEOUT_MS);
      console.log(`[PageCapturer] DOM quiet: ${domQuietStatus}`);
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
- Verify: `docs/superpowers/specs/2026-06-05-clone-capture-dom-quiet-design.md`
- Verify: `docs/superpowers/plans/2026-06-05-clone-capture-dom-quiet.md`

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
git add src/design/page-capturer.ts src/design/page-capturer.test.ts docs/superpowers/plans/2026-06-05-clone-capture-dom-quiet.md
git commit -m "feat(capture): wait for DOM quiet before clone serialization"
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
