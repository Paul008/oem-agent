# Clone Capture Stylesheet Link Attributes Design

## Problem

Clone Studio can now preserve original captured head parts after body-only edits, but Worker clone capture still normalizes stylesheet links down to only `rel` and `href`. Useful safe attributes such as `media`, `crossorigin`, `integrity`, and `referrerpolicy` are dropped before the dashboard ever receives the clone HTML.

This can change how OEM stylesheets load. A stylesheet with `media="screen and (min-width: 1024px)"` or a CDN stylesheet with `crossorigin="anonymous"` should keep those attributes in the captured clone head.

## Goals

- Preserve safe attributes on captured stylesheet `<link>` tags:
  - `media`
  - `crossorigin`
  - `integrity`
  - `referrerpolicy`
- Continue absolutizing stylesheet `href` values.
- Keep `stylesheet_urls` as a URL-only list for compatibility.
- Keep non-stylesheet links, scripts, preload, preconnect, and inline style capture out of scope.
- Preserve attributes in both external HTML capture and in-browser Worker DOM capture.

## Non-Goals

- Do not preserve arbitrary link attributes.
- Do not change Clone Studio dashboard head sanitization.
- Do not add a new persisted metadata field.
- Do not change image, font, or media download behavior.

## Design

Update `stylesheetLinkTag(input, sourceUrl)` in `src/design/page-capturer.ts` so that, when `input` is an original `<link>` tag, it:

- extracts and absolutizes `href`,
- emits normalized `rel="stylesheet"` and normalized absolute `href`,
- copies only the safe optional attributes listed above,
- escapes all emitted attribute values.

For browser capture, collect `document.querySelectorAll('link[rel~="stylesheet"]')` before falling back to `document.styleSheets`. Serializing DOM link elements first lets capture keep the original safe attributes. `document.styleSheets` remains a fallback for stylesheet hrefs that do not have a corresponding link element.

The persisted `content.modes.clone.stylesheet_urls` list remains derived from `extractStylesheetHref()` and therefore stays URL-only.

## Testing

- Unit-test external HTML capture preserves the safe attributes on stylesheet links while absolutizing `href`.
- Unit-test unsafe or unrelated attributes are not preserved.
- Source-level test browser capture collects link elements before `document.styleSheets` fallback and serializes safe attributes from the DOM link.
- Existing clone capture, typecheck, and Worker deploy verification must pass.

## Risks

- Attribute order changes can break brittle tests, so tests should assert complete expected tags for external capture and source-order only where needed for browser capture.
- Preserving `integrity` may make a stylesheet fail if the OEM changes the asset while keeping the same URL. That is the browser’s intended behavior and preserving it is more faithful than silently dropping it.

## Acceptance Criteria

- External capture returns stylesheet tags with safe attributes preserved.
- Browser capture code serializes safe attributes from real stylesheet link elements.
- URL-only `stylesheet_urls` output remains unchanged.
- Worker tests, TypeScript check, deploy, and live Worker probe succeed.
