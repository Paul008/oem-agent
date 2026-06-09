# Bound Variant Color Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native database-bound variant and colour explorer section that can replace Mitsubishi's captured interactive grade/colour block while keeping the OEM visual pattern.

**Architecture:** Add a new `variant-color-explorer` page-builder section type with a Vue renderer. The renderer loads model products and per-product colours from existing Supabase dashboard composables, normalizes them into tabbed variants, and handles variant/colour/key-feature state locally. The section remains useful with manual fallback data if database rows are missing.

**Tech Stack:** Vue 3, TypeScript, shadcn-vue dashboard components, Supabase via `use-oem-data`, Vitest.

---

### Task 1: Register Section Type

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/section-templates.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/section-registry.ts`
- Modify: `dashboard/src/pages/dashboard/components/page-builder/section-icons.ts`
- Test: `dashboard/src/pages/dashboard/components/page-builder/section-registry.test.ts`
- Test: `dashboard/src/pages/dashboard/components/page-builder/section-templates.test.ts`

- [ ] Add `variant-color-explorer` to `PageSectionType`.
- [ ] Add defaults with `oem_id`, `model_slug`, `eyebrow`, `heading`, `cta_text`, `cta_url`, `data_source`, and fallback `variants`.
- [ ] Register `SectionVariantColorExplorer.vue` in canvas and display maps.
- [ ] Add a section type label and icon.
- [ ] Run dashboard tests and confirm registry coverage still passes.

### Task 2: Add Data Adapter Helpers

**Files:**
- Modify: `dashboard/src/composables/use-oem-data.ts`
- Test: `dashboard/src/composables/use-oem-data.test.ts` if helper logic is exported; otherwise cover through renderer tests.

- [ ] Add enough type fields on `VariantColor` for explorer rendering (`hero_image_url`, `swatch_url`, `gallery_urls`, `hex_code`, `price_delta`, `sort_order` if not already typed).
- [ ] Reuse `fetchProductsForModel` and `fetchVariantColors` rather than adding a new worker endpoint.
- [ ] Keep fallback behavior client-side: no products or no colours should still render manual section data.

### Task 3: Build Renderer

**Files:**
- Create: `dashboard/src/pages/dashboard/components/sections/SectionVariantColorExplorer.vue`
- Test: `dashboard/src/pages/dashboard/components/sections/section-variant-color-explorer.test.ts`

- [ ] Load products for `section.oem_id || props.oemId` and `section.model_slug || props.modelSlug`.
- [ ] Load colours for the loaded product IDs.
- [ ] Normalize products into tabs with title, description, price label, key features, specs fallback, CTA, and colour list.
- [ ] Render Mitsubishi-style layout: centred eyebrow/heading, horizontal grade tabs, left detail panel, image stage, colour swatches, key-features disclosure, CTA.
- [ ] Implement mobile/tablet layout with horizontal tabs, image before swatches, and no text/image overlap.
- [ ] Add empty/fallback state using manual section variants.

### Task 4: Add Editor Controls

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/SectionProperties.vue`

- [ ] Add `variant-color-explorer` controls for data source, OEM override, model slug override, eyebrow, heading, CTA text, and CTA URL.
- [ ] Keep controls compact and avoid forcing manual editing of database-derived variants in this first slice.

### Task 5: Verify and Ship

**Files:**
- Run: `pnpm exec npm run -s test:dashboard`
- Run: `pnpm run typecheck`
- Commit and deploy.

- [ ] Confirm tests pass.
- [ ] Confirm TypeScript passes.
- [ ] Commit with a focused message.
- [ ] Push `main`.
- [ ] Deploy with `pnpm exec wrangler pages deploy dashboard/dist --project-name oem-dashboard --branch main`.

---

### Self-Review

- Scope is one reusable bound section, not a full replacement of every captured OEM widget.
- Existing data APIs are reused; no new backend endpoint is needed for the first slice.
- Missing database data falls back to manual section fields instead of breaking preview.
- The actual Outlander captured-block replacement can be done after this renderer is available.
