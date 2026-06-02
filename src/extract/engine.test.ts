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

  it('extracts Nissan homepage carousel slides with min-width mobile sources', () => {
    const html = `
      <div class="c_007_v2 height-legacy-desktop hero-carousel homepage-hero hero edge">
        <div class="carousel-slide text-light">
          <figure class="main-image">
            <picture>
              <source media="(min-width: 62.5em)" srcset="//www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/x-trail-june-offer-hp-d-r3.jpg.ximg.full.hero.jpg" />
              <source media="(min-width: 60.0em)" srcset="//www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/x-trail-june-offer-hp-d-r3.jpg.ximg.c4.hero.jpg" />
              <source media="(min-width: 36.3125em)" srcset="//www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/x-trail-june-offer-hp-t-r3.jpg.ximg.c2m.hero.jpg" />
              <source media="(min-width: 1.0em)" srcset="//www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/x-trail-june-offer-hp-m-r3.jpg.ximg.c1m.hero.jpg, //www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/x-trail-june-offer-hp-m-r3.jpg.ximg.c1h.hero.jpg 2x" />
              <img src="//www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/x-trail-june-offer-hp-d-r3.jpg.ximg.full.hero.jpg" />
            </picture>
          </figure>
          <a class="cta cta-link cta-primary" href="/offers.html">View Offers</a>
        </div>
        <div class="carousel-slide hidden text-light">
          <figure class="main-image">
            <picture>
              <source media="(min-width: 62.5em)" srcset="//www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/AU21-P00002570-09_Navara_HorseFloat_V13_NoVignette_RGB-hp-d-r9.jpg.ximg.full.hero.jpg" />
              <source media="(min-width: 1.0em)" srcset="//www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/AU21-P00002570-09_Navara_HorseFloat_V13_NoVignette_RGB-hp-m-r8.jpg.ximg.c1m.hero.jpg" />
              <img src="//www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/AU21-P00002570-09_Navara_HorseFloat_V13_NoVignette_RGB-hp-d-r9.jpg.ximg.full.hero.jpg" />
            </picture>
          </figure>
          <h2 class="title">All-new Navara</h2>
          <a class="cta cta-link cta-primary" href="/vehicles/browse-range/all-new-navara.html">Explore</a>
          <a class="cta cta-link cta-secondary" href="/vehicles/browse-range/all-new-navara/version-explorer/ve.shtml">Build Your Navara</a>
        </div>
      </div>
    `;

    const result = extractWithSelectors(html, 'nissan-au', 'homepage', {
      heroSlides: '.homepage-hero.hero-carousel .carousel-slide',
    });

    expect(result.bannerSlides).toHaveLength(2);
    expect(result.bannerSlides[0]).toMatchObject({
      headline: 'X Trail June Offer',
      cta_text: 'View Offers',
      cta_url: 'https://www.nissan.com.au/offers.html',
      image_url_desktop: 'https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/x-trail-june-offer-hp-d-r3.jpg.ximg.full.hero.jpg',
      image_url_mobile: 'https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/x-trail-june-offer-hp-m-r3.jpg.ximg.c1m.hero.jpg',
    });
    expect(result.bannerSlides[1]).toMatchObject({
      headline: 'All-new Navara',
      cta_text: 'Explore',
      cta_url: 'https://www.nissan.com.au/vehicles/browse-range/all-new-navara.html',
      image_url_desktop: 'https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/AU21-P00002570-09_Navara_HorseFloat_V13_NoVignette_RGB-hp-d-r9.jpg.ximg.full.hero.jpg',
      image_url_mobile: 'https://www-asia.nissan-cdn.net/content/dam/Nissan/AU/Images/homepage/AU21-P00002570-09_Navara_HorseFloat_V13_NoVignette_RGB-hp-m-r8.jpg.ximg.c1m.hero.jpg',
    });
  });

  it('extracts Hyundai multipurpose hero data-bg banners without duplicate CTA text', () => {
    const html = `
      <div
        class="mp-hero-blade--background-image mp-hero-blade--background-image-full js-background-toggle"
        data-bg-sm="/content/dam/hyundai/au/en/homepage/2026/elexio-campaignhero-mobile-767x975.png"
        data-bg-lg="/content/dam/hyundai/au/en/homepage/2026/elexio-campaignhero-desktop-1920x720.png"
      >
        <div class="mp-hero-blade--content align-middle">
          <div class="inner font-white" data-component-title="ALL-NEW ELEXIO.">
            <a class="link-wrapper" href="https://www.hyundai.com/au/en/cars/eco/elexio">
              <span>ALL-NEW ELEXIO.</span>
            </a>
            <h1 class="h1"><span class="headline">ALL-NEW ELEXIO.</span></h1>
            <p class="text">Born from 35 years of EV innovation.</p>
            <div class="cta-container">
              <a class="btn" href="https://www.hyundai.com/au/en/cars/eco/elexio">
                <span>Learn more</span><span class="sr-only">Learn more — ALL-NEW ELEXIO.</span>
              </a>
            </div>
          </div>
        </div>
      </div>
      <div
        class="mp-hero-blade--background-image mp-hero-blade--background-image-full js-background-toggle"
        data-bg-sm="/content/dam/hyundai/au/en/offers-images/2026/EOFYS_Banner_767x975-EOFYS-Mobile.jpg"
        data-bg-lg="/content/dam/hyundai/au/en/offers-images/2026/EOFYS_Banner_1920x720-Desktop.jpg"
      >
        <h1 class="h1"><span class="headline">Hyundai EOFYS is on now!</span></h1>
        <p class="text">Unlock offers on selected models across a wide range.</p>
        <div class="cta-container">
          <a role="button" class="btn hyu-trigger-pcm2-contact-dealer-modal">
            <span>Contact a dealer</span><span class="sr-only">Contact a dealer — Hyundai EOFYS is on now!</span>
          </a>
        </div>
      </div>
    `;

    const result = extractWithSelectors(html, 'hyundai-au', 'homepage', {
      heroSlides: '.mp-hero-blade--background-image[data-bg-lg]',
    });

    expect(result.bannerSlides).toHaveLength(2);
    expect(result.bannerSlides[0]).toMatchObject({
      headline: 'ALL-NEW ELEXIO.',
      sub_headline: 'Born from 35 years of EV innovation.',
      cta_text: 'Learn more',
      cta_url: 'https://www.hyundai.com/au/en/cars/eco/elexio',
      image_url_desktop: 'https://www.hyundai.com/content/dam/hyundai/au/en/homepage/2026/elexio-campaignhero-desktop-1920x720.png',
      image_url_mobile: 'https://www.hyundai.com/content/dam/hyundai/au/en/homepage/2026/elexio-campaignhero-mobile-767x975.png',
    });
    expect(result.bannerSlides[1]).toMatchObject({
      headline: 'Hyundai EOFYS is on now!',
      sub_headline: 'Unlock offers on selected models across a wide range.',
      cta_text: 'Contact a dealer',
      cta_url: null,
      image_url_desktop: 'https://www.hyundai.com/content/dam/hyundai/au/en/offers-images/2026/EOFYS_Banner_1920x720-Desktop.jpg',
      image_url_mobile: 'https://www.hyundai.com/content/dam/hyundai/au/en/offers-images/2026/EOFYS_Banner_767x975-EOFYS-Mobile.jpg',
    });
  });

  it('extracts Isuzu UTE carousel banners without nested hero over-imports', () => {
    const html = `
      <div class="hero-banner-carousel hero-carousel">
        <div class="carousel-item active header-banner-block--hide-on-desktop">
          <a class="hero-carousel__anchor-container" href="/d-max/overview">
            <picture class="hero-carousel__picture">
              <source srcset="https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/d-max/d-max-header-banner_mobile_2x.jpg?rev=mobile" />
              <source srcset="https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/d-max/d-max-header-banner_tablet_2x.jpg?rev=tablet" />
              <source srcset="https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/d-max/d-max-header-banner_desktop_2x.jpg?rev=desktop" />
              <img class="hero-carousel__image" src="https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/d-max/d-max-header-banner_desktop_2x.jpg?rev=desktop" />
            </picture>
            <div class="hero-carousel__title">
              <h2 class="hero-carousel__heading">ADVENTURE IS EVERYWHERE</h2>
              <h1 class="header-banner-block__title__bottom hero-carousel__description">ISUZU D-MAX</h1>
            </div>
            <button class="btn btn-primary btn-round cta hero-carousel__cta">Discover D-MAX</button>
          </a>
        </div>
        <div class="carousel-item header-banner-block--hide-on-desktop">
          <a class="hero-carousel__anchor-container" href="/offers/current-offers">
            <picture class="hero-carousel__picture">
              <source srcset="https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/eofy/eofy-homepage_mobile_2x.jpg?rev=mobile" />
              <img class="hero-carousel__image" src="https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/eofy/eofy-homepage_desktop_2x.jpg?rev=desktop" />
            </picture>
            <h1 class="header-banner-block__title__bottom hero-carousel__heading">D-MAX</h1>
            <h2 class="hero-carousel__description">EOFY SALE</h2>
            <button class="btn btn-primary btn-round cta hero-carousel__cta">Current Offers</button>
          </a>
        </div>
      </div>
      <div class="hero-banner-carousel">
        <div class="carousel-item active">
          <div class="col-12 carousel-banner-block carousel-banner-block--single">
            <div class="col-12 header-banner-block--height-500 carousel-banner-block hf--montserrat">
              <div class="header-banner-block__media-container">
                <img class="header-banner-block__image" src="https://cdn-iua.dataweavers.io/-/media/offers/currents-offers/header-banner/isuzu-offers---3-years-free-servicing/offers-header-banner.jpg?rev=desktop" />
                <img class="header-banner-block__image header-banner-block__image--medium" src="https://cdn-iua.dataweavers.io/-/media/offers/currents-offers/header-banner/isuzu-offers---3-years-free-servicing/offers-header-banner_tablet.jpg?rev=tablet" />
                <img class="header-banner-block__image header-banner-block__image--small" src="https://cdn-iua.dataweavers.io/-/media/offers/currents-offers/header-banner/isuzu-offers---3-years-free-servicing/offers-header-banner_mobile.jpg?rev=mobile" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <section class="hero-content">
        <h1>Not a banner</h1>
      </section>
    `;

    const result = extractWithSelectors(html, 'isuzu-au', 'homepage', {
      heroSlides: '.hero-banner-carousel .carousel-item:has(.hero-carousel__anchor-container .hero-carousel__picture img.hero-carousel__image), .carousel-banner-block--single .carousel-banner-block:has(img.header-banner-block__image)',
    });

    expect(result.bannerSlides).toHaveLength(3);
    expect(result.bannerSlides[0]).toMatchObject({
      headline: 'ADVENTURE IS EVERYWHERE',
      sub_headline: 'ISUZU D-MAX',
      cta_text: 'Discover D-MAX',
      cta_url: 'https://www.isuzuute.com.au/d-max/overview',
      image_url_desktop: 'https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/d-max/d-max-header-banner_desktop_2x.jpg?rev=desktop',
      image_url_mobile: 'https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/d-max/d-max-header-banner_mobile_2x.jpg?rev=mobile',
    });
    expect(result.bannerSlides[1]).toMatchObject({
      headline: 'D-MAX',
      sub_headline: 'EOFY SALE',
      cta_text: 'Current Offers',
      cta_url: 'https://www.isuzuute.com.au/offers/current-offers',
      image_url_desktop: 'https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/eofy/eofy-homepage_desktop_2x.jpg?rev=desktop',
      image_url_mobile: 'https://cdn-iua.dataweavers.io/-/media/homepage/header-banner/eofy/eofy-homepage_mobile_2x.jpg?rev=mobile',
    });
    expect(result.bannerSlides[2]).toMatchObject({
      headline: 'Isuzu Offers 3 Years Free Servicing',
      cta_text: null,
      cta_url: null,
      image_url_desktop: 'https://cdn-iua.dataweavers.io/-/media/offers/currents-offers/header-banner/isuzu-offers---3-years-free-servicing/offers-header-banner.jpg?rev=desktop',
      image_url_mobile: 'https://cdn-iua.dataweavers.io/-/media/offers/currents-offers/header-banner/isuzu-offers---3-years-free-servicing/offers-header-banner_mobile.jpg?rev=mobile',
    });
  });
});
