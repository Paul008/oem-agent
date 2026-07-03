# Implementation Plan: OEM Vehicle Page Clone Compiler

## Overview

This plan turns the PRD into an implementable sequence. The first objective is not to solve every OEM page; it is to create one reliable vertical path for Volkswagen Amarok and Ford Mustang:

1. queue a compile job from the admin UI/API
2. capture source evidence
3. generate section artifacts
4. run visual and interaction QA
5. publish a versioned preview artifact
6. attach the run evidence to the knowledge index

The plan keeps Cloudflare as the default execution layer, Paperclip as the optional agentic control plane, and the compiler as the product core.

## Architecture Decisions

- The compiler domain model stays tool-agnostic. Cloudflare, Paperclip, browser automation, LLMs, and visual diff providers are adapters.
- Section artifacts are the client-facing unit of quality. Full-page clone HTML is raw evidence and fallback, not the final source of truth.
- LLMs produce structured manifests and repair proposals. They do not publish unverified freeform code.
- Alpine is supported only through an explicit `alpine-island` render target with allowlisted directives and local state boundaries.
- Paperclip coordinates goals, tasks, approvals, budgets, and recurring agent work. It does not render pages or own artifacts.
- Graphy/Obsidian-style knowledge export is generated from compiler evidence and run reports.

## Phase 1: Contracts and Run Model

### Task 1: Define Compiler Run Schemas

**Description:** Add shared TypeScript types for compile jobs, capture runs, section manifests, render targets, QA reports, repair plans, and artifact metadata.

**Acceptance criteria:**

- [ ] Types cover `CaptureRun`, `CompileJob`, `SectionManifest`, `SectionArtifact`, `QaReport`, `RepairPlan`, and `RenderTarget`.
- [ ] Render targets include `vue`, `static-html`, `tailwind-html`, `alpine-island`, `react`, and `web-component`.
- [ ] Compile job status supports `queued`, `capturing`, `segmenting`, `compiling`, `qa`, `publishing`, `succeeded`, and `failed`.

**Verification:**

- [ ] `pnpm test`
- [ ] `pnpm typecheck`

**Dependencies:** None

**Files likely touched:**

- `src/design/*`
- `src/oem/types.ts`

**Estimated scope:** Medium

### Task 2: Define Provider Interfaces

**Description:** Create adapter boundaries for browser capture, artifact storage, visual diffing, model reasoning, edge execution, knowledge indexing, and agentic control plane.

**Acceptance criteria:**

- [ ] Interfaces match the PRD contracts.
- [ ] Existing R2 and worker routes can implement the artifact/edge interfaces incrementally.
- [ ] Paperclip integration is represented as an optional adapter with no runtime dependency.

**Verification:**

- [ ] Unit tests verify provider contracts can be mocked.
- [ ] `pnpm test`
- [ ] `pnpm typecheck`

**Dependencies:** Task 1

**Files likely touched:**

- `src/design/providers.ts`
- `src/design/pipeline.ts`
- `src/routes/oem-agent.ts`

**Estimated scope:** Medium

## Checkpoint: Contracts

- [ ] Types are stable enough for backend and dashboard work.
- [ ] No direct Cloudflare/Paperclip assumptions leak into compiler core.
- [ ] Existing Mustang/VW generation still compiles.

## Phase 2: Cloudflare Compile Harness

### Task 3: Create Compile Job API

**Description:** Add an admin endpoint that creates a compile job for `{oemId, modelSlug, sourceUrl}` and returns a run ID plus observable status URL.

**Acceptance criteria:**

- [ ] Endpoint accepts force rebuild and render target options.
- [ ] Endpoint stores an initial run record/artifact.
- [ ] Endpoint returns run ID, status URL, and preview URL placeholder.

**Verification:**

- [ ] Route tests cover valid, invalid, and unauthorized calls.
- [ ] `pnpm test`

**Dependencies:** Tasks 1-2

**Files likely touched:**

- `src/routes/oem-agent.ts`
- `src/design/pipeline.ts`
- `src/design/pipeline.test.ts`

**Estimated scope:** Medium

### Task 4: Persist Run Progress and Evidence Pointers

**Description:** Store compile run status, current stage, timestamps, warnings, artifact paths, and failure reason.

**Acceptance criteria:**

- [ ] Status can be read by the dashboard without polling the final page artifact.
- [ ] Failed runs preserve raw evidence pointers and actionable reason.
- [ ] Run status is versioned and does not overwrite the last known-good page.

**Verification:**

- [ ] Unit tests for stage transitions.
- [ ] Manual run against Mustang and Amarok source URLs.

**Dependencies:** Task 3

**Files likely touched:**

- `src/design/pipeline.ts`
- `src/gateway/r2.ts`
- `src/routes/oem-agent.ts`

**Estimated scope:** Medium

### Task 5: Add Isolated Preview Harness Endpoint

**Description:** Add a route that renders one section artifact in isolation for screenshot QA.

**Acceptance criteria:**

- [ ] Harness can render HTML/CSS/assets for a single section.
- [ ] Harness supports static fallback state for dynamic components.
- [ ] Harness uses strict CSP and version-pinned artifact URLs.

**Verification:**

- [ ] Unit tests assert generated harness contains the section artifact and CSP.
- [ ] Manual browser check for one hero and one gallery section.

**Dependencies:** Tasks 1-4

**Files likely touched:**

- `src/routes/oem-agent.ts`
- `src/design/page-cloner.ts`
- `src/design/production-css-scope.ts`

**Estimated scope:** Medium

## Checkpoint: One Job Can Run

- [ ] Admin/API can create a compile run.
- [ ] Run status is visible.
- [ ] Evidence and artifacts are written to R2-compatible storage.
- [ ] No manual R2 edit is required for a basic compile attempt.

## Phase 3: Evidence Capture and Section Segmentation

### Task 6: Capture SSR, Hydrated DOM, Assets, Fonts, and Screenshots

**Description:** Extend the capture layer to store both initial HTML and hydrated DOM, plus network/assets/font diagnostics and viewport screenshots.

**Acceptance criteria:**

- [ ] VW styled-components SSR body/style evidence is preserved.
- [ ] Hydrated DOM evidence is preserved separately.
- [ ] Font usage and missing font variables are recorded.
- [ ] Desktop and mobile screenshots are stored.

**Verification:**

- [ ] Tests cover SSR vs hydrated strategy selection.
- [ ] Manual capture report exists for VW Amarok and Ford Mustang.

**Dependencies:** Phase 2

**Files likely touched:**

- `src/design/page-capturer.ts`
- `src/design/capture-diagnostics.ts`
- `src/design/page-capturer.test.ts`

**Estimated scope:** Large; split further if needed

### Task 7: Build Deterministic Section Detector

**Description:** Segment captured pages into typed sections using DOM landmarks, visual boxes, text anchors, media regions, and repeated patterns.

**Acceptance criteria:**

- [ ] Detector identifies hero, CTA, specs, intro/content, feature cards, gallery/media, and sticky bars.
- [ ] Each section has a bounding box, source selector, confidence, and strategy hint.
- [ ] Detector stores screenshot crop references.

**Verification:**

- [ ] Unit tests with VW/Ford fixtures.
- [ ] Manual section manifest review for Amarok and Mustang.

**Dependencies:** Task 6

**Files likely touched:**

- `src/design/section-parser.ts`
- `src/design/page-structurer.ts`
- `src/design/section-mapper.ts`

**Estimated scope:** Medium

### Task 8: Add LLM Section Classifier Adapter

**Description:** Add optional model reasoning that classifies sections from screenshot crops and DOM snippets into the same section manifest schema.

**Acceptance criteria:**

- [ ] Model output is schema-validated.
- [ ] Model sections are reconciled against actual DOM bounding boxes.
- [ ] Compiler can run without the model adapter.

**Verification:**

- [ ] Mocked model tests cover valid and invalid structured outputs.
- [ ] One manual run compares deterministic vs model-assisted section manifests.

**Dependencies:** Task 7

**Files likely touched:**

- `src/ai/*`
- `src/design/prompt-builder.ts`
- `src/design/section-mapper.ts`

**Estimated scope:** Medium

## Phase 4: Section Compilation and Dynamic Runtime Adapters

### Task 9: Compile Static Section Artifacts

**Description:** Compile per-section HTML/CSS/assets using linked CSS, SSR styled-components, CSSOM, computed-critical, and reconstructed strategies.

**Acceptance criteria:**

- [ ] Section artifact includes HTML, CSS, asset list, root vars, fonts, warnings, and strategy.
- [ ] VW SSR body/style pairing is selected when hydrated DOM mismatches styled CSS.
- [ ] Missing font variable repair can be applied as a known recipe.

**Verification:**

- [ ] Tests cover VW SSR mismatch and font variable repair.
- [ ] Local rendered hero/CTA sections visually match source within tolerance.

**Dependencies:** Phase 3

**Files likely touched:**

- `src/design/page-capturer.ts`
- `src/design/pipeline.ts`
- `src/design/production-css-scope.ts`

**Estimated scope:** Large; split by strategy if needed

### Task 10: Implement Dynamic Component Manifests

**Description:** Convert dynamic source regions into typed interaction manifests for carousel, gallery-lightbox, tabs, accordion, pinned-scroll, sticky-bar, vehicle-360, and finance calculator.

**Acceptance criteria:**

- [ ] Manifest maps source runtime to preferred local runtime.
- [ ] Swiper/Splide/Slick source regions can map to Embla or static fallback.
- [ ] Alpine suitability is explicitly represented for portable island output.

**Verification:**

- [ ] Unit tests for runtime mapping.
- [ ] Manual gallery/tabs conversion from at least one captured OEM page.

**Dependencies:** Task 9

**Files likely touched:**

- `src/design/component-generator.ts`
- `dashboard/src/pages/dashboard/components/page-builder/section-templates.ts`
- `dashboard/src/pages/dashboard/components/page-builder/section-registry.ts`

**Estimated scope:** Medium

### Task 11: Add Alpine Island Render Target

**Description:** Add a safe `alpine-island` output adapter for simple portable interactivity.

**Acceptance criteria:**

- [ ] Alpine directives are emitted only by the explicit Alpine adapter.
- [ ] Directive allowlist covers `x-data`, `x-show`, `x-on`/`@`, `x-model`, `x-for`, and transitions where approved.
- [ ] Static body/page generators continue to reject accidental Alpine directives.

**Verification:**

- [ ] Tests prove static generator rejects Alpine.
- [ ] Tests prove Alpine adapter can generate a simple tabs/gallery island.
- [ ] Browser QA validates one Alpine island interaction.

**Dependencies:** Task 10

**Files likely touched:**

- `src/design/component-generator.ts`
- `src/design/page-generator.ts`
- `src/design/tailwind-recipe-compiler.ts`

**Estimated scope:** Medium

## Phase 5: QA, Knowledge, and Paperclip

### Task 12: Visual and Interaction QA Report

**Description:** Generate source/clone/diff screenshots and run interaction checks for dynamic sections.

**Acceptance criteria:**

- [ ] QA report includes visual score, font checks, missing assets, narrow text, overflow, and whitespace anomalies.
- [ ] Interaction QA covers carousel next/prev, tabs, accordion, lightbox, sticky bar, and fallback rendering.
- [ ] Failed QA blocks publish unless manually overridden.

**Verification:**

- [ ] Automated QA tests for known failures.
- [ ] Manual QA report for VW Amarok and Ford Mustang.

**Dependencies:** Phase 4

**Files likely touched:**

- `scripts/oem-fidelity-report.mjs`
- `src/design/capture-diagnostics.ts`
- `src/design/pipeline.ts`

**Estimated scope:** Medium

### Task 13: Knowledge Export

**Description:** Export compile runs, OEM profiles, component manifests, failure modes, and repair recipes into Markdown/frontmatter plus JSON sidecars.

**Acceptance criteria:**

- [ ] Obsidian-compatible notes are generated for OEM, model, run, component, runtime, and repair recipe.
- [ ] Notes include graph links and artifact references.
- [ ] Knowledge export can be queried by a future agent run.

**Verification:**

- [ ] Unit tests assert frontmatter shape.
- [ ] Manual vault review for Amarok run.

**Dependencies:** Task 12

**Files likely touched:**

- `src/design/memory.ts`
- `docs/knowledge/*`

**Estimated scope:** Medium

### Task 14: Paperclip Optional Control-Plane Adapter

**Description:** Add a thin adapter that can create Paperclip tasks, attach QA artifacts, request approvals, and wake agents from compiler events.

**Acceptance criteria:**

- [ ] Adapter is optional and disabled by default.
- [ ] Compile job can create/update a Paperclip task when configured.
- [ ] QA report and screenshots can be attached as work products.
- [ ] Repair recipe promotion can request approval.

**Verification:**

- [ ] Mock Paperclip API tests.
- [ ] Manual dry run against a local Paperclip task if available.

**Dependencies:** Tasks 12-13

**Files likely touched:**

- `src/design/providers.ts`
- `src/routes/oem-agent.ts`
- `src/config.ts`

**Estimated scope:** Medium

## Final Checkpoint: MVP

- [ ] VW Amarok and Ford Mustang can run through the same compile workflow.
- [ ] The workflow produces versioned artifacts without manual R2 edits.
- [ ] Admin can see progress, failure reasons, and QA evidence.
- [ ] At least one dynamic section uses a local runtime adapter or explicit fallback.
- [ ] Knowledge export records the run and repair decisions.
- [ ] Paperclip integration is optional and does not affect direct dashboard use.

## Parallelization

After Tasks 1-2 land, the work can split:

- Cloudflare harness: Tasks 3-5
- Capture/segmentation: Tasks 6-8
- Runtime/component grammar: Tasks 10-11
- Knowledge/Paperclip adapter design: Tasks 13-14

Tasks 9 and 12 should wait until the capture and section manifests are stable.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| OEM pages change during implementation | High | Store raw evidence and rerun scheduled capture against current pages |
| LLM output becomes inconsistent | High | Require structured outputs, schema validation, and deterministic browser QA |
| Cloudflare-specific APIs leak into compiler core | Medium | Keep provider interfaces at the compiler boundary |
| Alpine/Vue state models collide | Medium | Alpine only through explicit `alpine-island` adapter |
| Visual QA is noisy | Medium | Fixed browser/font environment and deterministic masks |
| Paperclip integration slows core delivery | Medium | Keep Paperclip optional until compiler MVP is working |

## First Implementation Cut

Start with Tasks 1-5. That gives us the compile-job backbone, status visibility, and artifact harness. Then use VW Amarok and Ford Mustang as the first two regression fixtures before expanding to more OEMs.
