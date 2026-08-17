# OEM Fidelity Assistant Design

**Date:** 2026-08-13

**Status:** Superseded for selected-region matching by `2026-08-14-adaptive-match-oem-design.md`

**Pilot:** `nissan-au-navara`

## Context

The model-page editor already provides three related capabilities:

- a clone editor with region-level right-click actions;
- deterministic clone-to-Tailwind conversion; and
- a read-only side-by-side comparison after conversion.

These capabilities do not form a closed fidelity loop. The right-click **Convert to Tailwind** action compiles captured DOM and computed styles, but no visual agent compares its output with the OEM reference or repairs drift. The comparison view reports mapping coverage and conversion risks, but it does not calculate a region screenshot diff or offer a correction action.

The Worker contains useful but disconnected pieces:

- publication browser validation captures source, candidate, and diff screenshots at three viewports;
- the offline fidelity report compares screenshots;
- a dormant `/admin/quality/score` route asks a vision model to compare two images, but receives only one image and is not used by the editor; and
- single-section regeneration improves structured data rather than visual HTML/CSS fidelity.

Publication validation currently warns at 20% pixel mismatch and blocks only above 35%. Those thresholds detect catastrophic failures, not OEM-grade visual fidelity.

The Navara editor screenshot demonstrates the resulting gap: an operator can see that a region differs from the OEM page and can manually edit or convert it, but the editor cannot identify the cause, quantify the difference, or propose a bounded repair.

## Decision

Add a region-first **Fidelity Assistant** to the clone and Tailwind editing workflow.

The assistant runs an evidence-backed loop:

1. capture the selected OEM reference region and current dashboard region under identical deterministic conditions;
2. calculate geometry and pixel differences before invoking AI;
3. classify the likely cause of drift;
4. propose a bounded repair only when an editable Tailwind implementation is appropriate;
5. render and score the proposal without changing the saved page;
6. require the operator to approve the proposal before it enters the draft; and
7. re-run the deterministic comparison after application.

AI is an adviser and patch generator, not the fidelity judge. Deterministic browser measurements decide whether a proposal improved the result and whether the region meets the configured gate.

The first production slice is selected-region fidelity for `nissan-au-navara`. Page-wide autonomous repair is explicitly deferred.

## Goals

- Make OEM/reference drift visible and measurable from the existing region context menu.
- Distinguish capture defects from conversion defects before changing code.
- Provide OEM, dashboard, overlay, and diff evidence at matching dimensions.
- Give an operator a safe, reversible AI-assisted repair workflow.
- Target at least 99% matching stable pixels for static selected regions.
- Validate desktop, tablet, and mobile before a repaired region is considered ready.
- Reuse the existing browser validator, R2 evidence patterns, editor draft model, and model selector.
- Keep every AI proposal isolated from the saved draft until explicit approval.

## Non-Goals

- Do not promise mathematically identical screenshots across different browsers, operating systems, font rasterizers, or dynamic OEM content.
- Do not let AI publish, save, or apply a repair automatically.
- Do not rewrite a full page in one AI request.
- Do not treat a visual score as proof that interactions are functional.
- Do not send authentication material, unrelated page content, or unrestricted source code to a model.
- Do not patch raw captured clone markup with unconstrained AI output.
- Do not replace the existing deterministic Tailwind compiler.
- Do not make a live, changing OEM page the only historical reference for an existing draft.

## Fidelity Definition

“Pixel-perfect” means parity against a pinned reference capture under the same rendering contract, not an unqualified promise of byte-identical screenshots everywhere.

A fidelity comparison pins:

- page ID and saved draft version;
- source URL and source-capture digest;
- stable region ID and reference locator;
- viewport width, viewport height, and device scale factor;
- browser engine/runtime version;
- loaded font and stylesheet digests when available;
- animation and transition suppression;
- scroll position and region crop rectangle; and
- declared masks for approved dynamic pixels.

For a static region:

- **pass:** dimensions match and mismatch is at most 1%;
- **review:** mismatch is above 1% and at most 3%;
- **fail:** mismatch is above 3%, dimensions differ materially, a critical asset fails, or horizontal clipping exists.

Thresholds are configuration, not model output. Dynamic regions may define narrow, visible masks for video frames, rotating offers, timestamps, or inventory values. A mask must be stored as evidence and cannot cover the entire region or hide structural layout differences.

## User Experience

### Entry point

Add **Match OEM…** to the selected clone-region and structured-section context menus. Use a scan/diff icon rather than the conversion wand so the actions remain conceptually distinct.

The action is also available from the selected-region toolbar. It is disabled with an explanation when:

- the page has unsaved changes;
- no source capture can be resolved;
- the region has no stable reference locator; or
- another fidelity operation is active for the page.

The initial slice requires a saved draft. This keeps server rendering reproducible and prevents a background check from silently scoring stale state.

### Fidelity Assistant dialog

Open a large dialog with four views:

- **OEM:** pinned source capture;
- **Dashboard:** current saved draft rendering;
- **Overlay:** adjustable opacity comparison;
- **Diff:** highlighted changed pixels and geometry guides.

The dialog shows:

- viewport and crop dimensions;
- mismatch percentage and pass/review/fail status;
- missing assets, fonts, overflow, and console errors;
- the likely cause classification;
- previous and proposed scores when a repair exists; and
- desktop, tablet, and mobile status.

The primary actions progress through explicit states:

```text
Run check → Generate repair → Preview repair → Apply to draft → Save Draft → Recheck
```

**Apply to draft** never saves. Existing dirty-state, undo/redo, Save Draft, Build Candidate, and Publish behavior remains authoritative.

### Diagnosis before generation

The check classifies drift into one or more deterministic categories:

- `asset-failure` — image, stylesheet, font, or media did not load;
- `reference-drift` — live OEM content no longer matches the pinned source capture;
- `viewport-mismatch` — crop, scale, width, height, or scroll position differs;
- `capture-runtime` — a required interaction/runtime state was not reproduced;
- `clone-drift` — saved clone output differs from its pinned captured reference;
- `conversion-drift` — Tailwind output differs from the clone/reference implementation; or
- `dynamic-content` — a permitted moving value requires a bounded mask.

Asset, viewport, reference, and runtime failures do not offer an AI HTML rewrite as the first remedy. The UI explains the deterministic corrective action. AI repair is available only for a saved, editable Tailwind region. A clone region must first be converted, reviewed, and saved as a Tailwind draft.

## Architecture

### 1. Fidelity session

Each check creates a short-lived, immutable session tied to one saved draft:

```ts
interface FidelitySession {
  id: string
  pageId: string
  regionId: string
  draftVersion: number
  sourceCaptureDigest: string
  currentRegionDigest: string
  renderer: 'clone' | 'tailwind'
  viewports: FidelityViewportResult[]
  diagnosis: FidelityDiagnosis[]
  status: 'checked' | 'repair-proposed' | 'repair-previewed' | 'applied' | 'expired'
  createdAt: string
  expiresAt: string
}
```

Store evidence under:

```text
model-pages/{pageId}/fidelity/sessions/{sessionId}/session.json
model-pages/{pageId}/fidelity/sessions/{sessionId}/{viewport}/source.png
model-pages/{pageId}/fidelity/sessions/{sessionId}/{viewport}/current.png
model-pages/{pageId}/fidelity/sessions/{sessionId}/{viewport}/diff.png
model-pages/{pageId}/fidelity/sessions/{sessionId}/proposal.json
model-pages/{pageId}/fidelity/sessions/{sessionId}/{viewport}/proposal.png
model-pages/{pageId}/fidelity/sessions/{sessionId}/{viewport}/proposal-diff.png
```

Session evidence expires after seven days and is never treated as a published artifact. Cleanup runs through the existing scheduled Worker infrastructure. Session identifiers are random and still require authenticated access.

### 2. Reference resolution

Resolve the reference in this order:

1. the immutable source capture associated with the current draft;
2. the region’s captured original HTML, computed-style snapshots, and screenshot evidence; then
3. a fresh OEM capture only when the operator explicitly refreshes the reference.

A fresh capture creates a new reference digest; it does not silently replace the baseline used by an existing session. This prevents genuine upstream OEM changes from being mistaken for dashboard regressions.

Region lookup uses the stable OEM region ID first, then a stored source locator. Broad heuristic selectors are evidence warnings and cannot produce a passing check without operator confirmation.

### 3. Deterministic capture and comparison

Extract shared capture/diff primitives from the publication browser validator into a reusable fidelity module. Publication validation continues consuming the same primitives.

For each viewport:

1. create isolated source and dashboard pages;
2. disable animation, transition, smooth scrolling, caret, and cursor rendering;
3. wait for fonts and render-critical resources with bounded timeouts;
4. put interactive regions into the declared stable state;
5. locate the region and record its bounding rectangle;
6. normalize both captures to the agreed crop contract;
7. capture PNG evidence;
8. compare RGBA channels and dimensions;
9. generate a visual diff; and
10. record console, request, asset, overflow, and interaction diagnostics.

The comparison must never truncate to the shorter image and report a misleading low mismatch. Missing pixels caused by dimension differences count as mismatches, and material dimension drift fails separately.

### 4. Repair generation

The repair request includes only the selected region’s bounded context:

- source and current screenshots;
- diff screenshot and deterministic measurements;
- sanitized reference HTML for the region;
- current generated Tailwind HTML and scoped leftover CSS;
- computed-style and responsive snapshots;
- declared component/interaction kind;
- design tokens relevant to the page; and
- the selected model override.

The AI response uses a strict schema:

```ts
interface FidelityRepairProposal {
  sessionId: string
  regionId: string
  basedOnDraftVersion: number
  diagnosis: string
  changes: string[]
  generatedHtml: string
  scopedCss: string
  interactionKind: 'none' | 'accordion' | 'tabs' | 'modal' | 'carousel' | 'slider'
  confidence: number
}
```

The Worker rejects scripts, event-handler attributes, unsafe protocols, frames, objects, embeds, unscoped selectors, unknown interaction contracts, excessive output, or a region ID mismatch. The existing production sanitizer and trusted interaction runtime rules apply before any proposal can be previewed.

The model cannot provide the final score or change thresholds. Free-form advice is displayed as explanation only.

### 5. Proposal preview

The Worker renders a proposal as an isolated, ephemeral region artifact using the same document shell, fonts, stylesheets, and viewport contract as the current dashboard capture. It then runs the deterministic comparison again.

The response reports both current and proposal results. The UI labels a proposal as:

- **Improved and passing**;
- **Improved but review required**;
- **No material improvement**; or
- **Regressed**.

Regressed proposals cannot be applied. Review-range proposals may be applied only after an explicit warning. Passing proposals still require operator approval.

### 6. Draft application

Applying a proposal updates only the selected structured section fields:

- `_generated_html`;
- `_generated_css` or `_tailwind_leftover_css`;
- `_tailwind_conversion` fidelity metadata; and
- the stable clone-region mapping.

The update goes through `usePageBuilder` so undo/redo, dirty tracking, candidate invalidation, and Save Draft remain intact.

For a selected clone region, **Generate repair** offers deterministic selected-region Tailwind conversion. The operator reviews and saves that conversion, then starts a new fidelity session against the saved Tailwind draft. No AI proposal is generated against an unsaved conversion, and raw clone HTML is not replaced directly by AI.

The applied metadata records the session ID, reference digest, model, pre-repair score, proposal score, and timestamp. It contains no screenshot bytes or sensitive prompt content.

### 7. API

Add authenticated manual-editor endpoints:

```text
POST /api/v1/oem-agent/admin/pages/:pageId/fidelity/check
GET  /api/v1/oem-agent/admin/pages/:pageId/fidelity/sessions/:sessionId
POST /api/v1/oem-agent/admin/pages/:pageId/fidelity/sessions/:sessionId/repair
POST /api/v1/oem-agent/admin/pages/:pageId/fidelity/sessions/:sessionId/preview
GET  /api/v1/oem-agent/admin/pages/:pageId/fidelity/sessions/:sessionId/evidence/:viewport/:kind
```

`check` accepts `regionId`, `expectedDraftVersion`, and optional viewports. It returns `409` if the saved draft moved.

`repair` accepts the selected model override and returns a sanitized proposal. It does not mutate the page.

`preview` renders the stored proposal and returns deterministic evidence. It does not mutate the page.

Evidence endpoints stream only artifacts belonging to the authenticated session and set `Cache-Control: private, no-store`.

No separate server-side “apply” endpoint is needed in the first slice. The dashboard applies an approved proposal to its local draft through the existing page-save contract.

### 8. Dashboard components

Add:

- `FidelityAssistantDialog.vue` — workflow shell and evidence views;
- `FidelityEvidenceViewer.vue` — OEM/current/overlay/diff rendering;
- `use-region-fidelity.ts` — session state, stale-request protection, object URL cleanup, and API orchestration; and
- fidelity request/response contracts and parsers in `src/lib`.

Modify:

- `region-actions.ts` to add `match-oem`;
- `PageBuilderCanvas.vue` to route context-menu and toolbar actions;
- builder and standalone preview pages to open the assistant with the same selected-region contract;
- `worker-api.ts` for authenticated fidelity calls; and
- section conversion metadata so an approved repair remains traceable.

Use existing shadcn-vue Dialog, Tabs, Alert, Badge, Button, Skeleton, and Slider components. The dialog must be keyboard navigable, return focus to the invoking region, expose status text to assistive technology, and remain usable at 1024px. Small mobile editor support is limited to evidence viewing; repair authoring requires tablet or desktop width.

### 9. Publication integration

The Fidelity Assistant does not replace Build Candidate. Candidate validation independently renders the complete composed page at desktop, tablet, and mobile.

Candidate validation adopts the shared comparison implementation and reports stricter, mask-aware results. For the pilot:

- repaired static regions above 3% mismatch are blocking;
- repaired regions between 1% and 3% require review;
- missing or stale fidelity metadata is a warning, not a publish bypass; and
- page-level catastrophic thresholds remain as a temporary compatibility backstop until enough masked full-page evidence is collected.

AI cannot suppress a candidate finding, modify an evidence artifact, or mark a region publishable.

## Error Handling

- A stale draft returns `409` and asks the operator to save/recheck.
- An expired session returns `410` and preserves no apply action.
- Missing reference evidence explains how to refresh capture instead of offering a blind repair.
- Browser binding failures keep existing draft data intact and expose a retry action.
- AI failure leaves deterministic evidence available for manual correction.
- A malformed or unsafe proposal is rejected before preview.
- If a proposal preview fails to render, the proposal cannot be applied.
- Navigation or region selection changes cancel client presentation of stale results, while completed server evidence may remain until expiry.

## Security and Privacy

- All fidelity APIs use existing manual-editor authentication and audit logging.
- Page and region identifiers are validated against the authenticated request.
- Server-side fetches reuse strict OEM/source URL allowlists and redirect validation.
- Evidence is private, short-lived, and never exposed through the public media route.
- Prompts contain one sanitized region, never credentials, cookies, full dashboard HTML, or unrelated page data.
- AI HTML passes deterministic sanitization, CSS scoping, size, URL, and interaction gates.
- Rate limits apply per actor and page because browser captures and multimodal inference are expensive.
- Repair/apply audit metadata records actor, page, region, model, session, and draft version without storing secrets.

## Testing Strategy

### Worker unit tests

- exact page/region and authentication validation;
- stale draft and expired session handling;
- reference resolution and digest pinning;
- complete-image pixel comparison including dimension drift;
- mask bounds and maximum mask coverage;
- diagnosis classification;
- strict AI proposal schema and sanitization;
- proposal regression/apply gating;
- private evidence access; and
- scheduled session cleanup.

### Dashboard unit tests

- context-menu and toolbar routing;
- saved-draft requirement;
- session state transitions and race protection;
- overlay opacity and evidence tab behavior;
- proposal score labels;
- apply-to-draft, dirty state, undo/redo, and candidate invalidation;
- focus restoration and keyboard navigation; and
- clone-region conversion requirement before AI repair.

### Browser verification

- Navara selected region at 1440×1100, 1024×900, and 390×844;
- OEM/current/diff images have aligned crop dimensions;
- asset and font readiness is stable across repeated checks;
- a known CSS perturbation fails, a repair proposal improves it, and reverting the proposal fails again;
- no proposal changes the saved draft before explicit approval;
- cancel/navigation cannot apply a stale proposal;
- repaired interactive regions retain functional behavior; and
- the full candidate remains publishable only after independent validation.

## Rollout

1. Ship APIs and dashboard UI behind an exact page allowlist containing only `nissan-au-navara`.
2. Record check duration, capture failures, inference failures, initial mismatch, proposal improvement, and operator acceptance without screenshot telemetry.
3. Run the Navara pilot on representative static, responsive, and interactive regions.
4. Calibrate dynamic masks and thresholds from reviewed evidence; do not loosen gates based solely on AI feedback.
5. Expand to additional Nissan pages only after the pilot demonstrates stable reference resolution and no unsafe proposal acceptance.

## Alternatives Considered

### Manual compare plus existing editors

This has the smallest implementation cost but leaves operators to identify causes and reproduce fixes by eye. It does not make fidelity repeatable or measurable.

### Fully autonomous page-wide AI repair

This appears convenient but creates an unreviewable blast radius, high inference cost, stale-draft races, and a serious risk of fixing screenshots while breaking interactions or semantics. It is deferred.

### Tighten only the publication mismatch threshold

This would block poor candidates without helping an operator correct them. Existing full-page dynamic content also needs masking and better reference pinning before a strict global threshold is safe.

### Selected-region, deterministic-first assisted repair

This is the chosen approach. It reuses existing capture and editor boundaries, provides attributable evidence, limits AI scope, preserves operator control, and can later compose into a page-wide quality dashboard without changing the repair contract.

## Success Criteria

- An operator can invoke **Match OEM…** from the selected Navara region.
- The assistant produces aligned OEM, dashboard, overlay, and diff evidence at three viewports.
- The system explains deterministic capture/asset failures without proposing an irrelevant AI rewrite.
- An AI repair cannot affect the draft until it has been safely rendered, deterministically rescored, and explicitly approved.
- Applying a proposal is undoable and marks the draft/candidate state correctly.
- Static pilot regions can reach at least 99% matching stable pixels with exact crop dimensions.
- Repaired interactive regions retain their declared behavior.
- Build Candidate independently verifies the composed page and cannot be bypassed by fidelity metadata or AI output.
