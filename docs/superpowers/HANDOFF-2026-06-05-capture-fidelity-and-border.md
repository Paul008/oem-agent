# Handoff — Clone Studio duplicate + capture fidelity + border emission

> Written 2026-06-05. At original handoff time, everything below was **merged to `main`, pushed to
> `origin/main`, and deployed to production** (`oem-dashboard.pages.dev`). `main` HEAD was
> `82462b6`, in sync with origin. A fresh session can resume cold from this file + project memory
> (`MEMORY.md` → the "CSS→Tailwind (ACTIVE = client-side)" bullet, `project_clone_studio_editing`).

## Addendum — Follow-ups Resolved Later on 2026-06-05

This handoff predates later work on the same branch. Current `main` includes:

- `db4dd75 fix(capture): compact rgba color tokens` — `colTw` now emits space-free rgba arbitrary
  tokens such as `bg-[rgba(0,0,0,0.5)]`, locked by `capture-tailwind-rules.test.ts`.
- `5da74e3 feat(preview): enable right-click editing` — the standalone preview route now wires the
  same editable canvas/context-menu path as Page Builder where the page is not write-protected.
- `2978053 feat(page-builder): convert clone regions to sections` — clone-region `Convert` now
  stages raw HTML as editable `content-block` sections in both builder and preview hosts.
- `bb95d7a feat(model-pages): show mode-aware page status` — Model Pages now classifies cached
  details as `Loading`, `Structured`, `Clone-only`, or `Generated` using mode-aware sections and
  clone payloads. Dashboard Pages deploy: `https://ac5e3523.oem-dashboard.pages.dev`.

The resolved bullets below are retained as historical context. The remaining frontier from this
handoff is the larger Path-A clone fidelity work.

## Three features shipped this session (all live in prod)

### 1. Clone Studio "Duplicate region" action
Right-click a clone region → **Duplicate** → identical copy inserted immediately after the source
as a **first-class region** (selectable, croppable, persisted in `section_index`, survives reload).
- **Flow:** context-menu → `[slug].vue onRegionAction('duplicate')` → `PageBuilderCanvas.duplicateRegion`
  → `CloneStudioCanvas.duplicateRegion` → bridge `clone-studio:duplicate-region` handler
  (`cloneNode(true)` → strip own+nested `data-oem-region-id` → `insertBefore(clone, source.nextSibling)`
  → `ensureRegionId` → post `dom-updated{newRegion: regionPayload(clone)}`) → `CloneStudioCanvas`
  emits `regionAdded` → `PageBuilderCanvas` re-emits `cloneRegionAdded` (readOnly-gated) → page
  `onCloneRegionAdded` (isWriteProtectedPage-guarded) → `addCloneRegion` composable →
  `upsertCloneRegionDraft` → `cloneRegionsForSave` → `saveClone(section_index)`.
- Re-ID algorithm locked by pure helper `reassignClonedRegionIdsForTest`.
- `convert` (region→structured section) is STILL a "coming soon" toast — out of scope.
- Spec/plan: `docs/superpowers/{specs,plans}/2026-06-04-clone-studio-duplicate-region*`.

### 2. Capture fidelity pass (hybrid Tailwind converter)
The Smart Capture → Tailwind converter was lossy. Extracted + made exact + hybrid.
- **Extract:** pure rules moved out of an injected-script string into a self-contained, unit-tested
  `tailwindRules()` in `dashboard/src/composables/capture-tailwind-rules.ts` (returns
  `cssTw/colTw/fsTw/pxToSp/rgbHex/mapClasses/styleTw/borderTw`).
- **Inject:** `use-capture-injection.ts` does `var R=(${tailwindRules.toString()})();` once; the
  in-page DOM walker `tailwindHtml(el)` calls `R.*`.
- **Exact values:** font-size/border-radius/opacity no longer quantized (`text-[17px]`,
  `rounded-[6px]`, `opacity-[.73]`, `opacity-[0]`).
- **Emit dropped props:** line-height (`leading-[1.55]`), letter-spacing (`tracking-[0.3px]`),
  top/right/bottom/left, z-index, min-width, font-family (`font-[Inter]`), font-style,
  text-decoration, font-weight arbitrary fallback.
- **Hybrid / inline escape hatch:** `styleTw` routes un-tokenizable props (box-shadow,
  background-image/gradient, transform, filter, backdrop-filter, clip-path, mask) to inline
  `style=""`. `cssTw` and `styleTw` (and `borderTw`) operate on **disjoint** prop sets.
- Orphaned `src/design/css-to-tailwind.ts` deleted (was already gone Jun 3, `9b41b1c`).
- Spec/plan: `docs/superpowers/{specs,plans}/2026-06-04-clone-capture-fidelity*`.

### 3. Border emission (`borderTw`)
Borders were dropped entirely; now emitted.
- `borderTw(read)` reads the 12 border longhands. **Uniform** (all 4 sides equal width+style+color
  AND style ∈ {solid,dashed,dotted,double} AND color is hex-convertible) → Tailwind tokens
  `border-[length:Wpx] border-[color:#hex] border-STYLE`. **Everything else** (non-uniform,
  non-tokenizable style, or rgba/non-hex color) → exact inline per-present-side
  (`border-bottom:1px solid rgb(...)`).
- Called once per element in `convert()` after the `STYLE_PROPS` loop. `border-radius` stays in
  `cssTw` (NOT `borderTw`).
- Spec/plan: `docs/superpowers/{specs,plans}/2026-06-05-clone-capture-border-emission*`.

## Architecture — where to look (capture converter)

- **`dashboard/src/composables/capture-tailwind-rules.ts`** — `tailwindRules()` is the SINGLE
  SOURCE OF TRUTH for all CSS→Tailwind/inline rules. Self-contained (no imports/outside refs),
  ES5 style (`var`, function declarations) with TS annotations. Unit-tested directly in
  `capture-tailwind-rules.test.ts` via `const R = tailwindRules()`.
- **`dashboard/src/composables/use-capture-injection.ts`** — `buildCaptureInjection()` returns the
  injected `{earlyStub, lateInjection}` script. Injects `var R=(${tailwindRules.toString()})();`,
  then the in-page `tailwindHtml(el)`/`convert(src,cln)` DOM walker reads computed styles, builds
  `twClasses` (deduped) + `styleString`, and applies both to the clone. `STYLE_PROPS` is the list
  of props read per element (border longhands are NOT in it — `borderTw` reads them via its reader).
- **`dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`** — `sanitizeStyle`
  (line ~408) is the downstream gate when styled HTML is re-rendered: strips
  `expression()`/`@import`/`-moz-binding`/`javascript:`/`vbscript:` and rewrites `url()`, but is
  otherwise property-permissive (so box-shadow/gradient/transform/border inline styles survive).
- **Duplicate-region (clone studio editing):** `clone-studio-html.ts` (the sandboxed bridge
  IIFE string), `CloneStudioCanvas.vue` (inner host), `PageBuilderCanvas.vue` (wrapper host),
  `page-builder/[slug].vue` (page), `use-page-builder.ts` (`addCloneRegion`, `saveClone`).

## CRITICAL gotchas (read before touching the converter)

- **`tailwindRules()` MUST stay self-contained** — it's serialized via `.toString()` into the
  capture page. No imports, no module-scope references; every helper is an inner function/const.
  Adding an outside reference breaks the in-page script.
- **Minification safety:** the production build minifies `tailwindRules.toString()` (inner fn names
  mangle), but the returned object's STRING keys (`{cssTw: cssTw, …}`) are preserved, so `R.cssTw`
  resolves. Don't rely on inner function names at call sites — always go through `R.<key>`.
- **ES5 + TS annotations, NO `@ts-nocheck`.** Type annotations are erased by esbuild and do NOT
  appear in `.toString()` output (verified). Keep `vue-tsc` at 0 errors via proper typing.
- **To eval the stringified body in a test, use the BUNDLER output, not a raw `tsx`/esbuild dev
  transform** — the dev transform injects `__name()` calls that ReferenceError in the
  reconstructed scope (production build does not). Noted in the module header comment.
- **`cssTw` / `styleTw` / `borderTw` operate on DISJOINT prop sets** — no prop both emits a class
  and an inline style. Preserve this when adding props.
- **The converter only ever receives `getComputedStyle` output** — values are resolved to px /
  `rgb()`/`rgba()` (never keywords like `medium`/`bold`/`%`). Several guards rely on this
  (e.g. unit-stripping, border longhand parsing). Don't call these rules with raw author CSS.
- **Duplicate-region bridge:** anything the bridge injects into the iframe MUST carry
  `data-clone-studio-bridge` (else it leaks into persisted HTML); the bridge is a TS template
  literal so **no backticks** inside it; ES5 `var`-in-loop closure trap applies to per-element
  handlers.
- Build/test/deploy:
  - Tests: `CI=1 npx vitest run --config dashboard/vite.config.ts --mode production` (244 pass).
  - Typecheck: `pnpm --dir dashboard exec vue-tsc -b` (0 errors).
  - Build: `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build`.
  - Deploy (dashboard-only, no worker/Docker): `pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main`.

## Known debt / deferred (logged, NOT silently dropped)

- **Resolved after handoff — `colTw` rgba spaces bug (pre-existing):** `colTw` emitted `bg-[rgba(0, 0, 0, .5)]` /
  `text-[rgba(...)]` with unescaped spaces → broken Tailwind class for rgba bg/text colors.
  Fixed in `db4dd75` by compacting whitespace in rgba arbitrary color tokens.
- **Resolved after handoff — `convert` clone-region action:** was still a toast stub
  (region→structured section). Implemented in `2978053` by converting selected clone-region HTML
  into a raw `content-block` section and switching to sections mode.
- **Path-A clone fidelity (larger):** OEM `<script>` is stripped, so JS-driven content is
  frozen/lost — carousels/tabs (we inject trusted controls as a partial patch), lazy-loaded
  images, scroll-reveal/intersection-observer animations. Plus pseudo-elements (`::before/::after`)
  not materialized, font `size-adjust`/`ascent-override` not set, no post-JS-settle capture, no
  responsive multi-width capture. These are the next fidelity frontier if pursued.

## Resume pointers

1. **Manual UAT (can't be automated — DOM walker / bridge run in-browser):** smart-capture a
   section with a gradient hero, drop-shadow card, italic/underlined text, a non-standard font
   size, a uniform-bordered card, and a bottom-divider element; confirm it renders visibly closer
   to source (gradient/shadow present, exact type, borders present). For duplicate: right-click a
   region → Duplicate → crop the copy → save → reload → copy + crop persist.
2. **Bigger bet:** Path-A "de-freeze" — capture the post-JS-settle DOM (Puppeteer network-idle +
   scroll-to-bottom) so lazy content / animation end-states bake into the static snapshot.

## Verification status (at handoff)

244 unit tests pass · `vue-tsc -b` 0 errors · production build succeeds · all three features had
two-stage subagent review + a final opus whole-feature review ("Ready to merge", with the capture
one empirically verifying minification-safety against the real bundle). Working tree clean,
`main` == `origin/main`.
