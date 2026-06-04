# Handoff — Clone Studio editing + preview interactivity

> Written 2026-06-04. Everything below is **merged to `main`, pushed, and deployed to
> production** (`oem-dashboard.pages.dev`). A fresh session can resume cold from this file
> plus project memory (`project_clone_studio_editing`, `project_section_mapper`,
> `project_clone_studio_v1`).

## What shipped this session (all live in prod)

1. **Unified DOM→section mapper** (`src/design/section-mapper.ts`) — deterministic-first
   with AI fallback; `previewMapping` (`POST /admin/map-page`) + `mapAndPersist`
   (`POST /admin/map-and-structure`). Splitter tuned against real clones
   (descend single-meaningful-wrapper chains; skip a11y/nav chrome). Verified across 13
   OEM stacks. See `project_section_mapper`.
2. **Capture diagnostics** (`src/design/capture-diagnostics.ts`) — persists ok/blocked/error
   per capture under `pages/diagnostics/{oem}/{slug}`; `GET /admin/capture-diagnostics`;
   badge in the page-builder header. Verified live.
3. **Chrome-free Preview** — `Preview` button in the builder toolbar opens
   `/preview/<slug>` (top-level route `preview.vue` + `preview/[slug].vue`, `layout:false`),
   read-only, full-screen, **fills the window width** (`fitWidth` upscales the desktop frame).
4. **Clone Studio editing system** (spec/plan in `docs/superpowers/specs|plans/2026-06-04-clone-studio-editing*`):
   context-aware right-click menu, inline plain-text editing, per-region height crop
   (**numeric popover + bottom-edge drag-handle**), tab/carousel detection.
5. **Preview interactivity** — tabs/carousels are **clickable in the read-only preview**
   (verified: Ford 6-slide carousel advances 0→1→2 live). Our trusted bridge code injects
   prev/next/dot controls and wires them to `switchPanel` (because slick/swiper inject their
   own arrows via JS that the sanitizer strips).

## Architecture (where to look)

- **Bridge** (the sandboxed clone iframe JS string):
  `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
  — `classifyRegion`, `collectPanels`, `switchPanel`, `patchField` (kinds: text/html/image/
  link/visibility/alt/background), `regionPayload` (+`type_hint`), `enableInteractivity`
  (preview-only injected controls), `getBodyHtml`, the resize handle.
- **Canvas host** `CloneStudioCanvas.vue` — `onMessage` (relays context-menu/dom-updated/
  region-height), exposes `beginEdit`/`switchPanel`/`setHeight`/`patchField`; props
  `editable` (=`!readOnly`), `fitWidth`, `allowSameOriginSandbox`. `translateFramePoint`,
  `clampRegionHeight` are exported pure helpers.
- **Menu/UI** `PageBuilderCanvas.vue` — `getRegionActions`/`buildPatchPayload`
  (`region-actions.ts`), `runCloneAction`, popovers; emits `updateField`/`regionAction`/
  `regionHeight`.
- **Page + persistence** `page-builder/[slug].vue` (`onUpdateField`, `onRegionAction`) →
  `use-page-builder.ts` (`setRegionHeight`, `saveClone`); region shape + `applyRegionHeightOverride`
  in `page-builder/page-modes.ts` (`CloneRegion.height_override`).
- **Message types:** `clone-studio:` `context-menu` · `begin-edit` · `patch-field` ·
  `set-height` · `switch-panel` · `region-height` · `dom-updated` · `select-region`.

## CRITICAL gotchas (read before touching the bridge)

- **`getBodyHtml` strips `[data-clone-studio-bridge]`.** ANY element the bridge injects into
  the iframe MUST carry `data-clone-studio-bridge` or it leaks into the persisted clone HTML.
  (Bit us once with the resize handle.)
- **`editable` flag** (`window.__CLONE_STUDIO_EDITABLE__`, from `CloneStudioCanvas` prop
  `editable=!readOnly`) gates ALL editing affordances (dblclick edit, context menu, drag-handle).
  Preview sets it false; interactivity (`enableInteractivity`) runs ONLY when `!editable`.
- **OEM scripts are stripped by the sanitizer** — so anything relying on OEM JS won't run;
  use our trusted bridge code instead.
- **ES5 `var`-in-loop closure trap** in the bridge: per-region handlers must be scoped per
  region (named fn / IIFE), or they all capture the last region. (Bit us in interactivity.)
- **Navigation guard** (`handleNavigationEvent`, capture-phase) `stopImmediatePropagation`s
  clicks — bridge-owned controls (`[data-clone-studio-bridge]`) bypass it via
  `isBridgeOwnedTarget`.
- **No backticks** in bridge JS comments/strings (the bridge is a TS template literal).
- Dashboard build: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` (use `vite build`,
  not `vue-tsc -b`, to ship — but `vue-tsc -b` is currently **0 errors**, keep it clean).
  Tests: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production` (214 pass).
  Deploy: `pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main`.

## Not done / deferred

- **`duplicate` / `convert` menu actions** are toast stubs (`onRegionAction`); `delete` = hide
  (visibility patch). Implementing convert (clone region → structured section) overlaps the
  structurer — design needed.
- **Tab-click on a real OEM tab group** wasn't live-clicked (only the carousel path was
  end-to-end verified). The wiring + injected dot/arrow bar exists for tab regions too —
  worth a manual check on a page with real tabs.
- **No auto-advance** for carousels (sandbox throttles timers) — click-navigation only, by design.
- **Interaction-level UAT** of the editor menu / inline edit / resize on a real clone is still
  manual (hard to drive through the sandboxed iframe): right-click a region → menu; edit text →
  save → reload persists; drag bottom handle → crop persists.

## Outstanding from earlier model-page work (not this session's focus)

- **Fleet audit:** Chery/GMSV/Renault/Suzuki cloned + mapped; **Isuzu/Mitsubishi/Nissan/KGM**
  still need model-page clone targets onboarded (their product URLs are range pages).
  GAC/FOTON remain off-limits. Suzuki Ignis needs a `scrapling-stealth` re-clone (thin render).
  See `docs/superpowers/LIVE-GATED-WORK.md` + `CLONE-STUDIO-PHASE1-AUDIT.md`.
- **Mapper persistence:** `mapAndPersist` works (deterministic-first, AI fallback); type
  reconciliation (heading/image/testimonial/stats → worker types) is done.

## Resume pointers

1. To finish editing UX: implement `convert` (region→section) and `duplicate`; do the manual
   editor UAT list above.
2. To extend interactivity: verify tab-click on a real tabbed OEM page; consider auto-advance
   via same-origin if ever needed (currently click-only).
3. Worker side is unchanged by this session (dashboard-only) — no worker deploy needed for
   any of the above.
