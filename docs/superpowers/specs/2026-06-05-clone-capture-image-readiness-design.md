# Clone Capture Image Readiness Design

## Context

Clone capture currently activates hidden content, resolves common lazy-image attributes, scrolls through the page, waits a fixed 2 seconds, waits for fonts, materializes pseudo-element text, then serializes the DOM. The fixed image wait is useful, but it can still serialize before late image decodes finish on slower OEM pages.

This slice adds a bounded browser-side image readiness gate. It does not change lazy-source normalization, asset downloading, section conversion, or preview editing.

## Goals

- Preserve the existing lazy-media activation and fixed post-scroll wait.
- Add a deterministic image decode wait before font readiness and DOM serialization.
- Keep captures bounded so broken or slow images cannot hang page cloning.
- Expose a simple readiness status in logs for capture diagnostics.
- Cover the helper and capture ordering with tests.

## Non-Goals

- No responsive multi-width capture.
- No JavaScript revival for interactive components.
- No changes to R2 asset download logic.
- No changes to standalone preview editing behavior.
- No removal of the existing fixed post-scroll wait.

## Design

Add `CAPTURE_IMAGE_READY_TIMEOUT_MS` and `waitForCaptureImagesForCapture()` in `src/design/page-capturer.ts`, near the existing font readiness helper.

The helper accepts an optional document-like object for tests. At runtime it uses `document.images`.

Behavior:

- Return `unsupported` when no image collection is available.
- Return `no-images` when the collection exists but is empty.
- For images with a usable `decode()` function and `complete !== true`, wait for decode promises to settle.
- Treat decode failures as settled; a broken image should not block capture.
- Race the decode wait against a short timeout and return `timeout` when exceeded.
- Return `ready` when there is nothing pending or pending decodes settle before the timeout.

Wire the helper in `captureDom()` after the existing 2 second post-scroll wait and before `waitForCaptureFontsForCapture()`. Log the returned status as `[PageCapturer] Image readiness: <status>`.

## Testing

Add tests in `src/design/page-capturer.test.ts`:

- Resolves `ready` when pending image decodes settle.
- Resolves `timeout` when a pending decode never settles.
- Resolves `no-images` for an empty image collection.
- Resolves `unsupported` when no image collection is available.
- Verifies source ordering: image readiness runs before font readiness, which still runs before pseudo-element materialization.

Use TDD: add tests first, verify they fail for missing exports/wiring, then implement the helper and wiring.

## Risk

The main risk is adding latency to clone capture. The timeout is capped at 3 seconds and only runs after the existing post-scroll wait, so it improves fidelity without introducing an unbounded wait. Calling `decode()` only for incomplete images limits extra work on pages whose image state is already settled.
