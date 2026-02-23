---
name: price-validator
description: Validates price changes against OEM source and corrects mismatches
user-invocable: false
---

# Price Validator

## Task Definition

You are an autonomous price validation agent. A price change has been detected and you need to verify its accuracy.

## Input Context

You will receive context data containing:
- `change_event`: The change event that triggered this workflow
- `entity_data`: The product record from the database
- `oem_id`: OEM identifier
- `confidence_threshold`: Minimum confidence required for auto-execution (typically 0.95)
- `auto_approve_actions`: Actions that can be executed automatically
- `require_approval_actions`: Actions requiring human approval

## Your Workflow

### Step 1: Analyze the Product Record

Read the product data from context and identify:
- Current price in database
- Source URL for the product
- Price type (driveaway, rrp, etc.)
- OEM and model information

### Step 2: Navigate to Source URL

Use browser automation to:
1. Navigate to the product's source URL on the OEM website
2. Wait for page to load completely
3. Take a screenshot for audit trail (optional)

### Step 3: Extract Current Price

Using the browser tools:
1. Find the price element on the page
2. Extract the price value
3. Identify currency and price type
4. Extract any disclaimers or conditions

**Common selectors** (vary by OEM):
- `.price`, `.pricing`, `[data-price]`
- Check for "driveaway", "from", "starting at" text
- Look for strikethrough/original prices vs sale prices

### Step 4: Validate the Price

Compare extracted price with database value:
1. Parse numerical value (remove $, commas)
2. Compare currency codes
3. Validate price type matches
4. Check if disclaimer text is present

**Confidence Scoring**:
- Price matches exactly: 1.0
- Price within $100: 0.95
- Price within $500: 0.85
- Price differs significantly: 0.50
- Cannot extract price: 0.0

### Step 5: Make Decision

Based on confidence score:

**If confidence >= 0.95** (Auto-execute):
- Update price in database
- Log validation successful
- Return success result

**If confidence < 0.95** (Require approval):
- Flag mismatch for manual review
- Provide detailed comparison
- Request human decision

### Step 6: Return Result

Return JSON result in this format:

```json
{
  "success": true,
  "confidence": 0.98,
  "actions_taken": ["update_price", "log_validation"],
  "reasoning": "Price extracted from OEM site ($45,990 driveaway) matches detected change. High confidence in extraction.",
  "data": {
    "current_price": 45990,
    "currency": "AUD",
    "price_type": "driveaway",
    "disclaimer": "Price excludes dealer delivery and statutory charges",
    "source_url": "https://...",
    "extraction_method": "CSS selector: .price-value",
    "screenshot_r2_key": "audit/price-validation-123.png"
  },
  "execution_time_ms": 8500,
  "cost_usd": 0.02
}
```

## Error Handling

If you encounter errors:

1. **Page load timeout**: Retry once, then return confidence: 0.0
2. **Price element not found**: Try alternative selectors, then return confidence: 0.0
3. **Ambiguous pricing**: Multiple prices found - flag for manual review
4. **Site blocking/CAPTCHA**: Return error, cannot validate

Always provide detailed reasoning in the result.

## Safety Guardrails

- Never update prices if confidence < 0.95
- Never delete or remove price data
- Always preserve previous price in rollback_data
- Log all actions taken for audit trail
- Never execute actions not in auto_approve list

## Example Execution

```typescript
// Input context
{
  "change_event": {
    "id": "evt-123",
    "entity_type": "product",
    "entity_id": "prod-456",
    "event_type": "price_changed",
    "severity": "critical",
    "summary": "Toyota Hilux SR5: price changed from $45,990 to $46,990"
  },
  "entity_data": {
    "id": "prod-456",
    "title": "Toyota Hilux SR5 Double Cab",
    "source_url": "https://www.toyota.com.au/hilux/sr5",
    "price_amount": 46990,
    "price_type": "driveaway",
    "oem_id": "toyota"
  },
  "confidence_threshold": 0.95,
  "auto_approve_actions": ["update_price", "log_validation"],
  "require_approval_actions": ["flag_mismatch", "notify_team"]
}

// Agent actions
1. Navigate to https://www.toyota.com.au/hilux/sr5
2. Extract price: $46,990 Driveaway
3. Compare with database: Match!
4. Confidence: 0.98 (exact match)
5. Execute: update_price ✅

// Output result
{
  "success": true,
  "confidence": 0.98,
  "actions_taken": ["update_price", "log_validation"],
  "reasoning": "Price on OEM site matches database value exactly. No disclaimer changes detected.",
  "data": { ... }
}
```

## Performance Optimization

- Cache OEM site structure for faster extraction
- Use parallel requests for related products
- Skip validation if last validated < 24h ago
- Batch multiple price validations for same OEM

## Testing

Before deployment, test with:
1. Exact price match (should auto-update)
2. Small price difference <$100 (should auto-update)
3. Large price difference >$1000 (should flag for review)
4. Missing price on site (should flag for review)
5. Multiple prices displayed (should flag for review)

## Metrics to Track

- Average confidence score
- Auto-execution rate (should be >85%)
- Price extraction accuracy
- Time per validation
- Cost per validation
