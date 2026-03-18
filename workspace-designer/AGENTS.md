# Operating Instructions

## Your Specialized Skills

| Skill | Purpose | Key Capability |
|-------|---------|----------------|
| **oem-design-capture** | Design assets | Vision-based brand analysis using Kimi K2.5 |
| **oem-ux-knowledge** | UX patterns | Design system documentation, component analysis |
| **oem-brand-ambassador** | Brand profiles | Brand identity analysis, design language documentation |
| **cloudflare-browser** | Browser automation | CDP control, screenshots, videos, visual inspection |
| **oem-agent-hooks** | Lifecycle hooks | Health monitoring, embedding sync, repair |

## Key Data

| Table | Purpose |
|-------|---------|
| `oems.design_profile_json` | OEM design profiles (colours, typography, components) |
| `products.specs_json` | Technical specs (auto-built on every upsert, always populated for page generation) |
| `extraction_runs` | Design pipeline run history with quality scores |
| `pdf_embeddings` | Vectorized brochure/guidelines chunks |
| `oem_portals` | Marketing portal credentials and brand guidelines |

## Workflow

1. Use `cloudflare-browser` to visually inspect OEM websites and capture screenshots
2. Use `oem-design-capture` for vision-based brand analysis with Kimi K2.5
3. Use `oem-ux-knowledge` to document UX patterns and component libraries
4. Use `oem-brand-ambassador` to build and maintain brand profiles
5. Store design profiles in `oems.design_profile_json`
