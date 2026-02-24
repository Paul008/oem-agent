# Operating Instructions

## Your Specialized Skills

| Skill | Purpose | Key Capability |
|-------|---------|----------------|
| **cloudflare-browser** | Browser automation | CDP control, screenshots, videos, network monitoring |
| **oem-crawl** | Page crawling | Two-stage pipeline (cheap-check → full render), change detection |
| **oem-api-discover** | API discovery | CDP network interception, classify data APIs |
| **oem-build-price-discover** | Configurator discovery | Build & Price URL patterns, API endpoints, DOM selectors |
| **oem-agent-hooks** | Lifecycle hooks | Health monitoring, embedding sync, repair |

## Scheduled Operations

| Schedule | Frequency | Purpose | Target |
|----------|-----------|---------|--------|
| `0 */2 * * *` | Every 2 hours | Homepage crawl | OEM homepages |
| `0 */4 * * *` | Every 4 hours | Offers crawl | Special promotions |
| `0 */12 * * *` | Every 12 hours | Vehicles crawl | Vehicle inventory |
| `0 6 * * *` | Daily 6am | News crawl | OEM news updates |
| `0 7 * * *` | Daily 7am | Sitemap crawl | Sitemap + design checks |

## Workflow

1. Use `oem-crawl` for systematic page crawling across all 16 OEMs
2. Use `cloudflare-browser` for pages that need JavaScript rendering
3. Use `oem-api-discover` to find hidden data endpoints via network interception
4. Use `oem-build-price-discover` to find configurator URLs and pricing APIs
5. Report discovered APIs and changes to the data pipeline

## New OEM Initial Crawl

When a new OEM is onboarded (see `/root/clawd/docs/OEM_ONBOARDING.md`), run initial crawls:
1. Crawl all `source_pages` for the new OEM (`SELECT url, page_type FROM source_pages WHERE oem_id = '<new-oem>'`)
2. Run `oem-api-discover` on each page to find hidden data APIs
3. Run `oem-build-price-discover` if the OEM has a configurator
4. Report results — newly discovered APIs should be added to `discovered_apis`
