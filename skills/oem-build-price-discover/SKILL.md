---
name: oem-build-price-discover
description: Automated discovery of OEM build-and-price configurator patterns. Crawls configurator flows, captures network APIs, DOM selectors, and data structures. Outputs structured discovery reports for extraction skill configuration.
---

# OEM Build & Price Discovery

Automated discovery of OEM vehicle configurator patterns for extraction skill configuration.

## What It Discovers

1. **URL Patterns** - How the configurator encodes variants, colors, options
2. **API Endpoints** - JSON APIs called during configuration (via CDP network interception)
3. **DOM Selectors** - CSS selectors for prices, colors, disclaimers, features
4. **Data Structures** - Shape of variant/color/price data in APIs or DOM
5. **Interaction Flow** - Steps required (clicks, selections) to reveal all data

## Prerequisites

- `CDP_SECRET` and `WORKER_URL` for browser automation
- `GROQ_API_KEY` for LLM classification
- `cloudflare-browser` skill available
- `BRAVE_API_KEY` (optional) for web search research
- `PERPLEXITY_API_KEY` (optional) for AI-powered research

## How It Works

### Phase 1: Research (Brave + Perplexity)
1. Search for existing knowledge about OEM's tech stack
   - "Kia Australia website technology stack"
   - "Kia configurator API endpoints"
2. Research common automotive configurator patterns
3. Check for known CMS (AEM, Sitecore, WordPress)
4. Look for developer discussions or API documentation

### Phase 2: Active Discovery (CDP)
1. Navigate to OEM's build-price entry URL
2. Enable CDP network interception
3. Discover available models/variants via DOM inspection
4. For each variant:
   - Navigate to variant page
   - Capture API calls returning JSON
   - Extract DOM structure for colors, prices, disclaimers
   - Screenshot key UI states

### Phase 3: Analysis (Groq)
1. Classify discovered APIs and their data
2. Match patterns against research findings
3. Generate extraction configuration
4. Output structured discovery report

## Input

```json
{
  "oem_id": "kia-au",
  "entry_url": "https://www.kia.com/au/shopping-tools/build-and-price.html",
  "max_variants": 3,
  "capture_screenshots": true
}
```

## Output

```json
{
  "oem_id": "kia-au",
  "discovered_at": "2026-02-13T10:30:00Z",
  "url_patterns": {
    "variant_selection": "/build-and-price.trim.{model}.html",
    "color_selection": "/build-and-price.color.{model}.{variant}.html",
    "complete": "/build-and-price.complete.{model}.{variant}.{interior}.{color}.html"
  },
  "apis": [
    {
      "url": "https://www.kia.com/api/v1/vehicles/{model}/variants",
      "method": "GET",
      "provides": ["variants", "prices"],
      "sample_response": { ... }
    }
  ],
  "selectors": {
    "variant_cards": ".variant-card",
    "variant_name": ".variant-card .name",
    "variant_price": ".variant-card .price",
    "color_swatches": ".color-picker .swatch",
    "color_name": ".color-picker .selected .name",
    "color_price": ".color-picker .selected .price-delta",
    "disclaimer": ".legal-disclaimer",
    "features_list": ".features-list li"
  },
  "interaction_required": true,
  "screenshots": [
    "r2://discoveries/kia-au/variant-selection.png",
    "r2://discoveries/kia-au/color-selection.png"
  ]
}
```

## Agent Memory Integration

Discoveries are stored in agent memory at:
- `memory/oem-discovery/{oem_id}.md` - Human-readable discovery notes
- `discoveries/{oem_id}.json` - Machine-readable extraction config

The agent can be prompted: "What patterns have you discovered for Kia's configurator?"

## Usage Examples

### Discover Single OEM
```
Discover Kia Australia's build-and-price configurator patterns.
Entry URL: https://www.kia.com/au/shopping-tools/build-and-price.html
```

### Batch Discovery
```
Run discovery on all active OEMs that have build-and-price pages.
Store findings in memory for extraction skill configuration.
```

### Re-verify Existing Discovery
```
Re-run discovery for Hyundai AU and compare with existing patterns.
Flag any changes in URL structure or selectors.
```
