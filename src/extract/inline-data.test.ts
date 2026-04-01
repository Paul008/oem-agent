/**
 * Unit tests for inline-data extractor.
 * Covers synchronous extractors only (async fetch-based ones skipped).
 */

import { describe, it, expect } from 'vitest';
import {
  extractJsonLdBanners,
  extractNextData,
  extractNuxtData,
  extractWindowGlobals,
} from './inline-data';

// ============================================================================
// extractJsonLdBanners
// ============================================================================

describe('extractJsonLdBanners', () => {
  it('extracts slides from ImageGallery schema', () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "ImageGallery",
        "name": "Hero Gallery",
        "image": [
          {
            "@type": "ImageObject",
            "name": "First Slide",
            "caption": "Sub-headline one",
            "contentUrl": "https://example.com/img1.jpg"
          },
          {
            "@type": "ImageObject",
            "name": "Second Slide",
            "contentUrl": "https://example.com/img2.jpg"
          }
        ]
      }
      </script>
    `;

    const slides = extractJsonLdBanners(html);
    expect(slides).toHaveLength(2);

    expect(slides[0].position).toBe(0);
    expect(slides[0].headline).toBe('First Slide');
    expect(slides[0].sub_headline).toBe('Sub-headline one');
    expect(slides[0].image_url_desktop).toBe('https://example.com/img1.jpg');

    expect(slides[1].position).toBe(1);
    expect(slides[1].headline).toBe('Second Slide');
    expect(slides[1].sub_headline).toBeUndefined();
    expect(slides[1].image_url_desktop).toBe('https://example.com/img2.jpg');
  });

  it('extracts slides from ItemList schema', () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Item One",
            "url": "https://example.com/banner1.jpg"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Item Two",
            "url": "https://example.com/banner2.jpg"
          }
        ]
      }
      </script>
    `;

    const slides = extractJsonLdBanners(html);
    expect(slides).toHaveLength(2);

    expect(slides[0].position).toBe(0);
    expect(slides[0].headline).toBe('Item One');
    expect(slides[0].image_url_desktop).toBe('https://example.com/banner1.jpg');

    expect(slides[1].position).toBe(1);
    expect(slides[1].headline).toBe('Item Two');
    expect(slides[1].image_url_desktop).toBe('https://example.com/banner2.jpg');
  });

  it('returns empty array for non-banner JSON-LD types', () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Acme Corp",
        "url": "https://acme.com"
      }
      </script>
    `;

    const slides = extractJsonLdBanners(html);
    expect(slides).toHaveLength(0);
  });

  it('returns empty array when no JSON-LD scripts present', () => {
    const html = '<html><body><p>No JSON-LD here</p></body></html>';
    const slides = extractJsonLdBanners(html);
    expect(slides).toHaveLength(0);
  });

  it('handles malformed JSON gracefully', () => {
    const html = `
      <script type="application/ld+json">{ invalid json }</script>
    `;
    const slides = extractJsonLdBanners(html);
    expect(slides).toHaveLength(0);
  });

  it('handles multiple JSON-LD blocks, picking banner-compatible ones', () => {
    const html = `
      <script type="application/ld+json">
      { "@type": "Organization", "name": "Brand" }
      </script>
      <script type="application/ld+json">
      {
        "@type": "ImageGallery",
        "image": [
          { "name": "Slide A", "contentUrl": "https://cdn.example.com/a.jpg" }
        ]
      }
      </script>
    `;

    const slides = extractJsonLdBanners(html);
    expect(slides).toHaveLength(1);
    expect(slides[0].headline).toBe('Slide A');
  });
});

// ============================================================================
// extractNextData
// ============================================================================

describe('extractNextData', () => {
  it('extracts and parses __NEXT_DATA__ script', () => {
    const payload = { props: { pageProps: { hero: { title: 'Next Hero' } } }, page: '/home' };
    const html = `
      <html>
        <head>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>
        </head>
        <body></body>
      </html>
    `;

    const result = extractNextData(html);
    expect(result).not.toBeNull();
    expect(result?.props?.pageProps?.hero?.title).toBe('Next Hero');
    expect(result?.page).toBe('/home');
  });

  it('returns null when __NEXT_DATA__ is absent', () => {
    const html = '<html><head></head><body></body></html>';
    expect(extractNextData(html)).toBeNull();
  });

  it('returns null for malformed __NEXT_DATA__ JSON', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{ bad json }</script>`;
    expect(extractNextData(html)).toBeNull();
  });
});

// ============================================================================
// extractNuxtData
// ============================================================================

describe('extractNuxtData', () => {
  it('extracts Nuxt 3 __NUXT_DATA__ script', () => {
    const payload = { data: [{ key: 'hero', value: 'Nuxt 3 Hero' }] };
    const html = `
      <script type="application/json" id="__NUXT_DATA__">${JSON.stringify(payload)}</script>
    `;

    const result = extractNuxtData(html);
    expect(result).not.toBeNull();
    expect(result?.data?.[0]?.value).toBe('Nuxt 3 Hero');
  });

  it('extracts Nuxt 2 window.__NUXT__ assignment', () => {
    const payload = { state: { hero: { title: 'Nuxt 2 Hero' } } };
    const html = `
      <script>window.__NUXT__=${JSON.stringify(payload)};</script>
    `;

    const result = extractNuxtData(html);
    expect(result).not.toBeNull();
    expect(result?.state?.hero?.title).toBe('Nuxt 2 Hero');
  });

  it('returns null when no Nuxt data present', () => {
    const html = '<html><body><p>Plain HTML</p></body></html>';
    expect(extractNuxtData(html)).toBeNull();
  });
});

// ============================================================================
// extractWindowGlobals
// ============================================================================

describe('extractWindowGlobals', () => {
  it('extracts __INITIAL_STATE__ from inline script', () => {
    const stateObj = { user: { name: 'Test' }, page: 'home' };
    const html = `
      <script>window.__INITIAL_STATE__ = ${JSON.stringify(stateObj)};</script>
    `;

    const globals = extractWindowGlobals(html);
    expect(globals['__INITIAL_STATE__']).toBeDefined();
    expect(globals['__INITIAL_STATE__'].user.name).toBe('Test');
  });

  it('extracts __DATA__ from inline script', () => {
    const data = { banners: [{ id: 1, src: 'img.jpg' }] };
    const html = `<script>window.__DATA__ = ${JSON.stringify(data)};</script>`;

    const globals = extractWindowGlobals(html);
    expect(globals['__DATA__']).toBeDefined();
    expect(globals['__DATA__'].banners[0].id).toBe(1);
  });

  it('extracts __PRELOADED_STATE__ from inline script', () => {
    const state = { loaded: true };
    const html = `<script>window.__PRELOADED_STATE__ = ${JSON.stringify(state)};</script>`;

    const globals = extractWindowGlobals(html);
    expect(globals['__PRELOADED_STATE__']).toBeDefined();
    expect(globals['__PRELOADED_STATE__'].loaded).toBe(true);
  });

  it('extracts pageData from inline script', () => {
    const data = { title: 'Home Page' };
    const html = `<script>window.pageData = ${JSON.stringify(data)};</script>`;

    const globals = extractWindowGlobals(html);
    expect(globals['pageData']).toBeDefined();
    expect(globals['pageData'].title).toBe('Home Page');
  });

  it('returns empty object when no window globals present', () => {
    const html = '<html><body><p>No globals here</p></body></html>';
    const globals = extractWindowGlobals(html);
    expect(Object.keys(globals)).toHaveLength(0);
  });

  it('handles multiple globals in the same page', () => {
    const html = `
      <script>
        window.__INITIAL_STATE__ = {"key": "value1"};
        window.__DATA__ = {"key": "value2"};
      </script>
    `;

    const globals = extractWindowGlobals(html);
    expect(globals['__INITIAL_STATE__']).toBeDefined();
    expect(globals['__DATA__']).toBeDefined();
  });
});
