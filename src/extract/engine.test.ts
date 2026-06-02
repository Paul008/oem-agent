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

  it('extracts Toyota homepage banner images selected directly', () => {
    const html = `
      <a href="/rav4" title="Tell me more">
        <img
          alt="All-New RAV4"
          src="/-/media/project/toyota/toyota/homepage/homepage-banner/march-2026/rav4-mobile-v2.jpg?rev=abc"
        />
      </a>
      <section class="hero-content">
        <h1>Current Offers</h1>
      </section>
    `;

    const result = extractWithSelectors(html, 'toyota-au', 'homepage', {
      heroSlides: 'img[src*="/homepage/homepage-banner/"]',
    });

    expect(result.bannerSlides).toHaveLength(1);
    expect(result.bannerSlides[0]).toMatchObject({
      headline: 'All-New RAV4',
      cta_text: 'Tell me more',
      cta_url: 'https://www.toyota.com.au/rav4',
      image_url_desktop: 'https://www.toyota.com.au/-/media/project/toyota/toyota/homepage/homepage-banner/march-2026/rav4-mobile-v2.jpg?rev=abc',
      image_url_mobile: 'https://www.toyota.com.au/-/media/project/toyota/toyota/homepage/homepage-banner/march-2026/rav4-mobile-v2.jpg?rev=abc',
    });
  });

  it('extracts GWM Storyblok hero slides without splitting nested hero elements', () => {
    const html = `
      <section class="hero w-100 blok">
        <div class="swiper-wrapper">
          <div class="swiper-slide swiper__item" data-swiper-slide-index="0">
            <div class="hero-image">
              <picture>
                <source srcset="https://assets.gwmanz.com/f/256395/780x1600/6c40a877a7/mobile-banner-eofy-may2026-opt2.jpg/m/3008x0/" media="(max-width: 768px)">
                <img
                  src="https://assets.gwmanz.com/f/256395/3008x1958/14d4f8445b/desktop-banner-gwm-eofy2026-opt02.jpg/m/3008x0"
                  srcset="https://assets.gwmanz.com/f/256395/3008x1958/14d4f8445b/desktop-banner-gwm-eofy2026-opt02.jpg/m/3008x0 1x"
                  alt=""
                />
              </picture>
            </div>
            <div class="hero-content">
              <div class="hero-content-heading hero-content-heading--large"></div>
              <div class="hero-content-cta">
                <a href="/au/offers/"><span class="cta-button__text">Learn More</span></a>
              </div>
            </div>
          </div>
          <div class="swiper-slide swiper__item" data-swiper-slide-index="1">
            <div class="hero-image">
              <picture>
                <source srcset="https://assets.gwmanz.com/f/256395/780x1600/a3aaf573fd/h6-wbmsuv25-banner-mobile.jpg/m/3008x0/" media="(max-width: 768px)">
                <img src="https://assets.gwmanz.com/f/256395/2048x1333/e19bec7fb4/h6-wbmsuv25-banner-desktop.jpg/m/3008x0" />
              </picture>
            </div>
            <div class="hero-content">
              <div class="hero-content-heading hero-content-heading--large">
                <h1>Haval H6</h1>
                <p>Delivers more OOOH.</p>
              </div>
              <div class="hero-content-cta">
                <a href="/au/models/suv/haval-h6/"><span class="cta-button__text">Discover H6</span></a>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section class="hero-content">
        <h1>Not a slide</h1>
      </section>
    `;

    const result = extractWithSelectors(html, 'gwm-au', 'homepage', {
      heroSlides: 'section.hero .swiper-slide.swiper__item:has(.hero-image img)',
    });

    expect(result.bannerSlides).toHaveLength(2);
    expect(result.bannerSlides[0]).toMatchObject({
      headline: 'GWM EOFY 2026',
      cta_text: 'Learn More',
      cta_url: 'https://www.gwmanz.com/au/offers/',
      image_url_desktop: 'https://assets.gwmanz.com/f/256395/3008x1958/14d4f8445b/desktop-banner-gwm-eofy2026-opt02.jpg/m/3008x0',
      image_url_mobile: 'https://assets.gwmanz.com/f/256395/780x1600/6c40a877a7/mobile-banner-eofy-may2026-opt2.jpg/m/3008x0/',
    });
    expect(result.bannerSlides[1]).toMatchObject({
      headline: 'Haval H6',
      sub_headline: 'Delivers more OOOH.',
      cta_text: 'Discover H6',
      cta_url: 'https://www.gwmanz.com/au/models/suv/haval-h6/',
      image_url_desktop: 'https://assets.gwmanz.com/f/256395/2048x1333/e19bec7fb4/h6-wbmsuv25-banner-desktop.jpg/m/3008x0',
      image_url_mobile: 'https://assets.gwmanz.com/f/256395/780x1600/a3aaf573fd/h6-wbmsuv25-banner-mobile.jpg/m/3008x0/',
    });
  });
});
