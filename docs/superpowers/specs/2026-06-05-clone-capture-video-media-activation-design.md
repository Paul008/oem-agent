# Clone Capture Video Media Activation Design

## Context

Clone capture now activates relative lazy image, srcset, and background URLs before the adaptive scroll sweep. Video media still follows the older pattern: `video[data-poster]`, relative `poster`, and `video source[data-src]` are normalized later during DOM serialization, after scroll and image readiness have already run.

That late fallback keeps persisted clone HTML usable, but it does not help the browser fetch poster assets or expose video sources before capture waits for media readiness and serializes the page.

This slice extends the existing pre-scroll lazy media activation helper to cover video poster and source attributes.

## Goals

- Resolve `video[data-poster]` and relative `video[poster]` before the adaptive scroll sweep.
- Resolve `source[data-src]` elements inside videos before the adaptive scroll sweep.
- Remove consumed `data-poster` and `data-src` attributes.
- Count `videoPosters` and `videoSources` in the lazy media activation diagnostic result.
- Preserve existing video autoplay/muted/playsinline/loop setup in the serializer.
- Keep the later Phase B3 video fallback in place.
- Cover helper behavior and diagnostic logging with tests.

## Non-Goals

- No changes to R2 media download rules.
- No changes to video autoplay/muted/playsinline/loop setup.
- No attempt to preload, decode, or play videos.
- No network interception or JavaScript revival.
- No changes to image, srcset, background, font, DOM quiet, pseudo-element, or stylesheet gates.

## Design

Extend `CaptureLazyMediaActivationResult` in `src/design/page-capturer.ts`:

```ts
export type CaptureLazyMediaActivationResult = {
  imageSources: number;
  sourceSets: number;
  backgrounds: number;
  eagerImages: number;
  videoSources: number;
  videoPosters: number;
};
```

Extend `activateLazyMediaForCapture()` with one new video block after background activation:

- Query `video`.
- For each `source` child, read `data-src`.
- Resolve `data-src` through the helper-local `abs()` function.
- Assign `source.src` and `source.setAttribute('src', resolvedSrc)` when available.
- Remove `data-src` and increment `videoSources`.
- Read `data-poster` first, otherwise read `poster`.
- Resolve the poster URL through `abs()`.
- Assign `video.poster` and `video.setAttribute('poster', resolvedPoster)` when available.
- Remove `data-poster` when consumed and increment `videoPosters`.

Update the existing capture log to include video counts:

```ts
console.log(`[PageCapturer] Lazy media activation: images=${lazyMediaActivation.imageSources}, srcsets=${lazyMediaActivation.sourceSets}, backgrounds=${lazyMediaActivation.backgrounds}, eager=${lazyMediaActivation.eagerImages}, videoSources=${lazyMediaActivation.videoSources}, videoPosters=${lazyMediaActivation.videoPosters}`);
```

The later Phase B3 DOM serializer remains unchanged. It still normalizes any video poster or source values missed by the pre-scroll activation helper.

## Testing

Add tests in `src/design/page-capturer.test.ts`:

- Resolves relative `video[data-poster]`, removes `data-poster`, and increments `videoPosters`.
- Resolves relative `video[poster]` and increments `videoPosters`.
- Resolves relative `source[data-src]` children inside a video, removes `data-src`, and increments `videoSources`.
- Verifies the capture code logs `videoSources` and `videoPosters` from `lazyMediaActivation`.

Use TDD: add failing tests first, verify they fail against the current helper/logging, then implement the new video fields and helper block.

## Risk

The risk is low because this only moves URL resolution earlier for explicit video lazy attributes that the serializer already handles later. The helper does not start playback, add preload attributes, or remove the existing fallback. The main implementation risk is accidentally referencing module-scope helpers from a function serialized into `page.evaluate`; keep every URL helper used by `activateLazyMediaForCapture()` inside the function body.
