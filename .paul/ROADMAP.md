# Roadmap: OEM Agent

## Overview

Recipe-based design system for brand-accurate dealer pages across 18 OEMs. v1.0–v4.0 complete (32 plans). v5.0 focuses on production hardening — polish, dealer integration, testing, and security.

## Milestones

### v1.0 Recipe Design System (Complete — 22 plans)
### v2.0 Intelligent Design Pipeline (Complete — 4 plans)
### v3.0 Production Design System (Complete — 3 plans)
### v4.0 Autonomous Design Operations (Complete — 3 plans)

---

## Current Milestone

**v5.0 Production Hardening** (v5.0.0)
Status: Complete
Phases: 4 of 4 complete

**Focus:** Polish, dealer integration, testing, and security.

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 15 | Polish & Fixes | 1 | Complete | 2026-03-29 |
| 16 | Dealer API | 1 | Complete | 2026-03-29 |
| 17 | Testing | 1 | Complete | 2026-03-29 |
| 18 | Security Hardening | 1 | Complete | 2026-03-29 |

## Phase Details

### Phase 15: Polish & Fixes

**Goal:** Split style-guide.vue, fix PageBuilderCanvas componentMap, update PROJECT.md, clean dead code

### Phase 16: Dealer API

**Goal:** Expose dealer_overrides + recipes in public endpoints, dealer API documentation

### Phase 17: Testing

**Goal:** Route tests, design pipeline tests, component tests via vitest

### Phase 18: Security Hardening

**Goal:** Rate limiting on admin endpoints, audit logging for state-changing operations

---

## Current Milestone

**v6.0 Smart Capture** (v6.0.0)
Status: ✅ Complete
Phases: 4 of 4 complete

**Focus:** Deterministic section capture from OEM pages into page builder. Replaces unreliable AI extraction with programmatic HTML parsing. Inspired by DivMagic (computed CSS → Tailwind) and Builder.io (map captures to existing component library).

**Key Decision:** AI-based extraction (Gemini, then Claude Sonnet 4.5) was tried and consistently failed — wrong images, invalid JSON, wrong section types. Deterministic parsing is the proven approach.

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 19 | Deterministic Parser | 1 | Complete | 2026-03-31 |
| 20 | Capture UX | 1 | Complete | 2026-03-31 |
| 21 | Section Templates | 1 | Complete | 2026-03-31 |
| 22 | Screenshot Capture | 1 | Complete | 2026-03-31 |

## Phase Details

### Phase 19: Deterministic Parser

**Goal:** Replace AI smart-capture with a programmatic HTML parser that extracts structured section data from any OEM page. Zero AI, zero hallucination.
**Depends on:** Nothing (first phase)
**Research:** Unlikely (patterns clear from today's session)

**Scope:**
- HTML parser that detects section patterns (card grids, heroes, carousels, text blocks, testimonials)
- Per-card image/text/CTA extraction from DOM structure (class names, tag hierarchy)
- Section type classification from CSS classes and element patterns
- Card style detection (overlay vs default) from gradient/media class patterns
- Works across all 18 OEM page structures (GWM, Kia, Ford, etc.)

### Phase 20: Capture UX

**Goal:** Polish the queue-based capture tool with proper element selection, visual feedback, and reliable section creation.
**Depends on:** Phase 19 (parser provides the extraction)
**Research:** Unlikely

**Scope:**
- Stabilize iframe capture with scroll-to-resize selection (Alt+Scroll)
- Queue workflow: add sections → review → capture all
- Info tooltip showing element details (tag, class, size, image count)
- Reliable section creation in page builder from parsed data
- Error handling and user feedback for failed captures

### Phase 21: Section Templates

**Goal:** Extend section renderers to support captured OEM design patterns (overlay cards, full-bleed images, testimonial carousels, etc.)
**Depends on:** Phase 19 (parser identifies the patterns)
**Research:** Unlikely

**Scope:**
- Overlay card style for feature-cards (shipped today, needs polish)
- Full-bleed image section with text overlay
- Testimonial/review carousel template
- CTA fields (text + URL) on all card-based sections
- Section type auto-detection from parsed data

### Phase 22: Screenshot Capture

**Goal:** Screenshot-based capture as a complementary mode — browser renders the page, user selects regions, deterministic parser extracts content from the corresponding HTML.
**Depends on:** Phase 19 + 20
**Research:** Likely (cross-origin canvas, screenshot-to-DOM coordinate mapping)

**Scope:**
- Browser screenshot endpoint (CF Browser, already built)
- Screenshot display with region selection (click-drag, already built)
- Map screenshot regions back to DOM sections (coordinate → HTML mapping)
- Hybrid: screenshot for visual selection + HTML parser for data extraction
- No AI vision — screenshot is only for user's visual reference

---
*Last updated: 2026-03-31*
