# Page Builder Architecture Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Model Pages and Page Builder workflows coherent by fixing recipe loading, reducing duplicated page-generation actions, and centralizing section rendering metadata.

**Architecture:** Start with contract fixes that restore existing functionality, then introduce small pure helpers for workflow state and recipe normalization, then replace duplicated renderer maps with one dashboard section registry. Keep the first remediation pass narrow: do not split the 2,182-line `SectionProperties.vue` until the registry is in place.

**Tech Stack:** Cloudflare Worker with Hono, Vitest, Vue 3 dashboard, Vite, TypeScript, R2-backed page definitions.

---

## Current Status

First-pass remediation is complete on branch `page-builder-architecture-remediation`.

Completed implementation:
- Normalized the Worker `/recipes/:oemId` contract to return `{ recipes, oem_id }` and removed the duplicate public route.
- Added dashboard recipe-response compatibility so deployments can tolerate old and new Worker response shapes.
- Introduced pure page workflow state/actions for missing, cloned, structured, and custom pages.
- Replaced split canvas/display renderer maps with a shared section registry and explicit display overrides.
- Added extractable-section guardrails so AI structuring and manual editor section types no longer look like one shared catalog.
- Fixed dashboard build/type issues discovered while verifying the page-builder changes.
- Split large Vite vendor chunks so the dashboard build no longer emits the >500 kB chunk warning.
- Kept generated dashboard type output under `dashboard/src/types`.
- Added page-builder storage normalization so resolved Worker media URLs are saved as portable `/media/...` paths.
- Removed the dead `modelOverride` contract from the non-AI Clone workflow.
- Centralized section split-field metadata so split affordances and split actions use the same source of truth.
- Centralized section-to-recipe pattern metadata used by custom recipe saving.
- Centralized page-builder section icon metadata used by section list rows and template cards.
- Centralized saved-recipe default extraction, including content-field exclusions and card composition inference.
- Centralized section media traversal so editor URL resolution and template-card image counting cover newer section shapes.
- Centralized Add Section recipe pattern groups and icons.
- Centralized Section Capture import-as options so labels derive from shared section metadata.
- Centralized page-builder AI model options and grouped model selection with the AI-backed Structure/Pipeline actions across desktop and compact menus.
- Centralized conversion-generated grid column selection so list-to-card conversions only emit renderer-supported column counts.
- Added a root `test:dashboard` script for the dashboard Vitest suite using the dashboard Vite config.
- Centralized tab item defaults across blank sections, tab templates, conversions into tabs, and the editor Add tab action.
- Centralized image-showcase image item defaults across blank sections, showcase templates, conversions into showcases, and the editor Add image action.
- Centralized feature-card item defaults across blank sections, feature templates, conversions into feature cards, and the editor Add card action.

Verification run after the latest remediation:
- `pnpm run test:dashboard`
- `pnpm run typecheck`
- `CI=1 pnpm --dir dashboard build`

Latest implementation commits:
- `f67d66c refactor(dashboard): share feature card item defaults`
- `9cfaf86 refactor(dashboard): share image showcase item defaults`
- `a5606c9 refactor(dashboard): share tab item defaults`
- `64fa83c refactor(dashboard): centralize conversion grid columns`
- `e9c41c1 refactor(dashboard): associate model selector with AI actions`
- `ddcd398 refactor(dashboard): share section capture options`
- `94c5167 refactor(dashboard): share recipe pattern metadata`
- `6c27efc refactor(dashboard): share section media traversal`
- `95ac0cf refactor(dashboard): centralize recipe default extraction`
- `6ba1cd3 refactor(dashboard): share page builder section icons`
- `1eb0b4b refactor(dashboard): centralize section recipe metadata`
- `4272f89 refactor(dashboard): centralize section split metadata`

Remaining phase-two candidates:
- Split `SectionProperties.vue` into per-section editor modules.
- Extract shared nested item default builders for remaining non-tab/non-showcase/non-feature-card item types.
- Add Playwright coverage for missing-page, structured-page, clone, structure, and adaptive-pipeline flows.

The original step-by-step plan below is retained for audit history. Some checkboxes may remain unchecked even though the current status above reflects the committed implementation.

---

## Scope

This plan handles:
- Recipes not appearing in the Page Builder Add Section picker.
- Conflicting “Generate Page”, “Clone”, and “Pipeline” actions for missing pages.
- Divergent section renderer maps between editor preview and page rendering.
- Immediate guardrails against duplicated route registration and section registry drift.

This plan does not handle:
- A full rewrite of `SectionProperties.vue`.
- A new database schema.
- A visual redesign of the editor.
- Rebuilding the AI extraction prompt to support every manual section type.

---

## File Structure

- Create `src/design/recipe-response.ts`: pure helpers for merging brand and default recipes into the public `{ recipes }` shape.
- Create `src/design/recipe-response.test.ts`: Vitest coverage for recipe merging and route shape guardrails.
- Modify `src/routes/oem-agent.ts`: delete the earlier duplicate `/recipes/:oemId` route and use the normalized helper in the remaining route.
- Create `dashboard/src/lib/recipes.ts`: dashboard-side normalization so the client is resilient during deployments.
- Create `dashboard/src/lib/recipes.test.ts`: pure Vitest coverage for dashboard recipe normalization.
- Modify `dashboard/src/lib/worker-api.ts`: import the recipe type/helper and make `fetchRecipes()` accept either old or new API response shape.
- Create `dashboard/src/pages/dashboard/page-builder/page-workflow.ts`: pure workflow-state helper for missing, empty, cloned, structured, and custom pages.
- Create `dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts`: Vitest coverage for state/action decisions.
- Modify `dashboard/src/pages/dashboard/page-builder/[slug].vue`: use workflow state to expose one primary next action and hide editor-only actions when the page is missing.
- Create `dashboard/src/pages/dashboard/components/page-builder/section-registry.ts`: one component registry and resolver for dashboard section rendering.
- Create `dashboard/src/pages/dashboard/components/page-builder/section-registry.test.ts`: guard that every known section type has a renderer.
- Modify `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`: use the shared registry instead of a local component map.
- Modify `dashboard/src/pages/dashboard/components/sections/SectionRenderer.vue`: use the shared registry instead of a separate component map.

---

### Task 1: Normalize the Worker Recipes Contract

**Files:**
- Create: `src/design/recipe-response.ts`
- Create: `src/design/recipe-response.test.ts`
- Modify: `src/routes/oem-agent.ts:2225-2242`
- Modify: `src/routes/oem-agent.ts:3206-3237`

- [ ] **Step 1: Write the failing tests**

Create `src/design/recipe-response.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeRecipeRows } from './recipe-response';

describe('normalizeRecipeRows', () => {
  it('returns brand recipes first and marks their source', () => {
    const recipes = normalizeRecipeRows({
      brandRecipes: [{
        id: 'brand-1',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: { heading_size: '4xl' },
      }],
      defaultRecipes: [{
        id: 'default-1',
        pattern: 'hero',
        variant: 'video',
        label: 'Video Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
    });

    expect(recipes).toEqual([
      {
        id: 'brand-1',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: { heading_size: '4xl' },
        source: 'brand',
      },
      {
        id: 'default-1',
        oem_id: null,
        pattern: 'hero',
        variant: 'video',
        label: 'Video Hero',
        resolves_to: 'hero',
        defaults_json: {},
        source: 'default',
      },
    ]);
  });

  it('lets brand recipes override defaults with the same pattern and variant', () => {
    const recipes = normalizeRecipeRows({
      brandRecipes: [{
        id: 'brand-hero',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
      defaultRecipes: [{
        id: 'default-hero',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Generic Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
    });

    expect(recipes).toHaveLength(1);
    expect(recipes[0].id).toBe('brand-hero');
    expect(recipes[0].source).toBe('brand');
  });
});

describe('oem-agent route registration', () => {
  it('registers the public recipe route exactly once', () => {
    const source = readFileSync(new URL('../routes/oem-agent.ts', import.meta.url), 'utf8');
    const matches = source.match(/app\.get\('\/recipes\/:oemId'/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm test src/design/recipe-response.test.ts
```

Expected: fails because `src/design/recipe-response.ts` does not exist and because `/recipes/:oemId` is currently registered twice.

- [ ] **Step 3: Add the recipe normalization helper**

Create `src/design/recipe-response.ts`:

```ts
export interface BrandRecipeRow {
  id: string;
  oem_id: string;
  pattern: string;
  variant: string;
  label: string;
  resolves_to: string;
  defaults_json: Record<string, unknown> | null;
}

export interface DefaultRecipeRow {
  id: string;
  pattern: string;
  variant: string;
  label: string;
  resolves_to: string;
  defaults_json: Record<string, unknown> | null;
}

export interface PublicRecipe {
  id: string;
  oem_id: string | null;
  pattern: string;
  variant: string;
  label: string;
  resolves_to: string;
  defaults_json: Record<string, unknown>;
  source: 'brand' | 'default';
}

export function normalizeRecipeRows(input: {
  brandRecipes: BrandRecipeRow[] | null | undefined;
  defaultRecipes: DefaultRecipeRow[] | null | undefined;
}): PublicRecipe[] {
  const brandRecipes = input.brandRecipes ?? [];
  const defaultRecipes = input.defaultRecipes ?? [];
  const brandKeys = new Set(brandRecipes.map(r => `${r.pattern}:${r.variant}`));

  return [
    ...brandRecipes.map(r => ({
      id: r.id,
      oem_id: r.oem_id,
      pattern: r.pattern,
      variant: r.variant,
      label: r.label,
      resolves_to: r.resolves_to,
      defaults_json: r.defaults_json ?? {},
      source: 'brand' as const,
    })),
    ...defaultRecipes
      .filter(r => !brandKeys.has(`${r.pattern}:${r.variant}`))
      .map(r => ({
        id: r.id,
        oem_id: null,
        pattern: r.pattern,
        variant: r.variant,
        label: r.label,
        resolves_to: r.resolves_to,
        defaults_json: r.defaults_json ?? {},
        source: 'default' as const,
      })),
  ];
}
```

- [ ] **Step 4: Delete the duplicate route and normalize the remaining route**

In `src/routes/oem-agent.ts`, add the import near the other design imports:

```ts
import { normalizeRecipeRows } from '../design/recipe-response';
```

Delete the earlier `/recipes/:oemId` block at `src/routes/oem-agent.ts:2225-2242`.

Replace the merge block in the remaining `/recipes/:oemId` route with:

```ts
  const recipes = normalizeRecipeRows({
    brandRecipes: brandRecipes ?? [],
    defaultRecipes: defaultRecipes ?? [],
  });

  return c.json({ recipes, oem_id: oemId });
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
pnpm test src/design/recipe-response.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/design/recipe-response.ts src/design/recipe-response.test.ts src/routes/oem-agent.ts
git commit -m "fix: normalize public recipe endpoint"
```

---

### Task 2: Make Dashboard Recipe Loading Backward Compatible

**Files:**
- Create: `dashboard/src/lib/recipes.ts`
- Create: `dashboard/src/lib/recipes.test.ts`
- Modify: `dashboard/src/lib/worker-api.ts:105-120`

- [ ] **Step 1: Write the failing dashboard helper tests**

Create `dashboard/src/lib/recipes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeRecipesResponse } from './recipes';

describe('normalizeRecipesResponse', () => {
  it('returns the new recipes shape unchanged', () => {
    expect(normalizeRecipesResponse({
      recipes: [{
        id: 'r1',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: {},
        source: 'brand',
      }],
    })).toEqual([{
      id: 'r1',
      oem_id: 'ford-au',
      pattern: 'hero',
      variant: 'image-overlay',
      label: 'Ford Hero',
      resolves_to: 'hero',
      defaults_json: {},
      source: 'brand',
    }]);
  });

  it('converts the old brand_recipes/default_recipes shape', () => {
    const recipes = normalizeRecipesResponse({
      brand_recipes: [{
        id: 'b1',
        oem_id: 'ford-au',
        pattern: 'action-bar',
        variant: 'quick-links',
        label: 'Quick Links',
        resolves_to: 'sticky-bar',
        defaults_json: { background_color: '#001a33' },
      }],
      default_recipes: [{
        id: 'd1',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
    });

    expect(recipes.map(r => r.source)).toEqual(['brand', 'default']);
    expect(recipes[0].oem_id).toBe('ford-au');
    expect(recipes[1].oem_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm test dashboard/src/lib/recipes.test.ts
```

Expected: fails because `dashboard/src/lib/recipes.ts` does not exist.

- [ ] **Step 3: Add the dashboard recipe normalizer**

Create `dashboard/src/lib/recipes.ts`:

```ts
export interface Recipe {
  id: string
  oem_id: string | null
  pattern: string
  variant: string
  label: string
  resolves_to: string
  defaults_json: Record<string, any>
  source: 'brand' | 'default'
}

export function normalizeRecipesResponse(result: any): Recipe[] {
  if (Array.isArray(result?.recipes)) {
    return result.recipes.map((recipe: any) => ({
      ...recipe,
      defaults_json: recipe.defaults_json ?? {},
    })) as Recipe[]
  }

  const brandRecipes = Array.isArray(result?.brand_recipes) ? result.brand_recipes : []
  const defaultRecipes = Array.isArray(result?.default_recipes) ? result.default_recipes : []
  const brandKeys = new Set(brandRecipes.map((r: any) => `${r.pattern}:${r.variant}`))

  return [
    ...brandRecipes.map((r: any) => ({
      id: r.id,
      oem_id: r.oem_id,
      pattern: r.pattern,
      variant: r.variant,
      label: r.label,
      resolves_to: r.resolves_to,
      defaults_json: r.defaults_json ?? {},
      source: 'brand' as const,
    })),
    ...defaultRecipes
      .filter((r: any) => !brandKeys.has(`${r.pattern}:${r.variant}`))
      .map((r: any) => ({
        id: r.id,
        oem_id: null,
        pattern: r.pattern,
        variant: r.variant,
        label: r.label,
        resolves_to: r.resolves_to,
        defaults_json: r.defaults_json ?? {},
        source: 'default' as const,
      })),
  ]
}
```

- [ ] **Step 4: Update `worker-api.ts` to use the helper**

In `dashboard/src/lib/worker-api.ts`, replace the local `Recipe` interface with:

```ts
import type { Recipe } from '@/lib/recipes'
import { normalizeRecipesResponse } from '@/lib/recipes'
```

Keep the import near the existing Supabase import.

Replace `fetchRecipes()` with:

```ts
export async function fetchRecipes(oemId: string): Promise<Recipe[]> {
  const result = await workerFetch(`/api/v1/oem-agent/recipes/${oemId}`)
  return normalizeRecipesResponse(result)
}
```

- [ ] **Step 5: Run focused tests and dashboard build**

Run:

```bash
pnpm test dashboard/src/lib/recipes.test.ts
pnpm --dir dashboard build
```

Expected: recipe tests pass and dashboard build exits 0.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/recipes.ts dashboard/src/lib/recipes.test.ts dashboard/src/lib/worker-api.ts
git commit -m "fix(dashboard): normalize recipe API responses"
```

---

### Task 3: Introduce a Page Builder Workflow State Helper

**Files:**
- Create: `dashboard/src/pages/dashboard/page-builder/page-workflow.ts`
- Create: `dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/[slug].vue`

- [ ] **Step 1: Write workflow helper tests**

Create `dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getPageWorkflowState, getPrimaryWorkflowAction } from './page-workflow';

describe('getPageWorkflowState', () => {
  it('returns missing when the API error is a 404', () => {
    expect(getPageWorkflowState({ page: null, error: 'Worker API error 404: Page not found' })).toBe('missing');
  });

  it('returns structured when sections exist', () => {
    expect(getPageWorkflowState({
      page: { content: { sections: [{ id: 's1', type: 'hero' }] } },
      error: null,
    })).toBe('structured');
  });

  it('returns cloned when rendered HTML exists but sections do not', () => {
    expect(getPageWorkflowState({
      page: { content: { rendered: '<link rel="stylesheet" href="/x.css">', sections: [] } },
      error: null,
    })).toBe('cloned');
  });

  it('returns custom for custom pages even with no sections', () => {
    expect(getPageWorkflowState({
      page: { page_type: 'custom', content: { rendered: '', sections: [] } },
      error: null,
    })).toBe('custom');
  });
});

describe('getPrimaryWorkflowAction', () => {
  it('uses pipeline as the single missing-page action', () => {
    expect(getPrimaryWorkflowAction('missing')).toEqual({
      key: 'pipeline',
      label: 'Run Pipeline',
    });
  });

  it('uses structure for cloned pages', () => {
    expect(getPrimaryWorkflowAction('cloned')).toEqual({
      key: 'structure',
      label: 'Structure Page',
    });
  });

  it('uses save for structured dirty pages', () => {
    expect(getPrimaryWorkflowAction('structured', { isDirty: true })).toEqual({
      key: 'save',
      label: 'Save',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm test dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts
```

Expected: fails because `page-workflow.ts` does not exist.

- [ ] **Step 3: Add the workflow helper**

Create `dashboard/src/pages/dashboard/page-builder/page-workflow.ts`:

```ts
export type PageWorkflowState = 'missing' | 'empty' | 'cloned' | 'structured' | 'custom'

export type PrimaryWorkflowActionKey = 'pipeline' | 'clone' | 'structure' | 'save' | 'edit'

export interface PrimaryWorkflowAction {
  key: PrimaryWorkflowActionKey
  label: string
}

export function getPageWorkflowState(input: {
  page: any
  error: string | null
}): PageWorkflowState {
  if (input.error?.includes('404'))
    return 'missing'

  const page = input.page
  if (page?.page_type === 'custom')
    return 'custom'

  const sections = page?.content?.sections
  if (Array.isArray(sections) && sections.length > 0)
    return 'structured'

  const rendered = page?.content?.rendered ?? ''
  if (typeof rendered === 'string' && (rendered.includes('tailwindcss.com') || rendered.includes('<link rel="stylesheet"')))
    return 'cloned'

  return 'empty'
}

export function getPrimaryWorkflowAction(
  state: PageWorkflowState,
  options: { isDirty?: boolean } = {},
): PrimaryWorkflowAction {
  if (state === 'missing')
    return { key: 'pipeline', label: 'Run Pipeline' }
  if (state === 'empty')
    return { key: 'pipeline', label: 'Run Pipeline' }
  if (state === 'cloned')
    return { key: 'structure', label: 'Structure Page' }
  if (state === 'structured' && options.isDirty)
    return { key: 'save', label: 'Save' }
  return { key: 'edit', label: 'Edit Sections' }
}
```

- [ ] **Step 4: Use workflow state in `[slug].vue`**

In `dashboard/src/pages/dashboard/page-builder/[slug].vue`, import the helper:

```ts
import { getPageWorkflowState, getPrimaryWorkflowAction } from './page-workflow'
```

Add these computed values after `needsSourceUrl`:

```ts
const pageWorkflowState = computed(() => getPageWorkflowState({
  page: page.value,
  error: error.value,
}))

const primaryWorkflowAction = computed(() => getPrimaryWorkflowAction(pageWorkflowState.value, {
  isDirty: isDirty.value,
}))

const canShowEditorActions = computed(() => pageWorkflowState.value !== 'missing')
```

Replace toolbar gates that currently use only `!isCustomPage` or `isStructured || sections.length > 0` so editor-only actions require `canShowEditorActions`. The missing state must show only:

```vue
<UiButton
  v-if="pageWorkflowState === 'missing'"
  size="sm"
  :disabled="pipelining"
  @click="handleAdaptivePipeline(selectedModelOverride)"
>
  <Zap v-if="!pipelining" class="size-3.5 mr-1 text-violet-500" />
  <Loader2 v-else class="size-3.5 mr-1 animate-spin" />
  {{ pipelining ? 'Running...' : primaryWorkflowAction.label }}
</UiButton>
```

Change the 404 empty-state button at the bottom of the file to call `handleAdaptivePipeline(selectedModelOverride)` and label it with `primaryWorkflowAction.label`. Remove the `generatePage` import and the `handleGeneratePage()` function after this replacement.

- [ ] **Step 5: Run focused tests and dashboard build**

Run:

```bash
pnpm test dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts
pnpm --dir dashboard build
```

Expected: workflow tests pass and dashboard build exits 0.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/pages/dashboard/page-builder/page-workflow.ts dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts 'dashboard/src/pages/dashboard/page-builder/[slug].vue'
git commit -m "fix(dashboard): consolidate page builder workflow actions"
```

---

### Task 4: Centralize Dashboard Section Rendering

**Files:**
- Create: `dashboard/src/pages/dashboard/components/page-builder/section-registry.ts`
- Create: `dashboard/src/pages/dashboard/components/page-builder/section-registry.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue:198-238`
- Modify: `dashboard/src/pages/dashboard/components/sections/SectionRenderer.vue:16-55`

- [ ] **Step 1: Write registry coverage tests**

Create `dashboard/src/pages/dashboard/components/page-builder/section-registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SECTION_TYPE_INFO } from './section-templates';
import { registeredSectionTypes, resolveSectionComponent } from './section-registry';

describe('section-registry', () => {
  it('has one renderer for every known section type', () => {
    expect(new Set(registeredSectionTypes)).toEqual(new Set(Object.keys(SECTION_TYPE_INFO)));
  });

  it('routes composition-driven sections to card-grid', () => {
    const component = resolveSectionComponent({
      id: 's1',
      type: 'feature-cards',
      card_composition: ['image', 'title'],
    });

    expect(component).toBeTruthy();
  });

  it('returns undefined for unknown section types', () => {
    expect(resolveSectionComponent({ id: 's1', type: 'unknown' })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm test dashboard/src/pages/dashboard/components/page-builder/section-registry.test.ts
```

Expected: fails because `section-registry.ts` does not exist.

- [ ] **Step 3: Add the shared section registry**

Create `dashboard/src/pages/dashboard/components/page-builder/section-registry.ts`:

```ts
import { defineAsyncComponent } from 'vue'

export const sectionComponentMap = {
  'hero': defineAsyncComponent(() => import('../sections/SectionHero.vue')),
  'heading': defineAsyncComponent(() => import('../sections/SectionHeading.vue')),
  'intro': defineAsyncComponent(() => import('../sections/SectionIntro.vue')),
  'tabs': defineAsyncComponent(() => import('../sections/SectionTabs.vue')),
  'color-picker': defineAsyncComponent(() => import('../sections/SectionColorPicker.vue')),
  'specs-grid': defineAsyncComponent(() => import('../sections/SectionSpecs.vue')),
  'gallery': defineAsyncComponent(() => import('../sections/SectionGallery.vue')),
  'feature-cards': defineAsyncComponent(() => import('../sections/SectionFeatureCards.vue')),
  'video': defineAsyncComponent(() => import('../sections/SectionVideo.vue')),
  'cta-banner': defineAsyncComponent(() => import('../sections/SectionCta.vue')),
  'content-block': defineAsyncComponent(() => import('../sections/SectionContentBlock.vue')),
  'accordion': defineAsyncComponent(() => import('../sections/SectionAccordion.vue')),
  'enquiry-form': defineAsyncComponent(() => import('../sections/SectionEnquiryForm.vue')),
  'map': defineAsyncComponent(() => import('../sections/SectionMap.vue')),
  'alert': defineAsyncComponent(() => import('../sections/SectionAlert.vue')),
  'divider': defineAsyncComponent(() => import('../sections/SectionDivider.vue')),
  'testimonial': defineAsyncComponent(() => import('../sections/SectionTestimonial.vue')),
  'comparison-table': defineAsyncComponent(() => import('../sections/SectionComparisonTable.vue')),
  'stats': defineAsyncComponent(() => import('../sections/SectionStats.vue')),
  'logo-strip': defineAsyncComponent(() => import('../sections/SectionLogoStrip.vue')),
  'embed': defineAsyncComponent(() => import('../sections/SectionEmbed.vue')),
  'pricing-table': defineAsyncComponent(() => import('../sections/SectionPricingTable.vue')),
  'sticky-bar': defineAsyncComponent(() => import('../sections/SectionStickyBar.vue')),
  'countdown': defineAsyncComponent(() => import('../sections/SectionHero.vue')),
  'finance-calculator': defineAsyncComponent(() => import('../sections/SectionFinanceCalculator.vue')),
  'image': defineAsyncComponent(() => import('../sections/SectionImageBlock.vue')),
  'image-showcase': defineAsyncComponent(() => import('../sections/SectionImageShowcase.vue')),
  'card-grid': defineAsyncComponent(() => import('../sections/SectionCardGrid.vue')),
  'split-content': defineAsyncComponent(() => import('../sections/SectionSplitContent.vue')),
  'media': defineAsyncComponent(() => import('../sections/SectionMedia.vue')),
  'pinned-scroll': defineAsyncComponent(() => import('../sections/SectionPinnedScroll.vue')),
} as const

export const registeredSectionTypes = Object.keys(sectionComponentMap)

export function resolveSectionComponent(section: any) {
  if (Array.isArray(section?.card_composition) && section.card_composition.length > 0)
    return sectionComponentMap['card-grid']

  return sectionComponentMap[section?.type as keyof typeof sectionComponentMap]
}
```

- [ ] **Step 4: Replace the local map in `PageBuilderCanvas.vue`**

In `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`:

Replace:

```ts
import { defineAsyncComponent, ref } from 'vue'
```

with:

```ts
import { ref } from 'vue'
```

Add:

```ts
import { resolveSectionComponent } from './section-registry'
```

Delete the local `componentMap` and `resolveComponent()` block.

Replace both `resolveComponent(section)` template calls with `resolveSectionComponent(section)`.

- [ ] **Step 5: Replace the local map in `SectionRenderer.vue`**

In `dashboard/src/pages/dashboard/components/sections/SectionRenderer.vue`:

Delete:

```ts
import { defineAsyncComponent } from 'vue'
```

Add:

```ts
import { resolveSectionComponent } from '../page-builder/section-registry'
```

Delete the local `resolveComponent()` function and `componentMap`.

Replace both `resolveComponent(section)` template calls with `resolveSectionComponent(section)`.

- [ ] **Step 6: Run focused tests and dashboard build**

Run:

```bash
pnpm test dashboard/src/pages/dashboard/components/page-builder/section-registry.test.ts
pnpm --dir dashboard build
```

Expected: registry tests pass and dashboard build exits 0.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/section-registry.ts dashboard/src/pages/dashboard/components/page-builder/section-registry.test.ts dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue dashboard/src/pages/dashboard/components/sections/SectionRenderer.vue
git commit -m "refactor(dashboard): centralize section renderer registry"
```

---

### Task 5: Add Section-Type Drift Guardrails

**Files:**
- Modify: `src/design/page-structurer.ts:24-27`
- Create: `src/design/page-section-types.test.ts`

- [ ] **Step 1: Write a guardrail test for extractor-supported types**

Create `src/design/page-section-types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('page section type guardrails', () => {
  it('documents that page structuring intentionally extracts the core ten types', () => {
    const source = readFileSync(new URL('./page-structurer.ts', import.meta.url), 'utf8');
    expect(source).toContain('EXTRACTABLE_SECTION_TYPES');
    expect(source).toContain('hero');
    expect(source).toContain('content-block');
  });

  it('does not silently call the extractor list the full supported section list', () => {
    const source = readFileSync(new URL('./page-structurer.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('const VALID_SECTION_TYPES');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm test src/design/page-section-types.test.ts
```

Expected: fails because `page-structurer.ts` still uses `VALID_SECTION_TYPES`.

- [ ] **Step 3: Rename the extraction list to make the boundary explicit**

In `src/design/page-structurer.ts`, replace:

```ts
const VALID_SECTION_TYPES: PageSectionType[] = [
  'hero', 'intro', 'tabs', 'color-picker', 'specs-grid',
  'gallery', 'feature-cards', 'video', 'cta-banner', 'content-block',
];
```

with:

```ts
const EXTRACTABLE_SECTION_TYPES: PageSectionType[] = [
  'hero', 'intro', 'tabs', 'color-picker', 'specs-grid',
  'gallery', 'feature-cards', 'video', 'cta-banner', 'content-block',
];
```

Replace:

```ts
if (!VALID_SECTION_TYPES.includes(s.type)) continue;
```

with:

```ts
if (!EXTRACTABLE_SECTION_TYPES.includes(s.type)) continue;
```

- [ ] **Step 4: Run the guardrail test**

Run:

```bash
pnpm test src/design/page-section-types.test.ts
```

Expected: guardrail tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/design/page-section-types.test.ts src/design/page-structurer.ts
git commit -m "chore: clarify extractable page section types"
```

---

### Task 6: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run Worker tests touched by this plan**

Run:

```bash
pnpm test src/design/recipe-response.test.ts src/design/page-section-types.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 2: Run dashboard helper tests touched by this plan**

Run:

```bash
pnpm test dashboard/src/lib/recipes.test.ts dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts dashboard/src/pages/dashboard/components/page-builder/section-registry.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 3: Run TypeScript checks**

Run:

```bash
pnpm run typecheck
pnpm --dir dashboard build
```

Expected: Worker typecheck exits 0 and dashboard build exits 0.

- [ ] **Step 4: Manual browser verification**

Open:

```text
https://oem-dashboard.pages.dev/dashboard/page-builder/ford-au-mustang
```

Expected:
- The missing page view shows one primary generation action: `Run Pipeline`.
- `Clone`, `JSON`, and editor import actions are not shown before a page exists.

Open any structured Ford page such as:

```text
https://oem-dashboard.pages.dev/dashboard/page-builder/ford-au-f-150
```

Expected:
- Open `Add Section`.
- Brand and Generic recipe groups are visible.
- Adding a recipe creates a section with populated defaults.
- Canvas preview and final `SectionRenderer` rendering use the same component registry.

- [ ] **Step 5: Check for uncommitted verification-only changes**

Run:

```bash
git status --short
```

Expected: no uncommitted changes other than work intentionally left for the next plan. If verification required minor fixes, create a follow-up commit with the exact changed file paths shown by `git status --short`.

---

## Follow-Up Plan Candidates

After this remediation is stable, create separate plans for:

1. Splitting `SectionProperties.vue` into per-section editor modules.
2. Moving section defaults, labels, icons, split rules, converter rules, and recipe mappings into one dashboard registry.
3. Reworking the AI extraction prompt around an explicit `extractable` catalog instead of hard-coded prose.
4. Adding Playwright coverage for the full missing-page and structured-page flows.

---

## Self-Review

- Spec coverage: The plan addresses the observed broken recipe contract, duplicate route registration, competing generation paths, renderer-map drift, and the misleading section type boundary.
- Placeholder scan: No incomplete marker text or unspecified implementation steps remain.
- Type consistency: Recipe source values are consistently `'brand' | 'default'`; workflow states are consistently `'missing' | 'empty' | 'cloned' | 'structured' | 'custom'`; registry resolver name is consistently `resolveSectionComponent`.
