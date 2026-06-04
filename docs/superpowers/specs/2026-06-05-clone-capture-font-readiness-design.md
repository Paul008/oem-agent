# Clone Capture Font Readiness Design

## Goal

Reduce clone-capture layout drift caused by late web-font loads.

## Approach

Before serializing the browser DOM, wait briefly for `document.fonts.ready` when the browser supports it. The wait is bounded by a small timeout so a stalled font request cannot hang the capture job.

## Behavior

- If `document.fonts.ready` resolves before the timeout, capture continues with status `ready`.
- If it does not resolve within `2500ms`, capture continues with status `timeout`.
- If the browser does not expose `document.fonts.ready`, capture continues with status `unsupported`.
- The wait runs after lazy-load scroll/image settle and before pseudo-element text materialization.

## Scope

Included:
- Cloudflare browser capture path.
- A browser-safe helper that can be serialized into `page.evaluate()`.
- Focused helper tests and source-level wiring test.

Excluded:
- Font metric overrides such as `size-adjust`, `ascent-override`, or `descent-override`.
- Downloading or rewriting font files.
- External HTML capture font inference.

## Safety

The helper does not mutate the DOM. It only awaits browser font readiness with a timeout.
