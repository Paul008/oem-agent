# Handoff - OEM fidelity QA + Ford Mustang responsive preview fixes

> Written 2026-06-05; updated later the same day. Earlier deployed baseline:
> `https://819d5f51.oem-dashboard.pages.dev`. Later follow-ups added calibrated text-audit
> filtering, unpaired mobile typography fallback, tablet layout/config replay fixes, and final
> production deployment. Latest immutable Cloudflare Pages deployment:
> `https://f53d6e87.oem-dashboard.pages.dev`.

## What shipped

### 1. Automated OEM fidelity QA report

Commits:

- `350929b feat(dashboard): add OEM fidelity QA report`
- `5e9fd67 feat(qa): report worst visual diff bands`

- Root script: `pnpm qa:fidelity` -> `node scripts/oem-fidelity-report.mjs`.
- Captures source and preview at desktop/tablet/mobile with Puppeteer/Chrome.
- Produces:
  - full-page `source-*.png`, `preview-*.png`, `diff-*.png`
  - `report.json`
  - `report.md`
  - `ai-review-prompt.md`
- `report.json` and `report.md` now include 1000px vertical diff bands. Use the worst bands to
  identify which page region is actually driving a full-page mismatch.
- Checks:
  - network failures / bad responses
  - broken visible images
  - horizontal overflow
  - clipped/overflowing text
  - low contrast text
  - page-size mismatch
  - high screenshot diff
  - largest desktop/mobile image reuse
- Preview routes are public read-only for automation:
  - `dashboard/src/router/guard/auth-guard.ts` honors `to.meta.auth === false`.
  - `dashboard/src/pages/preview.vue` and `dashboard/src/pages/preview/[slug].vue` set
    `meta.auth: false`.
  - Preview toolbar has `data-oem-preview-toolbar="true"` so the QA runner can hide it.
- Docs: `docs/OEM_FIDELITY_QA.md`.

### 2. Source stylesheet/font proxying for preview fidelity

Commit: `d15872d fix(dashboard): proxy clone stylesheet assets`

- `clone-studio-html.ts` now proxies captured OEM stylesheet links and preserved `<style> url(...)`
  assets through the Worker media proxy when the host is allowlisted.
- `src/routes/media.ts` rewrites CSS `url(...)` tokens to proxied `/media/{oemId}/{encoded}` URLs.
- This fixed the Ford font/CSS failures discovered by the first report.
- Worker deploy completed:
  - Worker URL: `https://oem-agent.adme-dev.workers.dev`
  - Version ID: `82d34796-09f0-49e7-8eb5-4df1aa9c7278`

### 3. Mobile responsive image recovery and AEM overflow containment

Commit: `c7acc11 fix(dashboard): recover mobile clone image variants`

- Fixed narrow mobile overflow caused by `.cmp-richtext { width:100% }` plus percentage mobile
  margins inside AEM grids.
  - `.aem-Grid .cmp-richtext` now uses `width:auto` at phone widths.
- Bridge responsive image recovery now handles Ford/AEM cases where the mobile sibling uses the
  exact same asset URL as the desktop image.
  - Adds same-source recovery after derived `desktop -> mobile` URL candidates.
  - Includes `.mobileonly` in responsive variant detection.
- Result on the old non-warmed QA baseline:
  - overall score moved from `20` to `26`
  - mobile clipped-text findings dropped from `25` to `16`
  - the 16px nested mobile overflow disappeared.

### 4. More truthful QA baseline + Ford disclosure initial state

Commit: `39f0071 fix(dashboard): collapse Ford disclosure accordions`

- QA runner now warms lazy media before capture by:
  - setting `img[loading="lazy"]` to eager
  - scrolling through the document
  - returning to top before screenshot/audit
  - opt-out: `--no-load-lazy-media`
- This corrected the Ford source baseline, where full-page screenshots previously missed lazy
  lower-page images.
- Clone Studio bridge now starts AEM `data-view="disclosure"` accordions collapsed, matching Ford's
  live mobile Disclosures block, while leaving normal FAQ accordion behavior intact.

### 5. Calibrated text overflow audit

Commit: `311fb04 fix(qa): reduce clipped text false positives`

- `scripts/oem-fidelity-report.mjs` now audits clipped text only on meaningful text-bearing nodes.
- Wrapper-only overflow such as Slick tracks or `div.contentHolder` no longer creates false clipped
  text findings.
- Latest warmed Ford run after this calibration reported:
  - no clipped-text findings
  - no broken images
  - no preview network failures
  - remaining findings were full-page visual/page-size mismatch only.

### 6. Unpaired mobile typography fallback

Commit: `a31f71c fix(dashboard): scale unpaired mobile text variants`

- `clone-studio-html.ts` now scales unpaired `onlydesktop` Ford/AEM display typography at mobile
  widths when the real `onlymobile` partner was not captured.
- Paired responsive content is untouched: desktop text still hides when a mobile sibling exists.
- The fallback targets the cases observed in the Ford Mustang preview drift:
  - `display1-medium` hero text -> mobile heading scale
  - `display2-medium` feature headlines -> mobile heading scale
  - `display3-medium` h2/h3 headline blocks -> title/heading scale by context
  - gray `body3` captions -> caption scale
- `dashboard/vite.config.ts` explicitly sets `VueRouter({ watch: !isProduction })` so normal
  production builds do not start route watchers and hit local `EMFILE` file-descriptor limits.

### 7. Bridge style refresh + tablet-inclusive AEM layout

Commits:

- `1f0f9ee fix(dashboard): scale unpaired mobile subtitles`
- `676cbdd fix(dashboard): refresh clone bridge styles`
- `0a7d988 fix(dashboard): match unpaired subtitle nodes`
- `348b9b1 fix(dashboard): apply clone mobile layout on tablet`

- Bridge styles now carry `data-clone-studio-bridge-style="2026-06-05-responsive-text-v3"`.
- Saved clone heads drop stale generated Clone Studio bridge styles containing private
  `data-clone-studio-*` markers, so old bridge CSS does not survive into new previews.
- Ford hero subtitle fallback selector now self-targets unpaired desktop `p.heading3-medium`,
  matching the actual saved node shape.
- Ford/AEM mobile-layout replay now runs through `1023.98px`, not only phone widths:
  - carousel slide windows become one-up on tablet
  - AEM split-grid offset/overflow reset applies on tablet
  - dynamic `data-config` mobile spacing replay applies on tablet
- Result after `348b9b1` deploy (`https://df41ccca.oem-dashboard.pages.dev`):
  - Overall score: `52.9`
  - Tablet mismatch improved from `62.25%` to `45.82%`
  - Mobile stayed stable at `58.63%`

### 8. AEM richtext mobile config replay target

Kept commits:

- `1df4984 fix(dashboard): target AEM richtext responsive config`
- `dec13b6 fix(dashboard): strengthen AEM config replay selector`

Reverted experiment:

- `9d234dc fix(dashboard): match AEM tablet heading fallback`
- `b86cc2b Revert "fix(dashboard): match AEM tablet heading fallback"`

- Ford stores mobile spacing for the blue richtext/stat panels on the inner `.cmp-richtext`
  `data-config`, but the live source resolves the percentage padding/margins on the owning
  `.richtext.aem-GridColumn` wrapper.
- `installResponsiveConfigRules()` now retargets `.cmp-richtext[data-config]` replay to that AEM
  grid-column wrapper.
- Generated config selectors now include `.aem-Grid [data-clone-studio-responsive-config-id="..."]`
  so the replayed rule beats the bridge's own AEM safety reset specificity.
- The tablet heading-size experiment made the local text anchor closer but worsened the full-page
  QA score (`55.5` overall, tablet `37.17%`), so it was reverted. Do not repeat that exact
  typography override unless it is paired with a column-width fix and validated by full QA.
- Result after final deploy (`https://d037c285.oem-dashboard.pages.dev`):
  - Overall score: `55.7`
  - Tablet mismatch improved to `36.61%`
  - Mobile mismatch improved to `57.54%`
  - No preview broken images, network failures, or clipped-text findings.

### 9. Ford brandcard responsive target + sameheight normalization

Commits:

- `231abdc fix(dashboard): retarget brandcard responsive config`
- `eadf853 fix(dashboard): normalize Ford brandcard mobile cards`

- Ford stores the mobile padding config on `.brandcardComponent`, but the live source applies the
  resolved padding to `.brandcard-holder`. `responsiveConfigTarget()` now retargets that specific
  replay to `.brandcard-holder`.
- The retarget fixed holder geometry but exposed a second issue: saved clone cards retained fixed
  `.brandcard-image.sameheight` heights from the captured state. At tablet this compressed model
  cards; at phone widths it could over-expand news/model cards.
- The bridge CSS now scopes a Ford/AEM brandcard sameheight fallback below desktop:
  - `.brandcardComponent .brandcard-image.sameheight` uses `aspect-ratio: 1.326 / 1`, `height:auto`,
    and `overflow:hidden`
  - unpaired `.brandcardComponent h3.heading3-medium` desktop fallback scales to the mobile
    `20px/24px` heading size
- Focused deployed probe against `https://f53d6e87.oem-dashboard.pages.dev` at `820x1180`:
  - Source Mustang News slide: `x=41`, `w=739`, `h=782`; preview: `x=41`, `w=754`, `h=793`
  - Source Mustang Models slide: `x=41`, `w=739`, `h=758`; preview: `x=41`, `w=754`, `h=769`
  - Holder padding now matches source: `131.188px 32.7969px 164px`
- Full QA score recovered from the intermediate bad deploy (`53.2`) to `55.1`, but remains slightly
  below the prior `55.7` because the accidental extra carousel height had been helping full-page
  mobile/scroll alignment. Keep the current code unless the next pass explicitly optimizes only for
  raw full-page score rather than local component fidelity.

## Latest verification

Commands run and passing:

```bash
pnpm exec vitest run scripts/oem-fidelity-report.test.mjs
pnpm run test:dashboard -- clone-studio-html
pnpm run test:dashboard
pnpm run typecheck
pnpm --dir dashboard build
git diff --check
```

Deployment:

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

Latest Pages URL: `https://f53d6e87.oem-dashboard.pages.dev`

Production alias check:

```bash
curl -I 'https://oem-dashboard.pages.dev/preview/ford-au-mustang?view=production'
```

Returned HTTP 200.

Latest warmed QA report:

```bash
node scripts/oem-fidelity-report.mjs \
  --source-url https://www.ford.com.au/showroom/cars/mustang/ \
  --preview-url 'https://f53d6e87.oem-dashboard.pages.dev/preview/ford-au-mustang?view=production' \
  --output-dir /private/tmp/oem-fidelity \
  --fail-on none \
  --json
```

Report path:

`/private/tmp/oem-fidelity/custom-2026-06-05T18-59-11-875Z`

Latest result:

- Overall score: `55.1/100` on the stricter warmed baseline.
- Desktop: source `1440x13039`, preview `1440x11798`, mismatch `63.07%`.
- Tablet: source `820x13833`, preview `820x12643`, mismatch `38.51%`.
- Mobile: source `390x11031`, preview `390x10606`, mismatch `61.18%`.
- Worst bands from the latest report:
  - desktop: `10000-11000px 83.0%`, `9000-10000px 81.9%`, `2000-3000px 77.2%`
  - tablet: `9000-10000px 69.4%`, `8000-9000px 58.2%`, `7000-8000px 56.3%`
  - mobile: `8000-9000px 83.7%`, `7000-8000px 82.9%`, `5000-6000px 82.1%`
- Preview network failures: none.
- Preview broken images: none.
- Preview clipped-text findings: none after the calibrated text audit.
- Ford mobile Disclosures block is now collapsed in preview.

## Important interpretation notes

- The QA score is intentionally strict and full-page pixel diff is noisy. It currently penalizes:
  - intentional saved-content differences such as preview using `Enquire` where Ford source uses
    `Compare`
  - source footer/header behavior and lazy-load timing differences
  - carousel/card state differences below the fold
- Clipped-text detection is now scoped to real text-bearing elements and meaningful overflow, so
  wrapper nodes and tiny line-height/clientHeight drift no longer pollute the findings.
- Use the generated `ai-review-prompt.md` plus screenshots for vision review. The script does not
  yet call a model directly; it prepares the prompt/artifacts for an AI reviewer.
- The warmed baseline should be the default going forward. Comparing new runs to pre-warm reports is
  misleading because the source page was underloaded before `39f0071`.

## Remaining frontier

Recommended next slice:

1. Improve lower-page/footer and residual carousel alignment:
   - current brandcard card dimensions are locally close after `eadf853`
   - source still carries footer/legal blocks and lower-page disclosure/footer state that the clone
     does not match, especially on mobile
   - next quick probe should compare the bottom 1500px and decide whether to normalize footer/legal
     capture, exclude chrome/footer from QA, or accept that delta as out of scope
2. Add optional real AI review:
   - `--ai-review` could send screenshots + `ai-review-prompt.md` to the configured model
   - store `ai-review.json` beside `report.json`
   - make the AI output advisory, not the CI gate
   - Cloudflare Dynamic Workers are worth considering for isolated on-demand QA/code-mode workers:
     run generated comparison/review code with scoped bindings, logs, network controls, and limits
     instead of pushing all artifacts through a model prompt.
3. Broaden the QA matrix beyond Ford Mustang:
   - run against one Hyundai/Kia/Mazda model page and one non-AEM OEM page
   - keep `--fail-on none` until baseline thresholds are calibrated

## 2026-06-09 Mitsubishi baseline

Mitsubishi is now the second Clone Studio fidelity brand.

What changed:

- Added repeatable target manifest and runners:
  - `scripts/mitsubishi-clone-targets.json`
  - `scripts/clone-mitsubishi-pages.mjs`
  - `scripts/run-mitsubishi-fidelity.mjs`
- Added `capture_backend: "external-html"` in the worker capture path.
  - Purpose: allow a real authenticated browser capture to feed Clone Studio when Cloudflare Browser
    receives a security-verification page.
  - `scrapling-stealth` remains Toyota-only; `external-html` is not Scrapling.
- Narrowed security-page detection so normal model pages are not rejected because vendor scripts
  contain bot-verification copy.
- Hardened `scripts/oem-fidelity-report.mjs` so very large PNG decode failures write a structured
  `screenshot-decode-failed` finding instead of aborting the whole report.

Deployment and clone status:

- Worker deployed after external HTML support:
  - Version: `fae66ebd-6134-4dc0-a704-5ee87489fffe`
  - URL: `https://oem-agent.adme-dev.workers.dev`
- Five Mitsubishi pages cloned to R2 through browser-captured external HTML:
  - ASX: `pages/definitions/mitsubishi-au/asx/latest.json`
  - Outlander: `pages/definitions/mitsubishi-au/outlander/latest.json`
  - Eclipse Cross: `pages/definitions/mitsubishi-au/eclipse-cross/latest.json`
  - Triton: `pages/definitions/mitsubishi-au/triton/latest.json`
  - Pajero Sport: `pages/definitions/mitsubishi-au/pajero-sport/latest.json`

Current dashboard preview origin used for baseline:

`https://bc9f2486.oem-dashboard.pages.dev`

Baseline command:

```bash
node scripts/run-mitsubishi-fidelity.mjs \
  --preview-origin=https://bc9f2486.oem-dashboard.pages.dev \
  --continue-on-error
```

Latest full baseline reports:

| Model | Source | Score | Findings | Report |
| --- | --- | ---: | ---: | --- |
| ASX | `https://www.mitsubishi-motors.com.au/vehicles/asx.html` | `41.5/100` | `13` | `/private/tmp/oem-fidelity/mitsubishi/custom-2026-06-09T01-51-12-720Z` |
| Outlander | `https://www.mitsubishi-motors.com.au/vehicles/outlander.html` | `41.3/100` | `16` | `/private/tmp/oem-fidelity/mitsubishi/custom-2026-06-09T01-52-25-480Z` |
| Eclipse Cross | `https://www.mitsubishi-motors.com.au/vehicles/eclipse-cross.html` | `42.5/100` | `14` | `/private/tmp/oem-fidelity/mitsubishi/custom-2026-06-09T01-53-31-988Z` |
| Triton | `https://www.mitsubishi-motors.com.au/vehicles/triton.html` | `44.7/100` | `10` | `/private/tmp/oem-fidelity/mitsubishi/custom-2026-06-09T01-54-40-294Z` |
| Pajero Sport | `https://www.mitsubishi-motors.com.au/vehicles/pajero-sport.html` | `46.0/100` | `11` | `/private/tmp/oem-fidelity/mitsubishi/custom-2026-06-09T01-55-42-989Z` |

Observed Mitsubishi-specific fidelity issues:

- Direct Mitsubishi responsive image URLs can remain in cloned markup and abort during preview
  screenshot capture, especially hero/mobile art direction URLs.
- The media proxy returns `403` for a Google Material Icons font URL captured through Mitsubishi CSS.
- Preview heights are consistently taller than source. ASX example from first successful report:
  source mobile `390x14018`, preview mobile `390x15289`.
- Footer/widget state differs from source; source mobile footer accordions and preview static DOM state
  are not yet normalized.
- Large desktop PNG comparisons can hit browser image decode limits. The QA fallback now records this
  as a critical finding instead of losing the whole report.

Recommended next Mitsubishi fixes:

1. Normalize or proxy Mitsubishi responsive `srcset`/`picture` URLs during external HTML capture so
   mobile hero and AEM `coreimg` candidates do not leak back to the live site.
2. Fix media proxy handling for third-party font assets or exclude Material Icons font failures from
   critical preview findings when icons render acceptably.
3. Compare source/preview lower-page widget state and decide whether footer accordions should be
   collapsed, expanded, or hidden from model-page fidelity gates.
4. Re-run the full Mitsubishi matrix after each generic Clone Studio bridge change to ensure Ford
   improvements do not regress non-Ford AEM captures.

## Files to inspect first

- QA runner: `scripts/oem-fidelity-report.mjs`
- QA tests: `scripts/oem-fidelity-report.test.mjs`
- Mitsubishi target manifest: `scripts/mitsubishi-clone-targets.json`
- Mitsubishi runners: `scripts/clone-mitsubishi-pages.mjs`, `scripts/run-mitsubishi-fidelity.mjs`
- Clone preview bridge/CSS: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
- Bridge tests: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`
- Worker media proxy CSS rewriting: `src/routes/media.ts`
- QA docs: `docs/OEM_FIDELITY_QA.md`
