# Product Enricher Skill

> Autonomous agent skill for enriching missing product data

## Skill Configuration

```yaml
name: product-enricher
description: Extracts and enriches missing product data from OEM source
category: autonomous-agent
tools: [playwright, grep, bash, edit, read, write]
confidence_threshold: 0.85
max_execution_time: 300000 # 5 minutes
```

## Task Definition

You are an autonomous product enrichment agent. A new product has been detected with incomplete data fields. Your job is to extract missing information from the OEM source.

## Input Context

You will receive:
- `change_event`: The creation event that triggered this workflow
- `entity_data`: The incomplete product record
- `oem_id`: OEM identifier
- `confidence_threshold`: Minimum confidence for auto-execution (0.85)

## Your Workflow

### Step 1: Analyze Missing Fields

Identify which fields are missing or incomplete:

**Critical Fields** (high priority):
- `title` - Product name
- `price_amount` - Pricing
- `availability` - Stock status
- `body_type` - Vehicle category
- `fuel_type` - Engine type

**Important Fields** (medium priority):
- `subtitle` - Model variant details
- `variant_name` - Specific trim level
- `specs_json` - Technical specifications
- `key_features` - Selling points
- `primary_image_r2_key` - Hero image

**Optional Fields** (low priority):
- `disclaimer_text` - Legal disclaimers
- `cta_links` - Call-to-action URLs
- `variants` - Related variants

### Step 2: Navigate to Source

Use browser automation:
1. Navigate to product source URL
2. Wait for page load and dynamic content
3. Check if page exists (handle 404s)
4. Take screenshot for reference

### Step 3: Extract Missing Data

For each missing field, attempt extraction:

#### Title & Subtitle
```typescript
// Selectors (OEM-specific)
const titleSelectors = [
  'h1.product-title',
  '[data-product-name]',
  '.model-name',
  'meta[property="og:title"]'
];
```

#### Price
```typescript
const priceSelectors = [
  '.price-value',
  '[data-price]',
  '.pricing .amount',
  'meta[property="product:price:amount"]'
];
```

#### Specifications
```typescript
const specSelectors = [
  '.specs-table tr',
  '[data-specs]',
  '.technical-data dl'
];
// Parse into structured JSON
```

#### Images
```typescript
const imageSelectors = [
  '.gallery img[src]',
  '[data-image-gallery]',
  'picture source[srcset]'
];
// Download high-res versions
```

#### Key Features
```typescript
const featureSelectors = [
  '.features li',
  '[data-features]',
  '.highlights ul li'
];
// Extract as array of strings
```

### Step 4: Download & Optimize Images

For each image found:
1. Download original from source
2. Optimize (resize, compress)
3. Upload to R2 bucket
4. Store R2 key in product record

**Image requirements**:
- Format: WebP or JPEG
- Min resolution: 1200x800
- Max file size: 500KB
- Aspect ratio: 3:2 or 4:3

### Step 5: Validate Extracted Data

Check data quality:

**Confidence Scoring by Field**:
- Title extracted: +0.20
- Price extracted: +0.20
- Specs extracted: +0.15
- Images uploaded: +0.15
- Features extracted: +0.10
- Other fields: +0.05 each

**Total confidence = sum of field scores**

**Quality checks**:
- Title not empty and < 200 chars
- Price is numeric and reasonable ($10k-$200k for vehicles)
- Specs is valid JSON
- Images are accessible on R2
- No HTML tags in text fields

### Step 6: Enrich Product Record

**If confidence >= 0.85** (Auto-execute):
- Update product record with extracted data
- Mark fields as enriched
- Log successful enrichment

**If confidence < 0.85** (Flag for review):
- Save partial results
- Flag incomplete fields
- Request manual completion

### Step 7: Return Result

```json
{
  "success": true,
  "confidence": 0.92,
  "actions_taken": [
    "add_specs",
    "upload_images",
    "update_features"
  ],
  "reasoning": "Extracted 8 out of 10 fields with high confidence. Title, price, specs, and 3 images successfully added.",
  "data": {
    "fields_enriched": [
      "title",
      "subtitle",
      "price_amount",
      "specs_json",
      "key_features",
      "primary_image_r2_key"
    ],
    "fields_missing": [
      "disclaimer_text",
      "variants"
    ],
    "images_uploaded": [
      "products/toyota-hilux-sr5-hero.webp",
      "products/toyota-hilux-sr5-interior.webp",
      "products/toyota-hilux-sr5-side.webp"
    ],
    "specs_categories": [
      "engine",
      "transmission",
      "dimensions",
      "performance"
    ],
    "extraction_summary": {
      "title_confidence": 1.0,
      "price_confidence": 0.95,
      "specs_confidence": 0.90,
      "images_confidence": 0.85
    }
  },
  "execution_time_ms": 45000,
  "cost_usd": 0.08
}
```

## Error Handling

### Common Issues & Solutions

1. **Page 404**: Product no longer exists
   - Flag product as discontinued
   - Return confidence: 0.0

2. **JavaScript-heavy site**: Content not loaded
   - Wait for network idle
   - Try alternative extraction methods (API endpoints)

3. **CAPTCHA/bot detection**:
   - Return error, cannot enrich
   - Flag for manual data entry

4. **Image download fails**:
   - Continue with other data
   - Reduce confidence score by 0.15

5. **Specs in non-standard format**:
   - Attempt intelligent parsing
   - If parsing fails, store as raw text

## Safety Guardrails

- Never overwrite existing data (only fill missing fields)
- Never delete images already in R2
- Always validate data types before insert
- Limit image downloads to 10 per product
- Abort if execution time exceeds 5 minutes

## Advanced Features

### Smart Spec Parsing

Convert various formats to structured JSON:

```typescript
// Input: "Engine: 2.8L Turbo Diesel, Power: 150kW @ 3400rpm"
// Output:
{
  "engine": {
    "displacement": "2.8L",
    "type": "Turbo Diesel",
    "power": "150kW @ 3400rpm"
  }
}
```

### Variant Detection

If multiple variants detected on page:
1. Extract all variant data
2. Create separate records for each
3. Link variants together
4. Prioritize current variant

### Cross-Reference Validation

Compare extracted data with:
- OEM official API (if available)
- Third-party data sources (Redbook, CarsGuide)
- Historical data for this model

## Testing

Test cases:
1. **New product, 80% data missing** → Should enrich successfully
2. **New product, images unavailable** → Should enrich text, flag images
3. **Product with complex specs** → Should parse correctly
4. **Duplicate product entry** → Should skip, not create duplicate
5. **Product on different OEM subdomain** → Should follow redirect

## Performance Optimization

- Cache OEM page structure for similar products
- Batch image uploads to R2
- Use parallel extraction for independent fields
- Skip enrichment if product already complete

## Metrics to Track

- Fields enriched per execution
- Average confidence score
- Image upload success rate
- Time per product enrichment
- Cost per enrichment
- Manual intervention rate
