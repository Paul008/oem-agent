# Clone Studio v1 Design

## Summary

The model page builder currently has several useful building systems, but they are wired as destructive pipeline stages. A full OEM clone can be captured into `content.rendered`, then structuring converts that clone into generic Vue section data in `content.sections`. Once the user clicks into section editing, the page drops away from the pixel clone and into a lower-fidelity renderer.

Clone Studio v1 makes the cloned OEM page a first-class editable mode. The existing section builder, capture tool, template gallery, page templates, recipes, and Alpine component generation remain available as selectable micro-apps. They should not overwrite each other unless the user explicitly chooses a destructive replacement action.

## Goals

- Make pixel-faithful OEM cloning the default path for OEM landing/model pages.
- Let users select, inspect, and edit regions of the cloned DOM without switching to the lower-fidelity Vue section renderer.
- Preserve the current section builder for structured model pages, templates, reusable recipes, and dealer-friendly page layouts.
- Introduce a page mode contract so clone, sections, raw HTML islands, generated HTML, and templates can coexist.
- Guard actions that currently overwrite page data, especially Clone, Structure, Pipeline, and Template Apply.
- Keep Alpine.js as the preferred lightweight behavior layer for generated or replaced clone regions.

## Non-Goals

- Clone Studio v1 is not a full Webflow/Framer-level CSS editor.
- It will not preserve every OEM script, form, iframe, tracking widget, canvas, or configurator.
- It will not remove the current structured section builder.
- It will not make AI-generated section pages the canonical representation for pixel cloning.
- It will not require dealer/front-end consumers to load every representation by default.

## Current Systems Inventory

### Full Page Clone

`src/design/page-capturer.ts` captures a rendered OEM page with Puppeteer, strips unsafe/unwanted elements, preserves stylesheet links and original classes, proxies images to R2, and stores the result in `content.rendered`.

This is the closest existing system to pixel-faithful cloning.

### Structured Section Builder

`dashboard/src/pages/dashboard/page-builder/[slug].vue`, `use-page-builder.ts`, and `PageBuilderCanvas.vue` render and edit `content.sections` as Vue section components.

This is useful for reusable structured pages, but it is not a pixel clone.

### Section Capture Micro-App

`SectionCapture.vue` and `use-capture-injection.ts` load a page in an iframe or screenshot, let the user click DOM regions, and emit typed sections or raw HTML islands.

This has the correct interaction pattern for Clone Studio, but it currently imports selected regions into the structured builder rather than editing the cloned page itself.

### Template Gallery And Page Templates

The template gallery reads sections from existing pages and curated templates. Page templates create section-only pages. Both are useful, but they need target-mode selection and overwrite guards.

### Recipes, Style Guide, Design Memory

Recipes and style guide tooling provide reusable OEM section knowledge. Design memory records extraction runs and learned patterns. These should feed Clone Studio suggestions, not replace the clone.

### Alpine Component Generation

`src/design/component-generator.ts` already generates bespoke Alpine/Tailwind snippets. This should become the mechanism for replacing a selected clone region when the user asks for an interactive or cleaned-up component.

## Problem Statement

The current page shape overloads two different concepts:

```ts
content: {
  rendered: string,
  sections: PageSection[]
}
```

`rendered` is the full cloned page. `sections` is a normalized structured approximation. The editor treats `sections` as the primary editable model once they exist. Save operations persist section edits only. This creates four user-visible failures:

- Editing a sidebar section leaves the pixel clone and shows the lower-fidelity section renderer.
- Re-running Clone can replace a structured/manual page with clone-only data.
- Re-running Structure can replace existing manual section edits.
- Applying templates can write directly to `latest.json` without clear branch/overwrite intent.

## Proposed Architecture

### Page Representation

Add an explicit mode-aware content contract while keeping backward compatibility for current pages.

```ts
type PageMode = 'clone' | 'sections' | 'raw-html' | 'generated' | 'template'

interface VehicleModelPageV2 {
  id: string
  slug: string
  oem_id: string
  active_mode: PageMode
  content: {
    rendered?: string
    sections?: PageSection[]
    modes?: {
      clone?: CloneModeContent
      sections?: SectionsModeContent
      raw_html?: RawHtmlModeContent
      generated?: GeneratedModeContent
      template?: TemplateModeContent
    }
  }
}

interface CloneModeContent {
  rendered: string
  edited_rendered?: string
  source_url: string
  captured_at: string
  viewport: { width: number, height: number }
  asset_map: Record<string, string>
  stylesheet_urls: string[]
  stripped_selectors: string[]
  section_index: CloneSectionRegion[]
  warnings: string[]
}

interface CloneSectionRegion {
  id: string
  label: string
  selector: string
  tag: string
  classes: string[]
  top: number
  height: number
  type_hint?: string
  editable_fields: CloneEditableField[]
}

interface CloneEditableField {
  id: string
  selector: string
  kind: 'text' | 'html' | 'image' | 'link' | 'button' | 'background' | 'visibility'
  label: string
  value: string
}
```

Backward compatibility:

- Existing `content.rendered` maps to `content.modes.clone.rendered`.
- Existing `content.sections` maps to `content.modes.sections.items`.
- Existing `page_type`, `header`, `source_url`, `version`, and `manually_edited` remain supported.

### Editor Modes

The page builder becomes a mode host rather than a single renderer.

1. **Clone Studio**
   - Primary for OEM clone pages.
   - Renders the cloned page in a sandboxed iframe.
   - Injects an editor overlay into the iframe.
   - Sidebar regions map to real DOM selectors in the cloned HTML.
   - Selecting a sidebar item scrolls and highlights the matching clone region.
   - Editing updates the clone DOM and saves `edited_rendered`.

2. **Section Builder**
   - Existing Vue section editor.
   - Used for reusable structured pages, templates, and generated/dealer-friendly model pages.
   - Does not automatically replace Clone Studio.

3. **Capture Studio**
   - Evolves from current `SectionCapture`.
   - Supports selecting regions from live pages.
   - Can import into Clone Studio, Section Builder, or raw HTML mode.

4. **Template Studio**
   - Existing page templates and gallery.
   - User chooses target: create new page, insert into sections, replace selected clone region, or create a branch.

5. **Alpine Islands**
   - Used for selected clone regions that need interaction or cleaner editing.
   - Generated snippets replace a single DOM region, not the whole page.

## Clone Studio UX

### Canvas

The default canvas for cloned pages stays on the pixel clone. It should not switch to the section renderer when a user clicks a section in the sidebar.

The clone iframe receives an editor injection that:

- Disables navigation.
- Adds hover outlines and selected outlines.
- Maps clicks to `CloneSectionRegion` ids.
- Exposes field extraction for text, images, links, and buttons.
- Allows safe DOM patching from parent UI commands.

### Sidebar

The sidebar lists clone regions when active mode is `clone`.

For each region:

- label
- type hint
- visual height or screenshot thumbnail if available
- actions: edit, hide, duplicate, delete, replace with Alpine island, convert to structured section

Clicking a region should scroll the clone iframe to the matching DOM node and highlight it.

### Inspector

The floating editor should become mode-aware.

For clone regions it edits:

- text nodes
- image URLs
- link URLs
- button text/URL
- basic visibility
- optional class/style tweaks for spacing and background

For structured sections it continues to show `SectionProperties`.

### Save

Clone edits save to the clone representation, not `content.sections`.

```ts
PUT /admin/update-clone/:oemId/:modelSlug
body: {
  edited_rendered: string,
  section_index: CloneSectionRegion[],
  active_mode?: 'clone'
}
```

The endpoint:

- loads current R2 page JSON
- updates `content.modes.clone.edited_rendered`
- keeps the original `content.modes.clone.rendered`
- bumps version
- marks `manually_edited`
- writes a version snapshot
- purges page cache/webhooks like `update-sections`

## Guarded Transitions

Current actions should be split into safe and destructive variants.

### Clone

Current risk: overwrites `content.sections`.

New behavior:

- If no page exists, create clone mode and set `active_mode = 'clone'`.
- If sections or manual edits exist, ask whether to:
  - create/update clone mode only
  - replace active page with new clone
  - create a version branch

### Structure

Current risk: replaces `content.sections`.

New behavior:

- Structure creates or updates `content.modes.sections.items`.
- It does not change `active_mode` unless the user asks.
- If existing manual sections exist, write a new version branch or require confirmation.

### Pipeline

Current risk: combines clone and structure as one implicit final result.

New behavior:

- Pipeline should output artifacts into modes:
  - clone capture
  - section index
  - structured sections
  - validation report
  - design memory
- User chooses the active mode after completion.

### Template Apply

Current risk: writes directly to `latest.json`.

New behavior:

- Applying a template requires a target:
  - create new page
  - insert sections into Section Builder
  - replace selected clone region
  - create template mode branch
- Existing pages must show overwrite/branch options.

## Backend Changes

### Page Capturer

Enhance `PageCapturer` to output:

- stylesheet URLs
- asset map
- viewport
- stripped selector warnings
- section index candidates
- optional full-page screenshot reference

It should continue stripping unsafe scripts and tracking, but record what was stripped so users understand missing interactions.

### Page Structurer

Change `structurePage()` from "replace page sections" to "write structured derivative".

It should store:

```ts
content.modes.sections = {
  items: sections,
  source: {
    mode: 'clone',
    version: page.version,
    generated_at: string
  }
}
```

### Routes

Add or adjust:

- `GET /pages/:slug?includeRendered=true&includeModes=true`
- `PUT /admin/update-clone/:oemId/:modelSlug`
- `POST /admin/structure-page/:oemId/:modelSlug` writes a sections mode derivative
- `POST /admin/clone-page/:oemId/:modelSlug` preserves other modes unless explicitly replacing
- `POST /admin/page-templates/apply` requires target behavior for existing pages

## Frontend Changes

### use-page-builder

Add mode state:

```ts
const activeMode = computed(...)
const availableModes = computed(...)
const cloneRegions = computed(...)
const selectedCloneRegionId = ref<string | null>(null)
```

Add save methods:

- `saveClone()`
- `saveSections()`
- `setActiveMode()`
- `createModeBranch()`

Keep existing section methods for Section Builder.

### PageBuilderCanvas

Split current canvas into mode-specific components:

- `CloneStudioCanvas.vue`
- `SectionBuilderCanvas.vue`
- `RawHtmlCanvas.vue`

`PageBuilderCanvas.vue` becomes the host/router.

### SectionCapture

Refactor the iframe injection into reusable utilities:

- region selection
- outline rendering
- region extraction
- safe DOM patching
- navigation blocking

Clone Studio and Capture Studio should share this code.

## Alpine.js Role

Alpine should not be used to power the entire dashboard editor. Vue remains the dashboard app framework.

Alpine should be used inside cloned/generated page content for:

- tabs
- accordions
- galleries
- color pickers
- lightboxes
- simple stateful interactive sections

When an OEM script is stripped and a region needs replacement behavior, generate an Alpine island for that selected region only.

## Error Handling

- If a clone has no editable regions, the clone still renders, and users can run "Index Regions".
- If a selector no longer matches after edits, the region becomes stale and shows a repair action.
- If an OEM stylesheet fails to load, show a fidelity warning and keep the captured HTML visible.
- If Clone or Template Apply would overwrite existing modes, require explicit branch/replace confirmation.
- If save fails, keep unsaved DOM state in memory and offer JSON export of the edited clone.

## Testing Strategy

### Unit Tests

- Page workflow mode detection.
- Backward-compatible mode normalization from old `content.rendered` and `content.sections`.
- Clone navigation disabling.
- Region selector matching and stale region detection.
- API payloads for `update-clone` and `update-sections`.

### Component Tests

- Clone Studio remains active when selecting sidebar regions.
- Section Builder remains available as a deliberate mode switch.
- Save in clone mode does not mutate sections.
- Save in section mode does not mutate clone HTML.
- Template Apply prompts for target behavior on existing pages.

### Integration Tests

- Clone Ford Mustang page.
- Index clone regions.
- Edit a text/link/image field in Clone Studio.
- Save clone.
- Reload and verify the cloned page remains active and pixel clone still renders.
- Run Structure after clone and verify it creates sections without changing active clone mode.

### Browser Verification

For Ford Mustang:

- Compare OEM source and cloned preview at desktop/tablet/mobile.
- Click sidebar region and confirm iframe remains the active canvas.
- Verify no navigation to the OpenClaw worker dashboard from clone links.
- Verify edited text persists after reload.

## Rollout Plan

### Phase 1: Contract And Guards

- Add mode normalization helpers.
- Add `active_mode` and `content.modes` support while preserving legacy fields.
- Add overwrite guards for Clone, Structure, Pipeline, and Template Apply.
- Keep current UI behavior mostly intact except for safer transitions.

### Phase 2: Clone Studio Canvas

- Add clone-region sidebar.
- Add iframe editor injection.
- Add select, scroll, highlight, and inspect behavior.
- Add `update-clone` save endpoint.

### Phase 3: Capture Studio Reuse

- Refactor `SectionCapture` injection into shared clone/capture utilities.
- Let captured regions target clone, sections, or raw HTML islands.

### Phase 4: Alpine Region Replacement

- Generate or insert Alpine islands for selected clone regions.
- Save replacement into clone DOM with provenance metadata.

### Phase 5: Fidelity Scoring

- Add screenshot comparison between source URL and clone preview.
- Store clone fidelity warnings and visual diff results.

## Acceptance Criteria For Clone Studio v1

- A cloned OEM page opens in Clone Studio by default.
- Selecting a sidebar region does not switch the canvas to Vue section rendering.
- A user can edit text, links, and images inside the cloned DOM and save those edits.
- The saved clone reloads with edits intact.
- The original captured clone remains available for reset/diff.
- Running Structure creates structured sections as a separate mode.
- Existing Section Builder, Capture, Templates, Recipes, and Alpine component generation remain available as deliberate tools.
- Destructive writes require explicit user intent.

## Recommended First Implementation Plan

Start with Phase 1 and Phase 2 only.

This solves the core product issue: clone-first editing without losing pixel fidelity. Later phases can improve capture reuse, Alpine replacement, and visual scoring without destabilizing the current page builder.
