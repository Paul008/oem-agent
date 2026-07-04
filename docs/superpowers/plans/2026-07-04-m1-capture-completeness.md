# M1 Capture Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OEM page capture wait for full hydration (paced multi-pass scroll sweep + feature-app mount-waits), record a capture audit, and refuse to publish incomplete captures — so the VW Amarok clone contains ~16,000px of page instead of ~6,000px.

**Architecture:** All changes live in the worker's capture layer (`src/design/`). Two new self-contained page-context helpers replace the single 10-second scroll sweep inside `captureDom()`; a new profile module gives each OEM its own hydration budgets/shell selectors/backend order; a new completeness gate runs in `captureModelPage()` **before** anything is written to R2; the existing capture-diagnostics store gains audit fields so failures are diagnosable from the dashboard.

**Tech Stack:** TypeScript (Cloudflare Worker), `@cloudflare/puppeteer` (Browser Rendering), vitest, R2.

**Background you need (read this, not the whole repo):**
- `captureDom()` (`src/design/page-capturer.ts:1901`) drives a headless Chromium page and currently waits ~15s total for hydration: scroll sweep capped at 10s/30 steps (`CAPTURE_SCROLL_SWEEP_*`, :100–:103), DOM-quiet 250ms window/1.5s timeout (:106–:107). VW's feature apps mount on scroll-into-view and need seconds each — capture serializes the DOM before they exist. Evidence: live source 16,215px/113 images vs clone 5,955px/31 images (spec §2).
- Helpers passed to `page.evaluate(fn, arg)` are **serialized** — they must be fully self-contained (no outer closures) and take everything via one options argument. They also accept an injectable `win`/`doc` so unit tests can run them in Node. Copy the style of `sweepCaptureScrollForCapture` (:410).
- `captureDom` wiring is tested by **source-order assertions** (reading `page-capturer.ts` as text and asserting index order) — see `page-capturer.test.ts:660`. When you change calls inside `captureDom`, you must update that test.
- The compile route (`src/routes/oem-agent.ts:5348`) and pipeline CLONE step (`src/design/pipeline.ts` ~:215) already propagate `PageCaptureResult.error` into the compile-run status — a gate failure with a good error string surfaces in the dashboard with zero route/pipeline changes.

## Global Constraints

- **Never publish an incomplete capture:** on gate failure, `captureModelPage` returns `success: false` before `downloadImages`/R2 writes (spec §4.1 "fail loud").
- **Extend, don't duplicate** (spec §13): audit fields go into `capture-diagnostics.ts`; no new diagnostics store. New helpers go into `page-capturer.ts` beside their siblings.
- **Page-context helpers must be self-contained** with injectable `win`/`doc` (existing pattern; required because `page.evaluate` serializes them).
- **`capture-completeness.ts` must use `import type` for anything from `page-capturer.ts`** — a value import creates a runtime circular dependency (page-capturer → capture-profiles → capture-completeness → page-capturer).
- **Profiles are code-defined constants in M1** (conscious simplification of spec §4.1 "stored with page definitions" — no editing UI exists yet; R2-stored overrides can come later).
- **Backend escalation is *suggested*, not auto-executed, in M1**: `scrapling-stealth`/`external-html` require caller-supplied HTML (`page-capturer.ts:1699`), so the worker cannot self-escalate. The profile declares the order; failures surface `suggested_backend`. (Documented deviation from spec §4.1; full auto-escalation needs an external capture service reachable from the worker.)
- Keep `sweepCaptureScrollForCapture` exported and its tests green — the new paced sweep supersedes its use in `captureDom` but the helper remains (used by Task 8's reduced-budget path and external callers).
- Commands run from repo root `/Users/paulgiurin/Documents/Projects/oem-agent`. Tests: `npx vitest run <file>`. Typecheck: `npm run typecheck`.
- Commit after every task. Do not run `git push` or deploy until Task 9.
- M1 exit (spec §9): VW Amarok capture ≥95% of live height / ≥90% of live image count, measured live by `qa:fidelity` in Task 9.

---

### Task 1: Paced hydration sweep helper

**Files:**
- Modify: `src/design/page-capturer.ts` (constants near :100; new types near the other `Capture*` types; new function directly after `sweepCaptureScrollForCapture`, which ends at :469)
- Test: `src/design/page-capturer.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 4, 5, 8):
  - `export const CAPTURE_HYDRATION_BUDGET_MS = 90_000`, `CAPTURE_HYDRATION_STEP_DELAY_MS = 450`, `CAPTURE_HYDRATION_MOUNT_WAIT_MS = 4_000`, `CAPTURE_HYDRATION_STABILITY_PCT = 2`, `CAPTURE_HYDRATION_MAX_PASSES = 4`
  - `export type CaptureHydrationStatus = 'stable' | 'budget-exhausted' | 'max-passes' | 'unsupported'`
  - `export interface CaptureHydrationPassSample { pass: number; scroll_height: number; image_count: number; elapsed_ms: number }`
  - `export interface CaptureHydrationReport { status: CaptureHydrationStatus; passes: CaptureHydrationPassSample[]; final_scroll_height: number; final_image_count: number }`
  - `export async function runPacedHydrationSweepForCapture(options?: { budgetMs?: number; stepDelayMs?: number; mountWaitMs?: number; stabilityPct?: number; maxPasses?: number; win?: CaptureScrollSweepWindow }): Promise<CaptureHydrationReport>`

- [ ] **Step 1: Write the failing tests**

Add to `src/design/page-capturer.test.ts` (import `runPacedHydrationSweepForCapture` and the five new constants in the existing import block). Add this fake-window factory next to `createScrollSweepWindow`:

```ts
function createHydrationWindow(options: {
  scrollHeight: number;
  imageCount?: number;
  msPerTick?: number;
  onScroll?: (y: number, win: any) => void;
}) {
  let nowMs = 0
  const calls: Array<[number, number]> = []
  const win: any = {
    innerHeight: 1000,
    scrollY: 0,
    imageCount: options.imageCount ?? 0,
    Date: { now: () => nowMs },
    setTimeout: ((callback: () => void) => {
      nowMs += options.msPerTick ?? 1
      callback()
      return 0 as any
    }) as typeof setTimeout,
    scrollTo: (x: number, y: number) => {
      calls.push([x, y])
      win.scrollY = y
      options.onScroll?.(y, win)
    },
  }
  win.document = {
    body: { scrollHeight: options.scrollHeight },
    documentElement: { scrollHeight: options.scrollHeight },
    querySelectorAll: (selector: string) =>
      selector === 'img' ? Array.from({ length: win.imageCount }) : [],
  }
  return { win, calls }
}
```

And the test suite:

```ts
describe('runPacedHydrationSweepForCapture', () => {
  it('is stable after one pass on a static page and scrolls back to top', async () => {
    const { win, calls } = createHydrationWindow({ scrollHeight: 2500, imageCount: 10 })

    const report = await runPacedHydrationSweepForCapture({
      budgetMs: 10_000, stepDelayMs: 0, mountWaitMs: 0, stabilityPct: 2, maxPasses: 4, win,
    })

    expect(report.status).toBe('stable')
    expect(report.passes).toHaveLength(1)
    expect(report.final_scroll_height).toBe(2500)
    expect(report.final_image_count).toBe(10)
    expect(calls.at(-1)).toEqual([0, 0])
  })

  it('runs a second pass when content grows during the first, then stabilizes', async () => {
    const { win } = createHydrationWindow({
      scrollHeight: 2000,
      onScroll: (y, activeWindow) => {
        if (y >= 1000 && activeWindow.document.body.scrollHeight < 4000) {
          activeWindow.document.body.scrollHeight = 4000
          activeWindow.document.documentElement.scrollHeight = 4000
        }
      },
    })

    const report = await runPacedHydrationSweepForCapture({
      budgetMs: 60_000, stepDelayMs: 0, mountWaitMs: 0, stabilityPct: 2, maxPasses: 4, win,
    })

    expect(report.status).toBe('stable')
    expect(report.passes).toHaveLength(2)
    expect(report.passes[0].scroll_height).toBe(4000)
    expect(report.final_scroll_height).toBe(4000)
  })

  it('returns max-passes when every pass keeps growing the page', async () => {
    const { win } = createHydrationWindow({
      scrollHeight: 2000,
      onScroll: (_y, activeWindow) => {
        activeWindow.document.body.scrollHeight += 500
        activeWindow.document.documentElement.scrollHeight += 500
      },
    })

    const report = await runPacedHydrationSweepForCapture({
      budgetMs: 600_000, stepDelayMs: 0, mountWaitMs: 0, stabilityPct: 2, maxPasses: 2, win,
    })

    expect(report.status).toBe('max-passes')
    expect(report.passes).toHaveLength(2)
  })

  it('returns budget-exhausted when the time budget runs out mid-sweep', async () => {
    const { win } = createHydrationWindow({ scrollHeight: 50_000, msPerTick: 400 })

    const report = await runPacedHydrationSweepForCapture({
      budgetMs: 1_000, stepDelayMs: 300, mountWaitMs: 0, stabilityPct: 2, maxPasses: 4, win,
    })

    expect(report.status).toBe('budget-exhausted')
    expect(report.final_scroll_height).toBe(50_000)
  })

  it('waits out a mount burst triggered by a step before moving on', async () => {
    let mounted = false
    const { win } = createHydrationWindow({
      scrollHeight: 2000,
      imageCount: 5,
      onScroll: (y, activeWindow) => {
        if (y >= 1000 && !mounted) {
          mounted = true
          activeWindow.imageCount = 25
        }
      },
    })

    const report = await runPacedHydrationSweepForCapture({
      budgetMs: 60_000, stepDelayMs: 1, mountWaitMs: 10, stabilityPct: 2, maxPasses: 4, win,
    })

    expect(report.status).toBe('stable')
    expect(report.final_image_count).toBe(25)
  })

  it('returns unsupported when the viewport cannot scroll', async () => {
    const report = await runPacedHydrationSweepForCapture({
      win: {
        innerHeight: 0,
        document: { body: { scrollHeight: 1000 }, documentElement: { scrollHeight: 1000 } },
        scrollTo: () => {},
      } as any,
    })

    expect(report.status).toBe('unsupported')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/design/page-capturer.test.ts`
Expected: FAIL — `runPacedHydrationSweepForCapture` is not exported.

- [ ] **Step 3: Implement the helper**

In `src/design/page-capturer.ts`, after line 107 (`CAPTURE_DOM_QUIET_TIMEOUT_MS`) add:

```ts
export const CAPTURE_HYDRATION_BUDGET_MS = 90_000;
export const CAPTURE_HYDRATION_STEP_DELAY_MS = 450;
export const CAPTURE_HYDRATION_MOUNT_WAIT_MS = 4_000;
export const CAPTURE_HYDRATION_STABILITY_PCT = 2;
export const CAPTURE_HYDRATION_MAX_PASSES = 4;
```

Near the other capture types (after `DomCaptureResult`) add:

```ts
export type CaptureHydrationStatus = 'stable' | 'budget-exhausted' | 'max-passes' | 'unsupported';

export interface CaptureHydrationPassSample {
  pass: number;
  scroll_height: number;
  image_count: number;
  elapsed_ms: number;
}

export interface CaptureHydrationReport {
  status: CaptureHydrationStatus;
  passes: CaptureHydrationPassSample[];
  final_scroll_height: number;
  final_image_count: number;
}
```

Directly after `sweepCaptureScrollForCapture` (ends :469) add. NOTE: this function is serialized into `page.evaluate` — it must not reference anything outside its own body except its options argument:

```ts
/**
 * Multi-pass scroll sweep that keeps sweeping until the page stops growing.
 * Unlike sweepCaptureScrollForCapture (single pass, hard 10s cap), this paces
 * each step and grants a bounded extra wait whenever a step mounts new content
 * (scroll-triggered OEM feature apps need seconds to fetch + render).
 */
export async function runPacedHydrationSweepForCapture(options?: {
  budgetMs?: number;
  stepDelayMs?: number;
  mountWaitMs?: number;
  stabilityPct?: number;
  maxPasses?: number;
  win?: CaptureScrollSweepWindow;
}): Promise<CaptureHydrationReport> {
  const activeWindow = options?.win ?? (typeof window !== 'undefined'
    ? window as unknown as CaptureScrollSweepWindow
    : undefined);
  const activeDocument = activeWindow?.document ?? (typeof document !== 'undefined'
    ? document as unknown as CaptureScrollSweepWindow['document']
    : undefined);
  const viewportHeight = Number(activeWindow?.innerHeight ?? 0);
  const scrollTo = activeWindow?.scrollTo;

  const report: CaptureHydrationReport = {
    status: 'unsupported',
    passes: [],
    final_scroll_height: 0,
    final_image_count: 0,
  };

  if (!activeWindow || !activeDocument || typeof scrollTo !== 'function' || !Number.isFinite(viewportHeight) || viewportHeight <= 0)
    return report;

  const budgetMs = Math.max(0, options?.budgetMs ?? 90_000);
  const stepDelayMs = Math.max(0, options?.stepDelayMs ?? 450);
  const mountWaitMs = Math.max(0, options?.mountWaitMs ?? 4_000);
  const stabilityPct = Math.max(0, options?.stabilityPct ?? 2);
  const maxPasses = Math.max(1, options?.maxPasses ?? 4);
  const clock = activeWindow.Date ?? Date;
  const timer = activeWindow.setTimeout ?? setTimeout;
  const sleep = (delayMs: number) => new Promise<void>((resolve) => {
    timer(resolve, delayMs);
  });
  const scrollHeight = () => Math.max(
    0,
    Number(activeDocument.documentElement?.scrollHeight ?? 0),
    Number(activeDocument.body?.scrollHeight ?? 0),
  );
  const imageCount = () => {
    try {
      const doc = activeDocument as unknown as { querySelectorAll?: (selector: string) => ArrayLike<unknown> };
      return Number(doc.querySelectorAll?.('img')?.length ?? 0);
    } catch {
      return 0;
    }
  };
  const startedAt = clock.now();
  const budgetLeft = () => budgetMs - (clock.now() - startedAt);
  const snapshotFinals = () => {
    report.final_scroll_height = scrollHeight();
    report.final_image_count = imageCount();
  };

  let previousHeight = scrollHeight();
  try {
    for (let pass = 1; pass <= maxPasses; pass++) {
      scrollTo.call(activeWindow, 0, 0);
      let y = 0;

      while (true) {
        if (budgetLeft() <= 0) {
          report.status = 'budget-exhausted';
          snapshotFinals();
          return report;
        }

        const maxY = Math.max(0, scrollHeight() - viewportHeight);
        if (y >= maxY)
          break;

        const beforeHeight = scrollHeight();
        const beforeImages = imageCount();
        y = Math.min(y + viewportHeight, maxY);
        scrollTo.call(activeWindow, 0, y);
        await sleep(stepDelayMs);

        if (scrollHeight() > beforeHeight || imageCount() > beforeImages) {
          // This step mounted new content — give it a bounded settle window.
          const mountDeadline = clock.now() + Math.min(mountWaitMs, Math.max(0, budgetLeft()));
          let lastHeight = scrollHeight();
          let lastImages = imageCount();
          while (clock.now() < mountDeadline) {
            await sleep(stepDelayMs);
            const nextHeight = scrollHeight();
            const nextImages = imageCount();
            if (nextHeight === lastHeight && nextImages === lastImages)
              break;
            lastHeight = nextHeight;
            lastImages = nextImages;
          }
        }
      }

      const passHeight = scrollHeight();
      report.passes.push({
        pass,
        scroll_height: passHeight,
        image_count: imageCount(),
        elapsed_ms: clock.now() - startedAt,
      });

      const growthPct = previousHeight > 0 ? ((passHeight - previousHeight) / previousHeight) * 100 : 100;
      if (growthPct <= stabilityPct) {
        report.status = 'stable';
        snapshotFinals();
        return report;
      }

      previousHeight = passHeight;
      if (budgetLeft() <= 0) {
        report.status = 'budget-exhausted';
        snapshotFinals();
        return report;
      }
    }

    report.status = 'max-passes';
    snapshotFinals();
    return report;
  } finally {
    scrollTo.call(activeWindow, 0, 0);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/page-capturer.test.ts`
Expected: PASS (all existing suites plus the 6 new tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/page-capturer.ts src/design/page-capturer.test.ts
git commit -m "feat(capture): add paced multi-pass hydration sweep"
```

---

### Task 2: Feature-app mount-wait helper

**Files:**
- Modify: `src/design/page-capturer.ts` (new function directly after `runPacedHydrationSweepForCapture`)
- Test: `src/design/page-capturer.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 4, 5):
  - `export interface CaptureFeatureAppMountReport { checked: number; recovered: number; still_empty: string[] }`
  - `export async function waitForFeatureAppMountsForCapture(options?: { shellSelectors?: string[]; mountWaitMs?: number; budgetMs?: number; pollDelayMs?: number; win?: any }): Promise<CaptureFeatureAppMountReport>`
  - `still_empty` entries are formatted `` `${selector} [${index}]` ``.

- [ ] **Step 1: Write the failing tests**

Add to `src/design/page-capturer.test.ts`:

```ts
function createShellElement(options: { populated?: boolean; populateAfterPolls?: number } = {}) {
  let polls = 0
  const element: any = {
    scrolledIntoView: false,
    populated: options.populated ?? false,
    scrollIntoView() {
      element.scrolledIntoView = true
    },
    querySelector(_selector: string) {
      if (options.populateAfterPolls !== undefined && polls >= options.populateAfterPolls)
        element.populated = true
      polls++
      return element.populated ? {} : null
    },
    get textContent() {
      return element.populated ? 'Feature app content rendered here for the customer.' : ''
    },
  }
  return element
}

function createShellWindow(shellsBySelector: Record<string, any[]>) {
  let nowMs = 0
  const win: any = {
    Date: { now: () => nowMs },
    setTimeout: ((callback: () => void) => {
      nowMs += 100
      callback()
      return 0 as any
    }) as typeof setTimeout,
    scrollTo: () => {},
    document: {
      querySelectorAll: (selector: string) => shellsBySelector[selector] ?? [],
    },
  }
  return win
}

describe('waitForFeatureAppMountsForCapture', () => {
  it('recovers a shell that mounts while waiting and reports the one that never does', async () => {
    const recovering = createShellElement({ populateAfterPolls: 2 })
    const neverMounts = createShellElement()
    const win = createShellWindow({ '[class*="CmsFeatureAppLoader"]': [recovering, neverMounts] })

    const report = await waitForFeatureAppMountsForCapture({
      shellSelectors: ['[class*="CmsFeatureAppLoader"]'],
      mountWaitMs: 1_000,
      budgetMs: 10_000,
      pollDelayMs: 100,
      win,
    })

    expect(report.checked).toBe(2)
    expect(report.recovered).toBe(1)
    expect(report.still_empty).toEqual(['[class*="CmsFeatureAppLoader"] [1]'])
    expect(recovering.scrolledIntoView).toBe(true)
  })

  it('skips shells that already have content', async () => {
    const populated = createShellElement({ populated: true })
    const win = createShellWindow({ '.featureAppSection': [populated] })

    const report = await waitForFeatureAppMountsForCapture({
      shellSelectors: ['.featureAppSection'],
      mountWaitMs: 500,
      budgetMs: 5_000,
      win,
    })

    expect(report.checked).toBe(0)
    expect(report.recovered).toBe(0)
    expect(report.still_empty).toEqual([])
  })

  it('returns an empty report when no selectors are configured', async () => {
    const win = createShellWindow({})

    const report = await waitForFeatureAppMountsForCapture({ shellSelectors: [], win })

    expect(report).toEqual({ checked: 0, recovered: 0, still_empty: [] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/design/page-capturer.test.ts`
Expected: FAIL — `waitForFeatureAppMountsForCapture` is not exported.

- [ ] **Step 3: Implement the helper**

After `runPacedHydrationSweepForCapture` add (self-contained; injectable `win`):

```ts
export interface CaptureFeatureAppMountReport {
  checked: number;
  recovered: number;
  still_empty: string[];
}

/**
 * Some OEM feature apps (e.g. VW CmsFeatureAppLoader) render an empty shell
 * until their bundle mounts. After the hydration sweep, give each still-empty
 * shell one bounded, scrolled-into-view second chance and report the holdouts —
 * the completeness gate uses still_empty to refuse publishing a gutted page.
 */
export async function waitForFeatureAppMountsForCapture(options?: {
  shellSelectors?: string[];
  mountWaitMs?: number;
  budgetMs?: number;
  pollDelayMs?: number;
  win?: {
    document?: { querySelectorAll?: (selector: string) => ArrayLike<unknown> };
    Date?: { now: () => number };
    setTimeout?: typeof setTimeout;
    scrollTo?: (x: number, y: number) => void;
  };
}): Promise<CaptureFeatureAppMountReport> {
  const activeWindow = options?.win ?? (typeof window !== 'undefined' ? window as any : undefined);
  const activeDocument = activeWindow?.document ?? (typeof document !== 'undefined' ? document as any : undefined);
  const report: CaptureFeatureAppMountReport = { checked: 0, recovered: 0, still_empty: [] };
  const selectors = (options?.shellSelectors ?? [])
    .map(selector => String(selector || '').trim())
    .filter(Boolean);

  if (!activeDocument || typeof activeDocument.querySelectorAll !== 'function' || selectors.length === 0)
    return report;

  const mountWaitMs = Math.max(0, options?.mountWaitMs ?? 4_000);
  const budgetMs = Math.max(0, options?.budgetMs ?? 20_000);
  const pollDelayMs = Math.max(1, options?.pollDelayMs ?? 250);
  const clock = activeWindow?.Date ?? Date;
  const timer = activeWindow?.setTimeout ?? setTimeout;
  const sleep = (delayMs: number) => new Promise<void>((resolve) => {
    timer(resolve, delayMs);
  });
  const startedAt = clock.now();
  const budgetLeft = () => budgetMs - (clock.now() - startedAt);

  const isEmptyShell = (element: any): boolean => {
    try {
      if (typeof element?.querySelector === 'function'
        && element.querySelector('img, picture, video, iframe, canvas, svg, button, a, input, select, textarea'))
        return false;
      return String(element?.textContent ?? '').trim().length < 40;
    } catch {
      return true;
    }
  };

  for (const selector of selectors) {
    let shells: any[] = [];
    try {
      shells = Array.from(activeDocument.querySelectorAll(selector));
    } catch {
      continue;
    }

    for (let index = 0; index < shells.length; index++) {
      const shell = shells[index];
      if (!isEmptyShell(shell))
        continue;

      report.checked++;
      try {
        shell.scrollIntoView?.({ block: 'center' });
      } catch { /* fake elements may not implement scrollIntoView options */ }

      const deadline = clock.now() + Math.min(mountWaitMs, Math.max(0, budgetLeft()));
      while (clock.now() < deadline && isEmptyShell(shell))
        await sleep(pollDelayMs);

      if (isEmptyShell(shell))
        report.still_empty.push(`${selector} [${index}]`);
      else
        report.recovered++;
    }
  }

  try {
    activeWindow?.scrollTo?.(0, 0);
  } catch { /* ignore */ }

  return report;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/page-capturer.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/page-capturer.ts src/design/page-capturer.test.ts
git commit -m "feat(capture): add feature-app mount-wait with holdout reporting"
```

---

### Task 3: Completeness gate module

**Files:**
- Create: `src/design/capture-completeness.ts`
- Test: `src/design/capture-completeness.test.ts` (create)

**Interfaces:**
- Consumes: `CaptureAudit` type from Task 4 — to keep this task independently testable, this module defines the gate against a structural subset; use `import type { CaptureAudit } from './page-capturer'` ONLY after Task 4 lands. For this task, define the input inline as shown (Task 4 Step 5 switches it to the shared type).
- Produces (used by Tasks 5, 6):
  - `export interface CaptureCompletenessConfig { maxEmptyShells: number; minHeightVsLastGoodPct: number; requireHydrationStable: boolean }`
  - `export const DEFAULT_CAPTURE_COMPLETENESS: CaptureCompletenessConfig` (values: 0 / 80 / true)
  - `export interface CaptureCompletenessVerdict { passed: boolean; reasons: string[] }`
  - `export function evaluateCaptureCompleteness(input: { audit?: CaptureCompletenessAuditInput; lastGoodScrollHeight?: number }, config?: CaptureCompletenessConfig): CaptureCompletenessVerdict`

- [ ] **Step 1: Write the failing tests**

Create `src/design/capture-completeness.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CAPTURE_COMPLETENESS,
  evaluateCaptureCompleteness,
} from './capture-completeness'

interface TestAudit {
  captured_scroll_height: number;
  dom_image_count: number;
  hydration_status: 'stable' | 'budget-exhausted' | 'max-passes' | 'unsupported';
  hydration_passes: Array<{ pass: number; scroll_height: number; image_count: number; elapsed_ms: number }>;
  shells_checked: number;
  shells_recovered: number;
  empty_shells: string[];
}

function makeAudit(overrides: Partial<TestAudit> = {}): TestAudit {
  return {
    captured_scroll_height: 16000,
    dom_image_count: 100,
    hydration_status: 'stable' as const,
    hydration_passes: [{ pass: 1, scroll_height: 16000, image_count: 100, elapsed_ms: 30000 }],
    shells_checked: 2,
    shells_recovered: 2,
    empty_shells: [] as string[],
    ...overrides,
  }
}

describe('evaluateCaptureCompleteness', () => {
  it('passes a stable, fully mounted capture', () => {
    const verdict = evaluateCaptureCompleteness({ audit: makeAudit(), lastGoodScrollHeight: 15800 })

    expect(verdict.passed).toBe(true)
    expect(verdict.reasons).toEqual([])
  })

  it('skips the gate when no audit exists (non-browser backend)', () => {
    const verdict = evaluateCaptureCompleteness({ audit: undefined })

    expect(verdict.passed).toBe(true)
    expect(verdict.reasons[0]).toContain('gate skipped')
  })

  it('fails when hydration never stabilized', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ hydration_status: 'budget-exhausted' }),
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons[0]).toContain('hydration did not stabilize')
  })

  it('does not fail stability when hydration reported unsupported', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ hydration_status: 'unsupported' }),
    })

    expect(verdict.passed).toBe(true)
  })

  it('fails when feature-app shells never mounted', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ empty_shells: ['[class*="CmsFeatureAppLoader"] [0]'] }),
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons[0]).toContain('never mounted')
  })

  it('fails when height regresses badly against the last good capture', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ captured_scroll_height: 6000 }),
      lastGoodScrollHeight: 16000,
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons[0]).toContain('last good')
  })

  it('collects multiple failure reasons', () => {
    const verdict = evaluateCaptureCompleteness({
      audit: makeAudit({ hydration_status: 'max-passes', empty_shells: ['.featureAppSection [3]'] }),
      lastGoodScrollHeight: 20000,
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toHaveLength(3)
  })

  it('honours config overrides', () => {
    const verdict = evaluateCaptureCompleteness(
      { audit: makeAudit({ empty_shells: ['.x [0]'] }) },
      { ...DEFAULT_CAPTURE_COMPLETENESS, maxEmptyShells: 1 },
    )

    expect(verdict.passed).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/design/capture-completeness.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `src/design/capture-completeness.ts`:

```ts
/**
 * Capture Completeness Gate — decides whether a browser capture is complete
 * enough to publish. Evaluated in captureModelPage() BEFORE any R2 write, so
 * a half-hydrated page can never replace a good clone (spec §4.1 "fail loud").
 */

// Structural subset of CaptureAudit (page-capturer.ts). Kept structural so this
// module has no runtime dependency on page-capturer (avoids an import cycle via
// capture-profiles). Task 4 aliases the real type here via `import type`.
export interface CaptureCompletenessAuditInput {
  captured_scroll_height: number;
  dom_image_count: number;
  hydration_status: 'stable' | 'budget-exhausted' | 'max-passes' | 'unsupported';
  empty_shells: string[];
}

export interface CaptureCompletenessConfig {
  /** Feature-app shells allowed to remain empty. Default 0. */
  maxEmptyShells: number;
  /** Captured height must be at least this % of the last good capture. Default 80. */
  minHeightVsLastGoodPct: number;
  /** Require the hydration sweep to have converged. Default true. */
  requireHydrationStable: boolean;
}

export const DEFAULT_CAPTURE_COMPLETENESS: CaptureCompletenessConfig = {
  maxEmptyShells: 0,
  minHeightVsLastGoodPct: 80,
  requireHydrationStable: true,
};

export interface CaptureCompletenessVerdict {
  passed: boolean;
  reasons: string[];
}

export function evaluateCaptureCompleteness(
  input: { audit?: CaptureCompletenessAuditInput; lastGoodScrollHeight?: number },
  config: CaptureCompletenessConfig = DEFAULT_CAPTURE_COMPLETENESS,
): CaptureCompletenessVerdict {
  const { audit } = input;
  if (!audit)
    return { passed: true, reasons: ['no capture audit (non-browser backend or initial-document capture); gate skipped'] };

  const failures: string[] = [];

  if (config.requireHydrationStable && audit.hydration_status !== 'stable' && audit.hydration_status !== 'unsupported')
    failures.push(`hydration did not stabilize (status=${audit.hydration_status})`);

  if (audit.empty_shells.length > config.maxEmptyShells)
    failures.push(`${audit.empty_shells.length} feature-app shell(s) never mounted: ${audit.empty_shells.slice(0, 5).join(', ')}`);

  const lastGood = Number(input.lastGoodScrollHeight ?? 0);
  if (lastGood > 0 && audit.captured_scroll_height > 0) {
    const pct = (audit.captured_scroll_height / lastGood) * 100;
    if (pct < config.minHeightVsLastGoodPct)
      failures.push(`captured height ${audit.captured_scroll_height}px is ${Math.round(pct)}% of last good ${lastGood}px (minimum ${config.minHeightVsLastGoodPct}%)`);
  }

  return failures.length === 0 ? { passed: true, reasons: [] } : { passed: false, reasons: failures };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/capture-completeness.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/capture-completeness.ts src/design/capture-completeness.test.ts
git commit -m "feat(capture): add capture completeness gate"
```

---

### Task 4: Per-OEM capture profiles

**Files:**
- Create: `src/design/capture-profiles.ts`
- Test: `src/design/capture-profiles.test.ts` (create)

**Interfaces:**
- Consumes: `CaptureBackend` (type-only, from `./page-capturer`), `CaptureCompletenessConfig`/`DEFAULT_CAPTURE_COMPLETENESS` from `./capture-completeness`.
- Produces (used by Task 5):
  - `export interface CaptureHydrationSettings { budgetMs: number; stepDelayMs: number; mountWaitMs: number; stabilityPct: number; maxPasses: number }`
  - `export interface OemCaptureProfile { backendOrder: CaptureBackend[]; hydration: CaptureHydrationSettings; featureAppShellSelectors: string[]; completeness: CaptureCompletenessConfig }`
  - `export const DEFAULT_CAPTURE_PROFILE: OemCaptureProfile`
  - `export function resolveCaptureProfile(oemId: string): OemCaptureProfile`

- [ ] **Step 1: Write the failing tests**

Create `src/design/capture-profiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { DEFAULT_CAPTURE_PROFILE, resolveCaptureProfile } from './capture-profiles'

describe('resolveCaptureProfile', () => {
  it('returns defaults for an OEM with no overrides', () => {
    const profile = resolveCaptureProfile('mazda-au')

    expect(profile).toEqual(DEFAULT_CAPTURE_PROFILE)
    expect(profile.backendOrder).toEqual(['cloudflare-browser'])
    expect(profile.featureAppShellSelectors).toEqual([])
    expect(profile.hydration.budgetMs).toBe(90_000)
    expect(profile.completeness.maxEmptyShells).toBe(0)
  })

  it('gives volkswagen-au feature-app shell selectors and a bigger hydration budget', () => {
    const profile = resolveCaptureProfile('volkswagen-au')

    expect(profile.featureAppShellSelectors).toContain('[class*="CmsFeatureAppLoader"]')
    expect(profile.featureAppShellSelectors).toContain('.featureAppSection')
    expect(profile.hydration.budgetMs).toBe(120_000)
    expect(profile.backendOrder).toEqual(['cloudflare-browser'])
  })

  it('gives toyota-au a scrapling-stealth escalation path', () => {
    const profile = resolveCaptureProfile('toyota-au')

    expect(profile.backendOrder).toEqual(['cloudflare-browser', 'scrapling-stealth'])
    expect(profile.hydration.budgetMs).toBe(90_000)
  })

  it('merges partial hydration overrides over defaults without mutating them', () => {
    const before = { ...DEFAULT_CAPTURE_PROFILE.hydration }
    resolveCaptureProfile('volkswagen-au')

    expect(DEFAULT_CAPTURE_PROFILE.hydration).toEqual(before)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/design/capture-profiles.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `src/design/capture-profiles.ts`:

```ts
/**
 * Per-OEM Capture Profiles — declarative capture settings per brand.
 *
 * Replaces call-site-only backend selection (spec §4.1): each OEM declares its
 * hydration budgets, known feature-app shell selectors, completeness config and
 * backend escalation order. Code-defined in M1 (no editing UI yet).
 *
 * NOTE on escalation: scrapling-stealth / external-html require caller-supplied
 * HTML, so the worker cannot execute escalation itself. backendOrder is used to
 * SUGGEST the next backend in failure results/diagnostics.
 */

import type { CaptureBackend } from './page-capturer';
import { DEFAULT_CAPTURE_COMPLETENESS, type CaptureCompletenessConfig } from './capture-completeness';

export interface CaptureHydrationSettings {
  budgetMs: number;
  stepDelayMs: number;
  mountWaitMs: number;
  stabilityPct: number;
  maxPasses: number;
}

export interface OemCaptureProfile {
  backendOrder: CaptureBackend[];
  hydration: CaptureHydrationSettings;
  featureAppShellSelectors: string[];
  completeness: CaptureCompletenessConfig;
}

export const DEFAULT_CAPTURE_PROFILE: OemCaptureProfile = {
  backendOrder: ['cloudflare-browser'],
  hydration: {
    budgetMs: 90_000,
    stepDelayMs: 450,
    mountWaitMs: 4_000,
    stabilityPct: 2,
    maxPasses: 4,
  },
  featureAppShellSelectors: [],
  completeness: DEFAULT_CAPTURE_COMPLETENESS,
};

const OEM_CAPTURE_PROFILE_OVERRIDES: Record<string, Partial<OemCaptureProfile>> = {
  'volkswagen-au': {
    hydration: {
      budgetMs: 120_000,
      stepDelayMs: 450,
      mountWaitMs: 5_000,
      stabilityPct: 2,
      maxPasses: 5,
    },
    featureAppShellSelectors: ['[class*="CmsFeatureAppLoader"]', '.featureAppSection'],
  },
  'toyota-au': {
    backendOrder: ['cloudflare-browser', 'scrapling-stealth'],
  },
};

export function resolveCaptureProfile(oemId: string): OemCaptureProfile {
  const override = OEM_CAPTURE_PROFILE_OVERRIDES[String(oemId)] ?? {};
  return {
    backendOrder: override.backendOrder ?? [...DEFAULT_CAPTURE_PROFILE.backendOrder],
    hydration: { ...DEFAULT_CAPTURE_PROFILE.hydration, ...(override.hydration ?? {}) },
    featureAppShellSelectors: override.featureAppShellSelectors ?? [...DEFAULT_CAPTURE_PROFILE.featureAppShellSelectors],
    completeness: { ...DEFAULT_CAPTURE_PROFILE.completeness, ...(override.completeness ?? {}) },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/capture-profiles.test.ts`
Expected: PASS. (The `resolveCaptureProfile('mazda-au')` equality test passes because fresh spreads/copies equal the default.)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/capture-profiles.ts src/design/capture-profiles.test.ts
git commit -m "feat(capture): add per-OEM capture profiles"
```

---

### Task 5: Wire hydration + audit into captureDom

**Files:**
- Modify: `src/design/page-capturer.ts` (`DomCaptureResult` :57; `captureDom` :1901–1999; `captureModelPage` :1670 call site)
- Test: `src/design/page-capturer.test.ts` (`PageCapturer readiness wiring` describe, :660)

**Interfaces:**
- Consumes: Task 1 sweep + Task 2 mount-wait + Task 4 `OemCaptureProfile`/`resolveCaptureProfile`.
- Produces (used by Tasks 6, 7):
  - `export interface CaptureAudit { captured_scroll_height: number; dom_image_count: number; hydration_status: CaptureHydrationStatus; hydration_passes: CaptureHydrationPassSample[]; shells_checked: number; shells_recovered: number; empty_shells: string[] }`
  - `DomCaptureResult` gains `audit?: CaptureAudit`
  - `captureDom(sourceUrl, profile)` — private signature change; the browser path in `captureModelPage` resolves the profile and passes it.

- [ ] **Step 1: Update the wiring test to describe the new order (it will fail)**

In `page-capturer.test.ts` replace the body of the `it('waits for images, fonts, and DOM quiet before materializing pseudo-element text', ...)` test (:661–:688) with:

```ts
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const lazyActivation = source.indexOf('page.evaluate(activateLazyMediaForCapture as any)')
    const hydrationSweep = source.indexOf('page.evaluate(runPacedHydrationSweepForCapture as any')
    const featureAppWait = source.indexOf('page.evaluate(waitForFeatureAppMountsForCapture as any')
    const imageWait = source.indexOf('page.evaluate(waitForCaptureImagesForCapture as any, CAPTURE_IMAGE_READY_TIMEOUT_MS)')
    const fontWait = source.indexOf('page.evaluate(waitForCaptureFontsForCapture as any, CAPTURE_FONT_READY_TIMEOUT_MS)')
    const domQuietWait = source.indexOf('page.evaluate(waitForCaptureDomQuietForCapture as any, CAPTURE_DOM_QUIET_WINDOW_MS, CAPTURE_DOM_QUIET_TIMEOUT_MS)')
    const pseudoMaterialize = source.indexOf('page.evaluate(materializePseudoElementTextForCapture as any)')

    expect(CAPTURE_HYDRATION_BUDGET_MS).toBe(90000)
    expect(CAPTURE_HYDRATION_STEP_DELAY_MS).toBe(450)
    expect(CAPTURE_HYDRATION_MOUNT_WAIT_MS).toBe(4000)
    expect(CAPTURE_HYDRATION_STABILITY_PCT).toBe(2)
    expect(CAPTURE_HYDRATION_MAX_PASSES).toBe(4)
    expect(CAPTURE_IMAGE_READY_TIMEOUT_MS).toBe(3000)
    expect(CAPTURE_FONT_READY_TIMEOUT_MS).toBe(2500)
    expect(CAPTURE_DOM_QUIET_WINDOW_MS).toBe(250)
    expect(CAPTURE_DOM_QUIET_TIMEOUT_MS).toBe(1500)
    expect(lazyActivation).toBeGreaterThan(-1)
    expect(hydrationSweep).toBeGreaterThan(lazyActivation)
    expect(featureAppWait).toBeGreaterThan(hydrationSweep)
    expect(imageWait).toBeGreaterThan(featureAppWait)
    expect(fontWait).toBeGreaterThan(imageWait)
    expect(domQuietWait).toBeGreaterThan(fontWait)
    expect(pseudoMaterialize).toBeGreaterThan(domQuietWait)
```

Add the new constant names to the test file's import block; the four `CAPTURE_SCROLL_SWEEP_*` imports stay (still used by the `sweepCaptureScrollForCapture` suite — if the linter flags any as unused after the edit, remove only the unused ones).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/page-capturer.test.ts -t "waits for images"`
Expected: FAIL — `hydrationSweep` index is `-1`.

- [ ] **Step 3: Implement the captureDom changes**

3a. Add the audit type after `CaptureHydrationReport`:

```ts
export interface CaptureAudit {
  captured_scroll_height: number;
  dom_image_count: number;
  hydration_status: CaptureHydrationStatus;
  hydration_passes: CaptureHydrationPassSample[];
  shells_checked: number;
  shells_recovered: number;
  empty_shells: string[];
}
```

3b. Add `audit?: CaptureAudit;` to `DomCaptureResult` (:57–68).

3c. In `capture-completeness.ts`, replace the structural `CaptureCompletenessAuditInput` interface with a type-only alias (keeps Task 3's API, unifies the shape):

```ts
import type { CaptureAudit } from './page-capturer';

export type CaptureCompletenessAuditInput = Pick<
  CaptureAudit,
  'captured_scroll_height' | 'dom_image_count' | 'hydration_status' | 'empty_shells'
>;
```

3d. Add to `page-capturer.ts` imports: `import { resolveCaptureProfile, type OemCaptureProfile } from './capture-profiles';`

3e. Change `captureDom`'s signature (:1901) to:

```ts
  private async captureDom(
    sourceUrl: string,
    profile: OemCaptureProfile,
  ): Promise<DomCaptureResult | { bot_blocked: true }> {
```

3f. In `captureModelPage` (:1708–1710), resolve the profile before the capture dispatch and pass it:

```ts
      const profile = resolveCaptureProfile(oemId);
      let capture = backend === 'scrapling-stealth' || backend === 'external-html'
        ? buildDomCaptureFromHtml(options.externalCapture!, options.externalCapture?.finalUrl || sourceUrl)
        : await this.captureDom(sourceUrl, profile);
```

3g. Inside `captureDom`, replace the single-pass sweep block (:1972–1980, the `sweepCaptureScrollForCapture` evaluate + its log) with:

```ts
      // Paced multi-pass hydration sweep: keep sweeping until the page stops
      // growing so scroll-mounted feature apps exist before we serialize.
      const hydrationReport = await page.evaluate(runPacedHydrationSweepForCapture as any, {
        budgetMs: profile.hydration.budgetMs,
        stepDelayMs: profile.hydration.stepDelayMs,
        mountWaitMs: profile.hydration.mountWaitMs,
        stabilityPct: profile.hydration.stabilityPct,
        maxPasses: profile.hydration.maxPasses,
      }) as CaptureHydrationReport;
      console.log(`[PageCapturer] Hydration sweep: ${hydrationReport.status} after ${hydrationReport.passes.length} pass(es), height=${hydrationReport.final_scroll_height}, images=${hydrationReport.final_image_count}`);

      // Give known still-empty feature-app shells a bounded second chance.
      const featureAppReport = await page.evaluate(waitForFeatureAppMountsForCapture as any, {
        shellSelectors: profile.featureAppShellSelectors,
        mountWaitMs: profile.hydration.mountWaitMs,
      }) as CaptureFeatureAppMountReport;
      console.log(`[PageCapturer] Feature apps: checked=${featureAppReport.checked}, recovered=${featureAppReport.recovered}, stillEmpty=${featureAppReport.still_empty.length}`);
```

3h. After the DOM-quiet wait (:1991–1992) and before `materializePseudoElementTextForCapture`, take the final measurements:

```ts
      const auditSnapshot = await page.evaluate(() => ({
        scroll_height: Math.max(
          Number(document.documentElement?.scrollHeight ?? 0),
          Number(document.body?.scrollHeight ?? 0),
        ),
        image_count: document.querySelectorAll('img').length,
      })) as { scroll_height: number; image_count: number };
```

3i. Find where `captureDom` returns the evaluated `result` (the `const result = await page.evaluate(() => { ... })` at :1999 — search for its `return result` / final usage near the end of the method) and attach the audit immediately before returning:

```ts
      result.audit = {
        captured_scroll_height: auditSnapshot.scroll_height,
        dom_image_count: auditSnapshot.image_count,
        hydration_status: hydrationReport.status,
        hydration_passes: hydrationReport.passes,
        shells_checked: featureAppReport.checked,
        shells_recovered: featureAppReport.recovered,
        empty_shells: featureAppReport.still_empty,
      };
```

(If `result` is typed from the evaluate return, cast: `(result as DomCaptureResult).audit = { ... }`.)

- [ ] **Step 4: Run the full capturer suite**

Run: `npx vitest run src/design/page-capturer.test.ts`
Expected: PASS — wiring test green with new order; all pre-existing suites (including `sweepCaptureScrollForCapture`) still green.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/page-capturer.ts src/design/page-capturer.test.ts src/design/capture-completeness.ts
git commit -m "feat(capture): paced hydration + capture audit in captureDom"
```

---

### Task 6: Fail-loud gate in captureModelPage

**Files:**
- Modify: `src/design/page-capturer.ts` (`PageCaptureResult` :26; `captureModelPage` after the initial-document merge :1721–1728)
- Modify: `src/design/capture-diagnostics.ts` (add `readLastGoodCapturedHeight` — the record field it reads is added in Task 7; add the single field `captured_scroll_height?: number` to `CaptureDiagnosticsRecord` in THIS task so it compiles; Task 7 adds the rest)
- Test: `src/design/page-capturer.test.ts`

**Interfaces:**
- Consumes: Task 3 gate, Task 4 profiles, Task 5 audit.
- Produces (used by Task 7 and by pipeline/route error surfaces):
  - `PageCaptureResult` gains: `capture_audit?: CaptureAudit; completeness?: CaptureCompletenessVerdict; suggested_backend?: CaptureBackend;`
  - `export async function readLastGoodCapturedHeight(r2Bucket: R2Bucket, oemId: OemId | string, modelSlug: string): Promise<number | undefined>` in `capture-diagnostics.ts`
  - Gate-failure `error` string starts with `"Capture completeness gate failed: "`.

- [ ] **Step 1: Write the failing tests**

Add to `page-capturer.test.ts`. These stub the private `captureDom` on an instance — the established way to unit-test `captureModelPage` without a browser:

```ts
function fakeBrowserCapture(audit?: any) {
  const body = Array.from({ length: 80 }, (_, index) => `<p>VW Amarok capture paragraph ${index}</p>`).join('')
  return {
    html: `<main><h1>Amarok</h1>${body}</main>`,
    stylesheetLinks: ['<link rel="stylesheet" href="https://www.volkswagen.com.au/site.css">'],
    imageUrls: [],
    heroUrl: '',
    title: 'Amarok',
    elementCount: 90,
    viewport: { width: 1440, height: 1080 },
    audit,
  }
}

describe('captureModelPage completeness gate', () => {
  it('refuses to publish when feature-app shells never mounted, and suggests the next backend', async () => {
    const { bucket, writes, browser } = createMemoryBucket()
    const capturer = new PageCapturer({ r2Bucket: bucket as any, browser })
    ;(capturer as any).captureDom = async () => fakeBrowserCapture({
      captured_scroll_height: 6000,
      dom_image_count: 30,
      hydration_status: 'stable',
      hydration_passes: [],
      shells_checked: 3,
      shells_recovered: 1,
      empty_shells: ['[class*="CmsFeatureAppLoader"] [0]', '[class*="CmsFeatureAppLoader"] [2]'],
    })
    ;(capturer as any).fetchInitialDocumentCapture = async () => ({ headParts: [] })

    const result = await capturer.captureModelPage('toyota-au' as any, 'rav4', 'https://www.toyota.com.au/rav4')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Capture completeness gate failed')
    expect(result.error).toContain('never mounted')
    expect(result.suggested_backend).toBe('scrapling-stealth')
    expect(result.capture_audit?.empty_shells).toHaveLength(2)
    expect(writes.size).toBe(0)
  })

  it('publishes when the gate passes and reports the verdict', async () => {
    const { bucket, writes, browser } = createMemoryBucket()
    const capturer = new PageCapturer({ r2Bucket: bucket as any, browser })
    ;(capturer as any).captureDom = async () => fakeBrowserCapture({
      captured_scroll_height: 16000,
      dom_image_count: 100,
      hydration_status: 'stable',
      hydration_passes: [],
      shells_checked: 2,
      shells_recovered: 2,
      empty_shells: [],
    })
    ;(capturer as any).fetchInitialDocumentCapture = async () => ({ headParts: [] })
    ;(capturer as any).downloadImages = async () => new Map()

    const result = await capturer.captureModelPage('toyota-au' as any, 'rav4', 'https://www.toyota.com.au/rav4')

    expect(result.success).toBe(true)
    expect(result.completeness?.passed).toBe(true)
    expect(result.capture_audit?.captured_scroll_height).toBe(16000)
    expect(writes.size).toBeGreaterThan(0)
  })

  it('lets auditless external-html captures pass through the gate', async () => {
    const { bucket, browser } = createMemoryBucket()
    const capturer = new PageCapturer({ r2Bucket: bucket as any, browser })
    ;(capturer as any).downloadImages = async () => new Map()

    const result = await capturer.captureModelPage('mitsubishi-au' as any, 'asx', 'https://www.mitsubishi-motors.com.au/asx', 'ASX', {
      backend: 'external-html',
      externalCapture: { html: externalHtmlPage() },
    })

    expect(result.success).toBe(true)
    expect(result.completeness?.passed).toBe(true)
    expect(result.completeness?.reasons[0]).toContain('gate skipped')
  })
})
```

Note: `createMemoryBucket().bucket.get()` returns `null`, so `readLastGoodCapturedHeight` resolves `undefined` in these tests — the height-regression rule is exercised in Task 3's unit tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/design/page-capturer.test.ts -t "completeness gate"`
Expected: FAIL — `suggested_backend`/`completeness` undefined, gate not applied.

- [ ] **Step 3: Implement**

3a. Extend `PageCaptureResult` (:26):

```ts
export interface PageCaptureResult {
  success: boolean;
  page?: VehicleModelPage;
  r2_key?: string;
  capture_time_ms: number;
  capture_backend?: CaptureBackend;
  elements_captured?: number;
  images_uploaded?: number;
  html_size_kb?: number;
  bot_blocked?: boolean;
  capture_audit?: CaptureAudit;
  completeness?: CaptureCompletenessVerdict;
  suggested_backend?: CaptureBackend;
  error?: string;
}
```

Add imports to `page-capturer.ts`:

```ts
import { evaluateCaptureCompleteness, type CaptureCompletenessVerdict } from './capture-completeness';
import { readLastGoodCapturedHeight } from './capture-diagnostics';
```

(`capture-diagnostics.ts` already imports types from `page-capturer.ts` — type-only, so no runtime cycle.)

3b. In `capture-diagnostics.ts`, add `captured_scroll_height?: number;` to `CaptureDiagnosticsRecord` and append:

```ts
/** Height of the most recent successful capture — the completeness gate's regression baseline. */
export async function readLastGoodCapturedHeight(
  r2Bucket: R2Bucket,
  oemId: OemId | string,
  modelSlug: string,
): Promise<number | undefined> {
  const diagnostics = await readCaptureDiagnostics(r2Bucket, oemId, modelSlug);
  if (!diagnostics) return undefined;
  const lastGood = [diagnostics.latest, ...diagnostics.history]
    .find(record => record?.status === 'ok' && Number(record.captured_scroll_height ?? 0) > 0);
  return lastGood?.captured_scroll_height;
}
```

3c. In `captureModelPage`, after the initial-document merge block (:1721–1728) and before the `console.log('[PageCapturer] Captured via ...')`, insert:

```ts
      const captureAudit = 'audit' in capture ? capture.audit : undefined;
      const lastGoodScrollHeight = await readLastGoodCapturedHeight(this.r2Bucket, oemId, modelSlug);
      const completeness = evaluateCaptureCompleteness(
        { audit: captureAudit, lastGoodScrollHeight },
        profile.completeness,
      );
      if (!completeness.passed) {
        const suggestedBackend = profile.backendOrder.find(candidate => candidate !== backend);
        console.warn(`[PageCapturer] Completeness gate FAILED for ${oemId}/${modelSlug}: ${completeness.reasons.join('; ')}`);
        return {
          success: false,
          capture_time_ms: Date.now() - startTime,
          capture_backend: backend,
          capture_audit: captureAudit,
          completeness,
          suggested_backend: suggestedBackend,
          error: `Capture completeness gate failed: ${completeness.reasons.join('; ')}${suggestedBackend ? ` — suggested fallback backend: ${suggestedBackend}` : ''}`,
        };
      }
```

(`profile` is in scope from Task 5 step 3f. Note the initial-document merge may replace the browser capture with the SSR document, which has no audit — the gate then passes through with the "gate skipped" reason. That is intentional: the SSR document is only preferred when it is *richer* than the browser render.)

3d. Find the success return of `captureModelPage` (the `return { success: true, ...` after the R2 writes, ~:1840–1870) and add the two fields:

```ts
        capture_audit: captureAudit,
        completeness,
```

- [ ] **Step 4: Run the suite**

Run: `npx vitest run src/design/page-capturer.test.ts`
Expected: PASS — including the pre-existing `external-html capture backend` suite (its result now carries a `completeness` verdict, which no existing assertion rejects).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/page-capturer.ts src/design/page-capturer.test.ts src/design/capture-diagnostics.ts
git commit -m "feat(capture): fail-loud completeness gate before publish"
```

---

### Task 7: Audit fields in capture diagnostics

**Files:**
- Modify: `src/design/capture-diagnostics.ts` (`CaptureDiagnosticsRecord` :19; `buildDiagnosticsRecord` :55)
- Test: `src/design/capture-diagnostics.test.ts` (exists — extend)

**Interfaces:**
- Consumes: `PageCaptureResult.capture_audit` / `.completeness` / `.suggested_backend` from Task 6.
- Produces: `CaptureDiagnosticsRecord` gains `dom_image_count?`, `hydration_status?`, `empty_shell_count?`, `empty_shells?` (capped at 10), `completeness_passed?`, `completeness_reasons?` (capped at 5), `suggested_backend?` (plus `captured_scroll_height?` from Task 6). Every existing `recordCaptureDiagnostics` call site picks these up automatically because the record is built by `buildDiagnosticsRecord`.

- [ ] **Step 1: Write the failing test**

Add to `src/design/capture-diagnostics.test.ts` (match its existing import style):

```ts
describe('buildDiagnosticsRecord capture audit fields', () => {
  it('maps audit, completeness verdict and suggested backend onto the record', () => {
    const record = buildDiagnosticsRecord({
      oemId: 'volkswagen-au',
      modelSlug: 'amarok',
      sourceUrl: 'https://www.volkswagen.com.au/en/models/amarok.html',
      capturedAt: '2026-07-04T00:00:00.000Z',
      result: {
        success: false,
        capture_time_ms: 95000,
        capture_backend: 'cloudflare-browser',
        error: 'Capture completeness gate failed: 2 feature-app shell(s) never mounted',
        capture_audit: {
          captured_scroll_height: 6000,
          dom_image_count: 31,
          hydration_status: 'stable',
          hydration_passes: [{ pass: 1, scroll_height: 6000, image_count: 31, elapsed_ms: 40000 }],
          shells_checked: 3,
          shells_recovered: 1,
          empty_shells: Array.from({ length: 12 }, (_, index) => `.shell [${index}]`),
        },
        completeness: { passed: false, reasons: ['2 feature-app shell(s) never mounted'] },
        suggested_backend: 'scrapling-stealth',
      } as any,
    })

    expect(record.status).toBe('error')
    expect(record.captured_scroll_height).toBe(6000)
    expect(record.dom_image_count).toBe(31)
    expect(record.hydration_status).toBe('stable')
    expect(record.empty_shell_count).toBe(12)
    expect(record.empty_shells).toHaveLength(10)
    expect(record.completeness_passed).toBe(false)
    expect(record.completeness_reasons).toEqual(['2 feature-app shell(s) never mounted'])
    expect(record.suggested_backend).toBe('scrapling-stealth')
  })

  it('leaves audit fields undefined when the capture had no audit', () => {
    const record = buildDiagnosticsRecord({
      oemId: 'mitsubishi-au',
      modelSlug: 'asx',
      sourceUrl: 'https://www.mitsubishi-motors.com.au/asx',
      capturedAt: '2026-07-04T00:00:00.000Z',
      result: { success: true, capture_time_ms: 1200, capture_backend: 'external-html' } as any,
    })

    expect(record.captured_scroll_height).toBeUndefined()
    expect(record.hydration_status).toBeUndefined()
    expect(record.empty_shell_count).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/capture-diagnostics.test.ts`
Expected: FAIL — new fields undefined / not on the type.

- [ ] **Step 3: Implement**

Extend `CaptureDiagnosticsRecord` (after `images_uploaded?`):

```ts
  captured_scroll_height?: number;
  dom_image_count?: number;
  hydration_status?: string;
  empty_shell_count?: number;
  /** First 10 unmounted shell selectors — enough to diagnose without bloating the record. */
  empty_shells?: string[];
  completeness_passed?: boolean;
  completeness_reasons?: string[];
  suggested_backend?: string;
```

In `buildDiagnosticsRecord`, before the `return`, add `const audit = result.capture_audit;` and extend the returned object:

```ts
    captured_scroll_height: audit?.captured_scroll_height,
    dom_image_count: audit?.dom_image_count,
    hydration_status: audit?.hydration_status,
    empty_shell_count: audit ? audit.empty_shells.length : undefined,
    empty_shells: audit?.empty_shells.slice(0, 10),
    completeness_passed: result.completeness?.passed,
    completeness_reasons: result.completeness?.reasons?.slice(0, 5),
    suggested_backend: result.suggested_backend,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/capture-diagnostics.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/capture-diagnostics.ts src/design/capture-diagnostics.test.ts
git commit -m "feat(capture): persist capture audit in diagnostics"
```

---

### Task 8: Hydrate before section screenshots

**Files:**
- Modify: `src/design/page-capturer.ts` (`captureSectionScreenshots` :2533, insert after the `page.goto` + 3s wait at :2560–2561)
- Test: `src/design/page-capturer.test.ts`

**Interfaces:**
- Consumes: Task 1 sweep, existing `activateLazyMediaForCapture`.
- Produces: nothing new — section screenshots simply measure a hydrated page.

- [ ] **Step 1: Write the failing wiring test**

```ts
describe('PageCapturer section screenshot hydration wiring', () => {
  it('activates lazy media and runs a hydration sweep before measuring sections', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const sectionMethod = source.indexOf('async captureSectionScreenshots(')
    const sectionGoto = source.indexOf('await page.goto(sourceUrl', sectionMethod)
    const sectionLazy = source.indexOf('page.evaluate(activateLazyMediaForCapture as any)', sectionMethod)
    const sectionSweep = source.indexOf('page.evaluate(runPacedHydrationSweepForCapture as any', sectionMethod)
    const sectionMeasure = source.indexOf('page.evaluate((sel: string)', sectionMethod)

    expect(sectionMethod).toBeGreaterThan(-1)
    expect(sectionGoto).toBeGreaterThan(sectionMethod)
    expect(sectionLazy).toBeGreaterThan(sectionGoto)
    expect(sectionSweep).toBeGreaterThan(sectionLazy)
    expect(sectionMeasure).toBeGreaterThan(sectionSweep)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/page-capturer.test.ts -t "section screenshot hydration"`
Expected: FAIL — `sectionLazy`/`sectionSweep` are `-1` within the method.

- [ ] **Step 3: Implement**

In `captureSectionScreenshots`, immediately after the bot check block (:2565–2568), insert:

```ts
      // Hydrate before measuring sections — same helpers as the main capture
      // path with a reduced budget (screenshots tolerate a partial tail).
      await page.evaluate(activateLazyMediaForCapture as any);
      const sectionHydration = await page.evaluate(runPacedHydrationSweepForCapture as any, {
        budgetMs: 20_000,
        stepDelayMs: CAPTURE_HYDRATION_STEP_DELAY_MS,
        mountWaitMs: 2_000,
        stabilityPct: CAPTURE_HYDRATION_STABILITY_PCT,
        maxPasses: 2,
      }) as CaptureHydrationReport;
      console.log(`[PageCapturer] Section screenshot hydration: ${sectionHydration.status}`);
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run src/design/page-capturer.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/page-capturer.ts src/design/page-capturer.test.ts
git commit -m "feat(capture): hydrate page before section screenshots"
```

---

### Task 9: Full verification and live M1 exit measurement

**Files:** none created — verification only.

- [ ] **Step 1: Full test suite + typecheck**

```bash
npm run typecheck
npx vitest run src/design/
```
Expected: all green. If any non-capture suite broke, fix before proceeding.

- [ ] **Step 2: Rebuild the knowledge graph (project rule after code changes)**

```bash
$(cat graphify-out/.graphify_python) -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

- [ ] **Step 3: Commit any graph delta, push**

```bash
git add graphify-out && git diff --cached --quiet || git commit -m "chore(graphify): refresh after capture changes"
git push origin main
```

- [ ] **Step 4: Deploy the worker**

Check `wrangler.toml` at repo root for the worker config, then:

```bash
npx wrangler deploy
```
Expected: deploy succeeds. (This is the WORKER — capture runs there. The dashboard Pages deploy is unrelated to M1.)

- [ ] **Step 5: Trigger a VW Amarok rebuild and watch the compile status**

Trigger the compile via the dashboard's "Rebuild Full Preview" button on the Amarok page (or the admin compile route with a minted JWT — see memory note `oem-agent-cron-architecture`). Then:

- Watch `GET /admin/compile-status/volkswagen-au/amarok` until `succeeded` or `failed`.
- Expect a MUCH longer `capturing` stage (up to ~2–3 min — the VW profile allows a 120s hydration budget).
- If it fails with `Capture completeness gate failed`, that is the gate working — read the reasons (they name the unmounted shells), and check `pages/diagnostics/volkswagen-au/amarok/latest.json` (remember: `wrangler r2 object get` needs `--remote`). Tune the VW profile (budget/mountWaitMs/selectors) rather than weakening the gate.

- [ ] **Step 6: Measure the M1 exit criteria**

```bash
pnpm qa:preview -- --slug volkswagen-au-amarok --require-text Amarok --require-text 'Ready to get behind' --min-font-faces 10 --max-broken-images 0
pnpm qa:fidelity -- --source-url https://www.volkswagen.com.au/en/models/amarok.html --slug volkswagen-au-amarok --viewports desktop --settle-ms 7000 --fail-on none --json
```

Exit criteria (spec §9 M1): preview page height ≥95% of source (source was 16,215px — expect ≥~15,400px vs the old 5,955px) and preview image count ≥90% of source. Record the numbers. Fidelity *score* is expected to rise substantially but is NOT the M1 gate (dynamic-module parity is M2/M3).

- [ ] **Step 7: Audit the other three brands (M1 exit: "captures audited")**

Trigger a rebuild for one fixture page each on toyota-au, mitsubishi-au, ford-au (pick the fixture pages if not already chosen — one product/vehicle page per brand) and confirm each writes a diagnostics record containing `captured_scroll_height`, `hydration_status`, and `completeness_passed`. They do NOT need to pass the VW-level thresholds in M1 — they need honest audits.

- [ ] **Step 8: Report**

Summarize: before/after height + image counts for VW, gate verdicts for all four brands, any profile tuning applied, and open issues feeding M2.
