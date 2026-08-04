# Embedded Page Fidelity R&D

**Date:** 2026-08-04  
**Scope:** Whole-page CSS capture, interaction recovery, embed isolation, AI-assisted Tailwind reconstruction, and consumer-site verification.

## Executive Finding

The closest match to the required outcome is not a single open-source page copier. It is a compiler pipeline:

1. capture the rendered DOM, layout, styles, assets, accessibility state, and event-listener evidence in a controlled browser;
2. exercise safe interaction candidates and accumulate evidence for every observed state;
3. compile the captured HTML and complete state-aware CSS beneath an isolated page root;
4. replace removed OEM behavior with a small owned Alpine CSP runtime driven by a validated manifest;
5. use Kimi K3 to classify ambiguous interaction graphs and repair difficult visual sections, not to invent unrestricted runtime code;
6. compare the source, Worker artifact, and actual dealership integration at the same viewports and interaction states.

CSS coverage is evidence, not a complete stylesheet compiler. A rule can appear unused merely because a modal, tab, accordion, hover state, or later carousel slide was not activated during that run.

## Projects and Techniques Reviewed

### SingleFile

[SingleFile](https://github.com/gildas-lormeau/SingleFile) demonstrates that a browser can package DOM, CSS, images, frames, fonts, and other resources into a self-contained artifact. Its [FAQ](https://github.com/gildas-lormeau/SingleFile/blob/master/faq.md) also documents the important limitation for this project: dynamic carousels and folding sections require JavaScript, while scripts are removed by default.

Decision:

- borrow the self-contained asset and stylesheet collection pattern;
- do not copy or embed SingleFile code because the project is AGPL-licensed;
- do not assume a captured HTML file preserves interactions.

### Browsertrix Crawler

[Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) is a high-fidelity browser crawler built with Puppeteer and Chrome DevTools Protocol capture. It validates the choice of a real-browser capture stage instead of an HTTP-only scraper.

Decision:

- use the existing browser capture stack and CDP directly for the narrower OEM artifact contract;
- do not add Browsertrix as an MVP dependency; it is a web-archiving system, is operationally heavier than needed, and is AGPL-licensed.

### Chrome DevTools Protocol

[DOMSnapshot.captureSnapshot](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/#method-captureSnapshot) can return a flattened DOM, layout data, selected computed styles, DOM rectangles, and optional paint order, including content from iframes and Shadow DOM. [DOMDebugger.getEventListeners](https://chromedevtools.github.io/devtools-protocol/tot/DOMDebugger/#method-getEventListeners) can provide event-listener evidence for interactive candidates. The [CSS domain](https://chromedevtools.github.io/devtools-protocol/tot/CSS/) exposes matched and computed style information.

Decision:

- prefer `DOMSnapshot.captureSnapshot` over a second handwritten DOM walker for the capture evidence artifact;
- record event listeners only as discovery evidence, never copy their functions;
- put experimental CDP methods behind capability checks and retain the current DOM/computed-style fallback.

### CSS Coverage and Safelisting

[Puppeteer CSS coverage](https://pptr.dev/api/puppeteer.csscoverage.start) identifies CSS ranges used during a browser run. [PurgeCSS safelisting](https://purgecss.com/safelisting) shows the standard mitigation for selectors that are applied dynamically: retain exact or pattern-based state selectors rather than deleting everything absent from the initial DOM.

Decision:

- accumulate coverage across the initial state and every safely explored interaction state;
- generate a state safelist from the interaction manifest, including active/open/selected classes, ARIA attributes, `hidden`, `open`, and approved `data-clone-*` attributes;
- retain uncertain state rules and report them instead of optimizing them away;
- CSS reduction remains optional. Fidelity compilation must work with the complete scoped stylesheet.

### Alpine CSP

[Alpine's CSP build](https://alpinejs.dev/advanced/csp) is explicitly intended for environments that prohibit unsafe expression evaluation.

Decision:

- continue using the owned, versioned Alpine CSP runtime already present in the repository;
- compile validated manifests to approved runtime components for tabs, accordions, sliders, galleries, and modals;
- reject arbitrary AI-authored JavaScript and unrestricted Alpine expressions.

### rrweb

[rrweb](https://github.com/rrweb-io/rrweb) records and replays DOM changes and user interactions. It is useful evidence that interaction traces can be captured and replayed for diagnosis.

Decision:

- do not use rrweb replay as the dealership runtime and do not make it an MVP dependency;
- consider a compact first-party interaction trace in QA reports: action, target, before state, after state, DOM mutation summary, and screenshot references.

### Visual and Accessibility State Testing

[Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) support screenshot thresholds and element/page comparisons, while its documentation notes that rendering varies by browser, OS, fonts, and environment. [Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots) expose roles and control state such as `expanded`, `selected`, `pressed`, and `checked`.

[BackstopJS](https://github.com/garris/BackstopJS) provides a useful scenario model: each viewport can run a setup script before taking a screenshot. The repository already uses Playwright and has a fidelity workflow, so adding BackstopJS would duplicate infrastructure.

Decision:

- run visual baselines in a pinned browser/container with deterministic fonts and animations disabled;
- compare each interaction state, not only the initial page;
- pair pixel comparison with ARIA state and targeted DOM assertions;
- borrow BackstopJS's scenario concept without adding the dependency.

### CSS Isolation and Micro-frontends

[Wujie](https://github.com/Tencent/wujie) combines Web Components for CSS isolation with an iframe for JavaScript isolation. [qiankun](https://github.com/umijs/qiankun) uses sandboxes and style isolation for independently deployed applications. Both address a broader micro-frontend problem than this static OEM artifact pipeline.

[Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) gives stronger style isolation than selector prefixing. [Declarative Shadow DOM](https://web.dev/articles/declarative-shadow-dom) permits server-rendered shadow roots, but [WebKit's implementation notes](https://webkit.org/blog/13851/declarative-shadow-dom/) explain that assigning markup through `innerHTML` does not automatically create a declarative shadow root.

Decision:

- keep scoped host-DOM HTML as the default because it works with the existing body endpoint and consumer insertion path;
- add a future `web-component` adapter as an opt-in output for consumers that can run an explicit `attachShadow` bootstrap;
- do not assume declarative Shadow DOM works through the current `innerHTML` import path;
- do not add a general micro-frontend framework or preserve arbitrary OEM JavaScript.

### Native CSS `@scope`

[CSS `@scope`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@scope) became newly baseline across current browsers in December 2025. It can reduce selector rewriting, but MDN notes that it does not block inherited properties such as `color` and `font-family`, and older browsers may not support it.

Decision:

- evaluate `@scope` as a compact output optimization after the consumer browser policy is explicit;
- retain prefix scoping as the compatibility baseline;
- reset inherited host properties at the artifact root regardless of scoping syntax.

### Screenshot-to-code AI

[screenshot-to-code](https://github.com/abi/screenshot-to-code) demonstrates practical screenshot-to-Tailwind/HTML generation. It supports the proposed Kimi recreation action, but screenshot reconstruction approximates DOM semantics and interaction behavior.

Decision:

- use Kimi K3 as an optional section repair/recreation path with source HTML, computed-style evidence, screenshots, and a deterministic baseline;
- never treat a screenshot-only rewrite as the default whole-page fidelity mechanism.

## Proposed State-Exploration Algorithm

For each captured page or selected region:

1. Record the initial DOM snapshot, ARIA snapshot, screenshot, stylesheet coverage, computed geometry, and console/network diagnostics.
2. Discover candidate controls from semantic elements, roles, `aria-controls`, `aria-expanded`, `aria-selected`, `open`, `href` fragments, data attributes, class patterns, and event-listener evidence.
3. Rank actions by safety. Allow local UI actions such as click, keyboard activation, next/previous, open, and close. Reject navigation, forms, downloads, purchases, geolocation, media permission, and cross-origin side effects.
4. Execute one candidate in a fresh or restored page state.
5. Observe DOM mutations, attribute/class changes, visibility, geometry, ARIA state, stylesheet coverage, and screenshots.
6. Build a trigger-to-target state graph and classify high-confidence patterns deterministically.
7. Send only ambiguous graph evidence to Kimi K3 for schema-constrained classification.
8. Validate the manifest, generate the CSS state safelist, stamp approved runtime attributes, and rerun the scenarios against the compiled artifact.

This directly addresses sliders, modals, accordions, tabs, galleries, and controls whose behavior is not obvious from static markup.

## Recommended Product Modes

| Mode | Purpose | Isolation | Interactivity | Recommendation |
|---|---|---|---|---|
| Scoped artifact | Default production embed | Selector prefix/root reset | Owned Alpine CSP runtime | Build first |
| AI Tailwind section | Repair or recreate difficult regions | Utility classes under root | Manifest-driven runtime | Build as reviewed action |
| Web-component artifact | Consumer with severe host CSS collisions | Shadow DOM | Same owned runtime | Prototype after default pipeline |
| Sandboxed iframe | Highest original runtime isolation | Full document boundary | Could preserve original JS | Do not use by default; conflicts with current CSP/security model |

## MVP Dependency Decision

Do not add SingleFile, Browsertrix, rrweb, BackstopJS, Wujie, or qiankun to the first implementation. The repository already has Puppeteer/Playwright, PostCSS, production selector scoping, AI routing, and Alpine CSP. The missing value is orchestration and evidence collection, not another framework.

The MVP should add:

- CDP-backed capture evidence with fallbacks;
- safe interaction-state exploration;
- a manifest-derived CSS safelist;
- modal detection/runtime support;
- state-aware Playwright fidelity scenarios against the real consumer;
- the approved deterministic and Kimi Tailwind actions.

