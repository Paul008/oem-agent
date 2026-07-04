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
3. **Capture audit** — extends the existing `capture-diagnostics.ts` store (`pages/diagnostics/{oem}/{slug}/latest.json`, history of 20) with: captured vs live scrollHeight, image counts, unmounted shells with selectors, per-stage timings. Backend/timing/size fields already exist there — add, don't replace. This is the completeness gate input and the failure diagnostic.
4. **Fail loud** — capture below the completeness threshold fails the compile with the audit attached; a stump is never published.
5. **Per-OEM capture profiles** — today backend selection is a call-site param with `scrapling-stealth` hardcoded to toyota-au (`page-capturer.ts` :1690); there is no declarative routing. Profiles add it: brand-specific settings (wait budgets, known shell selectors, backend escalation order `cloudflare-browser → scrapling-stealth → external-html`) stored with page definitions. Escalation is automatic before declaring failure.
6. `captureSectionScreenshots()` (:2533) adopts the same scroll/lazy/hydrate helpers (it currently has none).

### 4.2 Recognition layer (CLASSIFY/EXTRACT stages)

A pattern registry of detectors that tag DOM regions: `carousel`, `tabs`, `accordion`, `gallery`, `video`, `spec-table`, `configurator-shell`, `unknown`.

- **Extends `src/design/section-parser.ts`**, which already has deterministic DOM detectors (`detectHero`, `detectGallery`, `detectCardGrid`, `detectCtaBanner`, `detectHeading`) — add the interaction-oriented detectors there rather than creating a parallel registry.
- The existing AI-vision CLASSIFY step (Groq screenshot classification, `pipeline.ts` :534) stays as enrichment/fallback; today its carousel/tab detections are non-persisted. The gap being closed: deterministic DOM-region tags, **persisted into the artifact manifest**.
- Per-OEM selector-based detectors first (reliable), generic heuristics (ARIA roles, class patterns) as fallback.
- `unknown` regions pass through untouched — only confidently recognized regions are transformed, containing misclassification risk.
- Tags drive both reconstruction and functional QA.
- Non-reuse note: `orchestrator.ts` "section detection" (:2422+) classifies network API responses, not DOM regions — it is not a base for this layer.

### 4.3 Reconstruction layer (GENERATE stage) — Alpine.js runtime

Tenant platforms span Nuxt 3/Vue 3 (`promotion-knoxgwmhaval`) and Vue 2.7 (`werribee-toyota-new`); the runtime must be host-framework-agnostic. **Alpine.js** is the runtime — and this direction is already seeded in the codebase: `src/design/compiler-contracts.ts` declares the `alpine` runtime adapter, the `alpine-island` render target, and `INTERACTION_TYPES` (`carousel`, `tabs`, `accordion`, `sticky-bar`, `vehicle-360`, `variant-color-explorer`, `finance-calculator`). **Build on these contracts; do not define new job/target/interaction types.**

- Pinned Alpine core self-hosted inside the compiled artifact (no CDN; tenant CSPs stay clean).
- Our Alpine component library registered via `Alpine.data()`, keyed by `INTERACTION_TYPES`.
- Recognized regions keep their captured OEM markup and are **annotated** with `x-data`/`x-show`/`x-ref` directives — behavior is added, markup is preserved.
- **This is a port, not a green-field build**: `clone-studio-html.ts` `enableInteractivity()` (:2573) is a working JS interaction runtime (tab wiring :2773, carousel :2814 incl. fabricated control bars :2629, accordion :2933, gallery :2888, dropdown :2910, responsive image/content variant handling :2066/:2395). Its behaviors and its test assertions (`clone-studio-html.test.ts`) are the migration checklist. It is retired once the Alpine runtime covers its cases. Editor-only features (resize handles, inline edit, region messaging) stay in the dashboard and are NOT ported.
- **Scope guard against triple implementation**: the 35 native Vue section components (`dashboard/src/pages/dashboard/components/sections/`, using embla/gsap) keep their own interactivity. Alpine applies only to the captured-OEM-markup (clone) path.
- Consolidation: `page-modes.ts` is duplicated between `src/design/` and `dashboard/src/pages/dashboard/page-builder/`; unify to one shared module while touching this path.
- `configurator-shell` regions are replaced with a designed native Alpine block: vehicle imagery + variant/price data from Supabase (`vehicle_models` for the model, `products` for variants/prices, `variant_colors` for colours) embedded as a JSON data island, enquiry/quote CTA. Zero server dependency at view time.

### 4.4 Verification layer

- Existing `qa:preview` (battle test) and `qa:fidelity` (visual scoring) retained.
- New `qa:functional`: Puppeteer drives the deployed preview and exercises every component the recognition layer tagged — the manifest tells the test exactly what must work, so coverage is automatic per page.
- The pipeline's `qa` stage runs all §3 gates before `publishing`.

## 5. Ingestion contract (multi-tenant)

**Full-page artifact** (decided; section-level export explicitly out of scope for v1):

- One self-contained HTML document: inline CSS, inline/self-hosted Alpine runtime, all media rehosted to our R2/CDN — never hotlinked from OEM domains. The emitter formalizes the existing `buildStandaloneHtml()` path (`dashboard/src/pages/dashboard/preview/[slug].vue` :293), which already produces a self-contained document, moving it into the compile pipeline so the artifact is produced server-side at publish time.
- Media rehosting **extends `downloadImages()`** (`page-capturer.ts` :2418 — images/video → R2 `pages/assets/` with per-OEM Origin/Referer headers already works). Known gaps to close: `url()` assets inside external CSS are not rehosted, fonts are a curated allowlist (`hosted-oem-fonts.ts`) rather than auto-downloaded, srcset rehosting is best-effort.
- `manifest.json` **extends the existing production manifest** (`oem-agent.ts` :2295 — already has slug/oem/model/version/html_sha256/etag/scope). Add: asset list, section/interaction inventory (the recognition tags), QA scores, pipeline version.
- No OEM trackers, analytics, or cookies survive compilation.
- Tenants (Nuxt 3, Vue 2, static) serve the artifact as a whole route — same contract for every stack.

## 6. Data flow & publishing safety

```
compile trigger → capture (+audit) → classify → reconstruct (Alpine) →
assemble artifact → QA gates → publish to R2
```

Changes from today:

1. **Raw capture retained** in R2 separately from compiled output — recognition/reconstruction can re-run without re-capturing.
2. **Last-good publishing** — versioned snapshots already exist (every write dual-writes `latest.json` + `v{timestamp}.json`, `page-capturer.ts` :1825 and five route sites) but are write-only today. Add the missing half: list/read/restore of snapshots, and only overwrite `latest.json` on green QA — previous good version restorable instantly. End customers never see a partial compile.

## 7. Error handling

- Every stage failure lands in the existing compile-run status (`pages/compile-runs/{oemId}/{modelSlug}/latest.json`) with stage name, capture audit, and a human-readable reason — surfaced in the existing admin UI. "Rebuild failed" reads as *"capture got 61% of the page; these 4 shells never mounted"*, not just "failed".
- Backend escalation attempted automatically per OEM profile before failure is declared.
- The full stage vocabulary already defined in `src/design/compiler-contracts.ts` (queued/capturing/segmenting/compiling/qa/publishing/succeeded/failed) is actually emitted by the status writer (`src/routes/oem-agent.ts` :5348 currently records only capturing→succeeded/failed).

## 8. Testing & CI

Three tiers:

1. **Unit** — detectors and Alpine components against stored DOM fragments (vitest, no network).
2. **Fixture** — full captured-DOM snapshots per OEM committed as test fixtures; recognition + reconstruction run offline against them.
3. **Live** — `qa:preview` + `qa:fidelity` + `qa:functional` against the deployed fixture matrix.

`qa:functional` is built by first extracting a shared QA lib from `scripts/oem-fidelity-report.mjs` (its `captureHtmlTarget`, `collectAudit`, `warmLazyMedia`, `settlePage`, `scoreCapturePair` are the reuse base) — the two existing QA scripts currently copy-paste browser plumbing (`resolveBrowserExecutable`, `timestampForPath`), and a third copy is not acceptable. Note: the existing CI e2e job (`cctr test/e2e`) covers worker/bot infra, not preview interactivity — `qa:functional` is net-new coverage, not overlap.

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

## 13. Reuse map (verified inventory, 2026-07-04)

What exists vs what each milestone extends. Sourced from a two-agent code inventory plus the graphify architecture graph (`graphify-out/`).

| Capability | Exists today | We extend / close the gap |
|---|---|---|
| Scroll/hydrate/lazy capture | `page-capturer.ts` sweep + DOM-quiet + lazy-media helpers | Raise ~15s budget to paced 90–120s sweep; feature-app mount-waits (M1) |
| Capture diagnostics | `capture-diagnostics.ts` (backend, timings, sizes, history 20) | Add heights/image counts/unmounted shells → completeness gate (M1) |
| Backend alternatives | `scrapling-stealth` (toyota-au hardcoded), `external-html` | Declarative per-OEM profiles + automatic escalation (M1) |
| DOM region detection | `section-parser.ts` (`detectHero/Gallery/CardGrid/CtaBanner`) | Add interaction detectors; persist tags to manifest (M2) |
| AI section classification | pipeline CLASSIFY (Groq vision, non-persisted) + EXTRACT (Gemini `PageSection[]`) | Keep as enrichment; deterministic tags become source of truth (M2) |
| Interaction runtime | `enableInteractivity()` in `clone-studio-html.ts` (tabs/carousel/accordion/gallery/dropdown + responsive variants) | Port to Alpine per `compiler-contracts.ts` `INTERACTION_TYPES`; then retire (M2) |
| Compiler contracts | `compiler-contracts.ts`: job statuses, `alpine` adapter, `alpine-island` target, interaction types | Use as-is — no new type definitions (M2/M3) |
| Native section components | 35 Vue sections (embla/gsap) + clone→Tailwind converter | Untouched; Alpine is clone-path only (guard, M2) |
| Self-contained HTML emit | `buildStandaloneHtml()` in preview page (client-side) | Move into pipeline as the artifact emitter (M3) |
| Media rehosting | `downloadImages()` → R2 with per-OEM headers | Add CSS `url()` assets, font auto-rehost, srcset completeness (M3) |
| Production manifest | slug/version/sha256/etag/scope | Add assets, section/interaction inventory, QA scores (M3) |
| Version snapshots | Dual-write `latest.json` + `v{ts}.json` (write-only) | Add list/restore + publish-on-green-only (M4) |
| Visual QA | `oem-fidelity-report.mjs` (audit, pixel diff, 100-pt score) | Extract shared lib; build `qa:functional` on it (M4) |
| Configurator data | `vehicle_models` + `products` (variants/prices) + `variant_colors` | JSON data island for replacement blocks (M3) |

Known duplications to resolve while in the area: `page-modes.ts` mirrored between worker and dashboard; QA scripts' copy-pasted browser plumbing.
