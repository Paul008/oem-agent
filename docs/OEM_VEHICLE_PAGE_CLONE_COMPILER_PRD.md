# PRD: OEM Vehicle Page Clone Compiler

## 1. Summary

Build an enterprise-grade capture, compile, and visual QA system for cloning multiple OEM vehicle pages into reliable dealer/client previews.

The current full-page clone approach is useful for raw capture, but it is not reliable enough as the final production artifact. Ford Mustang and Volkswagen Amarok exposed the key risk: each OEM ships styling differently. Ford can work with hydrated DOM and linked CSS; Volkswagen uses styled-components SSR CSS whose class names match the initial HTML, while the hydrated browser DOM can diverge. A production system must detect these differences automatically and compile verified section artifacts, not blindly store one captured DOM.

Execution plan: [OEM_VEHICLE_PAGE_CLONE_COMPILER_IMPLEMENTATION_PLAN.md](./OEM_VEHICLE_PAGE_CLONE_COMPILER_IMPLEMENTATION_PLAN.md)

## 2. Business Goals

- Let dealer clients generate OEM-like model pages quickly and repeatedly.
- Support many Australian OEMs with predictable fidelity, not one-off manual repairs.
- Reduce engineering intervention per page rebuild.
- Provide auditable evidence for each generated page: source screenshot, clone screenshot, visual diff, CSS strategy, warnings, and repair steps.
- Enable reusable design intelligence across OEMs, models, and dealerships.

## 3. Non-Goals

- We are not trying to scrape private OEM APIs or bypass protected content.
- We are not trying to reproduce interactive configurators perfectly in phase 1.
- We are not trying to preserve full OEM navigation, cookie modals, analytics, or dealer forms unless explicitly needed.
- We are not replacing bespoke dealer landing pages; this system provides high-fidelity OEM page foundations.

## 4. Key Learnings From Current R&D

### Ford Mustang

- Hydrated DOM plus stylesheet/media capture can produce a strong full-page clone.
- Full Preview flow is viable when CSS, assets, and DOM remain aligned.

### Volkswagen Amarok

- Initial SSR HTML contains a large `data-styled` styled-components CSS block.
- Hydration can produce class names that do not match the SSR CSS.
- Capturing only browser DOM caused CSS/body mismatch.
- Capturing SSR body plus matching SSR CSS produced materially better results.
- Missing root font variables caused iframe font fallback.
- Large OEM grid variables can collapse content when transplanted into a different iframe/container context.

## 5. Product Requirements

### Product Principles

- Tool-agnostic by design: browser automation, visual diff, storage, queues, and LLM vendors must be replaceable behind interfaces.
- LLM-first where it is materially faster: use multimodal models to classify sections, infer intent, identify visual mismatches, propose repairs, and generate structured manifests.
- Deterministic where correctness matters: final publish gates must rely on browser-rendered screenshots, computed styles, asset checks, and schema validation.
- Evidence over confidence: every automated decision must point back to source HTML, screenshots, CSS evidence, or a structured model output.
- Human-reviewable output: admin users should see what changed, why it changed, and whether the page passed.

### P0 Requirements

1. Capture both initial SSR HTML and hydrated browser DOM.
2. Capture full-page screenshots at desktop and mobile breakpoints.
3. Segment each vehicle page into named sections:
   - Hero
   - CTA/action strip
   - Specs strip
   - Intro/content block
   - Feature cards
   - Gallery/media
   - Finance/offer blocks
   - Sticky action bar
4. Produce one artifact per section:
   - HTML
   - CSS bundle
   - media/assets
   - computed style summary
   - source screenshot crop
   - clone screenshot crop
   - visual diff score
   - warnings/repair notes
5. Compile the final preview from verified section artifacts.
6. Provide admin UI progress:
   - queued
   - capturing
   - compiling CSS
   - rendering
   - visual QA
   - repaired
   - failed with actionable reason
7. Store versioned artifacts in R2 with rollback.

### P1 Requirements

1. OEM-specific capture profiles:
   - Ford
   - Volkswagen
   - Toyota
   - Mazda
   - Kia
   - Hyundai
   - Mitsubishi
2. Automatic strategy selection:
   - linked CSS clone
   - SSR styled-components clone
   - CSSOM extraction
   - computed-style fallback
   - section reconstruction
3. LLM-assisted section classification and repair proposals using structured outputs.
4. Visual QA dashboard with side-by-side source/clone/diff.
5. Dealer override layer for CTA, finance, stock, location, and enquiry.

### P2 Requirements

1. Reusable OEM design tokens.
2. Auto-generated section components.
3. LLM-assisted repair proposals.
4. CI gate for page quality before client publishing.
5. Multi-framework render targets for dealer or OEM-specific delivery contexts.
6. Knowledge graph / Obsidian-compatible indexing for component, OEM, and repair memory.

## 6. Architecture

### 6.1 Tool-Agnostic Service Interfaces

The platform should not depend directly on one automation, AI, diff, or storage vendor. Implement these as ports/adapters:

```ts
interface BrowserCaptureProvider {
  capture(url: string, profile: CaptureProfile): Promise<CaptureRun>
}

interface VisualDiffProvider {
  compare(source: ImageRef, clone: ImageRef, options: DiffOptions): Promise<DiffResult>
}

interface ModelReasoningProvider {
  classifySections(input: SectionPrompt): Promise<SectionManifest>
  proposeRepairs(input: RepairPrompt): Promise<RepairPlan>
}

interface ArtifactStore {
  put(path: string, value: ArtifactBody, metadata?: ArtifactMetadata): Promise<void>
  get<T>(path: string): Promise<T>
}

interface KnowledgeIndexProvider {
  indexRun(run: CaptureRun, report: QaReport): Promise<void>
  indexComponent(component: ComponentManifest): Promise<void>
  search(query: string): Promise<KnowledgeHit[]>
}

interface EdgeExecutionProvider {
  enqueueCompile(job: CompileJob): Promise<JobRef>
  runBrowserCapture(job: CaptureJob): Promise<CaptureRun>
  compileComponent(job: ComponentCompileJob): Promise<ComponentArtifact>
  publishArtifact(artifact: PageArtifact): Promise<PublishResult>
}

interface AgenticControlPlaneProvider {
  createGoal(goal: OemCompilerGoal): Promise<GoalRef>
  createTask(task: OemCompilerTask): Promise<TaskRef>
  attachWorkProduct(task: TaskRef, artifact: WorkProductRef): Promise<void>
  requestApproval(approval: ApprovalRequest): Promise<ApprovalResult>
  wakeAgent(agent: AgentRef, context: AgentWakeContext): Promise<AgentRunRef>
}
```

Reference implementations can use the tools we already know, but the product contract is these interfaces.

### 6.2 Current Runtime and Framework Inventory

The existing application already has enough frontend/runtime surface area to support rich OEM-style pages without rebuilding every interaction from scratch.

Current primary stack:

- Vue 3 + Vite + TypeScript for the dashboard/page-builder application.
- Tailwind CSS v4, shadcn-vue, Reka UI, lucide-vue-next, and class-variance-authority for the design system.
- Pinia, Vue Router, vue-i18n, vee-validate, Zod, TanStack Vue Query, and TanStack Vue Table for admin workflows.
- Cloudflare Worker/Hono backend with R2 artifact storage and Supabase data.
- Cheerio, PostCSS, Puppeteer/Cloudflare Puppeteer, Playwright core, and Vitest for capture, parsing, CSS analysis, browser automation, and testing.

Current dynamic UI/tooling:

- Embla carousel via shadcn-vue carousel components for galleries and media carousels.
- GSAP and ScrollTrigger are already present for section animations and scroll-triggered effects.
- Motion (`motion-v`) is available for lighter component-level animation effects.
- FormKit auto-animate is installed for list/layout transitions.
- Alpine.js is already represented in the broader system as a lightweight island concept for standalone/generated interactive regions, including exported style/recipe previews and the standalone vehicle 360 component pattern.
- Custom `Vehicle360Viewer` supports gallery-driven and generated 360 vehicle spin experiences.
- Clone Studio already contains compatibility logic for common OEM carousel patterns such as Swiper, Splide, Slick, and generic carousel markup.
- Existing section renderers include hero, heading, intro, tabs, color picker, specs, gallery, feature cards, video, CTA, content block, accordion, enquiry form, map, alert, divider, testimonial, comparison table, stats, logo strip, embed, pricing table, sticky bar, finance calculator, image, image showcase, card grid, split content, media, pinned scroll, and variant color explorer.

This should become the canonical component grammar for LLM-generated page reconstruction. Instead of asking the model to produce arbitrary HTML/CSS/JS, ask it to produce a typed section manifest that maps into these existing components where possible.

### 6.3 Cloudflare Edge Execution Layer

The current product already sits on Cloudflare, so Cloudflare should be the default operational adapter for capture, compilation, artifact storage, and delivery.

Use Cloudflare for:

- API gateway and admin endpoints through Workers/Hono.
- Artifact storage and versioning through R2.
- Static dashboard and generated preview delivery through Pages/Workers/CDN.
- Queue-backed compile jobs for long-running capture and render workflows.
- Durable state coordination for per-page compile runs.
- Browser capture and screenshot jobs through Browser Run or an equivalent browser provider.
- Edge-safe HTML/CSS rewriting through Worker streaming transforms and `HTMLRewriter`.
- Semantic search and prior-run retrieval through Vectorize or an external knowledge index adapter.
- Optional Workers AI for edge inference where the model quality/cost/latency is appropriate.
- Cron-driven OEM recapture and design drift checks.

Cloudflare-specific architecture:

```text
Admin UI
  -> Worker API
  -> Compile Queue / Workflow
  -> Browser Capture Provider
  -> Section Compiler
  -> LLM / Reasoning Provider
  -> Visual QA Provider
  -> R2 Artifact Store
  -> Preview Worker / CDN
  -> Knowledge Index
```

This gives us a practical production topology while preserving portability. The semantic compiler should not directly depend on Cloudflare APIs; it should depend on `EdgeExecutionProvider`, `ArtifactStore`, `BrowserCaptureProvider`, and `KnowledgeIndexProvider`.

Cloudflare dynamic workers can also serve generated component harnesses:

- preview harness workers for isolated section rendering
- visual QA harness workers for source/clone screenshot endpoints
- component adapter workers for `vue`, `static-html`, `tailwind-html`, and `alpine-island`
- asset proxy workers for fonts, images, videos, and CSS URLs
- dealer/client embed workers that serve compiled snippets with strict CSP and version pinning
- regression harness workers that replay known OEM failure modes

This is especially useful for dealer clients because we can publish stable, cacheable, versioned artifacts globally without coupling the dealer CMS to our internal dashboard.

### 6.4 Agentic Control Plane / Paperclip Layer

Paperclip is a strong fit as the optional control plane around this compiler.

The OEM compiler should remain the product execution system: capture, compile, render, QA, publish, and store artifacts. Paperclip should coordinate the people/agent/company layer above it: goals, tasks, specialist agents, budgets, approvals, recurring heartbeats, and work-product review.

Use Paperclip for:

- breaking an OEM page rollout goal into task trees
- assigning specialist agents:
  - OEM researcher
  - capture engineer
  - CSS/runtime compiler engineer
  - visual QA reviewer
  - dealer-content adapter
  - knowledge-index curator
- running recurring heartbeats for OEM drift monitoring
- tracking cost and token budgets per agent
- attaching screenshots, QA reports, compiled previews, and PRD updates as work products
- requiring approval before automatic repair recipes or generated component classes become trusted
- coordinating multiple agents against one business goal without losing context

Do not use Paperclip for:

- low-level section rendering
- browser screenshot capture itself
- artifact storage as the source of truth
- direct public preview delivery
- replacing the dashboard/page-builder UX

Recommended shape:

```text
Paperclip Company Goal
  -> OEM Compiler Initiative
    -> Ford Mustang compile project
    -> Volkswagen Amarok compile project
    -> Toyota model-page research project
      -> assigned agents
      -> heartbeats
      -> work products
      -> approvals
      -> linked Cloudflare compile jobs
```

This gives us the "genetic/agentic" assistance loop: agents repeatedly observe OEM changes, run compile experiments, score outputs, promote successful patterns, and archive failed attempts with evidence. Paperclip owns the operating cadence and governance; the compiler owns deterministic execution and QA.

Integration points:

- Paperclip issue -> Cloudflare compile job.
- Cloudflare QA report -> Paperclip artifact/work product.
- Paperclip approval -> promote repair recipe or publish artifact.
- Paperclip heartbeat -> scheduled OEM recapture/drift task.
- Paperclip memory/provider layer -> recall prior failures and successful recipes.
- Graphy/Obsidian export -> searchable knowledge base for future agent runs.

This layer should be optional. A single engineer should still be able to run the compiler directly from the dashboard. Paperclip becomes valuable when we scale to many OEMs, many dealer clients, and multiple autonomous agents working continuously.

### 6.5 Multi-Framework Render Targets

The system should distinguish between the semantic page model and the rendering framework.

Canonical model:

```json
{
  "page": {
    "oem": "volkswagen-au",
    "model": "amarok",
    "sections": [
      {
        "type": "gallery",
        "variant": "carousel",
        "framework_targets": ["vue", "html"],
        "interaction": {
          "kind": "carousel",
          "preferred_runtime": "embla",
          "fallback": "scroll-snap"
        }
      }
    ]
  }
}
```

Supported render targets should be adapters:

- `vue`: preferred admin/dealer preview target using current Vue components.
- `static-html`: safe fallback for simple landing-page embeds.
- `tailwind-html`: portable Tailwind sections for dealer CMS use.
- `alpine-island`: lightweight interactive HTML/Tailwind island for dealer CMS embeds and selected clone-region replacements.
- `react`: optional future adapter when client platforms require React/Next.
- `web-component`: optional future adapter for embedding interactive widgets into third-party dealer sites.

LLMs can generate into any target, but the default should be a typed section manifest plus Vue/Tailwind renderer output because that matches the current application. This avoids turning the LLM into an unconstrained code generator.

### 6.6 Interaction and Animation Grammar

Dynamic OEM sections should be described by intent first, then rendered by the best available local runtime.

Interaction types:

- `carousel`: image/media carousel, hero carousel, testimonial carousel.
- `gallery-lightbox`: grid or carousel with modal image viewer.
- `tabs`: feature tabs, trim tabs, range tabs.
- `accordion`: FAQ, specs, disclaimers.
- `sticky-bar`: scroll-revealed offer/enquiry bar.
- `pinned-scroll`: pinned section with horizontal card scrub.
- `scroll-reveal`: fade/slide/scale entrance animation.
- `parallax-media`: controlled media movement on scroll.
- `video`: autoplay, click-to-play, embed, hosted video.
- `vehicle-360`: drag/swipe vehicle spin from gallery frames.
- `variant-color-explorer`: variant/colour selector backed by product data.
- `finance-calculator`: dealer finance calculator.

Preferred runtime mapping:

- Carousels: Embla where we control rendering; Swiper/Splide/Slick compatibility only when replaying captured OEM markup.
- Scroll-triggered animation: GSAP/ScrollTrigger for complex pinned or scrubbed interactions.
- Simple reveal/list transitions: Motion or auto-animate.
- Lightweight standalone interactivity: Alpine islands for dropdowns, tabs, accordions, gallery controls, simple filters, disclosures, and dealer CMS embeds where Vue is not available.
- Static fallback: CSS scroll-snap, CSS transitions, and no-JS layout.

Every interaction needs a static fallback screenshot state for QA and for environments where client JavaScript is disabled or blocked.

### 6.7 Alpine Island Policy

Alpine is a good fit for dynamic clone regions when the target output is HTML-first and we do not want to mount the full Vue application.

Use Alpine for:

- selected clone-region replacement inside an iframe or exported standalone page
- dealer CMS snippets where Vue is not available
- simple tabs, accordions, dropdowns, galleries, modals, filters, and reveal controls
- portable Tailwind/HTML components generated by the LLM from a structured manifest
- lightweight 360 or colour-picker style widgets when the data model is self-contained

Do not use Alpine for:

- the dashboard application shell
- page-builder state management
- shared admin workflows already owned by Vue/Pinia/TanStack
- arbitrary copied OEM scripts
- unreviewed LLM-generated JavaScript

Alpine output must follow the same contract as other render targets:

1. The model returns a structured interaction manifest first.
2. The compiler chooses `alpine-island` only when it is the right target.
3. Generated directives are allowlisted.
4. State is local to the island unless explicitly connected through a safe bridge.
5. Browser QA proves the island works before publishing.

Alpine works because its core model is small and HTML-native: `x-data` declares local reactive state, `x-on`/`@` handles events, `x-show` toggles visibility, `x-model` binds input state, and `x-for` repeats data-driven markup. That is exactly the level of behavior we need for many standalone OEM/dealer widgets.

### 6.8 LLM Component Generation Contract

LLMs should not be asked to directly write production code as the only artifact. They should return structured component intent first:

```json
{
  "section_id": "gallery-1",
  "type": "gallery",
  "layout": "carousel",
  "runtime": "embla",
  "assets": [
    { "url": "...", "alt": "Amarok exterior front three quarter" }
  ],
  "tokens": {
    "background": "#ffffff",
    "heading_font": "vw-head",
    "body_font": "vw-text"
  },
  "animation": {
    "type": "scroll-reveal",
    "preset": "fade-up"
  },
  "fallback": {
    "layout": "grid",
    "reason": "carousel runtime unavailable"
  }
}
```

Then the compiler decides:

1. Can this map to an existing Vue section component?
2. Does it need a runtime adapter such as Embla or GSAP?
3. Can it degrade to static HTML/Tailwind?
4. Is `alpine-island` a better fit because the output needs portable local interactivity?
5. Does the generated result pass browser visual QA?
6. Is the output safe to publish for dealer/client use?

This lets us use LLMs aggressively without trusting unverified freeform code.

### 6.9 Capture Layer

For every source URL, store:

- Initial HTTP HTML response.
- Hydrated DOM after browser render.
- CSSOM/styleSheets.
- Network log.
- Font face state.
- Screenshot at desktop, tablet, mobile.
- Raw media inventory.

Rationale: styled-components SSR requires preserving server-emitted style tags. Browser CSS inspection APIs can expose matched styles, computed styles, stylesheet text, and platform fonts, which should be used for evidence and extraction rather than guessing from HTML alone. Chrome DevTools Protocol is one implementation option, not a product dependency.

### 6.10 Section Detector

Segment by combining:

- DOM landmarks: `main`, `section`, role attributes.
- Visual bounding boxes.
- Text anchors.
- Image/video regions.
- Repeating layout/card patterns.
- Sticky/fixed elements.

Each section gets a stable ID and classification:

```json
{
  "id": "hero-1",
  "type": "hero",
  "source_selector": "...",
  "bbox": { "x": 0, "y": 0, "width": 1440, "height": 810 },
  "strategy": "ssr-styled-components",
  "confidence": 0.92
}
```

LLMs can materially speed this up by looking at source screenshots plus DOM snippets and returning a structured section manifest. The model output must be schema-validated and reconciled against actual DOM bounding boxes before compilation.

### 6.11 CSS Compiler

Compile CSS per section using a cascade-aware strategy:

1. Gather matching class names and attributes.
2. Pull matched CSS rules.
3. Pull inherited root variables and fonts.
4. Pull media/container query dependencies.
5. Pull pseudo-element rules.
6. Pull animation/keyframe dependencies only when visually relevant.
7. Add minimal iframe reset.
8. Run CSS safety sanitizer.

Strategy profiles:

- `linked-css`: preserve external stylesheets and scoped root variables.
- `ssr-styled-components`: preserve server style tags and SSR body, avoid hydrated mismatch.
- `cssom`: extract rules from browser CSSOM/styleSheets.
- `computed-critical`: inline computed critical styles for section when CSS cannot be safely extracted.
- `reconstructed`: generate clean component CSS when the source system is too volatile.

### 6.12 LLM-Assisted Reconstruction Layer

When direct cloning is unstable, the system should let an LLM generate a clean semantic section representation from:

- source screenshot crop
- extracted text
- image inventory
- computed design tokens
- bounding boxes
- dealer-specific CTA requirements

Example output:

```json
{
  "section_type": "feature_cards",
  "layout": "four_column_cards",
  "tokens": {
    "heading_font": "vw-head",
    "body_font": "vw-text",
    "background": "#ffffff",
    "text": "#001e50"
  },
  "content": [
    {
      "heading": "Off-road tyres",
      "body": "Get optimum traction on unsealed surfaces..."
    }
  ],
  "confidence": 0.86
}
```

This is the fastest path for volatile lower-page sections where exact OEM CSS causes layout collapse. The output still needs browser rendering and visual QA before publishing.

### 6.13 Visual QA Layer

For each section:

- Render source screenshot crop.
- Render cloned section.
- Compare screenshots.
- Measure:
  - pixel diff
  - layout box delta
  - font family/weight delta
  - color delta
  - image coverage
  - text wrapping anomalies
  - overflow/collapse

Browser screenshot comparison providers can compare baseline and generated screenshots. Because rendering varies by OS, browser version, hardware, and fonts, QA should run in a fixed environment with stable fonts. Use deterministic masks for volatile elements.

### 6.14 Repair Engine

Known repair recipes:

- Missing font variables: inject root font-family variables.
- CSS/body class mismatch: switch SSR vs hydrated capture.
- Collapsed grid columns: detect narrow text blocks and patch layout variables.
- Default blue links: missing button/link CSS or wrong body class strategy.
- Missing images: resolve `srcset`, `data-src`, `picture/source`, CSS backgrounds.
- Excess whitespace: detect sections with height much larger than visible content.
- Sticky strips overlaying content: isolate or convert to fixed preview layer.

The model can propose repairs, but the system applies only approved repair recipe types. New repair classes require review before they can run automatically.

### 6.15 Artifact Model

Store in R2:

```text
pages/definitions/{oem}/{model}/latest.json
pages/definitions/{oem}/{model}/versions/{timestamp}.json
pages/artifacts/{oem}/{model}/{runId}/raw/
pages/artifacts/{oem}/{model}/{runId}/sections/{sectionId}/
pages/artifacts/{oem}/{model}/{runId}/qa/report.json
```

Section artifact:

```json
{
  "section_id": "hero-1",
  "type": "hero",
  "html": "...",
  "css": "...",
  "assets": [],
  "source_screenshot": "...",
  "clone_screenshot": "...",
  "diff_score": 0.04,
  "status": "passed",
  "repairs": []
}
```

Generated component artifacts should additionally store:

```json
{
  "render_target": "vue",
  "component_type": "gallery",
  "runtime_dependencies": ["embla"],
  "interaction_contract": {
    "type": "carousel",
    "fallback": "scroll-snap"
  },
  "source_framework_detected": "swiper",
  "render_framework_selected": "embla"
}
```

### 6.16 Knowledge Graph and Obsidian Index

We should index the application and every successful/failed clone run into a knowledge layer that agents and engineers can query later.

The index should remain optional and adapter-driven. Graphy, Obsidian, a vector database, or a plain Markdown vault should consume exported artifacts rather than becoming hard dependencies of the compiler.

Indexable entities:

- `OEM`: Volkswagen AU, Ford AU, Toyota AU, etc.
- `ModelPage`: Amarok, Mustang, Ranger, Corolla, etc.
- `SourceFramework`: Nuxt, Gatsby, React SSR, AEM, Sitecore, WordPress, custom SPA.
- `SourceRuntime`: styled-components, Emotion, Swiper, Splide, Slick, GSAP, vanilla JS.
- `SectionType`: hero, gallery, pinned-scroll, feature-cards, specs, CTA, etc.
- `LocalComponent`: existing Vue section renderer or future React/Web Component target.
- `DesignTokenSet`: colors, typography, spacing, radius, button rules, font files.
- `CaptureStrategy`: hydrated DOM, SSR styled-components, linked CSS, computed-critical, reconstructed.
- `RepairRecipe`: font variable injection, grid collapse repair, carousel import, sticky isolation.
- `QAEvidence`: source screenshot, clone screenshot, diff score, runtime interaction result.

Relationships:

- `OEM` has `ModelPage`.
- `ModelPage` uses `SourceFramework`.
- `SectionType` maps to `LocalComponent`.
- `SourceRuntime` converts to `RuntimeAdapter`.
- `RepairRecipe` fixes `FailureMode`.
- `CaptureRun` produced `QAEvidence`.
- `QAEvidence` validates `ArtifactVersion`.

Obsidian-compatible export structure:

```text
knowledge/
  oems/volkswagen-au.md
  models/volkswagen-au/amarok.md
  components/gallery.md
  components/pinned-scroll.md
  runtimes/gsap-scrolltrigger.md
  runtimes/embla-carousel.md
  repairs/grid-collapse.md
  repairs/font-variable-injection.md
  runs/2026-07-02-volkswagen-au-amarok.md
```

Each Markdown note should include frontmatter:

```yaml
---
type: capture-run
oem: volkswagen-au
model: amarok
source_framework: react-ssr
source_runtime:
  - styled-components
failure_modes:
  - font-variable-missing
  - nested-grid-collapse
repair_recipes:
  - font-variable-injection
  - grid-collapse-repair
qa_status: failed
artifact_version: 14
---
```

This gives Obsidian backlinking and Graphy-style graph traversal without forcing runtime coupling. It also gives LLM agents searchable memory: "show me every page where styled-components SSR broke after hydration" or "which local component should replace a Swiper gallery?"

## 7. Admin UX

Add a “Compile Full Preview” workflow:

1. User clicks `Compile Full Preview`.
2. Drawer opens with live stages:
   - Fetch source
   - Browser render
   - Detect sections
   - Compile CSS
   - Render sections
   - Visual QA
   - Assemble preview
3. Each section shows:
   - thumbnail
   - status
   - diff score
   - warnings
   - repair applied
4. User can open source vs clone comparison.
5. Publishing requires P0 gates to pass.

## 8. Acceptance Criteria

### Page-Level

- Desktop visual score >= 90%.
- Mobile visual score >= 85%.
- No default browser blue links in compiled sections.
- No text columns narrower than 160px unless source also has that layout.
- No major missing hero/stats/CTA images.
- Font families match source for headings/body/buttons.
- No resource failures for required assets.

### Section-Level

- Hero: image coverage within 5% of source crop.
- CTA buttons: font, border radius, background, and placement within tolerance.
- Specs strip: all cards visible and no overlap.
- Content sections: no single-character wrapping.
- Feature cards: no excessive vertical gaps.

## 9. R&D Plan

### Sprint 0: Tool-Agnostic Harness

- Define provider interfaces for browser capture, visual diff, model reasoning, queueing, and artifact storage.
- Keep current Cloudflare/R2 implementation as one adapter, not the domain model.
- Add schemas for capture runs, section manifests, repair plans, and QA reports.
- Add render-target interfaces for Vue, static HTML, Tailwind HTML, and future React/Web Component output.
- Add Alpine island as an explicit render-target adapter with directive allowlists and local-state boundaries.
- Add knowledge-index provider interface for Graphy/Obsidian/vector/Markdown exporters.
- Add edge-execution provider interface for Cloudflare Workers/Queues/Workflows/Durable Objects and non-Cloudflare equivalents.

Deliverable: swappable harness with current implementation wired in.

### Sprint 1: Cloudflare Execution Harness

- Define the compile-job lifecycle across Worker API, queue/workflow, artifact store, and preview route.
- Create isolated section-render harness endpoints for visual QA.
- Add R2 paths for raw capture, generated component artifacts, QA screenshots, and versioned previews.
- Add job state/progress persistence with either Durable Objects, existing storage, or an equivalent adapter.
- Add strict CSP/version-pinning rules for dealer/client embed outputs.

Deliverable: Cloudflare-backed compile harness that can run one page end-to-end without manual R2 edits.

### Sprint 2: Framework and Component Grammar Inventory

- Formalize the existing section registry as the canonical component grammar.
- Map each section type to supported interactions, runtime dependencies, static fallbacks, and QA checks.
- Add framework detection to capture reports: Vue/Nuxt, React/Next, Gatsby, AEM, Sitecore, WordPress, styled-components, Emotion, Swiper, Splide, Slick, GSAP, custom vanilla JS.
- Add a runtime strategy matrix so the compiler can convert source interactions into local equivalents.
- Include Alpine island suitability rules in the runtime strategy matrix.
- Export the component grammar to Obsidian-compatible Markdown notes and machine-readable JSON.

Deliverable: component grammar and runtime strategy matrix for current dashboard components.

### Sprint 3: Evidence Capture

- Add run artifact storage for SSR HTML, hydrated DOM, CSSOM, screenshots, network logs.
- Add font diagnostics.
- Add class/CSS match scoring.
- Implement VW/Ford replay harness.

Deliverable: capture report for Mustang and Amarok.

### Sprint 4: LLM + Deterministic Section Segmentation

- Build section detector.
- Add multimodal LLM section classifier using screenshots and DOM snippets.
- Require structured output and schema validation.
- Reconcile model sections with DOM bounding boxes.
- Produce screenshot crops.
- Classify section types.
- Store section manifests.

Deliverable: section inventory for 5 OEM model pages.

### Sprint 5: CSS Compiler Prototype

- Implement `linked-css`, `ssr-styled-components`, and `computed-critical` strategies.
- Use browser CSS inspection methods for matched/computed styles and stylesheet text.
- Add font/root-variable extraction.

Deliverable: section artifacts render independently.

### Sprint 6: LLM-Assisted Repair + Reconstruction

- Feed source/clone screenshots, diffs, and computed diagnostics to the model.
- Return structured repair proposals.
- Apply only whitelisted repair recipes automatically.
- Generate reconstructed section candidates for unstable OEM CSS.
- Generate typed component manifests for dynamic sections such as carousel, pinned-scroll, gallery-lightbox, tabs, and vehicle-360.

Deliverable: VW lower-page grid collapse repaired or reconstructed without manual artifact editing.

### Sprint 7: Dynamic Runtime Adapters

- Wire generated manifests into existing Vue renderers first.
- Add static fallback rendering for every dynamic interaction.
- Add GSAP/ScrollTrigger adapter for pinned-scroll and scroll-reveal.
- Add Embla adapter for gallery/media/testimonial/hero carousel sections.
- Add Alpine island adapter for portable tabs, accordions, disclosures, simple galleries, filters, and CMS snippets.
- Add compatibility importers for captured Swiper/Splide/Slick markup.

Deliverable: source OEM carousel/gallery/scroll sections can be recreated as local Vue components with stable fallbacks.

### Sprint 8: Visual QA

- Add Playwright screenshot comparison harness.
- Store source/clone/diff images.
- Add automated checks for font fallback, narrow text, missing images, overflow.
- Add interaction QA: carousel next/prev, tab switching, accordion expansion, lightbox open/close, sticky bar scroll reveal, pinned scroll fallback.

Deliverable: QA report and pass/fail dashboard.

### Sprint 9: Repair Engine Hardening

- Add first repair recipes:
  - SSR/body strategy switch
  - font variable injection
  - grid collapse repair
  - asset URL normalization
  - sticky bar isolation

Deliverable: Amarok and Mustang pass without manual artifact edits.

### Sprint 10: Admin Productization

- Add compile workflow UI.
- Add progress events/logs.
- Add publish gate.
- Add rollback UI.

Deliverable: client-usable compile/rebuild flow.

### Sprint 11: Knowledge Index Productization

- Export capture reports, component manifests, OEM profiles, and repair recipes into a Markdown vault.
- Add graph edges as frontmatter and JSON sidecars.
- Add admin links from each run to its knowledge note.
- Add agent search over prior runs, components, and repair recipes.
- Add a "similar past failures" panel in the compile workflow.

Deliverable: Graphy/Obsidian-compatible memory system for clone compiler R&D and operations.

## 10. Technical Risks

- OEM sites change frequently.
- Hydrated DOM may not match SSR CSS.
- Font loading differs in iframe contexts.
- Container/grid queries may depend on absent page wrappers.
- Some assets may block hotlinking.
- Visual diffs can be noisy without a stable browser/font environment.

## 11. Mitigations

- Store raw evidence for every run.
- Use strategy detection, not one capture mode.
- Use fixed Chrome/container environment for QA.
- Version every artifact and support rollback.
- Keep OEM profiles small and data-driven.
- Treat section compile failures as isolated, not page-wide failures.
- Index every run and repair in a knowledge graph so fixes become reusable operational memory.

## 12. Recommended Decision

Proceed with a tool-agnostic section artifact compiler with an LLM-assisted fast path.

The page clone should remain a raw input and fallback, but client-facing previews should be assembled from section artifacts that pass visual QA. Do not lock into one browser tool, one diff engine, one AI provider, or one hosting vendor. Let LLMs do the work they are good at: interpretation, section mapping, design-token inference, and repair planning. Let deterministic browser checks decide whether the result can be published.

## 13. References

- Playwright visual comparisons support screenshot baselines and pixel diff options; they also warn that rendering varies by OS/browser/fonts, so consistent environments matter: https://playwright.dev/docs/test-snapshots
- Chrome DevTools Protocol CSS domain exposes matched styles, computed styles, stylesheet text, CSS coverage, and platform font usage APIs: https://chromedevtools.github.io/devtools-protocol/tot/CSS/
- styled-components SSR emits style tags from `ServerStyleSheet`; docs note `getStyleTags()` returns style tags that must be included with rendered HTML: https://styled-components.com/docs/advanced#server-side-rendering
- styled-components supports CSS custom properties for theming and notes that variables cascade to children, which matches the VW font-variable issue observed in iframe clones: https://styled-components.com/docs/advanced
- OpenAI vision-capable models can process image inputs, which supports screenshot-based section classification and visual mismatch analysis: https://developers.openai.com/api/docs/guides/images-vision
- OpenAI Structured Outputs can force model responses to adhere to a JSON schema, which is suitable for section manifests and repair plans: https://developers.openai.com/api/docs/guides/structured-outputs
