# Handoff — Clone Studio: battle-testing, interactivity, style-guide alignment

> Written 2026-06-03. Everything below is committed, pushed to `main`, and deployed. A new session
> can resume cold from this file + project memory (`project_clone_studio_v1.md`,
> `feedback_image_rendering.md`).

> Update 2026-06-04: Subaru BRZ was audited without recapture. Legacy source-document image
> placeholders are now stripped in the dashboard renderer, including model-year child routes like
> `/brz/2026`; production audit reports 40 images, 0 broken, and root overflow 0. Do not run new
> tests or writes against GAC or FOTON while their live-site restriction remains in place.

## 1. Where things stand (done & verified)

Clone Studio v1 is shipped. **Static clone fidelity is essentially maxed for Ford Mustang**, all
verified live via the Kimi WebBridge browser:

| Fix | Commit | Verified |
|---|---|---|
| Proxied `/media/` images resolved to media host (was 404 vs OEM `<base href>`) | `46fbb93` | 20/20 images load |
| OEM `.imgdesktop`/`.dsktoponly` force-shown (hidden by stripped JS) | `1c7a180` | hero/gallery render |
| OEM stylesheets emitted from `clone.stylesheet_urls` (lost on body-only edits) | `fe7a781` | 0→3 sheets, 0→7 fonts |
| Clone renders at desktop viewport (1280px, scaled) not narrow panel | `9236a3d` | 14 hidden `.onlydesktop` blocks → 0 |
| Region editor opens from live bridge selection (was deadlocked) | `3d84f64` | edit→save→reload persists |
| `section_index` persists touched regions | `6f13302` | sidebar count survives reload |
| smart-capture AI branch removed (deterministic client converter is authoritative) | `563a9ed` | — |
| Orphaned `css-to-tailwind.ts` deleted | `9b41b1c` | — |
| Style Guide: click-to-copy + sticky section nav | `0738f03`..`22fa35c` | copy + nav + active highlight |

**Key architectural finding (do not relitigate):** GSAP's requestAnimationFrame ticker AND timers
are throttled to a halt inside the `sandbox="allow-scripts"` clone iframe. `gsap.set` works,
`gsap.to`/`setInterval`-driven motion does not advance. Carousel auto-advance was therefore reverted
(`e5e0b85`); only a safe `.slick-list { overflow: hidden }` constraint remains.

## 2. PHASE 1 — Battle-test cloning across OEMs (do this FIRST)

**Why:** all fidelity fixes were validated on **Ford Mustang only**, and several are OEM/CMS-specific.
We have ~19 OEMs on different stacks (per memory: Kia=kwcms, LDV=Gatsby i-motor, GAC=Nuxt/Storyblok,
GWM=UIkit, Foton=Umbraco, etc.). The fixes likely DON'T fully generalize:

- **Ford/AEM-specific** (won't cover other OEMs): `.imgdesktop`/`.dsktoponly`/`.onlydesktop` force-show
  rules in `clone-studio-html.ts`; `.slick-list` carousel constraint. Other OEMs use different
  responsive-hide class names (Bootstrap `d-none d-md-block`, `hidden-xs`, etc.) and carousel libs
  (Swiper, etc.).
- **Should generalize:** media-base `/media/` rewrite, `stylesheet_urls` emission, desktop-viewport
  scaling. Confirm they actually do.

**Methodology (per OEM):**
1. Clone an OEM model page via the page-builder (or check an existing cloned page).
2. Open it in Clone Studio at `oem-dashboard.pages.dev/dashboard/page-builder/<slug>`.
3. Run the **clone audit** (see §5 for the exact browser-eval snippets):
   - images: `loaded` vs `broken` (naturalWidth>0)
   - stylesheets: `document.styleSheets.length` and `link[rel=stylesheet]` count loaded
   - fonts: `document.fonts.size`
   - hidden content: count `display:none`/`opacity:0` elements with >40 chars text (these are
     OEM-specific responsive-hide classes we may need to force-show)
   - horizontal overflow / layout sanity
4. Log per-OEM gaps. Where a gap is an OEM-specific hidden-content class, **generalize** the
   `clone-studio-html.ts` head CSS (or, better, find a CMS-agnostic rule — e.g. honor `display`
   only at the rendered viewport width rather than hardcoding class names).

**Suggested OEM coverage:** Ford (baseline ✓), plus a spread of stacks — Kia (kwcms), LDV (Gatsby),
Hyundai, Mazda, GWM (UIkit), Toyota/VW (the only two that use the browser renderer), and Subaru when
generated pages exist. GAC/FOTON should remain skipped unless explicitly cleared because those live
pages are in active use.

**Deliverable:** generalized fidelity rules + a short per-OEM fidelity report. Consider wiring a
lightweight automated fidelity check (the §5 audit as a repeatable script).

## 3. PHASE 2 — Restore interactivity (after Phase 1)

The remaining true gap. Pick ONE; recommendation is to spike #1 first.

1. **Same-origin preview (RECOMMENDED FIRST — cheap spike).** Add `allow-same-origin` to the clone
   iframe sandbox (in `CloneStudioCanvas.vue`), gated behind a flag. This should un-throttle
   timers/rAF so GSAP and Slick-style carousels run. **Verify GSAP `gsap.to` then actually
   animates** (ticker frame advances). **Tradeoff:** the clone is untrusted OEM HTML; with
   `allow-scripts`+`allow-same-origin` the frame can reach the parent. We DO sanitize scripts out of
   the clone body and only inject our own bridge — but review the sanitizer hardening before
   shipping. Behind a flag, low risk to spike.
2. **Interactive islands** (spec's deferred phase): detect carousels/tabs, replace each with a
   trusted Alpine/JS component. Real build.
3. **Multi-state capture:** snapshot each carousel slide / tab panel at capture time; editor flips
   between them. Capturer + storage changes.

## 4. PHASE 3 — Style guide UI/UX alignment (carry forward)

Done so far (Style Guide page): `useClipboard` composable + click-to-copy on all swatches; sticky
section nav with scroll-driven active highlight; both `data-export-ignore` (PNG/PDF export safe).

Next candidates (audit the page yourself — `dashboard/src/pages/dashboard/style-guide.vue` + the
`components/style-guide/*` set):
- Extend click-to-copy to Typography rows, Spacing values, font names (same `useClipboard` pattern).
- Per-OEM brand alignment: the style guide should visually reflect each OEM's tokens (it mostly
  does via brand header/colors). Cross-check against the cloned page's actual computed tokens.
- Empty/loading states polish; keyboard a11y on the new nav/copy buttons (focus-visible exists).

## 5. Reference — verification techniques & commands

**Browser is the Kimi WebBridge daemon** (`~/.kimi-webbridge/bin/kimi-webbridge status`). The clone
dashboard requires the user's auth session (Cloudflare Access) — only `oem-dashboard.pages.dev`
(production alias) is authenticated; preview subdomains show Sign-In. Direct `curl` to the worker API
returns 503 (CF Access gate) — that's expected, not a bug.

**Inspecting the clone iframe:** it's `sandbox="allow-scripts"` (opaque origin) — you CANNOT read its
`contentDocument` from the parent. Two ways in:
- Read the `iframe.getAttribute('srcdoc')` string (HTML only, no computed styles).
- To read computed styles / loaded assets: temporarily set
  `iframe.setAttribute('sandbox','allow-scripts allow-same-origin')` then reassign `srcdoc` to reload
  it same-origin. **Caveat:** this toggle throttles the iframe's timers/rAF, so it's useless for
  testing animation/timing — use controlled before/after screenshots for motion instead.

**Clone audit snippet** (run in page-builder, after same-origin toggle):
```js
var f=document.querySelector('iframe'), d=f.contentDocument, w=f.contentWindow
var imgs=[...d.querySelectorAll('img')]
var hidden=0;[...d.querySelectorAll('section,div')].forEach(e=>{var c=w.getComputedStyle(e);
  if((c.display==='none'||parseFloat(c.opacity)===0)&&(e.textContent||'').trim().length>40)hidden++})
JSON.stringify({imgs:imgs.length,broken:imgs.filter(i=>!(i.complete&&i.naturalWidth>0)).length,
  stylesheets:d.styleSheets.length,fonts:d.fonts.size,hiddenTextBlocks:hidden,
  innerWidth:d.documentElement.clientWidth})
```

**Read the worker's clone JSON** (to inspect `modes.clone`): use kimi `network` cmd `start` → reload →
`detail <requestId>` on `…/oem-agent/pages/<slug>?includeRendered=true&includeModes=true`.

**Build/deploy:**
- Dashboard tests: `pnpm test:dashboard` · typecheck: `pnpm run typecheck` · build: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build`
- Deploy dashboard: `pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main`
- Deploy worker (needs Docker): `pnpm run deploy`
- New deploys hit `oem-dashboard.pages.dev` but the browser caches the SPA bundle — verify the loaded
  `_slug_`/`style-guide` chunk hash matches `dashboard/dist/assets/` before trusting a screenshot.

**Key files:**
- `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts` — iframe builder
  (head CSS incl. force-show rules + `.slick-list`; `buildOemStylesheetLinkTags`;
  `rewriteProxiedMediaUrls`; bridge script + `getBodyHtml`)
- `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue` — iframe host
  (desktop-width scaling via `computeCloneFrameScale`; sandbox attr here for Phase 2 spike)
- `dashboard/src/pages/dashboard/page-builder/page-modes.ts` — `getCloneHtml`,
  `getCloneStylesheetUrls`, `getCloneRegions`
- `dashboard/src/composables/use-page-builder.ts` — clone state, `saveClone`, `cloneRegionsForSave`
- `src/design/page-capturer.ts` — Puppeteer capture (already resolves lazy/tabs/scroll; stores
  `rendered` + `stylesheet_urls`)
- `dashboard/src/composables/use-capture-injection.ts` — the LIVE client-side CSS→Tailwind converter
- `dashboard/src/composables/use-clipboard.ts` + `style-guide.vue` — style-guide UX

## 6. How to resume
Open a fresh session and say e.g.: *"Resume Clone Studio from
`docs/superpowers/HANDOFF-clone-studio-next.md` — start Phase 1, battle-test cloning across OEMs."*
