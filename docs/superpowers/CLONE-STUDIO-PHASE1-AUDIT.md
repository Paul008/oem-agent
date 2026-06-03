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
| Toyota RAV4 | browser-rendered responsive media | 49 | 16 after delayed load | 10 sheets / 2 links | 104 | 1 | 0 | Fixed in capturer; needs re-capture |
| Hyundai i30 | AEM/Swiper/fixed-width wrappers | 34 | 0 | 10 sheets / 8 links | 0 | 0 | 597px | Fixed by carousel shim + frame guard |
| GAC EMZOOM | Nuxt/Swiper/responsive media | 23 | 0 | 13 sheets / 11 links | 0 | 0 | 511px | Fixed by carousel/media shim |
| LDV Deliver 7 | Gatsby/i-motor | 19 | 0 | 2 sheets / 0 links | 0 | 0 | 0 | Pass |
| Mazda CX-5 | Mazda SSR/static assets | 88 | 0 | 3 sheets / 1 link | 16 | 0 | 0 | Pass |
| Volkswagen Tiguan | VW model page | 35 | 0 | 2 sheets / 0 links | 0 | 0 | 0 | Pass |

Generated page slug discovery through the authenticated dashboard initially showed existing Clone
Studio pages for Ford, Kia, GWM, Toyota, Hyundai, and GAC only. LDV, Mazda, and Volkswagen had zero
generated page slugs, so representative zero-AI `clone-page` captures were created for:

- `ldv-au/ldv-deliver-7` from `https://www.ldvautomotive.com.au/vehicles/ldv-deliver-7/`
- `mazda-au/cx-5` from `https://www.mazda.com.au/cars/cx-5/`
- `volkswagen-au/tiguan` from `https://www.volkswagen.com.au/en/models/tiguan.html`

These writes created the corresponding R2 `pages/definitions/{oem}/{slug}/latest.json` clone pages
and proxied page assets. They did not run the AI structuring/adaptive pipeline.

## Implemented Generalizations

- Common scroll-reveal classes are forced visible in Clone Studio because OEM animation scripts are
  stripped. This covers Kia's `fadeInUp animated` opacity-zero block without adding a Kia-specific
  selector.
- Common carousel libraries are clipped to the desktop iframe frame and slides are capped to 100%
  width. This covers the GWM Swiper overflow and keeps the existing Ford Slick fix generalized.
- The iframe now clips document-level horizontal overflow and caps common media elements to the
  desktop frame. This covers Hyundai/GAC fixed-width media wrappers without adding OEM-specific
  class names.

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
fallback `src`/`srcset`, and queues the restored image URL for R2 download. Existing Toyota clones
still need to be re-captured because their persisted HTML already lost the original URLs.

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
