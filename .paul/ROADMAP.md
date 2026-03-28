# Roadmap: OEM Agent

## Overview

Build a recipe-based design system that enables brand-accurate dealer pages across 18 OEMs. v1.0 (recipe infrastructure) and v2.0 (intelligent pipeline) are complete. v3.0 focuses on production-grade tooling — templates, quality assurance, and drift detection.

## Milestones

### v1.0 Recipe Design System (Complete)

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Recipe Infrastructure | 10 | Complete | 2026-03-28 |
| 2 | Style Guides & OEM Coverage | 4 | Complete | 2026-03-28 |
| 3 | Unified CardGrid Renderer | 4 | Complete | 2026-03-28 |
| 4 | Section Consolidation | 4 | Complete | 2026-03-28 |

### v2.0 Intelligent Design Pipeline (Complete)

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 5 | Component Generation | 1 | Complete | 2026-03-28 |
| 6 | Live Token Refinement | 1 | Complete | 2026-03-28 |
| 7 | Recipe Analytics & Preview | 1 | Complete | 2026-03-28 |
| 8 | Stitch + Batch Extraction | 1 | Complete | 2026-03-28 |

---

## Current Milestone

**v3.0 Production Design System** (v3.0.0)
Status: In progress
Phases: 1 of 3 complete

**Focus:** Production-grade tooling — templates, quality assurance, and automated drift detection.

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 9 | Deferred Items | 1 | Complete | 2026-03-28 |
| 10 | Page Templates | TBD | Not started | - |
| 11 | Quality & Drift | TBD | Not started | - |

## Phase Details

### Phase 9: Deferred Items

**Goal:** Complete Stitch MCP integration, brand token preview switching, and batch token crawling
**Depends on:** v2.0 (component generation, token crawler exist)

**Scope:**
- Set up Stitch MCP server + generate mockups from recipe specs
- Brand token preview switching in recipe visual editor
- Batch crawl all 18 OEMs for live CSS tokens in one operation

### Phase 10: Page Templates

**Goal:** Pre-built page templates composed from recipes with one-click apply and auto-regeneration
**Depends on:** Phase 9 (accurate tokens + Stitch mockups improve templates)

**Scope:**
- Page template gallery (SUV page, EV page, sedan page, etc.)
- Templates composed from recipe combinations
- One-click apply to create a new page from template
- Auto-regeneration: when a recipe updates, re-generate pages using it

### Phase 11: Quality & Drift

**Goal:** AI-powered quality scoring and automated design drift detection
**Depends on:** Phase 10 (templates create more pages to monitor)

**Scope:**
- Recipe quality scoring: AI compares generated component vs OEM screenshot
- Design drift detection: periodic crawl compares live tokens to stored values
- Drift alerts via Slack webhook (existing infrastructure)
- Quality dashboard with scores per OEM

---
*Roadmap created: 2026-03-28*
*Last updated: 2026-03-28*
