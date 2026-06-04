# Clone Capture Viewport Metadata Design

## Context

DOM clone capture randomizes the desktop viewport width between 1440 and 1919 pixels as an anti-bot mitigation. The saved clone-mode metadata currently always records `{ width: 1440, height: 1080 }`, even when the DOM was captured at a wider viewport.

That mismatch makes clone metadata less trustworthy for preview, debugging, and future responsive fidelity work.

## Goals

- Preserve the existing randomized desktop capture width.
- Record the actual viewport used for DOM capture in clone-mode metadata.
- Keep external HTML capture deterministic with a 1440x1080 default unless a viewport is explicitly supplied.
- Cover the result shape and save-path wiring with tests.

## Non-Goals

- No change to the viewport randomization range.
- No multi-width responsive capture.
- No changes to screenshot capture or section screenshots.
- No dashboard preview behavior changes.
- No changes to anti-bot headers or user agent logic.

## Design

Extend `DomCaptureResult` with:

```ts
viewport: {
  width: number;
  height: number;
}
```

Extend `ExternalHtmlCaptureInput` with an optional `viewport` field of the same shape.

Runtime behavior:

- `captureDom()` already computes `viewportWidth` before `page.setViewport()`. Return `{ width: viewportWidth, height: 1080 }` with the captured DOM result.
- `buildDomCaptureFromHtml()` returns `input.viewport` when supplied.
- `buildDomCaptureFromHtml()` defaults to `{ width: 1440, height: 1080 }` when no external viewport is supplied.
- The clone-mode save call passes `capture.viewport` into `applyCloneMode()` instead of the hard-coded 1440x1080 metadata.

## Testing

Add tests in `src/design/page-capturer.test.ts`:

- External HTML capture defaults to `{ width: 1440, height: 1080 }`.
- External HTML capture preserves a supplied viewport.
- Source-level wiring verifies clone-mode persistence uses `viewport: capture.viewport` and no longer uses a hard-coded viewport in that call.

Use TDD: add tests first, verify they fail for missing viewport fields or missing wiring, then implement the result shape and save-path change.

## Risk

The risk is low because this changes metadata, not rendering. External captures without viewport data keep the previous default. Live DOM captures become more accurate because the saved metadata reflects the viewport that generated the serialized HTML.
