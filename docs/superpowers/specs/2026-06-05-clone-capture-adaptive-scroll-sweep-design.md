# Clone Capture Adaptive Scroll Sweep Design

## Context

Clone capture already activates hidden panels, resolves common lazy media attributes, performs a downward scroll sweep, waits for images, waits for fonts, waits for DOM quiet, materializes pseudo-element text, and then serializes the DOM.

The current scroll sweep measures `document.body.scrollHeight` once before scrolling. Some OEM pages append or reveal additional content as the browser approaches the bottom. When that happens, the original scroll target can become stale and capture may never visit newly appended lower content before image/font/DOM readiness starts.

This slice makes the pre-serialization scroll sweep adaptive while keeping it bounded.

## Goals

- Re-measure page height during the pre-capture scroll sweep.
- Continue scrolling when lazy-rendered content increases the page height.
- Return to the top before the existing post-scroll image/font/DOM readiness gates.
- Keep the sweep bounded by max steps and max elapsed time so noisy or infinite-scroll pages cannot hang capture.
- Log a simple sweep status for capture diagnostics.
- Cover the helper behavior and capture ordering with tests.

## Non-Goals

- No JavaScript revival in persisted clone HTML.
- No network interception or wait-for-network-idle changes.
- No responsive multi-width capture.
- No changes to lazy media source normalization.
- No changes to image, font, DOM quiet, pseudo-element, or stylesheet attribute gates.
- No attempt to exhaust true infinite-scroll feeds.

## Design

Add `CAPTURE_SCROLL_SWEEP_STEP_DELAY_MS`, `CAPTURE_SCROLL_SWEEP_FINAL_DELAY_MS`, `CAPTURE_SCROLL_SWEEP_TIMEOUT_MS`, and `CAPTURE_SCROLL_SWEEP_MAX_STEPS` constants in `src/design/page-capturer.ts`.

Add an exported browser-safe helper:

```ts
export async function sweepCaptureScrollForCapture(
  options?: {
    stepDelayMs?: number;
    finalDelayMs?: number;
    timeoutMs?: number;
    maxSteps?: number;
    win?: {
      innerHeight?: number;
      scrollY?: number;
      scrollTo?: (x: number, y: number) => void;
      setTimeout?: typeof setTimeout;
      Date?: Pick<typeof Date, 'now'>;
      document?: {
        body?: { scrollHeight?: number };
        documentElement?: { scrollHeight?: number };
      };
    };
  },
): Promise<'complete' | 'max-steps' | 'timeout' | 'unsupported'>
```

At runtime it uses `window` and `document`. Tests can pass a document-like/window-like object.

Behavior:

- Return `unsupported` when no window, document, scroll function, or usable viewport height exists.
- Use `max(document.documentElement.scrollHeight, document.body.scrollHeight)` for page height.
- Scroll in one-viewport steps.
- After each step, wait briefly, then re-measure height.
- If page height grows, continue toward the new bottom.
- Stop with `complete` once the sweep reaches the current bottom.
- Stop with `max-steps` after the configured step limit.
- Stop with `timeout` after the configured elapsed-time limit.
- Always scroll back to top and wait the final delay before returning.

Wire the helper in `PageCapturer.captureDom()` where the fixed `page.evaluate(async () => { ... scrollHeight ... })` sweep currently lives. Log `[PageCapturer] Scroll sweep: <status>`.

## Testing

Add tests in `src/design/page-capturer.test.ts`:

- Returns `complete` and scrolls back to top for a stable page.
- Continues beyond the initially measured page height when the fake page grows during the sweep.
- Returns `max-steps` when height keeps growing beyond the configured step limit.
- Returns `unsupported` when scrolling cannot run.
- Verifies source ordering: scroll sweep runs before image readiness, which runs before font readiness, DOM quiet, and pseudo-element materialization.

Use TDD: add failing tests first, verify they fail for missing export/wiring, then implement the helper and replace the fixed scroll block.

## Risk

The main risk is adding capture latency. The helper is bounded by both step count and elapsed time. Stable pages behave almost like the current sweep, while pages that expand during scrolling get a limited chance to expose lazy content before serialization.

Another risk is accidentally changing capture position before serialization. The helper always returns the viewport to the top before existing readiness gates, preserving the current downstream assumption that hero detection and serialization start from the top of the page.
