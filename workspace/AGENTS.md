# Operating Instructions

## Your 10 Specialized Skills

| Skill | Purpose | Key Capability |
|-------|---------|----------------|
| **cloudflare-browser** | Browser automation | CDP control, screenshots, videos, network monitoring |
| **oem-agent-hooks** | Lifecycle hooks | Pre/post crawl actions, data validation |
| **oem-api-discover** | API discovery | Classify network requests, identify data APIs |
| **oem-build-price-discover** | Pricing extraction | Build & Price tools, trim/package pricing |
| **oem-crawl** | Page crawling | Scheduled crawls, change detection, content extraction |
| **oem-design-capture** | Design assets | Screenshots, color palettes, visual themes |
| **oem-extract** | Content parsing | Structured data extraction from HTML |
| **oem-report** | Reporting | Generate crawl reports, analytics dashboards |
| **oem-sales-rep** | Sales intelligence | Dealer locators, inventory availability |
| **oem-semantic-search** | Search & discovery | Vector embeddings, semantic similarity |

**Skills Location**: /root/clawd/skills/ (each has detailed SKILL.md documentation)

## Scheduled Operations

Your automated crawl schedule:

| Schedule | Frequency | Purpose | Target |
|----------|-----------|---------|--------|
| `0 */2 * * *` | Every 2 hours | Homepage crawl | OEM homepages |
| `0 */4 * * *` | Every 4 hours | Offers crawl | Special promotions |
| `0 */12 * * *` | Every 12 hours | Vehicles crawl | Vehicle inventory |
| `0 6 * * *` | Daily 6am | News crawl | OEM news updates |
| `0 7 * * *` | Daily 7am | Sitemap crawl | Sitemap + design checks |

**Handler**: `src/scheduled.ts` → `OemAgentOrchestrator.runScheduledCrawl()`

## Workflow Guidelines

1. **Browser Automation**: Use `cloudflare-browser` skill for visual inspection and interaction
2. **Data Collection**: Use `oem-crawl` for systematic page crawling
3. **API Discovery**: Use `oem-api-discover` to find hidden data endpoints
4. **Content Extraction**: Use `oem-extract` for structured data parsing
5. **Storage**: Save to Supabase via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
6. **Reporting**: Use `oem-report` to generate insights and analytics

## Documentation Resources

Reference documentation available in `/root/clawd/docs/`:

### Architecture & Setup
- **OEM_AGENT_ARCHITECTURE.md** - Complete system architecture and component details
- **IMPLEMENTATION_SUMMARY.md** - Implementation notes and key decisions
- **BROWSER_RENDERING_SETUP.md** - Cloudflare Browser Rendering configuration
- **DATABASE_SETUP.md** - Database schema and table structures
- **DATABASE_RESTRUCTURE.md** - Latest database schema updates

### Crawl Configuration
- **crawl-config-v1.2.md** - Comprehensive crawl configuration reference (109KB)
- **BROWSER_AUTOMATION_RD.md** - Browser automation patterns and research

### OEM-Specific Guides
- **FORD_EXTRACTION_STATUS.md** - Ford data extraction implementation
- **FORD_COLOR_GALLERY_INVESTIGATION.md** - Ford color gallery analysis
- **kia-au-extraction-report.md** - Kia Australia extraction details
- **ford-*.md** - Various Ford implementation reports

### Network & Testing
- **network-browser-utility.md** - Network capture utilities
- **network-capture-research.md** - Network analysis patterns
- **e2e-test-results.md** - End-to-end test results

**Usage**: Read these files when you need detailed technical information about specific components or OEM implementations.

## Memory & Context

- **R2 Backup**: Conversations sync to R2 every 30 seconds
- **Workspace**: Located at /root/clawd/
- **Config**: /root/.openclaw/openclaw.json
- **Persistence**: ✅ Enabled - conversations persist across restarts
