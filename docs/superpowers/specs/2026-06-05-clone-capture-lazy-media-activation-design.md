# Clone Capture Lazy Media Activation Design

## Context

Clone capture now waits for fonts, images, DOM quiet, pseudo-elements, stylesheet attributes, and uses an adaptive scroll sweep. The remaining early lazy-media gap is in Phase 0 of `PageCapturer.captureDom()`.

Before scrolling, Phase 0 assigns lazy image attributes only when the value already starts with `http`. Many OEM pages use root-relative values such as `/-/media/model/hero.jpg`, protocol-relative values, or relative `data-srcset` entries. Those URLs are later normalized during DOM serialization, but that happens after the scroll sweep and image readiness wait. The browser may not fetch or decode those media assets before capture freezes the page.

This slice moves lazy-media activation into a testable helper that resolves relative URLs before scrolling.

## Goals

- Activate common lazy image source attributes before the adaptive scroll sweep.
- Resolve root-relative, relative, protocol-relative, `data:`, `blob:`, and absolute URLs consistently against `document.location.href`.
- Normalize `data-srcset` values before the image readiness wait.
- Apply `data-bg` and `data-background-image` background images before the scroll sweep.
- Force images with `loading="lazy"` to eager before scrolling.
- Keep serialization-time lazy-media normalization as a fallback.
- Log a compact activation count for capture diagnostics.
- Cover helper behavior and capture ordering with tests.

## Non-Goals

- No changes to R2 asset downloading.
- No changes to image readiness, font readiness, DOM quiet, pseudo-element materialization, or stylesheet preservation.
- No video source activation in this slice.
- No network interception or JavaScript revival.
- No removal of the later Phase B3 lazy-media fallback in the DOM serializer.

## Design

Add a browser-safe exported helper in `src/design/page-capturer.ts`:

```ts
export type CaptureLazyMediaActivationResult = {
  imageSources: number;
  sourceSets: number;
  backgrounds: number;
  eagerImages: number;
};

export function activateLazyMediaForCapture(options?: {
  doc?: {
    location?: { href?: string; origin?: string };
    querySelectorAll?: (selector: string) => ArrayLike<any>;
  };
}): CaptureLazyMediaActivationResult
```

At runtime the helper uses `document`. Tests can pass a small fake document object.

Behavior:

- Resolve URLs with an internal `abs()` helper:
  - empty values stay empty
  - `http`, `data:`, and `blob:` values pass through
  - `//cdn.example/a.jpg` becomes `https://cdn.example/a.jpg`
  - relative and root-relative values are resolved with `new URL(value, document.location.href)`
- For each `img`, read the first available attribute from:
  `data-src`, `data-lazy-src`, `data-original`, `data-lazy`, `data-image-src`.
- Assign the resolved value to `img.src`, remove the source attribute, and increment `imageSources`.
- Set `img.loading = 'eager'` when it was `lazy`, and increment `eagerImages`.
- For `img[data-srcset]` and `source[data-srcset]`, normalize each srcset candidate URL while preserving descriptors, set `srcset`, remove `data-srcset`, and increment `sourceSets`.
- For `[data-bg]` and `[data-background-image]`, set `style.backgroundImage = url("<absolute-url>")`, remove the source attribute, and increment `backgrounds`.

Wire it in `captureDom()` immediately after hidden tab/accordion activation and before the existing 500ms DOM-settle delay, adaptive scroll sweep, image readiness, font readiness, DOM quiet, and pseudo-element materialization. Log:

```ts
console.log(`[PageCapturer] Lazy media activation: images=${lazyMediaActivation.imageSources}, srcsets=${lazyMediaActivation.sourceSets}, backgrounds=${lazyMediaActivation.backgrounds}, eager=${lazyMediaActivation.eagerImages}`);
```

The existing Phase B3 lazy-media normalization inside the final DOM serialization remains unchanged. It continues to catch any lazy attributes missed by Phase 0, but it no longer has to be the first point where common relative lazy image URLs become absolute.

## Testing

Add tests in `src/design/page-capturer.test.ts`:

- Resolves relative `data-src` on `img`, removes the lazy attribute, and counts the image source activation.
- Normalizes relative `data-srcset` on `img` and `source`, preserving descriptors.
- Resolves `data-bg` and `data-background-image` into absolute CSS background URLs.
- Forces lazy images to eager and counts only images that were actually lazy.
- Verifies source ordering: `activateLazyMediaForCapture` runs before `sweepCaptureScrollForCapture`, which still runs before image/font/DOM readiness and pseudo-element materialization.

Use TDD: add failing tests first, verify they fail for missing export/wiring or old relative-url behavior, then implement the helper and wiring.

## Risk

The main risk is changing URL assignment earlier in capture. The helper only acts on explicit lazy-media attributes and uses the same browser URL resolution semantics that the serializer already relies on. It also leaves the later serialization fallback in place, so missed attributes still have a second chance to normalize before persistence.

Another risk is accidentally referencing module-scope helpers from a function serialized into `page.evaluate`. Keep every helper used by `activateLazyMediaForCapture()` inside the function body.
