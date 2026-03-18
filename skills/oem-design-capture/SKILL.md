---
name: oem-design-capture
description: Brand and layout analysis using vision models. Captures OEM brand tokens, page layouts, and component styles via a three-pass pipeline using Kimi K2.5 for visual analysis.
---

# OEM Design Capture

Analyses OEM websites for brand identity and layout patterns.

## Three-Pass Pipeline

### Pass 1: Brand Token Extraction (per OEM, infrequent)
- Input: Desktop screenshots of homepage + 2 vehicle pages
- Model: Kimi K2.5 Thinking Mode (temp=1.0)
- Output: `brand_tokens.v1` JSON

### Pass 2: Page Layout Decomposition (per page type)
- Input: Desktop + mobile screenshots + cleaned DOM HTML
- Model: Kimi K2.5 Instant Mode (temp=0.6)
- Output: `page_layout.v1` JSON

### Pass 3: Component Detail (per unique component)
- Input: Cropped screenshot + DOM fragment
- Model: Kimi K2.5 Instant Mode (temp=0.6)
- Output: CSS-equivalent JSON per component

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for storing design data
- `GROQ_API_KEY` for pre-screening
- `TOGETHER_API_KEY` for Kimi K2.5 vision analysis
- `LIGHTPANDA_URL` for browser rendering (primary) or `WORKER_URL` + `CDP_SECRET` (fallback)

> **Note**: `specs_json` is now always populated on every product upsert via `orchestrator.buildSpecsJson()`, so page generation can rely on specs data being present for all products.

## Triggers

- Initial onboarding: full capture
- Screenshot pHash change >30%: re-capture affected page
- Manual trigger via admin API
- Quarterly: full audit all OEMs

## Input

```json
{
  "oem_id": "ford-au",
  "trigger": "onboarding",
  "page_type": "homepage"
}
```

## Output

```json
{
  "brand_tokens_updated": true,
  "layouts_captured": 5
}
```
