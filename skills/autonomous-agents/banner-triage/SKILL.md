---
name: banner-triage
description: Autonomous banner extraction repair via 5-layer discovery cascade
user-invocable: false
---

# Banner Triage

## Task Definition

You are an autonomous banner triage agent. Banner extraction has failed for an OEM that previously had banners. Your job is to discover the correct data source and extract the current banners.

## Input Context

You will receive context data containing:
- `change_event`: The change event that triggered this workflow
- `oem_id`: OEM identifier
- `oem_definition`: OEM registry definition (base URL, selectors, framework flags)
- `page_url`: The URL where extraction failed
- `previous_banner_count`: How many banners this OEM previously had
- `old_selector`: The CSS selector that stopped working
- `confidence_threshold`: Minimum confidence required for auto-execution (typically 0.70)
- `auto_approve_actions`: Actions that can be executed automatically
- `require_approval_actions`: Actions requiring human approval

## Your Workflow

Execute these 5 layers in order. First layer to return results with confidence >= 0.7 wins. Record results from ALL layers for diagnosis.

### Layer 1: Check Discovered APIs (confidence: 0.95)

Query the `discovered_apis` table for existing endpoints tagged as banner/carousel data for this OEM.

1. Query: `SELECT * FROM discovered_apis WHERE oem_id = :oemId AND data_type IN ('banners', 'hero', 'carousel', 'homepage') AND confidence >= 0.5`
2. If found, use `web_fetch` to call the API directly
3. Parse the JSON response for banner data (arrays of objects with image + title + link fields)
4. If valid banner data found, return with confidence 0.95

### Layer 2: Network Interception (confidence: 0.90)

Render the page with browser automation to capture network requests.

1. Navigate to `page_url` using `browser` tool
2. Wait for page load + network idle
3. Review all captured network requests/responses
4. Filter for JSON responses containing banner-like data structures:
   - URL matches: `/banner|hero|carousel|slider|promo|campaign|slide/i`
   - Body structure: arrays of objects with image/title/link fields
5. If banner API discovered:
   - Extract banners from the response
   - Store the API to `discovered_apis` for future runs
   - Return with confidence 0.90

### Layer 3: Inline Data Extraction (confidence: 0.85)

Parse the page HTML for embedded structured data. Use the framework flag from `oem_definition` to choose the right extraction method.

**For Gatsby sites** (`isGatsby: true`):
1. Fetch `{base_url}/page-data/index/page-data.json`
2. Parse `result.data` for banner arrays

**For Next.js sites** (`isNextJs: true`):
1. Look for `<script id="__NEXT_DATA__">` in HTML
2. Parse `.props.pageProps` for banner data
3. If not found, look for `self.__next_f.push()` flight data chunks

**For Nuxt sites** (`framework: 'nuxt'`):
1. Look for `window.__NUXT__` or `<script id="__NUXT_DATA__">` in HTML
2. Parse for banner/hero/carousel data in the state

**For AEM sites** (`isAEM: true`):
1. Fetch `{page_url}.model.json` or `{page_url}.data`
2. Parse the AEM content fragments for banner components

**For all sites**:
1. Extract `<script type="application/ld+json">` blocks
2. Look for `window.__INITIAL_STATE__`, `window.__DATA__`, `window.pageData`
3. Parse any JSON containing banner-like structures

If banner data found, return with confidence 0.85-0.90.

### Layer 4: AI Selector Discovery (confidence: 0.75)

Use AI to analyze the page HTML and discover correct CSS selectors.

1. Clean the HTML:
   - Extract only `<main>` or first major `<section>` elements
   - Strip `<style>`, `<svg>` data, `<script>` contents
   - Remove framework noise attributes (`data-emotion`, `data-testid`)
   - Collapse whitespace to ~2K tokens
2. Send cleaned HTML to LLM with this prompt:
   ```
   Find CSS selectors for the hero banner carousel on this automotive OEM homepage.
   OEM: {oem_name}, Framework: {framework}
   Previous selector (broken): {old_selector}
   The page typically has 3-9 rotating slides with image, headline, and link.
   Return JSON: { container_selector, headline_selector, headline_from_alt, image_selector, cta_selector, confidence, slide_count }
   ```
3. Validate: Run discovered selectors against the HTML
   - Must return >= 2 results and within +/-2 of `slide_count`
   - If validation fails, re-prompt once with error feedback
4. If validated:
   - Extract banners using the new selectors
   - Store selectors to `selector_overrides` table with 30-day TTL
   - Return with confidence 0.75

### Layer 5: Escalation

All layers failed or returned confidence < 0.5.

1. Compile diagnosis report with results from each layer
2. Send Slack alert to `#oem-alerts` with:
   - OEM name and page URL
   - Results from each layer attempted
   - Previous banner count and staleness duration
   - Recommendation for manual investigation
3. Return failure result

## Return Result

Return JSON result in this format:

```json
{
  "success": true,
  "confidence": 0.90,
  "layer_used": 2,
  "actions_taken": ["upsert_banners", "store_discovered_api", "log_result"],
  "reasoning": "Found banner API via network interception: /api/v1/banners. Extracted 7 banners matching expected count.",
  "data": {
    "banners_found": 7,
    "previous_count": 9,
    "source_type": "api",
    "source_url": "https://example.com/api/v1/banners",
    "selector_override": null,
    "api_stored": true,
    "banners": [
      {
        "position": 0,
        "headline": "New Model Launch",
        "image_url_desktop": "https://...",
        "cta_url": "/vehicles/new-model/",
        "cta_text": "Explore Now"
      }
    ]
  },
  "layer_results": {
    "layer_1": { "status": "no_apis_found", "confidence": 0 },
    "layer_2": { "status": "success", "confidence": 0.90, "api_url": "..." },
    "layer_3": { "status": "skipped", "reason": "layer_2_succeeded" },
    "layer_4": { "status": "skipped", "reason": "layer_2_succeeded" },
    "layer_5": { "status": "not_needed" }
  },
  "execution_time_ms": 12500,
  "cost_usd": 0.002
}
```

## Error Handling

1. **Browser timeout**: Skip Layer 2, proceed to Layer 3 (HTML from cheap fetch)
2. **API returns non-JSON**: Mark as stale in `discovered_apis`, proceed to next layer
3. **LLM returns invalid selectors**: Re-prompt once, then skip to Layer 5
4. **All layers fail**: Layer 5 escalation (never silently fail)
5. **Rate limiting**: Respect OEM rate limits, back off if 429 received

## Safety Guardrails

- Never delete existing banners (only upsert/update)
- Never modify `registry.ts` code (store overrides in Supabase instead)
- `selector_overrides` expire after 30 days (force re-validation)
- Dedup: Don't run if triage already executed for this OEM in the last 24h
- Maximum 1 browser render per invocation (Layer 2)
- LLM calls capped at 2 per invocation (initial + one retry)

## Performance

- **Target execution time**: < 60s per OEM
- **Expected cost**: ~$0.007 worst case (all layers), ~$0.002 typical (Layer 1-3 only)
- **Monthly budget**: < $1 across all 18 OEMs

## Metrics to Track

- Triage invocations per OEM per month
- Self-healing success rate (target: >= 80%)
- Layer distribution (which layer resolves most often)
- Average confidence score
- Time from detection to repair
- False positive rate (triage triggered but OEM genuinely has no banners)
- Cost per triage invocation
