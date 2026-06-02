import { describe, expect, it } from 'vitest';
import { extractWithSelectors } from './engine';

describe('extractWithSelectors', () => {
  it('extracts AEM CSS-variable background images for banner slides', () => {
    const html = `
      <article class="article">
        <div class="backgroundcontainer">
          <div
            class="container-parent"
            style="--desktop-background-image: url('/desktop.jpg'); --mobile-background-image: url('/mobile.jpg');"
          >
            <h1>EOFY EVENT IS ON NOW</h1>
            <a href="/offers.html">View Current Offers</a>
          </div>
        </div>
      </article>
    `;

    const result = extractWithSelectors(html, 'mitsubishi-au', 'homepage', {
      heroSlides: '.container-parent',
    });

    expect(result.bannerSlides).toHaveLength(1);
    expect(result.bannerSlides[0]).toMatchObject({
      headline: 'EOFY EVENT IS ON NOW',
      cta_text: 'View Current Offers',
      cta_url: 'https://www.mitsubishi-motors.com.au/offers.html',
      image_url_desktop: 'https://www.mitsubishi-motors.com.au/desktop.jpg',
      image_url_mobile: 'https://www.mitsubishi-motors.com.au/mobile.jpg',
    });
  });

  it('derives a readable headline from image-only AEM banners', () => {
    const html = `
      <article class="article">
        <div class="backgroundcontainer">
          <div
            class="container-parent"
            style="--desktop-background-image: url('/offers/2026/MIT0316_EOFY Event 2026_Website_1920x600px_Generic.jpg');"
          ></div>
        </div>
      </article>
    `;

    const result = extractWithSelectors(html, 'mitsubishi-au', 'offers', {
      heroSlides: '.container-parent',
    });

    expect(result.bannerSlides[0]).toMatchObject({
      headline: 'EOFY Event 2026',
      image_url_desktop: 'https://www.mitsubishi-motors.com.au/offers/2026/MIT0316_EOFY Event 2026_Website_1920x600px_Generic.jpg',
    });
  });
});
