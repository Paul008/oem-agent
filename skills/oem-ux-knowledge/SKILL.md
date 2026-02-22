# OEM UX Knowledge Skill

## Purpose
Static UX knowledge base for automotive OEM page extraction. Contains best practices,
common patterns, and domain-specific knowledge that gets seeded into the Cloudflare
Vectorize index for semantic retrieval during extraction.

## Automotive Page Patterns

### Hero Sections
- Full-width background image or video with overlay text
- Typically the first section on the page
- Common selectors: `.hero`, `[class*="hero"]`, `[class*="banner"]`, `[class*="kv-"]`
- May use `background-image` CSS or `<picture>`/`<img>` elements
- Video heroes common on premium brands (BMW, Mercedes)
- Australian OEMs often include driveaway pricing in hero CTAs

### Tab Sections
- Used for feature highlights, variant comparisons, trim level details
- Common selectors: `[role="tabpanel"]`, `.tab-content`, `.tab_contents`
- Kia uses `.tab_contents` with JS-controlled visibility
- Hyundai uses `[role="tabpanel"]` with ARIA attributes
- Always activate hidden tabs before extraction (display:block)
- Typical tab count: 3-8 tabs per section

### Color Pickers
- Shows available paint colors with swatch images and hero images
- Common patterns: `.color-swatch`, `data-color`, `[class*="colour"]`
- Australian English spelling: "colour" not "color" in classes
- Most OEMs provide hex codes and swatch image URLs
- Some provide 360-degree view images per color (Toyota, Kia)

### Specs Grids
- Structured key-value pairs organized by category
- Categories: Engine, Transmission, Dimensions, Performance, Towing, Capacity, Safety, Wheels
- Common selectors: `.specs`, `[class*="specification"]`, `.data-grid`
- Often in expandable accordion or tabbed layouts
- Australian units: mm (dimensions), L (capacity), kW/Nm (power/torque), L/100km (fuel)

### Gallery Sections
- Image carousels, grids, or lightbox galleries
- Common selectors: `.gallery`, `.swiper`, `.slick`, `[class*="carousel"]`
- Typically 4-20 images per gallery
- May include interior and exterior shots
- Some OEMs use separate gallery sections for interior vs exterior

### Video Sections
- Product showcase, feature demonstrations, lifestyle content
- Sources: YouTube embeds, Brightcove players, direct MP4 URLs
- Common patterns: `<video>`, `data-video-url`, `[class*="video"]`
- Ford uses Brightcove (account 4082198814001)
- Suzuki uses direct wp-content MP4s
- Always extract poster_url as fallback

### Feature Cards
- Grid of feature highlights with icon/image + title + description
- Common selectors: `[class*="feature"]`, `.card-grid`, `.highlight`
- Typical layout: 3-column grid, responsive to 1-column on mobile
- May include icons, small images, or full-width images

### CTA Banners
- Call-to-action sections prompting test drive, dealer visit, configuration
- Usually near bottom of page
- Common CTAs: "Book a Test Drive", "Find a Dealer", "Build & Price", "Download Brochure"
- Often include background color or gradient

## OEM-Specific Patterns

### Kia Australia
- Uses `.tab_contents` for tabs (non-standard)
- JSON-LD structured data in page head
- 360VR CDN for color hero images
- KiaSignature font family
- Primary color: #05141F

### Toyota Australia
- Cloudflare-protected, needs browser rendering
- cdn.rotorint.com for color images
- Sitecore CMS with structured JSON endpoints
- Complex tab structures with nested accordions

### Hyundai Australia
- Content API v3 (no auth required)
- Uses ARIA attributes for tabs
- AEM DAM for media assets
- Clean semantic HTML structure

### Ford Australia
- AEM-based CMS
- GPAS reference data for colors
- Brightcove video integration
- Tends to have complex nested sections

### GWM Australia
- Storyblok CMS (CDN API)
- Clean JSON-based content
- Dokio marketing portal
- Relatively simple page structures

### Nissan Australia
- AEM + Apigee API gateway
- Multiple content APIs
- Pace API for pricing
- Two distinct page templates

### Content Blocks
- Free-form HTML content sections with optional images
- Layout variants: contained (max-width centered), full-width, two-column
- Used for disclaimers, additional info, promotional content
- May include background colors or gradients

### Intro Sections
- Title + body HTML + optional image
- Image position configurable (left/right)
- Used as lead-in section after hero
- Typically shorter text than content blocks

## Page Builder Integration

The page builder at `/dashboard/page-builder/` uses these section types for visual editing:

**Section types in builder** (15): hero, intro, tabs, color-picker, specs-grid, gallery, feature-cards, video, cta-banner, content-block, accordion, enquiry-form, map, alert, divider

**Tab variants**:
- `default` — Horizontal tab bar with underline active state
- `kia-feature-bullets` — Two-column layout with red bullet list, category label, image disclaimers

**Section renderers**: Each section type has a dedicated Vue component in `components/sections/` that renders a live preview in the canvas.

**Template gallery**: Sections from existing generated pages can be browsed, filtered, and inserted into other pages. 10 curated OEM-branded templates available.

**Subpages**: Model pages can have child subpages using `{modelSlug}--{subpageSlug}` convention (e.g., `sportage--performance`). 9 predefined types: specs, design, performance, safety, gallery, pricing, lifestyle, accessories, colours. Plus custom freeform subpages. Subpages share the same section types and template system as parent pages.

## Quality Scoring Criteria

### Score 0.9-1.0 (Excellent)
- All expected sections present (hero, tabs/intro, colors, specs, gallery, CTA)
- No empty content sections
- All image URLs resolve
- Correct section ordering

### Score 0.7-0.89 (Good)
- Most sections present, 1-2 missing
- Minor content issues (e.g., raw HTML in text)
- Some images may not resolve
- Correct section ordering

### Score 0.5-0.69 (Acceptable)
- Several sections missing
- Some content quality issues
- Some broken image URLs
- Mostly correct ordering

### Score < 0.5 (Poor)
- Missing critical sections (hero, specs)
- Significant content quality issues
- Many broken URLs
- Incorrect ordering or duplicate sections
