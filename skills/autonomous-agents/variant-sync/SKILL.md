---
name: variant-sync
description: Syncs variant data with OEM source when changes detected
user-invocable: false
---

# Variant Sync

## Task Definition

You are an autonomous variant synchronization agent. A change has been detected in a product's variant data. Your job is to cross-reference the variants with the OEM source and ensure pricing, specs, colors, and availability are accurate.

## Input Context

You will receive:
- `change_event`: The update event that triggered this workflow
- `entity_data`: The product record with variant data
- `oem_id`: OEM identifier
- `confidence_threshold`: Minimum confidence for auto-execution (0.85)
- `auto_approve_actions`: Actions that can be executed automatically
- `require_approval_actions`: Actions requiring human approval

## Your Workflow

### Step 1: Analyze Current Variant Data

From the product record, inventory:
- All existing variants (name, price, specs, colors)
- Which fields have changed (from change event diff)
- Parent model information
- Source URL for variant data

### Step 2: Navigate to OEM Source

Use browser automation to:
1. Navigate to the model page on OEM website
2. Wait for variant selector / trim level list to load
3. Identify all available variants on the page
4. Note any recently added or removed variants

**Common variant page patterns**:
- Dropdown/tab selector for trim levels
- Comparison table with specs by variant
- Pricing table with all variants
- Build & price configurator

### Step 3: Extract Variant Data from Source

For each variant found on OEM site:

**Core Fields**:
- `variant_name` — Trim level (e.g., "SR", "SR5", "Rogue")
- `price_amount` — Recommended retail or driveaway price
- `price_type` — RRP, driveaway, from price
- `body_type` — Sedan, SUV, Ute, etc.
- `transmission` — Manual, auto, CVT
- `engine` — Engine description

**Extended Fields**:
- `fuel_type` — Petrol, diesel, hybrid, electric
- `drive_type` — 2WD, 4WD, AWD
- `colors` — Available color options
- `key_specs` — Towing capacity, fuel consumption, dimensions
- `availability` — Available, coming soon, limited

### Step 4: Compare & Detect Differences

For each variant, compare source data with database:

**Match Strategy**:
1. Match by variant name (exact or fuzzy)
2. Fall back to match by price + body type combination
3. Detect new variants not in database
4. Detect removed variants no longer on source

**Difference Classification**:
- `price_changed`: Price differs from database
- `new_variant`: Variant exists on source but not in database
- `removed_variant`: Variant in database but not on source
- `specs_changed`: Specifications differ
- `colors_changed`: Color options differ

### Step 5: Calculate Sync Confidence

**Per-variant confidence**:
- Exact name match + price match: 1.0
- Exact name match + price differs: 0.90 (price update)
- Fuzzy name match + price close: 0.85
- New variant with complete data: 0.85
- Variant not found on source: 0.70 (may be discontinued)

**Overall confidence** = minimum of all per-variant scores

### Step 6: Make Decision

**If confidence >= 0.85** (Auto-execute):
- Sync pricing updates
- Add new variants with extracted data
- Log all changes

**If variant removal detected** (Always require approval):
- Flag removed variants for human review
- Do not auto-delete — may be temporary

**If confidence < 0.85** (Require approval):
- Present diff of changes
- Flag specific variants needing review

### Step 7: Return Result

```json
{
  "success": true,
  "confidence": 0.92,
  "actions_taken": ["sync_variants", "update_pricing"],
  "reasoning": "Found 5 variants on OEM site, matching 4 existing + 1 new. Price update on SR5 variant ($49,990 → $51,490). New GR Sport variant detected.",
  "data": {
    "model": "Toyota Hilux",
    "variants_on_source": 5,
    "variants_in_database": 4,
    "variants_matched": 4,
    "variants_new": 1,
    "variants_removed": 0,
    "changes": [
      {
        "variant": "SR5",
        "type": "price_changed",
        "old_value": 49990,
        "new_value": 51490,
        "confidence": 0.95
      },
      {
        "variant": "GR Sport",
        "type": "new_variant",
        "data": {
          "price_amount": 62990,
          "price_type": "driveaway",
          "body_type": "Double Cab",
          "engine": "2.8L Turbo Diesel"
        },
        "confidence": 0.88
      }
    ],
    "source_url": "https://www.toyota.com.au/hilux",
    "extraction_timestamp": "2026-02-23T10:30:00Z"
  },
  "execution_time_ms": 45000,
  "cost_usd": 0.04
}
```

## Error Handling

1. **Variant selector requires interaction**: Use Playwright to click through tabs/dropdowns
2. **Build & price tool is JavaScript-heavy**: Wait for network idle, extract from API calls
3. **Variant names don't match exactly**: Use fuzzy matching with Levenshtein distance
4. **Multiple price types displayed**: Extract all, match to database price type
5. **OEM site restructured**: Fall back to meta tags and structured data

Always provide detailed reasoning in the result.

## Safety Guardrails

- Never auto-remove variants — only add or update
- Always preserve previous variant data in rollback_data
- Never modify variant data if confidence < 0.85
- Limit to processing one model's variants per execution
- Log all extracted data for audit trail
- Validate price changes are within reasonable range (±30% of current)

## Testing

Test cases:
1. **All variants match, one price change** → Should auto-update price
2. **New variant detected on OEM site** → Should add variant (if confidence high)
3. **Variant missing from OEM site** → Should flag for review (not auto-delete)
4. **Multiple changes across variants** → Should batch updates, maintain atomicity
5. **Variant names changed (e.g., "SR" → "SR5")** → Should fuzzy match and update

## Metrics to Track

- Variants synced per execution
- Price accuracy (% matching source)
- New variant detection rate
- Sync time per model
- False positive rate (incorrect matches)
