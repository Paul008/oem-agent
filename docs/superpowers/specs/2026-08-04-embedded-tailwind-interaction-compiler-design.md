# Embedded Page Fidelity and AI Tailwind Compiler

**Date:** 2026-08-04  
**Status:** Approved for implementation planning

## Problem

The Clone Studio edit iframe, the Worker production artifact, and the dealership website that imports that artifact are different rendering environments. A page can look accurate in the dashboard and still drift when embedded because of:

- host-page CSS inheritance and selector collisions;
- missing or blocked external styles, fonts, images, and scripts;
- different container dimensions and responsive breakpoints;
- the Nissan hero/body split used by the consumer integration;
- CSP restrictions;
- interaction behavior that was supplied by OEM JavaScript and removed during capture.

The current deterministic Tailwind conversion is useful, but it does not prove that the final dealership embed is visually or behaviorally equivalent. The current interaction annotator also covers only recognized markup patterns, so unrecognized sliders, modals, accordions, tabs, and galleries remain inert.

The selected-region toolbar has a related coordinate problem: its position is calculated only when selection changes, so it remains fixed when the iframe scrolls.

## Goals

1. Preserve a pixel-close full-page rendering without depending on the host site's CSS.
2. Preserve common interactions without executing arbitrary OEM JavaScript.
3. Let Kimi K3 recreate a selected section, or all sections, as final Tailwind HTML.
4. Expose deterministic and AI conversion choices in the selected region's right-click menu.
5. Validate the artifact in the real dealership consumer, not only inside the dashboard iframe.
6. Keep all generated changes previewable, reversible, and non-publishing until explicitly applied and saved.
7. Keep the quick-edit toolbar attached to the selected section while it is visible.

## Non-goals

- Running copied OEM JavaScript in the dealership site.
- Allowing an LLM to emit unrestricted JavaScript or arbitrary Alpine expressions.
- Treating above-the-fold critical CSS extraction as a whole-page fidelity guarantee.
- Automatically publishing AI output without user review.
- Replacing the existing production artifact contract with the dashboard preview URL.

## Recommended Architecture

The production-quality artifact has three compiled layers and one QA layer:

1. **Captured HTML and assets** preserve content, semantics, images, and source structure.
2. **Scoped used CSS** preserves the full-page visual system while isolating it from the host page.
3. **Approved Alpine CSP runtime** restores recognized interaction behavior.
4. **Embed fidelity QA** verifies the Worker artifact and the actual dealership integration across viewports and interaction states.

Tailwind is an alternative output and repair path. It is not the sole fidelity mechanism for the whole page.

### Scoped Used-CSS Compiler

The existing production CSS scoping pipeline remains the baseline. The compiler must:

- fetch inline and linked stylesheets already recorded by capture;
- parse and scope selectors beneath the page scope root;
- retain responsive media queries, CSS variables, pseudo-elements, keyframes, font faces, and interaction-state selectors;
- rewrite relative asset and font URLs to stable absolute or proxied URLs;
- remove selectors that are provably unused only when doing so cannot remove dynamic states;
- use an allowlist for classes and attributes toggled by approved runtime components;
- produce diagnostics for blocked stylesheets, skipped rules, unresolved assets, and unsupported syntax.

This is full-page CSS compilation, not critical-CSS extraction. Critical CSS may be derived later for performance but cannot replace the complete scoped stylesheet.

### Interaction Discovery and Runtime

Interaction discovery has two stages:

1. Deterministic detection uses ARIA roles, relationships, IDs, data attributes, class patterns, DOM topology, and captured state.
2. Kimi K3 is used only when deterministic detection is incomplete or low-confidence.

Kimi returns a validated JSON interaction manifest. It never returns executable JavaScript. The manifest identifies:

- interaction type;
- root selector;
- trigger selectors;
- panel, slide, or modal selectors;
- trigger-to-target mapping;
- initial selected, expanded, or open state;
- control roles such as previous, next, close, backdrop, or thumbnail;
- confidence and warnings.

Approved runtime types for the first release are:

- tabs;
- accordion;
- carousel/slider;
- gallery/lightbox;
- modal/dialog.

The compiler stamps only known `data-clone-*` attributes and approved Alpine CSP directives. The existing runtime components remain the executable source of truth. Modal support and any missing detector mappings are added to that owned runtime.

Unknown interactions remain static and generate a visible QA warning. They do not receive generated JavaScript.

## Tailwind Conversion UX

The selected clone region's context menu gains a secondary menu:

```text
Convert to Tailwind  ›
  Selected section
  Selected section with AI…
  All sections
  All sections with AI…
```

### Deterministic Conversion

- **Selected section** uses the existing computed-style recipe compiler and replaces the selected region only after a preview is available.
- **All sections** uses the existing multi-breakpoint region collection and full-page conversion flow.

### AI Conversion

Kimi K3 produces the final Tailwind HTML. The deterministic result is supplied as a fidelity baseline, not as a second conversion step.

For a selected section, the request includes:

- original region HTML;
- Tailwind recipe artifact and computed snapshots;
- deterministic Tailwind baseline;
- source URL and captured viewport;
- OEM and model context;
- optional user instructions;
- selected model override, defaulting to the admin policy for `page_screenshot_to_code`.

The response includes:

- validated Tailwind HTML;
- provider and model actually used;
- warnings and assumptions;
- interaction manifest candidates;
- token usage and latency metadata.

The dashboard shows original and generated previews before Apply. Apply updates only the in-memory clone DOM. Save remains a separate explicit action.

For all-section AI conversion:

- regions are processed individually with bounded concurrency;
- progress is shown by completed, failed, and remaining counts;
- the original page is preserved until the batch finishes;
- failed regions retain their original or deterministic version;
- the user reviews a page-level summary before applying the batch;
- cancellation prevents unstarted requests and retains the current editor state.

## Worker API Contracts

### Recreate One Region

`POST /api/v1/oem-agent/admin/recreate-tailwind-region`

Request:

```json
{
  "oemId": "nissan-au",
  "modelSlug": "ariya",
  "regionId": "clone-region-6",
  "sourceUrl": "https://www.nissan.com.au/vehicles/browse-range/ariya.html",
  "html": "<section>...</section>",
  "artifact": {},
  "baselineHtml": "<section class=\"...\">...</section>",
  "instructions": "Preserve the full-height composition",
  "modelOverride": {
    "provider": "moonshot",
    "model": "kimi-k3"
  }
}
```

Response:

```json
{
  "success": true,
  "result": {
    "html": "<section class=\"...\">...</section>",
    "interactionCandidates": [],
    "warnings": []
  },
  "inference": {
    "provider": "moonshot",
    "model": "kimi-k3",
    "wasFallback": false,
    "latencyMs": 0,
    "usage": {}
  }
}
```

The endpoint is authenticated, rate-limited, non-mutating, and size-limited. It validates and sanitizes generated HTML before returning it.

### Detect Interactions

`POST /api/v1/oem-agent/admin/detect-clone-interactions`

This endpoint accepts the unrecognized region HTML plus deterministic detector evidence and returns only an interaction manifest. It uses the admin model policy and defaults to Kimi K3 through the existing Page Builder routing configuration.

## Embed Fidelity QA

The QA comparison treats the following as separate sources:

1. dashboard production preview;
2. Worker `production-html` or `production-body-html` artifact;
3. live consumer page configured for the OEM/model.

For Nissan, the initial consumer URL template is:

```text
https://northern-nissan.engagr.com.au/models/{modelSlug}
```

The consumer target must become admin-configurable rather than permanently hard-coded to Nissan. Configuration includes:

- URL template;
- full-document versus hero/body import mode;
- expected content selector;
- viewport presets;
- optional authentication or wait selectors;
- interaction test profile.

The QA run captures desktop, tablet, and mobile screenshots and records:

- screenshot mismatch percentage and worst visual-diff bands;
- effective container dimensions;
- missing assets, fonts, stylesheets, and runtime scripts;
- CSP and browser console failures;
- horizontal overflow and broken images;
- artifact version and checksum received by the consumer;
- presence and count of expected sections.

It also exercises interaction states:

- every tab trigger changes the active panel;
- accordion triggers expand and collapse their target panel;
- carousel previous/next controls change the active slide;
- gallery thumbnails change the main media;
- modal open and close controls change dialog visibility and focus state.

Kimi may review source, artifact, consumer, and diff screenshots and propose repairs. Repairs are never published automatically.

## Toolbar Scroll Behavior

The iframe bridge emits throttled selected-region geometry updates on scroll and resize. The host recomputes the toolbar anchor from the selected region's current viewport rectangle.

Rules:

- when the section's top edge is visible, the toolbar follows that edge;
- when the top is above the viewport but the section still intersects it, the toolbar pins inside the viewport gutter;
- when the section no longer intersects the iframe viewport, the toolbar hides;
- when the section re-enters the viewport, the toolbar returns;
- selecting another section replaces the geometry subscription;
- clearing selection removes the toolbar.

## Security and Isolation

- AI output is treated as untrusted input.
- Generated HTML passes the same URL and element sanitization used by clone patches.
- Scripts, inline event handlers, iframes, objects, embeds, and unsafe URLs are rejected.
- Interaction manifests are schema-validated and restricted to approved runtime types and selector fields.
- Runtime code is owned, versioned, and covered by DOM tests.
- External styles are scoped to a unique page root.
- The consumer receives stable artifact checksums and can reject stale or mismatched versions.

## Error Handling

- A failed AI request leaves the editor and clone DOM unchanged.
- A malformed AI response returns a clear validation error and is not previewed.
- Whole-page batches preserve successful drafts independently and report failed regions.
- A failed interaction classification leaves the region static and emits a QA warning.
- A failed consumer capture reports the target URL, HTTP/CSP/browser failure, and does not imply fidelity success.
- Missing production artifacts continue to return the existing explicit error rather than silently falling back.

## Testing Strategy

### Unit and Contract Tests

- context-menu submenu action definitions and payloads;
- AI request and response validation;
- prompt construction and output sanitization;
- model policy and per-request override routing;
- interaction manifest schema validation;
- deterministic detector fallback behavior;
- modal annotator and Alpine runtime behavior;
- toolbar visibility and anchor calculation at visible, partially visible, and off-screen positions;
- production manifest diagnostics and consumer configuration resolution.

### Integration Tests

- selected deterministic conversion preview and apply;
- selected Kimi conversion preview, cancel, and apply;
- whole-page conversion progress, partial failure, cancellation, and review;
- captured interaction manifest through annotator to Alpine runtime;
- Worker artifact retains scoped CSS, runtime script, asset URLs, and checksum metadata.

### Browser Verification

- the ARIYA editor highlights and converts the selected immersive section;
- the toolbar follows the selected section during iframe scrolling and hides off-screen;
- accordion, tab, carousel, gallery, and modal state transitions work in production artifacts;
- the Northern Nissan ARIYA page receives the expected artifact and matches at configured viewports.

## Delivery Sequence

1. Fix selected-toolbar scroll tracking and off-screen visibility.
2. Add the context-menu Tailwind submenu using existing deterministic selected/page converters.
3. Add the authenticated non-mutating Kimi region-recreation endpoint and preview/apply dialog.
4. Add batch AI conversion with progress, cancellation, and review.
5. Expand interaction manifests and the owned Alpine runtime, beginning with modal support and Nissan detector gaps.
6. Add admin-configurable consumer targets and embed fidelity QA.
7. Use QA results to decide which sections need Tailwind or Kimi repair rather than rewriting every page by default.

## Acceptance Criteria

- All four Tailwind conversion actions are reachable from the selected-region context menu.
- Kimi K3 is the default AI model through admin policy, while users can choose another eligible model.
- No AI result mutates or publishes a page before explicit Apply and Save actions.
- Whole-page conversion retains original regions for failures and supports cancellation.
- The quick-edit toolbar remains attached only while its selected section is visible.
- Known tabs, accordions, carousels, galleries, and modals work without OEM JavaScript.
- The production artifact includes scoped CSS and reports CSS/runtime diagnostics in its manifest.
- The fidelity workflow compares the real consumer render, including interaction states, rather than declaring success from the dashboard preview alone.
