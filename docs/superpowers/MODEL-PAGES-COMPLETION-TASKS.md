# Model Pages Completion Tasks

Written 2026-06-04.

## Goal

Finish the model-page system so cloned OEM pages are safe to recapture, broadly reliable across the
OEM fleet, editable where needed, and operationally observable.

## 1. Toyota Capture Safety

Status: in progress.

- [x] Block security/challenge pages from overwriting existing R2 page definitions.
- [x] Prove Scrapling can fetch real Toyota RAV4 HTML through the local ops probe.
- [x] Add a Worker-safe external capture adapter so validated Scrapling HTML can enter the existing
      page persistence pipeline.
- [x] Re-capture Toyota RAV4 through the adapter.
- [x] Run Clone Studio audit for `toyota-au-rav4` after recapture.

Result: Toyota RAV4 latest is version `9`, captured via `scrapling-stealth`, with 50 proxied assets.
Clone Studio audit: 70 images, 0 broken, 10 stylesheets / 2 stylesheet links, 104 fonts, root
overflow 0. Remaining hidden text samples are Toyota mobile/interactive overlay blocks rather than
missing media.

## 2. Fleet Clone Audit

Status: partially complete.

Already audited: Ford, Kia, GWM, Toyota, Hyundai, GAC, LDV, Mazda, Volkswagen, Subaru.

- [ ] Audit remaining OEMs for images, stylesheets, fonts, hidden text, and overflow when generated
      Clone Studio pages exist.
- [ ] Add generalized shims only where repeated CMS/library patterns appear.
- [ ] Keep a short per-OEM result table in `CLONE-STUDIO-PHASE1-AUDIT.md`.

Latest result: Subaru BRZ had legacy source-document image placeholders from an older clone
(`src` pointed at `/brz/2026`, a document route). The dashboard now strips those at render time
without recapture. Production audit after deploy: 40 images, 0 broken, 82 stylesheets / 72 links,
279 fonts, hidden text 0, root overflow 0.

Remaining non-protected OEMs with no generated Clone Studio slugs found on 2026-06-04: Chery, GMSV,
Isuzu, KGM, Mitsubishi, Nissan, Renault, and Suzuki. GAC and FOTON are under live-site restriction;
do not run new tests or writes against them unless explicitly cleared.

## 3. Structured Model-Page Editing

Status: pending.

- [ ] Identify cloned pages that are still clone-only.
- [ ] Run structuring/adaptive pipeline on priority clone-only pages.
- [ ] Verify section-level edits preserve clone mode and do not damage the captured page.

## 4. Interactivity

Status: pending decision.

- [ ] Review same-origin Clone Studio sandbox security.
- [ ] Decide between flagged same-origin preview and trusted interactive islands.
- [ ] Verify tabs/carousels on at least Ford, Kia, GWM, Hyundai, and Toyota.

## 5. Capture Diagnostics

Status: pending.

- [ ] Store failed capture diagnostics outside `pages/definitions`.
- [ ] Log backend, challenge status, source URL, final URL, timing, and failure reason.
- [ ] Surface backend/failure state in the dashboard.

## 6. Production Verification

Status: recurring.

- [ ] Run focused tests and typecheck for every capture/editor change.
- [ ] Deploy Worker/dashboard when runtime behavior changes.
- [ ] Browser-smoke priority model pages after deploy.
