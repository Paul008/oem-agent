# Tailwind Recipe Compiler Design

## Context

OEM Agent can already capture high-fidelity production clone HTML and can render database-bound structured sections. The missing bridge is an enterprise-grade way to turn selected OEM page regions into clean Tailwind/Vue recipes without injecting raw OEM CSS into downstream dealer sites.

The immediate pressure came from Mitsubishi pages in the dealer monolith: raw OEM styles can bleed into the host app, while removing those styles loses the OEM UI. The target outcome is a structured renderer that can match Mitsubishi/Ford UX closely, stay editable, and remain safe to embed in external apps.

External R&D found useful tools, but no complete solution:

- `Jackardios/css-to-tailwindcss` can convert CSS declarations into Tailwind classes, including media/state variants and arbitrary values.
- Tailfind and Tailscan can inspect live pages and export selected elements as Tailwind-ready markup.
- Screenshot-to-code projects can generate approximate Tailwind HTML from images, but still need deterministic data binding and visual QA.

The design uses those findings as inputs, not as a turnkey replacement for our pipeline.

## Goal

Build a Tailwind recipe compiler that converts captured OEM regions into structured, scoped, editable Tailwind section recipes.

The first pilot is the Mitsubishi Outlander variant/colour picker. It is compact, visually important, interactive, and already maps to known database data.

## Non-Goals

- Do not inject OEM stylesheet links into production dealer pages.
- Do not iframe the production model page as the default solution.
- Do not attempt to convert an entire OEM website in one pass.
- Do not replace the existing production clone preview; it remains the visual source of truth and fallback reference.
- Do not require AI output to be trusted without deterministic validation.

## Architecture

Add a compiler layer in `src/design` that sits between capture and structured rendering:

1. Capture a selected OEM region at desktop, tablet, and mobile viewport sizes.
2. Extract DOM structure, computed styles, media assets, text content, attributes, and interaction hints from the rendered region.
3. Normalize extracted style declarations into a compact CSS declaration model.
4. Convert declarations into Tailwind candidates.
5. Classify the section type and generate a structured recipe payload.
6. Render the recipe through existing dashboard section renderers.
7. Verify the rendered section against the OEM reference with screenshot comparison and layout checks.

The compiler should prefer deterministic extraction and conversion. AI may assist with section classification, semantic grouping, and recipe generation, but AI output must be validated by the compiler and visual QA.

## Components

### Region Style Extractor

Input:
- Captured region root element.
- Current viewport metadata.
- Rendered page URL and OEM/model identifiers.

Output:
- Node tree with stable paths.
- Computed style allowlist per node.
- Text and media metadata.
- Responsive snapshots keyed by viewport.

The style allowlist should start with layout, spacing, sizing, typography, colour, border, shadow, transform, object-fit, display, and visibility properties. It should avoid dumping every browser-computed property.

### Tailwind Declaration Mapper

Input:
- Normalized CSS declarations.
- OEM design tokens if available.
- Tailwind config context.

Output:
- Tailwind classes.
- Arbitrary classes for exact values.
- Unmapped declarations.
- Confidence score.

Use Tailwind arbitrary values for the first fidelity pass, for example `text-[42px]`, `bg-[#ed0000]`, `grid-cols-[minmax(0,1fr)_420px]`. Later passes can consolidate repeated arbitrary values into OEM tokens.

`css-to-tailwindcss` is a candidate dependency for this mapper. If it cannot handle a declaration safely, preserve the declaration as an explicit unmapped item instead of silently dropping it.

### Recipe Generator

Input:
- Extracted node tree.
- Tailwind class candidates.
- Section classification.
- Database context for OEM/model/product/variant/colour.

Output:
- Existing page-builder section JSON when a known type matches.
- A raw `content-block` fallback only when typed conversion confidence is too low.

For the Mitsubishi pilot, the preferred output is `variant-color-explorer`, using database-backed products and colours while preserving OEM-like layout, tabs, swatches, feature disclosure, CTA, and responsive behaviour.

### Visual QA Runner

Input:
- OEM reference screenshot.
- Generated Tailwind section screenshot.
- Viewport metadata.

Output:
- Pass/fail result.
- Pixel diff or structural layout notes.
- Missing media and overflow diagnostics.

The QA runner should cover desktop, tablet, and mobile. It should detect broken images, hidden text, major overflow, and accidental host-page bleed.

## Data Flow

1. User selects a region in Clone Studio or preview.
2. The capture bridge serializes region HTML and computed style snapshots.
3. The worker stores or processes a region extraction artifact.
4. The compiler maps extracted styles to Tailwind candidates.
5. The compiler emits a section recipe with confidence metadata.
6. The dashboard previews the recipe in sections mode.
7. Visual QA compares the generated output against the captured OEM reference.
8. Approved recipes can be saved and used by production model pages.

## Mitsubishi Pilot

The Outlander variant/colour picker should become the first pilot because it exercises the exact production needs:

- Grade tabs such as ES, LS, Black Edition, Aspire, Exceed, and Exceed Tourer.
- Vehicle image stage.
- Colour swatches with selected colour label.
- Key features disclosure.
- Build-your-own CTA.
- Desktop and mobile responsive layouts.

The generated component should use our Supabase product and colour data, not scrape-time static content, when matching rows exist. Captured OEM layout remains the style reference.

## Error Handling

- If a region lacks enough computed styles, return a diagnostic result and keep the clone fallback.
- If Tailwind mapping confidence is low, emit unmapped declarations and do not auto-save a typed recipe.
- If database data is missing, render fallback recipe data and mark the recipe as partially bound.
- If visual QA fails, keep the generated section as draft and include failure notes.
- If media URLs cannot be resolved, preserve the original URL and flag the asset for media-library import.

## Testing

Unit tests:
- Style allowlist extraction.
- CSS declaration normalization.
- Tailwind class mapping, including arbitrary values.
- Unmapped declaration preservation.
- Recipe confidence decisions.

Integration tests:
- Mitsubishi Outlander region artifact converts into a `variant-color-explorer` recipe.
- Generated recipe renders without host CSS bleed.
- Mobile, tablet, and desktop outputs include the expected responsive classes.

Visual tests:
- Compare generated Mitsubishi pilot screenshots against the OEM reference.
- Check for broken media, clipped text, and layout overflow.

## Implementation Slices

1. Add a read-only extraction artifact shape and tests.
2. Add CSS declaration to Tailwind candidate mapping.
3. Add recipe compiler output for `variant-color-explorer`.
4. Add dashboard preview path for compiled recipe drafts.
5. Add visual QA for the Mitsubishi pilot.
6. Expand section coverage after the pilot passes.

## Self-Review

- No placeholder requirements remain.
- Scope is limited to a compiler pilot, not a full OEM website conversion.
- The design separates capture, conversion, recipe generation, and QA.
- Raw CSS injection and iframe rendering are explicitly excluded as default production strategies.
- AI is allowed as an assistant but not as an unchecked source of production truth.
