# M2 Alpine Clone Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognized interactive regions in captured OEM clones (tabs, accordions, carousels, galleries) get real, owned behavior via an Alpine.js runtime stamped at compile time — collapsing the current 49k-px all-panels-open over-render on VW Amarok and making `qa:functional` pass against the live preview.

**Architecture:** At compile time (worker), cheerio-based detectors tag interactive regions in the captured HTML and a stamper annotates them with Alpine directives + `data-clone-*` attributes (attributes survive the dashboard sanitizer; `<script>` tags do NOT — verified). The runtime itself (vendored Alpine CSP build + our component factories) travels with the page data as `content.modes.clone.runtime_js`, and each rendering surface injects it as a trusted script the same way the bridge script already gets in: `buildCloneStudioHtml` (dashboard preview) and `buildProductionCloneArtifact` (worker production route). The bridge's legacy `enableInteractivity()` shims skip stamped regions, giving safe coexistence for pages not yet recompiled.

**Tech Stack:** TypeScript (CF Worker + Vue dashboard), cheerio (already a worker dep), Alpine.js CSP build v3.x (vendored, no CDN), vitest, Puppeteer QA scripts.

## Global Constraints

- **Stored clone HTML carries attributes only, never `<script>`** — the dashboard sanitizer removes all script elements (`sanitizeCloneStudioHtmlWithDom`, `clone-studio-html.ts` ~:4885) and strips `on*`/`srcdoc` attributes. Alpine directives must use `x-data` / `x-on:click` forms (never `@click`; never anything starting with `on`).
- **Alpine CSP build only** (`@alpinejs/csp`) — no `unsafe-eval`; all behavior lives in `Alpine.data` component methods; markup expressions are bare component/method names only (`x-data="cloneTabs"`, `x-on:click="selectTab"`).
- **Runtime travels with page data**: `content.modes.clone.runtime_js` (+ `runtime_version`, `interactions`). The dashboard renders what the compiler shipped — no dashboard↔worker source imports.
- **Interaction types come from `compiler-contracts.ts` `INTERACTION_TYPES`** — do not define new type unions. M2 implements: `tabs`, `accordion`, `carousel`, `gallery-lightbox`. Others remain undetected (pass through untouched).
- **Conservative recognition**: a region is only stamped when the detector finds BOTH the trigger set and the panel/slide set. Unrecognized markup passes through byte-identical.
- **Legacy bridge coexistence**: `enableInteractivity()` must skip any element inside `[data-clone-interaction]`. Do not delete bridge shim functions in M2 (old pages haven't recompiled); the skip-guard IS the retirement mechanism.
- **GAC (gac-au) pages must never be rebuilt** (user constraint; code already write-protects).
- Worker tests: `npx vitest run <file>` from repo root; typecheck `npm run typecheck`. Dashboard tests: `CI=1 pnpm exec vitest run --mode production --pool forks --maxWorkers=1 <file>` from `dashboard/`; dashboard typecheck is part of `pnpm build` (run in Task 9, not per-task). Commit per task; no push/deploy until Task 9.
- Anchors, not line numbers: `page-capturer.ts` and `clone-studio-html.ts` have shifted since any cited line — locate every edit by the quoted code anchor.

---

### Task 1: Vendored Alpine CSP build + clone runtime module

**Files:**
- Create: `scripts/vendor-alpine.mjs` (one-shot generator, checked in for reproducibility)
- Create: `src/design/clone-runtime/alpine-csp.ts` (generated: the vendored library as an exported string)
- Create: `src/design/clone-runtime/clone-runtime.ts`
- Test: `src/design/clone-runtime/clone-runtime.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (used by Tasks 4, 5, 6):
  - `export const CLONE_RUNTIME_VERSION = 'clone-runtime-v1'`
  - `export function buildCloneRuntimeScript(): string` — components registration (listening for `alpine:init`) followed by the Alpine CSP IIFE, as one inline-able script body (no `<script>` wrapper).
  - `export const CLONE_INTERACTION_ATTR = 'data-clone-interaction'`
  - `export const CLONE_REGION_ID_ATTR = 'data-clone-region-id'`

- [ ] **Step 1: Write the vendor script**

Create `scripts/vendor-alpine.mjs`:

```js
// One-shot: fetches the pinned Alpine CSP build and writes it as a TS string module.
// Re-run only to bump ALPINE_VERSION; the output is committed.
import { writeFileSync } from 'node:fs';

const ALPINE_VERSION = '3.14.9';
const url = `https://cdn.jsdelivr.net/npm/@alpinejs/csp@${ALPINE_VERSION}/dist/cdn.min.js`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`fetch failed: ${res.status} ${url}`);
  process.exit(1);
}
const code = await res.text();
if (!code.includes('Alpine')) {
  console.error('downloaded file does not look like Alpine');
  process.exit(1);
}

const banner = `/**
 * Vendored Alpine.js CSP build v${ALPINE_VERSION} — generated by scripts/vendor-alpine.mjs.
 * Do not edit by hand. The CSP build evaluates no inline expressions (no unsafe-eval),
 * so it is safe under strict tenant Content-Security-Policies.
 */
export const ALPINE_CSP_VERSION = '${ALPINE_VERSION}';
export const ALPINE_CSP_JS: string = `;

writeFileSync(
  new URL('../src/design/clone-runtime/alpine-csp.ts', import.meta.url),
  banner + JSON.stringify(code) + ';\n',
);
console.log(`wrote src/design/clone-runtime/alpine-csp.ts (${code.length} bytes, v${ALPINE_VERSION})`);
```

- [ ] **Step 2: Generate the vendored module**

Run: `mkdir -p src/design/clone-runtime && node scripts/vendor-alpine.mjs`
Expected: `wrote src/design/clone-runtime/alpine-csp.ts (…bytes, v3.14.9)`. If the jsdelivr URL 404s, list available versions at `https://cdn.jsdelivr.net/npm/@alpinejs/csp/` and pin the closest 3.14.x, updating `ALPINE_VERSION` in the script — record the chosen version in your report.

- [ ] **Step 3: Write the failing tests**

Create `src/design/clone-runtime/clone-runtime.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { ALPINE_CSP_JS } from './alpine-csp'
import {
  buildCloneRuntimeScript,
  CLONE_INTERACTION_ATTR,
  CLONE_REGION_ID_ATTR,
  CLONE_RUNTIME_VERSION,
} from './clone-runtime'

describe('buildCloneRuntimeScript', () => {
  it('registers all four M2 components before loading Alpine', () => {
    const script = buildCloneRuntimeScript()

    const registration = script.indexOf("Alpine.data('cloneTabs'")
    const alpineLib = script.indexOf(ALPINE_CSP_JS.slice(0, 80))

    expect(registration).toBeGreaterThan(-1)
    expect(script).toContain("Alpine.data('cloneAccordion'")
    expect(script).toContain("Alpine.data('cloneCarousel'")
    expect(script).toContain("Alpine.data('cloneGallery'")
    expect(alpineLib).toBeGreaterThan(registration)
  })

  it('is syntactically valid JavaScript', () => {
    expect(() => new Function(buildCloneRuntimeScript())).not.toThrow()
  })

  it('never emits a closing script tag that would break inline embedding', () => {
    expect(buildCloneRuntimeScript()).not.toMatch(/<\/script/i)
  })

  it('hides inactive panels with priority high enough to beat capture-forced styles', () => {
    const script = buildCloneRuntimeScript()

    expect(script).toContain("setProperty('display', 'none', 'important')")
  })

  it('exposes stable attribute names and version', () => {
    expect(CLONE_INTERACTION_ATTR).toBe('data-clone-interaction')
    expect(CLONE_REGION_ID_ATTR).toBe('data-clone-region-id')
    expect(CLONE_RUNTIME_VERSION).toBe('clone-runtime-v1')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/design/clone-runtime/clone-runtime.test.ts`
Expected: FAIL — `clone-runtime` module does not exist.

- [ ] **Step 5: Implement the runtime module**

Create `src/design/clone-runtime/clone-runtime.ts`:

```ts
/**
 * Clone Runtime — owned interaction behavior for captured OEM clones.
 *
 * The compiled clone HTML carries only attributes (x-data / x-on:click /
 * data-clone-*) because the dashboard sanitizer strips <script> elements.
 * This module produces the trusted script body that each rendering surface
 * injects alongside the sanitized markup. Component behavior is imperative
 * (methods manipulate styles directly) so the Alpine CSP build needs no
 * inline expressions and no unsafe-eval.
 *
 * The registration block MUST precede the Alpine library: Alpine fires
 * `alpine:init` synchronously during startup, and components registered
 * after startup never bind.
 */

import { ALPINE_CSP_JS, ALPINE_CSP_VERSION } from './alpine-csp';

export const CLONE_RUNTIME_VERSION = 'clone-runtime-v1';
export const CLONE_INTERACTION_ATTR = 'data-clone-interaction';
export const CLONE_REGION_ID_ATTR = 'data-clone-region-id';

const COMPONENTS_JS = `
document.addEventListener('alpine:init', function () {
  Alpine.data('cloneTabs', function () {
    return {
      triggers: [],
      panels: [],
      init: function () {
        this.triggers = Array.from(this.$el.querySelectorAll('[data-clone-tab]'));
        this.panels = Array.from(this.$el.querySelectorAll('[data-clone-panel]'));
        var selected = this.triggers.findIndex(function (t) {
          return t.getAttribute('aria-selected') === 'true';
        });
        this.show(selected >= 0 ? selected : 0);
      },
      selectTab: function (event) {
        var index = Number(event.currentTarget.getAttribute('data-clone-tab'));
        if (Number.isFinite(index)) this.show(index);
      },
      show: function (index) {
        this.panels.forEach(function (panel) {
          var i = Number(panel.getAttribute('data-clone-panel'));
          if (i === index) {
            panel.style.removeProperty('display');
          } else {
            panel.style.setProperty('display', 'none', 'important');
          }
        });
        this.triggers.forEach(function (trigger) {
          var i = Number(trigger.getAttribute('data-clone-tab'));
          trigger.setAttribute('aria-selected', i === index ? 'true' : 'false');
        });
      },
    };
  });

  Alpine.data('cloneAccordion', function () {
    return {
      init: function () {
        var panels = this.$el.querySelectorAll('[data-clone-acc-panel]');
        Array.from(panels).forEach(function (panel) {
          var trigger = panel.parentElement
            ? panel.parentElement.querySelector('[data-clone-acc-trigger="' + panel.getAttribute('data-clone-acc-panel') + '"]')
            : null;
          var expanded = trigger && trigger.getAttribute('aria-expanded') === 'true';
          if (!expanded) panel.style.setProperty('display', 'none', 'important');
        });
      },
      togglePanel: function (event) {
        var trigger = event.currentTarget;
        var index = trigger.getAttribute('data-clone-acc-trigger');
        var panel = this.$el.querySelector('[data-clone-acc-panel="' + index + '"]');
        if (!panel) return;
        var hidden = panel.style.display === 'none';
        if (hidden) {
          panel.style.removeProperty('display');
          trigger.setAttribute('aria-expanded', 'true');
        } else {
          panel.style.setProperty('display', 'none', 'important');
          trigger.setAttribute('aria-expanded', 'false');
        }
      },
    };
  });

  Alpine.data('cloneCarousel', function () {
    return {
      index: 0,
      track: null,
      slides: [],
      init: function () {
        this.track = this.$el.querySelector('[data-clone-track]');
        this.slides = this.track ? Array.from(this.track.querySelectorAll('[data-clone-slide]')) : [];
        if (this.track) {
          this.track.style.setProperty('display', 'flex', 'important');
          this.track.style.setProperty('transition', 'transform 240ms ease', 'important');
          this.track.style.setProperty('overflow', 'visible');
        }
        if (this.$el.style) this.$el.style.setProperty('overflow', 'hidden', 'important');
        this.update();
      },
      next: function () {
        if (this.slides.length === 0) return;
        this.index = (this.index + 1) % this.slides.length;
        this.update();
      },
      prev: function () {
        if (this.slides.length === 0) return;
        this.index = (this.index - 1 + this.slides.length) % this.slides.length;
        this.update();
      },
      update: function () {
        if (!this.track || this.slides.length === 0) return;
        var offset = this.slides[this.index].offsetLeft - this.slides[0].offsetLeft;
        this.track.style.setProperty('transform', 'translateX(' + (-offset) + 'px)', 'important');
        this.$el.setAttribute('data-clone-carousel-index', String(this.index));
      },
    };
  });

  Alpine.data('cloneGallery', function () {
    return {
      selectImage: function (event) {
        var thumb = event.currentTarget;
        var main = this.$el.querySelector('[data-clone-gallery-main]');
        if (!main) return;
        var thumbImg = thumb.tagName === 'IMG' ? thumb : thumb.querySelector('img');
        var src = thumb.getAttribute('data-clone-full-src') || (thumbImg && (thumbImg.currentSrc || thumbImg.src));
        if (!src) return;
        main.setAttribute('src', src);
        main.removeAttribute('srcset');
        this.$el.setAttribute('data-clone-gallery-selected', thumb.getAttribute('data-clone-gallery-thumb') || '');
      },
    };
  });
});
`;

export function buildCloneRuntimeScript(): string {
  // Registration first, library second — see module docblock.
  const body = `${COMPONENTS_JS}\n;${ALPINE_CSP_JS}`;
  // A literal "</script" inside an inline script terminates the surrounding
  // tag; split the sequence so embedding is always safe.
  return body.replace(/<\/script/gi, '<\\/script');
}

export const CLONE_RUNTIME_LIBRARY_VERSION = ALPINE_CSP_VERSION;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/design/clone-runtime/clone-runtime.test.ts`
Expected: PASS (5 tests). Note: the "syntactically valid" test exercises the escaped output — if the vendored Alpine source contains `</script` sequences, the escape in `buildCloneRuntimeScript` keeps `new Function` parsing valid because `<\/script` inside a JS string literal is still the same string.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add scripts/vendor-alpine.mjs src/design/clone-runtime/
git commit -m "feat(clone-runtime): vendor Alpine CSP build and component runtime"
```

---

### Task 2: Interaction detectors in section-parser.ts

**Files:**
- Modify: `src/design/section-parser.ts` (append a new "Interaction detection" section at the end of the file)
- Test: `src/design/section-parser.test.ts` (check if it exists; extend if so, create if not — match existing repo test style)

**Interfaces:**
- Consumes: `InteractionType` from `./compiler-contracts` (type-only), cheerio (`load`, same dependency `page-capturer.ts` already uses).
- Produces (used by Task 3):
  - `export interface DetectedInteractiveRegion { type: Extract<InteractionType, 'tabs' | 'accordion' | 'carousel' | 'gallery-lightbox'>; rootSelectorPath: string; triggerCount: number; panelCount: number }` — `rootSelectorPath` is a cheerio-resolvable unique path (see implementation).
  - `export function detectInteractiveRegions(html: string): DetectedInteractiveRegion[]`
  - Detection heuristics (conservative — BOTH halves required):
    - **tabs**: element containing `[role="tablist"]` with ≥2 `[role="tab"]`, AND ≥2 sibling/descendant `[role="tabpanel"]`; OR class-pattern fallback: root whose class matches `/\btabs?\b|tab-container|tab_container/i` containing ≥2 children with class `/tab[-_]?(item|button|trigger|link)/i` and ≥2 with class `/tab[-_]?(panel|content|pane)/i`.
    - **accordion**: root with class `/accordion/i` containing ≥2 pairs of trigger (`button`, `[role="button"]`, or class `/accordion[-_]?(header|trigger|title|button)/i`) and panel (class `/accordion[-_]?(content|panel|body)/i` or `[role="region"]`).
    - **carousel**: root with class `/carousel|swiper|slick|splide|slider|embla/i` containing a track (class `/track|wrapper|slides|slide-list|swiper-wrapper|slick-track/i`) with ≥2 slide children (class `/slide|item/i` or `[role="group"]`).
    - **gallery-lightbox**: root with class `/gallery|thumbnails|media-viewer/i` containing one main `img` (class `/main|stage|active|current/i` or largest by attribute area) plus ≥3 thumbnail `img`s inside elements with class `/thumb/i`.
  - Nested regions: if a detected region root is inside an already-detected region root, keep only the OUTER one (prevents double-stamping).

- [ ] **Step 1: Write the failing tests**

Add to (or create) `src/design/section-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { detectInteractiveRegions } from './section-parser'

const TABS_ARIA = `
<section class="model-features">
  <div role="tablist" class="feature-tabs">
    <button role="tab" aria-selected="true" id="t1">Exterior</button>
    <button role="tab" id="t2">Interior</button>
    <button role="tab" id="t3">Tech</button>
  </div>
  <div role="tabpanel" aria-labelledby="t1"><p>Exterior body copy that is long enough.</p></div>
  <div role="tabpanel" aria-labelledby="t2"><p>Interior body copy that is long enough.</p></div>
  <div role="tabpanel" aria-labelledby="t3"><p>Technology copy that is long enough.</p></div>
</section>`

const CAROUSEL = `
<div class="offers-carousel swiper">
  <div class="swiper-wrapper">
    <div class="swiper-slide"><img src="/a.jpg"></div>
    <div class="swiper-slide"><img src="/b.jpg"></div>
    <div class="swiper-slide"><img src="/c.jpg"></div>
  </div>
</div>`

const ACCORDION = `
<div class="faq accordion">
  <div class="accordion-item">
    <button class="accordion-header" aria-expanded="true">Warranty</button>
    <div class="accordion-content"><p>Five years unlimited kilometres.</p></div>
  </div>
  <div class="accordion-item">
    <button class="accordion-header">Servicing</button>
    <div class="accordion-content"><p>Capped price servicing details.</p></div>
  </div>
</div>`

const GALLERY = `
<div class="model-gallery">
  <img class="gallery-main" src="/hero.jpg" width="1200" height="675">
  <div class="gallery-thumbs">
    <div class="thumb"><img src="/1.jpg"></div>
    <div class="thumb"><img src="/2.jpg"></div>
    <div class="thumb"><img src="/3.jpg"></div>
    <div class="thumb"><img src="/4.jpg"></div>
  </div>
</div>`

describe('detectInteractiveRegions', () => {
  it('detects ARIA tabs with triggers and panels', () => {
    const regions = detectInteractiveRegions(TABS_ARIA)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('tabs')
    expect(regions[0].triggerCount).toBe(3)
    expect(regions[0].panelCount).toBe(3)
  })

  it('detects a swiper carousel with track and slides', () => {
    const regions = detectInteractiveRegions(CAROUSEL)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('carousel')
    expect(regions[0].panelCount).toBe(3)
  })

  it('detects an accordion with header/content pairs', () => {
    const regions = detectInteractiveRegions(ACCORDION)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('accordion')
    expect(regions[0].triggerCount).toBe(2)
  })

  it('detects a gallery with a main image and thumbnails', () => {
    const regions = detectInteractiveRegions(GALLERY)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('gallery-lightbox')
  })

  it('requires both halves — triggers without panels is not tabs', () => {
    const half = '<div class="tabs"><button class="tab-button">A</button><button class="tab-button">B</button></div>'

    expect(detectInteractiveRegions(half)).toHaveLength(0)
  })

  it('keeps only the outer region when regions nest', () => {
    const nested = TABS_ARIA.replace('<p>Exterior body copy that is long enough.</p>', CAROUSEL)

    const regions = detectInteractiveRegions(nested)

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('tabs')
  })

  it('returns [] for plain content', () => {
    expect(detectInteractiveRegions('<main><h1>Amarok</h1><p>Copy.</p></main>')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/design/section-parser.test.ts`
Expected: FAIL — `detectInteractiveRegions` is not exported.

- [ ] **Step 3: Implement**

Append to `src/design/section-parser.ts` (add `import { load } from 'cheerio';` and `import type { InteractionType } from './compiler-contracts';` at the top — the file currently has no imports; the "no DOMParser in CF Workers" comment predates the cheerio dependency, which `page-capturer.ts` already uses in this same bundle):

```ts
// ============================================================================
// Interaction detection — deterministic DOM-region tagging for the clone
// runtime (spec §4.2). Conservative: a region is only reported when both the
// trigger set and the panel/slide set are present; unknown markup is never
// tagged. Cheerio-based (unlike the regex parsing above) because the stamper
// in clone-annotator.ts needs element-level positions.
// ============================================================================

export type DetectedInteractionType = Extract<InteractionType, 'tabs' | 'accordion' | 'carousel' | 'gallery-lightbox'>;

export interface DetectedInteractiveRegion {
  type: DetectedInteractionType;
  /** Root-relative child-index path, e.g. "0.2.1" — resolvable by clone-annotator. */
  rootSelectorPath: string;
  triggerCount: number;
  panelCount: number;
}

function elementPath($: ReturnType<typeof load>, el: any): string {
  const path: number[] = [];
  let node = el;
  while (node && node.parent && node.parent.type !== 'root') {
    const siblings = (node.parent.children || []).filter((c: any) => c.type === 'tag');
    path.unshift(siblings.indexOf(node));
    node = node.parent;
  }
  const rootSiblings = node?.parent?.children?.filter((c: any) => c.type === 'tag') ?? [];
  path.unshift(Math.max(0, rootSiblings.indexOf(node)));
  return path.join('.');
}

function classAttr(el: any): string {
  return String(el?.attribs?.class ?? '');
}

export function detectInteractiveRegions(html: string): DetectedInteractiveRegion[] {
  const $ = load(html);
  const regions: Array<DetectedInteractiveRegion & { el: any }> = [];

  // --- tabs (ARIA first, class-pattern fallback) ---
  $('[role="tablist"]').each((_i, tablist) => {
    const root = $(tablist).closest('section, div, article').first();
    const scope = root.length ? root : $(tablist).parent();
    const tabs = scope.find('[role="tab"]');
    const panels = scope.find('[role="tabpanel"]');
    if (tabs.length >= 2 && panels.length >= 2) {
      regions.push({ type: 'tabs', rootSelectorPath: elementPath($, scope.get(0)), triggerCount: tabs.length, panelCount: panels.length, el: scope.get(0) });
    }
  });
  $('*').each((_i, el) => {
    if (!/\btabs?\b|tab-container|tab_container/i.test(classAttr(el))) return;
    const scope = $(el);
    if (scope.find('[role="tablist"]').length) return; // ARIA branch already handled
    const triggers = scope.find('*').filter((_j, c) => /tab[-_]?(item|button|trigger|link)/i.test(classAttr(c)));
    const panels = scope.find('*').filter((_j, c) => /tab[-_]?(panel|content|pane)/i.test(classAttr(c)));
    if (triggers.length >= 2 && panels.length >= 2) {
      regions.push({ type: 'tabs', rootSelectorPath: elementPath($, el), triggerCount: triggers.length, panelCount: panels.length, el });
    }
  });

  // --- accordion ---
  $('*').each((_i, el) => {
    if (!/accordion/i.test(classAttr(el))) return;
    if (/accordion[-_]?(header|trigger|title|button|content|panel|body|item)/i.test(classAttr(el))) return; // parts, not roots
    const scope = $(el);
    const triggers = scope.find('button, [role="button"]').filter((_j, c) =>
      /accordion[-_]?(header|trigger|title|button)/i.test(classAttr(c)));
    const panels = scope.find('*').filter((_j, c) => /accordion[-_]?(content|panel|body)/i.test(classAttr(c)));
    if (triggers.length >= 2 && panels.length >= 2) {
      regions.push({ type: 'accordion', rootSelectorPath: elementPath($, el), triggerCount: triggers.length, panelCount: panels.length, el });
    }
  });

  // --- carousel ---
  $('*').each((_i, el) => {
    if (!/carousel|swiper|slick|splide|slider|embla/i.test(classAttr(el))) return;
    if (/track|wrapper|slide\b|slide-|slick-track|swiper-wrapper/i.test(classAttr(el))) return; // parts, not roots
    const scope = $(el);
    const track = scope.find('*').filter((_j, c) => /track|wrapper|slides|slide-list|swiper-wrapper|slick-track/i.test(classAttr(c))).first();
    if (!track.length) return;
    const slides = track.children().filter((_j, c) => /slide|item/i.test(classAttr(c)) || String(c?.attribs?.role ?? '') === 'group');
    if (slides.length >= 2) {
      regions.push({ type: 'carousel', rootSelectorPath: elementPath($, el), triggerCount: 0, panelCount: slides.length, el });
    }
  });

  // --- gallery-lightbox ---
  $('*').each((_i, el) => {
    if (!/gallery|thumbnails|media-viewer/i.test(classAttr(el))) return;
    if (/thumb/i.test(classAttr(el))) return; // parts, not roots
    const scope = $(el);
    const thumbs = scope.find('*').filter((_j, c) => /thumb/i.test(classAttr(c))).find('img').add(
      scope.find('*').filter((_j, c) => /thumb/i.test(classAttr(c))).filter((_j, c) => c.tagName === 'img'),
    );
    const mains = scope.find('img').filter((_j, c) => /main|stage|active|current/i.test(classAttr(c)));
    if (mains.length >= 1 && thumbs.length >= 3) {
      regions.push({ type: 'gallery-lightbox', rootSelectorPath: elementPath($, el), triggerCount: thumbs.length, panelCount: 1, el });
    }
  });

  // Deduplicate: drop any region nested inside another detected region, and
  // drop same-root duplicates from overlapping heuristics.
  const kept: Array<DetectedInteractiveRegion & { el: any }> = [];
  for (const candidate of regions) {
    const isInsideAnother = regions.some(other =>
      other !== candidate && $(other.el).find(candidate.el).length > 0,
    );
    const sameRootAlreadyKept = kept.some(existing => existing.el === candidate.el);
    if (!isInsideAnother && !sameRootAlreadyKept) kept.push(candidate);
  }

  return kept.map(({ el: _el, ...region }) => region);
}
```

- [ ] **Step 4: Run tests until green — iterate on selector edge cases**

Run: `npx vitest run src/design/section-parser.test.ts`
Expected: PASS (7 new tests; pre-existing `parseSection` tests untouched). Cheerio's `.add()`/`.filter()` chains above are the intended semantics — if a chain misbehaves, adjust the traversal but keep the assertions AS WRITTEN (they define correct behavior).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/section-parser.ts src/design/section-parser.test.ts
git commit -m "feat(recognition): deterministic interactive-region detectors"
```

---

### Task 3: Clone annotator (directive stamper)

**Files:**
- Create: `src/design/clone-annotator.ts`
- Test: `src/design/clone-annotator.test.ts` (create)

**Interfaces:**
- Consumes: `detectInteractiveRegions`, `DetectedInteractiveRegion` from `./section-parser`; `CLONE_INTERACTION_ATTR`, `CLONE_REGION_ID_ATTR` from `./clone-runtime/clone-runtime`.
- Produces (used by Tasks 4, 6, 8):
  - `export interface CloneInteractionInventoryEntry { id: string; type: DetectedInteractionType; trigger_count: number; panel_count: number }`
  - `export interface AnnotateResult { html: string; interactions: CloneInteractionInventoryEntry[] }`
  - `export function annotateCloneInteractions(html: string): AnnotateResult`
  - Stamping contract (what Task 1's components and Task 8's qa:functional rely on — exact attribute names):
    - Region root: `data-clone-interaction="<type>"`, `data-clone-region-id="cr-<n>"`, `x-data="<component>"` where component is `cloneTabs` | `cloneAccordion` | `cloneCarousel` | `cloneGallery` (gallery-lightbox → cloneGallery).
    - tabs: each trigger gets `data-clone-tab="<i>"` + `x-on:click="selectTab"`; each panel gets `data-clone-panel="<i>"`.
    - accordion: trigger `data-clone-acc-trigger="<i>"` + `x-on:click="togglePanel"`; panel `data-clone-acc-panel="<i>"`.
    - carousel: track `data-clone-track`; slides `data-clone-slide="<i>"`; existing prev/next buttons (class `/prev|previous|arrow-left/i`, `/next|arrow-right/i`) get `data-clone-prev` + `x-on:click="prev"` / `data-clone-next` + `x-on:click="next"` when found.
    - gallery: thumbs `data-clone-gallery-thumb="<i>"` + `x-on:click="selectImage"`; main image `data-clone-gallery-main`.
    - **Style unforcing:** on every stamped tab/accordion panel, strip the capture-forced inline properties (`display`, `opacity`, `visibility`, `height`, `max-height`, `overflow`) from the `style` attribute (remove the attribute entirely if emptied). This is what lets the runtime's `display:none !important` collapse the 49k-px over-render.
  - Idempotency: HTML already containing `data-clone-interaction` anywhere is returned unchanged (`{ html, interactions: [] }` re-derived from existing attributes is NOT required — just return the input untouched with the parsed existing inventory; see implementation).

- [ ] **Step 1: Write the failing tests**

Create `src/design/clone-annotator.test.ts` (reuse the four fixtures from Task 2's test verbatim — copy them in; the implementer may read tasks out of order):

```ts
import { describe, expect, it } from 'vitest'

import { annotateCloneInteractions } from './clone-annotator'

const TABS_ARIA = `
<section class="model-features">
  <div role="tablist" class="feature-tabs">
    <button role="tab" aria-selected="true" id="t1">Exterior</button>
    <button role="tab" id="t2">Interior</button>
    <button role="tab" id="t3">Tech</button>
  </div>
  <div role="tabpanel" aria-labelledby="t1" style="display: block !important; opacity: 1 !important; height: auto !important;"><p>Exterior body copy that is long enough.</p></div>
  <div role="tabpanel" aria-labelledby="t2" style="display: block !important;"><p>Interior body copy that is long enough.</p></div>
  <div role="tabpanel" aria-labelledby="t3"><p>Technology copy that is long enough.</p></div>
</section>`

const CAROUSEL = `
<div class="offers-carousel swiper">
  <button class="carousel-prev">‹</button>
  <div class="swiper-wrapper">
    <div class="swiper-slide"><img src="/a.jpg"></div>
    <div class="swiper-slide"><img src="/b.jpg"></div>
    <div class="swiper-slide"><img src="/c.jpg"></div>
  </div>
  <button class="carousel-next">›</button>
</div>`

describe('annotateCloneInteractions', () => {
  it('stamps a tabs region with component, triggers, panels, and region id', () => {
    const result = annotateCloneInteractions(TABS_ARIA)

    expect(result.interactions).toHaveLength(1)
    expect(result.interactions[0]).toMatchObject({ id: 'cr-1', type: 'tabs', trigger_count: 3, panel_count: 3 })
    expect(result.html).toContain('data-clone-interaction="tabs"')
    expect(result.html).toContain('data-clone-region-id="cr-1"')
    expect(result.html).toContain('x-data="cloneTabs"')
    expect(result.html).toContain('data-clone-tab="0"')
    expect(result.html).toContain('data-clone-panel="2"')
    expect(result.html).toContain('x-on:click="selectTab"')
  })

  it('strips capture-forced inline styles from stamped panels', () => {
    const result = annotateCloneInteractions(TABS_ARIA)

    expect(result.html).not.toMatch(/data-clone-panel="0"[^>]*style="[^"]*display/)
    expect(result.html).not.toMatch(/data-clone-panel="0"[^>]*style="[^"]*opacity/)
  })

  it('stamps carousel track, slides, and existing prev/next controls', () => {
    const result = annotateCloneInteractions(CAROUSEL)

    expect(result.interactions[0].type).toBe('carousel')
    expect(result.html).toContain('x-data="cloneCarousel"')
    expect(result.html).toContain('data-clone-track')
    expect(result.html).toContain('data-clone-slide="1"')
    expect(result.html).toContain('data-clone-prev')
    expect(result.html).toContain('x-on:click="next"')
  })

  it('leaves unrecognized content byte-identical', () => {
    const plain = '<main><h1>Amarok</h1><p>Copy that changes nothing.</p></main>'

    const result = annotateCloneInteractions(plain)

    expect(result.interactions).toEqual([])
    expect(result.html).toBe(plain)
  })

  it('is idempotent — already-stamped HTML is returned unchanged', () => {
    const first = annotateCloneInteractions(TABS_ARIA)
    const second = annotateCloneInteractions(first.html)

    expect(second.html).toBe(first.html)
    expect(second.interactions).toEqual(first.interactions)
  })

  it('never emits on* attributes or script elements', () => {
    const result = annotateCloneInteractions(TABS_ARIA + CAROUSEL)

    expect(result.html).not.toMatch(/\son[a-z]+=/i)
    expect(result.html).not.toContain('<script')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/design/clone-annotator.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/design/clone-annotator.ts`:

```ts
/**
 * Clone Annotator — stamps Alpine directives + data-clone-* attributes onto
 * recognized interactive regions of captured clone HTML (spec §4.3).
 *
 * Attributes only: the dashboard sanitizer strips <script> elements and on*
 * attributes from stored clone HTML, so behavior ships separately (the clone
 * runtime script) and binds to these attributes at render time. Unrecognized
 * markup passes through byte-identical.
 */

import { load } from 'cheerio';

import { detectInteractiveRegions, type DetectedInteractionType } from './section-parser';
import { CLONE_INTERACTION_ATTR, CLONE_REGION_ID_ATTR } from './clone-runtime/clone-runtime';

export interface CloneInteractionInventoryEntry {
  id: string;
  type: DetectedInteractionType;
  trigger_count: number;
  panel_count: number;
}

export interface AnnotateResult {
  html: string;
  interactions: CloneInteractionInventoryEntry[];
}

const COMPONENT_FOR_TYPE: Record<DetectedInteractionType, string> = {
  'tabs': 'cloneTabs',
  'accordion': 'cloneAccordion',
  'carousel': 'cloneCarousel',
  'gallery-lightbox': 'cloneGallery',
};

const FORCED_STYLE_PROPS = /(?:^|;)\s*(display|opacity|visibility|height|max-height|overflow)\s*:[^;]*(!important)?\s*/gi;

function stripForcedStyles($el: any): void {
  const style = String($el.attr('style') ?? '');
  if (!style) return;
  const remaining = style.replace(FORCED_STYLE_PROPS, ';').replace(/;{2,}/g, ';').replace(/^;|;$/g, '').trim();
  if (remaining) $el.attr('style', remaining);
  else $el.removeAttr('style');
}

function resolveByPath($: ReturnType<typeof load>, path: string): any {
  const indices = path.split('.').map(Number);
  let nodes = $.root().children().filter((_i: number, c: any) => c.type === 'tag');
  let el: any = null;
  for (const index of indices) {
    el = nodes.get(index);
    if (!el) return null;
    nodes = $(el).children().filter((_i: number, c: any) => c.type === 'tag');
  }
  return el;
}

export function annotateCloneInteractions(html: string): AnnotateResult {
  // Idempotency: never double-stamp. Recompiles start from a fresh capture,
  // so stamped input means "already annotated this cycle".
  if (html.includes(CLONE_INTERACTION_ATTR)) {
    const $existing = load(html);
    const interactions: CloneInteractionInventoryEntry[] = [];
    $existing(`[${CLONE_INTERACTION_ATTR}]`).each((_i, el) => {
      const $el = $existing(el);
      interactions.push({
        id: String($el.attr(CLONE_REGION_ID_ATTR) ?? ''),
        type: String($el.attr(CLONE_INTERACTION_ATTR)) as DetectedInteractionType,
        trigger_count: $el.find('[data-clone-tab], [data-clone-acc-trigger], [data-clone-gallery-thumb]').length,
        panel_count: $el.find('[data-clone-panel], [data-clone-acc-panel], [data-clone-slide]').length,
      });
    });
    return { html, interactions };
  }

  const regions = detectInteractiveRegions(html);
  if (regions.length === 0) return { html, interactions: [] };

  const $ = load(html, null, false);
  const interactions: CloneInteractionInventoryEntry[] = [];

  regions.forEach((region, regionIndex) => {
    const rootEl = resolveByPath($, region.rootSelectorPath);
    if (!rootEl) return;
    const root = $(rootEl);
    const id = `cr-${regionIndex + 1}`;

    root.attr(CLONE_INTERACTION_ATTR, region.type);
    root.attr(CLONE_REGION_ID_ATTR, id);
    root.attr('x-data', COMPONENT_FOR_TYPE[region.type]);

    if (region.type === 'tabs') {
      const triggers = root.find('[role="tab"]').length >= 2
        ? root.find('[role="tab"]')
        : root.find('*').filter((_i, c) => /tab[-_]?(item|button|trigger|link)/i.test(String(c.attribs?.class ?? '')));
      const panels = root.find('[role="tabpanel"]').length >= 2
        ? root.find('[role="tabpanel"]')
        : root.find('*').filter((_i, c) => /tab[-_]?(panel|content|pane)/i.test(String(c.attribs?.class ?? '')));
      triggers.each((i, el) => { $(el).attr('data-clone-tab', String(i)); $(el).attr('x-on:click', 'selectTab'); });
      panels.each((i, el) => { $(el).attr('data-clone-panel', String(i)); stripForcedStyles($(el)); });
      interactions.push({ id, type: region.type, trigger_count: triggers.length, panel_count: panels.length });
    }

    if (region.type === 'accordion') {
      const triggers = root.find('button, [role="button"]').filter((_i, c) => /accordion[-_]?(header|trigger|title|button)/i.test(String(c.attribs?.class ?? '')));
      const panels = root.find('*').filter((_i, c) => /accordion[-_]?(content|panel|body)/i.test(String(c.attribs?.class ?? '')));
      triggers.each((i, el) => { $(el).attr('data-clone-acc-trigger', String(i)); $(el).attr('x-on:click', 'togglePanel'); });
      panels.each((i, el) => { $(el).attr('data-clone-acc-panel', String(i)); stripForcedStyles($(el)); });
      interactions.push({ id, type: region.type, trigger_count: triggers.length, panel_count: panels.length });
    }

    if (region.type === 'carousel') {
      const track = root.find('*').filter((_i, c) => /track|wrapper|slides|slide-list|swiper-wrapper|slick-track/i.test(String(c.attribs?.class ?? ''))).first();
      track.attr('data-clone-track', '');
      const slides = track.children().filter((_i, c) => /slide|item/i.test(String(c.attribs?.class ?? '')) || String(c.attribs?.role ?? '') === 'group');
      slides.each((i, el) => { $(el).attr('data-clone-slide', String(i)); });
      const prev = root.find('button, a, [role="button"]').filter((_i, c) => /prev|previous|arrow-left/i.test(String(c.attribs?.class ?? ''))).first();
      const next = root.find('button, a, [role="button"]').filter((_i, c) => /next|arrow-right/i.test(String(c.attribs?.class ?? ''))).first();
      if (prev.length) { prev.attr('data-clone-prev', ''); prev.attr('x-on:click', 'prev'); }
      if (next.length) { next.attr('data-clone-next', ''); next.attr('x-on:click', 'next'); }
      interactions.push({ id, type: region.type, trigger_count: (prev.length ? 1 : 0) + (next.length ? 1 : 0), panel_count: slides.length });
    }

    if (region.type === 'gallery-lightbox') {
      const main = root.find('img').filter((_i, c) => /main|stage|active|current/i.test(String(c.attribs?.class ?? ''))).first();
      main.attr('data-clone-gallery-main', '');
      const thumbContainers = root.find('*').filter((_i, c) => /thumb/i.test(String(c.attribs?.class ?? '')));
      let thumbIndex = 0;
      thumbContainers.each((_i, el) => {
        const target = $(el).is('img') ? $(el) : $(el).find('img').first();
        if (!target.length || target.is('[data-clone-gallery-main]') || target.closest('[data-clone-gallery-thumb]').length) return;
        target.attr('data-clone-gallery-thumb', String(thumbIndex));
        target.attr('x-on:click', 'selectImage');
        thumbIndex += 1;
      });
      interactions.push({ id, type: region.type, trigger_count: thumbIndex, panel_count: 1 });
    }
  });

  return { html: $.html(), interactions };
}
```

- [ ] **Step 4: Run tests until green**

Run: `npx vitest run src/design/clone-annotator.test.ts`
Expected: PASS (6 tests). The "byte-identical" test constrains cheerio serialization: `load(html, null, false)` (fragment mode, no html/body wrapper) is REQUIRED so unmodified input round-trips exactly; if a fixture still re-serializes differently, the fix is an early-return before parsing when `detectInteractiveRegions` (which parses its own copy) returns zero regions — which the implementation above already does.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/design/clone-annotator.ts src/design/clone-annotator.test.ts
git commit -m "feat(recognition): stamp Alpine directives onto recognized clone regions"
```

---

### Task 4: Compile integration — annotate, store runtime + inventory

**Files:**
- Modify: `src/design/page-modes.ts` (clone mode data type)
- Modify: `src/design/page-capturer.ts` (`captureModelPage` assembly — anchor: `const assembledHtml = [`)
- Test: `src/design/page-capturer.test.ts`, `src/design/page-modes.test.ts` (extend if exists, else assertions live in page-capturer tests)

**Interfaces:**
- Consumes: `annotateCloneInteractions` (Task 3), `buildCloneRuntimeScript`/`CLONE_RUNTIME_VERSION` (Task 1).
- Produces (used by Tasks 5, 6, 8): the stored clone mode gains three fields — `interactions?: CloneInteractionInventoryEntry[]`, `runtime_js?: string`, `runtime_version?: string`. Persisted via the existing `applyCloneMode(basePage, cloneData, options)` call in `captureModelPage`.

- [ ] **Step 1: Find the clone-mode data type**

In `src/design/page-modes.ts`, locate the interface describing the clone mode payload (the type of the second argument to `applyCloneMode` — it has `rendered`, `source_url`, `viewport`, `asset_map`, `stylesheet_urls`, `section_index`, `warnings`). Add:

```ts
  /** Recognized interactive regions stamped into rendered HTML (clone runtime). */
  interactions?: Array<{ id: string; type: string; trigger_count: number; panel_count: number }>;
  /** Trusted script body injected by rendering surfaces (never stored inside rendered HTML). */
  runtime_js?: string;
  runtime_version?: string;
```

(Use the inline structural type shown — do NOT import clone-annotator types into page-modes; page-modes is mirrored in the dashboard and must stay import-light. Field names are the contract.)

- [ ] **Step 2: Write the failing wiring test**

Add to `src/design/page-capturer.test.ts` inside the existing `captureModelPage completeness gate` describe (the `createMemoryBucket`, `fakeBrowserCapture` helpers already exist there):

```ts
  it('annotates recognized regions and ships the clone runtime with the page', async () => {
    const { bucket, writes, browser } = createMemoryBucket()
    const capturer = new PageCapturer({ r2Bucket: bucket as any, browser })
    const tabsHtml = `
<section class="model-features">
  <div role="tablist"><button role="tab" aria-selected="true" id="t1">A</button><button role="tab" id="t2">B</button></div>
  <div role="tabpanel" aria-labelledby="t1"><p>Panel A content long enough to count.</p></div>
  <div role="tabpanel" aria-labelledby="t2"><p>Panel B content long enough to count.</p></div>
</section>`
    ;(capturer as any).captureDom = async () => ({
      ...fakeBrowserCapture({
        captured_scroll_height: 16000,
        dom_image_count: 100,
        hydration_status: 'stable',
        hydration_passes: [],
        shells_checked: 0,
        shells_recovered: 0,
        empty_shells: [],
      }),
      html: `<main><h1>Amarok</h1>${tabsHtml}</main>`,
    })
    ;(capturer as any).fetchInitialDocumentCapture = async () => ({ headParts: [] })
    ;(capturer as any).downloadImages = async () => new Map()

    const result = await capturer.captureModelPage('toyota-au' as any, 'rav4', 'https://www.toyota.com.au/rav4')

    expect(result.success).toBe(true)
    const stored = JSON.parse(writes.get('pages/definitions/toyota-au/rav4/latest.json')!)
    const clone = stored.content.modes.clone
    expect(clone.rendered).toContain('data-clone-interaction="tabs"')
    expect(clone.rendered).toContain('x-data="cloneTabs"')
    expect(clone.rendered).not.toContain('<script')
    expect(clone.interactions).toHaveLength(1)
    expect(clone.interactions[0].type).toBe('tabs')
    expect(clone.runtime_version).toBe('clone-runtime-v1')
    expect(clone.runtime_js).toContain("Alpine.data('cloneTabs'")
  })
```

Note: the stored `rendered` includes stylesheet links + a `<style>` override block ahead of the body — the assertions above use `toContain`, so that is fine. The `<script` assertion holds because the runtime ships in `runtime_js`, not in `rendered` — that IS the architecture being pinned.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/design/page-capturer.test.ts -t "annotates recognized regions"`
Expected: FAIL — no `data-clone-interaction` in stored rendered, `clone.interactions` undefined.

- [ ] **Step 4: Implement the assembly integration**

In `src/design/page-capturer.ts`:

4a. Add imports:

```ts
import { annotateCloneInteractions } from './clone-annotator';
import { buildCloneRuntimeScript, CLONE_RUNTIME_VERSION } from './clone-runtime/clone-runtime';
```

4b. Locate the anchor `// Rewrite image URLs in HTML` / `let html = capture.html;` inside `captureModelPage`. Immediately AFTER the URL-rewrite loop (`html = html.replaceAll(originalUrl, proxyPath);` block) and BEFORE `const stylesheetHtml = capture.stylesheetLinks.join('\n');`, insert:

```ts
      // Recognize interactive regions and stamp Alpine directives (attributes
      // only — the runtime script ships separately in clone.runtime_js).
      const annotated = annotateCloneInteractions(html);
      html = annotated.html;
      if (annotated.interactions.length > 0)
        console.log(`[PageCapturer] Clone runtime: stamped ${annotated.interactions.length} region(s): ${annotated.interactions.map(entry => entry.type).join(', ')}`);
```

4c. Locate the `applyCloneMode(basePage, {` call and add three fields to its data object (after `warnings: [],`):

```ts
        interactions: annotated.interactions,
        runtime_js: annotated.interactions.length > 0 ? buildCloneRuntimeScript() : undefined,
        runtime_version: annotated.interactions.length > 0 ? CLONE_RUNTIME_VERSION : undefined,
```

4d. Check `applyCloneMode` in `src/design/page-modes.ts`: if it copies fields explicitly (rather than spreading its input), add the three new fields to whatever it persists onto `modes.clone`. If it spreads, no change needed — say which in your report.

- [ ] **Step 5: Run the suites**

Run: `npx vitest run src/design/page-capturer.test.ts src/design/page-modes.test.ts src/design/clone-annotator.test.ts`
Expected: PASS. The pre-existing external-html backend tests must still pass — `annotateCloneInteractions` on their plain-paragraph fixture returns it byte-identical with zero interactions, so no `runtime_js` is stored for them.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/design/page-capturer.ts src/design/page-modes.ts src/design/page-capturer.test.ts
git commit -m "feat(compile): stamp interactions and ship clone runtime with page data"
```

---

### Task 5: Dashboard render integration — inject runtime, guard legacy shims

**Files:**
- Modify: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts`
- Modify (only if typing requires): `dashboard/src/pages/dashboard/page-builder/page-modes.ts` (the mirrored copy — add the same three optional fields to its clone-mode type)
- Test: `dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`

**Interfaces:**
- Consumes: `clone.runtime_js` / `clone.runtime_version` / stamped attributes from Task 4 (delivered inside the page object the dashboard already fetches).
- Produces: `buildCloneStudioHtml(options)` accepts a new optional `runtimeJs?: string` and, when present, appends `<script data-clone-studio-runtime="true">…</script>` AFTER the existing bridge script; `enableInteractivity()` skips elements inside `[data-clone-interaction]`.

- [ ] **Step 1: Write the failing tests**

Add to `clone-studio-html.test.ts` (work from `dashboard/`; match the file's existing `buildCloneStudioHtml({ rendered, title, baseHref, selectedRegionId })` call style — read one existing test first):

```ts
  it('injects the clone runtime as a trusted script after the bridge when provided', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><section data-clone-interaction="tabs" data-clone-region-id="cr-1" x-data="cloneTabs"><p>Panel</p></section></main>',
      title: 'Amarok',
      baseHref: 'https://www.volkswagen.com.au/en/models/amarok.html',
      selectedRegionId: null,
      runtimeJs: "document.addEventListener('alpine:init', function () {});",
    })

    const bridge = html.indexOf('data-clone-studio-bridge="true"')
    const runtime = html.indexOf('data-clone-studio-runtime="true"')

    expect(bridge).toBeGreaterThan(-1)
    expect(runtime).toBeGreaterThan(bridge)
    expect(html).toContain("alpine:init")
  })

  it('omits the runtime script when no runtimeJs is provided', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><p>No interactions here.</p></main>',
      title: 'Amarok',
      baseHref: 'https://example.com/',
      selectedRegionId: null,
    })

    expect(html).not.toContain('data-clone-studio-runtime')
  })

  it('keeps stamped Alpine attributes through sanitization', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><section data-clone-interaction="tabs" x-data="cloneTabs"><button data-clone-tab="0" x-on:click="selectTab">A</button><div data-clone-panel="0">P</div></section></main>',
      title: 'Amarok',
      baseHref: 'https://example.com/',
      selectedRegionId: null,
    })

    expect(html).toContain('x-data="cloneTabs"')
    expect(html).toContain('x-on:click="selectTab"')
    expect(html).toContain('data-clone-panel="0"')
  })

  it('legacy bridge interactivity skips stamped regions', () => {
    const source = readFileSync(new URL('./clone-studio-html.ts', import.meta.url), 'utf8')
    const enable = source.indexOf('function enableInteractivity')
    const guard = source.indexOf("closest('[data-clone-interaction]')", enable)

    expect(enable).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(enable)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `dashboard/`): `CI=1 pnpm exec vitest run --mode production --pool forks --maxWorkers=1 src/pages/dashboard/components/page-builder/clone-studio-html.test.ts`
Expected: FAIL — unknown option `runtimeJs`, no runtime script, no guard.

- [ ] **Step 3: Implement**

3a. In `buildCloneStudioHtml`'s options type add `runtimeJs?: string`.

3b. Locate where the document template embeds the bridge script (`<script data-clone-studio-bridge="true">`). Immediately after that script's closing tag in the assembled output, append (only when `options.runtimeJs` is a non-empty string):

```ts
  const runtimeScript = options.runtimeJs
    ? `\n<script data-clone-studio-runtime="true">\n${options.runtimeJs.replace(/<\/script/gi, '<\\/script')}\n</script>`
    : ''
```

…and interpolate `runtimeScript` into the template right after the bridge script. (The bridge marks its own nodes as scaffolding so they never serialize into saved HTML — mark the runtime script the same way if the bridge does this via a shared attribute scan; check how `data-clone-studio-bridge` nodes are excluded from serialization and mirror it for `data-clone-studio-runtime`. Say what you found in your report.)

3c. In `enableInteractivity()` (anchor: `function enableInteractivity`), at the top of the per-region wiring loop(s) — every place a candidate region element is about to be wired (`wireTabRegion`, `wireCarouselRegion`, `wireAccordionRegion`, `wireGalleryRegion`, `wireDropdownRegion` call sites) — add the guard:

```ts
      if (element.closest('[data-clone-interaction]')) continue
```

(Adapt `continue`/`return` to each loop's shape; the goal: no legacy shim wires anything inside a stamped region. If the call sites share one candidate-collection loop, one guard there is enough — prefer that.)

3d. Find the caller that builds the canvas frame HTML (`buildCloneStudioFrameHtmlForCanvas` in `clone-studio-canvas-helpers.ts`, which passes `rendered: getCloneStudioHtml(options.page)`) and thread the runtime: read `options.page?.content?.modes?.clone?.runtime_js` and pass it as `runtimeJs`. If the mirrored `page-modes.ts` type blocks this, add the three optional fields there (`interactions?`, `runtime_js?`, `runtime_version?` — same inline structural type as Task 4 Step 1).

Deferred (record in your report, do not do): the spec's `page-modes.ts` worker↔dashboard consolidation. Adding the three optional fields to both copies is M2's scope; unifying the mirrored modules is a build-tooling change that gets its own slice.

- [ ] **Step 4: Run the dashboard suite**

Run (from `dashboard/`): `CI=1 pnpm exec vitest run --mode production --pool forks --maxWorkers=1 src/pages/dashboard/components/page-builder/clone-studio-html.test.ts src/pages/dashboard/components/page-builder/page-builder-canvas-preview.test.ts`
Expected: PASS — all pre-existing bridge tests still green (the guard only affects stamped regions, which no existing fixture contains).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-html.test.ts dashboard/src/pages/dashboard/page-builder/page-modes.ts dashboard/src/pages/dashboard/components/page-builder/clone-studio-canvas-helpers.ts
git commit -m "feat(preview): inject clone runtime and guard legacy shims"
```

---

### Task 6: Production artifact + manifest integration (worker)

**Files:**
- Modify: `src/routes/oem-agent.ts` (`buildProductionCloneArtifact`, anchor `async function buildProductionCloneArtifact`; the production-manifest route, anchor `production-manifest`)
- Test: `src/routes/oem-agent.test.ts` if it exists; otherwise create `src/routes/production-clone-artifact.test.ts` with the helper extracted for testability as described below.

**Interfaces:**
- Consumes: `clone.runtime_js` / `clone.interactions` from the stored page (Task 4).
- Produces: production HTML responses end with the runtime `<script>`; the production manifest JSON gains `interactions` and `runtime_version` fields; a small exported helper `injectCloneRuntimeScript(html: string, runtimeJs: string | undefined): string` in a new file `src/design/clone-runtime/inject.ts` (kept out of the 5,000-line route file so it is unit-testable).

- [ ] **Step 1: Write the failing test**

Create `src/design/clone-runtime/inject.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { injectCloneRuntimeScript } from './inject'

describe('injectCloneRuntimeScript', () => {
  it('appends the runtime as a script when provided', () => {
    const out = injectCloneRuntimeScript('<main><p>Body</p></main>', 'var x = 1;')

    expect(out).toContain('<main><p>Body</p></main>')
    expect(out).toMatch(/<script data-clone-runtime="true">[\s\S]*var x = 1;[\s\S]*<\/script>\s*$/)
  })

  it('returns html unchanged when runtime is empty', () => {
    expect(injectCloneRuntimeScript('<main></main>', undefined)).toBe('<main></main>')
    expect(injectCloneRuntimeScript('<main></main>', '')).toBe('<main></main>')
  })

  it('escapes closing script sequences in the runtime body', () => {
    const out = injectCloneRuntimeScript('<main></main>', 'var s = "</script>";')

    expect(out).not.toMatch(/<\/script>";/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/clone-runtime/inject.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the helper**

Create `src/design/clone-runtime/inject.ts`:

```ts
/** Appends the clone runtime as a trusted script to production clone HTML. */
export function injectCloneRuntimeScript(html: string, runtimeJs: string | undefined): string {
  if (!runtimeJs) return html;
  const safe = runtimeJs.replace(/<\/script/gi, '<\\/script');
  return `${html}\n<script data-clone-runtime="true">\n${safe}\n</script>`;
}
```

- [ ] **Step 4: Wire into the route**

In `src/routes/oem-agent.ts`:

4a. Import: `import { injectCloneRuntimeScript } from '../design/clone-runtime/inject';`

4b. In `buildProductionCloneArtifact`, after `const body = scoped.html;` change to:

```ts
  const runtimeJs = page?.content?.modes?.clone?.runtime_js;
  const body = injectCloneRuntimeScript(scoped.html, typeof runtimeJs === 'string' ? runtimeJs : undefined);
```

(`bytes`/`sha256` below already derive from `body` — verify they still do after the edit.)

4c. In the production-manifest route handler (anchor `production-manifest`), add to the returned JSON object:

```ts
    interactions: page?.content?.modes?.clone?.interactions ?? [],
    runtime_version: page?.content?.modes?.clone?.runtime_version ?? null,
```

4d. Add a source-order wiring test to `src/design/clone-runtime/inject.test.ts` following the repo's established pattern:

```ts
import { readFileSync } from 'node:fs'

describe('production artifact wiring', () => {
  it('injects the runtime into the production clone body and exposes inventory in the manifest', () => {
    const source = readFileSync(new URL('../../routes/oem-agent.ts', import.meta.url), 'utf8')
    const artifactFn = source.indexOf('async function buildProductionCloneArtifact')
    const inject = source.indexOf('injectCloneRuntimeScript(scoped.html', artifactFn)
    const manifestInteractions = source.indexOf('interactions: page?.content?.modes?.clone?.interactions')

    expect(artifactFn).toBeGreaterThan(-1)
    expect(inject).toBeGreaterThan(artifactFn)
    expect(manifestInteractions).toBeGreaterThan(-1)
  })
})
```

- [ ] **Step 5: Run tests and typecheck, commit**

Run: `npx vitest run src/design/clone-runtime/inject.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/design/clone-runtime/inject.ts src/design/clone-runtime/inject.test.ts src/routes/oem-agent.ts
git commit -m "feat(artifact): inject clone runtime into production html and manifest"
```

---

### Task 7: Shared QA browser lib extraction

**Files:**
- Create: `scripts/lib/qa-browser.mjs`
- Modify: `scripts/oem-fidelity-report.mjs`, `scripts/preview-battle-test.mjs`
- Test: none unit (scripts are integration tooling); verification is running both scripts unchanged in behavior (Step 3).

**Interfaces:**
- Produces (used by Task 8): `scripts/lib/qa-browser.mjs` exporting `resolveBrowserExecutable`, `launchQaBrowser` (wraps `puppeteer.launch` with the executable/headless args both scripts currently duplicate), `timestampForPath`, `readNext`, `settlePage`, `pickRenderedFrame`.
- This is a **verbatim-move refactor**: no behavior changes. Move these functions from their current homes:
  - `timestampForPath` — `scripts/oem-fidelity-report.mjs` (anchor `function timestampForPath`) — identical copy exists in `preview-battle-test.mjs`; both scripts import the shared one.
  - `readNext` — same treatment (both scripts have a copy).
  - `resolveBrowserExecutable` — both scripts have a copy (fidelity's also probes `/usr/bin/chromium`); move the fidelity version (superset) and use it in both.
  - `settlePage` — from `oem-fidelity-report.mjs` (anchor `async function settlePage`).
  - `pickRenderedFrame` — from `preview-battle-test.mjs` (anchor `function pickRenderedFrame` or `pickRenderedFrame` reference; it selects the preview iframe with rendered content).
  - `launchQaBrowser` — NEW small wrapper: extract the `puppeteer.launch({...})` options object from `preview-battle-test.mjs` (anchor `puppeteer.launch`) into `export async function launchQaBrowser(puppeteer) { return puppeteer.launch({ ...same options, executablePath: resolveBrowserExecutable() }) }` — compare both scripts' launch options first; if they differ, parameterize the difference, do not unify behavior.

- [ ] **Step 1: Create the lib by moving functions**

Create `scripts/lib/qa-browser.mjs` with the moved functions (verbatim bodies from the anchors above) and `export` on each. Update both scripts: delete the local copies, add `import { resolveBrowserExecutable, launchQaBrowser, timestampForPath, readNext, settlePage, pickRenderedFrame } from './lib/qa-browser.mjs';` (each script imports only what it uses — no unused imports).

- [ ] **Step 2: Syntax-check both scripts**

Run: `node --check scripts/oem-fidelity-report.mjs && node --check scripts/preview-battle-test.mjs && node --check scripts/lib/qa-browser.mjs`
Expected: no output (all valid).

- [ ] **Step 3: Behavioral verification — run the battle test live**

Run: `pnpm qa:preview -- --slug volkswagen-au-amarok --require-text Amarok --min-font-faces 10 --max-broken-images 0`
Expected: same green output as before the refactor (all ✓). This exercises `resolveBrowserExecutable`, `launchQaBrowser`, `pickRenderedFrame`, `timestampForPath`, `readNext` end-to-end against the currently deployed preview.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/qa-browser.mjs scripts/oem-fidelity-report.mjs scripts/preview-battle-test.mjs
git commit -m "refactor(qa): extract shared browser plumbing into scripts/lib"
```

---

### Task 8: qa:functional — interaction smoke test

**Files:**
- Create: `scripts/preview-functional-test.mjs`
- Modify: `package.json` (root — add `"qa:functional": "node scripts/preview-functional-test.mjs"` beside the existing `qa:preview` entry)
- Test: live run in Task 9 (this is integration tooling; Step 2 checks syntax + argument handling).

**Interfaces:**
- Consumes: Task 7 lib; the production manifest's `interactions` (Task 6) via `https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/:slug/production-manifest` — note this endpoint may require auth; the script must also accept `--interactions-json '<inline json>'` as an offline fallback so Task 9 can always run it.
- Produces: exit 0 when every recognized interaction behaves; exit 1 with per-region ✗ lines otherwise.

- [ ] **Step 1: Write the script**

Create `scripts/preview-functional-test.mjs`:

```js
#!/usr/bin/env node
/**
 * qa:functional — drives the deployed preview and exercises every interaction
 * the recognition layer stamped (manifest `interactions`). The stamped
 * attributes ARE the test plan: tabs must switch, accordions toggle,
 * carousels advance, galleries swap.
 *
 * Usage:
 *   node scripts/preview-functional-test.mjs --slug volkswagen-au-amarok \
 *     [--base https://oem-dashboard.pages.dev/preview] \
 *     [--manifest-url https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/{slug}/production-manifest] \
 *     [--bearer <token>] [--interactions-json '[{"id":"cr-1","type":"tabs"}]']
 */
import puppeteer from 'puppeteer';

import { launchQaBrowser, pickRenderedFrame, readNext, settlePage } from './lib/qa-browser.mjs';

const argv = process.argv.slice(2);
let slug = '';
let base = 'https://oem-dashboard.pages.dev/preview';
let manifestUrl = '';
let bearer = '';
let interactionsJson = '';
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--slug') slug = readNext(argv, ++i, arg);
  else if (arg === '--base') base = readNext(argv, ++i, arg);
  else if (arg === '--manifest-url') manifestUrl = readNext(argv, ++i, arg);
  else if (arg === '--bearer') bearer = readNext(argv, ++i, arg);
  else if (arg === '--interactions-json') interactionsJson = readNext(argv, ++i, arg);
}
if (!slug) {
  console.error('required: --slug <oem-slug>');
  process.exit(1);
}

async function loadInteractions() {
  if (interactionsJson) return JSON.parse(interactionsJson);
  const url = manifestUrl || `https://oem-agent.adme-dev.workers.dev/api/v1/oem-agent/pages/${slug}/production-manifest`;
  const res = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  if (!res.ok) {
    console.error(`manifest fetch failed (${res.status}) — pass --interactions-json or --bearer`);
    process.exit(1);
  }
  const manifest = await res.json();
  return manifest.interactions ?? [];
}

const CHECKS = {
  'tabs': async (frame, id) => {
    return frame.evaluate((regionId) => {
      const root = document.querySelector(`[data-clone-region-id="${regionId}"]`);
      if (!root) return { ok: false, detail: 'region not found' };
      const trigger = root.querySelector('[data-clone-tab="1"]');
      const panel0 = root.querySelector('[data-clone-panel="0"]');
      const panel1 = root.querySelector('[data-clone-panel="1"]');
      if (!trigger || !panel0 || !panel1) return { ok: false, detail: 'triggers/panels missing' };
      trigger.click();
      const p0Hidden = getComputedStyle(panel0).display === 'none';
      const p1Visible = getComputedStyle(panel1).display !== 'none';
      return { ok: p0Hidden && p1Visible, detail: `panel0 hidden=${p0Hidden} panel1 visible=${p1Visible}` };
    }, id);
  },
  'accordion': async (frame, id) => {
    return frame.evaluate((regionId) => {
      const root = document.querySelector(`[data-clone-region-id="${regionId}"]`);
      if (!root) return { ok: false, detail: 'region not found' };
      const trigger = root.querySelector('[data-clone-acc-trigger]');
      if (!trigger) return { ok: false, detail: 'trigger missing' };
      const index = trigger.getAttribute('data-clone-acc-trigger');
      const panel = root.querySelector(`[data-clone-acc-panel="${index}"]`);
      if (!panel) return { ok: false, detail: 'panel missing' };
      const before = getComputedStyle(panel).display;
      trigger.click();
      const after = getComputedStyle(panel).display;
      return { ok: before !== after, detail: `display ${before} -> ${after}` };
    }, id);
  },
  'carousel': async (frame, id) => {
    return frame.evaluate((regionId) => {
      const root = document.querySelector(`[data-clone-region-id="${regionId}"]`);
      if (!root) return { ok: false, detail: 'region not found' };
      const track = root.querySelector('[data-clone-track]');
      const next = root.querySelector('[data-clone-next]');
      if (!track) return { ok: false, detail: 'track missing' };
      const before = getComputedStyle(track).transform;
      if (next) next.click();
      else return { ok: root.getAttribute('data-clone-carousel-index') === '0', detail: 'no next control; index attr present' };
      const after = getComputedStyle(track).transform;
      const indexAdvanced = root.getAttribute('data-clone-carousel-index') === '1';
      return { ok: before !== after || indexAdvanced, detail: `transform changed=${before !== after} index=${root.getAttribute('data-clone-carousel-index')}` };
    }, id);
  },
  'gallery-lightbox': async (frame, id) => {
    return frame.evaluate((regionId) => {
      const root = document.querySelector(`[data-clone-region-id="${regionId}"]`);
      if (!root) return { ok: false, detail: 'region not found' };
      const main = root.querySelector('[data-clone-gallery-main]');
      const thumb = root.querySelector('[data-clone-gallery-thumb="1"]') || root.querySelector('[data-clone-gallery-thumb]');
      if (!main || !thumb) return { ok: false, detail: 'main/thumb missing' };
      const before = main.getAttribute('src');
      thumb.click();
      const after = main.getAttribute('src');
      return { ok: before !== after, detail: `src changed=${before !== after}` };
    }, id);
  },
};

const interactions = await loadInteractions();
if (interactions.length === 0) {
  console.error('no interactions in manifest — nothing to test (is the page recompiled with the clone runtime?)');
  process.exit(1);
}

const browser = await launchQaBrowser(puppeteer);
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  const url = `${base}/${slug}?view=production`;
  console.log(`URL: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 });
  await settlePage(page, 7000);
  const frame = await pickRenderedFrame(page);
  if (!frame) {
    console.error('✗ no rendered preview frame found');
    process.exit(1);
  }

  let failures = 0;
  for (const entry of interactions) {
    const check = CHECKS[entry.type];
    if (!check) {
      console.log(`- ${entry.id} (${entry.type}): no functional check defined, skipped`);
      continue;
    }
    const result = await check(frame, entry.id);
    console.log(`${result.ok ? '✓' : '✗'} ${entry.id} (${entry.type}): ${result.detail}`);
    if (!result.ok) failures += 1;
  }
  console.log(failures === 0 ? 'ALL INTERACTIONS PASS' : `${failures} interaction(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await browser.close();
}
```

- [ ] **Step 2: Syntax check + argument handling**

Run: `node --check scripts/preview-functional-test.mjs && node scripts/preview-functional-test.mjs 2>&1 | head -1`
Expected: `required: --slug <oem-slug>`.

- [ ] **Step 3: Add the package script and commit**

Add to root `package.json` scripts beside `qa:preview`: `"qa:functional": "node scripts/preview-functional-test.mjs",`

```bash
git add scripts/preview-functional-test.mjs package.json
git commit -m "feat(qa): functional interaction smoke test driven by manifest inventory"
```

---

### Task 9: Full verification, deploy, live M2 exit measurement

**Files:** none — verification only.

- [ ] **Step 1: Full suites + typechecks**

```bash
npm run typecheck && npx vitest run src/
cd dashboard && CI=1 pnpm exec vitest run --mode production --pool forks --maxWorkers=1 && pnpm build && cd ..
```
Expected: all green; dashboard production build succeeds (its typecheck runs within). Note: root `pnpm lint:fix` fails on a pre-existing 351-error baseline unrelated to this work — record, don't chase.

- [ ] **Step 2: Graph refresh + push**

```bash
$(cat graphify-out/.graphify_python) -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
git add graphify-out && git diff --cached --quiet || git commit -m "chore(graphify): refresh after clone runtime"
git push origin main
```

- [ ] **Step 3: Deploy worker AND dashboard**

Both changed this milestone (worker: recognition/runtime/artifact; dashboard: runtime injection + shim guard):

```bash
npx wrangler deploy -c wrangler.jsonc --env=""      # worker (needs Docker running)
cd dashboard && pnpm build && npx wrangler pages deploy dist --project-name=oem-dashboard --branch=main && cd ..
```

- [ ] **Step 4: Recompile VW Amarok**

Trigger `POST /api/v1/oem-agent/admin/adaptive-pipeline/volkswagen-au/amarok` with body `{"force_clone": true}` and a minted admin JWT (see memory note `oem-agent-cron-architecture` for the mint flow), or use the dashboard Rebuild button. Wait for `succeeded`; confirm the diagnostics record still shows `completeness_passed: true` and the pipeline result's clone step succeeded. **Do NOT rebuild any GAC page.**

- [ ] **Step 5: Measure the M2 exit criteria**

```bash
pnpm qa:preview -- --slug volkswagen-au-amarok --require-text Amarok --min-font-faces 10 --max-broken-images 0
pnpm qa:functional -- --slug volkswagen-au-amarok
pnpm qa:fidelity -- --source-url https://www.volkswagen.com.au/en/models/amarok.html --slug volkswagen-au-amarok --viewports desktop --settle-ms 7000 --fail-on none --json
```

Exit criteria:
- `qa:functional`: ALL INTERACTIONS PASS (spec §9 M2 exit).
- `qa:preview`: still all green.
- `qa:fidelity`: preview height should drop from ~49,000px toward the source's ~16,215px as recognized panels collapse; fidelity score materially above 26. Record exact numbers. If height stays ~49k, the likely cause is VW's tab markup evading the detectors — pull the stored clone HTML, inspect the real VW tab/accordion class patterns, extend the Task 2 detectors (with new fixtures copied from the real markup), recompile, re-measure. That detector-tuning loop is in-scope for this task.

- [ ] **Step 6: Report**

Summarize: interactions detected on VW (count + types), qa:functional per-region results, height/fidelity before→after, any detector tuning applied, and open issues feeding M3.
