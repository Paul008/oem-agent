---
name: oem-sales-rep
description: >
  OEM automotive intelligence assistant for support staff. Query products, offers, pricing,
  colors, specs, and system health across 19 Australian OEMs. Use the Dealer API at
  https://oem-agent.adme-dev.workers.dev/api/wp/v2/ and the system status API at
  https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/admin/system-status for live data.
---

# OEM Sales Rep / Support Staff Assistant

Conversational AI assistant for querying OEM product and offer information. Works via OpenClaw Slack channel or direct message.

## What You Can Ask

### Product & Pricing Queries
- "What's the cheapest Kia SUV?"
- "Compare driveaway prices for mid-size SUVs under $50K"
- "What electric vehicles are available?"
- "Show me all Volkswagen variants"
- "What are the Chery Tiggo 7 specs?"

### Offer & Promotion Queries
- "What are Toyota's current offers?"
- "Which OEMs have finance deals right now?"
- "Show me offers expiring this month"
- "What's the best discount across all OEMs?"

### Color & Accessory Queries
- "What colors does the Mazda CX-5 come in?"
- "How much is premium paint on a Kia Sportage?"
- "What accessories are available for the Hyundai Tucson?"

### System Health Queries
- "What's the system status?"
- "Are all OEMs healthy?"
- "When was Toyota last crawled?"
- "How many products do we have total?"

### Operations
- "Refresh Kia offers"
- "What's changed this week?"
- "Show me OEMs with the most offers"

## How to Get Data

### Dealer API (public, no auth)
Base URL: `https://oem-agent.adme-dev.workers.dev`

| Endpoint | Returns |
|----------|---------|
| `GET /api/wp/v2/catalog?oem_id=kia-au` | Full catalog: models → variants → colors → pricing |
| `GET /api/wp/v2/models?oem_id=volkswagen-au` | Model list with hero images |
| `GET /api/wp/v2/variants?filter[variant_category]=sportage&oem_id=kia-au` | Variants for one model |

### System Status API
| Endpoint | Returns |
|----------|---------|
| `GET /api/v1/oem-agent/admin/system-status` | Per-OEM health: status, success rate, runs, products, offers |

### OEM IDs
`chery-au`, `ford-au`, `foton-au`, `gac-au`, `gmsv-au`, `gwm-au`, `hyundai-au`, `isuzu-au`, `kgm-au`, `kia-au`, `ldv-au`, `mazda-au`, `mitsubishi-au`, `nissan-au`, `renault-au`, `subaru-au`, `suzuki-au`, `toyota-au`, `volkswagen-au`

## Platform Totals (as of 2026-03-19)
- 19 OEMs, 179 models, 796 products
- 4,952 variant colors with hero images
- 1,158 variant pricing rows (driveaway, 8 AU states)
- 322 offers (100% images, 100% disclaimers)
- 176 banners, 2,913 accessories, 108 brochure PDFs

## Queryable Data

### Supabase Tables
- `oems` — 19 OEM records (id like 'ford-au', 'kia-au')
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
