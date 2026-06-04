# Page Builder Mapping Confidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface deterministic mapper confidence in Page Builder and make Structure use deterministic-first persistence with AI fallback.

**Architecture:** The dashboard owns status presentation and button wiring. The worker owns deterministic/AI routing and forwards selected model overrides only to AI calls. Mapping preview remains read-only and non-blocking.

**Tech Stack:** Vue 3, Vite/Vitest, Hono Worker, TypeScript, Cloudflare R2.

---

### Task 1: Dashboard Worker API Request Shape

**Files:**
- Modify: `dashboard/src/lib/worker-api.ts`
- Test: `dashboard/src/lib/worker-api.test.ts`

- [ ] **Step 1: Write the failing test**

Add imports:

```ts
import {
  adaptivePipeline,
  clonePage,
  createSubpage,
  fetchGeneratedPage,
  fetchGeneratedPages,
  importLegacyPage,
  mapAndStructurePage,
  saveDealerOverrides,
  updateClonePage,
  updatePageSections,
} from './worker-api'
```

Add this test:

```ts
describe('worker-api mapAndStructurePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, mapping_source: 'deterministic' }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('serializes selected model overrides for AI fallback', async () => {
    await mapAndStructurePage('ford-au', 'mustang', {
      provider: 'google_gemini',
      model: 'gemini-2.5-pro',
    })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/map-and-structure/ford-au/mustang')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      modelOverride: {
        provider: 'google_gemini',
        model: 'gemini-2.5-pro',
      },
    }))
  })

  it('omits the request body when no model override is selected', async () => {
    await mapAndStructurePage('ford-au', 'mustang')

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/lib/worker-api.test.ts
```

Expected: FAIL because `mapAndStructurePage` is not imported or does not accept/serialize `modelOverride`.

- [ ] **Step 3: Implement minimal API serialization**

Change `mapAndStructurePage`:

```ts
export async function mapAndStructurePage(oemId: string, modelSlug: string, modelOverride?: { provider: string, model: string }) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/map-and-structure/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(modelOverride
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelOverride }),
        }
      : {}),
  })
}
```

- [ ] **Step 4: Run focused dashboard API test**

Run:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/lib/worker-api.test.ts
```

Expected: PASS.

### Task 2: Dashboard Mapping Status + Structure Wiring

**Files:**
- Modify: `dashboard/src/composables/use-page-builder.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/[slug].vue`
- Test: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

- [ ] **Step 1: Write the failing source-level test**

Add one test near the existing capture diagnostics test:

```ts
it('surfaces mapping confidence and routes Structure through deterministic-first persistence', () => {
  const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')
  const composableSource = readFileSync(new URL('../../../../composables/use-page-builder.ts', import.meta.url), 'utf8')

  expect(composableSource).toContain('mapAndStructurePage')
  expect(composableSource).toContain('async function handleMapAndStructure')
  expect(composableSource).toContain('await mapAndStructurePage(oemId.value, modelSlug.value, modelOverride)')

  expect(pageSource).toContain('mapPagePreview')
  expect(pageSource).toContain('const mappingPreview = ref')
  expect(pageSource).toContain('async function loadMappingPreview()')
  expect(pageSource).toContain('const mappingStatus = computed')
  expect(pageSource).toContain('Map {{ mappingStatus.percent }}%')
  expect(pageSource).toContain('AI fallback {{ mappingStatus.percent }}%')

  const structureStart = pageSource.indexOf('async function runStructure')
  const structureEnd = pageSource.indexOf('async function runAdaptivePipeline', structureStart)
  const structureSource = pageSource.slice(structureStart, structureEnd)
  expect(structureSource).toContain('await handleMapAndStructure(modelOverride)')
  expect(structureSource).toContain('await loadMappingPreview()')
  expect(structureSource).not.toContain('await handleStructure(modelOverride)')
})
```

Extend the existing capture diagnostics refresh test to also assert mapping preview refresh after page load, clone, structure, and pipeline:

```ts
expect(mountedSource).toContain('void loadMappingPreview()')
expect(cloneSource).toContain('await loadMappingPreview()')
expect(structureSource).toContain('await loadMappingPreview()')
expect(pipelineSource).toContain('await loadMappingPreview()')
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: FAIL because no mapping preview state or deterministic-first structure handler is wired.

- [ ] **Step 3: Add composable handler**

Import and expose `mapAndStructurePage`:

```ts
import {
  adaptivePipeline as apiAdaptivePipeline,
  regenerateSection as apiRegenerateSection,
  clonePage,
  fetchGeneratedPage,
  fetchRecipes,
  mapAndStructurePage,
  saveRecipe,
  structurePage,
  updateClonePage,
  updatePageSections,
} from '@/lib/worker-api'
```

Add:

```ts
async function handleMapAndStructure(modelOverride?: { provider: string, model: string }) {
  if (!oemId.value || !modelSlug.value)
    return
  structuring.value = true
  try {
    await mapAndStructurePage(oemId.value, modelSlug.value, modelOverride)
    await refreshPage()
  }
  catch (err: any) {
    error.value = err.message || 'Structuring failed'
  }
  finally {
    structuring.value = false
  }
}
```

Return `handleMapAndStructure` from `usePageBuilder()`.

- [ ] **Step 4: Add Page Builder preview state**

Import:

```ts
import { fetchCaptureDiagnostics, mapPagePreview, type CaptureDiagnosticsRecord } from '@/lib/worker-api'
```

Destructure `handleMapAndStructure` from `usePageBuilder()`.

Add state:

```ts
type MappingPreviewSummary = {
  overall_confidence: number
  needs_ai_fallback: boolean
  sections: Array<{ type: string, confidence: number }>
}

const mappingPreview = ref<MappingPreviewSummary | null>(null)

async function loadMappingPreview() {
  mappingPreview.value = null
  if (!oemId.value || !modelSlug.value || !isCloned.value)
    return
  try {
    const res = await mapPagePreview(oemId.value, modelSlug.value)
    mappingPreview.value = res.success && res.mapping ? res.mapping : null
  }
  catch {
    mappingPreview.value = null
  }
}

const mappingStatus = computed(() => {
  const mapping = mappingPreview.value
  if (!mapping)
    return null
  const percent = Math.round((mapping.overall_confidence || 0) * 100)
  const count = Array.isArray(mapping.sections) ? mapping.sections.length : 0
  return {
    percent,
    count,
    needsAiFallback: mapping.needs_ai_fallback,
    detail: `${count} mapped section${count === 1 ? '' : 's'}; ${mapping.needs_ai_fallback ? 'AI fallback expected' : 'deterministic structure available'}`,
  }
})
```

Call `void loadMappingPreview()` on page load and reset watchers. After `handleClone()`, `handleMapAndStructure()`, and `handleAdaptivePipeline()`, call `await loadMappingPreview()`.

Change `runStructure()`:

```ts
await handleMapAndStructure(modelOverride)
await loadMappingPreview()
```

- [ ] **Step 5: Render mapping badge**

Near the capture badge, add:

```vue
<UiBadge
  v-if="mappingStatus"
  variant="default"
  class="text-[10px] shrink-0 hidden md:inline-flex"
  :class="mappingStatus.needsAiFallback ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'"
  :title="mappingStatus.detail"
>
  <template v-if="mappingStatus.needsAiFallback">
    AI fallback {{ mappingStatus.percent }}%
  </template>
  <template v-else>
    Map {{ mappingStatus.percent }}%
  </template>
</UiBadge>
```

- [ ] **Step 6: Run focused dashboard page test**

Run:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: PASS.

### Task 3: Worker Model Override Propagation

**Files:**
- Modify: `src/design/page-structurer.ts`
- Modify: `src/routes/oem-agent.ts`
- Test: `src/design/page-structurer.test.ts`

- [ ] **Step 1: Write failing worker tests**

In `PageStructurer page mode integration`, add:

```ts
it('passes selected model overrides to AI structuring', async () => {
  const bucket = new MemoryR2Bucket({ [LATEST_KEY]: makeBasePage() })
  const ai = makeAiRouter({
    sections: [{
      id: 'section-hero-0',
      type: 'hero',
      order: 0,
      heading: 'Override Hero',
      sub_heading: '',
      cta_text: '',
      cta_url: '',
      desktop_image_url: 'https://www.ford.com.au/hero.jpg',
      mobile_image_url: 'https://www.ford.com.au/hero.jpg',
      background_image_url: null,
      video_url: null,
    }],
  })
  const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

  await structurer.structurePage('ford-au', 'mustang', {
    provider: 'google_gemini',
    model: 'gemini-2.5-pro',
  })

  expect(ai.calls[0].overrideRoute).toEqual({
    provider: 'google_gemini',
    model: 'gemini-2.5-pro',
  })
})
```

In `PageStructurer.mapAndPersist`, extend the low-confidence fallback test:

```ts
const result = await structurer.mapAndPersist('ford-au', 'mustang', {
  provider: 'moonshot',
  model: 'kimi-k2.5',
})

expect(ai.calls[0].overrideRoute).toEqual({
  provider: 'moonshot',
  model: 'kimi-k2.5',
})
```

Add to the high-confidence deterministic test:

```ts
await structurer.mapAndPersist('ford-au', 'mustang', {
  provider: 'moonshot',
  model: 'kimi-k2.5',
})
expect(ai.calls.length).toBe(0)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/design/page-structurer.test.ts
```

Expected: FAIL because `structurePage()` and `mapAndPersist()` do not accept or forward overrides.

- [ ] **Step 3: Implement worker override propagation**

Import `AiProvider` from `src/oem/types` with the existing type imports and add a local type:

```ts
type ModelOverride = { provider: AiProvider; model: string };
```

Change signatures:

```ts
async structurePage(oemId: OemId, modelSlug: string, modelOverride?: ModelOverride): Promise<PageStructuringResult>
async mapAndPersist(oemId: OemId, modelSlug: string, modelOverride?: ModelOverride): Promise<PageMapAndPersistResult>
```

In the `AiRouter.route()` call inside `structurePage()`, include the override only when one was provided:

```ts
const response = await this.aiRouter.route({
  taskType: 'page_structuring',
  prompt,
  oemId,
  requireJson: true,
  ...(modelOverride ? { overrideRoute: modelOverride } : {}),
});
```

In `mapAndPersist()` fallback:

```ts
const aiResult = await this.structurePage(oemId, modelSlug, modelOverride);
```

In `src/routes/oem-agent.ts`, pass parsed bodies through:

```ts
const result = await structurer.structurePage(oemId, modelSlug, modelOverride);
```

For `/admin/map-and-structure`, parse optional JSON body and call:

```ts
let modelOverride: { provider?: string; model?: string } | undefined;
try {
  const body = await c.req.json();
  modelOverride = body?.modelOverride;
} catch { /* no body is fine */ }

if (modelOverride) await aiRouter.loadModelOverrides();
const result = await structurer.mapAndPersist(oemId, modelSlug, modelOverride as ModelOverride);
```

- [ ] **Step 4: Run focused worker test**

Run:

```bash
npx vitest run src/design/page-structurer.test.ts
```

Expected: PASS.

### Task 4: Verification, Commit, Push, Deploy

**Files:**
- Commit all changed files after verification.

- [ ] **Step 1: Run focused tests**

Run:

```bash
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production dashboard/src/lib/worker-api.test.ts dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
npx vitest run src/design/page-structurer.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run broader verification**

Run:

```bash
npx vitest run
VITEST=true CI=1 npx vitest run --config dashboard/vite.config.ts --mode production
pnpm run typecheck
pnpm --dir dashboard exec vue-tsc -b
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Build and commit**

Run:

```bash
CHOKIDAR_USEPOLLING=true pnpm --dir dashboard build
git status --short
git add dashboard/src/lib/worker-api.ts dashboard/src/lib/worker-api.test.ts dashboard/src/composables/use-page-builder.ts dashboard/src/pages/dashboard/page-builder/[slug].vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts src/design/page-structurer.ts src/design/page-structurer.test.ts src/routes/oem-agent.ts docs/superpowers/plans/2026-06-05-page-builder-mapping-confidence.md
git commit -m "feat(page-builder): surface mapping confidence"
```

Expected: dashboard build exits 0 and commit succeeds.

- [ ] **Step 4: Push and deploy**

Run:

```bash
git push
pnpm run deploy
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
curl -I https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/health
curl -I https://oem-dashboard.pages.dev
```

Expected: push succeeds, worker deploy succeeds, Pages deploy succeeds, both HTTP checks return 200-class responses.

## Self-Review

- Spec coverage: mapping preview badge, deterministic-first Structure, model override propagation, tests, verification, push, and deploy are all represented.
- Placeholder scan: no `TBD`, `TODO`, or "implement later" instructions remain.
- Type consistency: dashboard uses `{ provider: string, model: string }`; worker accepts the same shape and passes it as `overrideRoute`.
