# Handoff - Clone Studio preview mobile hero + dynamic components

> Written 2026-06-05 after commit `2451869` was pushed to `origin/main` and the dashboard was
> deployed to Cloudflare Pages. Updated after `357ee75` shipped read-only tab-target and gallery
> bridge interactivity. This is a cold-start handoff for continuing Clone Studio preview fidelity,
> especially responsive media and dynamic cloned components.

## Current Production State

- Branch after the latest update: `main`, in sync with `origin/main` at
  `357ee75 feat(dashboard): wire clone gallery thumbnails`.
- Latest dashboard deploy from this work:
  `https://9997f433.oem-dashboard.pages.dev`.
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

## Verification Performed

Commands:

```bash
pnpm run test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts dashboard/src/pages/dashboard/components/sections/section-hero.test.ts
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
pnpm run typecheck
CI=1 pnpm -C dashboard build
git diff --check
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

Results:

- Dashboard tests passed: 32 files, 294 tests.
- Focused Clone Studio bridge tests passed: 58 tests.
- TypeScript check passed.
- Dashboard production build passed.
- Whitespace check passed.
- Cloudflare Pages deploy completed.

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

## Completed Work: Tabs, Accordions, Galleries

Current bridge has partial read-only preview interactivity:

- `collectPanels(region)`
- `switchPanel(regionId, index)`
- `enableInteractivity()` for tabs/carousels/accordions/galleries
- `MESSAGE_SWITCH_PANEL`

The previously recommended accordion slice is now done in `c8183b9`.

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

The next practical fidelity slice is to restore other static-clone dynamic UI patterns without
allowing OEM scripts:

1. Add lightweight disclosure/dropdown behavior for menus embedded inside body content, while
   continuing to omit page header/nav in Clone Studio captures.
2. Keep structured sections in Vue state; keep cloned OEM preview behavior in the trusted vanilla
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

## Resume Checklist

1. Start from `main` and confirm `git status --short --branch`.
2. Reproduce Ford Mustang production preview at mobile width:
   `https://oem-dashboard.pages.dev/preview/ford-au-mustang?view=production`.
3. In the iframe, verify:
   - desktop hero is hidden on mobile,
   - recovered mobile hero is visible,
   - lower gallery mobile variants still render,
   - unpaired desktop-only sections remain visible.
4. Implement accordion bridge behavior in a narrow test-backed slice.
5. Manually UAT at least Ford Mustang and one non-Ford page with a real accordion/tab group.
6. Run:

```bash
pnpm run test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
pnpm run typecheck
CI=1 pnpm -C dashboard build
```

7. Deploy dashboard-only with:

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```
