# Recipe-Based Component Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recipe layer to the page builder that maps OEM-specific design patterns to existing section types with brand-appropriate defaults.

**Architecture:** New `brand_recipes` + `default_recipes` tables store pattern/variant/OEM combinations. A new API endpoint serves recipes. The dashboard section picker groups by pattern and pre-fills sections from recipe defaults. Existing renderers are untouched.

**Tech Stack:** Supabase (Postgres), Cloudflare Workers (Hono), Vue 3 dashboard (Vite), Node seed scripts.

---

### Task 1: Database Migration — Recipe Tables

**Files:**
- Create: `supabase/migrations/20260327_brand_recipes.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260327_brand_recipes.sql

-- ============================================================================
-- brand_recipes: OEM-specific section recipes
-- ============================================================================

CREATE TABLE brand_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  variant TEXT NOT NULL,
  label TEXT NOT NULL,
  resolves_to TEXT NOT NULL,
  defaults_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, pattern, variant)
);

ALTER TABLE brand_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_recipes_service_role_policy ON brand_recipes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_brand_recipes_oem ON brand_recipes(oem_id) WHERE is_active = true;

-- ============================================================================
-- default_recipes: fallback recipes when OEM doesn't have a specific one
-- ============================================================================

CREATE TABLE default_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern TEXT NOT NULL,
  variant TEXT NOT NULL,
  label TEXT NOT NULL,
  resolves_to TEXT NOT NULL,
  defaults_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(pattern, variant)
);

ALTER TABLE default_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY default_recipes_service_role_policy ON default_recipes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 2: Push the migration**

Run: `npx supabase db push`
Expected: Migration applies successfully, both tables created.

- [ ] **Step 3: Verify tables exist**

Run: `npx supabase db push --dry-run` (should show no pending migrations)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260327_brand_recipes.sql
git commit -m "feat: add brand_recipes and default_recipes tables"
```

---

### Task 2: Seed Default Recipes

**Files:**
- Create: `dashboard/scripts/seed-default-recipes.mjs`

- [ ] **Step 1: Write the seed script**

```javascript
#!/usr/bin/env node
/**
 * Seed default recipes — fallback patterns used when an OEM
 * doesn't have a brand-specific recipe.
 *
 * Usage: node dashboard/scripts/seed-default-recipes.mjs
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const defaults = [
  // --- hero ---
  {
    pattern: 'hero',
    variant: 'image-overlay',
    label: 'Hero — Image with Text Overlay',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '3xl',
      heading_weight: 'bold',
      text_align: 'left',
      overlay_position: 'bottom-left',
      show_overlay: true,
      section_style: { padding_y: '0' },
    },
  },
  {
    pattern: 'hero',
    variant: 'video-background',
    label: 'Hero — Video Background',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '3xl',
      heading_weight: 'bold',
      text_align: 'center',
      overlay_position: 'center',
      show_overlay: true,
      section_style: { padding_y: '0' },
    },
  },
  // --- card-grid ---
  {
    pattern: 'card-grid',
    variant: 'image-title-body',
    label: 'Feature Cards — Image + Title + Body',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      card_composition: ['image', 'title', 'body'],
      card_style: { background: '#ffffff', border: 'none', shadow: '0 1px 3px rgba(0,0,0,0.1)', text_align: 'left', gap: '16px', padding: '0' },
      section_style: { padding_y: '64px' },
    },
  },
  {
    pattern: 'card-grid',
    variant: 'icon-title-body',
    label: 'Feature Icons — Icon + Title + Body',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      card_composition: ['icon', 'title', 'body'],
      card_style: { background: 'transparent', border: 'none', shadow: 'none', text_align: 'center', gap: '12px', padding: '24px' },
      section_style: { padding_y: '64px' },
    },
  },
  {
    pattern: 'card-grid',
    variant: 'stat',
    label: 'Stats Grid — Number + Label',
    resolves_to: 'stats',
    defaults_json: {
      layout: 'row',
      background: '#1a1a1a',
      card_composition: ['stat'],
      section_style: { padding_y: '48px' },
    },
  },
  {
    pattern: 'card-grid',
    variant: 'logo',
    label: 'Logo Strip — Row of Logos',
    resolves_to: 'logo-strip',
    defaults_json: {
      grayscale: true,
      card_composition: ['logo'],
      section_style: { padding_y: '32px' },
    },
  },
  {
    pattern: 'card-grid',
    variant: 'testimonial',
    label: 'Testimonials — Quote + Author',
    resolves_to: 'testimonial',
    defaults_json: {
      layout: 'carousel',
      card_composition: ['rating', 'body', 'title', 'subtitle'],
      section_style: { padding_y: '64px' },
    },
  },
  {
    pattern: 'card-grid',
    variant: 'pricing-tier',
    label: 'Pricing Tiers — Price + Features + CTA',
    resolves_to: 'pricing-table',
    defaults_json: {
      card_composition: ['badge', 'title', 'stat', 'body', 'cta'],
      section_style: { padding_y: '64px' },
    },
  },
  // --- split-content ---
  {
    pattern: 'split-content',
    variant: 'text-left-image-right',
    label: 'Split — Text Left, Image Right',
    resolves_to: 'intro',
    defaults_json: {
      image_position: 'right',
      section_style: { padding_y: '64px' },
    },
  },
  {
    pattern: 'split-content',
    variant: 'text-right-image-left',
    label: 'Split — Image Left, Text Right',
    resolves_to: 'intro',
    defaults_json: {
      image_position: 'left',
      section_style: { padding_y: '64px' },
    },
  },
  {
    pattern: 'split-content',
    variant: 'full-width-text',
    label: 'Content Block — Full Width Text',
    resolves_to: 'content-block',
    defaults_json: {
      layout: 'contained',
      section_style: { padding_y: '64px' },
    },
  },
  // --- media ---
  {
    pattern: 'media',
    variant: 'carousel',
    label: 'Image Carousel',
    resolves_to: 'gallery',
    defaults_json: {
      layout: 'carousel',
      section_style: { padding_y: '48px' },
    },
  },
  {
    pattern: 'media',
    variant: 'video',
    label: 'Video Embed',
    resolves_to: 'video',
    defaults_json: {
      layout: 'contained',
      autoplay: false,
      section_style: { padding_y: '48px' },
    },
  },
  // --- data-display ---
  {
    pattern: 'data-display',
    variant: 'specs-accordion',
    label: 'Specs Accordion',
    resolves_to: 'specs-grid',
    defaults_json: {
      section_style: { padding_y: '48px' },
    },
  },
  {
    pattern: 'data-display',
    variant: 'comparison',
    label: 'Comparison Table',
    resolves_to: 'comparison-table',
    defaults_json: {
      section_style: { padding_y: '48px' },
    },
  },
  {
    pattern: 'data-display',
    variant: 'color-picker',
    label: 'Colour Picker',
    resolves_to: 'color-picker',
    defaults_json: {
      section_style: { padding_y: '48px' },
    },
  },
  // --- action-bar ---
  {
    pattern: 'action-bar',
    variant: 'banner',
    label: 'CTA Banner',
    resolves_to: 'cta-banner',
    defaults_json: {
      cta_text: 'Enquire Now',
      cta_url: '#',
      section_style: { padding_y: '48px' },
    },
  },
  {
    pattern: 'action-bar',
    variant: 'sticky',
    label: 'Sticky CTA Bar',
    resolves_to: 'sticky-bar',
    defaults_json: {
      position: 'bottom',
      show_after_scroll_px: 400,
    },
  },
  {
    pattern: 'action-bar',
    variant: 'form',
    label: 'Enquiry Form',
    resolves_to: 'enquiry-form',
    defaults_json: {
      form_type: 'contact',
      section_style: { padding_y: '48px' },
    },
  },
  // --- tabs ---
  {
    pattern: 'tabs',
    variant: 'horizontal',
    label: 'Horizontal Tabs',
    resolves_to: 'tabs',
    defaults_json: {
      variant: 'default',
      theme: 'light',
      section_style: { padding_y: '48px' },
    },
  },
  // --- utility ---
  {
    pattern: 'utility',
    variant: 'heading',
    label: 'Section Heading',
    resolves_to: 'heading',
    defaults_json: {
      heading_tag: 'h2',
      heading_size: '3xl',
      heading_weight: 'bold',
      text_align: 'left',
    },
  },
  {
    pattern: 'utility',
    variant: 'divider',
    label: 'Divider',
    resolves_to: 'divider',
    defaults_json: { style: 'line', spacing: 'md' },
  },
  {
    pattern: 'utility',
    variant: 'alert',
    label: 'Alert Banner',
    resolves_to: 'alert',
    defaults_json: { variant: 'info', dismissible: true },
  },
]

async function main() {
  console.log(`Seeding ${defaults.length} default recipes...`)

  // Clear existing defaults
  await supabase.from('default_recipes').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { data, error } = await supabase
    .from('default_recipes')
    .insert(defaults)
    .select('id, pattern, variant')

  if (error) {
    console.error('Failed:', error.message)
    process.exit(1)
  }

  console.log(`✅ Seeded ${data.length} default recipes`)
  data.forEach(r => console.log(`   ${r.pattern} / ${r.variant}`))
}

main()
```

- [ ] **Step 2: Run the seed script**

Run: `node dashboard/scripts/seed-default-recipes.mjs`
Expected: "Seeded 23 default recipes" with each pattern/variant listed.

- [ ] **Step 3: Commit**

```bash
git add dashboard/scripts/seed-default-recipes.mjs
git commit -m "feat: seed 23 default recipes for all 8 patterns"
```

---

### Task 3: Seed Toyota-Specific Recipes

**Files:**
- Create: `dashboard/scripts/seed-toyota-recipes.mjs`

- [ ] **Step 1: Write the Toyota recipe seed script**

```javascript
#!/usr/bin/env node
/**
 * Seed Toyota AU brand recipes — OEM-specific compositions
 * that override default recipes with Toyota styling.
 *
 * Prerequisites: brand_recipes table exists, Toyota brand tokens seeded.
 * Usage: node dashboard/scripts/seed-toyota-recipes.mjs
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const OEM_ID = 'toyota-au'

const recipes = [
  {
    oem_id: OEM_ID,
    pattern: 'hero',
    variant: 'cinematic',
    label: 'Toyota Cinematic Hero',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '5xl',
      heading_weight: 'extrabold',
      text_align: 'left',
      overlay_position: 'bottom-left',
      show_overlay: false,
      full_width_image: true,
      section_style: { padding_y: '0' },
      typography: { title_size: 'display', title_weight: '800' },
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'hero',
    variant: 'image-overlay',
    label: 'Toyota Hero — Standard',
    resolves_to: 'hero',
    defaults_json: {
      heading_size: '4xl',
      heading_weight: 'extrabold',
      text_align: 'left',
      overlay_position: 'bottom-left',
      show_overlay: true,
      text_color: '#ffffff',
      section_style: { padding_y: '0' },
      typography: { title_size: 'h1', title_weight: '800' },
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'icon-title-body',
    label: 'Toyota Feature Icons (3-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      card_composition: ['icon', 'title', 'body'],
      card_style: {
        background: 'transparent',
        border: 'none',
        shadow: 'none',
        text_align: 'center',
        gap: '16px',
        padding: '0',
      },
      section_style: { background: '#f5f5f5', padding_y: '80px', max_width: '1440px' },
      typography: { title_size: 'h4', title_weight: '700', body_size: 'body', body_color: 'text_secondary' },
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'image-title-body',
    label: 'Toyota Feature Cards (3-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 3,
      card_composition: ['image', 'title', 'body'],
      card_style: {
        background: 'transparent',
        border: 'none',
        shadow: 'none',
        text_align: 'left',
        gap: '16px',
        padding: '0',
        border_radius: '8px',
      },
      section_style: { background: '#ffffff', padding_y: '80px' },
      typography: { title_size: 'h4', title_weight: '700', body_size: 'body' },
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'card-grid',
    variant: 'image-title-cta',
    label: 'Toyota Model Range (4-col)',
    resolves_to: 'feature-cards',
    defaults_json: {
      columns: 4,
      card_composition: ['image', 'title', 'cta'],
      card_style: {
        background: 'transparent',
        border: 'none',
        shadow: 'none',
        text_align: 'center',
        gap: '12px',
        padding: '0',
      },
      section_style: { padding_y: '64px' },
      typography: { title_size: 'h4', title_weight: '700' },
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'split-content',
    variant: 'text-left-image-right',
    label: 'Toyota Split — Text + Image',
    resolves_to: 'intro',
    defaults_json: {
      image_position: 'right',
      section_style: { padding_y: '80px' },
      typography: { title_size: 'h3', title_weight: '800', body_size: 'body_large' },
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'action-bar',
    variant: 'banner',
    label: 'Toyota CTA Banner',
    resolves_to: 'cta-banner',
    defaults_json: {
      background_color: '#1a1a1a',
      cta_text: 'Find a Dealer',
      cta_url: '#dealer',
      section_style: { padding_y: '48px' },
    },
  },
  {
    oem_id: OEM_ID,
    pattern: 'data-display',
    variant: 'specs-accordion',
    label: 'Toyota Specs',
    resolves_to: 'specs-grid',
    defaults_json: {
      section_style: { background: '#f5f5f5', padding_y: '64px' },
    },
  },
]

async function main() {
  console.log(`Seeding ${recipes.length} Toyota AU recipes...`)

  // Deactivate any existing Toyota recipes
  await supabase
    .from('brand_recipes')
    .update({ is_active: false })
    .eq('oem_id', OEM_ID)
    .eq('is_active', true)

  const { data, error } = await supabase
    .from('brand_recipes')
    .upsert(recipes, { onConflict: 'oem_id,pattern,variant' })
    .select('id, pattern, variant, label')

  if (error) {
    console.error('Failed:', error.message)
    process.exit(1)
  }

  console.log(`✅ Seeded ${data.length} Toyota AU recipes:`)
  data.forEach(r => console.log(`   ${r.pattern} / ${r.variant} — ${r.label}`))
}

main()
```

- [ ] **Step 2: Run the seed**

Run: `node dashboard/scripts/seed-toyota-recipes.mjs`
Expected: "Seeded 8 Toyota AU recipes" with each listed.

- [ ] **Step 3: Commit**

```bash
git add dashboard/scripts/seed-toyota-recipes.mjs
git commit -m "feat: seed 8 Toyota AU brand recipes"
```

---

### Task 4: Worker API Endpoint — Fetch Recipes

**Files:**
- Modify: `src/routes/oem-agent.ts`

- [ ] **Step 1: Add the recipes endpoint**

Add this route after the existing `/pages` routes (around line 1550) in `src/routes/oem-agent.ts`:

```typescript
// ============================================================================
// Recipes API
// ============================================================================

app.get('/recipes/:oemId', async (c) => {
  const oemId = c.req.param('oemId')
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  // Fetch OEM-specific recipes
  const { data: brandRecipes } = await supabase
    .from('brand_recipes')
    .select('id, oem_id, pattern, variant, label, resolves_to, defaults_json')
    .eq('oem_id', oemId)
    .eq('is_active', true)
    .order('pattern')

  // Fetch default recipes
  const { data: defaultRecipes } = await supabase
    .from('default_recipes')
    .select('id, pattern, variant, label, resolves_to, defaults_json')
    .order('pattern')

  // Merge: OEM recipes override defaults for matching pattern+variant
  const oemKeys = new Set((brandRecipes ?? []).map(r => `${r.pattern}:${r.variant}`))
  const merged = [
    ...(brandRecipes ?? []).map(r => ({ ...r, source: 'brand' as const })),
    ...(defaultRecipes ?? [])
      .filter(r => !oemKeys.has(`${r.pattern}:${r.variant}`))
      .map(r => ({ ...r, oem_id: null, source: 'default' as const })),
  ]

  return c.json({ recipes: merged, oem_id: oemId })
})
```

- [ ] **Step 2: Verify the endpoint works**

Run: `curl -s https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/recipes/toyota-au | jq '.recipes | length'`
Expected: A number (should be ~23 defaults + 8 Toyota overrides, minus overlaps ≈ ~25-27).

Note: This requires deploying first. For local testing, use `npx wrangler dev` and curl `http://localhost:8787/api/v1/oem-agent/recipes/toyota-au`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/oem-agent.ts
git commit -m "feat: add GET /recipes/:oemId endpoint with brand+default merge"
```

---

### Task 5: Dashboard API Client — fetchRecipes

**Files:**
- Modify: `dashboard/src/lib/worker-api.ts`

- [ ] **Step 1: Add fetchRecipes function**

Add after the existing `fetchGeneratedPage` function (around line 74):

```typescript
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

export async function fetchRecipes(oemId: string): Promise<Recipe[]> {
  const result = await workerFetch(`/api/v1/oem-agent/recipes/${oemId}`)
  return result.recipes ?? []
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/lib/worker-api.ts
git commit -m "feat: add fetchRecipes client function and Recipe type"
```

---

### Task 6: Page Builder Composable — addSectionFromRecipe

**Files:**
- Modify: `dashboard/src/composables/use-page-builder.ts`

- [ ] **Step 1: Import fetchRecipes**

At the top of `use-page-builder.ts`, add to the import from `@/lib/worker-api`:

```typescript
import {
  fetchGeneratedPage,
  clonePage,
  structurePage,
  updatePageSections,
  regenerateSection as apiRegenerateSection,
  adaptivePipeline as apiAdaptivePipeline,
  fetchRecipes,
  type Recipe,
} from '@/lib/worker-api'
```

- [ ] **Step 2: Add recipes ref and loadRecipes function**

After the existing `const slug = ref('')` declarations (around line 55), add:

```typescript
const recipes = ref<Recipe[]>([])

async function loadRecipes(oemId: string) {
  try {
    recipes.value = await fetchRecipes(oemId)
  } catch {
    recipes.value = []
  }
}
```

- [ ] **Step 3: Add addSectionFromRecipe function**

After the existing `addSectionFromLiveData` function (around line 362), add:

```typescript
function addSectionFromRecipe(recipe: Recipe, afterIndex?: number) {
  const sectionType = recipe.resolves_to as PageSectionType
  ensureContentExists()
  pushHistory(`Added ${recipe.label}`)
  const baseDefaults = SECTION_DEFAULTS[sectionType]?.() ?? {}
  // Merge recipe defaults on top of section type defaults
  const { card_composition, card_style, section_style, typography, ...sectionDefaults } = recipe.defaults_json
  const newSection = {
    ...baseDefaults,
    ...sectionDefaults,
    type: sectionType,
    id: genId(),
    order: 0,
    _recipe: { pattern: recipe.pattern, variant: recipe.variant, oem_id: recipe.oem_id },
  }
  const updated = [...sections.value]
  const insertAt = afterIndex != null ? afterIndex + 1 : updated.length
  updated.splice(insertAt, 0, newSection)
  updated.forEach((s: any, i: number) => { s.order = i })
  sections.value = updated
  isDirty.value = true
  selectedSectionId.value = newSection.id
}
```

- [ ] **Step 4: Call loadRecipes when page loads**

In the existing `loadPage` function, after `page.value = await fetchGeneratedPage(newSlug)` (around line 232), add:

```typescript
if (oemId.value) {
  await loadRecipes(oemId.value)
}
```

- [ ] **Step 5: Expose new functions in the return object**

Find the `return {` block at the bottom of the composable and add:

```typescript
recipes, loadRecipes, addSectionFromRecipe,
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/composables/use-page-builder.ts
git commit -m "feat: add recipe support to page builder composable"
```

---

### Task 7: Recipe-Aware Section Picker

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/AddSectionPicker.vue`

- [ ] **Step 1: Add recipe prop and pattern grouping**

Replace the `<script lang="ts" setup>` block in `AddSectionPicker.vue` with:

```typescript
<script lang="ts" setup>
import { ref, computed } from 'vue'
import {
  Plus, Image, Type, Heading, Columns3, Palette, TableProperties, Images,
  LayoutGrid, Video, Megaphone, FileText, ChevronRight, ChevronDown, Library,
  ClipboardPaste, Quote, Table2, BarChart3, Award, Code2, DollarSign,
  PanelBottom, Timer, Calculator, Maximize, Layers, Grid3x3, SplitSquareHorizontal,
  Play, TabletSmartphone, Database, Bell, Minus,
} from 'lucide-vue-next'
import {
  SECTION_TEMPLATES,
  SECTION_TYPE_INFO,
  type PageSectionType,
} from './section-templates'
import type { Recipe } from '@/lib/worker-api'

const props = defineProps<{
  recipes?: Recipe[]
  oemId?: string
}>()

const emit = defineEmits<{
  addBlank: [type: PageSectionType]
  addFromTemplate: [templateId: string]
  addFromRecipe: [recipe: Recipe]
  openGallery: []
  pasteFromClipboard: []
}>()

const open = ref(false)
const expandedPattern = ref<string | null>(null)

// Pattern definitions with icons and labels
const PATTERNS = [
  { key: 'hero', label: 'Hero', icon: Image },
  { key: 'card-grid', label: 'Card Grid', icon: Grid3x3 },
  { key: 'split-content', label: 'Split Content', icon: SplitSquareHorizontal },
  { key: 'media', label: 'Media', icon: Play },
  { key: 'tabs', label: 'Tabs', icon: Columns3 },
  { key: 'data-display', label: 'Data Display', icon: Database },
  { key: 'action-bar', label: 'Action Bar', icon: Megaphone },
  { key: 'utility', label: 'Utility', icon: Layers },
]

// Group recipes by pattern
const recipesByPattern = computed(() => {
  const grouped: Record<string, { brand: Recipe[]; defaults: Recipe[] }> = {}
  for (const p of PATTERNS) {
    grouped[p.key] = { brand: [], defaults: [] }
  }
  for (const r of (props.recipes ?? [])) {
    const group = grouped[r.pattern]
    if (!group) continue
    if (r.source === 'brand') group.brand.push(r)
    else group.defaults.push(r)
  }
  return grouped
})

const hasRecipes = computed(() => (props.recipes ?? []).length > 0)

function togglePattern(key: string) {
  expandedPattern.value = expandedPattern.value === key ? null : key
}

function selectRecipe(recipe: Recipe) {
  emit('addFromRecipe', recipe)
  open.value = false
  expandedPattern.value = null
}

function addBlankType(type: PageSectionType) {
  emit('addBlank', type)
  open.value = false
  expandedPattern.value = null
}
</script>
```

- [ ] **Step 2: Replace the template**

Replace the `<template>` block with:

```vue
<template>
  <div class="relative">
    <button
      class="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
      @click="open = !open"
    >
      <Plus class="h-3.5 w-3.5" />
      Add Section
    </button>

    <!-- Dropdown -->
    <div
      v-if="open"
      class="absolute left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-[480px] overflow-y-auto"
    >
      <!-- Recipe-based picker (when recipes loaded) -->
      <template v-if="hasRecipes">
        <div
          v-for="pattern in PATTERNS"
          :key="pattern.key"
          class="border-b border-border last:border-0"
        >
          <!-- Pattern header -->
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
            @click="togglePattern(pattern.key)"
          >
            <component :is="pattern.icon" class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="flex-1 text-left">{{ pattern.label }}</span>
            <span
              v-if="recipesByPattern[pattern.key]?.brand.length"
              class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full"
            >
              {{ recipesByPattern[pattern.key].brand.length }} custom
            </span>
            <component
              :is="expandedPattern === pattern.key ? ChevronDown : ChevronRight"
              class="h-3 w-3 text-muted-foreground"
            />
          </button>

          <!-- Expanded variants -->
          <div v-if="expandedPattern === pattern.key" class="bg-muted/30">
            <!-- OEM-specific recipes -->
            <template v-if="recipesByPattern[pattern.key].brand.length">
              <div class="px-3 pt-1.5 pb-0.5">
                <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Brand</span>
              </div>
              <button
                v-for="recipe in recipesByPattern[pattern.key].brand"
                :key="recipe.id"
                class="w-full flex items-center gap-2 px-3 py-1.5 pl-8 text-xs hover:bg-muted transition-colors"
                @click="selectRecipe(recipe)"
              >
                <span class="flex-1 text-left">{{ recipe.label }}</span>
              </button>
            </template>

            <!-- Default recipes -->
            <template v-if="recipesByPattern[pattern.key].defaults.length">
              <div class="px-3 pt-1.5 pb-0.5">
                <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Generic</span>
              </div>
              <button
                v-for="recipe in recipesByPattern[pattern.key].defaults"
                :key="recipe.id"
                class="w-full flex items-center gap-2 px-3 py-1.5 pl-8 text-xs hover:bg-muted transition-colors"
                @click="selectRecipe(recipe)"
              >
                <span class="flex-1 text-left">{{ recipe.label }}</span>
              </button>
            </template>
          </div>
        </div>
      </template>

      <!-- Fallback: original flat list (when no recipes) -->
      <template v-else>
        <button
          v-for="(info, type) in SECTION_TYPE_INFO"
          :key="type"
          class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
          @click="addBlankType(type as PageSectionType)"
        >
          <span class="flex-1 text-left">{{ info.label }}</span>
          <span class="text-[10px] text-muted-foreground">{{ info.description }}</span>
        </button>
      </template>

      <!-- Bottom actions -->
      <div class="border-t border-border p-1.5 flex gap-1">
        <button
          class="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          @click="$emit('openGallery'); open = false"
        >
          <Library class="h-3 w-3" /> Browse Gallery
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          @click="$emit('pasteFromClipboard'); open = false"
        >
          <ClipboardPaste class="h-3 w-3" /> Paste
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/AddSectionPicker.vue
git commit -m "feat: recipe-aware section picker with pattern grouping"
```

---

### Task 8: Wire Sidebar to Recipes

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/PageBuilderSidebar.vue`
- Modify: `dashboard/src/pages/dashboard/page-builder/[slug].vue`

- [ ] **Step 1: Update PageBuilderSidebar.vue to pass recipes and emit recipe events**

In the `<script>` block, add `recipes` prop:

```typescript
const props = defineProps<{
  page: any
  sections: any[]
  selectedSectionId: string | null
  oemName: string
  oemId?: string
  recipes?: any[]
}>()
```

Add the new emit:

```typescript
const emit = defineEmits<{
  selectSection: [id: string]
  openEditor: [id: string]
  moveSection: [from: number, to: number]
  deleteSection: [id: string]
  duplicateSection: [id: string]
  copySectionJson: [id: string]
  convertSection: [id: string, targetType: string]
  splitSection: [id: string]
  addSection: [type: PageSectionType]
  addSectionFromTemplate: [templateId: string]
  addFromRecipe: [recipe: any]
  insertFromGallery: [section: any]
  pasteFromClipboard: []
}>()
```

In the template where `<AddSectionPicker>` is used, pass recipes and handle the event:

```vue
<AddSectionPicker
  :recipes="recipes"
  :oem-id="oemId"
  @add-blank="$emit('addSection', $event)"
  @add-from-template="$emit('addSectionFromTemplate', $event)"
  @add-from-recipe="$emit('addFromRecipe', $event)"
  @open-gallery="galleryOpen = true"
  @paste-from-clipboard="$emit('pasteFromClipboard')"
/>
```

- [ ] **Step 2: Update [slug].vue to wire recipes through**

In the page builder `[slug].vue`, the `usePageBuilder()` already exposes `recipes` and `addSectionFromRecipe`. Update the sidebar usage:

```vue
<PageBuilderSidebar
  :page="page"
  :sections="sections"
  :selected-section-id="selectedSectionId"
  :oem-name="oemName(oemId || '')"
  :oem-id="oemId"
  :recipes="recipes"
  @select-section="selectSection"
  @open-editor="openEditor"
  @move-section="moveSection"
  @delete-section="deleteSection"
  @duplicate-section="duplicateSection"
  @copy-section-json="copySectionToClipboard"
  @convert-section="convertSection"
  @split-section="splitSection"
  @add-section="addSection"
  @add-section-from-template="addSectionFromTemplate"
  @add-from-recipe="addSectionFromRecipe"
  @insert-from-gallery="(s) => addSectionFromLiveData(s)"
  @paste-from-clipboard="pasteSectionFromClipboard"
/>
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/PageBuilderSidebar.vue
git add dashboard/src/pages/dashboard/page-builder/\\[slug\\].vue
git commit -m "feat: wire recipe picker through sidebar to page builder"
```

---

### Task 9: AI Agent Prompt — Inject Recipes

**Files:**
- Modify: `src/design/page-generator.ts`

- [ ] **Step 1: Import createSupabaseClient if not already imported**

At the top of `page-generator.ts`, verify `createSupabaseClient` is available (it should be via the existing Supabase setup).

- [ ] **Step 2: Add recipe fetching helper to PageGenerator class**

Add this method to the `PageGenerator` class:

```typescript
private async getRecipesForPrompt(oemId: OemId): Promise<string> {
  const { data: brandRecipes } = await this.supabase
    .from('brand_recipes')
    .select('pattern, variant, label, resolves_to')
    .eq('oem_id', oemId)
    .eq('is_active', true)
    .order('pattern')

  if (!brandRecipes?.length) return ''

  const lines = brandRecipes.map(r =>
    `- ${r.label} (pattern: ${r.pattern}, variant: ${r.variant}) → ${r.resolves_to}`
  )

  return `\nAvailable section recipes for this OEM:\n${lines.join('\n')}\n\nSelect recipes by pattern+variant for each content block. Use the recipe defaults — do NOT invent custom styling.\n`
}
```

- [ ] **Step 3: Inject recipe context into the structuring prompt**

In the `structurePage` or content generation method where the LLM prompt is built, add the recipe context. Find the section where `OEM_BRAND_NOTES` or `primaryColor` is injected into the prompt (around line 250-300), and add:

```typescript
const recipePrompt = await this.getRecipesForPrompt(oemId)
```

Then append `recipePrompt` to the system or user prompt string that gets sent to the LLM.

- [ ] **Step 4: Commit**

```bash
git add src/design/page-generator.ts
git commit -m "feat: inject OEM recipes into AI agent structuring prompt"
```

---

### Task 10: Deploy and Verify

**Files:** None (deployment and manual testing)

- [ ] **Step 1: Deploy the worker**

Run: `npx wrangler deploy`
Expected: Worker deployed successfully.

- [ ] **Step 2: Deploy the dashboard**

Run: `cd dashboard && npm run build && npx wrangler pages deploy dist`
Expected: Dashboard deployed to Cloudflare Pages.

- [ ] **Step 3: Verify the API endpoint**

Run: `curl -s https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/recipes/toyota-au | jq '.recipes | length'`
Expected: ~25-27 recipes returned.

- [ ] **Step 4: Verify the dashboard**

Navigate to `https://oem-dashboard.pages.dev/dashboard/page-builder/toyota-au-rav4`.
Click "Add Section". Verify:
- 8 pattern groups shown (Hero, Card Grid, Split Content, etc.)
- Expanding "Card Grid" shows Toyota brand recipes at top, generic below
- Selecting "Toyota Feature Icons (3-col)" inserts a `feature-cards` section with Toyota defaults
- The section renders correctly in the canvas

- [ ] **Step 5: Verify fallback for non-Toyota OEM**

Navigate to any non-Toyota page (e.g. `kia-au-sportage`).
Click "Add Section". Verify:
- Pattern groups shown with only generic/default recipes (no "Brand" section)
- Selecting a recipe still inserts a correct section with default styling

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: recipe picker adjustments from manual testing"
```
