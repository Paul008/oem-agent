# Enterprise-Grade OEM Page Cloning — Design

**Date:** 2026-07-04
**Status:** Approved design, pending implementation plan
**Owner:** Paul Giurin

## 1. Purpose

Take the OEM page-cloning pipeline from its current state (VW Amarok fidelity score 16; capture returns ~1/3 of the source page) to enterprise-grade: cloned OEM product/vehicle pages that are **fully functional replicas served to end customers** on multi-tenanted dealer platforms.

"Fully functional" is scoped as: standard interactions (carousels, galleries, tabs, accordions, video, spec tables, forms) work natively. Configurator-class OEM apps (Build & Price, turntables) are **not** mirrored; they are replaced with designed native blocks fed by our own data with an enquiry/quote CTA.

## 2. Current-state diagnosis (evidence)

Fidelity report `artifacts/oem-fidelity/volkswagen-au-amarok-2026-07-03T05-26-52-900Z`:

| Metric | VW source | Our clone |
|---|---|---|
| Page height | 16,215px | 5,955px |
| Images in DOM | 113 | 31 |
| Failed requests | 0 | 3 |
| Pixel mismatch | — | 71% |

The CSS compiler defects are fixed (combinators preserved, fonts load, 0 broken images, strict smoke gate green). The remaining gap is **capture completeness**: capture leaves before VW's scroll-triggered React feature apps hydrate.

Root cause located in `src/design/page-capturer.ts`: scroll/hydration/lazy-image machinery already exists (`sweepCaptureScrollForCapture` :410, `waitForCaptureDomQuietForCapture` :505, `activateLazyMediaForCapture` :236) but the total hydration budget is ~15s:

- `CAPTURE_SCROLL_SWEEP_TIMEOUT_MS = 10_000`, 30 steps × 300ms
- `CAPTURE_DOM_QUIET_WINDOW_MS = 250`, `CAPTURE_DOM_QUIET_TIMEOUT_MS = 1_500`
- Image wait 3s, font wait 2.5s

VW feature apps fetch bundles + data on scroll-into-view and need seconds each. Capture backend is Cloudflare Browser Rendering (`@cloudflare/puppeteer`, `BROWSER` binding); alternates exist (`scrapling-stealth` allowlisted for Toyota AU, `external-html`).

## 3. Success criteria (publish gates)

A page is production-ready only when ALL pass; the pipeline refuses to publish otherwise:

| Gate | Threshold |
|---|---|
| Capture completeness | Captured DOM ≥ 95% of live source scrollHeight AND ≥ 90% of source image count |
| Visual fidelity | `qa:fidelity` score ≥ 75 on desktop and mobile (ratchets upward over time) |
| Functional smoke | Every component tagged by the recognition layer works under automation (carousel advances, tabs switch, accordions open, gallery opens, video plays) |
| Network health | 0 broken images, 0 unexpected failed requests |
| Fixture matrix | All gates green on: Volkswagen AU, Toyota AU, Mitsubishi AU, Ford AU fixture pages (one product/vehicle page per brand; VW = Amarok, remaining three selected during M1 planning) |

## 4. Architecture

Four layers strengthening the existing `AdaptivePipeline` (CLONE→SCREENSHOT→CLASSIFY→EXTRACT→VALIDATE→GENERATE→LEARN, `src/design/pipeline.ts`). No new pipeline.

### 4.1 Capture layer (`src/design/page-capturer.ts`)

1. **Paced hydration sweep** — scroll step-by-viewport with a per-step "did new content mount?" check (DOM mutation + image-count delta); total budget raised to a 90–120s ceiling with early exit when the page goes quiet.
2. **Feature-app mount-wait** — after the sweep, locate still-empty loader shells (e.g. `CmsFeatureAppLoader`, `featureAppSection` and per-OEM equivalents) and give each a bounded second chance (scroll into view + wait for mutation).
3. **Capture audit** — JSON written beside the page definition: captured vs live scrollHeight, image counts, unmounted shells with selectors, per-stage timings, backend used. This is the completeness gate input and the failure diagnostic.
4. **Fail loud** — capture below the completeness threshold fails the compile with the audit attached; a stump is never published.
5. **Per-OEM capture profiles** — brand-specific settings (wait budgets, known shell selectors, backend escalation order `cloudflare-browser → scrapling-stealth → external-html`) stored with page definitions. Escalation is automatic before declaring failure.
6. `captureSectionScreenshots()` (:2533) adopts the same scroll/lazy/hydrate helpers (it currently has none).

### 4.2 Recognition layer (CLASSIFY/EXTRACT stages)

A pattern registry of detectors that tag DOM regions: `carousel`, `tabs`, `accordion`, `gallery`, `video`, `spec-table`, `configurator-shell`, `unknown`.

- Per-OEM selector-based detectors first (reliable), generic heuristics (ARIA roles, class patterns) as fallback.
- `unknown` regions pass through untouched — only confidently recognized regions are transformed, containing misclassification risk.
- Tags are recorded in the compiled artifact manifest and drive both reconstruction and functional QA.

### 4.3 Reconstruction layer (GENERATE stage) — Alpine.js runtime

Tenant platforms span Nuxt 3/Vue 3 (`promotion-knoxgwmhaval`) and Vue 2.7 (`werribee-toyota-new`); the runtime must be host-framework-agnostic. **Alpine.js** is the runtime:

- Pinned Alpine core self-hosted inside the compiled artifact (no CDN; tenant CSPs stay clean).
- Our Alpine component library registered via `Alpine.data()`: `carousel`, `tabs`, `accordion`, `gallery`, `video`, `specTable`.
- Recognized regions keep their captured OEM markup and are **annotated** with `x-data`/`x-show`/`x-ref` directives — behavior is added, markup is preserved.
- The current guess-based bridge shims in `clone-studio-html.ts` are retired once the Alpine runtime covers their cases.
- `configurator-shell` regions are replaced with a designed native Alpine block: vehicle imagery, variant/colour/price data from Supabase `vehicle_models` embedded as a JSON data island, enquiry/quote CTA. Zero server dependency at view time.

### 4.4 Verification layer

- Existing `qa:preview` (battle test) and `qa:fidelity` (visual scoring) retained.
- New `qa:functional`: Puppeteer drives the deployed preview and exercises every component the recognition layer tagged — the manifest tells the test exactly what must work, so coverage is automatic per page.
- The pipeline's `qa` stage runs all §3 gates before `publishing`.

## 5. Ingestion contract (multi-tenant)

**Full-page artifact** (decided; section-level export explicitly out of scope for v1):

- One self-contained HTML document: inline CSS, inline/self-hosted Alpine runtime, all media rehosted to our R2/CDN — never hotlinked from OEM domains.
- `manifest.json` beside it: slug, OEM, model, components used (with selectors), asset list, QA scores, compiled-at, pipeline version.
- No OEM trackers, analytics, or cookies survive compilation.
- Tenants (Nuxt 3, Vue 2, static) serve the artifact as a whole route — same contract for every stack.

## 6. Data flow & publishing safety

```
compile trigger → capture (+audit) → classify → reconstruct (Alpine) →
assemble artifact → QA gates → publish to R2
```

Changes from today:

1. **Raw capture retained** in R2 separately from compiled output — recognition/reconstruction can re-run without re-capturing.
2. **Last-good publishing** — `pages/definitions/{oemId}/{modelSlug}/latest.json` is only overwritten on green QA; the previous good version is kept for instant rollback. End customers never see a partial compile.

## 7. Error handling

- Every stage failure lands in the existing compile-run status (`pages/compile-runs/{oemId}/{modelSlug}/latest.json`) with stage name, capture audit, and a human-readable reason — surfaced in the existing admin UI. "Rebuild failed" reads as *"capture got 61% of the page; these 4 shells never mounted"*, not just "failed".
- Backend escalation attempted automatically per OEM profile before failure is declared.
- The full stage vocabulary already defined in `src/design/compiler-contracts.ts` (queued/capturing/segmenting/compiling/qa/publishing/succeeded/failed) is actually emitted by the status writer (`src/routes/oem-agent.ts` :5348 currently records only capturing→succeeded/failed).

## 8. Testing & CI

Three tiers:

1. **Unit** — detectors and Alpine components against stored DOM fragments (vitest, no network).
2. **Fixture** — full captured-DOM snapshots per OEM committed as test fixtures; recognition + reconstruction run offline against them.
3. **Live** — `qa:preview` + `qa:fidelity` + `qa:functional` against the deployed fixture matrix.

CI wiring (`.github/workflows/`), currently absent for QA scripts:

- PRs: unit + fixture tiers (blocking).
- Deploys: live suite against the fixture matrix (blocking gate).
- Nightly: live matrix run to catch OEM-side page changes; failure files a status/alert.
- Lint: freeze the current 351-error baseline with a ratchet — new errors block, existing baseline doesn't drown signal.

## 9. Delivery milestones (each independently shippable)

| # | Milestone | Exit criteria |
|---|---|---|
| M1 | Capture completeness | Paced sweep, mount-waits, audit, fail-loud, per-OEM profiles. VW Amarok capture ≥95% height / ≥90% images; Toyota, Mitsubishi, Ford captures audited. |
| M2 | Alpine clone runtime | Recognition registry + native carousel/tabs/accordion/gallery/video; bridge shims retired; `qa:functional` green on VW Amarok. |
| M3 | Module reconstruction | Configurator-shell → native data-driven Alpine block with CTA; no dead zones on any matrix page; fidelity ≥ 75. |
| M4 | Enforcement & rollout | CI gates live, last-good publishing, nightly matrix run, lint ratchet; all §3 gates green across the matrix, enforced automatically. |

## 10. Out of scope (v1)

- Section-level ingestion/export (revisit after M4).
- Rebuilding OEM configurators with full options/pricing logic.
- Keeping OEM JavaScript apps running in clones (proxying their APIs) — rejected: fragile, ToS risk.
- Mobile-app or AMP variants.

## 11. Risks & mitigations

- **CF Browser Rendering limits still too tight for heavy pages even with tuned waits** → per-OEM backend escalation is first-class; `scrapling-stealth`/`external-html` paths already exist.
- **OEM bot detection blocks headless capture** → security-page guard already exists (`isCaptureBlockedBySecurityPage`); escalation ladder + stealth backend; worst case, a page is flagged for manual capture rather than silently degrading.
- **Detector misclassification breaks a section** → only high-confidence regions transformed; `unknown` passes through as hardened static; fixture tests pin behavior per OEM.
- **OEMs redesign pages** → nightly live matrix catches drift; recognition registry is per-OEM and versioned; raw captures retained for offline re-runs.

## 12. Related repos

- Platform/compiler: `oem-agent` (this repo — worker `src/`, dashboard `dashboard/`).
- Tenant ingest targets (contract consumers, no code changes planned in v1): `promotion-knoxgwmhaval` (Nuxt 3/CF Pages), `werribee-toyota-new` (Vue 2.7/Netlify).

> Note recorded during design: `werribee-toyota-new/package.json` embeds a GitHub PAT in the `driveagent-ui` dependency URL. Rotate that token and inject via `.npmrc`/deploy key. Independent of this project.
