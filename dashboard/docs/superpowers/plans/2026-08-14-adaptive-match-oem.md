# Adaptive Match OEM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a safe Adaptive Match OEM workflow that understands common interactive OEM regions, tries at most three schema-constrained candidates, previews the best result, and mutates the draft only after explicit Apply.

**Architecture:** The dashboard captures selected-region evidence, renders approved Vue candidates, and performs deterministic visual/content/overflow/interaction QA. The Worker uses the existing multimodal router to interpret or repair a strict CandidateGraph and records each AI attempt in R2. Known static regions retain the current deterministic compiler path.

**Tech Stack:** Vue 3, TypeScript, shadcn-vue, Tailwind CSS, Embla, html-to-image, Zod, Vitest, Hono, Cloudflare Workers, R2, existing `AiRouter`.

**Spec:** `dashboard/docs/superpowers/specs/2026-08-14-adaptive-match-oem-design.md`

## Global Constraints

- The dashboard draft cannot change until the operator explicitly applies a previewed candidate.
- At most three rendered candidates may be evaluated in one run; stop immediately when a candidate passes.
- A pass requires every interaction check, text/asset preservation, no unintended overflow, and mismatch ratio `<= 0.03` at desktop, tablet, and mobile.
- AI output is parsed with Zod and cannot contain scripts, event-handler strings, unsafe protocols, arbitrary CSS, frames, objects, or embeds.
- Supported first-release kinds are static, carousel, gallery/lightbox, tabs, and accordion.
- Preserve Safari-safe sequential capture, bounded timeouts, image inlining, and stale-run cancellation.
- Run dashboard `pnpm lint:fix`, tests, and `pnpm build`; run Worker tests and `pnpm typecheck` before completion.
- Use Node `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node` for verification in this worktree.

## File Structure

- `dashboard/src/lib/adaptive-match-contracts.ts`: CandidateGraph, evidence, API and attempt schemas plus conversion to page-builder sections.
- `dashboard/src/lib/adaptive-match-detection.ts`: deterministic common-interaction detection.
- `dashboard/src/lib/adaptive-match-qa.ts`: gate evaluation, attempt ranking and mutation application.
- `dashboard/src/lib/adaptive-match-*.test.ts`: contract, detector and QA behaviour.
- `src/design/adaptive-match.ts`: Worker-side schemas, prompt construction, AI interpretation/repair and R2 ledger persistence.
- `src/design/adaptive-match.test.ts`: Worker service tests with injected inference and R2 fakes.
- `src/routes/oem-agent.ts` and `src/routes/oem-agent.test.ts`: authenticated non-mutating endpoint.
- `dashboard/src/lib/worker-api.ts` and `.test.ts`: typed Adaptive Match client.
- `dashboard/src/pages/dashboard/components/page-builder/AdaptiveMatchCandidate.vue`: approved typed renderer.
- `dashboard/src/pages/dashboard/components/page-builder/AdaptiveMatchFrame.vue`: same-origin iframe mount with dashboard CSS at the requested viewport.
- Existing `SectionGallery.vue`, `SectionTabs.vue`, `SectionAccordion.vue`: accessible stable interaction hooks.
- `dashboard/src/pages/dashboard/components/page-builder/use-adaptive-match.ts`: bounded capture/attempt/repair controller.
- Existing `FidelityAssistantDialog.vue`: Adaptive Match progress, evidence, attempts and Apply UI.
- Existing builder/preview pages and `region-actions.ts`: pass evidence context and use the new product label.

---

### Task 1: Dashboard contracts, detection, mutation and deterministic gate

**Files:**
- Create: `dashboard/src/lib/adaptive-match-contracts.ts`
- Create: `dashboard/src/lib/adaptive-match-contracts.test.ts`
- Create: `dashboard/src/lib/adaptive-match-detection.ts`
- Create: `dashboard/src/lib/adaptive-match-detection.test.ts`
- Create: `dashboard/src/lib/adaptive-match-qa.ts`
- Create: `dashboard/src/lib/adaptive-match-qa.test.ts`

**Interfaces:**
- Produces: `adaptiveMatchGraphSchema`, `adaptiveMatchRequestSchema`, `parseAdaptiveMatchGraph`, `candidateGraphToSection`, `sectionToDeterministicGraph`.
- Produces: `detectAdaptiveMatchInteraction({ html, artifact })`.
- Produces: `evaluateAdaptiveCandidate(input)`, `rankAdaptiveAttempts(attempts)`, `applyCandidateMutation(graph, mutation)`.

- [ ] **Step 1: Write failing contract tests**

Cover a valid Navara-style carousel graph, valid gallery/tabs/accordion graphs, rejection of scripts/handlers/unsafe URLs/arbitrary CSS, rejection of mismatched region IDs, and conversion to an editable page section carrying `_adaptive_match` provenance.

```ts
it('rejects executable content in a model candidate', () => {
  const result = adaptiveMatchGraphSchema.safeParse({
    ...validGalleryGraph,
    section: { ...validGalleryGraph.section, title: '<script>alert(1)</script>' },
  })
  expect(result.success).toBe(false)
})
```

- [ ] **Step 2: Run the contract test and verify RED**

Run from `dashboard/`:

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/lib/adaptive-match-contracts.test.ts --mode production
```

Expected: FAIL because `adaptive-match-contracts.ts` does not exist.

- [ ] **Step 3: Implement strict Zod contracts and section conversion**

Use discriminated section schemas:

```ts
const adaptiveSectionSchema = z.discriminatedUnion('type', [
  deterministicContentBlockSchema,
  gallerySectionSchema,
  tabsSectionSchema,
  accordionSectionSchema,
])
```

Bound strings, arrays, numeric layout tokens and URLs. Permit generated HTML/CSS only when provenance strategy is `deterministic`; sanitise it through the existing clone conversion path before page-section conversion.

- [ ] **Step 4: Write failing interaction detector tests**

Use literal fixtures for Swiper/Navara carousel markers, thumbnail lightbox markup, ARIA tabs, details/`aria-expanded` accordion markup and plain static content. Assert kind, confidence, markers, item count and `requiresAi`.

- [ ] **Step 5: Run detector tests and verify RED**

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/lib/adaptive-match-detection.test.ts --mode production
```

Expected: FAIL because the detector is missing.

- [ ] **Step 6: Implement scored deterministic detection**

Use additive markers with explicit precedence: gallery/lightbox over carousel, tabs over generic buttons, accordion over generic expanded controls, carousel over static. Return `unknown` when competing top scores are close or confidence is below `0.6`.

- [ ] **Step 7: Write failing QA and mutation tests**

Prove that `0.03` passes and `0.030001` fails, a single failed interaction blocks the gate, missing text/assets block it, overflow blocks it, only three attempts are ranked, best-candidate ordering follows the spec, and mutation paths outside `/section` and `/interaction` are rejected.

- [ ] **Step 8: Implement QA, ranking and allowlisted mutation application**

Apply operations to a structured clone, validate the result with `adaptiveMatchGraphSchema`, and never mutate the input graph.

- [ ] **Step 9: Run all Task 1 tests and commit**

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/lib/adaptive-match-contracts.test.ts src/lib/adaptive-match-detection.test.ts src/lib/adaptive-match-qa.test.ts --mode production
git add dashboard/src/lib/adaptive-match-*.ts
git commit -m "feat: add adaptive match contracts and deterministic gate"
```

### Task 2: Worker multimodal interpretation and repair service

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/design/adaptive-match.ts`
- Create: `src/design/adaptive-match.test.ts`

**Interfaces:**
- Consumes: the wire representation defined by dashboard contracts.
- Produces: `executeAdaptiveMatch(request, deps): Promise<AdaptiveMatchResponse>`.
- Dependency boundary: `deps.infer(request): Promise<InferenceResponse>` and `deps.bucket.put(key, body, options)`.

- [ ] **Step 1: Add Zod as a direct Worker dependency**

```bash
pnpm add zod@^4.3.6
```

Verify `package.json` and the root lockfile contain the direct dependency and no unrelated upgrades.

- [ ] **Step 2: Write failing Worker service tests**

Test interpretation with a complete gallery graph, repair with a constrained mutation applied to the previous graph, executable-output rejection, region-ID mismatch rejection, malformed JSON, max input bounds, prompt redaction, provider/model provenance, and the exact R2 key `model-pages/{oemId}/{modelSlug}/adaptive-match/{runId}/attempt-{n}.json`.

```ts
it('rejects AI output that changes the selected region identity', async () => {
  await expect(executeAdaptiveMatch(validRequest, {
    infer: async () => inference(JSON.stringify({ ...validGraph, regionId: 'other' })),
    bucket,
  })).rejects.toThrow('regionId')
})
```

- [ ] **Step 3: Run the Worker service test and verify RED**

```bash
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/design/adaptive-match.test.ts
```

Expected: FAIL because the service is missing.

- [ ] **Step 4: Implement the Worker service**

The prompt enumerates allowed section fields and interaction behaviour, includes only sanitised evidence summaries, and instructs JSON-only output. Call the injected inference dependency with:

```ts
{
  taskType: 'section_deep_analysis',
  requireJson: true,
  imageBase64: request.contactSheetBase64,
  imageMimeType: 'image/png',
  prompt,
  oemId: request.evidence.oemId as OemId,
  overrideRoute: request.modelOverride,
}
```

Parse fenced or plain JSON, validate the graph/mutation, apply repairs server-side, add authoritative provenance, then persist a redacted ledger entry.

- [ ] **Step 5: Run service tests and commit**

```bash
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/design/adaptive-match.test.ts
git add package.json pnpm-lock.yaml src/design/adaptive-match.ts src/design/adaptive-match.test.ts
git commit -m "feat: add multimodal adaptive match service"
```

### Task 3: Authenticated Worker endpoint and dashboard API client

**Files:**
- Modify: `src/routes/oem-agent.ts`
- Modify: `src/routes/oem-agent.test.ts`
- Modify: `dashboard/src/lib/worker-api.ts`
- Modify: `dashboard/src/lib/worker-api.test.ts`

**Interfaces:**
- Produces endpoint: `POST /api/v1/oem-agent/admin/adaptive-match`.
- Produces dashboard client: `requestAdaptiveMatch(input, { onProgress }): Promise<AdaptiveMatchResponse>`.

- [ ] **Step 1: Write failing route tests**

Assert invalid JSON returns 400, invalid schema returns 400, the valid JSON request invokes the vision route and returns a parsed graph, provider failure returns 502 without mutating page storage, and the R2 ledger write is awaited. With `Accept: text/event-stream`, assert ordered `accepted`, `interpreting`/`repairing`, `validated`, `persisted`, and `complete` events.

- [ ] **Step 2: Run the route tests and verify RED**

```bash
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/routes/oem-agent.test.ts -t "adaptive match"
```

Expected: FAIL with route 404.

- [ ] **Step 3: Add the route using existing `AiRouter` construction**

Instantiate `AiRouter` with the existing provider keys, Supabase client and Workers AI binding, pass `router.route.bind(router)` to the service, and return bounded error messages without raw model output.

- [ ] **Step 4: Write failing dashboard client test**

Assert authenticated POST, exact JSON body, `Accept: text/event-stream`, data-URL prefix stripping from `contactSheetBase64`, ordered progress callbacks, parsed `complete` data, and JSON fallback when the response content type is not an event stream.

- [ ] **Step 5: Implement `requestAdaptiveMatch` and run both suites**

```bash
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/routes/oem-agent.test.ts -t "adaptive match"
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/lib/worker-api.test.ts --mode production
```

- [ ] **Step 6: Commit the endpoint and client**

```bash
git add src/routes/oem-agent.ts src/routes/oem-agent.test.ts dashboard/src/lib/worker-api.ts dashboard/src/lib/worker-api.test.ts
git commit -m "feat: expose adaptive match interpretation API"
```

### Task 4: Typed Vue candidate renderer and interaction contracts

**Files:**
- Create: `dashboard/src/pages/dashboard/components/page-builder/AdaptiveMatchCandidate.vue`
- Create: `dashboard/src/pages/dashboard/components/page-builder/AdaptiveMatchCandidate.test.ts`
- Create: `dashboard/src/pages/dashboard/components/page-builder/AdaptiveMatchFrame.vue`
- Create: `dashboard/src/pages/dashboard/components/page-builder/AdaptiveMatchFrame.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/sections/SectionGallery.vue`
- Modify: `dashboard/src/pages/dashboard/components/sections/SectionTabs.vue`
- Modify: `dashboard/src/pages/dashboard/components/sections/SectionAccordion.vue`
- Modify: `dashboard/src/lib/fidelity-assets.ts`
- Modify: `dashboard/src/lib/fidelity-frame-images.test.ts`

**Interfaces:**
- Produces component prop: `{ graph: CandidateGraph, oemId: string }`.
- Produces frame methods through `defineExpose`: `ready()`, `root()`, `document()`.
- Extends `inlineFidelityFrameImages(root: Document | Element, options)`.

- [ ] **Step 1: Write failing real-component interaction tests**

Mount actual candidate components and assert carousel controls change the active item, gallery opens/closes the lightbox and responds to Escape, tabs update `aria-selected` and visible panel, accordion updates `aria-expanded`, and static deterministic content contains no executable nodes.

- [ ] **Step 2: Run component tests and verify RED**

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/pages/dashboard/components/page-builder/AdaptiveMatchCandidate.test.ts --mode production
```

- [ ] **Step 3: Add stable accessible interaction hooks**

Use `data-adaptive-section`, `data-adaptive-item`, `data-adaptive-prev`, `data-adaptive-next`, `data-adaptive-lightbox`, `data-adaptive-tab`, `data-adaptive-panel`, and `data-adaptive-accordion-trigger`. Add missing button labels, tab roles, panel associations, accordion associations and Escape handling.

- [ ] **Step 4: Implement the renderer with bounded token styles**

Map parsed graphs only to `SectionGallery`, `SectionTabs`, `SectionAccordion`, or sanitised deterministic content. Convert appearance/layout tokens into Vue style objects and CSS variables; never concatenate model-provided CSS.

- [ ] **Step 5: Write failing iframe viewport test**

Assert the frame clones the dashboard stylesheet links/styles, mounts the actual Vue renderer inside a same-origin sandbox without `allow-scripts`, updates when the graph changes, and unmounts cleanly.

- [ ] **Step 6: Implement the frame and scoped image inlining**

Mount from the parent Vue runtime into the iframe document, while CSS is loaded by cloned stylesheet nodes. Change `inlineFidelityFrameImages` to query images under only the supplied root.

- [ ] **Step 7: Run renderer/frame/asset tests and commit**

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/pages/dashboard/components/page-builder/AdaptiveMatchCandidate.test.ts src/pages/dashboard/components/page-builder/AdaptiveMatchFrame.test.ts src/lib/fidelity-frame-images.test.ts --mode production
git add dashboard/src/pages/dashboard/components/page-builder/AdaptiveMatch*.vue dashboard/src/pages/dashboard/components/page-builder/AdaptiveMatch*.test.ts dashboard/src/pages/dashboard/components/sections/SectionGallery.vue dashboard/src/pages/dashboard/components/sections/SectionTabs.vue dashboard/src/pages/dashboard/components/sections/SectionAccordion.vue dashboard/src/lib/fidelity-assets.ts dashboard/src/lib/fidelity-frame-images.test.ts
git commit -m "feat: render adaptive interactive candidates"
```

### Task 5: Three-attempt capture, QA and repair controller

**Files:**
- Create: `dashboard/src/pages/dashboard/components/page-builder/use-adaptive-match.ts`
- Create: `dashboard/src/pages/dashboard/components/page-builder/use-adaptive-match.test.ts`
- Modify: `dashboard/src/lib/region-fidelity.ts`
- Modify: `dashboard/src/lib/region-fidelity.test.ts`

**Interfaces:**
- Produces: `useAdaptiveMatch(options)` with `start()`, `cancel()`, `state`, `attempts`, `bestAttempt`, `progress`.
- Consumes frame registry methods for reference and candidate documents.

- [ ] **Step 1: Write failing attempt-controller tests**

Use injected capture, render, QA and API functions. Assert deterministic static pass makes zero AI calls, interactive detection calls interpretation before first candidate, pass stops early, failures call exactly two repairs, three failures show the best safe candidate, schema/model failures consume attempts, and cancellation discards stale completions.

- [ ] **Step 2: Run controller tests and verify RED**

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/pages/dashboard/components/page-builder/use-adaptive-match.test.ts --mode production
```

- [ ] **Step 3: Implement the controller and contact-sheet creation**

Keep the state machine explicit:

```ts
type AdaptiveMatchStage =
  | 'idle' | 'capturing' | 'detecting' | 'building'
  | 'testing' | 'repairing' | 'ready' | 'failed' | 'cancelled'
```

Reference captures occur once per run; candidate captures occur once per valid attempt. Candidate and reference capture remain sequential. Derive bounded initial active/hidden state evidence from semantic attributes and captured runtime markers, and probe the rendered candidate through the declared safe actions. A repair request receives the accumulated literal failure summaries and a paired contact sheet.

- [ ] **Step 4: Extend deterministic pixel results with overflow dimensions**

Record `scrollWidth`, `clientWidth`, `scrollHeight`, `clientHeight`, and clipped media bounds. Preserve the current RGBA mismatch implementation and threshold.

- [ ] **Step 5: Run Task 5 tests and commit**

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/pages/dashboard/components/page-builder/use-adaptive-match.test.ts src/lib/region-fidelity.test.ts --mode production
git add dashboard/src/pages/dashboard/components/page-builder/use-adaptive-match.ts dashboard/src/pages/dashboard/components/page-builder/use-adaptive-match.test.ts dashboard/src/lib/region-fidelity.ts dashboard/src/lib/region-fidelity.test.ts
git commit -m "feat: add bounded adaptive match repair loop"
```

### Task 6: Adaptive Match dialog and page-builder integration

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/FidelityAssistantDialog.vue`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/FidelityAssistantDialog.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/FidelityAssistantDialog.lifecycle.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/region-actions.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/[slug].vue`
- Modify: `dashboard/src/pages/preview/[slug].vue`
- Modify: associated preview/workflow source tests.

**Interfaces:**
- Dialog adds props `modelSlug`, `sourceUrl`, `recipeArtifact` and optional `modelOverride`.
- Dialog continues emitting `apply(section)` only from an explicit action.

- [ ] **Step 1: Write failing dialog behaviour tests**

Assert the title/action copy is **Adaptive Match OEM**, opening begins the run, progress is announced, attempts are listed, passing candidates expose only Apply, failed best candidates expose a warned Apply anyway, Cancel never emits Apply, and reopening clears old state.

- [ ] **Step 2: Run dialog tests and verify RED**

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/pages/dashboard/components/page-builder/FidelityAssistantDialog.test.ts src/pages/dashboard/components/page-builder/FidelityAssistantDialog.lifecycle.test.ts --mode production
```

- [ ] **Step 3: Replace the static measurement flow with the controller**

Retain OEM/candidate/overlay/diff views and Safari timeouts. Add interaction/content/asset/overflow results, attempt history, provenance, selection rationale and clear Apply/Apply anyway copy. Disable Apply while running or without a valid best attempt.

- [ ] **Step 4: Update action payloads and both page entry points**

Pass the exact recipe artifact, model slug and source URL into the dialog. `applyFidelityCandidate` continues using `addSectionFromLiveData`, sets sections mode, marks the draft dirty and does not save.

- [ ] **Step 5: Update integration source tests and run the focused dashboard suite**

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run src/pages/dashboard/components/page-builder/region-actions.test.ts src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts src/pages/preview/preview-tailwind-toolbar.test.ts src/pages/dashboard/page-builder/full-preview-workflow.test.ts --mode production
```

- [ ] **Step 6: Commit UI integration**

```bash
git add dashboard/src/pages/dashboard/components/page-builder dashboard/src/pages/dashboard/page-builder/'[slug].vue' dashboard/src/pages/preview/'[slug].vue'
git commit -m "feat: wire Adaptive Match OEM into the editor"
```

### Task 7: Full verification, review fixes and production rollout

**Files:**
- Modify only files required by verification findings.

- [ ] **Step 1: Run dashboard lint auto-fix**

```bash
pnpm lint:fix
```

- [ ] **Step 2: Run the complete dashboard test suite**

Source the existing dashboard environment without printing it, then run:

```bash
VITEST=true /Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run --mode production
```

Expected: all dashboard files and tests pass.

- [ ] **Step 3: Run dashboard production build**

```bash
pnpm build
```

Expected: Vue typecheck and Vite build succeed.

- [ ] **Step 4: Run complete Worker tests and typecheck**

```bash
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run
pnpm typecheck
```

Expected: all Worker tests and TypeScript checks pass.

- [ ] **Step 5: Perform browser smoke verification**

Verify the Navara Safety region follows the carousel path, shows three bounded attempts at most, displays the best candidate, supports interaction checks, and changes the unsaved draft only after Apply. Verify static, gallery/lightbox, tabs and accordion fixtures.

- [ ] **Step 6: Review staged changes and secrets**

```bash
git diff --check
git status --short
git diff --staged
```

Confirm no environment files, image evidence, prompts, API keys, build output or temporary artifacts are tracked.

- [ ] **Step 7: Commit verification fixes and documentation**

```bash
git add dashboard/docs/superpowers/specs/2026-08-14-adaptive-match-oem-design.md dashboard/docs/superpowers/plans/2026-08-14-adaptive-match-oem.md
git commit -m "docs: record Adaptive Match OEM architecture"
```

- [ ] **Step 8: Push, deploy Worker and dashboard, then verify immutable/live assets**

Push `feature/adaptive-match-oem`, merge through the approved repository workflow, deploy the Worker with `pnpm run deploy`, build the dashboard, deploy `dashboard/dist` to the `oem-dashboard` Pages project, and verify the production alias serves the same hashed JavaScript asset as the immutable deployment URL.
