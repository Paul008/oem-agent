import { describe, expect, it } from 'vitest';

import { encodeUrl } from '../utils/image-proxy';
import { extractGacStylesheetUrls, nissanNavaraFallbackUrl, rewriteCssAssetUrlsForMediaProxy } from './media';

describe('rewriteCssAssetUrlsForMediaProxy', () => {
  it('rewrites relative and absolute CSS assets to the media proxy', () => {
    const css = `
      @font-face { font-family: Ford; src: url("../resources/fonts/FordF-1-Regular.woff2") format("woff2"); }
      .hero { background-image: url("https://www.ford.com.au/content/dam/Ford/hero.webp"); }
      .inline { background-image: url(data:image/png;base64,abc); }
    `;

    const rewritten = rewriteCssAssetUrlsForMediaProxy(
      css,
      'https://www.ford.com.au/etc.clientlibs/dxdfoap/clientlibs/cmp-scripts/clientlib-site/css/site.css',
      'ford-au',
    );

    expect(rewritten).toContain(`/media/ford-au/${encodeUrl('https://www.ford.com.au/etc.clientlibs/dxdfoap/clientlibs/cmp-scripts/clientlib-site/resources/fonts/FordF-1-Regular.woff2')}`);
    expect(rewritten).toContain(`/media/ford-au/${encodeUrl('https://www.ford.com.au/content/dam/Ford/hero.webp')}`);
    expect(rewritten).toContain('url(data:image/png;base64,abc)');
  });
});

describe('extractGacStylesheetUrls', () => {
  it('extracts and deduplicates absolute GAC stylesheet URLs from live HTML', () => {
    const html = `
      <link rel="stylesheet" href="https://eu-www-resouce-cdn.gacgroup.com/www/static/css/entry-new.css">
      <link rel="stylesheet" href="/www/static/css/local.css">
      <link rel="stylesheet" href="https://eu-www-resouce-cdn.gacgroup.com/www/static/css/entry-new.css">
      <link rel="stylesheet" href="https://example.com/untrusted.css">
      <link rel="stylesheet" href="https://eu-www-resouce-cdn.gacgroup.com/www/static/js/not-css.js">
      <link rel="preload" href="https://eu-www-resouce-cdn.gacgroup.com/www/static/css/ignored.css">
    `;

    expect(extractGacStylesheetUrls(html, 'https://www.gacgroup.com/en-au/suv/gac-emzoom')).toEqual([
      'https://eu-www-resouce-cdn.gacgroup.com/www/static/css/entry-new.css',
      'https://www.gacgroup.com/www/static/css/local.css',
    ]);
  });
});

describe('nissanNavaraFallbackUrl', () => {
  it('moves stale Nissan Next.js assets to the Navara host without changing the path or query', () => {
    expect(nissanNavaraFallbackUrl('https://www.nissan.com.au/_next/static/css/1a1fd95b92b4775a.css?v=2'))
      .toBe('https://navara.nissan.com.au/_next/static/css/1a1fd95b92b4775a.css?v=2');
  });

  it('does not redirect ordinary Nissan pages or non-Nissan assets', () => {
    expect(nissanNavaraFallbackUrl('https://www.nissan.com.au/vehicles/browse-range/navara.html')).toBeNull();
    expect(nissanNavaraFallbackUrl('https://www.ford.com.au/_next/static/css/site.css')).toBeNull();
  });
});
