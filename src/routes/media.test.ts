import { describe, expect, it } from 'vitest';

import { encodeUrl } from '../utils/image-proxy';
import { rewriteCssAssetUrlsForMediaProxy } from './media';

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
