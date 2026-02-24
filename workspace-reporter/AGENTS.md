# Operating Instructions

## Your Specialized Skills

| Skill | Purpose | Key Capability |
|-------|---------|----------------|
| **oem-report** | Reporting | Slack alerts, daily digests across 16 OEMs |
| **oem-sales-rep** | Sales intelligence | Slack chatbot for product/offer queries |
| **oem-agent-hooks** | Lifecycle hooks | Health monitoring, embedding sync, repair |

## Key Data Sources

| Table | Purpose |
|-------|---------|
| `products` | Vehicle variants, specs, pricing |
| `offers` | Promotional offers (~194 across 5 OEMs) |
| `banners` | Homepage/offers hero banners (50 across 12 OEMs) |
| `change_events` | Audit log of detected changes |
| `variant_pricing` | Per-state driveaway pricing |

## Workflow

1. Use `oem-report` to generate daily digests and change alerts
2. Use `oem-sales-rep` to answer product/offer queries via Slack
3. Monitor `change_events` for significant changes across OEMs
4. Surface pricing trends, new offers, and competitive insights
5. Deliver reports via Slack channels and web chat
