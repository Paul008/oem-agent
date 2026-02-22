<script lang="ts" setup>
import { ref, computed } from 'vue'
import { ChevronRight, Cpu, Brain, Layers, Eye, Sparkles, BarChart3, Workflow, Database, Image, Zap, BookOpen, Puzzle, Cog } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { renderMarkdown } from '@/lib/markdown'

interface DocSection {
  id: string
  title: string
  icon: any
  content: string
}

const selectedSection = ref('overview')

const sections: DocSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: BookOpen,
    content: `# Adaptive Page Builder

The Adaptive Page Builder is an AI-powered system that generates structured model pages for all 14 Australian OEMs. It combines multiple AI models, a learning memory layer, and semantic search to produce high-quality page extractions that **improve over time**.

## The Problem

The original page structurer used a generic Gemini prompt for all OEMs. It had no memory of past failures, no visual analysis, and no quality feedback loop. This caused recurring issues:

- Missed gallery sections on Kia pages
- Raw HTML in tab labels for Hyundai
- Broken video URLs for Ford (Brightcove)
- Inconsistent color picker extraction across OEMs

## The Solution

Three memory layers + a multi-model pipeline:

| Layer | Purpose | Storage |
| --- | --- | --- |
| **OEM Design Profiles** | Brand tokens, extraction hints, quality history | Supabase \`oems.design_profile_json\` |
| **Extraction Run History** | Per-run metrics, errors, selectors | Supabase \`extraction_runs\` table |
| **Semantic UX Knowledge** | Vectorized past extractions for similarity search | Cloudflare Vectorize |

Each extraction run feeds back into the system, making the next run smarter.

## Cost

| Component | Per Page | Monthly (132 models) |
| --- | --- | --- |
| Gemini 3.1 Pro (extraction) | $0.02-0.05 | $2.64-6.60 |
| Groq (classification + validation) | $0.001-0.003 | $0.13-0.40 |
| Claude (bespoke components, 10%) | $0.03-0.05 | $0.40-0.66 |
| Google Embeddings | $0.001 | $0.13 |
| **Total** | **$0.03-0.12** | **$3-14** |`,
  },
  {
    id: 'pipeline',
    title: '7-Step Pipeline',
    icon: Workflow,
    content: `# Adaptive Pipeline — 7 Steps

The \`AdaptivePipeline\` class in \`src/design/pipeline.ts\` orchestrates the complete extraction flow. Each step is independent, fault-tolerant, and logged.

## Step 0: CLONE

**Model**: Puppeteer (Browser Rendering) — FREE

Ensures the OEM page is cloned to R2 before extraction. Checks for an existing clone at \`pages/definitions/{oemId}/{modelSlug}/latest.json\` — if found, this step is **skipped** (no duplicate work).

If no clone exists, \`PageCapturer.captureModelPage()\` runs:
- Navigates to the OEM source URL with anti-bot mitigations
- Strips nav/footer/scripts, activates hidden tabs, resolves lazy media
- Downloads images to R2 with per-OEM referer headers
- Rewrites image URLs to \`/media/\` proxy paths
- Stores the result as \`VehicleModelPage\` JSON in R2

**Failure handling**: This step is critical — if the clone fails (e.g. Cloudflare challenge), the entire pipeline throws.

## Step 1: SCREENSHOT

**Model**: Puppeteer (Browser Rendering) — FREE

Navigates to the OEM model page and captures element-level screenshots of major sections. Screenshots are stored to R2 at \`screenshots/{oemId}/{modelSlug}/{sectionId}.jpg\`.

- Finds sections via: \`section\`, \`[class*="section"]\`, \`[class*="hero"]\`, \`[class*="gallery"]\`
- Skips elements smaller than 300x100px
- Caps height at 2000px per screenshot
- Maximum 15 screenshots per page

**Failure handling**: Screenshots are optional — if Puppeteer fails (e.g. Cloudflare challenge), the pipeline continues without visual classification.

## Step 2: CLASSIFY

**Model**: Groq (Llama 3.3 Vision) — ~$0.001/page

Takes each screenshot and classifies the layout type using vision:

\`\`\`json
{
  "layout_type": "hero|gallery|tabs|video|specs|cta|content|unknown",
  "has_video": true,
  "has_carousel": false,
  "dominant_colors": ["#C3002F", "#FFFFFF"],
  "confidence": 0.92
}
\`\`\`

Results inform the extraction step with visual context. Low-confidence classifications (< 0.3) are flagged as known failures for the OEM profile.

**Failure handling**: Skipped if no screenshots. Individual classification failures produce an \`unknown\` result with confidence 0.

## Step 3: EXTRACT

**Model**: Gemini 3.1 Pro + Memory Injection — $0.02-0.05/page

This is the core extraction step. The \`PageStructurer\` reads the cloned HTML from R2 and extracts structured \`PageSection[]\` JSON.

What makes this adaptive is the **SmartPromptBuilder** which injects:

1. **OEM context**: brand colors, fonts, quality history
2. **Extraction hints**: known-good selectors from past runs
3. **Error avoidance**: selectors that failed previously
4. **Similar extractions**: semantic matches from Vectorize
5. **Base prompt**: the 15-section-type schema

**Failure handling**: This step is critical — if extraction fails, the entire pipeline throws.

## Step 4: VALIDATE

**Model**: Groq (Llama 3.3 70B) — ~$0.001/page

A fast, cheap quality check that scores the extraction 0.0-1.0 and identifies issues:

- Missing expected section types (hero, specs, gallery)
- Empty content sections
- Duplicate section IDs
- Tab sections with < 2 tabs
- Galleries with < 2 images

**Failure handling**: If validation fails, a default score of 0.5 is used and the pipeline continues.

## Step 5: GENERATE (Conditional)

**Model**: Claude Sonnet 4.5 — $0.03-0.05/page (only ~10% of pages)

Only triggered when quality score < 0.6 AND there are critical issues. Claude attempts to fix the worst section by regenerating it.

The fixed section is JSON-parsed and swapped into the sections array, replacing the problematic original.

**Failure handling**: If generation fails, the original section is kept.

## Step 6: LEARN

**Storage**: Supabase + Vectorize — FREE

After extraction completes:

1. **Complete the extraction run** in \`extraction_runs\` with quality score, token usage, cost, errors
2. **Update the OEM design profile** via \`learnFromRun()\`:
   - New successful selectors added to hints
   - Failed selectors added to known_failures
   - Error patterns increment common_errors count
   - Quality score updates running average
3. **Index into Vectorize** (if quality >= 0.5): each section becomes a vector for future semantic retrieval

**Failure handling**: Learning failures are logged but don't affect the pipeline result.`,
  },
  {
    id: 'memory',
    title: 'Design Memory',
    icon: Brain,
    content: `# Design Memory System

The \`DesignMemoryManager\` class (\`src/design/memory.ts\`) provides persistent per-OEM learning that accumulates across extraction runs.

## OEM Design Profile

Stored in \`oems.design_profile_json\` as a JSONB column:

\`\`\`json
{
  "brand_tokens": {
    "primary_color": "#C3002F",
    "secondary_colors": ["#FFFFFF", "#333333"],
    "font_family": "KiaSignature",
    "border_radius": "8px",
    "button_style": "rounded"
  },
  "extraction_hints": {
    "hero_selectors": [".kv-hero", "[class*=hero]"],
    "gallery_selectors": [".swiper-container"],
    "tab_selectors": [".tab_contents"],
    "known_failures": [".accordion-panel"],
    "bot_detection": "none",
    "wait_ms_after_load": 2000
  },
  "quality_history": {
    "avg_quality_score": 0.85,
    "total_runs": 12,
    "last_run_at": "2026-02-22T10:30:00Z",
    "common_errors": [
      { "message": "Missing gallery section", "count": 3 },
      { "message": "Empty tab content", "count": 2 }
    ]
  }
}
\`\`\`

## How Learning Works

After each extraction run, \`learnFromRun()\` analyzes the result:

1. **Successful selectors** (confidence > 0.7) are added to extraction hints
2. **Failed selectors** (confidence < 0.3) are added to known_failures
3. **Error patterns** from quality check increment the common_errors count
4. **Quality score** updates the running average using weighted formula:
   - \`new_avg = (old_avg * old_count + new_score) / (old_count + 1)\`

## API

| Method | Purpose |
| --- | --- |
| \`getOemProfile(oemId)\` | Load profile (returns defaults if empty) |
| \`updateOemProfile(oemId, updates)\` | Merge partial updates into profile |
| \`logExtractionRun(input)\` | Create new run record (status: running) |
| \`completeExtractionRun(runId, result)\` | Complete run with metrics |
| \`failExtractionRun(runId, error)\` | Mark run as failed |
| \`getRecentRuns(oemId, limit)\` | Fetch recent run history |
| \`learnFromRun(runId)\` | Analyze run and update OEM profile |

## Extraction Runs Table

The \`extraction_runs\` table stores every pipeline execution:

| Column | Type | Purpose |
| --- | --- | --- |
| \`id\` | UUID | Primary key |
| \`oem_id\` | TEXT | Foreign key to oems |
| \`model_slug\` | TEXT | Which model was extracted |
| \`pipeline\` | TEXT | capturer, cloner, structurer, generator |
| \`status\` | TEXT | running, completed, failed |
| \`sections_extracted\` | INT | Number of sections found |
| \`quality_score\` | NUMERIC(3,2) | 0.00 to 1.00 |
| \`total_tokens\` | INT | Total AI tokens consumed |
| \`total_cost_usd\` | NUMERIC(10,6) | Total cost in USD |
| \`errors_json\` | JSONB | Array of error objects |
| \`successful_selectors\` | JSONB | Selectors that worked |
| \`failed_selectors\` | JSONB | Selectors that failed |
| \`prompt_version\` | TEXT | Which prompt version was used |

Use the **Design Memory** dashboard page to view per-OEM profiles and run history.`,
  },
  {
    id: 'sections',
    title: 'Section Types',
    icon: Layers,
    content: `# Page Section Types

The extraction system produces structured \`PageSection[]\` arrays. Each section has a \`type\` discriminator, a unique \`id\`, and an \`order\` number.

## 15 Section Types

### 1. hero
The full-width banner at the top of the page.

| Field | Type | Description |
| --- | --- | --- |
| \`heading\` | string | Main headline |
| \`sub_heading\` | string | Secondary text |
| \`cta_text\` | string | Button label |
| \`cta_url\` | string | Button link |
| \`desktop_image_url\` | string | Hero image for desktop |
| \`mobile_image_url\` | string | Hero image for mobile |

### 2. intro
Introductory content with optional image.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section title |
| \`body_html\` | string | Cleaned HTML content |
| \`image_url\` | string? | Accompanying image |
| \`image_position\` | string | left, right, or background |

### 3. tabs
Tabbed content sections for feature highlights or variant comparisons.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section title |
| \`tabs\` | array | Tab objects with label, content_html, image_url |
| \`default_tab\` | number | Initially active tab index |

### 4. color-picker
Paint color selector showing available options.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section title |
| \`colors\` | array | Color objects with name, code, swatch_url, hero_image_url, hex |

### 5. specs-grid
Structured specifications organized by category.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section title |
| \`categories\` | array | Category objects with name and specs array (label, value, unit) |

Categories: Engine, Transmission, Dimensions, Performance, Towing, Capacity, Safety, Wheels.

### 6. gallery
Image carousel or grid.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section title |
| \`images\` | array | Image objects with url, alt, caption |
| \`layout\` | string | carousel or grid |

### 7. feature-cards
Grid of feature highlights with icon/image + title + description.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section title |
| \`cards\` | array | Card objects with title, description, image_url |
| \`columns\` | number | 2, 3, or 4 column layout |

### 8. video
Embedded video content.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section title |
| \`video_url\` | string? | Video source URL (MP4, YouTube, Brightcove) |
| \`poster_url\` | string? | Poster/thumbnail image |
| \`autoplay\` | boolean | Whether video autoplays |

### 9. cta-banner
Call-to-action banner near bottom of page.

| Field | Type | Description |
| --- | --- | --- |
| \`heading\` | string | Banner heading |
| \`body\` | string? | Body text |
| \`cta_text\` | string | Button label |
| \`cta_url\` | string | Button link |
| \`background_color\` | string? | Background hex color |

### 10. content-block (fallback)
Universal fallback for content that doesn't fit typed sections.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section title |
| \`content_html\` | string | Cleaned HTML content |
| \`layout\` | string | full-width, contained, or two-column |
| \`background\` | string? | Background hex color |
| \`image_url\` | string? | Optional image |

Used for: award badges, comparison charts, download sections, disclaimer blocks, unique marketing layouts.

### 11. accordion
Expandable FAQ / Q&A panels. Maps to the consuming platform's \`faq\` block.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section heading |
| \`items\` | array | Array of \`{ question: string, answer: string }\` |
| \`section_id\` | string? | Anchor ID for deep linking (e.g. \`#faq\`) |

Templates: FAQ Section, Warranty & Disclaimers.

### 12. enquiry-form
Placeholder for a platform-rendered enquiry form. The page builder only stores the configuration — the consuming platform renders its native form with CAPTCHA, CRM integration, and tracking.

| Field | Type | Description |
| --- | --- | --- |
| \`heading\` | string | Form section heading |
| \`sub_heading\` | string? | Supporting text |
| \`form_type\` | string | \`contact\`, \`test-drive\`, or \`service\` |
| \`vehicle_context\` | boolean | Whether to pre-fill vehicle info |

Templates: General Enquiry, Book a Test Drive.

### 13. map
Google Maps embed for dealer locations.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Section heading |
| \`sub_heading\` | string? | Supporting text |
| \`embed_url\` | string | Google Maps embed URL |

Templates: Dealer Location Map.

### 14. alert
Coloured notification banner for promotions, warnings, or disclaimers. Rendered as styled HTML in the platform's \`html\` block.

| Field | Type | Description |
| --- | --- | --- |
| \`title\` | string? | Alert heading |
| \`message\` | string | Alert body text |
| \`variant\` | string | \`info\`, \`warning\`, \`success\`, or \`destructive\` |
| \`dismissible\` | boolean | Whether the user can close the alert |

Templates: Promo Alert, Safety Notice, Disclaimer.

### 15. divider
Visual separator between sections. Maps to the platform's \`divider\` block.

| Field | Type | Description |
| --- | --- | --- |
| \`style\` | string | \`line\` (horizontal rule), \`space\` (empty padding), or \`dots\` (three dots) |
| \`spacing\` | string | \`sm\` (py-4), \`md\` (py-8), or \`lg\` (py-16) |

Templates: Simple Line, Large Spacer.

## Validation Rules

The \`PageStructurer.validateSections()\` method enforces:

- Sections must have valid type and minimum content
- Hero needs heading OR image
- Tabs need >= 1 tab
- Gallery needs >= 1 image
- Color picker needs >= 1 color
- Specs grid needs >= 1 category
- CTA banner needs heading AND cta_text
- Content block needs content_html
- Accordion needs >= 1 item with question
- Alert needs message
- Divider needs valid style and spacing
- Enquiry form needs heading and form_type
- Map embed_url should be a valid Google Maps URL
- Sections are re-ordered top-to-bottom
- IDs are generated as \`section-{type}-{index}\``,
  },
  {
    id: 'smart-prompts',
    title: 'Smart Prompts',
    icon: Sparkles,
    content: `# Smart Prompt Builder

The \`SmartPromptBuilder\` class (\`src/design/prompt-builder.ts\`) constructs extraction prompts that incorporate OEM-specific context from the memory system.

## Prompt Composition

Every extraction prompt is assembled from 5 blocks:

### 1. OEM Context Block

\`\`\`
## OEM Identity: kia-au
Primary color: #C3002F
Font: KiaSignature
Average quality: 0.85/1.00 over 12 runs
\`\`\`

Sourced from \`oems.design_profile_json\` brand tokens and quality history.

### 2. Context Block

\`\`\`
## Context
Model: sportage
Source: https://www.kia.com/au/sportage/
\`\`\`

The model slug and source URL for this specific extraction.

### 3. Extraction Hints Block

\`\`\`
## Extraction Hints (from past runs)
- Hero selectors: .kv-hero, [class*=hero]
- Gallery selectors: .swiper-container
- Tab selectors: .tab_contents
\`\`\`

Known-good CSS selectors discovered in previous successful extractions for this OEM.

### 4. Similar Extractions Block (Vectorize)

\`\`\`
## Similar Successful Extractions
- kia-au/seltos: Gallery used .swiper-container with 12 images (score: 0.92)
- hyundai-au/tucson: Hero had background-image in inline style (score: 0.88)
\`\`\`

Semantic search results from Cloudflare Vectorize, showing what worked for similar pages. Filtered to matches with quality >= 0.7 and similarity > 0.5.

### 5. Known Issues Block

\`\`\`
## Known Issues
AVOID these selectors (failed previously): .accordion-panel, .lazy-load-wrapper
Common errors to avoid:
  - "Missing gallery section" (occurred 3x)
  - "Empty tab content" (occurred 2x)
Last run score: 0.72/1.00
\`\`\`

Error patterns and failed selectors from the OEM's history, plus the most recent quality score.

### 6. Base Prompt

The 15-section-type schema with extraction rules (absolute URLs, clean HTML, section ordering, etc.).

## How It Improves Over Time

- **Run 1** (no memory): Generic prompt, baseline quality
- **Run 2**: Includes successful selectors from run 1
- **Run 3**: Avoids known failures, uses hints, benefits from similar OEM extractions
- **Run N**: Accumulated knowledge makes each run more targeted and reliable

The prompts grow in specificity without growing in size — only the most relevant hints are included (top 5 selectors, top 3 errors, top 5 similar extractions).`,
  },
  {
    id: 'vectorize',
    title: 'UX Knowledge Base',
    icon: Database,
    content: `# Semantic UX Knowledge Base

The \`UxKnowledgeManager\` class (\`src/design/ux-knowledge.ts\`) manages a Cloudflare Vectorize index that stores vectorized representations of successful page extractions.

## How It Works

1. After a successful extraction (quality >= 0.5), each section is summarized as text
2. The summary is embedded using Google \`text-embedding-004\` (768 dimensions)
3. The vector + metadata is upserted into the \`ux-knowledge-base\` Vectorize index
4. During future extractions, similar past sections are retrieved and injected into prompts

## Vector Metadata

Each vector stores:

| Field | Type | Example |
| --- | --- | --- |
| \`oem_id\` | string | kia-au |
| \`model_slug\` | string | sportage |
| \`section_type\` | string | gallery |
| \`section_summary\` | string | Gallery with 12 images, carousel layout |
| \`quality_score\` | number | 0.92 |

## Section Summarization

Each section type is summarized differently:

- **hero**: \`"Heading: {heading}. Has desktop image. Has mobile image."\`
- **tabs**: \`"3 tabs. Tab: Features. Tab: Safety. Tab: Technology."\`
- **gallery**: \`"12 images, carousel layout"\`
- **color-picker**: \`"8 colors"\`
- **specs-grid**: \`"4 categories"\`
- **video**: \`"Has video URL. Has poster."\`
- **feature-cards**: \`"6 cards in 3 columns"\`
- **cta-banner**: \`"Heading: Book a Test Drive"\`

## Querying

Similarity search supports filtering:

\`\`\`
findSimilarExtractions("hero section for kia sportage", {
  oemId: "kia-au",       // optional: filter to same OEM
  sectionType: "hero",   // optional: filter to section type
  topK: 5                // how many results
})
\`\`\`

Results include a \`similarity_score\` (0-1) from cosine distance. Only matches with quality >= 0.7 and similarity > 0.5 are injected into prompts.

## Vectorize Index

- **Binding**: \`UX_KNOWLEDGE\` in \`wrangler.jsonc\`
- **Index**: \`ux-knowledge-base\`
- **Dimensions**: 768 (Google text-embedding-004)
- **Metric**: Cosine similarity
- **Cost**: FREE tier covers 30M stored dimensions, 5M queries/month

## Static Knowledge Seed

The \`skills/oem-ux-knowledge/SKILL.md\` file contains static UX patterns that can be seeded into Vectorize:

- Automotive page patterns (hero, tabs, color pickers, specs, galleries)
- OEM-specific quirks (Kia tab selectors, Toyota Cloudflare protection, Ford Brightcove)
- Quality scoring criteria`,
  },
  {
    id: 'models',
    title: 'AI Models Used',
    icon: Cpu,
    content: `# AI Model Routing

The \`AiRouter\` class (\`src/ai/router.ts\`) manages multi-provider AI routing with fallback chains. The page builder uses 4 task types routed to different models.

## Task Routing Table

| Task Type | Primary Provider | Model | Cost | Purpose |
| --- | --- | --- | --- | --- |
| \`quick_scan\` | Groq | Llama 3.3 (fast_classify) | ~$0.001 | Screenshot classification |
| \`extraction_quality_check\` | Groq | Llama 3.3 (balanced) | ~$0.001 | Quality validation |
| \`page_structuring\` | Google Gemini | Gemini 3.1 Pro | ~$0.03 | Main HTML extraction |
| \`bespoke_component\` | Anthropic | Claude Sonnet 4.5 | ~$0.05 | Section regeneration |

## Groq (Classification + Validation)

- **API**: \`api.groq.com/openai/v1\`
- **Key env**: \`GROQ_API_KEY\`
- **Supports vision**: Yes (multimodal content array with base64 images)
- **Response format**: JSON mode
- **Speed**: ~2000 tokens/sec

Used for two fast, cheap operations:
1. **Quick scan**: Classify screenshot layout type with vision
2. **Quality check**: Score extraction quality and identify issues

## Google Gemini (Extraction)

- **API**: \`generativelanguage.googleapis.com/v1beta\`
- **Key env**: \`GOOGLE_API_KEY\`
- **Model**: Gemini 3.1 Pro (or 2.5 Pro fallback)
- **Context**: ~1M tokens

The main extraction model. Receives cleaned HTML + memory-injected prompt and returns structured \`PageSection[]\` JSON.

## Anthropic Claude (Bespoke Components)

- **API**: \`api.anthropic.com/v1\`
- **Key env**: \`ANTHROPIC_API_KEY\`
- **Model**: Claude Sonnet 4.5

Only used when quality drops below 0.6 with critical issues (~10% of pages). Regenerates the worst section.

## Google Embeddings (Vectorize)

- **API**: \`generativelanguage.googleapis.com/v1beta\`
- **Model**: text-embedding-004
- **Dimensions**: 768
- **Key env**: \`GOOGLE_API_KEY\`

Used by UxKnowledgeManager for indexing and querying the semantic knowledge base.

## Fallback Chains

Each task type has a fallback provider:

- \`quick_scan\`: Groq fast_classify -> Groq balanced
- \`extraction_quality_check\`: Groq balanced -> Groq powerful
- \`page_structuring\`: Gemini 3.1 Pro -> Gemini 2.5 Pro
- \`bespoke_component\`: Claude Sonnet -> Gemini 2.5 Pro`,
  },
  {
    id: 'quality',
    title: 'Quality Scoring',
    icon: BarChart3,
    content: `# Quality Scoring System

Every extraction is scored 0.00 to 1.00 by the Groq quality checker. This score drives the learning loop and determines whether bespoke regeneration is needed.

## Scoring Criteria

### Score 0.90-1.00 (Excellent)
- All expected sections present: hero, tabs/intro, colors, specs, gallery, CTA
- No empty content sections
- All image URLs resolve
- Correct section ordering (hero first, CTA last)

### Score 0.70-0.89 (Good)
- Most sections present, 1-2 missing
- Minor content issues (e.g., raw HTML in text)
- Some images may not resolve
- Correct section ordering

### Score 0.50-0.69 (Acceptable)
- Several sections missing
- Some content quality issues
- Some broken image URLs
- Mostly correct ordering

### Score below 0.50 (Poor)
- Missing critical sections (hero, specs)
- Significant content quality issues
- Many broken URLs
- Incorrect ordering or duplicate sections

## Quality Check Validation Rules

The Groq validator checks:

1. Page SHOULD have a hero section
2. Section IDs must be unique
3. Sections should have content (not empty)
4. Tab sections should have >= 2 tabs
5. Gallery should have >= 2 images
6. Color picker should have >= 1 color
7. Expected types for a car page: hero, intro/tabs, color-picker, specs-grid, gallery, cta-banner

## Quality-Driven Actions

| Score Range | Action |
| --- | --- |
| >= 0.6 | Accept as-is, index to Vectorize |
| 0.5-0.59 | Index to Vectorize, but skip bespoke generation |
| < 0.6 + critical issues | Trigger Claude bespoke regeneration (Step 5) |
| < 0.5 | Do NOT index to Vectorize (prevents pollution) |

## Profile Quality Tracking

The OEM design profile tracks:

- **avg_quality_score**: Running weighted average across all runs
- **total_runs**: How many extractions have been performed
- **last_run_at**: When the last extraction completed
- **common_errors**: Error messages with occurrence counts (sorted by frequency)

This data is visible on the **Design Memory** dashboard page.`,
  },
  {
    id: 'files',
    title: 'File Reference',
    icon: Puzzle,
    content: `# File Reference

## Core Pipeline Files

| File | Class/Module | Purpose |
| --- | --- | --- |
| \`src/design/pipeline.ts\` | \`AdaptivePipeline\` | 6-step orchestrator |
| \`src/design/page-structurer.ts\` | \`PageStructurer\` | HTML -> PageSection[] extraction |
| \`src/design/page-capturer.ts\` | \`PageCapturer\` | Puppeteer page download + section screenshots |
| \`src/design/page-cloner.ts\` | \`PageCloner\` | Full page clone with Kimi K2 generation |
| \`src/design/page-generator.ts\` | \`PageGenerator\` | Two-stage Gemini+Claude generation |

## Memory & Intelligence

| File | Class/Module | Purpose |
| --- | --- | --- |
| \`src/design/memory.ts\` | \`DesignMemoryManager\` | OEM profile CRUD + run logging + learning |
| \`src/design/prompt-builder.ts\` | \`SmartPromptBuilder\` | Memory-injected extraction prompts |
| \`src/design/extraction-runner.ts\` | \`ExtractionRunner\` | Wraps extraction calls with logging |
| \`src/design/ux-knowledge.ts\` | \`UxKnowledgeManager\` | Vectorize index/query for semantic retrieval |
| \`src/design/component-generator.ts\` | \`ComponentGenerator\` | Bespoke Vue SFC generation via Claude |

## Supporting Files

| File | Purpose |
| --- | --- |
| \`src/design/agent.ts\` | DesignAgent + OEM_BRAND_NOTES fallback data |
| \`src/design/index.ts\` | Barrel exports for all design modules |
| \`src/ai/router.ts\` | Multi-provider AI routing with task types |
| \`src/oem/types.ts\` | TypeScript interfaces (OemDesignProfile, PageSection, etc.) |
| \`src/types.ts\` | Worker bindings (AI, UX_KNOWLEDGE, BROWSER) |

## Database

| Table/Column | Purpose |
| --- | --- |
| \`oems.design_profile_json\` | Per-OEM accumulated design knowledge |
| \`extraction_runs\` | Extraction run history with metrics |

## Infrastructure

| Resource | Binding | Purpose |
| --- | --- | --- |
| R2 Bucket | \`MOLTBOT_BUCKET\` | Screenshots, page definitions, bespoke components |
| Vectorize | \`UX_KNOWLEDGE\` | Semantic UX knowledge index (768-dim) |
| Browser | \`BROWSER\` | Puppeteer for page rendering |
| Workers AI | \`AI\` | Edge inference (reserved for future use) |

## API Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | \`/admin/adaptive-pipeline/:oemId/:modelSlug\` | Run full 6-step adaptive pipeline |
| POST | \`/admin/generate-page/:oemId/:modelSlug\` | Generate page (Kimi/Gemini+Claude) |
| POST | \`/admin/clone-page/:oemId/:modelSlug\` | Clone page via Puppeteer + AI |
| POST | \`/admin/structure-page/:oemId/:modelSlug\` | Structure page from cloned HTML |
| GET | \`/design-memory/:oemId\` | Get OEM design profile |
| GET | \`/extraction-runs\` | List extraction run history |

## Dashboard Pages

| Page | URL | Purpose |
| --- | --- | --- |
| Model Pages | \`/dashboard/model-pages\` | Browse, preview, regenerate pages |
| Design Memory | \`/dashboard/design-memory\` | Per-OEM profiles and run history |
| Page Builder Docs | \`/dashboard/page-builder-docs\` | This documentation |`,
  },
  {
    id: 'configuration',
    title: 'Configuration',
    icon: Cog,
    content: `# Configuration & Environment

## Required Environment Variables

| Variable | Provider | Used By |
| --- | --- | --- |
| \`GOOGLE_API_KEY\` | Google AI | Gemini extraction + text-embedding-004 |
| \`GROQ_API_KEY\` | Groq | Quick scan + quality validation |
| \`ANTHROPIC_API_KEY\` | Anthropic | Bespoke component generation |
| \`TOGETHER_API_KEY\` | Together AI | Kimi K2.5 screenshot-to-code |
| \`SUPABASE_URL\` | Supabase | Database access |
| \`SUPABASE_SERVICE_ROLE_KEY\` | Supabase | Service role for writes |

## Cloudflare Bindings (wrangler.jsonc)

\`\`\`json
{
  "r2_buckets": [{ "binding": "MOLTBOT_BUCKET", "bucket_name": "moltbot-assets" }],
  "vectorize": [{ "binding": "UX_KNOWLEDGE", "index_name": "ux-knowledge-base" }],
  "browser": { "binding": "BROWSER" },
  "ai": { "binding": "AI" }
}
\`\`\`

## Pipeline Constants

| Constant | Value | Location |
| --- | --- | --- |
| \`BESPOKE_QUALITY_THRESHOLD\` | 0.6 | pipeline.ts |
| \`MAX_SECTION_SCREENSHOTS\` | 15 | page-capturer.ts |
| \`MAX_HTML_LENGTH\` | 80,000 | page-generator.ts |
| \`MAX_IMAGE_DOWNLOADS\` | 30-40 | page-generator.ts, page-cloner.ts |
| \`IMAGE_DOWNLOAD_TIMEOUT\` | 8,000ms | page-generator.ts, page-cloner.ts |

## Vectorize Index Setup

To create the Vectorize index (one-time):

\`\`\`
wrangler vectorize create ux-knowledge-base --dimensions 768 --metric cosine
\`\`\`

## Running the Pipeline

Via dashboard: Navigate to **Model Pages**, select a model, click **Regenerate**.

Via API:

\`\`\`
POST /admin/adaptive-pipeline/kia-au/sportage
\`\`\`

The response includes:

\`\`\`json
{
  "success": true,
  "oem_id": "kia-au",
  "model_slug": "sportage",
  "steps": [
    { "step": "screenshot", "status": "success", "duration_ms": 4200 },
    { "step": "classify", "status": "success", "duration_ms": 1800 },
    { "step": "extract", "status": "success", "duration_ms": 8500 },
    { "step": "validate", "status": "success", "duration_ms": 900 },
    { "step": "generate", "status": "skipped", "duration_ms": 0 },
    { "step": "learn", "status": "success", "duration_ms": 350 }
  ],
  "quality_score": 0.88,
  "total_tokens": 12450,
  "total_cost_usd": 0.0342,
  "total_duration_ms": 15750,
  "screenshots_captured": 8
}
\`\`\``,
  },
]

const selectedDoc = computed(() => {
  return sections.find(s => s.id === selectedSection.value) || sections[0]
})
</script>

<template>
  <BasicPage title="Page Builder Architecture" description="How the adaptive AI page builder works — pipeline, memory, models, and configuration" sticky>
    <div class="flex gap-4">
      <!-- Sidebar: Section list -->
      <div class="w-56 shrink-0 space-y-1">
        <p class="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2 px-2">
          Documentation
        </p>
        <button
          v-for="section in sections"
          :key="section.id"
          class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors"
          :class="selectedSection === section.id
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-muted text-foreground'"
          @click="selectedSection = section.id"
        >
          <component :is="section.icon" class="size-3.5 shrink-0" />
          <span class="truncate">{{ section.title }}</span>
          <ChevronRight v-if="selectedSection === section.id" class="size-3 ml-auto shrink-0" />
        </button>
      </div>

      <!-- Main content: rendered docs -->
      <UiCard class="flex-1 min-w-0">
        <UiCardContent class="p-6">
          <div v-html="renderMarkdown(selectedDoc.content)" />
        </UiCardContent>
      </UiCard>
    </div>
  </BasicPage>
</template>
