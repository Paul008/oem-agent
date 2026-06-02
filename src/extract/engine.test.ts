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

  it('extracts GMSV masthead metadata from GM AEM slider attributes', () => {
    const html = `
      <div class="q-slider" data-dtm-options='{"nextArrow":["masthead",null]}'>
        <div
          class="q-mod q-mod-slide q-slider-item"
          data-caption-title="Explore the Silverado Range"
          data-caption-link-label="Explore the Silverado Range"
          data-link="/au-en/chevrolet/trucks"
        >
          <picture>
            <source media="(min-width: 1200px)" srcset="/desktop.png?imwidth=1920 1x" />
            <source media="(min-width: 800px)" srcset="/mobile.png?imwidth=1200 1x" />
            <img alt="Silverado LD EOFY Offer" src="/desktop.png?imwidth=1200" />
          </picture>
        </div>
      </div>
    `;

    const result = extractWithSelectors(html, 'gmsv-au', 'homepage', {
      heroSlides: '.q-slider[data-dtm-options*="masthead"] .q-mod-slide',
    });

    expect(result.bannerSlides[0]).toMatchObject({
      headline: 'Explore the Silverado Range',
      cta_text: 'Explore the Silverado Range',
      cta_url: 'https://www.gmspecialtyvehicles.com/au-en/chevrolet/trucks',
      image_url_desktop: 'https://www.gmspecialtyvehicles.com/desktop.png?imwidth=1200',
      image_url_mobile: 'https://www.gmspecialtyvehicles.com/mobile.png?imwidth=1200',
    });
  });
});
