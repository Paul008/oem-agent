import { describe, expect, it, vi } from 'vitest';
import type { CatalogPreset } from './catalog';
import {
  aiExtractProps,
  buildAiExtractPrompt,
  extractProps,
  parseAiExtractResponse,
} from './prop-extractor';

const HERO_PRESET: CatalogPreset = {
  id: 'hero-standard', type: 'hero', categoryId: 'content', categoryLabel: 'Toyota',
  name: 'Toyota Hero', description: 'Opener', screenshotPath: 'screenshots/hero-standard.png',
  propSchema: {
    eyebrow: { type: 'string' }, heading: { type: 'string' }, body: { type: 'string' },
    imageUrl: { type: 'string' }, imageAlt: { type: 'string' },
    buttonLabel: { type: 'string' }, buttonHref: { type: 'string' },
  },
  demoProps: {},
};

const CARDS_PRESET: CatalogPreset = {
  id: 'toyota-ideal-cards', type: 'feature_grid', categoryId: 'inventory', categoryLabel: 'Inventory',
  name: 'Find Your Ideal Toyota', description: 'Cards', screenshotPath: 'screenshots/x.png',
  propSchema: {
    heading: { type: 'string' }, variant: { type: 'string' }, columns: { type: 'number' },
    items: {
      type: 'array',
      item: {
        title: { type: 'string' }, body: { type: 'string' },
        imageUrl: { type: 'string' }, href: { type: 'string' }, buttonLabel: { type: 'string' },
      },
    },
  },
  demoProps: { variant: 'toyota-category', columns: 4 },
};

const HERO_HTML = `
<section>
  <span class="tag">All-New</span>
  <h1>RAV4 Hybrid</h1>
  <p>The RAV4 blends bold design with hybrid efficiency for every Australian adventure, city or bush.</p>
  <img src="/content/rav4-hero.jpg" alt="RAV4 on a mountain road">
  <a class="cta-button" href="/rav4/enquire">Enquire now</a>
</section>`;

const CARDS_HTML = `
<section>
  <h2>Choose your grade</h2>
  <div class="grid">
    <div class="card"><img data-src="/img/gx.jpg" alt="GX"><h3>GX</h3><p>The capable entry grade.</p><a href="/rav4/gx">See GX</a></div>
    <div class="card"><img src="/img/xle.jpg" alt="XLE"><h3>XLE</h3><p>More comfort, more tech.</p><a href="/rav4/xle">See XLE</a></div>
    <div class="card"><img src="/img/edge.jpg" alt="Edge"><h3>Edge</h3><p>The flagship experience.</p><a href="/rav4/edge">See Edge</a></div>
  </div>
</section>`;

describe('extractProps — hero', () => {
  const extraction = extractProps(HERO_HTML, HERO_PRESET, 'https://www.toyota.com.au/rav4');

  it('extracts heading, eyebrow, body', () => {
    expect(extraction.props.heading).toBe('RAV4 Hybrid');
    expect(extraction.props.eyebrow).toBe('All-New');
    expect(String(extraction.props.body)).toContain('hybrid efficiency');
  });

  it('absolutizes image and CTA URLs against the source origin', () => {
    expect(extraction.props.imageUrl).toBe('https://www.toyota.com.au/content/rav4-hero.jpg');
    expect(extraction.props.imageAlt).toBe('RAV4 on a mountain road');
    expect(extraction.props.buttonLabel).toBe('Enquire now');
    expect(extraction.props.buttonHref).toBe('https://www.toyota.com.au/rav4/enquire');
  });

  it('reports full fill for the hero fixture', () => {
    expect(extraction.missing).toEqual([]);
    expect(extraction.filledRatio).toBe(1);
  });
});

describe('extractProps — cards', () => {
  const extraction = extractProps(CARDS_HTML, CARDS_PRESET, 'https://www.toyota.com.au/rav4');

  it('extracts repeated items with titles, bodies, images, links', () => {
    const items = extraction.props.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      title: 'GX',
      imageUrl: 'https://www.toyota.com.au/img/gx.jpg',
      href: 'https://www.toyota.com.au/rav4/gx',
      buttonLabel: 'See GX',
    });
  });

  it('copies identity keys from demoProps instead of the DOM', () => {
    expect(extraction.props.variant).toBe('toyota-category');
    expect(extraction.props.columns).toBe(4);
  });

  it('counts filled keys correctly', () => {
    expect(extraction.missing).toEqual([]);
    expect(extraction.filledRatio).toBe(1);
  });
});

const NESTED_HTML = `
<section>
  <div class="wrap">
    <div class="hero"><h1>Big banner</h1><div><h4>deco</h4></div></div>
    <div class="grid">
      <div class="card"><img src="/a.jpg" alt="A img"><h3>A</h3><p>aa</p><a href="/a">Go A</a></div>
      <div class="card"><img src="/b.jpg" alt="B img"><h3>B</h3><p>bb</p><a href="/b">Go B</a></div>
    </div>
    <div class="cta"><h3>Sign up</h3></div>
    <div class="foot"><h4>Useful links</h4></div>
  </div>
</section>`;

describe('extractProps — nested wrapper does not beat the real grid', () => {
  it('extracts items from the leaf-most repeating card structure', () => {
    const extraction = extractProps(NESTED_HTML, CARDS_PRESET, 'https://www.toyota.com.au/rav4');
    const items = extraction.props.items as Array<Record<string, unknown>>;
    expect(items.map((item) => item.title)).toEqual(['A', 'B']);
    expect(items[0].href).toBe('https://www.toyota.com.au/a');
  });
});

describe('extractProps — sparse section', () => {
  it('reports missing keys and partial ratio', () => {
    const extraction = extractProps('<section><h2>Just a title</h2></section>', HERO_PRESET, 'https://x.com');
    expect(extraction.props.heading).toBe('Just a title');
    expect(extraction.missing).toContain('imageUrl');
    expect(extraction.filledRatio).toBeGreaterThan(0);
    expect(extraction.filledRatio).toBeLessThan(1);
  });
});

const AI_PRESET: CatalogPreset = {
  id: 'ai-preset', type: 'feature_grid', categoryId: 'inventory', categoryLabel: 'Inventory',
  name: 'AI Preset', description: 'For ai-extract absolutization test', screenshotPath: 'screenshots/ai.png',
  propSchema: {
    heading: { type: 'string' },
    imageUrl: { type: 'string' },
    items: {
      type: 'array',
      item: { title: { type: 'string' }, href: { type: 'string' } },
    },
  },
  demoProps: {},
};

describe('aiExtractProps', () => {
  it('absolutizes imageUrl and item hrefs against the source url', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              heading: 'H',
              imageUrl: '/rel/img.jpg',
              items: [{ title: 'T', href: '/rel/a' }],
            }),
          },
        }],
      }),
    });
    const extraction = await aiExtractProps({
      sectionHtml: '<section></section>',
      preset: AI_PRESET,
      sourceUrl: 'https://www.toyota.com.au/rav4',
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(extraction.props.imageUrl).toBe('https://www.toyota.com.au/rel/img.jpg');
    const items = extraction.props.items as Array<Record<string, unknown>>;
    expect(items[0].href).toBe('https://www.toyota.com.au/rel/a');
  });
});

describe('ai extract helpers', () => {
  it('prompt names every schema key and embeds the section html', () => {
    const prompt = buildAiExtractPrompt(HERO_HTML, HERO_PRESET);
    for (const key of Object.keys(HERO_PRESET.propSchema)) expect(prompt).toContain(key);
    expect(prompt).toContain('RAV4 Hybrid');
  });

  it('parses a JSON response and drops keys not in the schema', () => {
    const parsed = parseAiExtractResponse(
      JSON.stringify({ heading: 'H', bogus: 'x' }),
      HERO_PRESET,
    );
    expect(parsed).toEqual({ heading: 'H' });
  });
});
