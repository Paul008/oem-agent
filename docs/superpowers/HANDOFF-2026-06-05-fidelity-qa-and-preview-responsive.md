# Handoff - OEM fidelity QA + Ford Mustang responsive preview fixes

> Written 2026-06-05; updated later the same day. Earlier deployed baseline:
> `https://819d5f51.oem-dashboard.pages.dev`. Later follow-ups added calibrated text-audit
> filtering, unpaired mobile typography fallback, tablet layout/config replay fixes, and final
> production deployment. Latest immutable Cloudflare Pages deployment:
> `https://d037c285.oem-dashboard.pages.dev`.

## What shipped

### 1. Automated OEM fidelity QA report

Commit: `350929b feat(dashboard): add OEM fidelity QA report`

- Root script: `pnpm qa:fidelity` -> `node scripts/oem-fidelity-report.mjs`.
- Captures source and preview at desktop/tablet/mobile with Puppeteer/Chrome.
- Produces:
  - full-page `source-*.png`, `preview-*.png`, `diff-*.png`
  - `report.json`
  - `report.md`
  - `ai-review-prompt.md`
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

Latest Pages URL: `https://d037c285.oem-dashboard.pages.dev`

Production alias check:

```bash
curl -I 'https://oem-dashboard.pages.dev/preview/ford-au-mustang?view=production'
```

Returned HTTP 200.

Latest warmed QA report:

```bash
node scripts/oem-fidelity-report.mjs \
  --source-url https://www.ford.com.au/showroom/cars/mustang/ \
  --preview-url 'https://d037c285.oem-dashboard.pages.dev/preview/ford-au-mustang?view=production' \
  --output-dir /private/tmp/oem-fidelity \
  --fail-on none \
  --json
```

Report path:

`/private/tmp/oem-fidelity/custom-2026-06-05T18-07-29-954Z`

Latest result:

- Overall score: `55.7/100` on the stricter warmed baseline.
- Desktop: source `1440x13039`, preview `1440x11798`, mismatch `63.07%`.
- Tablet: source `820x13833`, preview `820x12627`, mismatch `36.61%`.
- Mobile: source `390x11031`, preview `390x11220`, mismatch `57.54%`.
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

1. Improve carousel/card normalization:
   - lower Ford card/news/model sections still account for much of the diff
   - compare source/preview active card counts and initial slide state
   - keep existing bridge controls, but make initial visible windows closer to Ford source
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

## Files to inspect first

- QA runner: `scripts/oem-fidelity-report.mjs`
- QA tests: `scripts/oem-fidelity-report.test.mjs`
- Clone preview bridge/CSS: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
- Bridge tests: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`
- Worker media proxy CSS rewriting: `src/routes/media.ts`
- QA docs: `docs/OEM_FIDELITY_QA.md`
