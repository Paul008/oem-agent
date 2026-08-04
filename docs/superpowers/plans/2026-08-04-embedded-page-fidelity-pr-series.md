# Embedded Page Fidelity PR Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a rollback-safe editor, Kimi Tailwind recreation flow, state-aware interaction compiler, and real-consumer fidelity QA as four independently reviewable pull requests.

**Architecture:** The dashboard continues to edit clone HTML through the iframe bridge, while the Worker owns AI routing, generated-output validation, capture evidence, and production artifact contracts. Deterministic scoped CSS remains the default renderer; Kimi K3 is an explicit repair path, and a schema-constrained Alpine CSP runtime restores approved interactions. Each PR starts from the latest merged `main`, passes its own tests/builds, and can be reverted without reverting later unrelated work.

**Tech Stack:** Vue 3, TypeScript, shadcn-vue, Tailwind CSS 4, Vitest, Hono, Cloudflare Workers, Puppeteer/CDP, PostCSS, Cheerio, Playwright, Alpine CSP, Moonshot Kimi K3.

## Global Constraints

- Do not execute copied OEM JavaScript in the dashboard or consumer page.
- Do not accept arbitrary AI-authored JavaScript, inline event handlers, unsafe URLs, iframes, objects, or embeds.
- AI output changes only the in-memory editor after explicit Apply; publishing still requires explicit Save.
- Kimi K3 uses the existing `page_screenshot_to_code` admin model policy and reports the provider/model actually used.
- Scoped full-page CSS remains the compatibility baseline; Tailwind is a selected repair or alternative output.
- Experimental CDP methods require capability checks and the current DOM/computed-style fallback.
- Run `pnpm lint:fix` after code changes in `dashboard/`.
- Run `pnpm test`, `pnpm test:dashboard`, `pnpm typecheck`, and `pnpm --dir dashboard build` for every non-trivial PR.
- Do not deploy from a feature branch. Open a draft PR, review CI and browser evidence, then merge explicitly.

## PR and Rollback Strategy

| PR | Branch | Scope | Revert boundary |
|---|---|---|---|
| 1 | `fix/clone-selection-toolbar` | Scroll-following toolbar and deterministic Tailwind submenu | Editor-only behavior |
| 2 | `feature/kimi-tailwind-recreation` | Kimi selected/all conversion, preview/apply, cancellation | AI conversion only |
| 3 | `feature/state-aware-clone-runtime` | Capture evidence, safe state exploration, safelist, modal runtime | Compiler/runtime only |
| 4 | `feature/embed-fidelity-qa` | Consumer configuration and three-target state-aware QA | Admin/QA only |

After PR 1, PR 2, and PR 3 merge respectively:

```bash
git fetch origin
git worktree add /private/tmp/oem-agent-kimi-tailwind -b feature/kimi-tailwind-recreation origin/main
git worktree add /private/tmp/oem-agent-state-runtime -b feature/state-aware-clone-runtime origin/main
git worktree add /private/tmp/oem-agent-embed-qa -b feature/embed-fidelity-qa origin/main
```

Do not stack all four branches before review. Starting each later PR from the merged predecessor makes GitHub's Revert action produce an intelligible inverse commit.

---

## PR 1 — Editor Geometry and Deterministic Tailwind Menu

### Task 1: Emit selected-region geometry while the iframe scrolls

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

**Interfaces:**
- Produces bridge message: `{ type: 'clone-studio:selected-geometry', region: CloneRegionPayload }`.
- Produces Vue event: `regionGeometry: [region: any]`.
- Consumes existing `regionPayload(selectedRegion)` and bridge-token validation.

- [ ] **Step 1: Write the failing bridge test**

Add assertions to `clone-studio-html.test.ts`:

```ts
it('throttles selected-region geometry updates during iframe scroll and resize', () => {
  const html = buildCloneStudioHtml({
    rendered: '<main data-oem-region-id="r1"><h1>ARIYA</h1></main>',
    title: 'ARIYA',
    baseHref: 'https://www.nissan.com.au/vehicles/browse-range/ariya.html',
    selectedRegionId: 'r1',
  })
  expect(html).toContain("var MESSAGE_SELECTED_GEOMETRY = 'clone-studio:selected-geometry'")
  expect(html).toContain('function postSelectedGeometry()')
  expect(html).toContain("window.addEventListener('scroll', scheduleSelectedGeometry, true)")
  expect(html).toContain("window.addEventListener('resize', scheduleSelectedGeometry, false)")
  expect(html).toContain('requestAnimationFrame')
})
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`

Expected: FAIL because `clone-studio:selected-geometry` is absent.

- [ ] **Step 3: Add the throttled bridge message**

Inside the existing bridge closure, add:

```js
var MESSAGE_SELECTED_GEOMETRY = 'clone-studio:selected-geometry'
var selectedGeometryFrame = 0

function postSelectedGeometry() {
  selectedGeometryFrame = 0
  if (!selectedRegion)
    return
  post(MESSAGE_SELECTED_GEOMETRY, { region: regionPayload(selectedRegion) })
}

function scheduleSelectedGeometry() {
  if (selectedGeometryFrame)
    return
  selectedGeometryFrame = window.requestAnimationFrame(postSelectedGeometry)
}
```

Register it beside the existing resize-handle scroll listeners. Call `scheduleSelectedGeometry()` after selection changes so the initial and subsequent payloads use the same geometry path.

- [ ] **Step 4: Add the host relay test and implementation**

Add this contract assertion to `page-builder-canvas-preview.test.ts`:

```ts
expect(cloneCanvasSource).toContain("data.type === 'clone-studio:selected-geometry'")
expect(cloneCanvasSource).toContain("emit('regionGeometry', enrichRegionForHost(data.region))")
```

Extend `CloneStudioCanvas.vue`:

```ts
const emit = defineEmits<{
  regionGeometry: [region: any]
}>()

if (data.type === 'clone-studio:selected-geometry' && data.region) {
  emit('regionGeometry', enrichRegionForHost(data.region))
  return
}
```

Keep this distinct from `selectRegion`; geometry updates must not cancel active toolbar inputs or change application selection.

- [ ] **Step 5: Run the focused dashboard tests**

Run: `pnpm test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the bridge slice**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
git commit -m "fix: relay clone selection geometry while scrolling"
```

### Task 2: Hide, follow, and pin the toolbar correctly

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-canvas-helpers.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-coords.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

**Interfaces:**
- Produces `CloneToolbarPlacement = { x: number; y: number; visible: boolean }`.
- Produces `computeCloneToolbarPlacement(region, viewport, inset)`.
- Consumes `region.viewport_left`, `region.viewport_top`, `region.width`, and `region.height` from the bridge.

- [ ] **Step 1: Write geometry tests for visible, pinned, and off-screen states**

```ts
expect(computeCloneToolbarPlacement(
  { left: 100, top: 80, width: 400, height: 300 },
  { width: 1280, height: 720 },
)).toEqual({ x: 300, y: 92, visible: true })

expect(computeCloneToolbarPlacement(
  { left: 100, top: -200, width: 400, height: 500 },
  { width: 1280, height: 720 },
)).toEqual({ x: 300, y: 12, visible: true })

expect(computeCloneToolbarPlacement(
  { left: 100, top: -600, width: 400, height: 300 },
  { width: 1280, height: 720 },
)).toEqual({ x: 300, y: 12, visible: false })
```

- [ ] **Step 2: Run the coordinate test and confirm failure**

Run: `pnpm test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/clone-studio-coords.test.ts`

Expected: FAIL because `computeCloneToolbarPlacement` does not exist.

- [ ] **Step 3: Implement intersection-aware placement**

```ts
export interface CloneToolbarPlacement {
  x: number
  y: number
  visible: boolean
}

export function computeCloneToolbarPlacement(
  region: { left: number, top: number, width: number, height: number },
  viewport: { width: number, height: number },
  inset = 12,
): CloneToolbarPlacement {
  const right = region.left + region.width
  const bottom = region.top + region.height
  const visible = right > 0 && region.left < viewport.width && bottom > 0 && region.top < viewport.height
  return {
    x: Math.max(0, Math.min(viewport.width, region.left + region.width / 2)),
    y: Math.max(inset, Math.min(viewport.height, Math.max(0, region.top) + inset)),
    visible,
  }
}
```

Use it from `enrichRegionForHost` and emit `toolbar_visible: placement.visible`.

- [ ] **Step 4: Update the canvas without resetting edit state**

Add `onCloneRegionGeometry` to merge geometry only:

```ts
function onCloneRegionGeometry(region: any) {
  if (!cloneToolbarRegion.value || region?.id !== cloneToolbarRegion.value.id)
    return
  cloneToolbarRegion.value = {
    ...cloneToolbarRegion.value,
    toolbar_x: Number(region.toolbar_x) || 0,
    toolbar_y: Number(region.toolbar_y) || 0,
    toolbar_visible: region.toolbar_visible !== false,
  }
}
```

Bind `@region-geometry="onCloneRegionGeometry"` and require `cloneToolbarRegion.value.toolbar_visible !== false` in `cloneToolbarVisible`.

- [ ] **Step 5: Run the focused tests**

Run: `pnpm test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/clone-studio-coords.test.ts dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit toolbar positioning**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-canvas-helpers.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-coords.test.ts dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
git commit -m "fix: keep clone toolbar attached to visible selection"
```

### Task 3: Add deterministic selected/all Tailwind submenu actions

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/region-actions.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`
- Modify: `dashboard/src/pages/preview/[slug].vue`
- Modify: `dashboard/src/pages/preview/preview-tailwind-toolbar.test.ts`

**Interfaces:**
- Produces action IDs `convert-tailwind-selected` and `convert-tailwind-all`.
- `regionAction` payload remains `{ action, regionId, html?, tailwindRecipeArtifact? }`.
- Selected action consumes `replaceCloneRegionWithTailwind`; all action consumes `convertPageToTailwind`.

- [ ] **Step 1: Write the action contract test**

```ts
const actions = getRegionActions(base)
const convert = actions.find(action => action.id === 'convert-tailwind')
expect(convert?.children?.map(child => child.id)).toEqual([
  'convert-tailwind-selected',
  'convert-tailwind-all',
])
```

Extend the interface:

```ts
export interface RegionAction {
  id: RegionActionId
  label: string
  group: 'content' | 'layout' | 'region'
  children?: RegionAction[]
}
```

- [ ] **Step 2: Run the action test and confirm failure**

Run: `pnpm test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts`

Expected: FAIL because the submenu actions are absent.

- [ ] **Step 3: Implement the nested deterministic action model**

Add these IDs to `RegionActionId` and replace the flat `convert` action:

```ts
out.push({
  id: 'convert-tailwind',
  label: 'Convert to Tailwind',
  group: 'layout',
  children: [
    { id: 'convert-tailwind-selected', label: 'Selected section', group: 'layout' },
    { id: 'convert-tailwind-all', label: 'All sections', group: 'layout' },
  ],
})
```

- [ ] **Step 4: Render the secondary menu and emit leaf actions**

Track `cloneSubmenuActionId` in `PageBuilderCanvas.vue`. Parent actions with children open a positioned child panel; leaf actions call `runCloneAction`. Handle both new IDs in the structural-action switch and preserve the region payload.

The submenu must close on outside click, Escape, leaf selection, selection change, and read-only mode.

- [ ] **Step 5: Route the actions in the preview page**

Update `onRegionAction`:

```ts
if (action === 'convert-tailwind-selected') {
  await replaceCloneRegionWithTailwind({ regionId, html, tailwindRecipeArtifact })
  return
}

if (action === 'convert-tailwind-all') {
  await convertPageToTailwind()
  return
}
```

Keep the existing top toolbar buttons as alternate entry points.

- [ ] **Step 6: Run the menu and preview tests**

Run: `pnpm test:dashboard -- dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts dashboard/src/pages/preview/preview-tailwind-toolbar.test.ts`

Expected: PASS.

- [ ] **Step 7: Lint, test, and build PR 1**

```bash
pnpm --dir dashboard lint:fix
pnpm test
pnpm test:dashboard
pnpm typecheck
pnpm --dir dashboard build
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit the submenu**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/region-actions.ts dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts dashboard/src/pages/preview/'[slug].vue' dashboard/src/pages/preview/preview-tailwind-toolbar.test.ts
git commit -m "feat: add deterministic Tailwind conversion submenu"
```

- [ ] **Step 9: Push and open draft PR 1**

```bash
git push -u origin fix/clone-selection-toolbar
gh pr create --draft --base main --head fix/clone-selection-toolbar --title "Fix clone toolbar and add Tailwind submenu" --body "Implements scroll-following selection geometry and deterministic selected/all Tailwind conversion. Verification: pnpm test; pnpm test:dashboard; pnpm typecheck; pnpm --dir dashboard build. Rollback: revert the merge commit; this PR contains no data migration."
```

The PR body must list the three commits, exact verification commands, screenshots of toolbar visible/pinned/hidden states, and rollback instruction `Revert the merge commit; no data migration is included`.

---

## PR 2 — Kimi Tailwind Recreation

### Task 4: Define and validate the non-mutating AI region contract

**Files:**
- Create: `src/design/tailwind-ai-contracts.ts`
- Create: `src/design/tailwind-ai-contracts.test.ts`
- Create: `src/design/generated-html-sanitizer.ts`
- Create: `src/design/generated-html-sanitizer.test.ts`

**Interfaces:**
- Produces `RecreateTailwindRegionRequest`, `RecreateTailwindRegionResult`, `InteractionManifestCandidate`, and `validateRecreateTailwindRegionRequest`.
- Produces `sanitizeGeneratedTailwindHtml(html): { html: string; warnings: string[] }`.

- [ ] **Step 1: Write failing contract and sanitizer tests**

```ts
expect(validateRecreateTailwindRegionRequest({
  oemId: 'nissan-au',
  modelSlug: 'ariya',
  regionId: 'clone-region-6',
  sourceUrl: 'https://www.nissan.com.au/vehicles/browse-range/ariya.html',
  html: '<section>ARIYA</section>',
  artifact: {},
  baselineHtml: '<section class="relative">ARIYA</section>',
})).toMatchObject({ ok: true })

const sanitized = sanitizeGeneratedTailwindHtml('<section onclick="buy()"><script>buy()</script><a href="javascript:buy()">ARIYA</a></section>')
expect(sanitized.html).not.toMatch(/script|onclick|javascript:/i)
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test -- src/design/tailwind-ai-contracts.test.ts src/design/generated-html-sanitizer.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement bounded validation and Cheerio sanitization**

Enforce: required identifiers, HTTPS source URL, HTML maximum 500,000 characters, instructions maximum 4,000 characters, and optional provider/model strings maximum 100 characters. Remove `script`, `iframe`, `object`, `embed`, `base`, `meta[http-equiv]`, every `on*` attribute, and unsafe `href`, `src`, `srcset`, `poster`, and CSS `url()` values.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test -- src/design/tailwind-ai-contracts.test.ts src/design/generated-html-sanitizer.test.ts
git add src/design/tailwind-ai-contracts.ts src/design/tailwind-ai-contracts.test.ts src/design/generated-html-sanitizer.ts src/design/generated-html-sanitizer.test.ts
git commit -m "feat: validate AI Tailwind region contracts"
```

### Task 5: Add the authenticated Kimi recreation endpoint

**Files:**
- Create: `src/design/tailwind-region-recreator.ts`
- Create: `src/design/tailwind-region-recreator.test.ts`
- Modify: `src/routes/oem-agent.ts`
- Modify: `src/routes/oem-agent.test.ts`

**Interfaces:**
- Produces `recreateTailwindRegion(router, request): Promise<RecreateTailwindRegionResult>`.
- Produces `POST /api/v1/oem-agent/admin/recreate-tailwind-region`.
- Consumes `AiRouter.route({ taskType: 'page_screenshot_to_code', requireJson: true, overrideRoute })`.

- [ ] **Step 1: Write failing prompt/parser and route tests**

The fake router must return JSON containing `html`, `warnings`, and `interactionCandidates`. Assert the prompt contains the original HTML, deterministic baseline, viewport evidence, instructions, the ban on scripts, and the exact JSON response shape. Assert malformed JSON returns 502 and missing fields return 400 without calling the router.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test -- src/design/tailwind-region-recreator.test.ts src/routes/oem-agent.test.ts`

Expected: FAIL because the recreator and route are absent.

- [ ] **Step 3: Implement the recreator and route**

Use this route call:

```ts
const inference = await router.route({
  taskType: 'page_screenshot_to_code',
  prompt: buildTailwindRegionPrompt(request),
  requireJson: true,
  maxTokens: 16_000,
  overrideRoute: request.modelOverride,
})
```

Parse once, validate the response, sanitize HTML, and return inference metadata. The endpoint must not call R2 `put`, Supabase writes, or protected-page write guards because it is a non-mutating preview operation.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test -- src/design/tailwind-region-recreator.test.ts src/routes/oem-agent.test.ts
git add src/design/tailwind-region-recreator.ts src/design/tailwind-region-recreator.test.ts src/routes/oem-agent.ts src/routes/oem-agent.test.ts
git commit -m "feat: add non-mutating Kimi Tailwind recreation"
```

### Task 6: Add reviewed selected/all AI conversion in the dashboard

**Files:**
- Modify: `dashboard/src/lib/worker-api.ts`
- Modify: `dashboard/src/lib/worker-api.test.ts`
- Create: `dashboard/src/pages/preview/tailwind-ai-batch.ts`
- Create: `dashboard/src/pages/preview/tailwind-ai-batch.test.ts`
- Create: `dashboard/src/pages/preview/TailwindAiPreviewDialog.vue`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/region-actions.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/ai-model-options.ts`
- Modify: `dashboard/src/pages/preview/[slug].vue`
- Modify: `dashboard/src/pages/preview/preview-tailwind-toolbar.test.ts`

**Interfaces:**
- Produces `recreateTailwindRegion(request, signal?)` in `worker-api.ts`.
- Produces `runTailwindAiBatch(regions, recreate, signal, onProgress)` with bounded concurrency 2.
- Adds submenu IDs `convert-tailwind-selected-ai` and `convert-tailwind-all-ai`.
- Produces dialog outcomes `apply`, `cancel`, or `retry` without mutating on cancel/failure.
- Consumes eligible options from `ai-model-options.ts` and sends the selected `{ provider, model }` as `modelOverride`; no selection uses the admin default.

- [ ] **Step 1: Write failing API, batch, and menu tests**

```ts
expect(convert?.children?.map(child => child.id)).toEqual([
  'convert-tailwind-selected',
  'convert-tailwind-selected-ai',
  'convert-tailwind-all',
  'convert-tailwind-all-ai',
])
```

The batch test must prove concurrency never exceeds 2, abort prevents unstarted calls, failures retain the original region, and progress counts completed/failed/remaining.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test:dashboard -- dashboard/src/lib/worker-api.test.ts dashboard/src/pages/preview/tailwind-ai-batch.test.ts dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts dashboard/src/pages/preview/preview-tailwind-toolbar.test.ts`

- [ ] **Step 3: Implement API and batch coordinator**

The batch result is:

```ts
export interface TailwindAiBatchResult {
  drafts: Array<{ regionId: string, originalHtml: string, generatedHtml?: string, error?: string }>
  completed: number
  failed: number
  cancelled: boolean
}
```

Never patch the clone inside `runTailwindAiBatch`; it only returns drafts.

- [ ] **Step 4: Implement the preview/apply dialog and page wiring**

The selected flow shows original and generated srcdoc panes, warnings, provider/model, latency, a model selector defaulted to "Admin default (Kimi K3)", Apply, Cancel, and Retry. Apply calls the existing `patchCloneField` with `kind: 'outer-html'`. The all-section flow reviews the batch summary and applies successful drafts only after confirmation. Changing the selector affects only the next request and does not rewrite the stored admin policy.

- [ ] **Step 5: Run full PR 2 verification**

```bash
pnpm --dir dashboard lint:fix
pnpm test
pnpm test:dashboard
pnpm typecheck
pnpm --dir dashboard build
```

- [ ] **Step 6: Commit and open draft PR 2**

```bash
git add dashboard/src/lib/worker-api.ts dashboard/src/lib/worker-api.test.ts dashboard/src/pages/preview/tailwind-ai-batch.ts dashboard/src/pages/preview/tailwind-ai-batch.test.ts dashboard/src/pages/preview/TailwindAiPreviewDialog.vue dashboard/src/pages/dashboard/components/page-builder/region-actions.ts dashboard/src/pages/dashboard/components/page-builder/region-actions.test.ts dashboard/src/pages/dashboard/page-builder/ai-model-options.ts dashboard/src/pages/preview/'[slug].vue' dashboard/src/pages/preview/preview-tailwind-toolbar.test.ts
git commit -m "feat: add reviewed Kimi Tailwind conversion"
git push -u origin feature/kimi-tailwind-recreation
gh pr create --draft --base main --head feature/kimi-tailwind-recreation --title "Add Kimi Tailwind section recreation" --body "Adds non-mutating Kimi selected/all Tailwind drafts with explicit review and Apply. Verification: pnpm test; pnpm test:dashboard; pnpm typecheck; pnpm --dir dashboard build. Rollback: revert the merge commit; no page is changed unless a user applies and saves a draft."
```

---

## PR 3 — State-Aware Interaction Compiler

### Task 7: Define interaction evidence and manifest contracts

**Files:**
- Create: `src/design/interaction-manifest.ts`
- Create: `src/design/interaction-manifest.test.ts`
- Create: `src/design/browser-capture-evidence.ts`
- Create: `src/design/browser-capture-evidence.test.ts`
- Modify: `src/design/compiler-contracts.ts`
- Modify: `src/design/compiler-contracts.test.ts`

**Interfaces:**
- Produces `InteractionType = 'tabs' | 'accordion' | 'carousel' | 'gallery-lightbox' | 'modal'`.
- Produces schema guards for trigger/target mappings with initial state, confidence, and warnings.
- Produces `captureBrowserEvidence(cdpSession, computedStyleNames)` with a DOM fallback result.

- [ ] **Step 1: Write failing schema and CDP fallback tests**

Assert valid manifest acceptance, arbitrary expression rejection, unknown interaction rejection, selector length limits, DOMSnapshot capability use, and fallback warnings when `DOMSnapshot.captureSnapshot` fails.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test -- src/design/interaction-manifest.test.ts src/design/browser-capture-evidence.test.ts src/design/compiler-contracts.test.ts`

- [ ] **Step 3: Implement contracts and capture adapter**

The capture adapter may call only `DOMSnapshot.captureSnapshot`, `CSS.startRuleUsageTracking`, `CSS.stopRuleUsageTracking`, and `DOMDebugger.getEventListeners`. It stores listener type and node identity, never function bodies.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test -- src/design/interaction-manifest.test.ts src/design/browser-capture-evidence.test.ts src/design/compiler-contracts.test.ts
git add src/design/interaction-manifest.ts src/design/interaction-manifest.test.ts src/design/browser-capture-evidence.ts src/design/browser-capture-evidence.test.ts src/design/compiler-contracts.ts src/design/compiler-contracts.test.ts
git commit -m "feat: capture interaction evidence through CDP"
```

### Task 8: Explore safe interaction states and generate the CSS safelist

**Files:**
- Create: `src/design/interaction-state-explorer.ts`
- Create: `src/design/interaction-state-explorer.test.ts`
- Create: `src/design/interaction-classifier.ts`
- Create: `src/design/interaction-classifier.test.ts`
- Create: `src/design/interaction-css-safelist.ts`
- Create: `src/design/interaction-css-safelist.test.ts`
- Modify: `src/design/page-capturer.ts`
- Modify: `src/design/page-capturer.test.ts`
- Modify: `src/design/production-css-scope.ts`
- Modify: `src/design/production-css-scope.test.ts`
- Modify: `src/routes/oem-agent.ts`
- Modify: `src/routes/oem-agent.test.ts`

**Interfaces:**
- Produces `discoverSafeCandidates(snapshot)` and `classifyStateTransition(before, after)`.
- Produces `classifyInteractionGraph(router, evidence)` and `POST /admin/detect-clone-interactions` for low-confidence evidence only.
- Produces `buildInteractionCssSafelist(manifests): { exact: string[]; patterns: RegExp[] }`.
- Consumes safe actions only: click, Enter/Space, previous, next, open, close.

- [ ] **Step 1: Write failing safety, transition, and safelist tests**

Test that local `aria-controls` buttons are allowed while links changing origin, submit controls, downloads, purchase labels, permission buttons, and file inputs are rejected. Test transitions for `aria-expanded`, `aria-selected`, `open`, `hidden`, `display`, active classes, and visible target geometry. Test that high-confidence deterministic graphs never call AI, while a low-confidence graph routes through `page_screenshot_to_code`, validates a manifest-only JSON response, and rejects JavaScript or unsupported interaction types.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test -- src/design/interaction-state-explorer.test.ts src/design/interaction-classifier.test.ts src/design/interaction-css-safelist.test.ts src/design/page-capturer.test.ts src/design/production-css-scope.test.ts src/routes/oem-agent.test.ts`

- [ ] **Step 3: Implement pure discovery/classification first**

Use deterministic evidence before AI. Every browser action runs after page restoration/reload; the explorer records action, target, before/after attributes, mutation summary, coverage ranges, ARIA snapshot, and screenshot key.

For low-confidence graphs only, call:

```ts
const inference = await router.route({
  taskType: 'page_screenshot_to_code',
  prompt: buildInteractionClassificationPrompt(evidence),
  requireJson: true,
  maxTokens: 4_000,
})
```

The route returns a validated interaction manifest and inference metadata. It never returns HTML or executable code.

- [ ] **Step 4: Integrate accumulated state coverage and safelisting**

Pass accumulated rule ranges and manifest-derived exact/pattern selectors into production CSS scoping. Rules with uncertain state applicability remain and add a diagnostic; they are not deleted. Include state count, interaction inventory, unsupported candidates, and retained-state-rule diagnostics in `production-manifest`.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test -- src/design/interaction-state-explorer.test.ts src/design/interaction-classifier.test.ts src/design/interaction-css-safelist.test.ts src/design/page-capturer.test.ts src/design/production-css-scope.test.ts src/routes/oem-agent.test.ts
git add src/design/interaction-state-explorer.ts src/design/interaction-state-explorer.test.ts src/design/interaction-classifier.ts src/design/interaction-classifier.test.ts src/design/interaction-css-safelist.ts src/design/interaction-css-safelist.test.ts src/design/page-capturer.ts src/design/page-capturer.test.ts src/design/production-css-scope.ts src/design/production-css-scope.test.ts src/routes/oem-agent.ts src/routes/oem-agent.test.ts
git commit -m "feat: preserve CSS across explored interaction states"
```

### Task 9: Add modal annotation and owned runtime behavior

**Files:**
- Modify: `src/design/clone-annotator.ts`
- Modify: `src/design/clone-annotator.test.ts`
- Modify: `src/design/clone-runtime/clone-runtime.ts`
- Modify: `src/design/clone-runtime/clone-runtime.test.ts`
- Modify: `src/design/clone-runtime/clone-runtime.dom.test.ts`
- Modify: `src/design/clone-runtime/inject.test.ts`

**Interfaces:**
- Produces Alpine CSP component `cloneModal`.
- Uses only `data-clone-modal-open`, `data-clone-modal-panel`, `data-clone-modal-close`, and `data-clone-modal-backdrop`.
- Preserves `aria-hidden`, `aria-expanded`, focus return, Escape close, and backdrop close.

- [ ] **Step 1: Write failing annotation and DOM behavior tests**

Use a fixture with `button[aria-controls=details-dialog]`, `[role=dialog]`, close button, and backdrop. Assert stamped attributes and test open, close, Escape, backdrop, initial closed state, and focus return.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test -- src/design/clone-annotator.test.ts src/design/clone-runtime/clone-runtime.test.ts src/design/clone-runtime/clone-runtime.dom.test.ts src/design/clone-runtime/inject.test.ts`

- [ ] **Step 3: Implement modal stamping and runtime**

The component API is:

```ts
export function cloneModal() {
  return {
    open: false,
    opener: null as HTMLElement | null,
    init(): void,
    show(event?: Event): void,
    close(): void,
    onKeydown(event: KeyboardEvent): void,
  }
}
```

The runtime owns behavior. Captured OEM handlers and AI expressions are never copied.

- [ ] **Step 4: Run full PR 3 verification, commit, and open draft PR**

```bash
pnpm test
pnpm test:dashboard
pnpm typecheck
pnpm --dir dashboard build
git add src/design/clone-annotator.ts src/design/clone-annotator.test.ts src/design/clone-runtime/clone-runtime.ts src/design/clone-runtime/clone-runtime.test.ts src/design/clone-runtime/clone-runtime.dom.test.ts src/design/clone-runtime/inject.test.ts
git commit -m "feat: restore captured modal interactions safely"
git push -u origin feature/state-aware-clone-runtime
gh pr create --draft --base main --head feature/state-aware-clone-runtime --title "Add state-aware clone interaction compiler" --body "Adds CDP evidence, safe state exploration, CSS state retention, and owned modal behavior. Verification: pnpm test; pnpm test:dashboard; pnpm typecheck; pnpm --dir dashboard build. Rollback: revert the merge commit; no database migration is included."
```

---

## PR 4 — Consumer Configuration and Fidelity QA

### Task 10: Add admin-configurable embed targets without mutating protected pages

**Files:**
- Create: `src/design/embed-target-config.ts`
- Create: `src/design/embed-target-config.test.ts`
- Modify: `src/routes/oem-agent.ts`
- Modify: `src/routes/oem-agent.test.ts`
- Modify: `dashboard/src/lib/worker-api.ts`
- Modify: `dashboard/src/lib/worker-api.test.ts`
- Create: `dashboard/src/pages/dashboard/settings/embed-targets.vue`

**Interfaces:**
- Produces `EmbedTargetConfig` with `urlTemplate`, `importMode`, `contentSelector`, viewports, wait selector, and interaction profile.
- Produces authenticated `GET` and `PUT /admin/embed-target-config/:oemId/:modelSlug`.
- Stores configuration separately from page definitions so Nissan page write protection remains intact.

- [ ] **Step 1: Write failing validation, route, and API tests**

Validate HTTPS URL templates containing `{modelSlug}`, import mode `full-document | hero-body`, non-empty selectors, bounded viewport sizes, and an allowlisted interaction profile. Assert a Nissan config write succeeds while `/admin/update-clone/nissan-au/ariya` remains protected.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test -- src/design/embed-target-config.test.ts src/routes/oem-agent.test.ts && pnpm test:dashboard -- dashboard/src/lib/worker-api.test.ts`

- [ ] **Step 3: Implement separate configuration storage and settings UI**

Store the record under `workflow_settings.id = embed-target:${oemId}:${modelSlug}`. The dashboard form loads/saves only this endpoint and displays the resolved consumer URL before saving.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm --dir dashboard lint:fix
pnpm test -- src/design/embed-target-config.test.ts src/routes/oem-agent.test.ts
pnpm test:dashboard -- dashboard/src/lib/worker-api.test.ts
git add src/design/embed-target-config.ts src/design/embed-target-config.test.ts src/routes/oem-agent.ts src/routes/oem-agent.test.ts dashboard/src/lib/worker-api.ts dashboard/src/lib/worker-api.test.ts dashboard/src/pages/dashboard/settings/embed-targets.vue
git commit -m "feat: configure dealership embed targets"
```

### Task 11: Compare source, Worker artifact, and consumer across interaction states

**Files:**
- Create: `scripts/lib/fidelity-scenarios.mjs`
- Create: `scripts/lib/fidelity-scenarios.test.mjs`
- Modify: `scripts/oem-fidelity-report.mjs`
- Modify: `scripts/oem-fidelity-report.test.mjs`
- Modify: `docs/OEM_FIDELITY_QA.md`

**Interfaces:**
- Adds CLI inputs `--artifact-url`, `--consumer-url`, and repeated `--scenario`.
- Produces per-target/per-viewport/per-state screenshots, ARIA snapshots, console/network diagnostics, checksums, and section counts.
- Produces failure when the consumer checksum differs from the Worker artifact or a required interaction state is inert.

- [ ] **Step 1: Write failing CLI and scenario tests**

```js
const options = parseCliArgs([
  '--source-url', 'https://www.nissan.com.au/vehicles/browse-range/ariya.html',
  '--artifact-url', 'https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/nissan-au-ariya/production-html',
  '--consumer-url', 'https://northern-nissan.engagr.com.au/models/ariya',
  '--scenario', 'accordion:[data-clone-acc-trigger="0"]',
])
expect(options.targets.map(target => target.kind)).toEqual(['source', 'artifact', 'consumer'])
```

Add a mocked scenario test that proves click changes `expanded`, takes an after screenshot, records an ARIA snapshot, and reports an inert control as critical.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm test -- scripts/lib/fidelity-scenarios.test.mjs scripts/oem-fidelity-report.test.mjs`

- [ ] **Step 3: Implement pinned state-aware capture**

Disable animations/caret, use device scale 1, wait for fonts/images, execute each scenario from a fresh page, and store `before` and `after` state. Compare source-to-artifact and artifact-to-consumer separately; never hide consumer drift inside a single combined score.

- [ ] **Step 4: Add the Nissan proof command to documentation**

```bash
pnpm qa:fidelity -- --source-url https://www.nissan.com.au/vehicles/browse-range/ariya.html --artifact-url https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/nissan-au-ariya/production-html --consumer-url https://northern-nissan.engagr.com.au/models/ariya --viewports desktop,tablet,mobile --scenario 'accordion:[data-clone-acc-trigger="0"]' --scenario 'carousel:[data-clone-next]'
```

- [ ] **Step 5: Run full PR 4 verification**

```bash
pnpm --dir dashboard lint:fix
pnpm test
pnpm test:dashboard
pnpm typecheck
pnpm --dir dashboard build
```

- [ ] **Step 6: Commit and open draft PR 4**

```bash
git add scripts/lib/fidelity-scenarios.mjs scripts/lib/fidelity-scenarios.test.mjs scripts/oem-fidelity-report.mjs scripts/oem-fidelity-report.test.mjs docs/OEM_FIDELITY_QA.md
git commit -m "feat: verify production artifacts in dealership embeds"
git push -u origin feature/embed-fidelity-qa
gh pr create --draft --base main --head feature/embed-fidelity-qa --title "Add state-aware dealership embed fidelity QA" --body "Adds isolated embed-target configuration and three-target state-aware fidelity reporting. Verification: pnpm test; pnpm test:dashboard; pnpm typecheck; pnpm --dir dashboard build. Rollback: revert the merge commit and remove the isolated embed-target workflow_settings records if desired."
```

## Final Series Verification

- [ ] Every PR contains atomic commits and no generated build output, secrets, environment files, or unrelated user changes.
- [ ] Each PR description lists its exact data/config mutations; PRs 1–3 have none, PR 4 adds only isolated `workflow_settings` records.
- [ ] GitHub CI is green before marking a PR ready.
- [ ] Browser evidence is attached for the editor toolbar, deterministic conversion, Kimi preview/apply, five approved interactions, and Northern Nissan consumer rendering.
- [ ] Cloudflare deployment occurs only from merged `main` using the repository's existing deployment workflow.
- [ ] Rollback is documented as GitHub Revert of the individual merge commit, followed by the normal Cloudflare deployment workflow.
