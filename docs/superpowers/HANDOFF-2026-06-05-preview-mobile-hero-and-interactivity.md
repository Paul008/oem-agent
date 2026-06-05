# Handoff - Clone Studio preview mobile hero + dynamic components

> Written 2026-06-05 after commit `2451869` was pushed to `origin/main` and the dashboard was
> deployed to Cloudflare Pages. Updated after `edbc0a1` shipped edge-aware Clone Studio toolbar
> positioning, and after `9de8bd5` shipped Ford/AEM disclosure-heading accordion support. This is a
> cold-start handoff for continuing Clone Studio preview fidelity, especially responsive media and
> dynamic cloned components.

## Current Production State

- Branch after the latest dashboard-code update: `main`, in sync with `origin/main` at
  `9de8bd5 fix(dashboard): wire Ford disclosure accordions`.
- Latest dashboard deploy from this work:
  `https://f77601ad.oem-dashboard.pages.dev`.
- Production alias under test:
  `https://oem-dashboard.pages.dev/preview/ford-au-mustang?view=production`.
- No worker/container deploy was needed for the latest fix; this was dashboard-only.

## What Just Shipped

### 1. Production Preview Mode

`/preview/:slug` now has an Edit/Production toggle.

- Edit view keeps Clone Studio edit affordances where the page is writable.
- Production view is read-only and disables editing overlays/save actions.
- The standalone preview uses `PageBuilderCanvas` with `auto-responsive-preview` so the clone iframe
  gets the viewer viewport width rather than always rendering a desktop frame.

Key file:
- `dashboard/src/pages/preview/[slug].vue`

### 2. Responsive Clone Preview Fixes

Several commits improved mobile/tablet rendering of captured OEM clone HTML:

- `d2f4307` - responsive inline color/background/font/length handling.
- `a687def` - prefer mobile clone image variants on mobile when a real desktop/mobile pair exists.
- `6465630` - scope desktop/mobile image pairing to local containers so unrelated image variants do
  not hide each other.
- `882153d` - stack Ford/AEM split image/text blocks on mobile using `data-config` responsive
  padding/margin/background rules.
- `f9c9874` - keep unpaired `onlydesktop` text visible on mobile instead of hiding the only copy.
- `2451869` - recover missing mobile hero clone images from explicit AEM source metadata.

Key file:
- `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`

### 3. Ford Mustang Mobile Hero Recovery

The saved Ford Mustang clone had only the desktop hero node:

```html
<img class="imgdesktop"
  src="/media/pages/assets/ford-au/mustang/overview-hero-banner-desktop-new.webp"
  data-image-url="/content/dam/Ford/au/nameplate/mustang/overview/billboards/overview-hero-banner-desktop-new.webp">
```

The live Ford page contains the missing mobile sibling:

```html
<img class="imgmobile"
  src="/content/dam/Ford/au/nameplate/mustang/overview/billboards/overview-hero-banner-new-mbl.webp">
```

The bridge now:

1. Marks desktop/mobile image variants.
2. Finds unpaired desktop image variants.
3. Derives conservative mobile candidates from explicit source metadata, including Ford AEM's
   `-desktop-new.webp` -> `-new-mbl.webp` pattern.
4. Routes known OEM URLs through the existing worker media proxy.
5. Probes with `new Image()` and only inserts the recovered mobile node if it loads.
6. Marks the desktop and recovered mobile node as a real responsive pair so mobile CSS hides the
   desktop image and displays the recovered mobile image.

The exact recovered Ford URL was verified through the media proxy:

```text
https://oem-agent.adme-dev.workers.dev/media/ford-au/aHR0cHM6Ly93d3cuZm9yZC5jb20uYXUvY29udGVudC9kYW0vRm9yZC9hdS9uYW1lcGxhdGUvbXVzdGFuZy9vdmVydmlldy9iaWxsYm9hcmRzL292ZXJ2aWV3LWhlcm8tYmFubmVyLW5ldy1tYmwud2VicA
```

It returned `200 image/webp`.

### 4. Structured Hero Mobile Source

`SectionHero.vue` now renders a `<picture>` with a mobile `<source>` when
`section.mobile_image_url` is present, rather than always rendering only `desktop_image_url`.

Key file:
- `dashboard/src/pages/dashboard/components/sections/SectionHero.vue`

### 5. Read-Only Accordion Interactivity

The Clone Studio iframe bridge now restores common stripped-script accordion behavior in read-only
preview/production view.

What changed:

- `classifyRegion()` detects AEM/Ford, Bootstrap-like, and ARIA accordion patterns.
- `enableInteractivity()` includes accordion candidates alongside tabs/carousels.
- `wireAccordionRegion()` wires trusted click handlers to disclosure controls.
- `toggleAccordionPanel()` updates `aria-expanded`, `hidden`, inline `display`, and common
  active/open/show classes.
- Single-expansion accordions are respected when the source markup advertises it via AEM,
  generic, or Bootstrap-style attributes.
- Wired OEM controls get a temporary `data-clone-studio-interactive-control` marker so the
  document-level navigation blocker does not swallow their capture-phase click handlers.
- The temporary marker is stripped from `getBodyHtml()` / `getRegionHtml()` serialization paths.

Key files:

- `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
- `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`

### 5a. Ford/AEM Disclosure-Heading Accordion Variant

The Ford Mustang clone's bottom "Disclosures" block is an AEM accordion variant, but the trigger is
not a button. The captured markup uses a heading:

```html
<div class="accordion-disclosure" data-cmp-hook-accordion="item" data-cmp-expanded="true">
  <h4 class="cmp-accordion__title trigger disclosure">Disclosures</h4>
  <div data-cmp-hook-accordion="panel" class="content" role="region">...</div>
</div>
```

Commit `9de8bd5` added support for this shape:

- accordion classification now includes `data-cmp-hook-accordion` item/panel markers and Ford's
  misspelled `accordian` class fragments;
- trigger discovery now includes `.cmp-accordion__title`, `.trigger.disclosure`, and heading
  triggers inside `.accordion-heading-wrapper`;
- `data-cmp-expanded` is used as source state and updated when the bridge toggles the panel;
- the exact disclosure-heading pattern is covered in `clone-studio-html.test.ts`.

This keeps the Mustang bottom disclosure working in production preview without loading Alpine or
restoring stripped OEM scripts.

### 6. Read-Only Tab Target Resolution

The Clone Studio iframe bridge now resolves explicit tab targets before falling back to trigger
index order.

What changed:

- `enableInteractivity()` includes Bootstrap/data/custom tab triggers.
- `switchTabPanel()` resolves target panels via `aria-controls`, `href="#panel"`,
  `data-bs-target`, `data-target`, `data-tab`, and `data-tab-target`.
- Panel discovery includes ARIA tab panels plus common `data-tab-*` / class-based panels.
- Generic `[aria-controls]` tab detection filters out accordion-looking disclosure controls unless
  the control is also explicitly marked as a tab.

Commit:

- `d145bfa feat(dashboard): resolve clone tab targets`

### 7. Read-Only Gallery Thumbnail Switching

The Clone Studio iframe bridge now restores simple static-clone gallery behavior when the source
markup exposes a clear gallery/thumb pattern.

What changed:

- `classifyRegion()` detects `[data-gallery]`, `.gallery`, gallery class fragments, and thumbnail
  markers when more than one image is present.
- `wireGalleryRegion()` marks thumbnail controls as trusted bridge controls and suppresses normal
  navigation.
- `switchGalleryImage()` updates the detected main image from explicit full-size thumbnail
  attributes where available, falling back to the thumbnail image URL.
- `<picture>` sources are kept in sync with the swapped main image.
- Active/is-active classes move with the selected thumbnail.

Commit:

- `357ee75 feat(dashboard): wire clone gallery thumbnails`

### 8. Read-Only Dropdown / Disclosure Toggles

The Clone Studio iframe bridge now restores simple dropdown and disclosure behavior for embedded
body content without enabling OEM page chrome scripts.

What changed:

- `classifyRegion()` detects explicit dropdown/disclosure/menu patterns, including
  `[data-dropdown]`, `[data-disclosure]`, `[data-menu]`, `.dropdown`, `[aria-haspopup]`,
  `[data-bs-toggle="dropdown"]`, and related trigger attributes.
- Header/navigation chrome is skipped through `isPageChromeInteractivityRegion()` so captured page
  nav does not become an editable preview dependency.
- `isDropdownTrigger()` filters out tab and accordion controls so the bridge behaviors stay
  disjoint.
- `wireDropdownRegion()` marks trusted dropdown controls and intercepts read-only clicks.
- `toggleDropdownPanel()` updates `aria-expanded`, `hidden`, `aria-hidden`, inline `display`, and
  common `show`/`open`/`active`/`is-active`/`collapsed` classes.
- Opening one dropdown closes other dropdown panels in the same detected region.

Commit:

- `0c58266 feat(dashboard): wire clone dropdown toggles`

### 9. Quick Clone Toolbar Image Replacement

The selected-region quick edit bubble now exposes image replacement directly, not only through the
right-click context menu.

What changed:

- `PageBuilderCanvas.vue` detects whether the selected clone region has an editable image field.
- A compact image button appears in the selected-region toolbar next to the text edit button.
- Clicking it opens the existing `MediaLibraryDialog`, scoped by `oemId` and `modelSlug`.
- The same dialog supports current uploaded media, upload, and portal/DAM assets.
- The button is disabled when the selected region has no image field or the page lacks OEM/model
  media context.

Commit:

- `6916f68 feat(dashboard): add clone toolbar image replacement`

### 10. Media Library Current-Model Default

The image replacement media dialog remains OEM-scoped, but now preselects the active model when
matching uploaded media exists.

What changed:

- `MediaLibraryDialog.vue` still loads the OEM media library so editors can switch to any model.
- After the library loads, `defaultLibraryModelFilter()` selects `props.modelSlug` only if one or
  more uploaded media items match that model.
- If there is no current-model match, the dialog keeps showing all OEM media.
- Portal/DAM assets already auto-detect the closest parsed model separately.

Commit:

- `6faa9b5 feat(dashboard): default media library to current model`

### 11. Quick Clone Toolbar Link Editing

The selected-region quick edit bubble now exposes link/button URL editing directly.

What changed:

- `PageBuilderCanvas.vue` detects whether the selected clone region has an editable link field.
- A compact link button appears beside the text/image buttons.
- Clicking it switches the toolbar into a mobile-safe inline URL row with apply/cancel icon
  buttons, rather than trying to fit every control at once.
- The submitted URL uses the same `buildPatchPayload('edit-link', ...)` mutation path as the
  existing right-click context menu.
- Selecting a different clone region or opening the media library cancels the inline link edit
  state.

Commit:

- `16576f3 feat(dashboard): add clone toolbar link editing`

### 12. Quick Clone Toolbar Text Color

The selected-region quick edit bubble now exposes foreground text color editing.

What changed:

- `PageBuilderCanvas.vue` adds a text color picker beside the existing weight and background
  controls.
- The picker sends a `kind: 'style'`, `property: 'color'` patch through the existing Clone Studio
  iframe bridge.
- `clone-studio-html.ts` now whitelists `color` in `patchTextStyle()`, guarded by
  `isPlausibleCssColor()` rather than accepting arbitrary style properties.
- The bridge still avoids `setProperty(property, ...)`, so only explicit style properties can be
  patched from the toolbar.

Commit:

- `2dfdc7c feat(dashboard): add clone toolbar text color`

### 13. Mobile-Safe Clone Toolbar Overflow

The selected-region quick edit bubble now stays usable on narrow screens after the toolbar gained
text, image, link, alignment, weight, text color, and background controls.

What changed:

- `PageBuilderCanvas.vue` changed the toolbar from clipped overflow to horizontal scrolling.
- Scrollbars are hidden visually while the controls remain reachable by touch/trackpad.
- Direct toolbar controls are forced to `shrink-0` so icons do not collapse into unusable targets.
- The link-edit inline URL mode shares the same scroll container behavior.

Commit:

- `d835778 fix(dashboard): keep clone toolbar usable on mobile`

### 14. Quick Clone Toolbar Alt Text Editing

The selected-region quick edit bubble now exposes image alt-text editing directly, not only through
the right-click context menu.

What changed:

- `PageBuilderCanvas.vue` detects selected clone regions with editable image fields and shows a
  compact alt-text button beside image replacement.
- Clicking the alt-text button switches the same mobile-safe toolbar into an inline text row with
  apply/cancel icon buttons.
- The submitted value uses the existing `buildPatchPayload('alt-text', ...)` mutation path, so it
  reuses the Clone Studio iframe bridge's `kind: 'alt'` handling.
- Opening link edit, media replacement, or selecting a different clone region cancels any pending
  alt-text edit state.

Commit:

- `ca12d3e feat(dashboard): add clone toolbar alt text editing`

### 15. Quick Clone Toolbar Region Actions

The selected-region quick edit bubble now exposes common region-level actions directly.

What changed:

- `PageBuilderCanvas.vue` adds duplicate, hide, and delete icon buttons after the text/image/style
  controls.
- Duplicate emits the existing `regionAction` path, so the parent page still owns the structural
  clone-region operation and the bridge still handles the actual duplicate DOM message.
- Hide uses the existing `buildPatchPayload('hide', ...)` visibility patch path.
- Delete emits the existing `regionAction` delete path, which maps to the current pragmatic
  clone-region delete behavior: visibility off rather than a new hard-delete implementation.
- Hide/delete clear the selected toolbar state so the bubble does not remain anchored to a hidden
  region.

Commit:

- `17109c8 feat(dashboard): add clone toolbar region actions`

### 16. Quick Clone Toolbar Visible Height Editing

The selected-region quick edit bubble now exposes visible-height/crop editing directly.

What changed:

- `PageBuilderCanvas.vue` stores the selected clone region's rendered height from the iframe
  selection payload.
- A compact Ruler button opens a mobile-safe inline number input.
- Submitting a number calls the existing `CloneStudioCanvas.setHeight()` bridge message and emits
  the existing `height_override` update-field event, so persistence remains the same as the
  right-click height action and drag handle.
- Submitting a blank value clears the visible-height override.
- Opening link, alt-text, or media replacement editing cancels any pending height edit state.

Commit:

- `d70b8d9 feat(dashboard): add clone toolbar height editing`

### 17. Quick Clone Toolbar Panel Switching

The selected-region quick edit bubble now exposes previous/next panel controls for cloned tabs and
carousels.

What changed:

- `PageBuilderCanvas.vue` detects selected clone regions with `type_hint` of `tabs` or `carousel`.
- Previous/next chevron buttons appear only for those panel-capable clone regions.
- The buttons reuse the existing `clonePanelIndex` state and `CloneStudioCanvas.switchPanel()`
  bridge message already used by the right-click menu.
- Opening the panel controls cancels any pending inline link, alt-text, or height edit state before
  switching panels.

Commit:

- `5623872 feat(dashboard): add clone toolbar panel switching`

### 18. Quick Clone Toolbar Convert Action

The selected-region quick edit bubble now exposes the convert-to-section action directly.

What changed:

- `PageBuilderCanvas.vue` adds a Wand button beside duplicate/hide/delete region actions.
- Clicking it emits the existing `regionAction` path with `action: 'convert'` and the selected
  region HTML.
- The parent dashboard editor and standalone preview already convert that HTML with
  `buildRawHtmlSectionFromCloneRegion()`, add the raw editable section, and switch to structured
  sections mode.
- The toolbar selection is cleared after conversion so the bubble does not remain anchored to the
  clone region while the editor changes modes.

Commit:

- `e5379c2 feat(dashboard): add clone toolbar convert action`

### 19. Edge-Aware Clone Toolbar Positioning

The selected-region quick edit bubble now adapts its anchor near viewport edges.

What changed:

- `PageBuilderCanvas.vue` tracks the current viewport width/height for toolbar positioning.
- The toolbar still centers under normal selections, but left-aligns near the left edge and
  right-aligns near the right edge instead of always using `translateX(-50%)`.
- The top position is clamped with a small gutter so the bubble does not render outside the visible
  viewport.
- The viewport tracker updates on resize and when a clone region is selected.

Commit:

- `edbc0a1 fix(dashboard): keep clone toolbar within viewport`

## Verification Performed

Commands:

```bash
pnpm run test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts dashboard/src/pages/dashboard/components/sections/section-hero.test.ts
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
pnpm run typecheck
CI=1 pnpm -C dashboard build
git diff --check
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

Results:

- Dashboard tests passed: 32 files, 294 tests.
- Focused Clone Studio bridge tests passed: 58 tests.
- Focused Page Builder canvas preview tests passed: 26 tests.
- TypeScript check passed.
- Dashboard production build passed.
- Whitespace check passed.
- Cloudflare Pages deploy completed.
- Production alias check returned HTTP 200 for
  `https://oem-dashboard.pages.dev/preview/ford-au-mustang?view=production`.

Browser verification:

- A fresh headless browser hit the dashboard login, so it could not inspect the authenticated
  preview directly.
- Kimi WebBridge CLI `status` misreported a stale PID, but the HTTP endpoint at
  `http://127.0.0.1:10086/status` was healthy and extension-connected.
- Using the authenticated browser via WebBridge, the production preview iframe was forced to
  `390px` width for verification only.
- Result at `390px` iframe width:
  - Desktop hero:
    `overview-hero-banner-desktop-new.webp`, class `imgdesktop`, `display: none`.
  - Recovered mobile hero:
    proxied `overview-hero-banner-new-mbl.webp`, class `imgmobile`, `display: block`,
    rendered `390x609`.
- Screenshot written during verification:
  `/private/tmp/oem-dashboard-ford-mobile-verified.png`.

## Dynamic Component Direction

Question answered at handoff time: "Are we using Alpine JS or GSAP for tabs and accordions?"

Recommended split:

1. **Structured sections use Vue state.**
   Tabs, accordions, galleries, drawers, editor controls, and media-library interactions should
   remain Vue components. The dashboard is already Vue; adding Alpine creates another state model
   without enough benefit.

2. **Cloned OEM preview uses the trusted vanilla bridge.**
   Extend `clone-studio-html.ts` bridge behavior for common stripped-script OEM patterns. This keeps
   untrusted OEM scripts stripped while restoring predictable click-state behavior inside the clone
   iframe.

3. **GSAP only for animation-first sections.**
   Use GSAP for pinned scroll, reveal sequences, parallax, or timeline polish. Do not use GSAP to
   own tab/accordion state.

4. **Do not add Alpine as the default.**
   It is useful for server-rendered HTML sprinkles, but this app already has Vue plus a sandbox
   bridge. Alpine would add runtime and persistence ambiguity.

## Completed Work: Ford/Slick Responsive Carousel

Context: Ford Mustang source page `https://www.ford.com.au/showroom/cars/mustang/` includes a
Slick-style brand-card slideshow near the bottom of the cloned template. The copied HTML retains
Slick classes (`slick-slide`, `slick-active`, `slick-current`) and Ford controls
(`brand-previous`, `brand-next`), but the actual OEM script is stripped from the preview iframe.

Decision: do not load Alpine.js for this copied clone. The clone body is sanitized, rendered inside
an iframe, and not compiled as Vue/Alpine markup. Adding Alpine inside arbitrary copied OEM HTML
would create a second runtime and still would not revive existing Ford/Slick state unless we mapped
the DOM manually. The trusted iframe bridge is the right place for this behavior.

What is now implemented in `clone-studio-html.ts`:

- Slick/Swiper/Splide/Bootstrap carousel tracks are forced to `display:flex` so desktop multi-card
  windows can render as rows after OEM JS/CSS transforms are removed.
- Desktop window size is detected from the source active slide count, capped at 3 cards.
- Ford brand-card wrappers default to a 3-card desktop window when no source active count is usable.
- Mobile viewport collapses carousels to one card at a time.
- `.brand-next` and `.brand-previous` are treated as real carousel controls.
- Ford/Slick controls can sit as siblings outside `.brandcard-wrapper`; the bridge now searches a
  bounded nearby scope so those real controls are wired before falling back to bridge-owned controls.
- Existing Ford/Slick classes, `hidden`, `aria-hidden`, and `slick-current` are updated when moving
  slides.
- A resize handler recomputes the active carousel window after iframe viewport changes.
- The bridge-owned fallback control bar now counts valid carousel window positions rather than raw
  slide count.

Regression coverage in `clone-studio-html.test.ts` asserts the Ford/Slick selectors and the
responsive carousel-window helpers are present. A Ford-ish fixture verifies this is a vanilla bridge
path, not Alpine (`Alpine.start`, `x-data`, etc. are not emitted).

## Completed Work: Tabs, Accordions, Galleries, Dropdowns

Current bridge has partial read-only preview interactivity:

- `collectPanels(region)`
- `switchPanel(regionId, index)`
- `enableInteractivity()` for tabs/carousels/accordions/galleries/dropdowns
- `MESSAGE_SWITCH_PANEL`

The previously recommended accordion and dropdown slices are now done in `c8183b9` and `0c58266`.

What was implemented:

1. `enableInteractivity()` handles accordions, not just tabs/carousels.
2. Common accordion patterns are detected:
   - ARIA: `[aria-expanded]`, `[aria-controls]`, `[role="button"]`, `[role="tab"]`,
     `[role="tabpanel"]`.
   - AEM/Ford: `[data-cmp-is="accordion"]`, `[data-cmp-hook-accordion]`,
     `.cmp-accordion__button`, `.cmp-accordion__title`, `.accordion-disclosure`.
   - Bootstrap-like: `.accordion`, `.accordion-item`, `.accordion-button`, `.collapse`.
   - Generic: `.tab-content`, `.tab-pane`, `.tabs`, `.tab`, `.active`, `.is-active`.
3. `toggleAccordionPanel(region, trigger)`:
   - toggles `aria-expanded`,
   - sets/removes `hidden`,
   - updates inline `display`,
   - adds/removes active/open classes,
   - respects single-expansion accordions when detectable.
4. It remains preview-only for read-only production preview; editor click-selection is unaffected.
5. Tests in `clone-studio-html.test.ts` assert the bridge contains:
   - accordion detection selectors,
   - a toggle function,
   - `aria-expanded` handling,
   - `hidden`/`display` handling,
   - trusted-control bypass markers.

## Next Work: Richer Dynamic Components

The next practical fidelity slice is broader UAT and targeted hardening rather than a new runtime:

1. Validate tabs, accordions, galleries, and dropdowns against at least one second OEM clone with
   real dynamic body content.
2. Add fixture-level behavioral tests for a minimal generated dropdown/gallery DOM if future edits
   make the bridge harder to reason about from string-contract tests alone.
3. Keep structured sections in Vue state; keep cloned OEM preview behavior in the trusted vanilla
   bridge; use GSAP only for animation-first sections.

## Critical Gotchas

- The clone iframe bridge is embedded as a TypeScript template literal in
  `clone-studio-html.ts`. Do not use backticks inside the bridge string.
- Keep bridge JavaScript ES5-compatible (`var`, function declarations). The string is injected into
  an iframe; do not rely on module imports or outer-scope helpers.
- Anything injected by the bridge should either be removed before serialization or marked with
  `data-clone-studio-bridge` when it is pure scaffolding.
- The recovered mobile image nodes are real DOM nodes inserted by the bridge after the load probe.
  In read-only production preview this is safe because the page cannot save. In editable preview,
  saving after recovery may persist the recovered node unless future code explicitly removes
  `data-clone-studio-generated-responsive-image` nodes. Decide whether that is desirable before
  changing save behavior.
- Do not hide desktop image variants globally unless a real mobile counterpart exists. This was the
  cause of earlier blank mobile sections.
- Do not hide `onlydesktop` text on mobile unless there is a real paired `onlymobile` text node.
  Some captures only contain desktop text.
- `allow-same-origin` remains opt-in. It improves timers/rAF but increases trust risk for any
  sanitized clone that accidentally retains script behavior.

## Key Files

- `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
  - iframe builder, sanitizer, responsive image/content bridge, preview interactivity.
- `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`
  - primary regression test file for bridge string behavior.
- `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`
  - iframe host, sandbox flags, frame scaling.
- `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`
  - preview width logic, clone toolbar/menu host, media library integration.
- `dashboard/src/pages/preview/[slug].vue`
  - standalone preview route and Edit/Production toggle.
- `dashboard/src/pages/dashboard/components/sections/SectionHero.vue`
  - structured hero rendering with mobile `<source>`.
- `src/routes/media.ts`
  - media proxy allowlist and OEM fetch headers.
- `src/routes/oem-agent.ts`
  - media upload/list endpoints and page routes.
- `src/design/component-generator.ts`
  - bespoke AI component prompt. Raw snippets are now static Tailwind HTML only.
- `src/design/page-generator.ts`
  - generated page body prompt. Raw generated HTML must not emit Alpine/Vue directives or scripts.

## Resume Checklist

1. Start from `main` and confirm `git status --short --branch`.
2. Reproduce Ford Mustang production preview at mobile width:
   `https://oem-dashboard.pages.dev/preview/ford-au-mustang?view=production`.
3. In the iframe, verify:
   - desktop hero is hidden on mobile,
   - recovered mobile hero is visible,
   - lower gallery mobile variants still render,
   - unpaired desktop-only sections remain visible.
4. Manually UAT at least Ford Mustang and one non-Ford page with real tab, accordion, gallery, and
   dropdown/disclosure body content.
5. For the Ford Mustang lower slideshow, verify:
   - desktop shows the source multi-card window,
   - mobile shows one card at a time,
   - `brand-next` / `brand-previous` move the window,
   - no Alpine runtime is required.
6. If the next issue is another stripped-script pattern, keep the change narrow and add a
   string-contract regression test in `clone-studio-html.test.ts`.
7. Run:

```bash
pnpm run test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
CI=1 pnpm exec vitest run src/design/component-generator.test.ts --pool forks --maxWorkers=1 --minWorkers=1
pnpm run typecheck
env CHOKIDAR_USEPOLLING=1 pnpm -C dashboard build
```

8. Deploy dashboard-only with:

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```
