# Roadmap: OEM Agent

## Overview

Build a recipe-based design system that enables brand-accurate dealer pages across 18 OEMs. v1.0 (recipe infrastructure, style guides, CardGrid, section consolidation) is complete. v2.0 focuses on closing the design-to-component pipeline end to end.

## Milestones

### v1.0 Recipe Design System (Complete)

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Recipe Infrastructure | 10 | Complete | 2026-03-28 |
| 2 | Style Guides & OEM Coverage | 4 | Complete | 2026-03-28 |
| 3 | Unified CardGrid Renderer | 4 | Complete | 2026-03-28 |
| 4 | Section Consolidation | 4 | Complete | 2026-03-28 |

---

## Current Milestone

**v2.0 Intelligent Design Pipeline** (v2.0.0)
Status: In progress
Phases: 0 of 4 complete

**Focus:** Close the gap between "seeing an OEM design" and "rendering a pixel-accurate component" — automated end to end.

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 5 | Component Generation | TBD | Not started | - |
| 6 | Live Token Refinement | TBD | Not started | - |
| 7 | Recipe Analytics & Preview | TBD | Not started | - |
| 8 | Stitch + Batch Extraction | TBD | Not started | - |

## Phase Details

### Phase 5: Component Generation

**Goal:** Recipe → working Alpine.js + Tailwind component via AI, with preview in page builder
**Depends on:** v1.0 (recipes, extraction pipeline, ComponentGenerator exist)
**Research:** Likely (optimal prompt engineering for component generation)

**Scope:**
- Take recipe metadata + section thumbnail screenshot
- Feed to AI (Gemini/Claude) with brand tokens
- Generate Alpine.js + Tailwind HTML component
- Preview generated component in page builder
- "Generate Component" button on extracted recipes

### Phase 6: Live Token Refinement

**Goal:** Crawl OEM sites for actual CSS custom properties, colors, spacing, typography — replace inferred tokens
**Depends on:** Phase 5 (accurate tokens improve generated components)
**Research:** Likely (CSS extraction patterns vary per OEM)

**Scope:**
- Crawl each OEM homepage + vehicle page via Lightpanda/Browser
- Extract CSS custom properties, computed styles, font stacks
- Compare with existing inferred tokens
- Update brand_tokens with real values
- Dashboard diff view: inferred vs crawled

### Phase 7: Recipe Analytics & Preview

**Goal:** Track recipe usage, coverage gaps, and enable brand token switching preview
**Depends on:** Phase 6 (accurate tokens for preview)
**Research:** Unlikely

**Scope:**
- Recipe usage tracking (which pages use which recipes)
- Coverage dashboard: patterns per OEM, gaps, most/least used
- Brand token preview switching in recipe editor
- Recipe health metrics

### Phase 8: Stitch + Batch Extraction

**Goal:** Google Stitch MCP integration for AI mockups + multi-URL batch extraction
**Depends on:** Phase 5 (component generation pattern established)
**Research:** Likely (Stitch MCP API exploration)

**Scope:**
- Set up Stitch MCP server
- Generate visual mockups from recipe specs
- Multi-URL batch extraction (extract recipes from multiple pages at once)
- Stitch → recipe → component pipeline

---
*Roadmap created: 2026-03-28*
*Last updated: 2026-03-28*
