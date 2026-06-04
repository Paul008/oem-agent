# Clone Studio Preserve Head Styles Design

## Problem

Clone Studio builds iframe HTML from the current clone HTML. For unedited captures, the stored clone includes captured stylesheet links and inline safety/critical styles before the body. After a user edits and saves a clone, `edited_rendered` is body-only because Clone Studio intentionally serializes `document.body.innerHTML`. The next preview therefore loses any original safe head parts that were not recoverable from URL-only `stylesheet_urls`, including inline `<style>` blocks and stylesheet link attributes such as `media`.

Existing `buildCloneStudioHtml()` already sanitizes extracted head parts before emitting them into the iframe. The missing piece is preserving the original captured head parts as input when the current editable clone body comes from `edited_rendered`.

## Goals

- Keep original captured safe `<link>` and `<style>` head parts available after body-only clone edits.
- Preserve the existing Clone Studio sanitation gate for all head parts.
- Avoid duplicating head parts for unedited clones.
- Keep the change dashboard-only; no Worker schema change, R2 migration, or recapture requirement.
- Continue using structured `stylesheet_urls` as the fallback/source for stylesheet links.

## Non-Goals

- Do not relax Clone Studio head or CSS sanitization.
- Do not persist a new head metadata field.
- Do not change Worker capture output.
- Do not change how clone edit serialization strips bridge/editor scaffolding.

## Design

Add `getCloneStudioHtml(page)` in `dashboard/src/pages/dashboard/page-builder/page-modes.ts`.

The helper will:

- Return `getCloneHtml(page)` for unedited clones and legacy pages.
- When `content.modes.clone.edited_rendered` is present, extract head parts from `content.modes.clone.rendered` using the same link/style shape Clone Studio already recognizes.
- Return the extracted original head parts followed by the edited body HTML.

`CloneStudioCanvas.vue` will pass `getCloneStudioHtml(options.page)` into `buildCloneStudioHtml()` instead of `getCloneHtml(options.page)`. `buildCloneStudioHtml()` remains responsible for sanitizing head parts, rewriting proxied media URLs, deduping structured stylesheet URLs, and rendering the iframe.

## Testing

- Unit-test `getCloneStudioHtml()` returns original head parts plus edited body when `edited_rendered` is present.
- Unit-test `getCloneStudioHtml()` returns the normal clone HTML when no edit exists.
- Source-level test that `CloneStudioCanvas.vue` imports and uses `getCloneStudioHtml()`.
- Integration-level test through `buildCloneStudioFrameHtmlForCanvas()` that an edited clone retains original safe head stylesheet/link/style content in the final iframe while rendering the edited body.
- Existing Clone Studio sanitation tests remain the security guard for unsafe head input.

## Risks

- Reintroducing original head parts into edited previews could expose stale captured CSS. That is the desired behavior because the edited body still depends on the original captured styling.
- The helper may pass unsafe original head markup into `buildCloneStudioHtml()`, but this is the same path unedited clones already use, and the existing sanitation gate remains unchanged.

## Acceptance Criteria

- Edited clone previews include original captured safe head parts.
- Edited clone previews render the edited body, not the original body.
- Unedited clone previews do not duplicate head parts.
- Dashboard tests, dashboard typecheck, dashboard production build, and Pages deploy succeed.
