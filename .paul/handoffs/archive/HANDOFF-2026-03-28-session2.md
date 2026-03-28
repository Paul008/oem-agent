# PAUL Handoff

**Date:** 2026-03-28 (session 2)
**Status:** paused — context limit approaching, save state before planning 02-03

---

## READ THIS FIRST

You have no prior context. This document tells you everything.

**Project:** OEM Agent — AI-powered platform that crawls 18 AU OEM websites, extracts vehicle data, and generates branded dealer pages through a visual page builder.
**Core value:** Dealers get brand-accurate vehicle pages without manual design work.

---

## Current State

**Version:** v1.0.0
**Phase:** 2 of 4 — Style Guides & OEM Coverage
**Plan:** 02-02 complete, 02-03 next (Recipe-from-screenshot pipeline)

**Loop Position:**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [Loop closed — ready for next PLAN]
```

---

## What Was Done (This Session)

### Plan 02-01: Style Guide Page (COMPLETE)
- `/dashboard/style-guide` page — visual brand catalog per OEM
- Combined endpoint `GET /admin/style-guide/:oemId` (tokens + recipes in one fetch)
- 6 sections: colors, typography, buttons, spacing, recipes, components
- Sidebar nav entry under Infrastructure

### Plan 02-02: Seed Remaining OEM Recipes (COMPLETE)
- Brand tokens seeded for all 18 OEMs (14 new + 3 fixed)
- Brand recipes seeded for 14 OEMs (109 new recipes)
- Total: 158 brand recipes + 23 defaults = 181 recipes
- All 18 OEMs verified via API — every one has tokens + recipes

### Earlier This Session (Phase 1 wrap-up)
- Visual recipe editor (RecipeVisualEditor.vue) with composition builder + style panel
- Brand tokens sidebar on recipes page
- Recipe preview in edit dialog
- Kia/GWM/Hyundai recipe seeding
- RLS authenticated policies applied
- Save as Recipe button + recipe-aware structuring prompt
- `/dashboard/recipes` management page
- PAUL initialized with PROJECT.md, ROADMAP.md, STATE.md, SPECIAL-FLOWS.md

### Toyota Style Guide in Pencil
- Created Toyota style guide as .pen file proof of concept
- Exported as PNG to `dashboard/public/style-guides/toyota-au.png`

---

## What's Next

**Immediate:** `/paul:plan` for Plan 02-03 — Recipe-from-screenshot pipeline

This involves:
- AI analyzes an OEM webpage screenshot and auto-generates recipes
- Uses existing Kimi K2.5 vision or Gemini for screenshot analysis
- Flow: capture screenshot → AI extracts layout patterns → generate recipe defaults_json → save to brand_recipes
- Integration point: button in dashboard (on style guide or recipes page) to trigger

**After that:** Plan 02-04 (PDF/PNG export for style guides)

**After Phase 2:** Phase 3 (Unified CardGrid Renderer) and Phase 4 (Section Consolidation)

---

## Key Architecture

### Recipe System
- 8 patterns: hero, card-grid, split-content, media, tabs, data-display, action-bar, utility
- Recipes resolve to existing section types (backward compatible)
- Card composition model: cards = vertical stack of primitive slots
- Brand categories: blue, red, dark/premium, elegant, utility

### Database
- `brand_recipes`: 158 rows (UNIQUE on oem_id, pattern, variant)
- `default_recipes`: 23 rows (UNIQUE on pattern, variant)
- `brand_tokens`: 18 rows (one per OEM, is_active)

### Key Endpoints
- `GET /recipes/:oemId` — merged brand + default recipes
- `GET /admin/recipes` — all recipes (both tables)
- `POST /admin/recipes` — upsert recipe
- `DELETE /admin/recipes/:id` — delete recipe
- `GET /admin/style-guide/:oemId` — combined tokens + recipes
- `GET /admin/brand-tokens/:oemId` — tokens only

### Dashboard Pages
- `/dashboard/recipes` — CRUD management with visual editor
- `/dashboard/style-guide` — read-only brand catalog per OEM

---

## Key Files

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state |
| `.paul/ROADMAP.md` | 4-phase roadmap |
| `.paul/SPECIAL-FLOWS.md` | 8 skills configured |
| `src/routes/oem-agent.ts` | All recipe/style-guide endpoints |
| `src/design/agent.ts` | OEM_BRAND_NOTES (line ~800) |
| `src/design/page-generator.ts` | getRecipesForPrompt (line ~788) |
| `src/design/page-structurer.ts` | getRecipeContext for structuring |
| `dashboard/src/pages/dashboard/recipes.vue` | Recipes management |
| `dashboard/src/pages/dashboard/style-guide.vue` | Style guide catalog |
| `dashboard/src/pages/dashboard/components/page-builder/RecipeVisualEditor.vue` | Visual editor |
| `dashboard/src/pages/dashboard/components/page-builder/AddSectionPicker.vue` | Pattern-grouped picker |
| `dashboard/src/composables/use-page-builder.ts` | addSectionFromRecipe, saveCurrentAsRecipe |
| `dashboard/src/lib/worker-api.ts` | fetchRecipes, fetchStyleGuide, saveRecipe, etc. |

---

## Resume Instructions

1. Read `.paul/STATE.md` for latest position
2. Run `/paul:resume`
3. Next action: `/paul:plan` for Plan 02-03

---

*Handoff created: 2026-03-28*
