# PRD: Compprops-driven interactive components for cloned model pages

**Status:** Approved for build · **Owner:** Paul · **Drafted:** 2026-08-06

## Problem

SSR-inlined clone bodies now load the Alpine clone runtime (PRs #31 / engagr #205), which
activates *stamped* interactions (carousel, tabs, accordion, FAQ). But Nissan's richest
interactions — the "LEARN MORE" (+) feature overlays that open a full-window panel per
section — are rendered client-side by Nissan's AEM app from `data-compprops` JSON and were
therefore never captured as DOM. Dealer pages show the trigger styling but nothing happens.

## Insight

The captured DOM already carries the data: each section's `data-compprops` attribute holds
`featureItems[]` with `label`, `featureDescription`, `desktopImagePath` /
`tabletImagePath` / `mobileImagePath`, alt text, and video paths (Ariya embed carries 14
compprops blocks). We can render Nissan's own content with a component we own — no new
fetches, works identically in inline and iframe modes, publishes/purges with the page.

## Deliverable

A `cloneFeatureOverlay` Alpine component in `src/design/clone-runtime/clone-runtime.ts`,
stamped by the annotator, that opens an accessible full-window overlay rendered from the
section's compprops JSON. Reference behaviour:
https://www.nissan.com.au/vehicles/browse-range/ariya.html ("LEARN MORE" overlays).

## Requirements

1. **Annotator** (`clone-annotator.ts` + `section-parser.ts`): detect sections whose
   compprops parse to non-empty `featureItems` AND that contain a learn-more style trigger
   (`.icon-plus`, text "LEARN MORE", or `data-id*="learn-more"`). Stamp
   `data-clone-interaction="feature-overlay"`, `x-data="cloneFeatureOverlay"`, trigger
   `x-on:click`, and keep compprops as the data source (no duplication).
2. **Runtime component**: parse compprops lazily on first open; render overlay with close
   (×) button, ESC + backdrop-click dismissal, focus trap, scroll lock scoped so the host
   page is restored on close; responsive image selection (desktop/tablet/mobile paths →
   route via the media proxy when captured, absolute nissan-cdn otherwise — the `.ximg.*`
   media fallback (PR #30) applies); render `featureDescription` as text (no raw HTML
   injection — compprops values are untrusted content).
3. **Styling**: overlay chrome styled inside the clone scope selector so it cannot leak
   into the dealer shell; match the corporate reference (full-window white panel, image
   top, Design/label eyebrow, heading, body copy).
4. **CSP/inertness**: no inline handlers or scripts in stored HTML — attributes only, all
   behaviour in the runtime bundle. The embed inertness verifier must keep passing.
5. **Non-destructive rollout for Ariya**: re-annotate the stored page the same way as the
   carousel rollout (backup latest.json → pure-function annotate → bake fix-ups → upload →
   version bump → purge webhook). NEVER re-capture an edited page.
6. **Validation gates**: publication validator must accept the new stamped attributes;
   1000+ worker tests stay green; visual QA against the corporate page for at least 3
   sections on Ariya + 1 on X-Trail before purging dealer caches.

## Out of scope (this iteration)

- Video overlays (compprops `desktopVideoPath`) — render poster image + link out instead.
- Dynamic-Worker–generated per-OEM adapters (revisit when a second clone-mode OEM needs
  proprietary interactions).
- Nissan grade-comparison / spec-table components.

## Task list

- [ ] 1. Annotator: `feature-overlay` detection + stamping (with unit tests using real
      Ariya compprops fixtures)
- [ ] 2. Runtime: `cloneFeatureOverlay` component (open/close, focus trap, ESC, scroll
      lock, responsive image) + dom tests
- [ ] 3. Overlay CSS injected via clone runtime (scoped under `.oem-production-scope` /
      publication scope)
- [ ] 4. Publication validator: allow the new stamped attributes; run full suite
- [ ] 5. Non-destructive re-annotate + upload Ariya (backup first), verify in builder
      preview
- [ ] 6. Deploy worker; purge; interactive click-test on dealer page (overlay opens,
      closes, no scroll leak); visual QA vs corporate reference
- [ ] 7. Roll out to qashqai / x-trail / patrol / navara (same re-annotate flow)

## Risks

- Compprops JSON shape drift across Nissan components → parse defensively, skip sections
  that don't match, never throw.
- Cheerio round-trip on stored HTML — known to drop inline scripts / normalize whitespace;
  the bake-in pattern from the carousel rollout applies (see memory:
  production-html-pipeline).
- Overlay z-index vs dealer shell (sticky navs, chat widget) — test on the live page, keep
  the overlay inside the scope div with a high-but-bounded z-index.
