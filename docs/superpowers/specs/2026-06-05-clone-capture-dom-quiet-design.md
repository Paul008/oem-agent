# Clone Capture DOM Quiet Design

## Context

Clone capture now resolves lazy media, scrolls the page, waits for image decode readiness, waits for font readiness, materializes pseudo-element text, and then serializes the DOM. This covers several static fidelity gaps, but OEM page scripts can still be mutating tabs, carousels, reveal states, badges, and text content while capture freezes the page.

This slice adds a bounded DOM quiet gate before serialization. It does not re-run or preserve OEM scripts in the saved clone.

## Goals

- Wait briefly for post-scroll DOM mutations to settle before pseudo-element materialization and DOM serialization.
- Keep the wait bounded so noisy pages cannot hang clone capture.
- Expose a simple readiness status in logs for capture diagnostics.
- Cover the helper and capture ordering with tests.

## Non-Goals

- No JavaScript revival in cloned pages.
- No carousel or tab component reconstruction.
- No responsive multi-width capture.
- No changes to lazy-media source normalization or R2 asset downloads.
- No removal of existing image and font readiness gates.

## Design

Add `CAPTURE_DOM_QUIET_WINDOW_MS`, `CAPTURE_DOM_QUIET_TIMEOUT_MS`, and `waitForCaptureDomQuietForCapture()` in `src/design/page-capturer.ts`, near the existing capture readiness helpers.

The helper accepts optional dependencies for tests. At runtime it uses `document.body` and `MutationObserver`.

Behavior:

- Return `unsupported` when no target node or `MutationObserver` constructor is available.
- Observe child-list, subtree, attribute, and character-data mutations.
- Resolve `quiet` after the target has had no observed mutations for the quiet window.
- Restart the quiet timer whenever a mutation arrives.
- Resolve `timeout` when the hard timeout is reached first.
- Disconnect the observer and clear timers on every exit path.

Wire the helper in `captureDom()` after font readiness and before `materializePseudoElementTextForCapture()`. Log the returned status as `[PageCapturer] DOM quiet: <status>`.

## Testing

Add tests in `src/design/page-capturer.test.ts`:

- Resolves `quiet` when no mutations arrive during the quiet window.
- Resolves `timeout` when mutations keep arriving until the hard timeout.
- Resolves `unsupported` when the target or observer constructor is missing.
- Verifies source ordering: image readiness, then font readiness, then DOM quiet, then pseudo-element materialization.

Use TDD: add tests first, verify they fail for missing exports or missing wiring, then implement the helper and wiring.

## Risk

The main risk is extra clone latency on pages that continually mutate. The hard timeout caps the delay at 1.5 seconds, and the quiet window is only 250ms, so settled pages move quickly while noisy pages still continue predictably. This gate improves capture timing but does not guarantee all JS-driven UI states are recoverable after scripts are stripped.
