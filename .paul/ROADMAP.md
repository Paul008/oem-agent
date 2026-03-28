# Roadmap: OEM Agent

## Overview

Build a recipe-based design system that enables brand-accurate dealer pages across 18 OEMs. v1.0–v3.0 complete. v4.0 focuses on autonomous operations — automated monitoring, regeneration, and external integrations.

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

### v3.0 Production Design System (Complete)

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 9 | Deferred Items | 1 | Complete | 2026-03-28 |
| 10 | Page Templates | 1 | Complete | 2026-03-28 |
| 11 | Quality & Drift | 1 | Complete | 2026-03-28 |

---

## Current Milestone

**v4.0 Autonomous Design Operations** (v4.0.0)
Status: Complete
Phases: 3 of 3 complete

**Focus:** The system runs itself — automated monitoring, regeneration, and external integrations.

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 12 | Automation | 1 | Complete | 2026-03-29 |
| 13 | Dealer Customization | 1 | Complete | 2026-03-29 |
| 14 | Integration | 1 | Complete | 2026-03-29 |

## Phase Details

### Phase 12: Automation

**Goal:** Scheduled drift detection, auto-regeneration pipeline, AI quality scoring
**Depends on:** v3.0 (design health, token crawler, component generator exist)

**Scope:**
- Cron-triggered weekly drift check for all 18 OEMs
- Auto-regeneration: recipe/token change → re-generate affected pages
- AI quality scoring: screenshot generated component vs OEM, score 0-100

### Phase 13: Dealer Customization

**Goal:** Custom template builder and per-dealer page overrides
**Depends on:** Phase 12 (auto-regeneration supports dealer pages)

**Scope:**
- Save existing pages as custom templates
- Per-dealer overrides: logo, contact info, special offers on top of OEM templates
- Dealer identity concept (may need migration)

### Phase 14: Integration

**Goal:** Stitch MCP integration and webhook notifications
**Depends on:** Phase 12 (webhooks fire on automated events)

**Scope:**
- Stitch MCP server setup + visual mockup generation
- Webhook notifications: page generated, tokens changed, drift detected
- External system integration points

---
*Roadmap created: 2026-03-28*
*Last updated: 2026-03-29*
