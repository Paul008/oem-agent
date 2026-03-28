# OEM Agent

## What This Is

An AI-powered platform that crawls 18 Australian OEM websites, extracts vehicle data (products, specs, colors, pricing, offers, banners), and generates branded dealer pages through a visual page builder. The system uses recipe-based component architecture to ensure brand-accurate styling across all OEMs without manual design work.

## Core Value

Dealers get brand-accurate vehicle pages without manual design work.

## Current State

| Attribute | Value |
|-----------|-------|
| Version | Production |
| Status | Production |
| Last Updated | 2026-03-28 |

**Production URLs:**
- Worker API: https://oem-agent.adme-dev.workers.dev
- Dashboard: https://oem-dashboard.pages.dev
- Dealer App: https://knoxgwmhaval.com.au (example deployment)

## Requirements

### Validated (Shipped)

- [x] OEM data crawling — 18 AU OEMs, automated cron
- [x] Product/spec/color/pricing extraction pipeline
- [x] Visual page builder with 26+ section types
- [x] Recipe-based component architecture (brand_recipes + default_recipes)
- [x] Brand token extraction and storage (Toyota fully seeded)
- [x] Visual recipe editor with composition builder, style panel, live preview
- [x] Recipes management page with CRUD
- [x] Save as Recipe from existing sections
- [x] AI agent recipe injection into structuring prompts
- [x] Dealer Nuxt app rendering with client-side link interception
- [x] Supabase realtime dashboard
- [x] Lightpanda + Cloudflare Browser rendering tier

### Active (In Progress)

- [ ] OEM style guide pages — visual brand catalog per OEM
- [ ] Seed brand recipes for remaining 14 OEMs
- [ ] Recipe-from-screenshot — AI analyzes OEM pages, auto-generates recipes

### Planned (Next)

- [ ] Unified CardGrid renderer (Phase 2 of recipe architecture)
- [ ] Section type consolidation (Phase 3 — 26 types to ~12)
- [ ] Recipe usage analytics
- [ ] Brand token switching preview in recipe editor

### Out of Scope

- Rebuilding Pencil.dev — use as external design tool, not rebuild
- Full design application — page builder is for using the design system, not creating one

## Target Users

**Primary:** Automotive dealers (AU market)
- Need vehicle pages that match OEM branding
- Don't have design resources
- Want pages that update automatically when OEM data changes

**Secondary:** Platform administrators
- Manage OEM data extraction
- Configure recipes and brand tokens
- Monitor crawl health and data quality

## Context

**Business Context:**
18 Australian OEM brands. Each has unique branding, typography, color schemes, and page layouts. Dealers need brand-accurate pages without hiring designers for each brand.

**Technical Context:**
- Cloudflare Workers (Hono) — API and crawl orchestration
- Supabase (PostgreSQL) — data storage, realtime
- Vue 3 + Vite dashboard — admin interface
- Nuxt 4 dealer app — customer-facing pages
- R2 storage — page definitions, media
- Lightpanda + Cloudflare Browser — headless rendering

## Constraints

### Technical Constraints
- Cloudflare Workers 25MB bundle limit
- Supabase RLS for all tables
- Per-OEM 60s timeout on cron crawls
- R2 for page storage (not database)

### Business Constraints
- Must support all 18 AU OEMs
- Brand accuracy is non-negotiable — pages must look like OEM originals
- Dealers don't edit CSS — recipes handle all styling

## Specialized Flows

See: .paul/SPECIAL-FLOWS.md

Quick Reference:
- superpowers:brainstorming → Feature design (required)
- superpowers:writing-plans → Implementation planning (required)
- superpowers:subagent-driven-development → Task execution (required)
- superpowers:systematic-debugging → Bug investigation (required)
- superpowers:verification-before-completion → Pre-merge validation (required)
- superpowers:requesting-code-review → Code review (optional)
- sc:implement → Feature implementation (optional)
- sc:build → Dashboard builds (optional)

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| API | Cloudflare Workers (Hono) | Worker + cron triggers |
| Dashboard | Vue 3 + Vite | Deployed to CF Pages |
| Dealer App | Nuxt 4 | Per-dealer deployments |
| Database | Supabase (PostgreSQL) | Realtime subscriptions |
| Storage | Cloudflare R2 | Pages, media, screenshots |
| Browser | Lightpanda + CF Browser | Headless rendering |
| AI | Kimi K2.5, Gemini, Claude | Page generation + structuring |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-03-28*
