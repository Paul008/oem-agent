# Live-Gated Work — runs only with the authenticated browser / deploy

Written 2026-06-04. These items cannot be completed from local code alone: they
need the authenticated production dashboard (`oem-dashboard.pages.dev`, behind
Cloudflare Access), a Worker/dashboard deploy, or both. Everything here is
specified precisely so it can be executed in one pass when that environment is
available.

> **Guardrail (still in force):** do NOT run new tests or writes against **GAC**
> or **FOTON** live pages unless the live-site restriction is explicitly lifted.

## What is already done locally (no live env needed)

- **Unified DOM→section mapper** — `src/design/section-mapper.ts`
  (`mapPageToSections`, `mapPage`, `scoreSection`, `splitPageRegions`), tested in
  `src/design/section-mapper.test.ts` across Ford/GWM/Kia/generic stacks.
  Non-mutating preview wired: `PageStructurer.previewMapping` +
  `POST /admin/map-page/:oemId/:modelSlug`.
- **Capture diagnostics** — `src/design/capture-diagnostics.ts` (persist under
  `pages/diagnostics/…`, outside `pages/definitions`), recorded on every
  clone-page call (success/blocked/error), read via
  `GET /admin/capture-diagnostics/:oemId/:modelSlug`. Client methods
  `fetchCaptureDiagnostics` / `mapPagePreview` and the tested presenter
  `describeCaptureStatus` (`dashboard/src/lib/capture-status.ts`) are in place.

## 1. Deploy (prerequisite for everything below)

```bash
# Worker (needs Docker running for Cloudflare Containers)
pnpm run deploy
# Dashboard
CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

Verify the loaded SPA chunk hash matches `dashboard/dist/assets/` before trusting
any screenshot (the browser caches the bundle).

## 2. Finish capture-diagnostics surfacing (#5 — UI placement)

Infrastructure is done and tested; only the visual badge remains, and it needs the
live dashboard to verify.

- The model-pages screen (`dashboard/src/pages/dashboard/model-pages.vue`) is a
  **list view** (one row per model). Per-row diagnostics would be N fetches —
  prefer lazy/on-expand or a per-page detail panel.
- Recommended placement: in the page-builder / Clone Studio detail context, call
  `fetchCaptureDiagnostics(oemId, modelSlug)` once on load and render
  `describeCaptureStatus(latest)` as a badge (`tone` → color, `label`, `detail`).
  `tone` is one of `success | warning | error | neutral`.
- Verify: capture a known-good page (Ford Mustang) → "Captured via …"; force a
  blocked capture (a challenge-prone source) → "Capture blocked / challenge"; an
  errored capture → "Capture failed / <reason>".

## 3. Structured model-page editing (#2)

1. List which cloned pages are still **clone-only** (no `modes.sections.items`).
   Quick check per page via the worker JSON:
   `…/oem-agent/pages/<slug>?includeRendered=true&includeModes=true`.
2. For each priority clone-only page, run the **deterministic preview first**:
   `mapPagePreview(oemId, modelSlug)` → inspect `needs_ai_fallback` and
   `overall_confidence`.
   - If `needs_ai_fallback === false`: the page maps cleanly; proceed to structure.
   - If `true`: expect to lean on AI structuring (`structurePage`).
3. Run structuring: `POST /admin/structure-page/:oemId/:modelSlug` (or the adaptive
   pipeline from the model-pages screen).
4. **Verify section-level edits preserve clone mode** — after editing a section,
   reload and confirm `active_mode` is unchanged and `modes.clone.rendered` (the
   captured page) is intact. The structurer already writes sections under
   `modes.sections` while keeping `modes.clone`; confirm the editor save path does
   the same.
5. Make clone→sections→generated transitions explicit in the UI (clear mode
   indicator + the confidence/`needs_ai_fallback` signal from the preview).

> Type reconciliation (DONE 2026-06-04): the deterministic mapper can emit
> `heading`/`image` (dashboard-only) and `testimonial`/`stats` (parser-only) types
> that are not directly persistable. `mappedSectionsToRawSections` now converts
> them to extractable worker types (`heading`→`intro`, `image`→`gallery`,
> `testimonial`/`stats`→`content-block`), validates via `validateSections`, and
> persists. Use `POST /admin/map-and-structure/:oemId/:modelSlug`
> (client: `mapAndStructurePage`) — it persists deterministically when confidence
> is high (no AI cost) and falls back to AI structuring when low. The non-mutating
> `map-page` preview remains for inspecting the proposed mapping first.

## 4. Fleet clone audit (#4)

Already audited: Ford, Kia, GWM, Toyota, Hyundai, GAC, LDV, Mazda, Volkswagen,
Subaru (see `CLONE-STUDIO-PHASE1-AUDIT.md`).

Remaining non-protected OEMs had **no generated Clone Studio pages** on 2026-06-04:
Chery, GMSV, Isuzu, KGM, Mitsubishi, Nissan, Renault, Suzuki. To audit them you
must first create a clone page (zero-AI `clone-page` capture), then run the audit.

```bash
# 1. Create a representative clone (example pattern; use each OEM's real source)
#    via the page-builder "clone" action or clonePage(oemId, slug, { sourceUrl })
# 2. Run the repeatable audit harness
node scripts/clone-studio-audit.mjs <oem-slug> [<oem-slug> ...]
#    flags: --json (raw), --no-shim (current prod only), --settle-ms 5000 (slow loads)
```

Record each result (images / broken / stylesheets / fonts / hidden text / overflow)
in the per-OEM table in `CLONE-STUDIO-PHASE1-AUDIT.md`. Add generalized shims only
where a repeated CMS/library pattern appears (not OEM-specific selectors).

## 5. Production verification checklist (recurring)

- [ ] `npx vitest run` (worker) and dashboard tests green before deploy.
- [ ] `npx tsc --noEmit` clean for changed worker files.
- [ ] Deploy worker + dashboard when runtime behavior changed.
- [ ] Browser-smoke priority model pages after deploy in the **authenticated**
      dashboard (not preview aliases).
- [ ] Confirm new SPA chunk hash is the one actually loaded.
