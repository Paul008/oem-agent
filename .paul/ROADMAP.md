# Roadmap: OEM Agent

## Overview

Build a recipe-based design system that enables brand-accurate dealer pages across 18 OEMs. Phase 1 (recipe infrastructure) is complete. Remaining work: visual style guides, recipe coverage for all OEMs, and renderer consolidation.

## Current Milestone

**v1.0 Recipe Design System** (v1.0.0)
Status: In progress
Phases: 3 of 4 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Recipe Infrastructure | 10 | Complete | 2026-03-28 |
| 2 | Style Guides & OEM Coverage | 4 | Complete | 2026-03-28 |
| 3 | Unified CardGrid Renderer | 4 | Complete | 2026-03-28 |
| 4 | Section Consolidation | TBD | Not started | - |

## Phase Details

### Phase 1: Recipe Infrastructure

**Goal:** Add recipe layer to page builder — database, API, dashboard CRUD, visual editor, AI integration
**Depends on:** Nothing (first phase)
**Research:** Unlikely

**Scope:**
- brand_recipes + default_recipes tables
- Recipe API endpoints (GET/POST/DELETE)
- Recipe-aware section picker in page builder
- Save as Recipe from existing sections
- Visual recipe editor (composition builder, style panel, live preview)
- Recipes management page with CRUD
- Brand tokens sidebar
- AI agent recipe injection
- Seed Toyota (8), Kia (8), GWM (8), Hyundai (8) + 23 defaults

**Plans:**
- [x] 01-01: Database migration + seed scripts
- [x] 01-02: Worker API endpoints
- [x] 01-03: Dashboard composable + section picker
- [x] 01-04: Sidebar wiring + AI prompt injection
- [x] 01-05: Recipes management page
- [x] 01-06: Visual recipe editor
- [x] 01-07: Brand tokens sidebar + preview
- [x] 01-08: Seed Kia, GWM, Hyundai recipes
- [x] 01-09: RLS fix for authenticated access
- [x] 01-10: Polish — filter fix, save button, migration cleanup

### Phase 2: Style Guides & OEM Coverage

**Goal:** Visual brand catalog per OEM + recipe coverage for all 18 OEMs
**Depends on:** Phase 1 (recipe tables and editor exist)
**Research:** Likely (need to analyze each OEM's website for brand patterns)

**Scope:**
- Auto-generated OEM style guide page (/dashboard/style-guide/:oemId)
- Seed brand recipes for remaining 14 OEMs
- Recipe-from-screenshot (AI analyzes OEM pages → auto-generates recipes)
- Export style guides as PDF/PNG

**Plans:**
- [x] 02-01: Style guide page + route
- [x] 02-02: Seed remaining OEM recipes (batch)
- [x] 02-03: Recipe-from-screenshot pipeline
- [x] 02-04: PDF/PNG export

### Phase 3: Unified CardGrid Renderer

**Goal:** One renderer replaces 5 (feature-cards, stats, logo-strip, testimonial, pricing-table)
**Depends on:** Phase 2 (recipes exist for all OEMs to validate)
**Research:** Unlikely (internal refactoring)

**Scope:**
- SectionCardGrid.vue reads card_composition + card_style
- Add card-grid to section type union
- Migrate existing feature-cards sections
- Backward compat aliases for old types

**Plans:**
- [x] 03-01: CardGrid renderer component
- [x] 03-02: Type union + component map updates
- [x] 03-03: Migration script for existing pages
- [x] 03-04: Verify backward compatibility

### Phase 4: Section Consolidation

**Goal:** 26 section types consolidated to ~12
**Depends on:** Phase 3 (CardGrid pattern proven)
**Research:** Unlikely

**Scope:**
- intro + content-block → split-content
- hero + countdown + cta-banner → hero with variants
- image + gallery + image-showcase + video + embed → media with variants
- R2 migration script for existing page JSON
- Update both dashboard + Nuxt renderers

**Plans:**
- [ ] 04-01: Split-content consolidation
- [ ] 04-02: Hero consolidation
- [ ] 04-03: Media consolidation
- [ ] 04-04: R2 page migration + renderer updates

---
*Roadmap created: 2026-03-28*
*Last updated: 2026-03-28*
