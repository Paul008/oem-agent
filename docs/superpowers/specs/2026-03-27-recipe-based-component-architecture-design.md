# Recipe-Based Component Architecture

**Date:** 2026-03-27
**Status:** Draft
**Scope:** OEM Agent page builder + dealer Nuxt app rendering

## Problem

The page builder has 26+ section types, each with its own renderer in both the dashboard and the dealer Nuxt app. Automotive pages across all 18 OEMs follow the same structural patterns (hero banners, card grids, split content, etc.) but differ in brand styling. Currently:

- The AI agent must choose from 26 types, leading to frequent misclassification
- Adding a new OEM requires manually styling every section type
- Structural duplicates exist: `feature-cards`, `stats`, `logo-strip`, `testimonial`, and `pricing-table` are all "grid of cards" with different defaults
- Brand styling is hardcoded per-component rather than driven by design tokens

## Solution

A three-layer design system:

1. **Primitives** — 6 brand-agnostic building blocks (text, image, icon, button, spacer, badge)
2. **Layout Patterns** — 8 structural containers (hero, card-grid, split-content, media, tabs, data-display, action-bar, utility)
3. **OEM Recipes** — Brand-specific compositions stored in the database, mapping pattern+variant to existing section types with pre-configured styling from brand tokens

Recipes are additive — they sit on top of existing section types, not replacing them. This enables incremental adoption and zero-breakage deployment.

## Architecture

### Three-Layer Model

```
Layer 3: OEM Recipes      "Toyota Feature Icons (3-col, centered)"
            ↓ resolves to
Layer 2: Layout Patterns   card-grid / variant: icon-title-body
            ↓ maps to
Layer 1: Section Types     feature-cards (existing, unchanged)
            ↓ rendered by
Existing Renderers         SectionFeatureCards.vue (dashboard)
                           FeatureCards.vue (Nuxt dealer app)
```

### Primitives (6 atoms)

| Primitive | Purpose | Styled by brand tokens |
|-----------|---------|----------------------|
| `text` | Heading, body, caption, disclaimer | font family, size, weight, color, letter-spacing |
| `image` | Responsive picture with aspect ratio | border-radius, shadow |
| `icon` | SVG (inline or URL), fixed or natural size | fill color, size |
| `button` | CTA link with label | bg, color, radius, padding, hover |
| `spacer` | Vertical/horizontal gap | size from spacing scale |
| `badge` | Small label tag (e.g. "Hybrid", "New") | bg, text color, radius |

### Layout Patterns (8 containers)

| Pattern | Absorbs | Variants |
|---------|---------|----------|
| `hero` | hero, countdown | image-overlay, video-background, countdown, cinematic |
| `card-grid` | feature-cards, stats, logo-strip, testimonial, pricing-table | image-title-body, icon-title-body, stat, logo, testimonial, image-title-cta, pricing-tier |
| `split-content` | intro, content-block | text-left-image-right, text-right-image-left, text-on-image, full-width-text, wide-text-narrow-image |
| `media` | image, video, gallery, embed, image-showcase | single-image, video, carousel, grid, showcase, embed |
| `tabs` | tabs | horizontal, vertical, feature-bullets |
| `data-display` | specs-grid, comparison-table, color-picker | specs-accordion, comparison, color-picker |
| `action-bar` | sticky-bar, cta-banner, enquiry-form | sticky, banner, form |
| `utility` | heading, alert, divider, finance-calculator, accordion, map | heading, alert, divider, calculator, accordion, map |

### Card Composition Model

Every card in a `card-grid` is a vertical stack of primitive slots:

| Slot | Renders | Examples |
|------|---------|---------|
| `image` | Responsive image with aspect ratio | Feature photo, product shot |
| `icon` | SVG, fixed size | Tech feature icon |
| `title` | Heading text (h3/h4) | "Digital Key" |
| `subtitle` | Secondary heading | "From $45,990" |
| `body` | Paragraph text | Feature description |
| `badge` | Small label | "Hybrid", "Most Popular" |
| `stat` | Large number + unit + label | "4.7L / 100km" |
| `rating` | Star display (1-5) | Customer rating |
| `cta` | Button or text link | "Learn More" |
| `logo` | Constrained-height image | Partner logo |

Example compositions:

```
Toyota feature card:     [image, title, body]
Toyota icon card:        [icon, title, body]
Kia feature card:        [image, badge, title, body, cta]
GWM stat card:           [icon, stat, body]
Testimonial card:        [rating, body, title, subtitle]
Logo strip item:         [logo]
Pricing tier:            [badge, title, stat, body, cta]
```

### OEM Recipe Structure

A recipe maps a pattern+variant to an existing section type with brand-specific defaults:

```json
{
  "oem_id": "toyota-au",
  "pattern": "card-grid",
  "variant": "icon-title-body",
  "label": "Feature Icons (3-col, centered)",
  "resolves_to": "feature-cards",
  "defaults_json": {
    "columns": 3,
    "card_composition": ["icon", "title", "body"],
    "card_style": {
      "background": "transparent",
      "border": "none",
      "shadow": "none",
      "text_align": "center",
      "gap": "16px",
      "padding": "0"
    },
    "section_style": {
      "background": "#f5f5f5",
      "padding_y": "80px",
      "max_width": "1440px"
    },
    "typography": {
      "title_size": "h4",
      "title_weight": "700",
      "body_size": "body",
      "body_color": "text_secondary"
    }
  }
}
```

Typography values (`"h4"`, `"body"`) reference the brand token scale — `"h4"` for Toyota = 32px/700/-0.02em, for Kia = whatever their tokens define. No hardcoded pixel values in recipes.

**Note:** In Phase 1, existing renderers ignore `card_composition`, `card_style`, and `typography` from `defaults_json` — these fields are consumed by the AI agent (for prompt context) and the dashboard section picker (for pre-filling properties). The unified CardGrid renderer in Phase 2 will interpret them at render time.

## Database Schema

### brand_recipes

```sql
CREATE TABLE brand_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  variant TEXT NOT NULL,
  label TEXT NOT NULL,
  resolves_to TEXT NOT NULL,
  defaults_json JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, pattern, variant)
);

CREATE INDEX idx_brand_recipes_oem ON brand_recipes(oem_id) WHERE is_active = true;
```

### default_recipes

```sql
CREATE TABLE default_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern TEXT NOT NULL,
  variant TEXT NOT NULL,
  label TEXT NOT NULL,
  resolves_to TEXT NOT NULL,
  defaults_json JSONB NOT NULL,
  UNIQUE(pattern, variant)
);
```

### Resolution Order

1. `brand_recipes` for OEM + pattern + variant
2. `default_recipes` for pattern + variant
3. Existing `SECTION_DEFAULTS` in code (current behavior, unchanged)

## AI Agent Integration

The AI agent receives recipes in its prompt context when generating pages:

```
Available section recipes for Toyota Australia:
- Cinematic Hero (pattern: hero, variant: cinematic)
- Feature Icons 3-col (pattern: card-grid, variant: icon-title-body)
- Feature Cards 3-col (pattern: card-grid, variant: image-title-body)
- Model Range Grid (pattern: card-grid, variant: image-title-cta)
- Text + Image Split (pattern: split-content, variant: text-left-image-right)
- Image Carousel (pattern: media, variant: carousel)
- Specs Accordion (pattern: data-display, variant: specs-accordion)
- Enquire Now CTA (pattern: action-bar, variant: banner)

Select recipes by pattern+variant for each content block.
Do NOT invent styling — use the recipe defaults exactly.
```

The AI picks a recipe name, the system resolves it to a fully-typed section with correct defaults. The AI never touches CSS or brand-specific styling.

## Dashboard Page Builder Integration

### Section Picker (revised UX)

The flat list of 26+ types becomes a grouped picker:

```
Pattern Groups:           Expanded (Card Grid for Toyota):
┌─────────────────┐       ┌─────────────────────────────────┐
│ + Add Section   │       │ ▾ Card Grid                     │
│                 │       │                                 │
│  ▸ Hero         │       │  Toyota Recipes:                │
│  ▸ Card Grid    │  →    │    ○ Feature Icons (3-col)      │
│  ▸ Split Content│       │    ○ Feature Cards (3-col)      │
│  ▸ Media        │       │    ○ Model Range (4-col)        │
│  ▸ Tabs         │       │                                 │
│  ▸ Data Display │       │  Generic:                       │
│  ▸ Action Bar   │       │    ○ Stats Grid                 │
│  ▸ Utility      │       │    ○ Logo Strip                 │
│                 │       │    ○ Testimonials                │
│                 │       │    ○ Custom...                   │
└─────────────────┘       └─────────────────────────────────┘
```

### Insertion Flow

1. User picks a recipe (e.g. "Feature Icons (3-col, centered)")
2. System fetches recipe from `brand_recipes` table
3. Merges `defaults_json` with `SECTION_DEFAULTS['feature-cards']`
4. Inserts a standard `feature-cards` section with Toyota styling pre-applied
5. Existing `SectionFeatureCards.vue` renders it unchanged
6. Existing `SectionProperties.vue` edits it — all properties still editable

Recipes are a creation-time convenience. Once inserted, a section is a normal section with all properties overridable.

### Code Changes (Phase 1)

| File | Change | Size |
|------|--------|------|
| `worker-api.ts` | New `fetchRecipes(oemId)` | S |
| `oem-agent.ts` (routes) | New `GET /api/v1/oem-agent/recipes/:oemId` | S |
| `use-page-builder.ts` | New `addSectionFromRecipe(recipeId)` | S |
| `PageBuilderSidebar.vue` | Recipe-aware grouped section picker | M |
| Migration SQL | `brand_recipes` + `default_recipes` tables | S |
| Seed scripts | `seed-default-recipes.mjs`, `seed-toyota-recipes.mjs` | M |

### No Changes To (Phase 1)

- Any Section*.vue renderer component (dashboard)
- SectionProperties.vue (property editor)
- PageBuilderCanvas.vue (component map)
- VehiclePageRenderer.vue (Nuxt dealer app)
- types.ts (discriminated union)
- Any existing page data in R2

## Phased Rollout

### Phase 1: Recipe Layer (additive, no breaking changes)

- `brand_recipes` + `default_recipes` tables
- API endpoint for fetching recipes
- Seed default recipes (~10) + Toyota recipes (~8)
- Updated section picker in dashboard sidebar
- `addSectionFromRecipe()` in page builder composable
- AI agent prompt updated to use recipes

**Outcome:** New sections created via recipes get OEM-appropriate defaults. Existing sections and renderers untouched.

### Phase 2: Unified CardGrid Renderer

- New `SectionCardGrid.vue` that reads `card_composition` + `card_style`
- Renders any card variant from primitive slots
- Add `card-grid` to section type union and component maps
- Migrate existing `feature-cards` sections to use new renderer
- Old `feature-cards` type continues to work (backward compat alias)

**Outcome:** One renderer replaces 5 (feature-cards, stats, logo-strip, testimonial, pricing-table). More flexible than any individual one.

### Phase 3: Consolidate Remaining Overlaps

- `intro` + `content-block` → `split-content` with variants
- `hero` + `countdown` + `cta-banner` → `hero` with variants
- `image` + `gallery` + `image-showcase` + `video` + `embed` → `media` with variants
- R2 migration script to update existing page JSON

**Outcome:** 26 section types consolidated to ~12. Cleaner codebase, easier for AI to reason about.

## Scale Estimates

- ~10 default recipes (fallbacks for all patterns)
- ~6-8 OEM-specific recipes per brand (where they diverge from defaults)
- 18 OEMs = ~10 defaults + ~80-100 OEM-specific = ~110 rows total
- Toyota: ~8 recipes (we have brand tokens already seeded)
- Foton/LDV: ~2-3 custom (mostly use defaults)

## Integration Points Reference

Places that would need updates if section types change (Phase 2-3 only):

| Location | File | What |
|----------|------|------|
| Type union | `oem-agent/src/oem/types.ts:1006-1267` | `PageSectionType` + `PageSection` discriminated union |
| AI prompt | `oem-agent/src/design/page-generator.ts:250-283` | Section type list in structuring prompt |
| Dashboard templates | `oem-agent/dashboard/.../section-templates.ts` | Factory functions + defaults |
| Dashboard canvas | `oem-agent/dashboard/.../PageBuilderCanvas.vue:59-87` | Component map |
| Nuxt types | `promotion-knoxgwmhaval/types/page-sections.ts` | `PageSectionType` union (loose) |
| Nuxt renderer | `promotion-knoxgwmhaval/.../VehiclePageRenderer.vue:25-127` | v-if chain |
| Nuxt components | `promotion-knoxgwmhaval/components/vehicles/sections/*.vue` | 24 individual renderers |

Phase 1 touches NONE of these. Phase 2-3 add to them incrementally.

## Success Criteria

- **AI accuracy:** Agent picks correct recipe >90% of the time (down from ~26 choices to ~8 per OEM)
- **New OEM onboarding:** Seed brand tokens + recipes, get styled pages without custom components
- **Developer experience:** Adding a new card variant = one database row, not a new Vue component
- **Zero regression:** All existing pages render identically after Phase 1
- **Performance:** Recipe fetch adds <50ms (single indexed query, cacheable)
