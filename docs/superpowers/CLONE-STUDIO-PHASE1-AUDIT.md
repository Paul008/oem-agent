# Clone Studio Phase 1 Audit

Written 2026-06-03.

## Live Audit Results

These checks were run in the authenticated production dashboard at
`https://oem-dashboard.pages.dev/dashboard/page-builder/...` using the Clone Studio iframe audit from
`docs/superpowers/HANDOFF-clone-studio-next.md`. The iframe was temporarily reloaded with
`sandbox="allow-scripts allow-same-origin"` for inspection.

| OEM/page | Stack signal | Images | Broken | Stylesheets | Fonts | Hidden text | Overflow | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Ford Mustang | AEM/Slick baseline | 20 | 0 | 4 sheets / 3 links | 7 | 0 | 0 | Pass |
| Kia Sportage | kwcms/Slick/reveal animation | 43 | 0 | 14 sheets / 12 links | 6 | 1 | 0 | Fixed by reveal shim |
| GWM Haval H6 | Storyblok/Swiper | 27 | 0 | 3 sheets / 1 link | 0 | 0 | 535px | Fixed by carousel shim |
| Toyota RAV4 | Scrapling external capture / responsive media | 70 | 0 | 10 sheets / 2 links | 104 | 3 | 0 | Pass; mobile/interactive overlays remain hidden |
| Hyundai i30 | AEM/Swiper/fixed-width wrappers | 34 | 0 | 10 sheets / 8 links | 0 | 0 | 597px | Fixed by carousel shim + frame guard |
| GAC EMZOOM | Nuxt/Swiper/responsive media | 23 | 0 | 13 sheets / 11 links | 0 | 0 | 511px | Fixed by carousel/media shim |
| LDV Deliver 7 | Gatsby/i-motor | 19 | 0 | 2 sheets / 0 links | 0 | 0 | 0 | Pass |
| Mazda CX-5 | Mazda SSR/static assets | 88 | 0 | 3 sheets / 1 link | 16 | 0 | 0 | Pass |
| Volkswagen Tiguan | VW model page | 35 | 0 | 2 sheets / 0 links | 0 | 0 | 0 | Pass |
| Subaru BRZ | Legacy source-document image placeholders | 40 | 0 | 82 sheets / 72 links | 279 | 0 | 0 | Fixed by source-document image cleanup |

Generated page slug discovery through the authenticated dashboard initially showed existing Clone
Studio pages for Ford, Kia, GWM, Toyota, Hyundai, and GAC only. LDV, Mazda, and Volkswagen had zero
generated page slugs, so representative zero-AI `clone-page` captures were created for:

- `ldv-au/ldv-deliver-7` from `https://www.ldvautomotive.com.au/vehicles/ldv-deliver-7/`
- `mazda-au/cx-5` from `https://www.mazda.com.au/cars/cx-5/`
- `volkswagen-au/tiguan` from `https://www.volkswagen.com.au/en/models/tiguan.html`

These writes created the corresponding R2 `pages/definitions/{oem}/{slug}/latest.json` clone pages
and proxied page assets. They did not run the AI structuring/adaptive pipeline.

A follow-up non-mutating production audit on 2026-06-04 found an existing Subaru BRZ clone with
legacy `<img src="https://www.subaru.com.au/brz/2026">` placeholders. These pointed at the source
document route, not an image. No recapture was run. The dashboard renderer now strips source-document
image placeholders at render time, including same-origin model-year child routes like `/brz/2026`
when the stored source URL is `/brz`, as long as there is no recoverable lazy image source.

Remaining non-protected OEMs checked for existing generated Clone Studio pages on 2026-06-04 had no
generated slugs to audit yet: Chery, GMSV, Isuzu, KGM, Mitsubishi, Nissan, Renault, and Suzuki.
Do not run new tests or writes against GAC or FOTON unless the live-site restriction is lifted.

## Mapper cross-stack verification (2026-06-04, production)

The unified section mapper (`src/design/section-mapper.ts`) was verified live against
real production clones via the non-mutating `POST /admin/map-page` endpoint, after
two splitter fixes (deep CMS wrapper descent + a11y/nav chrome skip) were deployed.

| OEM/page | regions | section[0] | overall conf | low-conf | notes |
|---|---:|---|---:|---:|---|
| ford-au/mustang | 21 | hero | 0.61 | 8 | was collapsing to 1 region pre-fix |
| kia-au/sportage | 14 | hero | 0.70 | 2 | |
| gwm-au/haval-h6 | 10 | hero | 0.73 | 2 | was 2 regions pre-chrome-skip (nuxt announcer) |
| toyota-au/rav4 | 57 | content-block | 0.64 | 14 | over-segmented (responsive media blocks) |
| hyundai-au/i30 | 11 | hero | 0.77 | 0 | clean |
| mazda-au/cx-5 | 13 | image | 0.77 | 0 | image-led hero (heading in separate region) |
| volkswagen-au/tiguan | 3 | content-block | 0.63 | 1 | under-segmented |
| ldv-au/ldv-deliver-7 | 22 | image | 0.63 | 10 | image-led hero |
| subaru-au/brz | 5 | image | 0.78 | 0 | image-led hero |

Newly cloned + mapped on 2026-06-04 (deterministic `clone-page`, then `map-page`):

| OEM/page | clone elements | regions | section[0] | overall | notes |
|---|---:|---:|---|---:|---|
| chery-au/chery-c5 | 772 | 28 | hero | 0.70 | healthy |
| gmsv-au/silverado-2500hd | 880 | 23 | content-block | 0.64 | healthy |
| renault-au/arkana | 395 | 22 | hero | 0.57 | healthy |
| suzuki-au/ignis | 35 | 1 | intro | 0.80 | **thin clone** — page under-rendered via cloudflare-browser; retry with `scrapling-stealth` |

Findings:
- The catastrophic single-region collapse (deep AEM/CMS wrapper nesting + stray
  noise siblings) is fixed and verified on the real 98KB Mustang clone (1 → 21).
- a11y/nav chrome (Nuxt route-announcer, sticky navs) is now skipped, fixing GWM
  (2 → 10) and improving hero-first detection.
- Residual deterministic gaps are honest and expected: **image-led heroes**
  (Mazda/Subaru/LDV — full-bleed hero image with the heading in a separate region)
  read as `image`/`content-block` at section[0], and Toyota over-segments. These
  are precisely the cases the **AI fallback** (`mapAndPersist` → AI when
  `needs_ai_fallback`) is designed to cover; chasing per-stack deterministic
  perfection would over-fit.

## Capture diagnostics — verified live

`POST /admin/clone-page` now records a diagnostics record per capture under
`pages/diagnostics/{oem}/{slug}` (outside `pages/definitions`).
`GET /admin/capture-diagnostics/chery-au/chery-c5` returned `found:false` before the
capture and `{found:true, status:ok, backend:cloudflare-browser, capture_time_ms:25987}`
after — end-to-end persistence confirmed in production.

## Fleet audit status (2026-06-04)

- **Cloned + mapped this session:** Chery, GMSV, Renault, Suzuki (Suzuki needs a
  stealth re-clone — thin render).
- **Still blocked — need model-page clone targets onboarded:** Isuzu, Mitsubishi,
  Nissan, KGM. Their `products` source URLs are range/browse pages
  (e.g. Nissan `browse-range.html`), not model pages, so there is nothing
  model-specific to clone yet. Onboard a `vehicle_models` slug + model URL per OEM
  (or pass `source_url` to `clone-page`) before auditing.
- **GAC, FOTON:** untouched (live-site restriction in force).

## Implemented Generalizations

- Common scroll-reveal classes are forced visible in Clone Studio because OEM animation scripts are
  stripped. This covers Kia's `fadeInUp animated` opacity-zero block without adding a Kia-specific
  selector.
- Common carousel libraries are clipped to the desktop iframe frame and slides are capped to 100%
  width. This covers the GWM Swiper overflow and keeps the existing Ford Slick fix generalized.
- The iframe now clips document-level horizontal overflow and caps common media elements to the
  desktop frame. This covers Hyundai/GAC fixed-width media wrappers without adding OEM-specific
  class names.
- Legacy clone images whose `src` resolves to the captured source document URL are stripped at
  render time when no lazy/source fallback is available. This also covers same-origin model-year
  document routes such as Subaru `/brz/2026` when the stored source URL is `/brz`, while preserving
  query-bearing URLs and image-extension assets.

## Shim Verification

Before deploying, the new CSS shim was injected into the current production iframe after the
same-origin audit toggle:

| OEM/page | Broken | Hidden text | Overflow |
|---|---:|---:|---:|
| Kia Sportage | 0 | 0 | 0 |
| GWM Haval H6 | 0 | 0 | 0 |
| Hyundai i30 | 0 | 0 | 0 |
| GAC EMZOOM | 0 | 0 | 0 |
| LDV Deliver 7 | 0 | 0 | 0 |
| Mazda CX-5 | 0 | 0 | 0 |
| Volkswagen Tiguan | 0 | 0 | 0 |

## Repeatable Audit Harness

The hand-run browser snippet has been wrapped in `scripts/clone-studio-audit.mjs`. It uses the
authenticated Kimi WebBridge browser session, temporarily toggles the Clone Studio iframe to
`allow-scripts allow-same-origin` for inspection, records before metrics, injects the proposed shim,
then records after metrics.

```bash
node scripts/clone-studio-audit.mjs kia-au-sportage gwm-au-haval-h6 hyundai-au-i30 gac-au-emzoom
```

Useful flags:

- `--json` prints full raw audit objects, including broken image samples and overflow offenders.
- `--no-shim` records current production metrics only.
- `--settle-ms 5000` waits longer for slow image/font loads.

Smoke test on 2026-06-03:

```text
kia-au-sportage before: imgs=43 broken=0 sheets=14/12 fonts=6 hidden=0 overflow=0 after: imgs=43 broken=0 sheets=15/12 fonts=6 hidden=0 overflow=0
```

New OEM coverage audit on 2026-06-03:

```text
ldv-au-ldv-deliver-7 before: imgs=19 broken=0 sheets=2/0 fonts=0 hidden=0 overflow=0 after: imgs=19 broken=0 sheets=3/0 fonts=0 hidden=0 overflow=0
mazda-au-cx-5 before: imgs=88 broken=0 sheets=3/1 fonts=16 hidden=0 overflow=0 after: imgs=88 broken=0 sheets=4/1 fonts=16 hidden=0 overflow=0
volkswagen-au-tiguan before: imgs=35 broken=0 sheets=2/0 fonts=0 hidden=0 overflow=0 after: imgs=35 broken=0 sheets=3/0 fonts=0 hidden=0 overflow=0
```

Subaru production re-check on 2026-06-04 after `49e6d4f` and dashboard deploy
`https://f8a88ac2.oem-dashboard.pages.dev`:

```text
subaru-au-brz before: imgs=40 broken=0 sheets=82/72 fonts=279 hidden=0 overflow=0 after: not run
```

## Toyota Capture Fix

Toyota RAV4's broken images are stored with empty `srcset` values:

```html
<picture data-ty-lazy-image="" class="is-loaded">
  <source type="image/jpeg" srcset="">
  <img class="ty-responsive-background-picture-img fade-in" srcset="">
</picture>
```

Clone Studio cannot reconstruct those URLs because they are missing from the persisted clone HTML.
The live Toyota page still exposes the real values as `source[data-srcset]`, so the fix belongs in
`src/design/page-capturer.ts` or a Toyota re-capture path, not in the iframe shim.

The capturer now preserves `data-srcset` during browser capture and runs a post-capture media
normalizer before image download/storage. That normalizer restores `source[srcset]`, adds an `img`
fallback `src`/`srcset`, removes unrecoverable empty image placeholders, and queues the restored
image URL for R2 download.

Toyota RAV4 was re-captured on 2026-06-04 through the `scrapling-stealth` external HTML adapter after
Scrapling fetched the real Toyota page. Latest R2 page version is `9`. Clone Studio audit after the
recapture reported 70 images, 0 broken images, 10 stylesheets / 2 stylesheet links, 104 fonts, and
root overflow 0. The remaining hidden text blocks are Toyota mobile driveaway pricing and interior
panorama assist overlays.

## Phase 2 Same-Origin Sandbox Spike

The opaque Clone Studio iframe sandbox throttle was verified with a controlled hidden iframe probe in
the authenticated production dashboard on 2026-06-03:

| Sandbox | 1s rAF count | 1s timer count | Result |
|---|---:|---:|---|
| `allow-scripts` | 2 | 2 | Timers/rAF effectively stalled |
| `allow-scripts allow-same-origin` | 120 | 20 | Timers/rAF advanced normally |

This branch adds an opt-in same-origin sandbox path in `CloneStudioCanvas.vue`. The default remains
`allow-scripts`; enable the spike with `VITE_CLONE_STUDIO_SAME_ORIGIN=true` or the
`allowSameOriginSandbox` component prop to render the iframe as
`allow-scripts allow-same-origin`.

Keep this behind the flag until sanitizer hardening is re-reviewed. Clone Studio strips OEM scripts
and injects only its bridge, but same-origin plus scripts gives the iframe more access to the parent
if a script-bearing clone ever slips through.

## Phase 3 Style Guide Alignment

Style Guide already had click-to-copy swatches and sticky section navigation. This branch extends the
same shared `useClipboard` affordance to typography and spacing tokens:

- Primary/secondary font names copy from the Typography summary.
- Type-scale rows copy a CSS-ready token string (`font-size`, `font-weight`, `letter-spacing`,
  `line-height` when present).
- Font-file chips keep the download link and add a separate copy control for the font label.
- Spacing metric cards and spacing-scale values copy their rendered token values.

Copy icons and transient copied state are marked `data-export-ignore`, matching the swatch behavior
so PNG/PDF exports remain focused on the guide content.
