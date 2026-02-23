# Brand Ambassador - AI Model Page Generation System

## Overview

The Brand Ambassador system generates AI-powered dealer model pages for OEM websites using a two-stage AI pipeline:
- **Stage 1 (Gemini 2.5 Pro Vision)**: Analyzes screenshot + HTML → structured visual extraction
- **Stage 2 (Claude Sonnet 4.5)**: Visual extraction + DB data → final VehicleModelPage JSON

**Output**: Pages consumed by the promotion-knoxgwmhaval Nuxt app at `pages/models/[slug].vue`

## Architecture

### Storage Layer
- **R2 Storage**: `pages/definitions/{oem_id}/{model_slug}/latest.json`
- **Versioned Backups**: `pages/definitions/{oem_id}/{model_slug}/v{timestamp}.json`
- **Screenshots**: `pages/captures/{oem_id}/{model_slug}/desktop.png`

### Data Flow
```
1. Source Page (OEM website)
   ↓
2. Browser Screenshot + HTML Extraction
   ↓
3. Gemini 2.5 Vision → Visual Structure
   ↓
4. Assemble DB Data (products, colors, offers, accessories)
   ↓
5. Claude Sonnet 4.5 → Final Page JSON
   ↓
6. Validation + R2 Storage
```

## Smart Regeneration System

### Multi-Tier Change Detection

The system uses a 3-tier approach to avoid unnecessary regeneration (saving ~70-80% of costs):

#### **Tier 1: Fast Checks** (0ms cost)
1. **Existence Check**: Generate if page doesn't exist
2. **Age-Based Staleness**:
   - Force regenerate if page > `max_age_days` (default: 30)
   - Skip if page < `min_age_days` (default: 7)

#### **Tier 2: Timestamp Checks** (~50ms cost)
- Query latest `updated_at` from:
  - `vehicle_models`
  - `products`
  - `offers`
  - `vehicle_colors`
- Regenerate if ANY source data is newer than page

#### **Tier 3: Content Hash** (~100ms cost)
- Compute hash of key data:
  - Model name, brochure URL, product count
  - Products: title, price, body type, fuel type
  - Price range (min/max)
  - Colors: name, code, type
  - Offers: title, type, amount, saving
- Compare with stored `source_data_hash`
- Regenerate only if content actually changed

### Configuration

All thresholds are configurable via `config/openclaw/cron-jobs.json`:

```json
{
  "id": "oem-brand-ambassador",
  "config": {
    "regeneration_strategy": {
      "max_age_days": 30,
      "min_age_days": 7,
      "check_source_timestamps": true,
      "check_content_hash": true,
      "priority_threshold": "medium"
    }
  }
}
```

#### Configuration Presets

**Conservative** (minimize costs):
```json
{
  "max_age_days": 60,
  "min_age_days": 14,
  "check_source_timestamps": true,
  "check_content_hash": false,
  "priority_threshold": "high"
}
```

**Aggressive** (maximum freshness):
```json
{
  "max_age_days": 14,
  "min_age_days": 3,
  "check_source_timestamps": true,
  "check_content_hash": true,
  "priority_threshold": "low"
}
```

**Balanced** (default):
```json
{
  "max_age_days": 30,
  "min_age_days": 7,
  "check_source_timestamps": true,
  "check_content_hash": true,
  "priority_threshold": "medium"
}
```

## Cron Schedule

**Schedule**: Tuesday at 4:00 AM AEDT (`0 4 * * 2`)
**Pilot OEMs**: gwm-au, kia-au, hyundai-au
**Max Models per Run**: 10

## Execution Logs

The system provides detailed logging for transparency:

```
[BrandAmbassador] Skipping kia-au/sportage: Page is only 5 days old (<7 day threshold)
[BrandAmbassador] Skipping kia-au/seltos: Page is up-to-date (12 days old, no content changes)
[BrandAmbassador] Regenerating kia-au/ev6: Source data updated 2 days ago (page is 15 days old) (priority: high)
[BrandAmbassador] Regenerating gwm-au/haval-h6: Source data content has changed (hash mismatch) (priority: high)
[BrandAmbassador] Regenerating hyundai-au/ioniq-5: Page is 31 days old (>30 day threshold) (priority: medium)
```

## API Endpoints

### List Generated Pages
```
GET /api/pages/{oem_id}
```

### Get Specific Page
```
GET /api/pages/{oem_id}/{model_slug}
```

### Manual Trigger
```
POST /cron/run/oem-brand-ambassador
```

### Check Regeneration Status
```
GET /api/pages/{oem_id}/{model_slug}/should-regenerate
```

## Metrics & Monitoring

### Cost Tracking
- Gemini 2.5 Pro Vision: ~$0.10-0.30 per page
- Claude Sonnet 4.5: ~$0.05-0.15 per page
- **Total per page**: ~$0.15-0.45
- **Savings from smart regeneration**: 70-80% reduction

### Performance Metrics
- Generation time: 30-60 seconds per page
- Validation errors: <5% (auto-flagged for review)
- Success rate: >95%

## Troubleshooting

### Page Not Generating
1. Check source_pages table for model's source_url
2. Verify screenshot exists in R2 or browser can access URL
3. Check cron run logs at `openclaw/cron-runs/oem-brand-ambassador.json`

### Outdated Pages
1. Check page age: `generated_at` field
2. Verify regeneration strategy thresholds
3. Check if source data has `updated_at` timestamps
4. Force regenerate: `"force_regenerate": true` in cron config

### High Costs
1. Increase `min_age_days` to reduce frequency
2. Set `priority_threshold: "high"` to only catch major changes
3. Disable `check_content_hash` if timestamps are reliable
4. Reduce `max_models_per_run` to spread cost over multiple runs

## Code References

- **Page Generator**: `src/design/page-generator.ts`
- **Cron Handler**: `src/routes/cron.ts` → `executeBrandAmbassador()`
- **Type Definitions**: `src/oem/types.ts` → `VehicleModelPage`, `RegenerationDecision`
- **Configuration**: `config/openclaw/cron-jobs.json`

## Future Enhancements

- [ ] Dashboard UI for viewing/managing generated pages
- [ ] A/B testing framework for page variations
- [ ] Real-time regeneration on price changes >10%
- [ ] Multi-language page generation
- [ ] SEO optimization scoring
- [ ] Performance analytics integration
