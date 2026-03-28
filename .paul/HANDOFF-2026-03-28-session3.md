# PAUL Handoff

**Date:** 2026-03-28 (session 3)
**Status:** paused — restart needed for Lightpanda MCP

---

## READ THIS FIRST

**Project:** OEM Agent — AI-powered platform for branded dealer pages
**Core value:** Dealers get brand-accurate vehicle pages without manual design work

---

## Current State

**Phase:** 2 of 4 — Style Guides & OEM Coverage
**Plan:** 02-03 (Recipe-from-screenshot) — at human verification checkpoint

**Loop Position:**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ◉        ○     [Tasks 1-3 done, checkpoint pending]
```

---

## What's Pending RIGHT NOW

### Plan 02-03 Checkpoint
Tasks 1-3 (RecipeExtractor class, API endpoint, dashboard UI) are built and deployed. The human verification checkpoint needs:
1. Check /dashboard/style-guide — does Toyota render in ToyotaType?
2. Try "Extract from URL" with https://www.toyota.com.au/rav4
3. Type "approved" or describe issues

### Lightpanda MCP Just Configured
Added to ~/.claude/settings.json. After restart, tools available:
- `mcp__lightpanda__goto` — navigate to URL
- `mcp__lightpanda__markdown` — extract page content
- `mcp__lightpanda__links` — extract links
- `mcp__lightpanda__search` — web search

Use these to crawl remaining 13 OEM sites for font files.

### Font System Working
- Toyota fonts in R2 at fonts/toyota-au/*.woff
- Served via /media/fonts/{oem-id}/{filename}
- Style guide page dynamically injects @font-face from brand_tokens.typography.font_faces
- 13 OEMs still need fonts downloaded + uploaded to R2

---

## What Was Done This Session

- Plan 02-01: Style guide page (COMPLETE)
- Plan 02-02: Seed all 18 OEMs with tokens + recipes (COMPLETE)
- Plan 02-03: Recipe-from-screenshot (Tasks 1-3 done, checkpoint pending)
- Font system: R2 hosting + dynamic loading (Toyota working)
- Lightpanda MCP configured in settings.json
- 181 total recipes across 18 OEMs

---

## Resume Instructions

1. Restart Claude Code (for Lightpanda MCP)
2. `/paul:resume`
3. Complete Plan 02-03 checkpoint verification
4. Use Lightpanda MCP to crawl OEM sites for fonts

---

*Handoff created: 2026-03-28*
