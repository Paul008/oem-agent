import { afterEach, describe, expect, it, vi } from 'vitest';
import { composePublicationCandidate } from './composer';

const origin = 'https://oem-agent.example.test';
const region = (id: string, top: number, html: string, extra: Record<string, unknown> = {}) => ({
  id, label: id, selector: `[data-oem-region-id="${id}"]`, tag: 'section', classes: [],
  top, height: 300, editable_fields: [], html, ...extra,
});

function mixedDraft(): Record<string, any> {
  return { source_url: 'https://www.nissan.com.au/vehicles/ariya/index.html', content: { modes: {
    clone: {
      source_url: 'https://www.nissan.com.au/vehicles/ariya/index.html',
      rendered: '<section data-compid="simple-hero-comp">Hero</section>', stylesheet_urls: [],
      section_index: [
        region('hero', 0, '<section data-oem-region-role="hero">Hero</section>', { role: 'hero' }),
        region('clone-region-6', 400, '<section>Original six</section>'),
        region('clone-region-7', 800, '<section class="clone-card"><img src="/media/ariya.webp"></section>'),
      ], interactions: [],
    },
    sections: { items: [{
      id: 'tw-six', type: 'content-block', order: 0, _clone_region_id: 'clone-region-6',
      _tailwind_original_html: '<section>Original six</section>',
      _generated_html: '<section class="tw-six">Tailwind six</section>',
      _generated_css: '.tw-six { color: red; }',
    }] },
  } } };
}

afterEach(() => vi.unstubAllGlobals());

describe('composePublicationCandidate', () => {
  it('uses Tailwind for converted leaves and clone fallback for unconverted leaves', async () => {
    const result = await composePublicationCandidate({ pageId: 'nissan-au-ariya', page: mixedDraft(), origin });
    expect(result.body).toContain('data-oem-published-renderer="tailwind"');
    expect(result.body).toContain('data-oem-region-id="clone-region-7"');
    expect(result.body).toContain('data-oem-published-renderer="clone"');
    expect(result.body).not.toContain('data-oem-region-role="hero"');
    expect(result.referenceBody).toContain('Original six');
    expect(result.regions.map(r => [r.regionId, r.renderer])).toEqual([
      ['clone-region-6', 'tailwind'], ['clone-region-7', 'clone'],
    ]);
  });

  it('replaces grouped leaves once and appends manual sections by order', async () => {
    const page = mixedDraft();
    page.content.modes.clone.section_index.push(
      region('parent', 900, '<section><div data-oem-region-id="left">Clone left</div><div data-oem-region-id="right">Clone right</div></section>'),
      region('left', 1000, '<section>Clone left</section>'),
      region('right', 1020, '<section>Clone right</section>'),
    );
    page.content.modes.sections.items.push(
      { id: 'pair', order: 5, _clone_region_ids: ['left', 'right'], _generated_html: '<section>Tailwind pair</section>', _tailwind_original_html: '<section>Original pair</section>' },
      { id: 'manual-z', order: 20, _generated_html: '<section>Manual Z</section>' },
      { id: 'manual-a', order: 10, _generated_html: '<section>Manual A</section>' },
    );
    const result = await composePublicationCandidate({ pageId: 'nissan-au-ariya', page, origin });
    expect(result.body.match(/Tailwind pair/g)).toHaveLength(1);
    expect(result.body).not.toContain('Clone left');
    expect(result.body).not.toContain('Clone right');
    expect(result.referenceBody.match(/Original pair/g)).toHaveLength(1);
    expect(result.regions.map(r => r.regionId)).toEqual(['clone-region-6', 'clone-region-7', 'pair', 'manual-a', 'manual-z']);
  });

  it('absolutizes assets, inlines scoped captured CSS, and emits no base element', async () => {
    const page = mixedDraft();
    page.content.modes.clone.stylesheet_urls = ['https://cdn.nissan.test/css/ariya.css'];
    page.content.modes.clone.section_index[2].html = '<section class="clone-card"><img src="/media/ariya.webp" srcset="images/s.webp 480w, images/l.webp 960w"></section>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('.clone-card{background:url("../img/card.webp")}', { headers: { 'content-type': 'text/css' } })));
    const result = await composePublicationCandidate({ pageId: 'nissan-au-ariya', page, origin });
    expect(result.body).toContain('https://oem-agent.example.test/media/ariya.webp');
    expect(result.body).toContain('https://www.nissan.com.au/vehicles/ariya/images/s.webp 480w');
    expect(result.body).toContain('https://cdn.nissan.test/img/card.webp');
    expect(result.body).toContain('[data-oem-publication-body="true"] .clone-card');
    expect(result.body).toContain('[data-oem-region-id="clone-region-6"] .tw-six');
    expect(result.body).not.toContain('<link rel="stylesheet"');
    expect(result.body).not.toContain('<base');
  });

  it('includes the trusted Alpine runtime once for multiple interactive regions', async () => {
    const page = mixedDraft();
    page.content.modes.sections.items = [];
    page.content.modes.clone.section_index = [
      region('tabs', 0, '<section data-clone-interaction="tabs">Tabs</section>'),
      region('accordion', 300, '<section data-clone-interaction="accordion">Accordion</section>'),
    ];
    page.content.modes.clone.runtime_js = 'window.__trustedAlpine = true;';
    const result = await composePublicationCandidate({ pageId: 'nissan-au-ariya', page, origin });
    expect(result.body.match(/data-oem-alpine-runtime/g)).toHaveLength(1);
    expect(result.body).toContain('data-oem-interaction-kind="tabs"');
    expect(result.body).toContain('data-oem-interaction-kind="accordion"');
    const csp = result.body.match(/Content-Security-Policy" content="([^"]+)/)?.[1] || '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(3);
  });

  it('returns body integrity metadata and rejects an empty body', async () => {
    const result = await composePublicationCandidate({ pageId: 'nissan-au-ariya', page: mixedDraft(), origin });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(result.body));
    const sha = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    expect(result.bytes).toBe(new TextEncoder().encode(result.body).byteLength);
    expect(result.sha256).toBe(sha);
    expect(result.etag).toBe(`"sha256-${sha}"`);
    await expect(composePublicationCandidate({ pageId: 'nissan-au-ariya', origin, page: {
      content: { modes: { clone: { section_index: [region('hero', 0, '<section>Hero</section>', { role: 'hero' })] }, sections: { items: [] } } },
    } })).rejects.toThrow('Publication candidate body is empty');
  });
});
