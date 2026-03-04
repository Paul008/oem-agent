---
name: oem-sales-rep
description: Conversational AI for OEM product and offer queries. Handles natural language questions about automotive OEM products, offers, and pricing via Slack. Queries Supabase for current data and formats responses with relevant information.
---

# OEM Sales Rep

Conversational AI assistant for querying OEM product and offer information.

## Use Cases

- "What's changed on Ford's site this week?"
- "Show me Kia's current offers"
- "Compare SUV prices across all OEMs"
- "Has Toyota updated their Corolla page?"
- "What are the cheapest electric vehicles available?"

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for data access
- `ANTHROPIC_API_KEY` for Claude Sonnet responses
- `SLACK_BOT_TOKEN` for posting replies

## How It Works

1. Receives natural language query from Slack
2. Classifies query intent (OEMs, products, offers, timeframes)
3. Queries Supabase for relevant data
4. Generates conversational response using Claude Sonnet
5. Posts formatted response to Slack (threaded if applicable)

## Queryable Data

### Supabase Tables
- `oems` — 16 OEM records (id like 'ford-au', 'kia-au')
- `vehicle_models` — Models per OEM (name, body_type, category, model_year)
- `products` — Variants/grades linked to models via model_id FK
- `variant_colors` — Colour options per product (color_name, color_code, price_delta)
- `variant_pricing` — Per-state driveaway pricing (driveaway_nsw/vic/qld/wa/sa/tas/act/nt)
- `accessories` — Accessory catalog per OEM (name, price, category, part_number, inc_fitting)
- `accessory_models` — Many-to-many join: accessories ↔ vehicle_models
- `offers` — Promotional offers and deals
- `discovered_apis` — OEM API endpoints with schema_json documentation

### Product Fields
- **Basic**: title, subtitle, body_type, fuel_type, availability
- **Pricing**: price_amount, price_currency, price_type, price_qualifier
- **Vehicle Specs**: engine_size, cylinders, transmission, gears, drive, doors, seats, drivetrain, engine_desc
- **Variant**: variant_name, variant_code, model_id (FK to vehicle_models)
- **Features**: key_features (OEM marketing features like "Apple CarPlay", "Blind Spot Monitor")
- **Metadata**: meta_json (VIN, registration, odometer, source system references)

### Example Queries
- "What 4-cylinder SUVs are available under $35,000?"
- "Show me vehicles with Apple CarPlay"
- "Compare automatic vs manual transmission options"
- "What electric vehicles have 5+ seats?"

### Dealer API (WP-Compatible)

Public REST endpoints for dealer websites — serves the same data in WordPress REST API format:

- `GET /api/wp/v2/catalog?oem_id={id}` — Full catalog (models + nested variants + colours + pricing)
- `GET /api/wp/v2/models?oem_id={id}` — Active model list
- `GET /api/wp/v2/variants?filter[variant_category]={slug}&oem_id={id}` — Paginated variants per model

Base URL: `https://oem-agent.adme-dev.workers.dev` (no auth required)

## Input

```json
{
  "query": "What are Toyota's current SUV offers?",
  "user_id": "U123456",
  "channel_id": "C789012",
  "thread_ts": "1234567890.123456"
}
```

## Output

- Slack message with formatted product/offer information
- Threaded response if original message was in a thread
