# Structured OEM Renderer And Scoped Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-mode OEM page delivery pipeline: scoped clone HTML for pixel-fidelity embeds, and structured Vue/Tailwind sections for editable enterprise pages.

**Architecture:** Keep clone mode as the fast fidelity path, but rewrite it into a scoped artifact so OEM CSS cannot bleed into dealer/feed apps. Promote sections mode into a structured production artifact rendered by our own components, using capture/DOM/screenshot/AI normalization instead of making CSS-to-Tailwind conversion the product path.

**Tech Stack:** Cloudflare Worker, Hono, R2, TypeScript, Cheerio, PostCSS selector processing, existing PageStructurer/section-mapper, dashboard Vue page-builder, Vitest.

---

## Decisions

- Keep the existing CSS-to-Tailwind converter as a capture aid only. It is not the production renderer.
- Add a CSS-scoped clone mode for pixel fidelity and fast external embeds.
- Add a structured production mode for editable pages and long-term portability.
- Never inject unscoped OEM CSS into `promotion-knoxgwmhaval` or another dealer/feed app.
- Pilot on `mitsubishi-au-outlander`; do not change live GAC/Foton behavior.

## File Structure

- Create `src/design/production-css-scope.ts`
  - Scopes clone HTML and stylesheet rules under a stable wrapper.
  - Rewrites `html`, `body`, `:root`, universal, normal selectors, and nested `@media`/`@supports` rules.
  - Reports scoping diagnostics for the production manifest.

- Modify `src/routes/oem-agent.ts`
  - Use scoped clone artifact in `/pages/:slug/production-html`.
  - Add `view=clone|structured` support for production endpoints.
  - Add structured production endpoint or variant when sections are available.

- Modify `src/design/page-modes.ts`
  - Add helper for detecting structured production availability without changing active editor mode.

- Modify `src/oem/types.ts`
  - Add production artifact metadata types if needed.
  - Keep page content backward-compatible.

- Add tests:
  - `src/design/production-css-scope.test.ts`
  - Extend route tests if an existing route test harness is available; otherwise add focused unit coverage around artifact builders.

- Promotion repo follow-up, after oem-agent is verified:
  - `promotion-knoxgwmhaval/server/api/vehicles/by-slug/[slug].get.ts`
  - Consume explicit `view=clone` initially; later allow `view=structured` per dealer/OEM config.

---

## Task 1: Add Production CSS Scoping

**Files:**
- Create: `src/design/production-css-scope.ts`
- Create: `src/design/production-css-scope.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing tests for scoped clone HTML**

Create `src/design/production-css-scope.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { scopeProductionCloneHtml } from './production-css-scope'

describe('scopeProductionCloneHtml', () => {
  it('wraps clone markup in an OEM scope root', () => {
    const result = scopeProductionCloneHtml('<section class="hero"><h1>Outlander</h1></section>', {
      oemId: 'mitsubishi-au',
      modelSlug: 'outlander',
    })

    expect(result.html).toContain('class="oem-production-scope"')
    expect(result.html).toContain('data-oem-id="mitsubishi-au"')
    expect(result.html).toContain('data-model-slug="outlander"')
    expect(result.diagnostics.scopeSelector).toBe('.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"]')
  })

  it('prefixes ordinary CSS selectors inside style tags', () => {
    const result = scopeProductionCloneHtml('<style>.hero, .cta:hover { color: red; }</style><section class="hero"></section>', {
      oemId: 'mitsubishi-au',
      modelSlug: 'outlander',
    })

    expect(result.html).toContain('.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"] .hero')
    expect(result.html).toContain('.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"] .cta:hover')
    expect(result.html).not.toContain('.hero, .cta:hover { color: red; }')
  })

  it('rewrites html body and root selectors to the wrapper', () => {
    const result = scopeProductionCloneHtml('<style>html, body, :root { background: #fff; }</style><main>Body</main>', {
      oemId: 'mitsubishi-au',
      modelSlug: 'outlander',
    })

    expect(result.html).toContain('.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"] { background: #fff; }')
    expect(result.html).not.toContain('html, body, :root')
  })

  it('scopes selectors inside media queries', () => {
    const result = scopeProductionCloneHtml('<style>@media (max-width: 767px) { .hero { display: block; } }</style><div class="hero"></div>', {
      oemId: 'mitsubishi-au',
      modelSlug: 'outlander',
    })

    expect(result.html).toContain('@media (max-width: 767px)')
    expect(result.html).toContain('.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"] .hero')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- src/design/production-css-scope.test.ts
```

Expected: fails because `production-css-scope.ts` does not exist.

- [ ] **Step 3: Add PostCSS as a direct dependency**

Run:

```bash
npm install postcss postcss-selector-parser
```

Expected: `package.json` and lockfile update.

- [ ] **Step 4: Implement scoped clone HTML**

Create `src/design/production-css-scope.ts`:

```ts
import { load } from 'cheerio'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

export interface ScopeProductionCloneOptions {
  oemId: string
  modelSlug: string
}

export interface ScopeProductionCloneDiagnostics {
  scopeSelector: string
  styleTagsScoped: number
  rulesScoped: number
  rulesSkipped: number
}

export interface ScopeProductionCloneResult {
  html: string
  diagnostics: ScopeProductionCloneDiagnostics
}

function attrEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function scopeSelectorFor(options: ScopeProductionCloneOptions): string {
  return `.oem-production-scope[data-oem-id="${attrEscape(options.oemId)}"][data-model-slug="${attrEscape(options.modelSlug)}"]`
}

function isGlobalSelector(selector: string): boolean {
  return /^(html|body|:root)(\b|$)/.test(selector.trim())
}

function shouldSkipSelector(selector: string): boolean {
  const trimmed = selector.trim()
  return trimmed.startsWith('@') || trimmed.includes(':host') || trimmed.includes('::backdrop')
}

function scopeSelector(selector: string, scope: string): string {
  if (shouldSkipSelector(selector)) return selector
  if (isGlobalSelector(selector)) return scope

  return selectorParser((root) => {
    root.each((sel) => {
      const first = sel.at(0)
      if (!first) return
      const scopeAst = selectorParser().astSync(scope)
      const scopeNodes = scopeAst.nodes[0]?.nodes ?? []
      sel.prepend(selectorParser.combinator({ value: ' ' }))
      for (let i = scopeNodes.length - 1; i >= 0; i--) {
        sel.prepend(scopeNodes[i].clone())
      }
    })
  }).processSync(selector)
}

function scopeCss(css: string, scope: string): { css: string; rulesScoped: number; rulesSkipped: number } {
  const root = postcss.parse(css)
  let rulesScoped = 0
  let rulesSkipped = 0

  root.walkRules((rule) => {
    try {
      const before = rule.selector
      rule.selector = rule.selectors.map((selector) => scopeSelector(selector, scope)).join(', ')
      if (rule.selector !== before) rulesScoped += 1
    } catch {
      rulesSkipped += 1
    }
  })

  return { css: root.toString(), rulesScoped, rulesSkipped }
}

export function scopeProductionCloneHtml(html: string, options: ScopeProductionCloneOptions): ScopeProductionCloneResult {
  const scope = scopeSelectorFor(options)
  const $ = load(`<div data-oem-scope-root="true">${html}</div>`, { decodeEntities: false })
  let styleTagsScoped = 0
  let rulesScoped = 0
  let rulesSkipped = 0

  $('style').each((_index, el) => {
    const css = $(el).text()
    const scoped = scopeCss(css, scope)
    $(el).text(scoped.css)
    styleTagsScoped += 1
    rulesScoped += scoped.rulesScoped
    rulesSkipped += scoped.rulesSkipped
  })

  const root = $('[data-oem-scope-root="true"]').first()
  root.removeAttr('data-oem-scope-root')
  root.attr('class', 'oem-production-scope')
  root.attr('data-oem-id', options.oemId)
  root.attr('data-model-slug', options.modelSlug)

  return {
    html: $.html(root),
    diagnostics: {
      scopeSelector: scope,
      styleTagsScoped,
      rulesScoped,
      rulesSkipped,
    },
  }
}
```

- [ ] **Step 5: Run the scoped CSS tests**

Run:

```bash
npm test -- src/design/production-css-scope.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json src/design/production-css-scope.ts src/design/production-css-scope.test.ts
git commit -m "feat: add production clone CSS scoping"
```

---

## Task 2: Use Scoped Clone HTML In Production Endpoints

**Files:**
- Modify: `src/routes/oem-agent.ts`
- Test: extend route/artifact tests or add focused tests beside the scoper.

- [ ] **Step 1: Add failing artifact expectations**

Add tests that call the production artifact builder or a small exported helper and assert:

```ts
expect(artifact.body).toContain('class="oem-production-scope"')
expect(artifact.body).toContain('data-oem-id="mitsubishi-au"')
expect(artifact.headers['X-OEM-Page-Mode']).toBe('clone')
expect(manifest.scope.rules_scoped).toBeGreaterThanOrEqual(0)
```

- [ ] **Step 2: Export artifact helpers for testing**

In `src/routes/oem-agent.ts`, export the production artifact helper functions if no route test harness exists:

```ts
export async function buildProductionCloneArtifact(page: any, origin: string, slugParts?: { oemId: string; modelSlug: string }) {
  // existing implementation updated in Step 3
}
```

- [ ] **Step 3: Apply CSS scoping to clone artifact generation**

Update `buildProductionCloneArtifact`:

```ts
import { scopeProductionCloneHtml } from '../design/production-css-scope'

export async function buildProductionCloneArtifact(page: any, origin: string, slugParts?: { oemId: string; modelSlug: string }) {
  const html = getProductionCloneHtml(page)
  if (!html) return null

  const absoluteHtml = absoluteMediaUrls(html, origin)
  const scoped = slugParts
    ? scopeProductionCloneHtml(absoluteHtml, slugParts)
    : { html: absoluteHtml, diagnostics: null }

  const body = scoped.html
  const bytes = new TextEncoder().encode(body).byteLength
  const sha256 = await sha256Hex(body)

  return {
    body,
    bytes,
    sha256,
    etag: `"sha256-${sha256}"`,
    scope: scoped.diagnostics,
  }
}
```

- [ ] **Step 4: Pass parsed slug parts into artifact generation**

Update all `/production-html`, `HEAD /production-html`, and `/production-manifest` calls:

```ts
const artifact = await buildProductionCloneArtifact(page, origin, {
  oemId: parsed.oemId,
  modelSlug: parsed.modelSlug,
})
```

- [ ] **Step 5: Add scope diagnostics to the manifest**

Add to `/production-manifest` response:

```ts
scope: artifact.scope
  ? {
      selector: artifact.scope.scopeSelector,
      style_tags_scoped: artifact.scope.styleTagsScoped,
      rules_scoped: artifact.scope.rulesScoped,
      rules_skipped: artifact.scope.rulesSkipped,
    }
  : null,
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- src/design/production-css-scope.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/routes/oem-agent.ts src/design/production-css-scope.test.ts
git commit -m "feat: scope production clone artifacts"
```

---

## Task 3: Add Explicit Production Render Modes

**Files:**
- Modify: `src/routes/oem-agent.ts`
- Modify: `src/design/page-modes.ts`
- Test: `src/design/page-modes.test.ts`

- [ ] **Step 1: Add mode availability tests**

Add tests to `src/design/page-modes.test.ts`:

```ts
import { hasProductionSections } from './page-modes'

it('reports structured production availability when sections exist', () => {
  expect(hasProductionSections({
    active_mode: 'clone',
    content: {
      rendered: '<main>Clone</main>',
      sections: [{ id: 'hero', type: 'hero', order: 0, heading: 'Outlander' }],
    },
  })).toBe(true)
})

it('does not report structured production availability for empty sections', () => {
  expect(hasProductionSections({
    active_mode: 'clone',
    content: { rendered: '<main>Clone</main>', sections: [] },
  })).toBe(false)
})
```

- [ ] **Step 2: Implement `hasProductionSections`**

In `src/design/page-modes.ts`:

```ts
export function hasProductionSections(page: ModeAwarePage): boolean {
  normalizePageModes(page)
  return Array.isArray(page.content?.modes?.sections?.items) && page.content.modes.sections.items.length > 0
}
```

- [ ] **Step 3: Add `view=clone|structured` handling to production endpoints**

In `src/routes/oem-agent.ts`:

```ts
type ProductionView = 'clone' | 'structured'

function requestedProductionView(value: string | null): ProductionView {
  return value === 'structured' ? 'structured' : 'clone'
}
```

Use this in `/production-html` and `/production-manifest`:

```ts
const view = requestedProductionView(c.req.query('view') ?? null)
```

For this task, `structured` may return `409` until Task 4 adds rendering:

```ts
if (view === 'structured') {
  return c.json({ error: 'Structured production HTML is not implemented yet', slug }, 409)
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/design/page-modes.test.ts src/design/production-css-scope.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/design/page-modes.ts src/design/page-modes.test.ts src/routes/oem-agent.ts
git commit -m "feat: add explicit production render modes"
```

---

## Task 4: Build Structured Production HTML Renderer

**Files:**
- Create: `src/design/structured-production-renderer.ts`
- Create: `src/design/structured-production-renderer.test.ts`
- Modify: `src/routes/oem-agent.ts`

- [ ] **Step 1: Add failing renderer tests**

Create `src/design/structured-production-renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderStructuredProductionHtml } from './structured-production-renderer'

describe('renderStructuredProductionHtml', () => {
  it('renders hero sections with responsive desktop and mobile images', () => {
    const html = renderStructuredProductionHtml({
      oemId: 'mitsubishi-au',
      modelSlug: 'outlander',
      sections: [{
        type: 'hero',
        id: 'hero',
        order: 0,
        heading: 'Outlander',
        sub_heading: 'Make Your Mark.',
        cta_text: 'Explore',
        cta_url: '#',
        desktop_image_url: '/media/desktop.jpg',
        mobile_image_url: '/media/mobile.jpg',
      }],
    })

    expect(html).toContain('<picture>')
    expect(html).toContain('media="(max-width: 767px)"')
    expect(html).toContain('/media/mobile.jpg')
    expect(html).toContain('/media/desktop.jpg')
    expect(html).toContain('Outlander')
  })

  it('renders accordions with native details and summary', () => {
    const html = renderStructuredProductionHtml({
      oemId: 'mitsubishi-au',
      modelSlug: 'outlander',
      sections: [{
        type: 'accordion',
        id: 'faq',
        order: 1,
        title: 'FAQs',
        items: [{ question: 'Warranty', answer: '<p>Five years.</p>' }],
      }],
    })

    expect(html).toContain('<details')
    expect(html).toContain('<summary>Warranty</summary>')
  })
})
```

- [ ] **Step 2: Implement minimal structured renderer**

Create `src/design/structured-production-renderer.ts`:

```ts
import type { PageSection } from '../oem/types'

export interface StructuredProductionRenderInput {
  oemId: string
  modelSlug: string
  sections: PageSection[]
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderHero(section: any): string {
  return `<section class="oem-structured-section oem-structured-hero">
    <picture>
      ${section.mobile_image_url ? `<source media="(max-width: 767px)" srcset="${esc(section.mobile_image_url)}">` : ''}
      ${section.desktop_image_url ? `<img src="${esc(section.desktop_image_url)}" alt="${esc(section.heading)}">` : ''}
    </picture>
    <div class="oem-structured-hero__content">
      <h1>${esc(section.heading)}</h1>
      ${section.sub_heading ? `<p>${esc(section.sub_heading)}</p>` : ''}
      ${section.cta_text && section.cta_url ? `<a href="${esc(section.cta_url)}">${esc(section.cta_text)}</a>` : ''}
    </div>
  </section>`
}

function renderAccordion(section: any): string {
  const items = (section.items || []).map((item: any) =>
    `<details><summary>${esc(item.question)}</summary><div>${item.answer || ''}</div></details>`
  ).join('')
  return `<section class="oem-structured-section oem-structured-accordion">${section.title ? `<h2>${esc(section.title)}</h2>` : ''}${items}</section>`
}

function renderFallback(section: any): string {
  const title = section.title || section.heading || ''
  const body = section.body_html || section.content_html || section.body || ''
  return `<section class="oem-structured-section oem-structured-${esc(section.type)}">${title ? `<h2>${esc(title)}</h2>` : ''}${body}</section>`
}

export function renderStructuredProductionHtml(input: StructuredProductionRenderInput): string {
  const sections = input.sections
    .slice()
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    .map((section: any) => {
      if (section.type === 'hero') return renderHero(section)
      if (section.type === 'accordion') return renderAccordion(section)
      return renderFallback(section)
    })
    .join('\n')

  return `<div class="oem-structured-production" data-oem-id="${esc(input.oemId)}" data-model-slug="${esc(input.modelSlug)}">${sections}</div>`
}
```

- [ ] **Step 3: Wire `view=structured` to the renderer**

In `src/routes/oem-agent.ts`, import and call:

```ts
import { renderStructuredProductionHtml } from '../design/structured-production-renderer'

async function buildStructuredProductionArtifact(page: any, origin: string, slugParts: { oemId: string; modelSlug: string }) {
  const sections = page?.content?.modes?.sections?.items || page?.content?.sections
  if (!Array.isArray(sections) || sections.length === 0) return null

  const body = absoluteMediaUrls(renderStructuredProductionHtml({
    oemId: slugParts.oemId,
    modelSlug: slugParts.modelSlug,
    sections,
  }), origin)
  const bytes = new TextEncoder().encode(body).byteLength
  const sha256 = await sha256Hex(body)
  return { body, bytes, sha256, etag: `"sha256-${sha256}"` }
}
```

- [ ] **Step 4: Update headers and manifest for structured mode**

Set:

```ts
'X-OEM-Page-Mode': 'structured'
```

Manifest should include:

```ts
mode: view,
sections_count: view === 'structured' ? sections.length : null,
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/design/structured-production-renderer.test.ts src/design/page-modes.test.ts src/design/production-css-scope.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/design/structured-production-renderer.ts src/design/structured-production-renderer.test.ts src/routes/oem-agent.ts
git commit -m "feat: add structured production renderer"
```

---

## Task 5: Strengthen Mitsubishi Section Extraction

**Files:**
- Modify: `src/design/page-structurer.ts`
- Modify: `src/design/prompt-builder.ts`
- Modify: `src/design/section-mapper.ts`
- Test: existing structurer/mapper tests plus new Mitsubishi fixtures if available.

- [ ] **Step 1: Expand extractable section types**

Update `EXTRACTABLE_SECTION_TYPES` in `src/design/page-structurer.ts` to include:

```ts
'accordion', 'comparison-table', 'stats', 'image-showcase', 'split-content', 'media'
```

- [ ] **Step 2: Update prompt rules**

Add explicit extraction rules for:

```md
- Variant/model pickers: output as tabs when variants switch model copy/images.
- Vehicle color pickers: output color-picker with variant_groups when variant-specific colors exist.
- Accordions: output accordion with items, never content-block.
- Videos and lightboxes: output video with poster_url and video_url when available; if video_url is JS-only, preserve poster_url and data attributes in content_html.
- OEM header/nav/footer: skip.
```

- [ ] **Step 3: Add validation branches**

In `validateSections`, add concrete cases for `accordion`, `comparison-table`, `stats`, `image-showcase`, `split-content`, and `media` so these types are not silently dropped.

- [ ] **Step 4: Run section tests**

Run:

```bash
npm test -- src/design/page-structurer.test.ts src/design/section-mapper.test.ts src/design/page-section-types.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/design/page-structurer.ts src/design/prompt-builder.ts src/design/section-mapper.ts src/design/page-structurer.test.ts
git commit -m "feat: strengthen structured OEM section extraction"
```

---

## Task 6: Production QA For Clone And Structured Modes

**Files:**
- Create or modify QA script under `scripts/`
- Modify docs if existing QA docs need the new mode list.

- [ ] **Step 1: Add QA checklist script**

Create a script that checks:

```ts
const checks = [
  'fetch clone manifest',
  'fetch clone html',
  'assert clone wrapper exists',
  'assert no unscoped style selectors remain for body/html/:root',
  'fetch structured manifest when available',
  'fetch structured html when available',
  'assert hero picture has mobile and desktop images',
  'assert video sections preserve poster/video metadata',
  'assert accordion sections render native details/summary',
]
```

- [ ] **Step 2: Run QA against Mitsubishi Outlander**

Run:

```bash
node scripts/qa-production-oem-page.mjs mitsubishi-au-outlander
```

Expected:

```text
clone: pass
structured: pass or unavailable
broken_media: 0
unscoped_global_css: 0
```

- [ ] **Step 3: Commit Task 6**

```bash
git add scripts/qa-production-oem-page.mjs docs/OEM_FIDELITY_QA.md
git commit -m "test: add production OEM page QA"
```

---

## Task 7: Dealer App Integration Follow-Up

**Files:**
- Modify in `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval`:
  - `server/api/vehicles/by-slug/[slug].get.ts`
  - optional config/migration for `oemAgent.productionView`

- [ ] **Step 1: Keep Mornington Mitsubishi explicit**

Do not default all missing OEM config to Mitsubishi. Only use OEM Agent production rendering when dealer config has:

```json
{
  "oemAgent": {
    "productionHtml": true,
    "productionView": "clone"
  }
}
```

- [ ] **Step 2: Fetch explicit clone mode first**

Use:

```ts
const view = oemAgentConfig.productionView === 'structured' ? 'structured' : 'clone'
const htmlUrl = `${baseUrl}/api/v1/oem-agent/pages/${pageId}/production-html?view=${view}`
```

- [ ] **Step 3: Add structured mode as opt-in only**

Allow:

```json
{
  "productionView": "structured"
}
```

only after Mitsubishi Outlander structured QA passes.

- [ ] **Step 4: Verify locally**

Run:

```bash
pnpm run typecheck
pnpm exec vitest run server/services/oem/__tests__/mitsubishi-adapter.test.ts
```

Expected: typecheck and tests pass.

- [ ] **Step 5: Commit dealer integration changes**

```bash
git add server/api/vehicles/by-slug/[slug].get.ts database/migrations/<migration>.sql
git commit -m "feat: support explicit OEM Agent production view"
```

---

## Verification Commands

Run before deployment:

```bash
npm test
npm run typecheck
npm run build
```

Run after deployment:

```bash
curl -I "https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-html?view=clone"
curl "https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-manifest?view=clone"
curl "https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/mitsubishi-au-outlander/production-manifest?view=structured"
```

Expected:

- Clone mode returns `200`.
- Clone HTML contains `.oem-production-scope`.
- Clone manifest reports scoping diagnostics.
- Structured mode returns `200` only when sections exist; otherwise `409` is acceptable until extraction is promoted.
- No change to GAC/Foton live behavior.

---

## Rollout

1. Implement scoped clone mode first and deploy.
2. Confirm Mitsubishi Outlander production embed no longer bleeds CSS into the dealer app.
3. Build structured renderer behind `view=structured`.
4. Run Mitsubishi Outlander structured QA.
5. Opt Mornington Mitsubishi into structured mode only when QA passes.
6. Repeat for remaining Mitsubishi pages.

