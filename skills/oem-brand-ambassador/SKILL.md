---
name: oem-brand-ambassador
description: Generate AI-powered dealer model pages using a two-stage pipeline — Gemini 2.5 Vision extracts visual structure, Claude Sonnet 4.5 generates polished HTML content
---

# OEM Brand Ambassador

Orchestrates a two-stage AI page generation pipeline. Gemini 2.5 Pro Vision analyzes OEM page screenshots to extract visual structure, then Claude Sonnet 4.5 generates polished dealer-ready HTML content. Output is VehicleModelPage JSON for the Nuxt app.

## Pipeline Stages

```
1. AUDIT    — Compare vehicle_models DB against OEM website model lists
2. CAPTURE  — Screenshot + DOM extraction via Browser Rendering
3. EXTRACT  — Gemini 2.5 Pro Vision → structured visual data (hero, sections, images, style)
4. GENERATE — Claude Sonnet 4.5 → VehicleModelPage JSON with polished HTML content
5. VALIDATE — Check image URLs, content length, HTML integrity
6. PUBLISH  — Store in R2 at pages/definitions/{oem-id}/{model-slug}/latest.json
```

## Quick Start

```bash
# Run model coverage audit for pilot OEMs
cd dashboard/scripts && node audit-model-coverage.mjs --oem gwm-au

# Manual page generation (via Worker API)
curl -X POST https://worker.example.com/api/v1/oem-agent/admin/generate-page/kia-au/sportage

# Read generated page
curl https://worker.example.com/api/v1/oem-agent/pages/kia-sportage
```

## Architecture

### Data Flow
```
OEM Website → [Browser Rendering] → Screenshot + Cleaned HTML
                                          ↓
                              ┌─── Stage 1: EXTRACT ───┐
                              │  Gemini 2.5 Pro Vision  │
                              │  → Hero images, layout  │
                              │  → Section structure     │
                              │  → Image URLs, specs     │
                              │  → Page style/tone       │
                              └────────────┬────────────┘
                                           ↓
Supabase DB → [Data Assembly] → Products, Colors, Pricing, Offers
                                           ↓
                              ┌─── Stage 2: GENERATE ──┐
                              │  Claude Sonnet 4.5      │
                              │  → Polished HTML body   │
                              │  → Marketing copy       │
                              │  → Tailwind/UnoCSS      │
                              │  → VehicleModelPage JSON │
                              └────────────┬────────────┘
                                           ↓
                              [R2 Bucket Storage]
                                           ↓
                              [Nuxt App by-slug endpoint]
```

### Why Two Models?
- **Gemini excels at seeing**: Best-in-class vision model for analyzing page screenshots, extracting image URLs, understanding visual layout and hierarchy
- **Claude excels at writing**: Superior HTML generation with consistent Tailwind classes, natural marketing copy, reliable JSON output
- **Cost-neutral**: Smaller focused outputs from each model (~$0.05-0.10/page total) vs single large Gemini call (~$0.05-0.15/page)

### VehicleModelPage Interface
```typescript
interface VehicleModelPage {
  id: string           // e.g. "kia-au-sportage"
  slug: string         // e.g. "sportage" or "sportage--performance" (subpage)
  name: string         // e.g. "Sportage"
  oem_id: OemId
  page_type?: 'model' | 'custom' | 'subpage'
  parent_slug?: string       // e.g. "sportage" (set for subpages)
  subpage_type?: string      // e.g. "performance" or "custom"
  subpage_name?: string      // e.g. "Performance" (display name)
  header: {
    slides: [{
      heading: string
      sub_heading: string
      button: string
      desktop: string      // Hero image URL
      mobile: string
      bottom_strip: [{ heading: string; sub_heading: string }]
    }]
  }
  content: {
    rendered: string       // HTML body (rendered via v-html, UnoCSS classes)
  }
  form: boolean
  variant_link: string
  generated_at: string
  source_url: string
  version: number
}
```

## Cron Schedule

| Schedule | Cron | What |
|----------|------|------|
| Weekly | `0 4 * * 2` (Tuesday 4 AM AEST) | Process pilot OEMs: audit → generate changed models |

## Configuration

```json
{
  "stages": ["audit", "capture", "generate", "validate", "publish"],
  "max_models_per_run": 10,
  "force_regenerate": false,
  "pilot_oems": ["gwm-au", "kia-au", "hyundai-au"]
}
```

## R2 Storage Layout

```
pages/
  definitions/
    {oem-id}/
      {model-slug}/
        latest.json          ← Current version (Nuxt reads this)
        v{timestamp}.json    ← Versioned backup for rollback
  captures/
    {oem-id}/
      {model-slug}/
        desktop.png          ← Source screenshot
  audits/
    {oem-id}/
      {date}.json            ← Audit results
```

## Key Files

| File | Purpose |
|------|---------|
| `src/design/page-generator.ts` | PageGenerator class — core pipeline |
| `src/design/agent.ts` | DesignAgent.capturePageForGeneration() — browser capture |
| `src/ai/router.ts` | Gemini 2.5 provider + page_generation task type |
| `src/oem/types.ts` | VehicleModelPage, PageGenerationResult interfaces |
| `src/routes/cron.ts` | executeBrandAmbassador() cron handler |
| `src/routes/oem-agent.ts` | GET /pages/:slug, GET /pages?oemId=X, POST /admin/generate-page, POST /admin/create-subpage, DELETE /admin/delete-subpage |
| `dashboard/src/pages/dashboard/model-pages.vue` | Dashboard UI — browse, preview & regenerate pages, nested subpage management |
| `dashboard/scripts/audit-model-coverage.mjs` | Standalone audit script |

### Page Builder UI

The generated pages can be visually edited in the page builder:

| File | Purpose |
|------|---------|
| `dashboard/src/pages/dashboard/page-builder/[slug].vue` | Visual section editor with live preview, responsive toolbar |
| `dashboard/src/pages/dashboard/page-builder/index.vue` | Template gallery — browse sections from all OEM pages |
| `dashboard/src/composables/use-page-builder.ts` | Editor state: sections, dirty tracking, undo/redo, copy/paste |
| `dashboard/src/composables/use-template-gallery.ts` | Fetch/cache/filter sections from generated pages |
| `dashboard/src/pages/dashboard/components/page-builder/SectionProperties.vue` | Per-type property editor with image thumbnails |
| `dashboard/src/pages/dashboard/components/page-builder/PageBuilderCanvas.vue` | Live preview canvas with async section renderers |
| `dashboard/src/pages/dashboard/components/page-builder/TemplateGalleryDrawer.vue` | In-editor Sheet drawer for browsing/inserting templates |
| `dashboard/src/pages/dashboard/components/page-builder/oem-templates.ts` | 10 curated OEM-branded section templates |
| `dashboard/src/pages/dashboard/components/page-builder/section-templates.ts` | Section type definitions and default data |

**Section types** (15): hero, intro, tabs (default + kia-feature-bullets variants), color-picker, specs-grid, gallery, feature-cards, video, cta-banner, content-block, accordion, enquiry-form, map, alert, divider

**Subpages**: Model pages support child subpages via `{modelSlug}--{subpageSlug}` convention (e.g., `sportage--performance`). 9 predefined types (specs, design, performance, safety, gallery, pricing, lifestyle, accessories, colours) + custom. Editor shows breadcrumb navigation and source URL input for cloning specific OEM subpages.

**Editor features**: Undo/redo (Ctrl+Z/Ctrl+Shift+Z), section copy/paste, duplicate, reorder, media upload (R2), template gallery (from generated pages + curated), responsive toolbar with hamburger overflow menu, image thumbnails in property editor

## Validation Checks

1. All image URLs in `content.rendered` are absolute (https://)
2. Hero image URL in `header.slides[0].desktop` exists
3. `content.rendered` is > 500 characters
4. No unclosed HTML tags
5. Pricing data in content matches Supabase records

## Cost Estimate

- Stage 1 (Gemini 2.5 Pro Vision extraction): ~$0.02-0.05 per page
- Stage 2 (Claude Sonnet 4.5 content generation): ~$0.02-0.05 per page
- Total per page: ~$0.05-0.10
- Browser Rendering: Included in Cloudflare Workers plan
- Steady state: ~$2-5/month (only regenerate on change detection)
- Initial generation (132 models): ~$8-15

## Rollback

Last 3 versions are kept in R2. To rollback:
1. List versions: `r2.list({ prefix: 'pages/definitions/{oem-id}/{slug}/' })`
2. Copy previous version to `latest.json`

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Browser Rendering timeout | 30s timeout, retry once, fall back to DB-only extraction |
| Gemini extraction misses images | Fallback extraction builds from DB color images + product features |
| Claude HTML inconsistency | Detailed Tailwind class reference in prompt; validate output length + structure |
| UnoCSS class mismatches | Provide exact class examples in prompt; post-validate for relative URLs |
| Protected OEM pages (Toyota/Ford) | Use stored browser session cookies; DB-only fallback |
| One model fails | Claude has Gemini as fallback provider; extraction has DB-only fallback |
