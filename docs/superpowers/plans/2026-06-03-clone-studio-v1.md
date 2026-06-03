# Clone Studio v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clone-first page-builder mode that lets users edit the pixel-cloned OEM DOM without dropping into lower-fidelity Vue section rendering.

**Architecture:** Add a backward-compatible mode contract around existing page JSON, then make Clone Studio a first-class editor mode beside the existing Section Builder. Backend routes preserve clone, sections, generated, raw HTML, and template representations independently; frontend mode helpers normalize legacy pages and route the canvas/sidebar/editor to the selected micro-app.

**Tech Stack:** Cloudflare Worker, Hono, R2, TypeScript, Vue 3, Vite, Vitest, iframe `srcdoc`, `postMessage`, existing Alpine/Tailwind generation for future region replacement.

---

## File Structure

### Backend

- Create `src/design/page-modes.ts`
  - Owns the canonical page mode helpers for Worker-side page JSON mutation.
  - Keeps legacy `content.rendered` and `content.sections` populated for compatibility.
- Create `src/design/page-modes.test.ts`
  - Unit tests for mode normalization and mutation helpers.
- Modify `src/design/page-capturer.ts`
  - Store captures into `content.modes.clone` without deleting existing section mode.
  - Add clone metadata: source URL, captured viewport, stylesheet URLs, asset map, warnings, and region index.
- Modify `src/design/page-structurer.ts`
  - Write structured sections into `content.modes.sections` without changing active clone mode.
- Modify `src/routes/oem-agent.ts`
  - Add `PUT /admin/update-clone/:oemId/:modelSlug`.
  - Accept `includeModes=true` on page fetches.
  - Use mode helpers in clone/structure/update endpoints.

### Dashboard

- Create `dashboard/src/pages/dashboard/page-builder/page-modes.ts`
  - Frontend normalization helpers for legacy and v2 page shape.
  - Computes active mode, available modes, clone HTML, clone regions, and section items.
- Create `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`
  - Dashboard-side tests for workflow state and active mode behavior.
- Modify `dashboard/src/pages/dashboard/page-builder/page-workflow.ts`
  - Add clone-first workflow state handling without treating structured sections as always primary.
- Modify `dashboard/src/lib/worker-api.ts`
  - Add `includeModes` fetch option.
  - Add `updateClonePage()`.
- Modify `dashboard/src/lib/worker-api.test.ts`
  - Verify query serialization and clone update payload.
- Create `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
  - Builds iframe HTML for Clone Studio.
  - Disables navigation and injects region selection/editing bridge.
- Create `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`
  - Tests navigation disabling and bridge injection.
- Create `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`
  - Renders editable cloned iframe, selects regions, receives DOM snapshots, and emits save payloads.
- Create `dashboard/src/pages/dashboard/components/page-builder/CloneRegionSidebar.vue`
  - Lists clone regions and field summaries.
- Create `dashboard/src/pages/dashboard/components/page-builder/CloneRegionEditor.vue`
  - Edits text/link/image/visibility fields for the selected cloned DOM region.
- Modify `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`
  - Turn into a host that routes to Clone Studio or existing structured section renderer.
- Modify `dashboard/src/pages/dashboard/components/page-builder/PageBuilderSidebar.vue`
  - Show Clone Region sidebar when clone mode is active; keep current section list for section mode.
- Modify `dashboard/src/composables/use-page-builder.ts`
  - Track active mode and selected clone region separately from selected section.
  - Add `saveClone()`, `setActiveMode()`, and normalized mode accessors.
- Modify `dashboard/src/pages/dashboard/page-builder/[slug].vue`
  - Add mode switcher and connect Clone Studio events.

---

## Task 1: Backend Page Mode Helpers

**Files:**
- Create: `src/design/page-modes.ts`
- Create: `src/design/page-modes.test.ts`

- [ ] **Step 1: Write failing tests for mode normalization**

Create `src/design/page-modes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  applyCloneEdit,
  applyCloneMode,
  applySectionsMode,
  getRenderableCloneHtml,
  normalizePageModes,
} from './page-modes'

describe('page mode helpers', () => {
  it('normalizes legacy rendered HTML into clone mode', () => {
    const page: any = {
      id: 'ford-au-mustang',
      content: {
        rendered: '<link rel="stylesheet" href="/ford.css"><main>Mustang</main>',
        sections: [],
      },
    }

    const normalized = normalizePageModes(page)

    expect(normalized.active_mode).toBe('clone')
    expect(normalized.content.modes.clone.rendered).toContain('Mustang')
    expect(normalized.content.rendered).toContain('Mustang')
  })

  it('normalizes legacy sections into sections mode without deleting clone HTML', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'clone',
      content: {
        rendered: '<main>Clone</main>',
        sections: [{ id: 's1', type: 'hero', heading: 'Ford Mustang' }],
      },
    }

    const normalized = normalizePageModes(page)

    expect(normalized.active_mode).toBe('clone')
    expect(normalized.content.modes.clone.rendered).toContain('Clone')
    expect(normalized.content.modes.sections.items).toHaveLength(1)
    expect(normalized.content.sections).toHaveLength(1)
  })

  it('applies clone capture without clearing existing sections', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'sections',
      content: {
        sections: [{ id: 's1', type: 'hero', heading: 'Manual Hero' }],
      },
    }

    const updated = applyCloneMode(page, {
      rendered: '<main>Captured Clone</main>',
      source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
      viewport: { width: 1440, height: 1080 },
      asset_map: { 'https://example.com/hero.jpg': '/media/pages/assets/ford-au/mustang/hero.jpg' },
      stylesheet_urls: ['https://www.ford.com.au/site.css'],
      section_index: [{ id: 'clone-1', label: 'Hero', selector: '[data-oem-region="clone-1"]', tag: 'section', classes: ['hero'], top: 0, height: 800, editable_fields: [] }],
      warnings: ['script tags stripped'],
    }, { activate: true })

    expect(updated.active_mode).toBe('clone')
    expect(updated.content.modes.clone.rendered).toContain('Captured Clone')
    expect(updated.content.modes.sections.items).toHaveLength(1)
    expect(updated.content.sections).toHaveLength(1)
  })

  it('applies structured sections as a derivative without switching away from clone mode', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'clone',
      version: 4,
      content: {
        rendered: '<main>Clone</main>',
        modes: {
          clone: {
            rendered: '<main>Clone</main>',
            source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
        },
      },
    }

    const updated = applySectionsMode(page, [{ id: 's1', type: 'hero', heading: 'Extracted' }], {
      sourceMode: 'clone',
      sourceVersion: 4,
      generatedAt: '2026-06-03T01:00:00.000Z',
    })

    expect(updated.active_mode).toBe('clone')
    expect(updated.content.modes.sections.items[0].heading).toBe('Extracted')
    expect(updated.content.modes.sections.source.mode).toBe('clone')
    expect(updated.content.rendered).toContain('Clone')
  })

  it('saves clone edits separately from the original captured clone', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'clone',
      content: {
        rendered: '<main>Original</main>',
        modes: {
          clone: {
            rendered: '<main>Original</main>',
            source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
        },
      },
    }

    const updated = applyCloneEdit(page, {
      edited_rendered: '<main>Edited</main>',
      section_index: [{ id: 'clone-1', label: 'Main', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
    })

    expect(updated.content.modes.clone.rendered).toContain('Original')
    expect(updated.content.modes.clone.edited_rendered).toContain('Edited')
    expect(getRenderableCloneHtml(updated)).toContain('Edited')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/design/page-modes.test.ts
```

Expected: fail because `src/design/page-modes.ts` does not exist.

- [ ] **Step 3: Implement page mode helpers**

Create `src/design/page-modes.ts`:

```ts
export type PageMode = 'clone' | 'sections' | 'raw-html' | 'generated' | 'template'

export interface CloneEditableField {
  id: string
  selector: string
  kind: 'text' | 'html' | 'image' | 'link' | 'button' | 'background' | 'visibility'
  label: string
  value: string
}

export interface CloneSectionRegion {
  id: string
  label: string
  selector: string
  tag: string
  classes: string[]
  top: number
  height: number
  type_hint?: string
  editable_fields: CloneEditableField[]
}

export interface CloneModeContent {
  rendered: string
  edited_rendered?: string
  source_url: string
  captured_at: string
  viewport: { width: number, height: number }
  asset_map: Record<string, string>
  stylesheet_urls: string[]
  stripped_selectors: string[]
  section_index: CloneSectionRegion[]
  warnings: string[]
}

export interface SectionsModeContent {
  items: any[]
  source?: {
    mode: PageMode
    version: number
    generated_at: string
  }
}

export interface PageModes {
  clone?: CloneModeContent
  sections?: SectionsModeContent
  raw_html?: { items: any[] }
  generated?: { rendered: string }
  template?: { template_id: string, sections: any[] }
}

export interface ModeAwarePage {
  active_mode?: PageMode
  version?: number
  source_url?: string
  content?: {
    rendered?: string
    sections?: any[]
    modes?: PageModes
  }
  [key: string]: any
}

export interface CloneCaptureInput {
  rendered: string
  source_url: string
  viewport: { width: number, height: number }
  asset_map: Record<string, string>
  stylesheet_urls: string[]
  section_index: CloneSectionRegion[]
  warnings: string[]
}

export function normalizePageModes<T extends ModeAwarePage>(page: T): T & { content: NonNullable<T['content']> & { modes: PageModes }, active_mode: PageMode } {
  const content = page.content ?? {}
  const modes: PageModes = { ...(content.modes ?? {}) }

  if (!modes.clone && typeof content.rendered === 'string' && content.rendered.trim()) {
    modes.clone = {
      rendered: content.rendered,
      source_url: page.source_url || '',
      captured_at: page.generated_at || new Date().toISOString(),
      viewport: { width: 1440, height: 1080 },
      asset_map: {},
      stylesheet_urls: extractStylesheetUrls(content.rendered),
      stripped_selectors: [],
      section_index: [],
      warnings: [],
    }
  }

  if (!modes.sections && Array.isArray(content.sections) && content.sections.length > 0) {
    modes.sections = { items: content.sections }
  }

  const activeMode = resolveActiveMode(page.active_mode, modes)
  const normalized = page as T & { content: NonNullable<T['content']> & { modes: PageModes }, active_mode: PageMode }
  normalized.content = {
    ...content,
    rendered: modes.clone?.edited_rendered || modes.clone?.rendered || content.rendered || '',
    sections: modes.sections?.items || content.sections || [],
    modes,
  }
  normalized.active_mode = activeMode
  return normalized
}

export function applyCloneMode<T extends ModeAwarePage>(page: T, input: CloneCaptureInput, options: { activate?: boolean } = {}): T & { active_mode: PageMode } {
  const normalized = normalizePageModes(page)
  normalized.content.modes.clone = {
    rendered: input.rendered,
    source_url: input.source_url,
    captured_at: new Date().toISOString(),
    viewport: input.viewport,
    asset_map: input.asset_map,
    stylesheet_urls: input.stylesheet_urls,
    stripped_selectors: [],
    section_index: input.section_index,
    warnings: input.warnings,
  }
  normalized.content.rendered = input.rendered
  if (options.activate || !normalized.active_mode)
    normalized.active_mode = 'clone'
  return normalized
}

export function applySectionsMode<T extends ModeAwarePage>(
  page: T,
  sections: any[],
  source: { sourceMode: PageMode, sourceVersion: number, generatedAt: string },
): T & { active_mode: PageMode } {
  const normalized = normalizePageModes(page)
  normalized.content.modes.sections = {
    items: sections,
    source: {
      mode: source.sourceMode,
      version: source.sourceVersion,
      generated_at: source.generatedAt,
    },
  }
  normalized.content.sections = sections
  if (!normalized.active_mode)
    normalized.active_mode = 'sections'
  return normalized
}

export function applyCloneEdit<T extends ModeAwarePage>(
  page: T,
  input: { edited_rendered: string, section_index: CloneSectionRegion[] },
): T & { active_mode: PageMode } {
  const normalized = normalizePageModes(page)
  const clone = normalized.content.modes.clone
  if (!clone)
    throw new Error('Cannot edit clone mode because the page has no cloned HTML.')

  clone.edited_rendered = input.edited_rendered
  clone.section_index = input.section_index
  normalized.content.rendered = input.edited_rendered
  normalized.active_mode = 'clone'
  return normalized
}

export function getRenderableCloneHtml(page: ModeAwarePage): string {
  const normalized = normalizePageModes(page)
  return normalized.content.modes.clone?.edited_rendered || normalized.content.modes.clone?.rendered || normalized.content.rendered || ''
}

function resolveActiveMode(current: PageMode | undefined, modes: PageModes): PageMode {
  if (current && modeExists(current, modes))
    return current
  if (modes.clone)
    return 'clone'
  if (modes.sections)
    return 'sections'
  if (modes.generated)
    return 'generated'
  if (modes.raw_html)
    return 'raw-html'
  if (modes.template)
    return 'template'
  return 'sections'
}

function modeExists(mode: PageMode, modes: PageModes): boolean {
  if (mode === 'raw-html')
    return !!modes.raw_html
  return !!modes[mode]
}

function extractStylesheetUrls(rendered: string): string[] {
  return [...rendered.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1])
}
```

- [ ] **Step 4: Run backend helper tests**

Run:

```bash
pnpm exec vitest run src/design/page-modes.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/design/page-modes.ts src/design/page-modes.test.ts
git commit -m "feat(page-builder): add backend page mode helpers"
```

---

## Task 2: Preserve Modes In Clone And Structure Backends

**Files:**
- Modify: `src/design/page-capturer.ts`
- Modify: `src/design/page-structurer.ts`
- Test: `src/design/page-modes.test.ts`

- [ ] **Step 1: Add failing tests for preservation behavior**

Append to `src/design/page-modes.test.ts`:

```ts
  it('keeps active clone mode when sections are regenerated', () => {
    const page: any = {
      active_mode: 'clone',
      version: 9,
      content: {
        rendered: '<main>Clone</main>',
        sections: [{ id: 'old', type: 'intro' }],
      },
    }

    const updated = applySectionsMode(page, [{ id: 'new', type: 'hero' }], {
      sourceMode: 'clone',
      sourceVersion: 9,
      generatedAt: '2026-06-03T02:00:00.000Z',
    })

    expect(updated.active_mode).toBe('clone')
    expect(updated.content.sections).toEqual([{ id: 'new', type: 'hero' }])
    expect(updated.content.rendered).toContain('Clone')
  })

  it('can refresh clone mode while preserving section mode', () => {
    const page: any = {
      active_mode: 'sections',
      content: {
        modes: {
          sections: { items: [{ id: 's1', type: 'hero', heading: 'Manual' }] },
        },
        sections: [{ id: 's1', type: 'hero', heading: 'Manual' }],
      },
    }

    const updated = applyCloneMode(page, {
      rendered: '<main>New Clone</main>',
      source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
      viewport: { width: 1440, height: 1080 },
      asset_map: {},
      stylesheet_urls: [],
      section_index: [],
      warnings: [],
    })

    expect(updated.active_mode).toBe('sections')
    expect(updated.content.modes.clone.rendered).toContain('New Clone')
    expect(updated.content.modes.sections.items[0].heading).toBe('Manual')
  })
```

- [ ] **Step 2: Run test and verify failure or current coverage gap**

Run:

```bash
pnpm exec vitest run src/design/page-modes.test.ts
```

Expected: tests pass if Task 1 implementation already supports this. If they pass, keep them as guardrails for the route integrations.

- [ ] **Step 3: Update `PageCapturer` to apply clone mode**

In `src/design/page-capturer.ts`, import the helper:

```ts
import { applyCloneMode } from './page-modes';
```

Inside `captureModelPage()`, before building `pageData`, load an existing page if present:

```ts
      const latestKey = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
      const existingObj = await this.r2Bucket.get(latestKey);
      const existingPage = existingObj ? await existingObj.json() as Partial<VehicleModelPage> : null;
```

Replace the current `pageData` creation with:

```ts
      const basePage: VehicleModelPage = {
        ...(existingPage || {}),
        id: `${oemId}-${modelSlug}`,
        slug: modelSlug,
        name,
        oem_id: oemId,
        header: {
          slides: heroUrl ? [{
            heading: capture.title || name,
            sub_heading: '',
            button: '',
            desktop: heroUrl,
            mobile: heroUrl,
            bottom_strip: [],
          }] : existingPage?.header?.slides || [],
        },
        content: {
          rendered: existingPage?.content?.rendered || '',
          sections: existingPage?.content?.sections || [],
          modes: (existingPage?.content as any)?.modes,
        } as any,
        form: existingPage?.form ?? false,
        variant_link: existingPage?.variant_link || `/models/${modelSlug}/variants`,
        generated_at: new Date().toISOString(),
        source_url: sourceUrl,
        version: existingPage ? (existingPage.version || 0) + 1 : 3,
      };

      const pageData = applyCloneMode(basePage, {
        rendered: assembledHtml,
        source_url: sourceUrl,
        viewport: { width: 1440, height: 1080 },
        asset_map: Object.fromEntries(urlMapping),
        stylesheet_urls: capture.stylesheetLinks.map(link => {
          const match = link.match(/\bhref=["']([^"']+)["']/i);
          return match?.[1] || link;
        }),
        section_index: [],
        warnings: [],
      }, { activate: !existingPage || !existingPage.active_mode });
```

Keep the existing `latestKey`, `versionKey`, and R2 writes below this block. Remove the duplicate later declaration of `latestKey`.

- [ ] **Step 4: Update `PageStructurer` to apply sections mode**

In `src/design/page-structurer.ts`, import:

```ts
import { applySectionsMode } from './page-modes';
```

Replace:

```ts
      pageData.content.sections = sections;
      pageData.version = (pageData.version || 0) + 1;
      pageData.generated_at = new Date().toISOString();
```

with:

```ts
      const generatedAt = new Date().toISOString();
      applySectionsMode(pageData, sections, {
        sourceMode: 'clone',
        sourceVersion: pageData.version || 0,
        generatedAt,
      });
      pageData.version = (pageData.version || 0) + 1;
      pageData.generated_at = generatedAt;
```

- [ ] **Step 5: Run backend tests**

Run:

```bash
pnpm test -- src/design/page-modes.test.ts src/design/page-structurer.test.ts
```

Expected: helper tests pass. If `page-structurer.test.ts` does not exist, run:

```bash
pnpm exec vitest run src/design/page-modes.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/design/page-capturer.ts src/design/page-structurer.ts src/design/page-modes.test.ts
git commit -m "feat(page-builder): preserve page modes during clone and structure"
```

---

## Task 3: Add Clone Save Endpoint

**Files:**
- Modify: `src/routes/oem-agent.ts`
- Test: `src/design/page-modes.test.ts`

- [ ] **Step 1: Add helper test for route mutation behavior**

Append to `src/design/page-modes.test.ts`:

```ts
  it('throws when saving clone edits for a page without clone mode', () => {
    expect(() => applyCloneEdit({
      active_mode: 'sections',
      content: { sections: [{ id: 's1', type: 'hero' }] },
    }, {
      edited_rendered: '<main>Edited</main>',
      section_index: [],
    })).toThrow('no cloned HTML')
  })
```

- [ ] **Step 2: Run test**

Run:

```bash
pnpm exec vitest run src/design/page-modes.test.ts
```

Expected: pass after Task 1 implementation.

- [ ] **Step 3: Add `update-clone` route**

In `src/routes/oem-agent.ts`, add:

```ts
import { applyCloneEdit } from '../design/page-modes';
```

Add this route near `PUT /admin/update-sections/:oemId/:modelSlug`:

```ts
/**
 * PUT /api/v1/oem-agent/admin/update-clone/:oemId/:modelSlug
 * Save edited cloned DOM without mutating structured sections.
 */
app.put('/admin/update-clone/:oemId/:modelSlug', async (c) => {
  const oemId = c.req.param('oemId') as OemId;
  const modelSlug = c.req.param('modelSlug');

  const body = await c.req.json<{ edited_rendered: string; section_index?: any[] }>();
  if (typeof body.edited_rendered !== 'string' || body.edited_rendered.trim().length < 20) {
    return c.json({ error: 'edited_rendered string is required' }, 400);
  }

  const R2_PREFIX = 'pages/definitions';
  const latestKey = `${R2_PREFIX}/${oemId}/${modelSlug}/latest.json`;
  const obj = await c.env.MOLTBOT_BUCKET.get(latestKey);

  if (!obj) {
    return c.json({ error: 'Page not found in R2' }, 404);
  }

  const pageData = await obj.json() as any;
  try {
    applyCloneEdit(pageData, {
      edited_rendered: body.edited_rendered,
      section_index: Array.isArray(body.section_index) ? body.section_index : [],
    });
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Clone edit failed' }, 400);
  }

  pageData.version = (pageData.version || 0) + 1;
  pageData.generated_at = new Date().toISOString();
  pageData.manually_edited = true;
  pageData.manually_edited_at = new Date().toISOString();

  const jsonStr = JSON.stringify(pageData);
  const versionKey = `${R2_PREFIX}/${oemId}/${modelSlug}/v${Date.now()}.json`;

  await Promise.all([
    c.env.MOLTBOT_BUCKET.put(latestKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'clone-studio', oem_id: oemId, model_slug: modelSlug },
    }),
    c.env.MOLTBOT_BUCKET.put(versionKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { pipeline: 'clone-studio' },
    }),
  ]);

  c.executionCtx.waitUntil(
    (async () => {
      const purgePayload = { oem_code: oemId, model_slug: modelSlug };
      const hooks = await loadWebhooks(c.env.MOLTBOT_BUCKET);
      const cacheHooks = hooks.filter(h => h.events.includes('page.updated'));

      if (cacheHooks.length > 0) {
        await Promise.allSettled(cacheHooks.map(h =>
          fetch(h.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(purgePayload),
          }).catch(err => console.error(`[clone-studio] Webhook failed ${h.url}:`, err))
        ));
      } else if (c.env.DEALER_NETWORK_URL) {
        await fetch(`${c.env.DEALER_NETWORK_URL}/api/webhooks/purge-model-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(purgePayload),
        }).catch(err => console.error(`[clone-studio] Cache purge failed for ${oemId}/${modelSlug}:`, err));
      }
    })()
  );

  return c.json({
    success: true,
    version: pageData.version,
    active_mode: pageData.active_mode,
    clone_regions_count: pageData.content?.modes?.clone?.section_index?.length || 0,
  });
});
```

- [ ] **Step 4: Run backend typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/oem-agent.ts src/design/page-modes.test.ts
git commit -m "feat(page-builder): add clone edit save endpoint"
```

---

## Task 4: Dashboard Page Mode Helpers

**Files:**
- Create: `dashboard/src/pages/dashboard/page-builder/page-modes.ts`
- Create: `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/page-workflow.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts`

- [ ] **Step 1: Write failing dashboard mode tests**

Create `dashboard/src/pages/dashboard/page-builder/page-modes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  getActivePageMode,
  getAvailablePageModes,
  getCloneHtml,
  getCloneRegions,
  getSectionItems,
  normalizeDashboardPageModes,
} from './page-modes'

describe('dashboard page modes', () => {
  it('defaults cloned pages to clone mode even when sections exist', () => {
    const page = normalizeDashboardPageModes({
      active_mode: 'clone',
      content: {
        rendered: '<main>Ford clone</main>',
        sections: [{ id: 's1', type: 'hero' }],
      },
    })

    expect(getActivePageMode(page)).toBe('clone')
    expect(getCloneHtml(page)).toContain('Ford clone')
    expect(getSectionItems(page)).toHaveLength(1)
  })

  it('finds clone HTML from edited clone before original clone', () => {
    const page = normalizeDashboardPageModes({
      content: {
        modes: {
          clone: {
            rendered: '<main>Original</main>',
            edited_rendered: '<main>Edited</main>',
            section_index: [],
          },
        },
      },
    })

    expect(getCloneHtml(page)).toContain('Edited')
  })

  it('returns clone regions from mode metadata', () => {
    const page = normalizeDashboardPageModes({
      content: {
        rendered: '<main>Clone</main>',
        modes: {
          clone: {
            rendered: '<main>Clone</main>',
            section_index: [{ id: 'r1', label: 'Hero', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
          },
        },
      },
    })

    expect(getCloneRegions(page)[0].label).toBe('Hero')
  })

  it('reports available modes without duplicating legacy data', () => {
    const page = normalizeDashboardPageModes({
      content: {
        rendered: '<main>Clone</main>',
        sections: [{ id: 's1', type: 'hero' }],
      },
    })

    expect(getAvailablePageModes(page)).toEqual(['clone', 'sections'])
  })
})
```

Append to `dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts`:

```ts
  it('returns cloned for mode-aware clone pages even when sections also exist', () => {
    expect(getPageWorkflowState({
      page: {
        active_mode: 'clone',
        content: {
          rendered: '<main>Clone</main>',
          sections: [{ id: 's1', type: 'hero' }],
          modes: {
            clone: { rendered: '<main>Clone</main>' },
            sections: { items: [{ id: 's1', type: 'hero' }] },
          },
        },
      } as any,
      error: null,
    })).toBe('cloned')
  })
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/page-builder/page-modes.test.ts dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts
```

Expected: fail because `page-modes.ts` does not exist and workflow does not understand `active_mode`.

- [ ] **Step 3: Implement dashboard mode helpers**

Create `dashboard/src/pages/dashboard/page-builder/page-modes.ts`:

```ts
export type PageMode = 'clone' | 'sections' | 'raw-html' | 'generated' | 'template'

export interface CloneRegion {
  id: string
  label: string
  selector: string
  tag: string
  classes: string[]
  top: number
  height: number
  type_hint?: string
  editable_fields: Array<{
    id: string
    selector: string
    kind: 'text' | 'html' | 'image' | 'link' | 'button' | 'background' | 'visibility'
    label: string
    value: string
  }>
}

export function normalizeDashboardPageModes<T extends any>(page: T): T {
  if (!page)
    return page

  const content = page.content ?? {}
  content.modes = content.modes ?? {}

  if (!content.modes.clone && typeof content.rendered === 'string' && content.rendered.trim()) {
    content.modes.clone = {
      rendered: content.rendered,
      section_index: [],
    }
  }

  if (!content.modes.sections && Array.isArray(content.sections) && content.sections.length > 0) {
    content.modes.sections = { items: content.sections }
  }

  content.rendered = getCloneHtml({ ...page, content }) || content.rendered || ''
  content.sections = content.modes.sections?.items || content.sections || []
  page.content = content

  if (!page.active_mode)
    page.active_mode = getAvailablePageModes(page)[0] || 'sections'

  return page
}

export function getActivePageMode(page: any): PageMode {
  const normalized = normalizeDashboardPageModes(page)
  const available = getAvailablePageModes(normalized)
  return available.includes(normalized?.active_mode) ? normalized.active_mode : available[0] || 'sections'
}

export function getAvailablePageModes(page: any): PageMode[] {
  const modes = page?.content?.modes ?? {}
  const available: PageMode[] = []
  if (modes.clone || page?.content?.rendered)
    available.push('clone')
  if (modes.sections || page?.content?.sections?.length)
    available.push('sections')
  if (modes.raw_html)
    available.push('raw-html')
  if (modes.generated)
    available.push('generated')
  if (modes.template)
    available.push('template')
  return available
}

export function getCloneHtml(page: any): string {
  const clone = page?.content?.modes?.clone
  return clone?.edited_rendered || clone?.rendered || page?.content?.rendered || ''
}

export function getCloneRegions(page: any): CloneRegion[] {
  return page?.content?.modes?.clone?.section_index || []
}

export function getSectionItems(page: any): any[] {
  return page?.content?.modes?.sections?.items || page?.content?.sections || []
}
```

- [ ] **Step 4: Update workflow state**

In `dashboard/src/pages/dashboard/page-builder/page-workflow.ts`, extend `PageWorkflowPage`:

```ts
  active_mode?: string | null
```

Then make clone active mode win before section detection:

```ts
  if (page?.active_mode === 'clone')
    return 'cloned'
```

Place this check after the `custom` check and before the `sections` check.

- [ ] **Step 5: Run dashboard mode tests**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/page-builder/page-modes.test.ts dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/pages/dashboard/page-builder/page-modes.ts dashboard/src/pages/dashboard/page-builder/page-modes.test.ts dashboard/src/pages/dashboard/page-builder/page-workflow.ts dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts
git commit -m "feat(page-builder): add dashboard page mode helpers"
```

---

## Task 5: Worker API Clone Mode Support

**Files:**
- Modify: `dashboard/src/lib/worker-api.ts`
- Modify: `dashboard/src/lib/worker-api.test.ts`

- [ ] **Step 1: Write failing worker API tests**

Append to `dashboard/src/lib/worker-api.test.ts`:

```ts
import { updateClonePage } from './worker-api'

describe('worker-api updateClonePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, version: 6 }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('saves edited clone HTML and section index', async () => {
    await updateClonePage('ford-au', 'mustang', {
      edited_rendered: '<main>Edited Mustang</main>',
      section_index: [{ id: 'r1', label: 'Hero', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
    })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/admin/update-clone/ford-au/mustang')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({
      edited_rendered: '<main>Edited Mustang</main>',
      section_index: [{ id: 'r1', label: 'Hero', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
    }))
  })
})
```

Update the existing `fetchGeneratedPage` test:

```ts
  it('requests cloned HTML and modes only when the caller needs them', async () => {
    await fetchGeneratedPage('ford-au-mustang')
    await fetchGeneratedPage('ford-au-mustang', { includeRendered: true, includeModes: true })

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang')
    expect(fetchMock.mock.calls[0][0]).not.toContain('includeRendered=true')
    expect(fetchMock.mock.calls[0][0]).not.toContain('includeModes=true')
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/oem-agent/pages/ford-au-mustang?includeRendered=true&includeModes=true')
  })
```

- [ ] **Step 2: Run worker API tests and verify failure**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/lib/worker-api.test.ts
```

Expected: fail because `includeModes` and `updateClonePage` do not exist.

- [ ] **Step 3: Implement API helpers**

In `dashboard/src/lib/worker-api.ts`, update `fetchGeneratedPage`:

```ts
export async function fetchGeneratedPage(slug: string, options?: { includeRendered?: boolean, includeModes?: boolean }) {
  const params = new URLSearchParams()
  if (options?.includeRendered)
    params.set('includeRendered', 'true')
  if (options?.includeModes)
    params.set('includeModes', 'true')
  const query = params.toString() ? `?${params.toString()}` : ''
  return workerFetch(`/api/v1/oem-agent/pages/${slug}${query}`)
}
```

Add:

```ts
export async function updateClonePage(oemId: string, modelSlug: string, payload: { edited_rendered: string, section_index: any[] }) {
  return workerFetch(`/api/v1/oem-agent/admin/update-clone/${oemId}/${modelSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
```

- [ ] **Step 4: Run worker API tests**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/lib/worker-api.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/worker-api.ts dashboard/src/lib/worker-api.test.ts
git commit -m "feat(page-builder): add clone save API client"
```

---

## Task 6: Clone Studio HTML Bridge

**Files:**
- Create: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
- Create: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-preview-html.ts`

- [ ] **Step 1: Write failing bridge tests**

Create `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { buildCloneStudioHtml } from './clone-studio-html'

describe('buildCloneStudioHtml', () => {
  it('disables navigation and injects clone studio bridge messages', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><a href="/showroom">Compare</a><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    expect(html).toContain('data-oem-preview-link="true"')
    expect(html).toContain('clone-studio:ready')
    expect(html).toContain('clone-studio:select-region')
    expect(html).toContain('clone-studio:dom-updated')
  })

  it('marks a selected region for the iframe bridge', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main data-oem-region-id="r1"><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: 'r1',
    })

    expect(html).toContain('window.__CLONE_STUDIO_SELECTED_REGION__ = "r1"')
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
```

Expected: fail because `clone-studio-html.ts` does not exist.

- [ ] **Step 3: Implement bridge builder**

Create `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`:

```ts
import { disableClonePreviewNavigation } from './clone-preview-html'

export interface CloneStudioHtmlOptions {
  rendered: string
  title: string
  baseHref: string
  selectedRegionId: string | null
}

export function buildCloneStudioHtml(options: CloneStudioHtmlOptions): string {
  const headParts: string[] = []
  let rendered = options.rendered || ''

  rendered = rendered.replace(/<link\s[^>]*>/gi, (match: string) => {
    headParts.push(match)
    return ''
  })
  rendered = rendered.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (match: string) => {
    headParts.push(match)
    return ''
  })
  rendered = disableClonePreviewNavigation(rendered)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${escapeHtmlAttribute(options.baseHref)}">
<title>${escapeHtml(options.title)}</title>
${headParts.join('\n')}
<style id="clone-studio-editor-style">
[data-clone-studio-hover]{outline:3px solid #3b82f6!important;outline-offset:-3px;cursor:pointer!important}
[data-clone-studio-selected]{outline:3px solid #10b981!important;outline-offset:-3px}
img.imgdesktop,img.dsktoponly{display:block!important;width:100%!important;max-width:100%!important;height:auto!important}
</style>
<script>
window.__CLONE_STUDIO_SELECTED_REGION__ = ${JSON.stringify(options.selectedRegionId)};
</script>
</head>
<body style="margin:0;padding:0;background:#fff;">
${rendered}
<script>
(function(){
  var hovered = null;
  function post(type, payload){ window.parent.postMessage(Object.assign({ type: type }, payload || {}), '*'); }
  function candidateFrom(target){
    var el = target && target.closest ? target.closest('[data-oem-region-id],section,article,main > div,body > div') : null;
    return el || document.querySelector('main') || document.body;
  }
  function regionPayload(el){
    var rect = el.getBoundingClientRect();
    var id = el.getAttribute('data-oem-region-id') || el.id || 'clone-region-' + Math.abs(Array.prototype.indexOf.call(document.querySelectorAll('section,article,main > div,body > div'), el));
    if (!el.getAttribute('data-oem-region-id')) el.setAttribute('data-oem-region-id', id);
    return {
      id: id,
      label: (el.querySelector('h1,h2,h3') || el).textContent.trim().slice(0, 80) || el.tagName.toLowerCase(),
      selector: '[data-oem-region-id="' + id.replace(/"/g, '\\\\"') + '"]',
      tag: el.tagName.toLowerCase(),
      classes: String(el.className || '').split(/\\s+/).filter(Boolean),
      top: Math.round(rect.top + window.scrollY),
      height: Math.round(rect.height),
      editable_fields: extractFields(el)
    };
  }
  function extractFields(el){
    var fields = [];
    Array.prototype.slice.call(el.querySelectorAll('h1,h2,h3,p,a,button,img')).slice(0, 20).forEach(function(node, index){
      var selector = node.id ? '#' + node.id : '[data-clone-field="' + index + '"]';
      if (!node.id) node.setAttribute('data-clone-field', String(index));
      if (node.tagName === 'IMG') {
        fields.push({ id: 'field-' + index, selector: selector, kind: 'image', label: node.getAttribute('alt') || 'Image', value: node.getAttribute('src') || '' });
      } else if (node.tagName === 'A') {
        fields.push({ id: 'field-' + index, selector: selector, kind: 'link', label: node.textContent.trim() || 'Link', value: node.getAttribute('href') || '' });
      } else {
        fields.push({ id: 'field-' + index, selector: selector, kind: 'text', label: node.tagName.toLowerCase(), value: node.textContent.trim() });
      }
    });
    return fields;
  }
  function select(el){
    document.querySelectorAll('[data-clone-studio-selected]').forEach(function(node){ node.removeAttribute('data-clone-studio-selected'); });
    el.setAttribute('data-clone-studio-selected', '');
    post('clone-studio:select-region', { region: regionPayload(el), html: document.body.innerHTML });
  }
  document.addEventListener('mouseover', function(event){
    var el = candidateFrom(event.target);
    if (!el) return;
    if (hovered && hovered !== el) hovered.removeAttribute('data-clone-studio-hover');
    hovered = el;
    hovered.setAttribute('data-clone-studio-hover', '');
  }, true);
  document.addEventListener('mouseout', function(){
    if (hovered) hovered.removeAttribute('data-clone-studio-hover');
    hovered = null;
  }, true);
  document.addEventListener('click', function(event){
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    var el = candidateFrom(event.target);
    if (el) select(el);
  }, true);
  window.addEventListener('message', function(event){
    var data = event.data || {};
    if (data.type === 'clone-studio:select' && data.regionId) {
      var target = document.querySelector('[data-oem-region-id="' + String(data.regionId).replace(/"/g, '\\\\"') + '"]');
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); select(target); }
    }
    if (data.type === 'clone-studio:patch-field' && data.selector) {
      var node = document.querySelector(data.selector);
      if (node) {
        if (data.kind === 'image') node.setAttribute('src', data.value || '');
        else if (data.kind === 'link') node.setAttribute('href', data.value || '');
        else if (data.kind === 'visibility') node.style.display = data.value === 'hidden' ? 'none' : '';
        else node.textContent = data.value || '';
        post('clone-studio:dom-updated', { html: document.body.innerHTML });
      }
    }
  });
  post('clone-studio:ready', { html: document.body.innerHTML });
  if (window.__CLONE_STUDIO_SELECTED_REGION__) {
    var initial = document.querySelector('[data-oem-region-id="' + window.__CLONE_STUDIO_SELECTED_REGION__ + '"]');
    if (initial) select(initial);
  }
})();
</script>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
```

- [ ] **Step 4: Run bridge tests**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts
git commit -m "feat(page-builder): add clone studio iframe bridge"
```

---

## Task 7: Clone Studio Canvas And Region Editor

**Files:**
- Create: `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`
- Create: `dashboard/src/pages/dashboard/components/page-builder/CloneRegionSidebar.vue`
- Create: `dashboard/src/pages/dashboard/components/page-builder/CloneRegionEditor.vue`
- Create: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts`

- [ ] **Step 1: Write component source tests**

Create `dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Clone Studio components', () => {
  it('CloneStudioCanvas renders the clone iframe and listens for bridge messages', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('buildCloneStudioHtml')
    expect(source).toContain('clone-studio:select-region')
    expect(source).toContain('clone-studio:dom-updated')
    expect(source).toContain('postMessage')
  })

  it('CloneRegionSidebar lists clone regions separately from structured sections', () => {
    const source = readFileSync(new URL('./CloneRegionSidebar.vue', import.meta.url), 'utf8')

    expect(source).toContain('regions')
    expect(source).toContain('selectRegion')
    expect(source).toContain('Edit clone region')
  })

  it('CloneRegionEditor patches text, image, link, and visibility fields', () => {
    const source = readFileSync(new URL('./CloneRegionEditor.vue', import.meta.url), 'utf8')

    expect(source).toContain('patchField')
    expect(source).toContain('field.kind === \\'image\\'')
    expect(source).toContain('field.kind === \\'link\\'')
    expect(source).toContain('field.kind === \\'visibility\\'')
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts
```

Expected: fail because components do not exist.

- [ ] **Step 3: Create `CloneStudioCanvas.vue`**

Create `dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue`:

```vue
<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import type { CloneRegion } from '../../page-builder/page-modes'

import { getCloneHtml } from '../../page-builder/page-modes'
import { buildCloneStudioHtml } from './clone-studio-html'

const props = defineProps<{
  page: any
  workerBase: string
  selectedRegionId: string | null
}>()

const emit = defineEmits<{
  selectRegion: [region: CloneRegion]
  domUpdated: [html: string]
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)

const srcdoc = computed(() => buildCloneStudioHtml({
  rendered: getCloneHtml(props.page),
  title: props.page?.name || 'OEM Clone',
  baseHref: props.workerBase,
  selectedRegionId: props.selectedRegionId,
}))

function onMessage(event: MessageEvent) {
  const data = event.data || {}
  if (data.type === 'clone-studio:select-region' && data.region)
    emit('selectRegion', data.region)
  if (data.type === 'clone-studio:dom-updated' && typeof data.html === 'string')
    emit('domUpdated', data.html)
}

function postToFrame(payload: Record<string, unknown>) {
  iframeRef.value?.contentWindow?.postMessage(payload, '*')
}

watch(
  () => props.selectedRegionId,
  (regionId) => {
    if (regionId)
      postToFrame({ type: 'clone-studio:select', regionId })
  },
)

defineExpose({ postToFrame })

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div class="h-full min-h-[720px] bg-white">
    <iframe
      ref="iframeRef"
      :srcdoc="srcdoc"
      class="w-full h-full border-0 bg-white"
      sandbox="allow-same-origin allow-scripts allow-popups allow-presentation"
    />
  </div>
</template>
```

- [ ] **Step 4: Create `CloneRegionSidebar.vue`**

Create `dashboard/src/pages/dashboard/components/page-builder/CloneRegionSidebar.vue`:

```vue
<script lang="ts" setup>
import { MousePointer2 } from 'lucide-vue-next'

import type { CloneRegion } from '../../page-builder/page-modes'

defineProps<{
  regions: CloneRegion[]
  selectedRegionId: string | null
}>()

const emit = defineEmits<{
  selectRegion: [region: CloneRegion]
  editRegion: [region: CloneRegion]
}>()
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-4 py-3 border-b shrink-0">
      <h3 class="text-sm font-semibold">
        Clone Regions ({{ regions.length }})
      </h3>
    </div>
    <div class="flex-1 overflow-y-auto p-3 space-y-2">
      <button
        v-for="region in regions"
        :key="region.id"
        class="w-full text-left rounded-md border p-3 hover:bg-muted/50 transition-colors"
        :class="selectedRegionId === region.id ? 'ring-2 ring-primary' : ''"
        title="Edit clone region"
        @click="emit('selectRegion', region)"
        @dblclick="emit('editRegion', region)"
      >
        <div class="flex items-center gap-2">
          <MousePointer2 class="size-3.5 text-muted-foreground" />
          <span class="text-sm font-medium truncate">{{ region.label }}</span>
        </div>
        <div class="mt-1 text-xs text-muted-foreground">
          {{ region.tag }} · {{ region.height }}px · {{ region.editable_fields.length }} fields
        </div>
      </button>
      <div v-if="regions.length === 0" class="text-sm text-muted-foreground text-center py-8">
        Select a region in the clone to index editable fields.
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Create `CloneRegionEditor.vue`**

Create `dashboard/src/pages/dashboard/components/page-builder/CloneRegionEditor.vue`:

```vue
<script lang="ts" setup>
import type { CloneRegion } from '../../page-builder/page-modes'

defineProps<{
  region: CloneRegion | null
}>()

const emit = defineEmits<{
  patchField: [payload: { selector: string, kind: string, value: string }]
}>()

function patchField(field: CloneRegion['editable_fields'][number], value: string) {
  emit('patchField', { selector: field.selector, kind: field.kind, value })
}
</script>

<template>
  <div v-if="region" class="fixed right-6 bottom-6 z-50 w-80 rounded-lg border bg-card shadow-xl">
    <div class="border-b px-4 py-3">
      <h3 class="text-sm font-semibold truncate">
        {{ region.label }}
      </h3>
      <p class="text-xs text-muted-foreground">
        {{ region.tag }} clone region
      </p>
    </div>
    <div class="max-h-[50vh] overflow-y-auto p-4 space-y-3">
      <label v-for="field in region.editable_fields" :key="field.id" class="block space-y-1">
        <span class="text-xs font-medium">{{ field.label }}</span>
        <UiInput
          v-if="field.kind === 'image' || field.kind === 'link'"
          :model-value="field.value"
          class="h-8 text-xs"
          @update:model-value="patchField(field, String($event))"
        />
        <UiSelect
          v-else-if="field.kind === 'visibility'"
          :model-value="field.value || 'visible'"
          @update:model-value="patchField(field, String($event))"
        >
          <UiSelectTrigger class="h-8 text-xs">
            <UiSelectValue />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="visible">
              Visible
            </UiSelectItem>
            <UiSelectItem value="hidden">
              Hidden
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <UiTextarea
          v-else
          :model-value="field.value"
          class="min-h-16 text-xs"
          @update:model-value="patchField(field, String($event))"
        />
      </label>
    </div>
  </div>
</template>
```

- [ ] **Step 6: Run component tests**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/CloneStudioCanvas.vue dashboard/src/pages/dashboard/components/page-builder/CloneRegionSidebar.vue dashboard/src/pages/dashboard/components/page-builder/CloneRegionEditor.vue dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts
git commit -m "feat(page-builder): add clone studio components"
```

---

## Task 8: Integrate Clone Studio Into Page Builder State

**Files:**
- Modify: `dashboard/src/composables/use-page-builder.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/[slug].vue`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderSidebar.vue`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`

- [ ] **Step 1: Replace the old auto-switch regression with clone-first behavior**

In `dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`, replace:

```ts
  it('switches from OEM clone preview into section editing when a section is selected', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('() => props.selectedSectionId')
    expect(source).toContain("previewMode.value = 'sections'")
  })
```

with:

```ts
  it('keeps Clone Studio active when a structured section is selected', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).not.toContain("previewMode.value = 'sections'")
    expect(source).toContain('CloneStudioCanvas')
    expect(source).toContain('activeMode')
  })
```

- [ ] **Step 2: Run the preview test and verify failure**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
```

Expected: fail because `PageBuilderCanvas.vue` still contains the auto-switch watcher and does not host Clone Studio.

- [ ] **Step 3: Update `use-page-builder.ts` mode state**

Import:

```ts
import { getActivePageMode, getCloneHtml, getCloneRegions, getSectionItems, normalizeDashboardPageModes } from '@/pages/dashboard/page-builder/page-modes'
import { updateClonePage } from '@/lib/worker-api'
```

After `selectedSectionId`, add:

```ts
  const selectedCloneRegionId = ref<string | null>(null)
  const activeMode = computed(() => getActivePageMode(page.value))
  const cloneHtml = computed(() => getCloneHtml(page.value))
  const cloneRegions = computed(() => getCloneRegions(page.value))
```

In `loadPage()` and `refreshPage()`, wrap the response:

```ts
      page.value = normalizeDashboardPageModes(await fetchGeneratedPage(newSlug, { includeRendered: true, includeModes: true }))
```

and:

```ts
      page.value = normalizeDashboardPageModes(await fetchGeneratedPage(slug.value, { includeRendered: true, includeModes: true }))
```

Add:

```ts
  function setActiveMode(mode: 'clone' | 'sections' | 'raw-html' | 'generated' | 'template') {
    ensureContentExists()
    page.value.active_mode = mode
    selectedSectionId.value = null
    selectedCloneRegionId.value = null
  }

  function selectCloneRegion(id: string | null) {
    selectedCloneRegionId.value = id
  }

  async function saveClone(editedRendered: string, sectionIndex: any[]) {
    if (!oemId.value || !modelSlug.value)
      return
    saving.value = true
    try {
      const result = await updateClonePage(oemId.value, modelSlug.value, {
        edited_rendered: editedRendered,
        section_index: sectionIndex,
      })
      if (page.value?.content?.modes?.clone) {
        page.value.content.modes.clone.edited_rendered = editedRendered
        page.value.content.modes.clone.section_index = sectionIndex
        page.value.content.rendered = editedRendered
        page.value.active_mode = 'clone'
      }
      if (page.value)
        page.value.version = result.version ?? ((page.value.version || 0) + 1)
      isDirty.value = false
    }
    catch (err: any) {
      error.value = err.message || 'Save clone failed'
    }
    finally {
      saving.value = false
    }
  }
```

Return the new state/methods from `usePageBuilder()`.

- [ ] **Step 4: Update `PageBuilderCanvas.vue` to host Clone Studio**

Import:

```ts
import CloneStudioCanvas from './CloneStudioCanvas.vue'
```

Add props:

```ts
  activeMode: string
  selectedCloneRegionId: string | null
```

Add emits:

```ts
  selectCloneRegion: [region: any]
  cloneDomUpdated: [html: string]
```

Remove the watcher that sets `previewMode.value = 'sections'` when `props.selectedSectionId` changes.

Render Clone Studio before structured preview:

```vue
      <template v-if="activeMode === 'clone' && showClonePreview">
        <CloneStudioCanvas
          :page="page"
          :worker-base="workerBase"
          :selected-region-id="selectedCloneRegionId"
          @select-region="emit('selectCloneRegion', $event)"
          @dom-updated="emit('cloneDomUpdated', $event)"
        />
      </template>
```

Change the structured preview branch to:

```vue
      <template v-else-if="activeMode === 'sections' && showStructuredPreview">
```

- [ ] **Step 5: Update `PageBuilderSidebar.vue` for clone mode**

Import:

```ts
import CloneRegionSidebar from './CloneRegionSidebar.vue'
```

Add props:

```ts
  activeMode?: string
  cloneRegions?: any[]
  selectedCloneRegionId?: string | null
```

Add emits:

```ts
  selectCloneRegion: [region: any]
  editCloneRegion: [region: any]
```

Render clone sidebar first:

```vue
    <CloneRegionSidebar
      v-if="activeMode === 'clone'"
      :regions="cloneRegions || []"
      :selected-region-id="selectedCloneRegionId || null"
      @select-region="emit('selectCloneRegion', $event)"
      @edit-region="emit('editCloneRegion', $event)"
    />
```

Wrap the current metadata/sections template in:

```vue
    <template v-else>
      ...
    </template>
```

- [ ] **Step 6: Wire page builder page**

In `dashboard/src/pages/dashboard/page-builder/[slug].vue`, destructure new composable values:

```ts
  activeMode,
  cloneHtml,
  cloneRegions,
  selectedCloneRegionId,
  setActiveMode,
  selectCloneRegion,
  saveClone,
```

Add local clone draft state:

```ts
const cloneDraftHtml = ref('')

function onCloneDomUpdated(html: string) {
  cloneDraftHtml.value = html
}

function onCloneRegionSelected(region: any) {
  selectCloneRegion(region.id)
}

async function saveActiveMode() {
  if (activeMode.value === 'clone') {
    await saveClone(cloneDraftHtml.value || cloneHtml.value, cloneRegions.value)
    return
  }
  await saveSections()
}
```

Change toolbar Save click from `saveSections` to `saveActiveMode`.

Pass props/events into `PageBuilderCanvas`:

```vue
            :active-mode="activeMode"
            :selected-clone-region-id="selectedCloneRegionId"
            @select-clone-region="onCloneRegionSelected"
            @clone-dom-updated="onCloneDomUpdated"
```

Pass props/events into `PageBuilderSidebar`:

```vue
            :active-mode="activeMode"
            :clone-regions="cloneRegions"
            :selected-clone-region-id="selectedCloneRegionId"
            @select-clone-region="onCloneRegionSelected"
            @edit-clone-region="onCloneRegionSelected"
```

Add a compact mode switcher near the existing clone/section controls:

```vue
          <div v-if="page?.content?.modes" class="inline-flex items-center rounded-md border bg-muted/40 p-0.5">
            <button
              v-if="page.content.modes.clone"
              class="px-2.5 py-1 text-xs font-medium rounded"
              :class="activeMode === 'clone' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
              @click="setActiveMode('clone')"
            >
              Clone Studio
            </button>
            <button
              v-if="page.content.modes.sections"
              class="px-2.5 py-1 text-xs font-medium rounded"
              :class="activeMode === 'sections' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
              @click="setActiveMode('sections')"
            >
              Section Builder
            </button>
          </div>
```

- [ ] **Step 7: Run focused dashboard tests**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-components.test.ts dashboard/src/pages/dashboard/page-builder/page-modes.test.ts dashboard/src/lib/worker-api.test.ts
```

Expected: all focused dashboard tests pass.

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/composables/use-page-builder.ts dashboard/src/pages/dashboard/page-builder/[slug].vue dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue dashboard/src/pages/dashboard/components/page-builder/PageBuilderSidebar.vue dashboard/src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts
git commit -m "feat(page-builder): route cloned pages through clone studio"
```

---

## Task 9: Guard Destructive Transitions

**Files:**
- Modify: `dashboard/src/composables/use-page-builder.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/[slug].vue`
- Modify: `dashboard/src/pages/dashboard/page-builder/page-workflow.ts`
- Modify: `dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts`

- [ ] **Step 1: Add workflow tests for guarded actions**

In `dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts`, add:

```ts
import { needsDestructiveActionConfirmation } from './page-workflow'

describe('needsDestructiveActionConfirmation', () => {
  it('guards clone when sections or manual edits exist', () => {
    expect(needsDestructiveActionConfirmation('clone', {
      active_mode: 'sections',
      manually_edited: true,
      content: { sections: [{ id: 's1', type: 'hero' }] },
    } as any)).toBe(true)
  })

  it('does not guard clone-only empty pages', () => {
    expect(needsDestructiveActionConfirmation('clone', {
      active_mode: 'clone',
      content: { rendered: '<main>Clone</main>', sections: [] },
    } as any)).toBe(false)
  })

  it('guards structure when manual sections already exist', () => {
    expect(needsDestructiveActionConfirmation('structure', {
      active_mode: 'sections',
      manually_edited: true,
      content: { sections: [{ id: 's1', type: 'hero' }] },
    } as any)).toBe(true)
  })
})
```

- [ ] **Step 2: Run workflow tests and verify failure**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts
```

Expected: fail because `needsDestructiveActionConfirmation` does not exist.

- [ ] **Step 3: Implement guard helper**

Add to `dashboard/src/pages/dashboard/page-builder/page-workflow.ts`:

```ts
export type DestructivePageAction = 'clone' | 'structure' | 'pipeline' | 'template'

export function needsDestructiveActionConfirmation(action: DestructivePageAction, page: PageWorkflowPage | null | undefined): boolean {
  if (!page)
    return false

  const hasSections = Array.isArray(page.content?.sections) && page.content.sections.length > 0
  const hasClone = typeof page.content?.rendered === 'string' && page.content.rendered.trim().length > 0
  const manuallyEdited = Boolean((page as any).manually_edited)

  if (action === 'clone')
    return Boolean(manuallyEdited || hasSections)

  if (action === 'structure')
    return Boolean(manuallyEdited && hasSections)

  if (action === 'pipeline')
    return Boolean(manuallyEdited || hasSections || hasClone)

  if (action === 'template')
    return Boolean(manuallyEdited || hasSections || hasClone)

  return false
}
```

- [ ] **Step 4: Use confirmation before clone/structure/pipeline**

In `dashboard/src/pages/dashboard/page-builder/[slug].vue`, add:

```ts
import { needsDestructiveActionConfirmation } from './page-workflow'
```

Wrap action handlers:

```ts
async function confirmAndClone() {
  if (needsDestructiveActionConfirmation('clone', page.value)) {
    const ok = window.confirm('Clone will update the clone representation. Existing section edits will be preserved, but the active clone can change. Continue?')
    if (!ok)
      return
  }
  await handleClone()
}

async function confirmAndStructure() {
  if (needsDestructiveActionConfirmation('structure', page.value)) {
    const ok = window.confirm('Structure will regenerate the structured section mode. Existing manual section edits may change. Continue?')
    if (!ok)
      return
  }
  await handleStructure(selectedModelOverride.value)
}

async function confirmAndPipeline() {
  if (needsDestructiveActionConfirmation('pipeline', page.value)) {
    const ok = window.confirm('Pipeline can refresh clone and structured modes. Continue?')
    if (!ok)
      return
  }
  await handleAdaptivePipeline(selectedModelOverride.value)
}
```

Change toolbar clicks from direct `handleClone`, `handleStructure`, and `handleAdaptivePipeline` calls to these wrappers.

- [ ] **Step 5: Run workflow tests**

Run:

```bash
CI=1 pnpm exec vitest run --config dashboard/vite.config.ts --mode production --pool forks --maxWorkers=1 --minWorkers=1 dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts
```

Expected: all workflow tests pass.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/pages/dashboard/page-builder/page-workflow.ts dashboard/src/pages/dashboard/page-builder/page-workflow.test.ts dashboard/src/pages/dashboard/page-builder/[slug].vue
git commit -m "feat(page-builder): guard destructive builder actions"
```

---

## Task 10: Full Verification And Deployment

**Files:**
- No new source files unless previous tasks reveal compile issues.

- [ ] **Step 1: Run dashboard tests**

Run:

```bash
pnpm run test:dashboard
```

Expected: all dashboard tests pass.

- [ ] **Step 2: Run worker tests**

Run:

```bash
pnpm test
```

Expected: all worker and design tests pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Build dashboard**

Run:

```bash
CI=1 pnpm --dir dashboard build
```

Expected: Vite production build succeeds.

- [ ] **Step 5: Build worker**

Run:

```bash
pnpm run build
```

Expected: worker/client build succeeds.

- [ ] **Step 6: Browser verification**

Use Kimi WebBridge or Playwright to verify:

1. Open `https://oem-dashboard.pages.dev/dashboard/page-builder/ford-au-mustang`.
2. Confirm cloned pages open in `Clone Studio`.
3. Click a sidebar clone region.
4. Confirm the central canvas remains the cloned iframe and does not switch to Vue section rendering.
5. Edit a text field in `CloneRegionEditor`.
6. Save.
7. Reload the page.
8. Confirm the edited cloned DOM persists.
9. Switch deliberately to `Section Builder`.
10. Confirm structured sections still render as the legacy editor mode.

- [ ] **Step 7: Commit any final fixes**

If verification required small fixes:

```bash
git add src/design/page-modes.ts src/design/page-capturer.ts src/design/page-structurer.ts src/routes/oem-agent.ts dashboard/src/lib/worker-api.ts dashboard/src/composables/use-page-builder.ts dashboard/src/pages/dashboard/page-builder dashboard/src/pages/dashboard/components/page-builder
git commit -m "fix(page-builder): stabilize clone studio verification"
```

- [ ] **Step 8: Push**

```bash
git push
```

- [ ] **Step 9: Deploy dashboard**

```bash
pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main
```

- [ ] **Step 10: Deploy worker if backend changed**

Use the repo's existing deploy command:

```bash
pnpm run deploy
```

Expected: Cloudflare deployment succeeds.

---

## Self-Review

### Spec Coverage

- Clone-first editing: covered by Tasks 6-8.
- Mode contract and backward compatibility: covered by Tasks 1 and 4.
- Preserve existing section builder: covered by Tasks 4 and 8.
- Guard destructive actions: covered by Task 9.
- Backend clone and structure preservation: covered by Tasks 2 and 3.
- Alpine role: intentionally deferred to a later phase; Clone Studio v1 keeps the bridge ready for future Alpine region replacement.
- Browser verification: covered by Task 10.

### Known Deferred Scope

- Full visual diff/fidelity scoring is deferred.
- Alpine island replacement is deferred.
- Template target-mode UX is guarded but not fully rebuilt in v1.
- Deep CSS editing is deferred.

### Execution Notes

- Implement tasks in order.
- Each task should be committed before moving to the next.
- Do not delete existing section builder behavior.
- Do not make `content.sections` the clone editor's source of truth.
- Keep legacy `content.rendered` and `content.sections` populated until downstream dealer consumers are updated for `content.modes`.
