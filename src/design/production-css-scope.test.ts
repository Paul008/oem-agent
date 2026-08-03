import { describe, expect, it } from 'vitest';
import {
  hydrateProductionInteractions,
  sanitizeOrphanDeclarations,
  scopeCss,
  scopeProductionCloneHtml,
} from './production-css-scope';

const scope = '.oem-production-scope[data-oem-id="mitsubishi-au"][data-model-slug="outlander"]';

describe('scopeCss', () => {
  it('prefixes ordinary selectors', () => {
    const result = scopeCss('.hero, .cta:hover { color: red; }', scope);

    expect(result.css).toContain(`${scope} .hero`);
    expect(result.css).toContain(`${scope} .cta:hover`);
    expect(result.rulesScoped).toBe(1);
  });

  it('rewrites html body and root selectors to the wrapper', () => {
    const result = scopeCss('html, body, :root { background: #fff; }', scope);

    expect(result.css).toContain(`${scope}, ${scope}, ${scope} { background: #fff; }`);
    expect(result.css).not.toContain('html');
    expect(result.css).not.toContain('body');
    expect(result.css).not.toContain(':root');
  });

  it('scopes selectors inside media queries', () => {
    const result = scopeCss('@media (max-width: 767px) { .hero { display: block; } }', scope);

    expect(result.css).toContain('@media (max-width: 767px)');
    expect(result.css).toContain(`${scope} .hero`);
  });

  it('does not prefix keyframe percentage rules', () => {
    const result = scopeCss('@keyframes spin { 0% { opacity: 0; } 100% { opacity: 1; } } .loader { animation: spin 1s; }', scope);

    expect(result.css).toContain('0% { opacity: 0; }');
    expect(result.css).toContain('100% { opacity: 1; }');
    expect(result.css).not.toContain(`${scope} 0%`);
    expect(result.css).toContain(`${scope} .loader`);
  });

  it('sanitizes orphan declaration tokens (e.g. captured styled-components "false;") and still scopes valid declarations', () => {
    const result = scopeCss('.x{padding-top:0;false;padding-bottom:4px;}', scope);

    expect(result.css).toContain(`${scope} .x`);
    expect(result.css).toContain('padding-top:0');
    expect(result.css).toContain('padding-bottom:4px');
    expect(result.css).not.toContain('false');
    expect(result.rulesScoped).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('passes catastrophically malformed CSS through unscoped with a recorded warning instead of throwing', () => {
    const malformed = '.broken { color: "unterminated string; }';

    const result = scopeCss(malformed, scope);

    expect(result.css).toBe(malformed);
    expect(result.css).not.toContain(scope);
    expect(result.rulesScoped).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('does not strip an orphan-looking segment out of a quoted content value', () => {
    // `content: "Sale; ends;"` — the `; ends;` inside the string looks like an orphan
    // declaration to a naive regex but is real string content that must survive scoping.
    const result = scopeCss('.badge::before { content: "Sale; ends;"; }', scope);

    expect(result.css).toContain('content: "Sale; ends;"');
    expect(result.warnings).toEqual([]);
  });
});

describe('sanitizeOrphanDeclarations', () => {
  it('preserves an orphan-looking segment inside a double-quoted string byte-identically', () => {
    const css = '.badge::before{content:"Sale; ends;"}';

    expect(sanitizeOrphanDeclarations(css)).toBe(css);
  });

  it('preserves an orphan-looking segment inside a single-quoted string byte-identically', () => {
    const css = ".badge::after{content:'Buy; now;'}";

    expect(sanitizeOrphanDeclarations(css)).toBe(css);
  });

  it('preserves an orphan-looking middle segment inside a /* */ comment byte-identically', () => {
    const css = '.a{color:red}/* keep; this; text */.b{color:blue}';

    expect(sanitizeOrphanDeclarations(css)).toBe(css);
  });

  it('still strips a genuine orphan declaration token that sits outside strings and comments', () => {
    expect(sanitizeOrphanDeclarations('.x{padding-top:0;false;padding-bottom:4px;}'))
      .toBe('.x{padding-top:0;padding-bottom:4px;}');
  });
});

describe('hydrateProductionInteractions', () => {
  it('hydrates captured Nissan FAQ answers and accessible accordion controls from component props', () => {
    const props = JSON.stringify({
      faqItems: [
        {
          faqQuestion: 'WHERE CAN I CHARGE MY NISSAN ARIYA?',
          faqAnswer: '<p>Charge at home or at a public charging station.</p>',
        },
      ],
    }).replace(/"/g, '&quot;');
    const html = [
      `<section data-compid="faq-level1-comp" data-compprops="${props}">`,
      '<div class="question-container initial" data-id="question-container">',
      '<div class="question">',
      '<h3 aria-expanded="false" role="button" tabindex="0">WHERE CAN I CHARGE MY NISSAN ARIYA?</h3>',
      '<img alt="expand-icon" aria-hidden="true" src="">',
      '</div>',
      '<p aria-hidden="true" class="answer answer-fade-in" id="answer-0"></p>',
      '</div>',
      '</section>',
    ].join('');

    const result = hydrateProductionInteractions(html);

    expect(result).toContain('data-oem-faq-trigger="true"');
    expect(result).toContain('aria-controls="oem-faq-answer-0-0"');
    expect(result).toContain('id="oem-faq-answer-0-0"');
    expect(result).toContain('hidden=""');
    expect(result).toContain('<p>Charge at home or at a public charging station.</p>');
    expect(result).toContain('class="oem-faq-toggle-icon"');
    expect(result).not.toContain('src=""');
  });

  it('leaves malformed FAQ component data intact instead of failing the artifact', () => {
    const html = '<section data-compid="faq-level1-comp" data-compprops="not-json"><h3 role="button">Question</h3></section>';

    expect(() => hydrateProductionInteractions(html)).not.toThrow();
    expect(hydrateProductionInteractions(html)).toContain('Question');
  });
});

describe('scopeProductionCloneHtml', () => {
  it('wraps clone markup in an OEM scope root', async () => {
    const result = await scopeProductionCloneHtml('<section class="hero"><h1>Outlander</h1></section>', {
      oemId: 'mitsubishi-au',
      modelSlug: 'outlander',
    });

    expect(result.html).toContain('class="oem-production-scope"');
    expect(result.html).toContain('data-oem-id="mitsubishi-au"');
    expect(result.html).toContain('data-model-slug="outlander"');
    expect(result.diagnostics.scopeSelector).toBe(scope);
  });

  it('prefixes style tags in the returned HTML', async () => {
    const result = await scopeProductionCloneHtml('<style>.hero { color: red; }</style><section class="hero"></section>', {
      oemId: 'mitsubishi-au',
      modelSlug: 'outlander',
    });

    expect(result.html).toContain(`${scope} .hero`);
    expect(result.html).toContain('class="hero"');
    expect(result.diagnostics.styleTagsScoped).toBe(1);
    expect(result.diagnostics.rulesScoped).toBe(1);
  });

  it('replaces external stylesheet links with scoped inline styles', async () => {
    const result = await scopeProductionCloneHtml(
      '<link rel="stylesheet" href="https://example.com/oem.css"><section class="hero"></section>',
      {
        oemId: 'mitsubishi-au',
        modelSlug: 'outlander',
        fetchCss: async () => '.hero { color: red; } body { margin: 0; }',
      },
    );

    expect(result.html).toContain('data-oem-scoped-stylesheet-href="https://example.com/oem.css"');
    expect(result.html).toContain(`${scope} .hero`);
    expect(result.html).toContain(`${scope} { margin: 0; }`);
    expect(result.html).not.toContain('rel="stylesheet"');
    expect(result.diagnostics.externalStylesheetsScoped).toBe(1);
    expect(result.diagnostics.externalStylesheetsBlocked).toBe(0);
  });

  it('resolves relative stylesheet links from the captured source URL', async () => {
    const fetchedUrls: string[] = [];
    const result = await scopeProductionCloneHtml(
      '<link rel="stylesheet" href="/etc.clientlibs/mmal/clientlibs/drawer.css"><section class="hero"></section>',
      {
        oemId: 'mitsubishi-au',
        modelSlug: 'outlander',
        baseUrl: 'https://www.mitsubishi-motors.com.au/vehicles/outlander.html',
        fetchCss: async (url) => {
          fetchedUrls.push(url);
          return '.drawer { display: block; }';
        },
      },
    );

    expect(fetchedUrls).toEqual(['https://www.mitsubishi-motors.com.au/etc.clientlibs/mmal/clientlibs/drawer.css']);
    expect(result.html).toContain('data-oem-scoped-stylesheet-href="https://www.mitsubishi-motors.com.au/etc.clientlibs/mmal/clientlibs/drawer.css"');
    expect(result.html).not.toContain('rel="stylesheet"');
    expect(result.html).toContain(`${scope} .drawer`);
  });

  it('blocks external stylesheet links when CSS cannot be fetched', async () => {
    const result = await scopeProductionCloneHtml(
      '<link rel="stylesheet" href="https://example.com/oem.css"><section class="hero"></section>',
      {
        oemId: 'mitsubishi-au',
        modelSlug: 'outlander',
        fetchCss: async () => null,
      },
    );

    expect(result.html).toContain('data-oem-blocked-stylesheet-href="https://example.com/oem.css"');
    expect(result.html).not.toContain('rel="stylesheet"');
    expect(result.html).not.toContain(' href="https://example.com/oem.css"');
    expect(result.diagnostics.externalStylesheetsScoped).toBe(0);
    expect(result.diagnostics.externalStylesheetsBlocked).toBe(1);
  });

  it('tolerates a captured stylesheet with an orphan declaration token without throwing', async () => {
    const result = await scopeProductionCloneHtml(
      '<style>.eLFisM{padding-top:0;false;padding-bottom:var(--size-dynamic0270);}</style><section class="eLFisM"></section>',
      { oemId: 'volkswagen-au', modelSlug: 'amarok' },
    );

    expect(result.html).toContain('padding-top:0');
    expect(result.html).toContain('padding-bottom:var(--size-dynamic0270)');
    expect(result.html).not.toContain('false');
    expect(result.diagnostics.warnings).toEqual([]);
  });

  it('degrades a catastrophically malformed style tag to unscoped passthrough with a warning, never throwing', async () => {
    const result = await scopeProductionCloneHtml(
      '<style>.broken { color: "unterminated string; }</style><section class="broken"></section>',
      { oemId: 'volkswagen-au', modelSlug: 'amarok' },
    );

    expect(result.html).toContain('unterminated string');
    expect(result.diagnostics.warnings.length).toBeGreaterThan(0);
  });
});
