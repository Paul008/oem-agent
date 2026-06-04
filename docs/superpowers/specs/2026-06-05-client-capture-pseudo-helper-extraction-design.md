# Client Capture Pseudo Helper Extraction Design

Written 2026-06-05.

## Goal

Make the dashboard iframe pseudo-element capture rules directly unit-testable while keeping the injected Smart Capture script self-contained and minification-safe.

## Current State

`buildCaptureInjection()` currently embeds pseudo-element helpers directly inside its injected script string. Source-regression tests verify the helpers are present and wired, but the actual client-side normalization and style serialization behavior is not directly unit-tested. The backend `PageCapturer` has similar tests, but the dashboard iframe path owns separate code.

## Design

Create `dashboard/src/composables/capture-pseudo-elements.ts` exporting:

- `capturePseudoElementRules()`

The function returns an object with string-keyed helper methods:

- `normalizePseudoElementContentForCapture(content)`
- `pseudoElementInlineStyleForCapture(style)`
- `materializePseudoElementsForCapture(src, cln, includeStyle)`

Like `tailwindRules()`, `capturePseudoElementRules()` must remain self-contained because `use-capture-injection.ts` serializes it with `.toString()` into the iframe. Use inner helpers only, no module-scope references, no imports, and preserve returned object keys.

Update `use-capture-injection.ts` to inject:

```ts
var P=(${capturePseudoElementRules.toString()})();
```

Then call `P.materializePseudoElementsForCapture(el, clone, true|false)`.

## Tests

Add focused tests for:

- Quoted pseudo text normalization, including CSS escapes and rejected unsafe/non-text content.
- Conservative inline style serialization and unsafe character stripping.
- Source-regression coverage that `buildCaptureInjection()` injects `capturePseudoElementRules()` once and uses `P.materializePseudoElementsForCapture(...)`.

## Out of Scope

- Changing what pseudo content kinds are accepted.
- Reconstructing pseudo layout geometry.
- Changing backend `PageCapturer`.
- Changing Tailwind conversion rules.
