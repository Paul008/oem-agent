# CMS Catalog Generator (Block-Composition Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every toyota-theme-nuxt CMS section preset with its canonical demo props into (a) a human style-guide page at `/style-guide` and (b) `catalog/catalog.json` + per-preset exemplar screenshots — the AI matching menu for the Slice 2 composer.

**Architecture:** Two pure utility modules (`cmsCatalog.ts`, `cmsStyleGuide.ts`) hold all logic and are tested with `node:test` via tsx. A thin Nuxt page consumes `cmsStyleGuide`; two thin CLI scripts consume `cmsCatalog` and puppeteer-core (system Chrome, no browser download) to emit `catalog/catalog.json` and `catalog/screenshots/<preset-id>.png`. Everything reuses the production renderer `renderCmsPageBuilderDocumentToHtml`, so exemplars are pixel-identical to published CMS blocks.

**Tech Stack:** Nuxt 4.2 (app/ srcDir), TypeScript, node:test + tsx, puppeteer-core + system Chrome, SCSS (`main.scss` global `.platform-content .cms-section` styles).

## Global Constraints

- **Working repo:** `/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt` (NOT oem-agent). All paths below are relative to that root unless absolute.
- **Branch:** all work on `feat/cms-catalog-slice1`, branched from `main`. Never commit to main directly.
- **Baseline:** the branch starts from checkpoint commit `d88a45a` (`wip: toyota cms page builder…`), which committed 155 files of pre-existing session work so this slice is self-contained. The tree is clean at task start. Still `git add` explicit paths — never `git add -A` or `git add .`.
- **Additive only** (spec decision 1): do not modify `app/types/cmsPageBuilder.ts`, `app/utils/cmsPageBuilder.ts`, `app/utils/cmsPageBuilderPresets.ts`, or `server/utils/cmsPages.ts`. New files + `package.json` script/devDep additions only.
- **Test command convention:** `npx tsx --test test/<file>.test.ts` (node:test runner; the repo has no `npm test` script — do not add one).
- **Catalog contract (consumed by Slice 2 composer in oem-agent):** `catalog/catalog.json` with entries `{id, type, categoryId, categoryLabel, name, description, propSchema, demoProps, screenshotPath}`; screenshots at `catalog/screenshots/<preset-id>.png`, path recorded relative to `catalog/`.
- There are currently **15 presets** in `CMS_PAGE_SECTION_PRESETS` covering 11 of 12 section types (`legacy_html` deliberately has no preset — it is the interim clone-fragment carrier, not a matchable block). Never hardcode the count 15 in implementation code; tests may derive it from the registry.
- Commit messages follow repo style (`feat: …`, `fix: …`, lower-case, imperative) and end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 0: Branch setup — DONE (controller)

- [x] Branch `feat/cms-catalog-slice1` created from `main`.
- [x] Pre-existing 155-file WIP (Toyota CMS page builder session work) checkpoint-committed as `d88a45a` per Paul's decision 2026-07-05. Working tree clean.

---

### Task 1: Catalog builder module (`cmsCatalog.ts`)

**Files:**
- Create: `app/utils/cmsCatalog.ts`
- Test: `test/cms-catalog.test.ts`

**Interfaces:**
- Consumes: `CMS_PAGE_SECTION_PRESETS`, `CMS_PAGE_SECTION_CATEGORIES` from `app/utils/cmsPageBuilderPresets.ts`; types from `app/types/cmsPageBuilder.ts`.
- Produces (used by Task 4 CLI and Slice 2):
  - `derivePropSchema(props: Record<string, any>): CmsCatalogPropSchema`
  - `buildCmsCatalog(): CmsCatalog` where `CmsCatalog = { version: 1; oem: 'toyota'; presetCount: number; categories: Array<{id, label, description}>; presets: CmsCatalogEntry[] }` and `CmsCatalogEntry = { id: string; type: CmsPageSectionType; categoryId: CmsPageSectionCategoryId; categoryLabel: string; name: string; description: string; propSchema: CmsCatalogPropSchema; demoProps: Record<string, any>; screenshotPath: string }`
  - `CmsCatalogPropSchemaValue = { type: 'string' | 'number' | 'boolean' } | { type: 'array'; item: CmsCatalogPropSchema }`

- [ ] **Step 1: Write the failing test**

Create `test/cms-catalog.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCmsCatalog, derivePropSchema } from '../app/utils/cmsCatalog';
import { CMS_PAGE_SECTION_PRESETS } from '../app/utils/cmsPageBuilderPresets';

test('derives scalar prop schemas from demo values', () => {
  assert.deepEqual(
    derivePropSchema({ heading: 'Hello', columns: 4, featured: true }),
    {
      heading: { type: 'string' },
      columns: { type: 'number' },
      featured: { type: 'boolean' },
    },
  );
});

test('derives array item schemas as the union of item keys', () => {
  const schema = derivePropSchema({
    items: [
      { title: 'One', href: '/a' },
      { title: 'Two', imageUrl: '/img.jpg' },
    ],
  });
  assert.deepEqual(schema, {
    items: {
      type: 'array',
      item: {
        title: { type: 'string' },
        href: { type: 'string' },
        imageUrl: { type: 'string' },
      },
    },
  });
});

test('ignores null, undefined, and nested-object demo values', () => {
  assert.deepEqual(
    derivePropSchema({ heading: 'Hi', empty: null, missing: undefined, nested: { a: 1 } }),
    { heading: { type: 'string' } },
  );
});

test('builds one catalog entry per preset with stable contract fields', () => {
  const catalog = buildCmsCatalog();
  assert.equal(catalog.version, 1);
  assert.equal(catalog.oem, 'toyota');
  assert.equal(catalog.presets.length, CMS_PAGE_SECTION_PRESETS.length);
  assert.equal(catalog.presetCount, CMS_PAGE_SECTION_PRESETS.length);

  for (const preset of CMS_PAGE_SECTION_PRESETS) {
    const entry = catalog.presets.find((candidate) => candidate.id === preset.id);
    assert.ok(entry, `catalog entry missing for ${preset.id}`);
    assert.equal(entry.type, preset.type);
    assert.equal(entry.categoryId, preset.categoryId);
    assert.equal(entry.name, preset.name);
    assert.equal(entry.screenshotPath, `screenshots/${preset.id}.png`);
    assert.deepEqual(entry.demoProps, preset.props);
    assert.ok(Object.keys(entry.propSchema).length > 0, `empty prop schema for ${preset.id}`);
    assert.ok(entry.categoryLabel.length > 0, `empty category label for ${preset.id}`);
  }
});

test('demoProps are deep copies, not references into the preset registry', () => {
  const catalog = buildCmsCatalog();
  const hero = catalog.presets.find((entry) => entry.id === 'hero-standard');
  assert.ok(hero);
  hero.demoProps.heading = 'MUTATED';
  const heroPreset = CMS_PAGE_SECTION_PRESETS.find((preset) => preset.id === 'hero-standard');
  assert.ok(heroPreset);
  assert.notEqual(heroPreset.props.heading, 'MUTATED');
});

test('feature grid schema captures items array with nested keys', () => {
  const catalog = buildCmsCatalog();
  const idealCards = catalog.presets.find((entry) => entry.id === 'toyota-ideal-cards');
  assert.ok(idealCards);
  assert.deepEqual(idealCards.propSchema.items, {
    type: 'array',
    item: {
      title: { type: 'string' },
      body: { type: 'string' },
      imageUrl: { type: 'string' },
      imageAlt: { type: 'string' },
      href: { type: 'string' },
      buttonLabel: { type: 'string' },
    },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && npx tsx --test test/cms-catalog.test.ts`
Expected: FAIL — cannot find module `../app/utils/cmsCatalog`.

- [ ] **Step 3: Write the implementation**

Create `app/utils/cmsCatalog.ts`:

```ts
import type {
  CmsPageSectionCategoryId,
  CmsPageSectionType,
} from '../types/cmsPageBuilder';
import {
  CMS_PAGE_SECTION_CATEGORIES,
  CMS_PAGE_SECTION_PRESETS,
} from './cmsPageBuilderPresets';

export type CmsCatalogPropSchema = Record<string, CmsCatalogPropSchemaValue>;

export type CmsCatalogPropSchemaValue =
  | { type: 'string' | 'number' | 'boolean' }
  | { type: 'array'; item: CmsCatalogPropSchema };

export type CmsCatalogEntry = {
  id: string;
  type: CmsPageSectionType;
  categoryId: CmsPageSectionCategoryId;
  categoryLabel: string;
  name: string;
  description: string;
  propSchema: CmsCatalogPropSchema;
  demoProps: Record<string, any>;
  screenshotPath: string;
};

export type CmsCatalog = {
  version: 1;
  oem: 'toyota';
  presetCount: number;
  categories: Array<{ id: CmsPageSectionCategoryId; label: string; description: string }>;
  presets: CmsCatalogEntry[];
};

export function derivePropSchema(props: Record<string, any>): CmsCatalogPropSchema {
  const schema: CmsCatalogPropSchema = {};
  for (const [key, value] of Object.entries(props)) {
    const derived = deriveValueSchema(value);
    if (derived) schema[key] = derived;
  }
  return schema;
}

function deriveValueSchema(value: unknown): CmsCatalogPropSchemaValue | null {
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'number' && Number.isFinite(value)) return { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (Array.isArray(value)) {
    const item: CmsCatalogPropSchema = {};
    for (const element of value) {
      if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
      for (const [key, elementValue] of Object.entries(element)) {
        if (key in item) continue;
        const derived = deriveValueSchema(elementValue);
        if (derived) item[key] = derived;
      }
    }
    return { type: 'array', item };
  }
  return null;
}

export function buildCmsCatalog(): CmsCatalog {
  return {
    version: 1,
    oem: 'toyota',
    presetCount: CMS_PAGE_SECTION_PRESETS.length,
    categories: CMS_PAGE_SECTION_CATEGORIES.map((category) => ({ ...category })),
    presets: CMS_PAGE_SECTION_PRESETS.map((preset) => ({
      id: preset.id,
      type: preset.type,
      categoryId: preset.categoryId,
      categoryLabel: categoryLabel(preset.categoryId),
      name: preset.name,
      description: preset.description,
      propSchema: derivePropSchema(preset.props),
      demoProps: JSON.parse(JSON.stringify(preset.props)),
      screenshotPath: `screenshots/${preset.id}.png`,
    })),
  };
}

function categoryLabel(id: CmsPageSectionCategoryId): string {
  return CMS_PAGE_SECTION_CATEGORIES.find((category) => category.id === id)?.label || id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && npx tsx --test test/cms-catalog.test.ts`
Expected: 6 tests, all PASS.

- [ ] **Step 5: Run the existing builder suite to prove no regression**

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && npx tsx --test test/cms-page-builder.test.ts`
Expected: 18 tests, all PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt
git add app/utils/cmsCatalog.ts test/cms-catalog.test.ts
git commit -m "feat: cms catalog builder — preset prop schemas + matching-menu entries

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Style-guide blocks module (`cmsStyleGuide.ts`)

**Files:**
- Create: `app/utils/cmsStyleGuide.ts`
- Test: `test/cms-style-guide.test.ts`

**Interfaces:**
- Consumes: `renderCmsPageBuilderDocumentToHtml`, `createCmsPageBuilderDocument`, `createCmsPageSection` from `app/utils/cmsPageBuilder.ts`; preset/category registries from `app/utils/cmsPageBuilderPresets.ts`.
- Produces (used by Task 3 page):
  - `buildStyleGuideGroups(): CmsStyleGuideGroup[]` where `CmsStyleGuideGroup = { categoryId: CmsPageSectionCategoryId; categoryLabel: string; categoryDescription: string; blocks: CmsStyleGuideBlock[] }` and `CmsStyleGuideBlock = { presetId: string; name: string; description: string; type: string; html: string }`.

- [ ] **Step 1: Write the failing test**

Create `test/cms-style-guide.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStyleGuideGroups } from '../app/utils/cmsStyleGuide';
import {
  CMS_PAGE_SECTION_CATEGORIES,
  CMS_PAGE_SECTION_PRESETS,
} from '../app/utils/cmsPageBuilderPresets';

test('style guide covers every preset exactly once', () => {
  const groups = buildStyleGuideGroups();
  const ids = groups.flatMap((group) => group.blocks.map((block) => block.presetId));
  assert.deepEqual(
    [...ids].sort(),
    CMS_PAGE_SECTION_PRESETS.map((preset) => preset.id).sort(),
  );
  assert.equal(new Set(ids).size, ids.length);
});

test('every style guide block renders real cms-section markup', () => {
  for (const group of buildStyleGuideGroups()) {
    for (const block of group.blocks) {
      assert.ok(
        block.html.includes('cms-section'),
        `${block.presetId} did not render a cms-section`,
      );
    }
  }
});

test('groups follow the category registry order and skip empty categories', () => {
  const groups = buildStyleGuideGroups();
  const groupOrder = groups.map((group) => group.categoryId);
  const expectedOrder = CMS_PAGE_SECTION_CATEGORIES
    .map((category) => category.id)
    .filter((id) => groupOrder.includes(id));
  assert.deepEqual(groupOrder, expectedOrder);
  for (const group of groups) {
    assert.ok(group.blocks.length > 0, `${group.categoryId} group is empty`);
    assert.ok(group.categoryLabel.length > 0);
  }
});

test('rendering does not mutate the preset registry', () => {
  const before = JSON.stringify(CMS_PAGE_SECTION_PRESETS);
  buildStyleGuideGroups();
  assert.equal(JSON.stringify(CMS_PAGE_SECTION_PRESETS), before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && npx tsx --test test/cms-style-guide.test.ts`
Expected: FAIL — cannot find module `../app/utils/cmsStyleGuide`.

- [ ] **Step 3: Write the implementation**

Create `app/utils/cmsStyleGuide.ts`:

```ts
import type {
  CmsPageSectionCategoryId,
  CmsPageSectionPreset,
} from '../types/cmsPageBuilder';
import {
  createCmsPageBuilderDocument,
  createCmsPageSection,
  renderCmsPageBuilderDocumentToHtml,
} from './cmsPageBuilder';
import {
  CMS_PAGE_SECTION_CATEGORIES,
  CMS_PAGE_SECTION_PRESETS,
} from './cmsPageBuilderPresets';

export type CmsStyleGuideBlock = {
  presetId: string;
  name: string;
  description: string;
  type: string;
  html: string;
};

export type CmsStyleGuideGroup = {
  categoryId: CmsPageSectionCategoryId;
  categoryLabel: string;
  categoryDescription: string;
  blocks: CmsStyleGuideBlock[];
};

export function buildStyleGuideGroups(): CmsStyleGuideGroup[] {
  return CMS_PAGE_SECTION_CATEGORIES
    .map((category) => ({
      categoryId: category.id,
      categoryLabel: category.label,
      categoryDescription: category.description,
      blocks: CMS_PAGE_SECTION_PRESETS
        .filter((preset) => preset.categoryId === category.id)
        .map((preset) => ({
          presetId: preset.id,
          name: preset.name,
          description: preset.description,
          type: preset.type,
          html: renderPresetHtml(preset),
        })),
    }))
    .filter((group) => group.blocks.length > 0);
}

function renderPresetHtml(preset: CmsPageSectionPreset): string {
  const section = createCmsPageSection(preset.type, {
    label: preset.name,
    props: JSON.parse(JSON.stringify(preset.props)),
    settings: JSON.parse(JSON.stringify(preset.settings || {})),
  });
  return renderCmsPageBuilderDocumentToHtml(
    createCmsPageBuilderDocument({ sections: [section] }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && npx tsx --test test/cms-style-guide.test.ts`
Expected: 4 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt
git add app/utils/cmsStyleGuide.ts test/cms-style-guide.test.ts
git commit -m "feat: style-guide block builder — every preset rendered via production renderer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `/style-guide` page

**Files:**
- Create: `app/pages/style-guide.vue`

**Interfaces:**
- Consumes: `buildStyleGuideGroups()` from Task 2.
- Produces: SSR page at `/style-guide`; each block canvas carries `data-catalog-block="<preset-id>"` (Task 5's screenshot selector). Block meta (name/id/type) sits OUTSIDE the canvas so screenshots contain only the block visual.

**Background for the implementer:** the public CMS renderer (`app/pages/[slug].vue`) wraps rendered HTML in `<article class="toyota-article"><div class="article-inner article-inner--cms-layout"><div class="article-content platform-content" v-html=…>`. The global styles in `app/assets/styles/main.scss` (line ~972) scope all CMS block styling under `.platform-content .cms-section`, so the canvas div MUST have class `platform-content`. A static page file beats the `[slug].vue` catch-all in Nuxt routing, so `/style-guide` will not collide with CMS slugs.

- [ ] **Step 1: Create the page**

Create `app/pages/style-guide.vue`:

```vue
<template>
  <article class="toyota-article style-guide">
    <div class="article-inner article-inner--cms-layout">
      <header class="style-guide__header">
        <h1 class="article-title">Toyota CMS Style Guide</h1>
        <p>
          Every CMS builder preset rendered with its canonical demo content.
          This page is the human style guide and the exemplar source for the
          block-composition catalog (catalog/catalog.json).
        </p>
      </header>

      <section
        v-for="group in groups"
        :key="group.categoryId"
        class="style-guide__category"
      >
        <h2 class="style-guide__category-title">{{ group.categoryLabel }}</h2>
        <p class="style-guide__category-description">{{ group.categoryDescription }}</p>

        <div
          v-for="block in group.blocks"
          :key="block.presetId"
          class="style-guide__block"
        >
          <div class="style-guide__block-meta">
            <h3>{{ block.name }}</h3>
            <p>
              <code>{{ block.presetId }}</code> · type <code>{{ block.type }}</code>
              — {{ block.description }}
            </p>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -- trusted HTML from our own production renderer -->
          <div
            class="article-content platform-content style-guide__block-canvas"
            :data-catalog-block="block.presetId"
            v-html="block.html"
          ></div>
        </div>
      </section>
    </div>
  </article>
</template>

<script setup lang="ts">
import { buildStyleGuideGroups } from '~/utils/cmsStyleGuide';

const groups = buildStyleGuideGroups();

useSeoMeta({
  title: 'Toyota CMS Style Guide',
  robots: 'noindex, nofollow',
});
</script>

<style scoped lang="scss">
.style-guide__header {
  margin: 0 0 48px;

  p {
    max-width: 720px;
  }
}

.style-guide__category {
  margin: 0 0 64px;
}

.style-guide__category-title {
  margin: 0 0 8px;
}

.style-guide__category-description {
  margin: 0 0 32px;
  color: #4b5563;
}

.style-guide__block {
  margin: 0 0 48px;
}

.style-guide__block-meta {
  margin: 0 0 16px;
  padding: 12px 16px;
  border-left: 4px solid #eb0a1e;
  background: #f7f7f7;

  h3 {
    margin: 0 0 4px;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: #4b5563;
  }

  code {
    font-size: 13px;
    background: #ececec;
    padding: 1px 5px;
    border-radius: 3px;
  }
}

.style-guide__block-canvas {
  border: 1px dashed #d1d5db;
  background: #ffffff;
}
</style>
```

Note: `#eb0a1e` is the Toyota brand red already used by the theme; if `uno.config.ts` still carries the half-migrated Hyundai hex alongside it, that is a known condition the catalog is meant to surface — do not fix tokens in this slice.

- [ ] **Step 2: Verify SSR output includes every preset block**

Start the dev server in the background, then curl the page:

```bash
cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt
npm run dev   # run in background; wait for "Local: http://localhost:3000"
```

Then:

```bash
curl -s http://localhost:3000/style-guide | grep -o 'data-catalog-block="[^"]*"' | sort
```

Expected: one line per preset — all 15 current ids (`cta-band-contact`, `feature-grid-help`, `form-enquiry`, `hero-standard`, `image-text-standard`, `map-location-werribee`, `offers-grid-standard`, `reviews-standard`, `rich-text-standard`, `toyota-electrified-explainer`, `toyota-explore-more`, `toyota-ideal-cards`, `toyota-service-benefits`, `vehicle-search-standard`, `video-grid-standard`), each exactly once. Also verify `cms-section` markup is present: `curl -s http://localhost:3000/style-guide | grep -c 'cms-section--'` returns a number ≥ 15. Keep the dev server running if proceeding straight to Task 5; otherwise stop it.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt
git add app/pages/style-guide.vue
git commit -m "feat: /style-guide — human OEM style guide page rendering all cms presets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `catalog:build` CLI (writes catalog/catalog.json)

**Files:**
- Create: `scripts/generate-cms-catalog.ts`
- Modify: `package.json` (add `"catalog:build"` to `scripts` — do not touch anything else in the file)
- Create (generated output, committed): `catalog/catalog.json`

**Interfaces:**
- Consumes: `buildCmsCatalog()` from Task 1.
- Produces: `catalog/catalog.json` (pretty-printed, trailing newline) and empty `catalog/screenshots/` directory. Slice 2's composer reads this file from disk.

- [ ] **Step 1: Write the CLI**

Create `scripts/generate-cms-catalog.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCmsCatalog } from '../app/utils/cmsCatalog';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'catalog');
const outFile = join(outDir, 'catalog.json');

const catalog = buildCmsCatalog();
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${catalog.presets.length} presets to ${outFile}`);
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, after `"typecheck"`, add:

```json
"catalog:build": "tsx scripts/generate-cms-catalog.ts",
```

(Adjust comma placement to keep valid JSON; change nothing else.)

- [ ] **Step 3: Run it and verify output**

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && npm run catalog:build`
Expected: `Wrote 15 presets to …/catalog/catalog.json`.

Then verify content:

```bash
node -e "const c=require('/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt/catalog/catalog.json'); console.log(c.version, c.oem, c.presets.length, c.presets.every(p=>p.id&&p.type&&p.categoryId&&p.propSchema&&p.demoProps&&p.screenshotPath))"
```

Expected: `1 toyota 15 true`.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt
git add scripts/generate-cms-catalog.ts package.json catalog/catalog.json
git commit -m "feat: catalog:build — emit block-composition matching menu (catalog.json)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `catalog:capture` CLI (exemplar screenshots via system Chrome)

**Files:**
- Create: `scripts/capture-cms-catalog.ts`
- Modify: `package.json` (add devDep `puppeteer-core` + `"catalog:capture"` script)
- Create (generated output, committed): `catalog/screenshots/<preset-id>.png` × 15

**Interfaces:**
- Consumes: `catalog/catalog.json` (Task 4), running dev server serving `/style-guide` (Task 3), `[data-catalog-block]` selectors.
- Produces: one PNG per preset at exactly the `screenshotPath` recorded in catalog.json. Exits non-zero if any block is missing or any PNG is under 1 KB.

**Background:** `puppeteer-core` downloads no browser; we resolve a system Chrome/Chromium/Edge executable — the same approach as oem-agent `scripts/lib/qa-browser.mjs` (spec decision 4). Viewport 1280×900, deviceScaleFactor 1.

- [ ] **Step 1: Install puppeteer-core**

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && npm install --save-dev puppeteer-core`
Expected: success, no browser download.

- [ ] **Step 2: Write the CLI**

Create `scripts/capture-cms-catalog.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogFile = join(repoRoot, 'catalog', 'catalog.json');
const screenshotsDir = join(repoRoot, 'catalog', 'screenshots');

function argValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

// Same system-browser resolution approach as oem-agent scripts/lib/qa-browser.mjs.
function resolveBrowserExecutable(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH || '',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error('No Chrome/Chromium/Edge found; set PUPPETEER_EXECUTABLE_PATH');
  }
  return match;
}

async function main() {
  const baseUrl = argValue('--base-url') || 'http://localhost:3000';
  const catalog = JSON.parse(readFileSync(catalogFile, 'utf8')) as {
    presets: Array<{ id: string; screenshotPath: string }>;
  };
  mkdirSync(screenshotsDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveBrowserExecutable(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/style-guide`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((image) => !image.complete)
          .map((image) => new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          })),
      );
    });

    const failures: string[] = [];
    for (const preset of catalog.presets) {
      const handle = await page.$(`[data-catalog-block="${preset.id}"]`);
      if (!handle) {
        failures.push(`${preset.id}: block not found on /style-guide`);
        continue;
      }
      const outPath = join(screenshotsDir, `${preset.id}.png`);
      await handle.screenshot({ path: outPath as `${string}.png` });
      const size = statSync(outPath).size;
      if (size < 1024) failures.push(`${preset.id}: screenshot suspiciously small (${size} bytes)`);
      console.log(`captured ${preset.id} (${size} bytes)`);
    }

    if (failures.length) {
      console.error(`\n${failures.length} capture failure(s):\n${failures.join('\n')}`);
      process.exitCode = 1;
    } else {
      console.log(`\nCaptured ${catalog.presets.length}/${catalog.presets.length} exemplar screenshots.`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script**

In `package.json` `scripts`, after `"catalog:build"`, add:

```json
"catalog:capture": "tsx scripts/capture-cms-catalog.ts",
```

- [ ] **Step 4: Run capture against the dev server**

Ensure the dev server from Task 3 is running (restart with `npm run dev` in background if not; wait for it to be ready). Then:

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && npm run catalog:capture`
Expected: 15 `captured <id> (<n> bytes)` lines, then `Captured 15/15 exemplar screenshots.`, exit code 0.

Verify files:

```bash
ls /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt/catalog/screenshots/ | wc -l   # expect 15
```

Visually spot-check at least `hero-standard.png` and `toyota-ideal-cards.png` (Read the PNG files): the hero must show heading text over/beside the SUV image; ideal-cards must show 4 category cards with images. If blocks render unstyled (raw HTML, no Toyota styling), the `platform-content` wrapper is broken — STOP and fix Task 3 before committing.

- [ ] **Step 5: Stop the dev server, then commit**

```bash
cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt
git add scripts/capture-cms-catalog.ts package.json package-lock.json catalog/screenshots
git commit -m "feat: catalog:capture — exemplar screenshots for every cms preset

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Catalog README + spec status update

**Files:**
- Create: `catalog/README.md` (toyota-theme-nuxt)
- Modify: `/Users/paulgiurin/Documents/Projects/oem-agent/docs/superpowers/specs/2026-07-05-block-composition-addendum.md` (status line only)

- [ ] **Step 1: Write catalog/README.md**

```markdown
# CMS Block-Composition Catalog

Machine-readable matching menu for the oem-agent block composer (Slice 2), plus
the exemplar screenshots behind the human style guide at `/style-guide`.

- `catalog.json` — one entry per `CMS_PAGE_SECTION_PRESETS` preset:
  `{id, type, categoryId, categoryLabel, name, description, propSchema, demoProps, screenshotPath}`.
- `screenshots/<preset-id>.png` — the preset rendered at 1280px with its
  canonical demo props, captured from `/style-guide`.

## Regenerating (whenever presets change)

```bash
npm run catalog:build              # rewrite catalog.json
npm run dev                        # in another terminal, wait until ready
npm run catalog:capture            # rewrite screenshots (uses system Chrome)
```

`catalog:capture` accepts `--base-url http://localhost:<port>` and honours
`PUPPETEER_EXECUTABLE_PATH`. Commit regenerated artifacts together with the
preset change.
```

- [ ] **Step 2: Commit in toyota-theme-nuxt**

```bash
cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt
git add catalog/README.md
git commit -m "docs: catalog regeneration guide

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Update the addendum spec status in oem-agent**

In `/Users/paulgiurin/Documents/Projects/oem-agent/docs/superpowers/specs/2026-07-05-block-composition-addendum.md`, change the status line:

from

```markdown
**Date:** 2026-07-05 · **Status:** Approved direction; proof experiment pending
```

to

```markdown
**Date:** 2026-07-05 · **Status:** Approved direction; Slice 1 (catalog generator) shipped in toyota-theme-nuxt branch feat/cms-catalog-slice1; proof experiment pending Slice 2
```

- [ ] **Step 4: Commit in oem-agent**

```bash
cd /Users/paulgiurin/Documents/Projects/oem-agent
git add docs/superpowers/specs/2026-07-05-block-composition-addendum.md
git commit -m "docs(spec): mark block-composition slice 1 shipped

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification sweep

- [ ] **Step 1: Run all three CMS test files**

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && npx tsx --test test/cms-page-builder.test.ts test/cms-catalog.test.ts test/cms-style-guide.test.ts`
Expected: 28 tests (18 + 6 + 4), all PASS.

- [ ] **Step 2: Confirm nothing unintended is staged or dirty**

Run: `cd /Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt && git status --short`
Expected: empty (clean tree).

- [ ] **Step 3: Confirm branch log**

Run: `git log --oneline main..feat/cms-catalog-slice1`
Expected: 7 commits (wip checkpoint `d88a45a` + Tasks 1–6 toyota side).
