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

  it('extracts Suzuki respim homepage and offers banners', () => {
    const html = `
      <div class="hb-2025-refresh__item">
        <div class="bg-image bg-image-large-up" data-background-image data-respim='{
          "src": "/wp-content/uploads/2026/05/Jimny-Rhino-Desktop-Banner-2-2280x1600.webp",
          "webp": "/wp-content/uploads/2026/05/Jimny-Rhino-Desktop-Banner-2-2280x1600.webp"
        }'></div>
        <div class="bg-image bg-image-default" data-background-image data-respim='{
          "src": "/wp-content/uploads/2026/05/Jimny-rhino-1280x1380.webp",
          "webp": "/wp-content/uploads/2026/05/Jimny-rhino-1280x1380.webp"
        }'></div>
        <h1 class="hb-2025-refresh__title">Rhino Spotted</h1>
        <a class="cta" href="/jimny-rhino-ryi-form/">Learn more</a>
      </div>
      <article class="retail-hero-banner hero-banner--separate-images">
        <a href="/book-test-drive/">
          <img
            src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
            class="retail-hero-banner__bg"
            data-respim='{
              "default": { "src": "/wp-content/uploads/2026/04/SUZ969-WebsiteBanner-ForFundsSake-Mobile-1280x1380-v1.0-HLCTAOffer-1200x1294.webp" },
              "xxlarge-only": { "src": "/wp-content/uploads/2024/09/Swift-Offers-Banner-Final-2560x1393.webp" }
            }'
          />
          <noscript><img src="/wp-content/uploads/2026/04/SUZ969-WebsiteBanner-ForFundsSake-Mobile-1280x1380-v1.0-HLCTAOffer-1200x1294.webp"></noscript>
        </a>
      </article>
    `;

    const result = extractWithSelectors(html, 'suzuki-au', 'homepage', {
      heroSlides: '.hb-2025-refresh__item, .hero-banner-slideshow .retail-hero-banner, .retail-hero-banner',
    });

    expect(result.bannerSlides).toHaveLength(2);
    expect(result.bannerSlides[0]).toMatchObject({
      headline: 'Rhino Spotted',
      cta_text: 'Learn more',
      cta_url: 'https://www.suzuki.com.au/jimny-rhino-ryi-form/',
      image_url_desktop: 'https://www.suzuki.com.au/wp-content/uploads/2026/05/Jimny-Rhino-Desktop-Banner-2-2280x1600.webp',
      image_url_mobile: 'https://www.suzuki.com.au/wp-content/uploads/2026/05/Jimny-rhino-1280x1380.webp',
    });
    expect(result.bannerSlides[1]).toMatchObject({
      headline: 'Swift Offers',
      cta_text: null,
      cta_url: 'https://www.suzuki.com.au/book-test-drive/',
      image_url_desktop: 'https://www.suzuki.com.au/wp-content/uploads/2024/09/Swift-Offers-Banner-Final-2560x1393.webp',
      image_url_mobile: 'https://www.suzuki.com.au/wp-content/uploads/2026/04/SUZ969-WebsiteBanner-ForFundsSake-Mobile-1280x1380-v1.0-HLCTAOffer-1200x1294.webp',
    });
  });

  it('extracts Volkswagen OneHub stage slides from picture sources and skips carousel clones', () => {
    const html = `
      <main>
        <div id="stage-slide-panel-2" role="tabpanel">
          <picture>
            <source media="(max-aspect-ratio: 1/1)" srcset="https://assets.volkswagen.com/is/image/volkswagenag/PHEV_Tiguan_Hero_1?mobile=320 320w" />
            <source media="(min-aspect-ratio: 1/1)" srcset="https://assets.volkswagen.com/is/image/volkswagenag/PHEV_Tiguan_Hero_1?desktop=320 320w, https://assets.volkswagen.com/is/image/volkswagenag/PHEV_Tiguan_Hero_1?desktop=1920 1920w" />
            <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9' />" />
          </picture>
          <h1>The new Tiguan eHybrid</h1>
          <p>Battery powered brilliance</p>
          <a href="/en/models/tiguan-plug-in-hybrid.html">Explore more</a>
        </div>
        <div id="stage-slide-panel-0" role="tabpanel">
          <button data-component="disclaimer-reference-badge">1</button>
          <picture>
            <source media="(max-aspect-ratio: 1/1)" srcset="https://assets.volkswagen.com/is/image/volkswagenag/EOFY-Hero-Mobile?mobile=320 320w" />
            <source media="(min-aspect-ratio: 1/1)" srcset="https://assets.volkswagen.com/is/image/volkswagenag/EOFY-Hero-Desktop?desktop=320 320w, https://assets.volkswagen.com/is/image/volkswagenag/EOFY-Hero-Desktop?desktop=1920 1920w" />
            <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9' />" />
          </picture>
          <h1>End of Financial Year offers are now unlocked</h1>
          <p>Electric, plug-in hybrid and SUV offers and more across the Volkswagen range</p>
          <a href="https://www.volkswagen.com.au/app/locals/offers-pricing">View offers</a>
        </div>
        <div id="stage-slide-panel-1" role="tabpanel">
          <picture>
            <source media="(max-aspect-ratio: 1/1)" srcset="https://assets.volkswagen.com/is/image/volkswagenag/Amarok_Mobile?mobile=320 320w" />
            <source media="(min-aspect-ratio: 1/1)" srcset="https://assets.volkswagen.com/is/image/volkswagenag/Amarok_Desktop?desktop=320 320w, https://assets.volkswagen.com/is/image/volkswagenag/Amarok_Desktop?desktop=1920 1920w" />
            <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9' />" />
          </picture>
          <h1>Tough feels better in an Amarok</h1>
          <a href="/en/models/amarok.html">Explore more</a>
        </div>
        <div id="stage-slide-panel-2" role="tabpanel">
          <picture>
            <source media="(max-aspect-ratio: 1/1)" srcset="https://assets.volkswagen.com/is/image/volkswagenag/PHEV_Tiguan_Hero_1?mobile=320 320w" />
            <source media="(min-aspect-ratio: 1/1)" srcset="https://assets.volkswagen.com/is/image/volkswagenag/PHEV_Tiguan_Hero_1?desktop=320 320w, https://assets.volkswagen.com/is/image/volkswagenag/PHEV_Tiguan_Hero_1?desktop=1920 1920w" />
            <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9' />" />
          </picture>
          <h1>The new Tiguan eHybrid</h1>
          <p>Battery powered brilliance</p>
          <a href="/en/models/tiguan-plug-in-hybrid.html">Explore more</a>
        </div>
      </main>
    `;

    const result = extractWithSelectors(html, 'volkswagen-au', 'homepage', {
      heroSlides: 'div[id^="stage-slide-panel-"]',
    });

    expect(result.bannerSlides).toHaveLength(3);
    expect(result.bannerSlides[0]).toMatchObject({
      position: 0,
      headline: 'The new Tiguan eHybrid',
      sub_headline: 'Battery powered brilliance',
      cta_text: 'Explore more',
      cta_url: 'https://www.volkswagen.com.au/en/models/tiguan-plug-in-hybrid.html',
      image_url_desktop: 'https://assets.volkswagen.com/is/image/volkswagenag/PHEV_Tiguan_Hero_1?desktop=1920',
      image_url_mobile: 'https://assets.volkswagen.com/is/image/volkswagenag/PHEV_Tiguan_Hero_1?mobile=320',
    });
    expect(result.bannerSlides[1]).toMatchObject({
      position: 1,
      headline: 'End of Financial Year offers are now unlocked',
      sub_headline: 'Electric, plug-in hybrid and SUV offers and more across the Volkswagen range',
      cta_text: 'View offers',
      cta_url: 'https://www.volkswagen.com.au/app/locals/offers-pricing',
      image_url_desktop: 'https://assets.volkswagen.com/is/image/volkswagenag/EOFY-Hero-Desktop?desktop=1920',
      image_url_mobile: 'https://assets.volkswagen.com/is/image/volkswagenag/EOFY-Hero-Mobile?mobile=320',
    });
    expect(result.bannerSlides[2]).toMatchObject({
      position: 2,
      headline: 'Tough feels better in an Amarok',
      cta_text: 'Explore more',
      cta_url: 'https://www.volkswagen.com.au/en/models/amarok.html',
      image_url_desktop: 'https://assets.volkswagen.com/is/image/volkswagenag/Amarok_Desktop?desktop=1920',
      image_url_mobile: 'https://assets.volkswagen.com/is/image/volkswagenag/Amarok_Mobile?mobile=320',
    });
  });
});
