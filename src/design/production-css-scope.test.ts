import { describe, expect, it } from 'vitest';
import { scopeCss, scopeProductionCloneHtml } from './production-css-scope';

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
});
