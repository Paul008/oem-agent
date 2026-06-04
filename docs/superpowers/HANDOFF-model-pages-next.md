# Handoff - Model Pages / Page Builder

> Written 2026-06-04. This handoff is for the next session that needs to finish the model-page
> builder. It captures what is done, what is still not done, and the guardrails that matter.

## Current State

The builder is usable today for:

- Opening cloned model pages in Clone Studio
- Editing clone regions and structured sections
- Creating subpages and custom pages from the model pages screen
- Saving section recipes from existing sections
- Rendering the page builder with the toolbar overflow issue fixed

Recent production verification also confirmed:

- Subaru BRZ legacy source-document image placeholders are stripped at render time
- Clone Studio production audit now reports 40 images, 0 broken, and 0 document overflow for the
  verified Subaru page
- The top navigation/header overflow in the builder is fixed in production

## Progress 2026-06-04 (this session)

- **#1 Automatic component mapping — core delivered.** New unified mapper
  `src/design/section-mapper.ts` (`mapPageToSections`, orchestrator `mapPage` with
  deterministic-first / injectable AI fallback, `scoreSection`, `splitPageRegions`).
  Tested across Ford/GWM/Kia/generic stacks (`section-mapper.test.ts`, 17 tests).
  Non-mutating preview wired end-to-end: `PageStructurer.previewMapping` +
  `POST /admin/map-page/:oemId/:modelSlug`. Remaining: persistence/type
  reconciliation (mapper emits dashboard-only `heading`/`image`) and structured-mode
  rendering — see `LIVE-GATED-WORK.md` §3.
- **#5 Capture diagnostics — persisted + read API + presenter delivered.**
  `src/design/capture-diagnostics.ts` persists every clone-page outcome
  (success/blocked/error) under `pages/diagnostics/…` (outside `pages/definitions`);
  read via `GET /admin/capture-diagnostics/:oemId/:modelSlug`. Tested presenter
  `dashboard/src/lib/capture-status.ts`. Remaining: visual badge placement (live) —
  see `LIVE-GATED-WORK.md` §2.
- **#3 Interactivity — decided.** See `INTERACTIVITY-DECISION.md`: ship the
  already-spiked same-origin preview behind a flag after a sanitizer-hardening pass,
  then productize interactive islands for carousels/tabs; snapshots only as fallback.
- **#2/#4 — specified for the live environment.** See `LIVE-GATED-WORK.md`.

All worker tests (384) + dashboard tests (182) pass; `tsc --noEmit` clean.

## What Is Still Not Done

### 1. Automatic component mapping

This is the main unfinished piece.

The codebase has:

- A section registry for known renderer components
- Section-to-section conversion rules
- Recipe saving from existing sections
- Clone mode and section mode state management

It does not yet have a complete end-to-end mapper that takes arbitrary cloned OEM DOM and turns it
into a reliable reusable component model automatically.

What still needs to happen:

- Define the mapping layer from clone regions or captured HTML to reusable builder components
- Decide how much of this is deterministic mapping versus AI-assisted classification
- Add tests that prove the mapping is stable across OEM stacks, not just Ford
- Make the structured output easy to edit without breaking clone mode

### 2. Structured model-page editing

The structured editing flow exists, but it is not finished as a full product path.

Open work:

- Identify which cloned pages should be promoted from clone-only to structured pages
- Run the structuring/adaptive pipeline on priority pages
- Verify section-level edits preserve the original clone content and mode state
- Make the transitions between clone, sections, and generated states explicit and predictable

### 3. Interactivity

The clone iframe still has the known `allow-scripts` sandbox throttling problem.

Open work:

- Decide whether to ship a flagged same-origin preview
- Or replace interactive behavior with trusted islands
- Or snapshot interactive states at capture time

This is still the main gap if the goal is live carousel/tab behavior inside Clone Studio.

### 4. Fleet audit coverage

Phase 1 auditing has not been completed across the full OEM fleet.

Audited so far:

- Ford
- Kia
- GWM
- Toyota
- Hyundai
- GAC
- LDV
- Mazda
- Volkswagen
- Subaru

Still to audit when generated pages exist:

- Chery
- GMSV
- Isuzu
- KGM
- Mitsubishi
- Nissan
- Renault
- Suzuki

Do not run new tests or writes against GAC or FOTON live pages unless the live-site restriction is
explicitly lifted.

### 5. Capture diagnostics

There is still no full diagnostics store for failed captures.

Open work:

- Persist failed capture backend/status/final URL/timing/reason outside `pages/definitions`
- Surface failure state in the dashboard
- Keep challenge and backend metadata visible for troubleshooting

## Guardrails

- Keep GAC and FOTON untouched for now
- Do not use destructive git commands
- Prefer focused tests on the changed builder files
- Keep production verification in the authenticated dashboard, not preview aliases
- Use `CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build` if the local dashboard build hits the
  watcher limit

## Useful References

- [MODEL-PAGES-COMPLETION-TASKS.md](./MODEL-PAGES-COMPLETION-TASKS.md)
- [HANDOFF-clone-studio-next.md](./HANDOFF-clone-studio-next.md)
- [CLONE-STUDIO-PHASE1-AUDIT.md](./CLONE-STUDIO-PHASE1-AUDIT.md)

## Resume Point

Resume from here:

1. Finish the structured component-mapping layer.
2. Decide the interactivity strategy.
3. Expand fleet audit coverage only for pages that are safe to inspect.
