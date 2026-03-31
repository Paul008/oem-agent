---
phase: 20-capture-ux
plan: 01
subsystem: ui
tags: [capture-tool, context-menu, queue, iframe-cache]

requires:
  - phase: 19-deterministic-parser
    provides: parseSection() and smart-capture endpoint
provides:
  - Right-click context menu for section type override
  - Cached iframe between captures
  - forced_type API parameter
affects: [21-section-templates]

key-files:
  created: []
  modified: [dashboard/src/.../SectionCapture.vue, dashboard/src/composables/use-capture-injection.ts, src/routes/oem-agent.ts]

key-decisions:
  - "Right-click for type override, left-click for auto-detect — preserves both workflows"
  - "Context menu rendered in parent (not iframe) for reliable styling"

patterns-established:
  - "postMessage protocol: section-capture (auto) vs section-capture-menu (user picks type)"
  - "QueueItem.forcedType → API forced_type → overrides parser result"

duration: 10min
started: 2026-03-31T02:15:00Z
completed: 2026-03-31T02:25:00Z
---

# Phase 20 Plan 01: Capture UX Summary

**Right-click context menu for section type selection, cached iframe, and forced type override — capture tool is now production-usable.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10 min |
| Tasks | 3 completed |
| Files modified | 3 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Page stays loaded | Pass | iframe persists, completed count resets on new additions |
| AC-2: Right-click context menu | Pass | 10 section types, positioned at click coords |
| AC-3: Queue shows forced type | Pass | Pills display forced type name |
| AC-4: Forced type overrides parser | Pass | API accepts forced_type, wraps parser result |
| AC-5: Left-click auto-detects | Pass | Unchanged behavior preserved |

## Accomplishments

- Right-click context menu with 10 section type options
- Iframe stays loaded between capture batches
- forced_type API parameter overrides parser auto-detection
- Tooltip updated with right-click hint

## Deviations from Plan

None.

## Next Phase Readiness

**Ready:**
- Capture tool handles type override for misclassified sections
- Parser + forced type covers the major use cases

**Concerns:**
- Parser still misclassifies some patterns (text grids → feature-cards)
- Section templates may need new variants for captured OEM patterns

---
*Phase: 20-capture-ux, Plan: 01*
*Completed: 2026-03-31*
