# Handoff - OEM fidelity QA + Ford Mustang responsive preview fixes

> Written 2026-06-05. Current `main` is pushed to `origin/main` at `39f0071` and the dashboard is
> deployed to Cloudflare Pages production. Latest immutable Pages deployment:
> `https://819d5f51.oem-dashboard.pages.dev`.

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

## Latest verification

Commands run and passing:

```bash
pnpm exec vitest run scripts/oem-fidelity-report.test.mjs
pnpm run test:dashboard
pnpm run typecheck
env CHOKIDAR_USEPOLLING=1 pnpm -C dashboard build
git diff --check
```

Deployment:

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

Latest Pages URL: `https://819d5f51.oem-dashboard.pages.dev`

Production alias check:

```bash
curl -I 'https://oem-dashboard.pages.dev/preview/ford-au-mustang?view=production'
```

Returned HTTP 200.

Latest warmed QA report:

```bash
node scripts/oem-fidelity-report.mjs \
  --source-url https://www.ford.com.au/showroom/cars/mustang/ \
  --preview-url 'https://819d5f51.oem-dashboard.pages.dev/preview/ford-au-mustang?view=production' \
  --output-dir /private/tmp/oem-fidelity \
  --fail-on none \
  --json
```

Report path:

`/private/tmp/oem-fidelity/custom-2026-06-05T09-24-50-887Z`

Latest result:

- Overall score: `25.5/100` on the stricter warmed baseline.
- Desktop: source `1440x13039`, preview `1440x11798`, mismatch `63.07%`.
- Tablet: source `820x13833`, preview `820x14156`, mismatch `54.94%`.
- Mobile: source `390x11031`, preview `390x11787`, mismatch `71.45%`.
- Preview network failures: none.
- Preview broken images: none.
- Ford mobile Disclosures block is now collapsed in preview.

## Important interpretation notes

- The QA score is intentionally strict and full-page pixel diff is noisy. It currently penalizes:
  - intentional saved-content differences such as preview using `Enquire` where Ford source uses
    `Compare`
  - tiny line-height/clientHeight differences reported as clipped text
  - source footer/header behavior and lazy-load timing differences
  - carousel/card state differences below the fold
- Use the generated `ai-review-prompt.md` plus screenshots for vision review. The script does not
  yet call a model directly; it prepares the prompt/artifacts for an AI reviewer.
- The warmed baseline should be the default going forward. Comparing new runs to pre-warm reports is
  misleading because the source page was underloaded before `39f0071`.

## Remaining frontier

Recommended next slice:

1. Tighten clipped-text detection to reduce false positives:
   - ignore huge containers whose children are the real text nodes
   - require a meaningful overflow threshold, not 2-4px line-height drift
   - report text elements separately from layout wrappers
2. Improve carousel/card normalization:
   - desktop/tablet Slick tracks still produce width/height clipped-text findings
   - lower Ford card/news/model sections still account for much of the diff
3. Add optional real AI review:
   - `--ai-review` could send screenshots + `ai-review-prompt.md` to the configured model
   - store `ai-review.json` beside `report.json`
   - make the AI output advisory, not the CI gate
4. Broaden the QA matrix beyond Ford Mustang:
   - run against one Hyundai/Kia/Mazda model page and one non-AEM OEM page
   - keep `--fail-on none` until baseline thresholds are calibrated

## Files to inspect first

- QA runner: `scripts/oem-fidelity-report.mjs`
- QA tests: `scripts/oem-fidelity-report.test.mjs`
- Clone preview bridge/CSS: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
- Bridge tests: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`
- Worker media proxy CSS rewriting: `src/routes/media.ts`
- QA docs: `docs/OEM_FIDELITY_QA.md`
