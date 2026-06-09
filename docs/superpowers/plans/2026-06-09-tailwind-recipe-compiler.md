# Tailwind Recipe Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic first-pass compiler that turns captured OEM region style artifacts into Tailwind-backed structured section recipes, with Mitsubishi Outlander variant/colour picker as the pilot.

**Architecture:** Add small worker-side modules under `src/design` for extraction artifact types, style declaration normalization, Tailwind utility mapping, and recipe compilation. The first implementation is pure TypeScript and fixture-driven so it can be tested without a browser, then it can be wired into Clone Studio capture and visual QA in a following slice.

**Tech Stack:** TypeScript, Vitest, existing `src/design` section parser/mapper patterns, Tailwind-compatible class strings without adding a new runtime dependency in the first slice.

---

## File Structure

- Create `src/design/tailwind-recipe-types.ts`: shared extraction artifact, declaration, mapping, and recipe result types.
- Create `src/design/tailwind-style-normalizer.ts`: converts captured computed-style objects into allowlisted declarations.
- Create `src/design/tailwind-declaration-mapper.ts`: converts normalized declarations to Tailwind utility candidates and preserves unmapped declarations.
- Create `src/design/tailwind-recipe-compiler.ts`: converts an artifact into either a typed section recipe or a raw fallback with confidence metadata.
- Modify `src/design/index.ts`: export the new compiler modules.
- Create focused tests beside each module.

## Task 1: Add Shared Types

**Files:**
- Create: `src/design/tailwind-recipe-types.ts`
- Test: `src/design/tailwind-recipe-types.test.ts`

- [ ] **Step 1: Write the failing type guard test**

```ts
import { describe, expect, it } from 'vitest';
import { isTailwindRecipeArtifact } from './tailwind-recipe-types';

describe('tailwind recipe artifact types', () => {
  it('accepts a valid region artifact', () => {
    expect(isTailwindRecipeArtifact({
      oem_id: 'mitsubishi-au',
      model_slug: 'outlander',
      source_url: 'https://www.mitsubishi-motors.com.au/vehicles/outlander.html',
      region_id: 'outlander-variant-picker',
      viewport: { name: 'desktop', width: 1440, height: 1200 },
      root: {
        path: '0',
        tag: 'section',
        text: 'Make Your Mark. ES LS White',
        attributes: { class: 'range-selector' },
        computed_style: { display: 'grid', color: 'rgb(0, 0, 0)' },
        children: [],
      },
    })).toBe(true);
  });

  it('rejects invalid artifact input', () => {
    expect(isTailwindRecipeArtifact(null)).toBe(false);
    expect(isTailwindRecipeArtifact({ root: null })).toBe(false);
    expect(isTailwindRecipeArtifact({ root: { tag: 'section' } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run src/design/tailwind-recipe-types.test.ts`

Expected: fails because `tailwind-recipe-types.ts` does not exist.

- [ ] **Step 3: Add the shared types and guard**

```ts
export interface TailwindRecipeViewport {
  name: 'desktop' | 'tablet' | 'mobile' | string;
  width: number;
  height: number;
}

export interface TailwindRecipeNode {
  path: string;
  tag: string;
  text: string;
  attributes: Record<string, string>;
  computed_style: Record<string, string>;
  children: TailwindRecipeNode[];
}

export interface TailwindRecipeArtifact {
  oem_id: string;
  model_slug: string;
  source_url: string;
  region_id: string;
  viewport: TailwindRecipeViewport;
  root: TailwindRecipeNode;
}

export interface NormalizedStyleDeclaration {
  node_path: string;
  property: string;
  value: string;
}

export interface TailwindDeclarationMapping {
  node_path: string;
  property: string;
  value: string;
  classes: string[];
  confidence: number;
  unmapped: boolean;
}

export interface TailwindRecipeCompileResult {
  section_type: string;
  section: Record<string, any>;
  confidence: number;
  mappings: TailwindDeclarationMapping[];
  diagnostics: string[];
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNode(value: unknown): value is TailwindRecipeNode {
  if (!isRecord(value)) return false;
  return typeof value.path === 'string'
    && typeof value.tag === 'string'
    && typeof value.text === 'string'
    && isRecord(value.attributes)
    && isRecord(value.computed_style)
    && Array.isArray(value.children);
}

export function isTailwindRecipeArtifact(value: unknown): value is TailwindRecipeArtifact {
  if (!isRecord(value)) return false;
  if (!isRecord(value.viewport)) return false;
  return typeof value.oem_id === 'string'
    && typeof value.model_slug === 'string'
    && typeof value.source_url === 'string'
    && typeof value.region_id === 'string'
    && typeof value.viewport.name === 'string'
    && typeof value.viewport.width === 'number'
    && typeof value.viewport.height === 'number'
    && isNode(value.root);
}
```

- [ ] **Step 4: Verify the test passes**

Run: `pnpm exec vitest run src/design/tailwind-recipe-types.test.ts`

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/design/tailwind-recipe-types.ts src/design/tailwind-recipe-types.test.ts
git commit -m "feat(design): add Tailwind recipe artifact types"
```

## Task 2: Normalize Computed Styles

**Files:**
- Create: `src/design/tailwind-style-normalizer.ts`
- Test: `src/design/tailwind-style-normalizer.test.ts`

- [ ] **Step 1: Write the failing normalizer tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeRegionStyles } from './tailwind-style-normalizer';
import type { TailwindRecipeArtifact } from './tailwind-recipe-types';

const artifact: TailwindRecipeArtifact = {
  oem_id: 'mitsubishi-au',
  model_slug: 'outlander',
  source_url: 'https://example.test/outlander',
  region_id: 'variant-picker',
  viewport: { name: 'desktop', width: 1440, height: 1200 },
  root: {
    path: '0',
    tag: 'section',
    text: 'Make Your Mark.',
    attributes: { class: 'range-selector' },
    computed_style: {
      display: 'grid',
      color: 'rgb(0, 0, 0)',
      'font-size': '42px',
      'background-color': 'rgba(0, 0, 0, 0)',
      cursor: 'auto',
    },
    children: [{
      path: '0.0',
      tag: 'button',
      text: 'ES',
      attributes: { class: 'active' },
      computed_style: {
        display: 'block',
        'font-weight': '700',
        'text-align': 'center',
        opacity: '1',
      },
      children: [],
    }],
  },
};

describe('normalizeRegionStyles', () => {
  it('keeps only style properties useful for Tailwind recipe generation', () => {
    const declarations = normalizeRegionStyles(artifact);
    expect(declarations).toContainEqual({ node_path: '0', property: 'display', value: 'grid' });
    expect(declarations).toContainEqual({ node_path: '0', property: 'font-size', value: '42px' });
    expect(declarations).toContainEqual({ node_path: '0.0', property: 'font-weight', value: '700' });
    expect(declarations.some(d => d.property === 'cursor')).toBe(false);
  });

  it('skips transparent empty background colours', () => {
    const declarations = normalizeRegionStyles(artifact);
    expect(declarations.some(d => d.property === 'background-color')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run src/design/tailwind-style-normalizer.test.ts`

Expected: fails because the module does not exist.

- [ ] **Step 3: Implement the normalizer**

```ts
import type { NormalizedStyleDeclaration, TailwindRecipeArtifact, TailwindRecipeNode } from './tailwind-recipe-types';

const ALLOWED_PROPERTIES = new Set([
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'align-items', 'justify-content', 'justify-items', 'align-self', 'justify-self',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-align', 'text-transform', 'color',
  'background-color', 'background-image', 'background-size', 'background-position',
  'border', 'border-width', 'border-color', 'border-style', 'border-radius',
  'box-shadow', 'opacity', 'overflow', 'object-fit', 'object-position',
  'transform', 'visibility',
]);

function hasUsefulValue(property: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'normal' && property !== 'font-weight') return false;
  if (normalized === 'none' && property !== 'display') return false;
  if (property === 'background-color' && (normalized === 'rgba(0, 0, 0, 0)' || normalized === 'transparent')) return false;
  return true;
}

function visitNode(node: TailwindRecipeNode, declarations: NormalizedStyleDeclaration[]): void {
  for (const [property, value] of Object.entries(node.computed_style || {})) {
    const prop = property.trim().toLowerCase();
    const val = String(value ?? '').trim();
    if (ALLOWED_PROPERTIES.has(prop) && hasUsefulValue(prop, val)) {
      declarations.push({ node_path: node.path, property: prop, value: val });
    }
  }

  for (const child of node.children || []) visitNode(child, declarations);
}

export function normalizeRegionStyles(artifact: TailwindRecipeArtifact): NormalizedStyleDeclaration[] {
  const declarations: NormalizedStyleDeclaration[] = [];
  visitNode(artifact.root, declarations);
  return declarations;
}
```

- [ ] **Step 4: Verify the test passes**

Run: `pnpm exec vitest run src/design/tailwind-style-normalizer.test.ts`

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/design/tailwind-style-normalizer.ts src/design/tailwind-style-normalizer.test.ts
git commit -m "feat(design): normalize captured region styles"
```

## Task 3: Map Declarations to Tailwind Candidates

**Files:**
- Create: `src/design/tailwind-declaration-mapper.ts`
- Test: `src/design/tailwind-declaration-mapper.test.ts`

- [ ] **Step 1: Write the failing mapper tests**

```ts
import { describe, expect, it } from 'vitest';
import { mapDeclarationsToTailwind } from './tailwind-declaration-mapper';

describe('mapDeclarationsToTailwind', () => {
  it('maps common OEM declarations to Tailwind utilities', () => {
    const result = mapDeclarationsToTailwind([
      { node_path: '0', property: 'display', value: 'grid' },
      { node_path: '0', property: 'text-align', value: 'center' },
      { node_path: '0', property: 'font-weight', value: '700' },
      { node_path: '0', property: 'font-size', value: '42px' },
      { node_path: '0', property: 'color', value: 'rgb(0, 0, 0)' },
      { node_path: '0', property: 'background-color', value: 'rgb(237, 0, 0)' },
    ]);

    const classes = result.flatMap(r => r.classes);
    expect(classes).toContain('grid');
    expect(classes).toContain('text-center');
    expect(classes).toContain('font-bold');
    expect(classes).toContain('text-[42px]');
    expect(classes).toContain('text-[#000000]');
    expect(classes).toContain('bg-[#ed0000]');
  });

  it('preserves unmapped declarations', () => {
    const result = mapDeclarationsToTailwind([
      { node_path: '0', property: 'background-image', value: 'linear-gradient(red, blue)' },
    ]);

    expect(result[0]).toEqual({
      node_path: '0',
      property: 'background-image',
      value: 'linear-gradient(red, blue)',
      classes: [],
      confidence: 0,
      unmapped: true,
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run src/design/tailwind-declaration-mapper.test.ts`

Expected: fails because the module does not exist.

- [ ] **Step 3: Implement the mapper**

```ts
import type { NormalizedStyleDeclaration, TailwindDeclarationMapping } from './tailwind-recipe-types';

const DISPLAY: Record<string, string> = {
  block: 'block',
  'inline-block': 'inline-block',
  flex: 'flex',
  'inline-flex': 'inline-flex',
  grid: 'grid',
  none: 'hidden',
};

const TEXT_ALIGN: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
};

const FONT_WEIGHT: Record<string, string> = {
  '400': 'font-normal',
  normal: 'font-normal',
  '500': 'font-medium',
  '600': 'font-semibold',
  '700': 'font-bold',
  bold: 'font-bold',
  '800': 'font-extrabold',
  '900': 'font-black',
};

function rgbToHex(value: string): string | null {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

function arbitrary(prefix: string, value: string): string {
  return `${prefix}-[${value.replace(/\s+/g, '_')}]`;
}

function mapDeclaration(property: string, value: string): string[] {
  const normalized = value.trim().toLowerCase();

  if (property === 'display' && DISPLAY[normalized]) return [DISPLAY[normalized]];
  if (property === 'text-align' && TEXT_ALIGN[normalized]) return [TEXT_ALIGN[normalized]];
  if (property === 'font-weight' && FONT_WEIGHT[normalized]) return [FONT_WEIGHT[normalized]];
  if (property === 'font-size') return [arbitrary('text', value)];
  if (property === 'line-height') return [arbitrary('leading', value)];
  if (property === 'letter-spacing') return [arbitrary('tracking', value)];
  if (property === 'color') return [`text-[${rgbToHex(value) || value}]`];
  if (property === 'background-color') return [`bg-[${rgbToHex(value) || value}]`];
  if (property === 'border-radius') return [arbitrary('rounded', value)];
  if (property === 'gap') return [arbitrary('gap', value)];
  if (property.startsWith('padding')) return [arbitrary(property === 'padding' ? 'p' : `p-${property.split('-')[1]?.[0]}`, value)];
  if (property.startsWith('margin')) return [arbitrary(property === 'margin' ? 'm' : `m-${property.split('-')[1]?.[0]}`, value)];
  if (property === 'width') return [arbitrary('w', value)];
  if (property === 'height') return [arbitrary('h', value)];
  if (property === 'max-width') return [arbitrary('max-w', value)];
  if (property === 'min-height') return [arbitrary('min-h', value)];
  if (property === 'grid-template-columns') return [arbitrary('grid-cols', value)];
  if (property === 'object-fit') return normalized === 'cover' ? ['object-cover'] : normalized === 'contain' ? ['object-contain'] : [];
  return [];
}

export function mapDeclarationsToTailwind(declarations: NormalizedStyleDeclaration[]): TailwindDeclarationMapping[] {
  return declarations.map((declaration) => {
    const classes = mapDeclaration(declaration.property, declaration.value);
    return {
      ...declaration,
      classes,
      confidence: classes.length ? 0.8 : 0,
      unmapped: classes.length === 0,
    };
  });
}
```

- [ ] **Step 4: Verify the test passes**

Run: `pnpm exec vitest run src/design/tailwind-declaration-mapper.test.ts`

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/design/tailwind-declaration-mapper.ts src/design/tailwind-declaration-mapper.test.ts
git commit -m "feat(design): map captured styles to Tailwind classes"
```

## Task 4: Compile a Mitsubishi Variant Recipe

**Files:**
- Create: `src/design/tailwind-recipe-compiler.ts`
- Test: `src/design/tailwind-recipe-compiler.test.ts`

- [ ] **Step 1: Write the failing compiler tests**

```ts
import { describe, expect, it } from 'vitest';
import { compileTailwindRecipe } from './tailwind-recipe-compiler';
import type { TailwindRecipeArtifact } from './tailwind-recipe-types';

const outlanderArtifact: TailwindRecipeArtifact = {
  oem_id: 'mitsubishi-au',
  model_slug: 'outlander',
  source_url: 'https://www.mitsubishi-motors.com.au/vehicles/outlander.html',
  region_id: 'outlander-variant-picker',
  viewport: { name: 'desktop', width: 1440, height: 1200 },
  root: {
    path: '0',
    tag: 'section',
    text: 'PETROL RANGE Make Your Mark. ES LS Black Edition Aspire Exceed White Key Features Build your own',
    attributes: { class: 'range-selector colour-picker' },
    computed_style: { display: 'grid', color: 'rgb(0, 0, 0)', 'font-size': '20px' },
    children: [
      {
        path: '0.0',
        tag: 'button',
        text: 'ES',
        attributes: { class: 'tab active' },
        computed_style: { 'font-weight': '700', 'text-align': 'center' },
        children: [],
      },
      {
        path: '0.1',
        tag: 'button',
        text: 'White',
        attributes: { class: 'colour-swatch' },
        computed_style: { 'background-color': 'rgb(255, 255, 255)', 'border-radius': '9999px' },
        children: [],
      },
    ],
  },
};

describe('compileTailwindRecipe', () => {
  it('classifies the Mitsubishi Outlander range picker as variant-color-explorer', () => {
    const result = compileTailwindRecipe(outlanderArtifact);
    expect(result.section_type).toBe('variant-color-explorer');
    expect(result.section.type).toBe('variant-color-explorer');
    expect(result.section.oem_id).toBe('mitsubishi-au');
    expect(result.section.model_slug).toBe('outlander');
    expect(result.section.heading).toBe('Make Your Mark.');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('falls back to content-block for unknown regions', () => {
    const result = compileTailwindRecipe({
      ...outlanderArtifact,
      root: { ...outlanderArtifact.root, text: 'A plain paragraph about a vehicle', attributes: { class: 'copy' }, children: [] },
    });
    expect(result.section_type).toBe('content-block');
    expect(result.confidence).toBeLessThan(0.7);
    expect(result.diagnostics).toContain('No typed Tailwind recipe matched this region.');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run src/design/tailwind-recipe-compiler.test.ts`

Expected: fails because the module does not exist.

- [ ] **Step 3: Implement the compiler**

```ts
import { mapDeclarationsToTailwind } from './tailwind-declaration-mapper';
import { normalizeRegionStyles } from './tailwind-style-normalizer';
import type { TailwindRecipeArtifact, TailwindRecipeCompileResult } from './tailwind-recipe-types';

function hasVariantPickerSignals(artifact: TailwindRecipeArtifact): boolean {
  const text = artifact.root.text.toLowerCase();
  const classes = artifact.root.attributes.class?.toLowerCase() || '';
  return artifact.oem_id === 'mitsubishi-au'
    && /make your mark|key features|build your own/.test(text)
    && /range|colour|color|picker|selector/.test(`${text} ${classes}`);
}

function extractHeading(text: string): string {
  const match = text.match(/Make Your Mark\./i);
  return match ? match[0] : 'Make Your Mark.';
}

export function compileTailwindRecipe(artifact: TailwindRecipeArtifact): TailwindRecipeCompileResult {
  const declarations = normalizeRegionStyles(artifact);
  const mappings = mapDeclarationsToTailwind(declarations);
  const mappedCount = mappings.filter((m) => !m.unmapped).length;
  const mappingConfidence = mappings.length ? mappedCount / mappings.length : 0;

  if (hasVariantPickerSignals(artifact)) {
    return {
      section_type: 'variant-color-explorer',
      section: {
        type: 'variant-color-explorer',
        oem_id: artifact.oem_id,
        model_slug: artifact.model_slug,
        data_source: 'database',
        eyebrow: 'PETROL RANGE',
        heading: extractHeading(artifact.root.text),
        cta_text: 'Build your own',
        cta_url: '',
        _tailwind_recipe: {
          source_url: artifact.source_url,
          region_id: artifact.region_id,
          viewport: artifact.viewport,
          class_hints: mappings.flatMap((m) => m.classes),
        },
      },
      confidence: Math.max(0.7, Math.min(0.95, 0.7 + mappingConfidence * 0.2)),
      mappings,
      diagnostics: [],
    };
  }

  return {
    section_type: 'content-block',
    section: {
      type: 'content-block',
      title: '',
      content_html: `<p>${artifact.root.text}</p>`,
      _tailwind_recipe: {
        source_url: artifact.source_url,
        region_id: artifact.region_id,
        viewport: artifact.viewport,
        class_hints: mappings.flatMap((m) => m.classes),
      },
    },
    confidence: Math.min(0.5, mappingConfidence),
    mappings,
    diagnostics: ['No typed Tailwind recipe matched this region.'],
  };
}
```

- [ ] **Step 4: Verify the compiler test passes**

Run: `pnpm exec vitest run src/design/tailwind-recipe-compiler.test.ts`

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/design/tailwind-recipe-compiler.ts src/design/tailwind-recipe-compiler.test.ts
git commit -m "feat(design): compile Tailwind region recipes"
```

## Task 5: Export Modules and Run Verification

**Files:**
- Modify: `src/design/index.ts`

- [ ] **Step 1: Add exports**

Append these exports to `src/design/index.ts`:

```ts
export * from './tailwind-recipe-types';
export * from './tailwind-style-normalizer';
export * from './tailwind-declaration-mapper';
export * from './tailwind-recipe-compiler';
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm exec vitest run \
  src/design/tailwind-recipe-types.test.ts \
  src/design/tailwind-style-normalizer.test.ts \
  src/design/tailwind-declaration-mapper.test.ts \
  src/design/tailwind-recipe-compiler.test.ts
```

Expected: all four test files pass.

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`

Expected: TypeScript completes without errors.

- [ ] **Step 4: Commit**

```bash
git add src/design/index.ts
git commit -m "feat(design): export Tailwind recipe compiler"
```

## Task 6: Record Pilot Follow-Up

**Files:**
- Modify: `docs/superpowers/HANDOFF-2026-06-09-tailwind-recipe-compiler.md`

- [ ] **Step 1: Create a handoff after implementation**

Create the handoff with this content:

```md
# Tailwind Recipe Compiler Handoff

## Shipped

- Added Tailwind recipe artifact types.
- Added computed-style normalization with an allowlist.
- Added deterministic CSS declaration to Tailwind candidate mapping.
- Added first-pass recipe compiler that recognizes the Mitsubishi Outlander variant/colour picker and emits a `variant-color-explorer` section draft.

## Verification

- Focused Vitest tests passed for recipe types, style normalization, declaration mapping, and compiler output.
- `pnpm run typecheck` passed.

## Next Slice

- Wire Clone Studio selected-region capture to produce `TailwindRecipeArtifact`.
- Add persisted draft recipe preview in the dashboard.
- Add Playwright visual QA comparing the generated Mitsubishi pilot section against the OEM reference at desktop, tablet, and mobile.
- Evaluate `css-to-tailwindcss` as a mapper enhancement once the internal mapper shape is stable.
```

- [ ] **Step 2: Commit the handoff**

```bash
git add docs/superpowers/HANDOFF-2026-06-09-tailwind-recipe-compiler.md
git commit -m "docs: add Tailwind recipe compiler handoff"
```

---

## Self-Review

- The plan covers the spec's compiler foundation: artifact shape, style normalization, Tailwind mapping, recipe output, and verification.
- It intentionally does not wire Clone Studio UI in the first implementation slice because the compiler should be proven with pure tests first.
- The Mitsubishi pilot is represented by a concrete Outlander range-picker fixture and expected `variant-color-explorer` output.
- No raw OEM stylesheet injection, iframe rendering, or unchecked AI output is introduced.
