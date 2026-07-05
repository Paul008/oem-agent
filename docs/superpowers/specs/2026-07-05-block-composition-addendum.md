# Addendum: Block-Composition Path (Toyota-first) — Decision Record

**Date:** 2026-07-05 · **Status:** Approved direction; Slice 1 shipped (toyota-theme-nuxt); Slice 2 composer CLI shipped (oem-agent feat/composer-cli-slice2); proof experiment: dry-run executed, --post pending operator run
**Parent spec:** 2026-07-04-oem-clone-enterprise-design.md (unchanged; this path is ADDITIVE)

## Decisions (Paul, 2026-07-05)

1. **Additive, prove-first.** The capture-clone pipeline (VW et al.) is untouched. Block composition is a parallel option, validated on one real Toyota page before further investment.
2. **Page ownership:** composed pages are `CmsPageBuilderDocument`s in the toyota-theme-nuxt CMS (tenant-scoped Postgres, existing draft/publish workflow). oem-agent acts as the analysis engine only.
3. **No-match path:** AI drafts a candidate block (screenshot crop + prop schema + component skeleton) → human approves in CMS before it joins `CMS_PAGE_SECTION_PRESETS`. Library grows curated.
4. **Screenshot/DOM acquisition:** local/real-browser capture (existing QA plumbing — `scripts/lib/qa-browser.mjs`), sidestepping Toyota's bot wall. Composer = local CLI in oem-agent posting to the CMS admin API.
5. **Approach B (DOM + vision hybrid):** vision ranks the matching preset from a rendered-exemplar catalog; the DOM supplies literal content (headings/copy/image URLs/CTA hrefs) into the preset's typed props. Vision chooses, DOM transcribes.

## Target system facts (explored 2026-07-05)

toyota-theme-nuxt: Nuxt 4.2 / UnoCSS+Tailwind4 / Neon+Drizzle / SSR Netlify. Contract: `app/types/cmsPageBuilder.ts` (12 section types), presets in `app/utils/cmsPageBuilderPresets.ts` (~15, typed props e.g. Hero `{eyebrow, heading, body, imageUrl, imageAlt, buttonLabel, buttonHref}`), renderer `app/utils/cmsPageBuilder.ts:renderCmsPageBuilderDocumentToHtml`, persistence `server/utils/cmsPages.ts` (stores JSON doc + rendered HTML, tenant-scoped). No screenshot→block importer exists. NOTE: Hyundai→Toyota token migration half-done in `uno.config.ts` (both brand hexes coexist) — catalog rendering will surface this per block. `legacy_html` section type available as interim carrier for clone fragments.

## Build order

1. **Slice 1 — Catalog generator** (in toyota-theme-nuxt): render every preset with canonical demo props → (a) human style-guide page per OEM, (b) `catalog.json` [preset key, prop schema, category, exemplar screenshot path]. This is both Paul's requested OEM style guide and the AI's matching menu.
2. **Slice 2 — Composer CLI** (in oem-agent): `--url <toyota page>` → local capture (screenshot+DOM) → section segmentation (reuse section-parser + live bboxes) → per-section vision match against catalog → DOM-extracted props → `CmsPageBuilderDocument` → POST to CMS admin API as draft.
3. **Slice 3 — Draft-block proposal flow** for unmatched sections (approval before library entry).

## Proof-experiment success criteria (judge after ONE composed Toyota page)

- % of source sections matched to an existing preset (target: >60% on page 1)
- Human field-corrections needed in the builder before publishable (count them)
- Draft-block proposals generated (each is library growth, not failure)

## Constraints carried over

GAC untouched (GSAP investigation pending). Toyota server-side capture stays blocked until scrapling service is wired — composer is operator-triggered local CLI for now.
