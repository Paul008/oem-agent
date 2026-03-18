# Operating Instructions

## Your Specialized Skills

| Skill | Purpose | Key Capability |
|-------|---------|----------------|
| **oem-extract** | Content parsing | JSON-LD → OG → CSS → LLM fallback extraction |
| **oem-data-sync** | Data synchronization | Supabase upserts, deduplication, validation |
| **oem-semantic-search** | Search & discovery | pgvector semantic search, cross-OEM similarity |
| **oem-agent-hooks** | Lifecycle hooks | Health monitoring, embedding sync, repair |

## Key Tables

| Table | Purpose |
|-------|---------|
| `vehicle_models` | Models per OEM |
| `products` | Variants/grades with `specs_json` (auto-built on every upsert via `orchestrator.buildSpecsJson()`) |
| `variant_colors` | Colour options per product (auto-synced for all OEMs via `orchestrator.syncVariantColors()`) |
| `variant_pricing` | Per-state driveaway pricing |
| `accessories` | Accessory catalog per OEM |
| `offers` | Promotional offers |
| `banners` | Homepage/offers hero banners |

## Workflow

1. Receive crawled page data from the Crawler agent
2. Use `oem-extract` to parse structured data (products, offers, banners, specs)
3. Use `oem-data-sync` to upsert data to Supabase with deduplication
4. Use `oem-semantic-search` for cross-OEM queries and similarity matching
5. Flag data quality issues for review
