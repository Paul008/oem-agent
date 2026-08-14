# Adaptive Match OEM Design

**Date:** 2026-08-14

**Status:** Implemented and deployed to production on 2026-08-14

**Supersedes:** The selected-region workflow in `2026-08-13-oem-fidelity-assistant-design.md`

## Outcome

Replace the static-only **Match OEM** comparison with one **Adaptive Match OEM** workflow. The workflow deterministically compiles known/simple regions, uses multimodal AI for complex or ambiguous regions, evaluates no more than three rendered candidates, shows the best candidate, and changes the draft only after explicit operator approval.

The first production interaction set is:

- static sections;
- carousels;
- galleries with lightboxes;
- tabs; and
- accordions.

## Product Decisions

- Entry point: one **Adaptive Match OEM** action.
- Routing: deterministic for known static regions; AI interpretation and repair for complex or ambiguous interactive regions.
- Apply semantics: preview first, then explicit **Apply candidate**.
- Attempt limit: at most three rendered candidates, stopping early on a pass.
- Failure semantics: show the best safe candidate and its failures after three unsuccessful attempts.
- Quality gate: all required interactions pass, text and assets are preserved, no unintended overflow exists, and pixel mismatch is at most 3% at every supported viewport.
- AI boundary: models produce schema-validated manifests or constrained manifest mutations. They never produce executable scripts.
- Pen and external website-builder projects are not production dependencies.

## Architecture

```text
Selected live OEM region
  -> capture bounded evidence
  -> deterministic interaction detection
  -> deterministic compile for known/simple regions
  -> multimodal interpretation for complex/ambiguous regions
  -> schema-validated CandidateGraph
  -> approved Vue renderer
  -> visual, content, overflow and interaction QA
  -> constrained repair (maximum three candidates)
  -> preview the passing or best safe candidate
  -> explicit Apply to the unsaved draft
```

The dashboard owns browser capture, candidate rendering, deterministic QA, the attempt controller, and draft application. The Worker owns model routing, structured interpretation/repair, output validation, sanitisation, and the persisted attempt ledger.

## Evidence Contract

`AdaptiveMatchEvidence` is versioned and bounded to the selected region:

```ts
interface AdaptiveMatchEvidence {
  version: 1
  oemId: string
  modelSlug: string
  sourceUrl: string
  regionId: string
  html: string
  css: string
  recipeArtifact: Record<string, unknown> | null
  detection: InteractionDetection
  interactionStates: InteractionStateEvidence[]
  viewports: ViewportEvidence[]
  content: {
    text: string[]
    assets: AssetEvidence[]
  }
}

interface ViewportEvidence {
  name: 'desktop' | 'tablet' | 'mobile'
  width: number
  height: number
  mismatchRatio?: number
  overflow?: OverflowEvidence
}
```

Before submission, scripts, event-handler attributes, unsafe protocols, authentication material, unrelated page content, and image bytes not required for the contact sheet are removed. URLs have query credentials redacted.

The dashboard creates a single PNG contact sheet from the viewport captures for the existing one-image vision-router boundary. Repair contact sheets contain paired reference and candidate images.

## Detection Contract

Detection is deterministic and inspectable. It considers semantic elements, accessibility roles, class/id markers, data attributes, source framework markers, item counts, hidden/active state markers, and controls.

```ts
type AdaptiveMatchKind =
  | 'static'
  | 'carousel'
  | 'gallery-lightbox'
  | 'tabs'
  | 'accordion'
  | 'unknown'

interface InteractionDetection {
  kind: AdaptiveMatchKind
  confidence: number
  markers: string[]
  itemCount: number
  requiresAi: boolean
}
```

Known static regions with adequate deterministic compiler confidence stay on the deterministic path. Recognised interactive regions and unknown regions use AI unless a deterministic typed conversion already passes the complete gate.

## CandidateGraph Contract

The model's editable unit is a `CandidateGraph`, not source code:

```ts
interface CandidateGraph {
  version: 1
  kind: Exclude<AdaptiveMatchKind, 'unknown'>
  regionId: string
  confidence: number
  section: AdaptiveSection
  interaction: InteractionManifest | null
  provenance: {
    strategy: 'deterministic' | 'ai-interpretation' | 'ai-repair'
    attempt: 1 | 2 | 3
    model?: string
    provider?: string
  }
}
```

`AdaptiveSection` contains a supported page-builder section plus bounded layout and appearance tokens. Allowed section types are `content-block`, `gallery`, `tabs`, and `accordion`. The gallery renderer supplies carousel and lightbox behaviour. Layout tokens cover container width, columns per viewport, gaps, spacing, alignment, image fit/aspect ratio, colour, typography, border, radius and shadow. Values are normalised and bounded before rendering.

No AI-authored field can contain scripts, event-handler strings, active markup, frames, objects, embeds, unsafe URLs, inline styles, or unbounded CSS text. Deterministic static conversions may retain bounded compiler CSS. The Worker and dashboard both parse the graph before use.

## Model Contract

The Worker routes interpretation and repair through the existing AI router using the vision-capable `section_deep_analysis` route. The request contains:

- the versioned evidence summary;
- the viewport contact sheet;
- the CandidateGraph schema and allowed component catalogue;
- the previous graph for a repair;
- deterministic QA failures; and
- accumulated deterministic QA failures from earlier attempts.

Attempt one returns a complete CandidateGraph. Later attempts return a constrained mutation document:

```ts
interface CandidateMutation {
  version: 1
  regionId: string
  operations: Array<{
    op: 'set' | 'insert' | 'remove' | 'move'
    path: string
    value?: unknown
    from?: string
  }>
  explanation: string
}
```

Mutation paths are allowlisted beneath CandidateGraph `section` and `interaction` fields, including the bounded layout and appearance tokens stored by the section. Provenance, version and region identity cannot be mutated. A malformed, unsafe, or unusable model response consumes one of the three attempts and cannot be rendered.

## Renderer Contract

The candidate renderer uses approved Vue section components, including the gallery component's bounded adaptive carousel path. It renders from parsed CandidateGraph data and exposes stable `data-adaptive-*` selectors for QA.

Required behaviour:

- carousel: previous, next, indicators when present, bounded/wrapping active index, and keyboard-operable controls;
- gallery/lightbox: open selected item, previous/next, close button, backdrop close and Escape;
- tabs: one active tab/panel, `tablist` semantics, `aria-selected`, and keyboard selection;
- accordion: button control, `aria-expanded`, associated panel and repeatable expand/collapse;
- static: no interaction contract.

The applied page section retains CandidateGraph provenance and remains editable through the existing section editor/draft model.

## QA Contract

Each valid graph is rendered and checked at the existing desktop, tablet and mobile viewports. A candidate passes only when all of the following pass:

- mismatch ratio is at most `0.03` at every viewport;
- reference text and required assets are preserved;
- no unintended horizontal or clipped overflow exists;
- the declared interaction contract passes; and
- required accessibility state is present.

AI never supplies scores or thresholds. Deterministic measurements are authoritative.

Failed candidates receive a deterministic score used only to select the best safe preview:

1. schema and safety validity;
2. completed interaction checks;
3. preserved content and assets;
4. lowest worst-viewport mismatch;
5. fewest overflow failures.

## Attempt Controller

One run can render at most three candidates:

1. deterministic conversion or AI interpretation;
2. repair from candidate-one evidence;
3. repair from the accumulated failure evidence.

The run stops immediately on a full pass. Every attempt is immutable in the ledger. If no candidate passes, the UI selects the highest-ranked safe candidate and presents an **Apply anyway** secondary action with the failed checks visible. If no valid candidate exists, the current draft remains unchanged and the run ends with an error.

## API and Progress Events

Add an authenticated, non-mutating Worker endpoint:

```text
POST /api/v1/oem-agent/admin/adaptive-match
```

The request includes `mode: "interpret" | "repair"`, evidence, the optional previous graph, QA failures, and an optional model override. The response contains the parsed graph or mutation, provider/model provenance, run ID and attempt number.

The dashboard emits local progress for capture, rendering and QA. With `Accept: text/event-stream`, the Worker streams `accepted`, `interpreting` or `repairing`, `validated`, `persisted`, and `complete` events. The same endpoint returns ordinary JSON when streaming is not requested or supported, and the UI presents the same continuous stage timeline in both modes.

Persist the server-side attempt ledger in R2 under:

```text
model-pages/{oemId}/{modelSlug}/adaptive-match/{runId}/attempt-{n}.json
```

The ledger stores evidence hashes and summaries, model provenance, parsed outputs, validation errors, QA summaries supplied by the next repair request, latency and token use. It does not store unredacted prompts, authentication data, or arbitrary page HTML.

## Apply Contract

Opening or running Adaptive Match never changes the page. **Apply candidate** sends the selected parsed section through the existing `usePageBuilder` mutation path, which provides undo/redo, dirty tracking and candidate invalidation. Apply does not save or publish.

Applied metadata records the run ID, attempt, strategy, model/provider, interaction kind, complete attempt QA summary and timestamp.

## Interface States

The action label is **Adaptive Match OEM…** and the dialog title is **Adaptive Match OEM**. Progress stages are:

1. Capturing evidence
2. Detecting interaction
3. Building candidate
4. Testing desktop, tablet and mobile
5. Repairing attempt 2/3 or 3/3
6. Candidate ready

The result view retains OEM/candidate side-by-side, overlay and diff modes. It adds interaction results, overflow/content checks, attempt history, provider/model provenance, and the reason the displayed candidate was selected.

## Failure and Cancellation

- Cancellation invalidates the active run token and prevents stale results from changing UI state.
- Capture, asset or font failures fail closed and do not invoke AI with misleading evidence.
- Worker/model timeouts count as the current attempt and are visible in history.
- Closing and reopening the dialog begins from a clean UI state.
- The existing Safari-safe sequential capture and image inlining remain mandatory.

## Verification

- Unit tests: evidence sanitisation, interaction detection, CandidateGraph parsing, mutations, scoring and three-attempt termination.
- Component tests: all five supported kinds and explicit Apply/Apply anyway semantics.
- API tests: invalid input, unsafe output, valid interpretation, repair mutation, model failure and R2 ledger writes.
- Browser verification: Navara Safety carousel plus representative gallery/lightbox, tabs, accordion and static fixtures at all viewports.
- Required repository checks: dashboard tests, Worker tests, dashboard lint fix, dashboard build and Worker typecheck.
