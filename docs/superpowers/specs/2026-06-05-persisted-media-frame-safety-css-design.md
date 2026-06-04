# Persisted Media Frame Safety CSS Design

## Context

Clone Studio injects CSS that clips document-level horizontal overflow and caps media elements to the desktop frame. Worker-generated clone HTML now persists reveal, desktop-image, and carousel safety CSS, but the document/media frame clamp still exists only in the dashboard wrapper.

This slice persists the frame and media constraints with Worker-generated clone HTML.

## Goals

- Persist document-level horizontal overflow clipping in Worker-generated clone HTML.
- Persist desktop-frame media caps for images, pictures, video, canvas, and SVG.
- Keep the existing Clone Studio wrapper CSS unchanged.
- Keep this safety layer separate from reveal/image and carousel safety CSS for readability and testing.
- Cover the CSS block and persistence wiring with tests.

## Non-Goals

- No responsive multi-width capture.
- No changes to dashboard preview behavior.
- No broad layout reset beyond document overflow and media frame constraints.
- No changes to image download, rewriting, or sanitization.
- No changes to section conversion.

## Design

Add an exported `CAPTURE_STATIC_MEDIA_FRAME_CSS` constant in `src/design/page-capturer.ts`.

The CSS should include:

- `html, body` constrained to `max-width: 100%` and `overflow-x: clip !important`.
- Desktop media selectors `img`, `picture`, `video`, `canvas`, and `svg` capped with `max-width: 100% !important`.
- `img` and `video` constrained with `height: auto !important`.

Add the constant to the Worker `overrideCss` array after `CAPTURE_STATIC_CAROUSEL_SAFETY_CSS`. Keep the existing basic reset string for backward compatibility.

## Testing

Add tests in `src/design/page-capturer.test.ts`:

- Assert `CAPTURE_STATIC_MEDIA_FRAME_CSS` contains the document selectors and overflow/max-width rules.
- Assert it contains media selectors and max-width rules.
- Assert it contains image/video height-auto rules.
- Source-level wiring test verifies the `overrideCss` array includes `CAPTURE_STATIC_MEDIA_FRAME_CSS` after `CAPTURE_STATIC_CAROUSEL_SAFETY_CSS` and before the assembled style tag.

Use TDD: add tests first, verify they fail for missing export/wiring, then implement the constant and include it in persistence.

## Risk

The risk is low because this persists CSS that the dashboard preview already applies. The selectors are limited to document overflow and common media elements. The behavioral change is that stored clone HTML is less likely to create horizontal scroll or oversized media outside Clone Studio.
