import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  buildCloneStudioHtml,
  reassignClonedRegionIdsForTest,
  sanitizeCloneStudioHtmlForTest,
  sanitizeCloneStudioUrlForTest,
  serializeCloneStudioBodyForTest,
  stopCloneStudioBlockedEventForTest,
  stripCloneStudioBridgeNodesForTest,
  stripCloneStudioScaffoldingForTest,
} from './clone-studio-html'

function extractInitialBody(html: string): string {
  return html.match(/<body>\n([\s\S]*?)\n<script data-clone-studio-bridge="true">/)?.[1] ?? ''
}

function extractDocumentHead(html: string): string {
  return html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ''
}

function extractBridgeScript(html: string): string {
  return html.match(/<script data-clone-studio-bridge="true">([\s\S]*?)<\/script>/)?.[1] ?? ''
}

describe('buildCloneStudioHtml', () => {
  it('disables navigation and injects clone studio bridge messages', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><a href="/showroom">Compare</a><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    expect(html).toContain('data-oem-preview-link="true"')
    expect(html).toContain('clone-studio:ready')
    expect(html).toContain('clone-studio:select-region')
    expect(html).toContain('clone-studio:dom-updated')
  })

  it('strips external SVG <use> icon refs (WebKit blocks them cross-origin) but keeps same-document refs', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main>'
        + '<svg><use href="/etc.clientlibs/apps/resources/statics/icons/Phone/default.svg#master"></use></svg>'
        + '<svg><use xlink:href="https://www.volkswagen.com.au/icons/Discount.svg#d"></use></svg>'
        + '<svg><use href="#inline-symbol"></use></svg>'
        + '</main>',
      title: 'Amarok',
      baseHref: 'https://www.volkswagen.com.au/amarok.html',
      selectedRegionId: null,
    })

    expect(html).not.toContain('icons/Phone/default.svg')
    expect(html).not.toContain('Discount.svg')
    expect(html).toContain('#inline-symbol')
  })

  it('supports replacing a selected clone region outer HTML from the bridge', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main data-oem-region-id="r1"><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    const bridge = extractBridgeScript(html)
    expect(bridge).toContain('kind === \'outer-html\'')
    expect(bridge).toContain('target.outerHTML = sanitizeHtml')
  })

  it('marks a selected region for the iframe bridge', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main data-oem-region-id="r1"><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: 'r1',
    })

    expect(html).toContain('window.__CLONE_STUDIO_SELECTED_REGION__ = "r1"')
  })

  it('rewrites root-relative proxied /media/ URLs to the media base while keeping the OEM source base href', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><img src="/media/pages/assets/ford-au/mustang/hero.webp" alt="Mustang"><img src="/media/pages/assets/ford-au/mustang/a.webp" srcset="/media/pages/assets/ford-au/mustang/a.webp 1x, /media/pages/assets/ford-au/mustang/a2.webp 2x"></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    // Base href stays the OEM source so OEM-relative resources still resolve.
    expect(html).toContain('<base href="https://www.ford.com.au/showroom/cars/mustang/">')
    // Proxied images become absolute against the media host that actually serves them.
    expect(html).toContain('src="https://oem-agent.adme-dev.workers.dev/media/pages/assets/ford-au/mustang/hero.webp"')
    expect(html).toContain('https://oem-agent.adme-dev.workers.dev/media/pages/assets/ford-au/mustang/a2.webp 2x')
    expect(html).not.toContain('src="/media/')
  })

  it('falls back to the captured img source when a picture source candidate fails', () => {
    const html = buildCloneStudioHtml({
      rendered: '<picture><source media="(min-width: 720px)" srcset="/media/pages/assets/nissan-au/ariya/voice.jpg.ximg.l_8_m.smart.jpg"><img src="/media/pages/assets/nissan-au/ariya/voice.jpg" srcset="/media/pages/assets/nissan-au/ariya/voice.jpg" alt="Voice controls"></picture>',
      title: 'Ariya',
      baseHref: 'https://www.nissan.com.au/vehicles/browse-range/ariya.html',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    const bridgeScript = extractBridgeScript(html)
    expect(bridgeScript).toContain('function installBrokenPictureFallbacks()')
    expect(bridgeScript).toContain('function recoverBrokenPictureImage(image)')
    expect(bridgeScript).toContain('document.addEventListener(\'error\', handleBrokenPictureImage, true)')
    expect(bridgeScript).toContain('picture.querySelectorAll(\'source[srcset]\')')
    expect(bridgeScript).toContain('sources[i].removeAttribute(\'srcset\')')
    expect(bridgeScript).toContain('image.removeAttribute(\'srcset\')')
    expect(bridgeScript).toContain('image.setAttribute(\'src\', fallbackUrl)')
    expect(bridgeScript).toContain('installBrokenPictureFallbacks()')
  })

  it('emits OEM stylesheet links from stylesheetUrls so styling survives body-only edits', () => {
    const html = buildCloneStudioHtml({
      // edited_rendered is body-only (head links stripped on a prior edit)
      rendered: '<main><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      stylesheetUrls: [
        'https://www.ford.com.au/etc.clientlibs/dxdfoap/clientlibs/sites/clientlib-common.min.css',
        'https://www.ford.com.au/etc.clientlibs/dxdfoap/clientlibs/sites/clientlib-nameplates.min.css',
      ],
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('href="https://www.ford.com.au/etc.clientlibs/dxdfoap/clientlibs/sites/clientlib-common.min.css"')
    expect(head).toContain('href="https://www.ford.com.au/etc.clientlibs/dxdfoap/clientlibs/sites/clientlib-nameplates.min.css"')
    expect((head.match(/rel="stylesheet"/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('proxies OEM stylesheet links through the media worker when mediaBase is available', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      stylesheetUrls: ['https://www.ford.com.au/etc.clientlibs/dxdfoap/clientlibs/sites/clientlib-nameplates.min.css'],
      selectedRegionId: null,
    })

    const head = extractDocumentHead(html)
    expect(head).toContain('href="https://oem-agent.adme-dev.workers.dev/media/ford-au/')
    expect(head).not.toContain('href="https://www.ford.com.au/etc.clientlibs/dxdfoap/clientlibs/sites/clientlib-nameplates.min.css"')
  })

  it('proxies preserved style-block asset URLs through the media worker', () => {
    const html = buildCloneStudioHtml({
      rendered: '<style>.hero{background-image:url("/content/dam/Ford/au/nameplate/mustang/hero.webp")}</style><main><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    const head = extractDocumentHead(html)
    expect(head).toContain('url("https://oem-agent.adme-dev.workers.dev/media/ford-au/')
    expect(head).not.toContain('/content/dam/Ford/au/nameplate/mustang/hero.webp')
  })

  it('does not duplicate stylesheet links already present in the captured head', () => {
    const html = buildCloneStudioHtml({
      rendered: '<link rel="stylesheet" href="https://www.ford.com.au/site.css"><main><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/',
      stylesheetUrls: ['https://www.ford.com.au/site.css'],
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect((head.match(/href="https:\/\/www\.ford\.com\.au\/site\.css"/g) || []).length).toBe(1)
  })

  it('ignores non-http stylesheet urls', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/',
      stylesheetUrls: ['javascript:alert(1)', '/relative.css', 'https://www.ford.com.au/ok.css'],
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('href="https://www.ford.com.au/ok.css"')
    expect(head).not.toContain('javascript:alert')
    expect(head).not.toContain('href="/relative.css"')
  })

  it('constrains Slick carousel tracks so slides clip cleanly without horizontal overflow', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><div class="slick-list"><div class="slick-track"><div class="slick-slide">1</div><div class="slick-slide">2</div></div></div></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('.slick-list,')
    expect(head).toMatch(/\.slick-list,[\s\S]*overflow:\s*hidden\s*!important/i)
    expect(head).toContain('display: flex !important')
    expect(head).toContain('[data-clone-studio-carousel-window-size="2"] .slick-slide')
    expect(head).toContain('[data-clone-studio-carousel-window-size="3"] .slick-slide')
    expect(head).toMatch(/@media \(max-width: 1023\.98px\)[\s\S]*\[data-clone-studio-carousel-window-size\] \.slick-slide[\s\S]*width:\s*100%\s*!important/i)
    expect(head).toMatch(/@media \(max-width: 1023\.98px\)[\s\S]*\.brandcardComponent \.brandcard-image\.sameheight[\s\S]*aspect-ratio:\s*1\.326 \/ 1\s*!important/i)
    expect(head).toMatch(/\.brandcardComponent h3\[data-clone-studio-responsive-content-variant="desktop"\][\s\S]*\[class\*="heading3-medium"\][\s\S]*font-size:\s*1\.25rem\s*!important/i)
    // No carousel animation / external script is injected (rAF ticker is throttled in the iframe).
    expect(html).not.toContain('gsap.min.js')
    expect(html).not.toContain('translateX')
  })

  it('constrains common carousel libraries so static clone slides cannot overflow the desktop frame', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><div class="swiper"><div class="swiper-wrapper"><div class="swiper-slide swiper-slide-active">Hero</div><div class="swiper-slide">Next</div></div></div><div class="splide"><div class="splide__track"><div class="splide__slide">Slide</div></div></div></main>',
      title: 'Haval H6',
      baseHref: 'https://www.gwmanz.com/au/models/suv/haval-h6/',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('.swiper,')
    expect(head).toContain('.swiper-wrapper,')
    expect(head).toContain('.splide__track')
    expect(head).toMatch(/overflow:\s*hidden\s*!important/i)
    expect(head).toMatch(/\.swiper-slide,[\s\S]*\.splide__slide[\s\S]*width:\s*100%\s*!important/i)
  })

  it('clips document-level horizontal overflow and caps media to the responsive frame', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><div class="article-wrapper"><picture><img src="/hero.jpg"></picture></div></main>',
      title: 'i30',
      baseHref: 'https://www.hyundai.com/au/en/cars/small-cars/i30/',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toMatch(/\*,[\s\S]*\*::before,[\s\S]*\*::after[\s\S]*box-sizing:\s*border-box/i)
    expect(head).toMatch(/html,[\s\S]*body[\s\S]*min-width:\s*0/i)
    expect(head).toMatch(/html,[\s\S]*body[\s\S]*overflow-x:\s*clip\s*!important/i)
    expect(head).toMatch(/body[\s\S]*overflow-wrap:\s*anywhere/i)
    expect(head).toMatch(/img,[\s\S]*picture[\s\S]*max-width:\s*100%\s*!important/i)
  })

  it('keeps full-viewport immersive background images at the section height on desktop', () => {
    const html = buildCloneStudioHtml({
      rendered: `
        <main>
          <div class="full-viewport-height">
            <img class="inview-background-img js-background" src="/media/pages/assets/nissan-au/ariya/ride.jpg" alt="">
          </div>
          <img class="content-image" src="/media/pages/assets/nissan-au/ariya/detail.jpg" alt="ARIYA detail">
        </main>
      `,
      title: 'ARIYA',
      baseHref: 'https://www.nissan.com.au/vehicles/browse-range/ariya.html',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    const head = extractDocumentHead(html)
    expect(head).toMatch(/@media \(min-width:\s*1024px\)[\s\S]*img,[\s\S]*video[\s\S]*height:\s*auto\s*!important/i)
    expect(head).toMatch(/\.full-viewport-height img\.inview-background-img,[\s\S]*\.full-viewport-height img\.js-background[\s\S]*height:\s*100%\s*!important/i)
    expect(head).toMatch(/\.full-viewport-height img\.inview-background-img,[\s\S]*object-fit:\s*cover\s*!important/i)
  })

  it('collapses empty OEM feature-app loader shells without hiding populated modules', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><section class="featureAppSection"><div class="CmsFeatureAppLoader"></div></section></main>',
      title: 'Amarok',
      baseHref: 'https://www.volkswagen.com.au/en/models/amarok.html',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('.featureAppSection:has([class*="CmsFeatureAppLoader"])')
    expect(head).toContain('[class*="CmsFeatureAppLoader"]:not(:has(img, picture, video, iframe, canvas, svg, a, button')
    expect(head).toMatch(/CmsFeatureAppLoader[\s\S]*display:\s*none\s*!important/i)
    expect(head).toMatch(/CmsFeatureAppLoader[\s\S]*height:\s*0\s*!important/i)
  })

  it('stacks AEM split-grid blocks below desktop and restores mobile data-config spacing', () => {
    const html = buildCloneStudioHtml({
      rendered: `
        <main>
          <div class="aem-Grid aem-Grid--12 aem-Grid--default--12 aem-Grid--phone--12">
            <div class="imagevideoTile aem-GridColumn aem-GridColumn--default--12 aem-GridColumn--phone--12">
              <div class="cmp-image" data-config="{&quot;mobilePadding&quot;:{&quot;paddingBy&quot;:&quot;px&quot;,&quot;paddingTop&quot;:&quot;0&quot;,&quot;paddingRight&quot;:&quot;0&quot;,&quot;paddingBottom&quot;:&quot;0&quot;,&quot;paddingLeft&quot;:&quot;0&quot;},&quot;mobileMargin&quot;:{&quot;marginBy&quot;:&quot;px&quot;,&quot;marginTop&quot;:&quot;0&quot;,&quot;marginRight&quot;:&quot;0&quot;,&quot;marginBottom&quot;:&quot;0&quot;,&quot;marginLeft&quot;:&quot;0&quot;}}">
                <div class="imageContainer" style="padding: 0 0 0 7%"><img class="imgdesktop" src="/mustang.webp" alt="The roar of a true sports car"></div>
              </div>
            </div>
            <div class="richtext aem-GridColumn aem-GridColumn--default--7 aem-GridColumn--offset--default--5 aem-GridColumn--phone--12 aem-GridColumn--offset--phone--0" style="padding: 3% 0 0 3%; margin: 0 4% 0 0; background-color: rgb(6, 111, 239);">
              <div class="cmp-richtext" data-mobilebg="#066FEF" data-rightroundmob="false" data-config="{&quot;mobilePadding&quot;:{&quot;paddingBy&quot;:&quot;%&quot;,&quot;paddingTop&quot;:&quot;5&quot;,&quot;paddingRight&quot;:&quot;15&quot;,&quot;paddingBottom&quot;:&quot;10&quot;,&quot;paddingLeft&quot;:&quot;5&quot;},&quot;mobileMargin&quot;:{&quot;marginBy&quot;:&quot;%&quot;,&quot;marginTop&quot;:&quot;4&quot;,&quot;marginRight&quot;:&quot;4&quot;,&quot;marginBottom&quot;:&quot;0&quot;,&quot;marginLeft&quot;:&quot;4&quot;}}">
                <h3>The roar of a true sports car</h3>
              </div>
            </div>
          </div>
        </main>
      `,
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toMatch(/@media \(max-width:\s*1023\.98px\)[\s\S]*\.aem-Grid > \[class\*="aem-GridColumn"\][\s\S]*width:\s*100%\s*!important/i)
    expect(head).toMatch(/\.aem-Grid > \[class\*="aem-GridColumn--offset--"\][\s\S]*margin-left:\s*0\s*!important/i)
    expect(head).toMatch(/\.aem-Grid \.cmp-richtext[\s\S]*width:\s*auto\s*!important/i)
    expect(head).toMatch(/@media \(max-width:\s*639\.98px\)[\s\S]*\.aem-Grid > \.richtext\.aem-GridColumn--default--12 \.cmp-richtext h2:has\(\[class\*="display3-medium"\]\)[\s\S]*line-height:\s*2rem\s*!important/i)
    expect(head).toMatch(/\.aem-Grid > \.richtext \.cmp-richtext p\[class\*="body1-regular-black"\][\s\S]*font-size:\s*0\.75rem\s*!important/i)
    expect(head).toMatch(/\.aem-Grid > \.richtext \.cmp-richtext p\[class\*="body1-regular-black"\] a[\s\S]*line-height:\s*1rem\s*!important/i)
    expect(head).toMatch(/\.aem-Grid > \.richtext \.richtext-read-more > \[data-clone-studio-responsive-content-variant="desktop"\]:not\(\[data-clone-studio-responsive-content-paired="true"\]\) > p:nth-of-type\(n\+4\)[\s\S]*display:\s*none\s*!important/i)
    expect(head).toMatch(/\.brandcardComponent\.white > \.brandcard-holder:has\(> \.brandcard-wrapper\):not\(:has\(> \.brandcard-wrapper > \*\)\)[\s\S]*padding:\s*20px 16px\s*!important/i)
    expect(head).toMatch(/\.aem-Grid > \.imagevideoTile,[\s\S]*\.aem-Grid \.imageContainer[\s\S]*padding:\s*0\s*!important/i)
    expect(head).toMatch(/\.aem-Grid \.imagevideoTile img[\s\S]*height:\s*auto\s*!important/i)

    const bridgeScript = extractBridgeScript(html)
    expect(bridgeScript).toContain('function installResponsiveConfigRules()')
    expect(bridgeScript).toContain('function responsiveConfigTarget(node)')
    expect(bridgeScript).toContain('node.closest(\'.richtext[class*="aem-GridColumn"]\')')
    expect(bridgeScript).toContain('node.classList.contains(\'brandcardComponent\')')
    expect(bridgeScript).toContain('node.querySelector(\'.brandcard-holder\')')
    expect(bridgeScript).toContain('var target = responsiveConfigTarget(node)')
    expect(bridgeScript).toContain('function responsiveSpacingDeclaration(prop, config)')
    expect(bridgeScript).toContain('function responsiveBackgroundDeclaration(element)')
    expect(bridgeScript).toContain('data-clone-studio-responsive-config-id')
    expect(bridgeScript).toContain('data-clone-studio-responsive-config-style')
    expect(bridgeScript).toContain(',.aem-Grid [data-clone-studio-responsive-config-id="')
    expect(bridgeScript).toContain('style.textContent = \'@media (max-width: 1023.98px){\' + rules.join(\'\') + \'}\'')
    expect(bridgeScript).toContain('installResponsiveConfigRules()')
  })

  it('keeps unpaired desktop-only text visible on mobile while preserving paired content variants', () => {
    const html = buildCloneStudioHtml({
      rendered: `
        <main>
          <div class="cmp-richtext">
            <div class="onlydesktop"><h3>The roar of a true sports car</h3><p>5.0L V8</p></div>
          </div>
          <div class="cmp-richtext">
            <div class="onlydesktop"><p>Desktop copy</p></div>
            <div class="onlymobile"><p>Mobile copy</p></div>
          </div>
        </main>
      `,
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('[data-clone-studio-responsive-content-variant="desktop"]')
    expect(head).toContain('[data-clone-studio-responsive-content-variant="mobile"]')
    expect(head).toMatch(/responsive-content-variant="desktop"\]:not\(\[data-clone-studio-responsive-content-paired="true"\]\)[\s\S]*display:\s*block\s*!important/i)
    expect(head).toMatch(/responsive-content-variant="desktop"\]\[data-clone-studio-responsive-content-paired="true"\][\s\S]*display:\s*none\s*!important/i)
    expect(head).toMatch(/responsive-content-variant="desktop"\]:not\(\[data-clone-studio-responsive-content-paired="true"\]\)\[class\*="display1-medium"\][\s\S]*font-size:\s*1\.75rem\s*!important/i)
    expect(head).toMatch(/responsive-content-variant="desktop"\]:not\(\[data-clone-studio-responsive-content-paired="true"\]\)[\s\S]*\[class\*="display2-medium"\][\s\S]*font-size:\s*2\.125rem\s*!important/i)
    expect(head).toMatch(/responsive-content-variant="desktop"\]:not\(\[data-clone-studio-responsive-content-paired="true"\]\)[\s\S]*h3 \[class\*="display3-medium"\][\s\S]*font-size:\s*1\.75rem\s*!important/i)
    expect(head).toMatch(/p\[data-clone-studio-responsive-content-variant="desktop"\]:not\(\[data-clone-studio-responsive-content-paired="true"\]\)\[class\*="heading3-medium"\][\s\S]*font-size:\s*1rem\s*!important/i)
    expect(head).toMatch(/responsive-content-variant="desktop"\]:not\(\[data-clone-studio-responsive-content-paired="true"\]\)[\s\S]*h2 \[class\*="heading1-medium"\][\s\S]*font-size:\s*1\.5rem\s*!important/i)
    expect(head).toMatch(/responsive-content-variant="desktop"\]:not\(\[data-clone-studio-responsive-content-paired="true"\]\)[\s\S]*\[class\*="heading1-medium"\][\s\S]*font-size:\s*1\.5rem\s*!important/i)
    expect(head).toMatch(/responsive-content-variant="desktop"\]:not\(\[data-clone-studio-responsive-content-paired="true"\]\)[\s\S]*\[class\*="body1-regular"\][\s\S]*font-size:\s*0\.875rem\s*!important/i)

    const bridgeScript = extractBridgeScript(html)
    expect(bridgeScript).toContain('function markResponsiveContentVariants()')
    expect(bridgeScript).toContain('function isResponsiveDesktopContent(node)')
    expect(bridgeScript).toContain('function isResponsiveMobileContent(node)')
    expect(bridgeScript).toContain('function markResponsiveContentPairInContainer(container)')
    expect(bridgeScript).toContain('data-clone-studio-responsive-content-variant')
    expect(bridgeScript).toContain('data-clone-studio-responsive-content-paired')
    expect(bridgeScript).toContain('markResponsiveContentVariants()')
  })

  it('reveals common scroll-animation classes left transparent when OEM scripts are stripped', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><div class="txt fadeInUp animated" style="opacity: 0">Sportage feature copy</div></main>',
      title: 'Sportage',
      baseHref: 'https://www.kia.com/au/cars/sportage/',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('.animated,')
    expect(head).toContain('[class*="fadeIn"]')
    expect(head).toMatch(/opacity:\s*1\s*!important/i)
    expect(head).toMatch(/visibility:\s*visible\s*!important/i)
  })

  it('uses desktop images on desktop and mobile images on mobile when a pair exists', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><picture><img class="imgdesktop dsktoponly" src="/media/pages/assets/ford-au/mustang/hero.webp"><img class="imgmobile mobonly" src="/media/pages/assets/ford-au/mustang/hero-mobile.webp"></picture></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toMatch(/img\.imgdesktop[\s\S]*display:\s*block\s*!important/i)
    expect(head).toMatch(/img\.imgmobile[\s\S]*display:\s*none\s*!important/i)
    expect(head).toContain('[data-clone-studio-responsive-variant="desktop"][data-clone-studio-responsive-paired="true"]')
    expect(head).toMatch(/@media \(max-width:\s*1023\.98px\)[\s\S]*img\.imgmobile[\s\S]*display:\s*block\s*!important/i)
    expect(head).toMatch(/@media \(max-width:\s*1023\.98px\)[\s\S]*data-clone-studio-responsive-variant="desktop"[\s\S]*display:\s*none\s*!important/i)
    expect(head).toContain('dsktoponly')
    expect(head).toContain('mobonly')

    const bridgeScript = extractBridgeScript(html)
    expect(bridgeScript).toContain('function markResponsiveImageVariants()')
    expect(bridgeScript).toContain('function isLocalResponsivePairContainer(container)')
    expect(bridgeScript).toContain('data-clone-studio-responsive-variant')
    expect(bridgeScript).toContain('data-clone-studio-responsive-paired')
    expect(bridgeScript).toContain('markResponsiveImageVariants()')
    expect(bridgeScript).toContain('querySelectorAll(\'img, source\'')
    expect(bridgeScript).not.toContain('.hero, section, div')
  })

  it('recovers a missing Ford AEM mobile hero image from source metadata', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><picture><img class="imgdesktop" src="/media/pages/assets/ford-au/mustang/overview-hero-banner-desktop-new.webp" data-image-url="/content/dam/Ford/au/nameplate/mustang/overview/billboards/overview-hero-banner-desktop-new.webp" alt="Mustang"></picture></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    const bridgeScript = extractBridgeScript(html)
    expect(bridgeScript).toContain('var BASE_HREF = "https://www.ford.com.au/showroom/cars/mustang/"')
    expect(bridgeScript).toContain('var MEDIA_BASE = "https://oem-agent.adme-dev.workers.dev"')
    expect(bridgeScript).toContain('function recoverMissingResponsiveImagePairs()')
    expect(bridgeScript).toContain('source.replace(/-desktop-new')
    expect(bridgeScript).toContain('-new-mbl$1$2')
    expect(bridgeScript).toContain('addResponsiveImageCandidate(candidates, source)')
    expect(bridgeScript).toContain('return \'ford-au\'')
    expect(bridgeScript).toContain('MEDIA_BASE + \'/media/\' + oemId + \'/\' + encoded')
    expect(bridgeScript).toContain('recoverMissingResponsiveImagePairs()')

    const body = extractInitialBody(html)
    expect(body).toContain('overview-hero-banner-desktop-new.webp')
    expect(body).not.toContain('overview-hero-banner-new-mbl.webp')
  })

  it('strips preview-only responsive image markers from serialized saved HTML', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><img data-clone-studio-responsive-variant="desktop" data-clone-studio-responsive-paired="true" data-clone-studio-responsive-recovering="true" data-clone-studio-generated-responsive-image="true" class="imgdesktop" src="/hero.webp"></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      selectedRegionId: null,
    })

    const bridgeScript = extractBridgeScript(html)
    expect(bridgeScript).toContain('function stripResponsiveVariantMarkers(root)')
    expect(bridgeScript).toContain('function stripResponsiveContentMarkers(root)')
    expect(bridgeScript).toContain('function stripResponsiveConfigMarkers(root)')
    expect(bridgeScript).toContain('stripResponsiveVariantMarkers(clone)')
    expect(bridgeScript).toContain('stripResponsiveContentMarkers(clone)')
    expect(bridgeScript).toContain('stripResponsiveConfigMarkers(clone)')
    expect(bridgeScript).toContain('data-clone-studio-generated-responsive-image')
    expect(bridgeScript).toContain('removeAttribute(\'data-clone-studio-responsive-recovering\')')
  })

  it('leaves absolute media URLs and non-proxied relative paths untouched', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><img src="https://cdn.ford.com.au/media/x.webp"></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    expect(html).toContain('src="https://cdn.ford.com.au/media/x.webp"')
    expect(html).not.toContain('oem-agent.adme-dev.workers.dev/media/x.webp')
  })

  it('removes legacy image placeholders that point at the captured source document', () => {
    const html = buildCloneStudioHtml({
      rendered: `
        <main>
          <img class="subaru-placeholder" src="https://www.subaru.com.au/brz/2026" alt="BRZ Coupe tS Manual">
          <img class="subaru-relative-placeholder" src="/brz/2026">
          <img class="subaru-recoverable" src="https://www.subaru.com.au/brz/2026" data-src="/media/pages/assets/subaru-au/brz/coupe.webp">
          <img class="subaru-real" src="/media/pages/assets/subaru-au/brz/hero.webp">
        </main>
      `,
      title: 'BRZ',
      baseHref: 'https://www.subaru.com.au/brz/2026',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })
    const body = extractInitialBody(html)

    expect(body).not.toContain('subaru-placeholder')
    expect(body).not.toContain('subaru-relative-placeholder')
    expect(body).toContain('subaru-recoverable')
    expect(body).toContain('subaru-real')
    expect(body).toContain('https://oem-agent.adme-dev.workers.dev/media/pages/assets/subaru-au/brz/hero.webp')
  })

  it('removes empty lazy image placeholders that resolve to the source document URL', () => {
    const html = buildCloneStudioHtml({
      rendered: `
        <main>
          <img class="vw-empty-placeholder lazyload" src="" alt="">
          <img class="vw-real" src="/media/pages/assets/volkswagen-au/amarok/hero.webp" alt="Amarok">
        </main>
      `,
      title: 'Amarok',
      baseHref: 'https://www.volkswagen.com.au/en/models/amarok.html',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })
    const body = extractInitialBody(html)

    expect(body).not.toContain('vw-empty-placeholder')
    expect(body).toContain('vw-real')
    expect(body).toContain('https://oem-agent.adme-dev.workers.dev/media/pages/assets/volkswagen-au/amarok/hero.webp')
  })

  it('removes same-origin model-year document routes when the stored source URL lacks the year segment', () => {
    const html = buildCloneStudioHtml({
      rendered: `
        <main>
          <img class="subaru-year-placeholder" src="https://www.subaru.com.au/brz/2026" alt="BRZ tS">
          <img class="subaru-extensionless-query-image" src="https://www.subaru.com.au/brz/asset?id=hero">
          <img class="subaru-extension-image" src="https://www.subaru.com.au/brz/2026/hero.webp">
        </main>
      `,
      title: 'BRZ',
      baseHref: 'https://www.subaru.com.au/brz',
      selectedRegionId: null,
    })
    const body = extractInitialBody(html)

    expect(body).not.toContain('subaru-year-placeholder')
    expect(body).toContain('subaru-extensionless-query-image')
    expect(body).toContain('subaru-extension-image')
  })

  it('restores preview link scaffolding before posting saved body HTML', () => {
    const html = stripCloneStudioScaffoldingForTest(
      '<main><a href="#oem-preview-disabled" data-oem-preview-href="/showroom" data-oem-preview-link="true" data-oem-preview-onclick="track(&quot;cta&quot;)" onclick="return false">Compare</a></main>',
    )

    expect(html).toContain('href="/showroom"')
    expect(html).toContain('onclick="track(&quot;cta&quot;)"')
    expect(html).not.toContain('href="#oem-preview-disabled"')
    expect(html).not.toContain('data-oem-preview-link')
    expect(html).not.toContain('data-oem-preview-href')
    expect(html).not.toContain('data-oem-preview-onclick')
    expect(html).not.toContain('onclick="return false"')
  })

  it('serializes saved body HTML without preview scaffolding or unsafe attributes', () => {
    const html = serializeCloneStudioBodyForTest(
      '<main><a href="#oem-preview-disabled" data-oem-preview-href="/showroom" data-oem-preview-link="true" data-oem-preview-onclick="track(&quot;cta&quot;)" onclick="return false">Compare</a><img src=javascript:alert(1) onerror=alert(2)></main>',
    )

    expect(html).toContain('href="/showroom"')
    expect(html).not.toContain('data-oem-preview-link')
    expect(html).not.toContain('data-oem-preview-href')
    expect(html).not.toContain('data-oem-preview-onclick')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })

  it('sanitizes initial rendered HTML before inserting it into the iframe body', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main onclick="alert(1)"><a href="/showroom">Compare</a><script>alert(2)</script><iframe srcdoc="<script>alert(3)</script>"></iframe><object data="javascript:alert(4)"></object><embed src="javascript:alert(5)"><base href="https://evil.test"><meta http-equiv="refresh" content="0;url=javascript:alert(6)"></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const body = extractInitialBody(html)

    expect(body).toContain('data-oem-preview-link="true"')
    expect(body).not.toContain('<script')
    expect(body).not.toContain('<iframe')
    expect(body).not.toContain('<object')
    expect(body).not.toContain('<embed')
    expect(body).not.toContain('<base')
    expect(body).not.toContain('<meta')
    expect(body).not.toContain('onclick')
    expect(body).not.toContain('srcdoc')
    expect(body).not.toContain('javascript:')
  })

  it('keeps trusted video iframes while removing non-video iframe payload', () => {
    const html = sanitizeCloneStudioHtmlForTest(
      '<main><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="video"></iframe><iframe srcdoc="<script>alert(1)</script>"></iframe><iframe src="/safe/frame"></iframe></main>',
    )

    expect(html).toContain('<iframe')
    expect(html).toContain('youtube.com/embed')
    expect(html).not.toContain('src="/safe/frame"')
    expect(html).not.toContain('srcdoc')
    expect(html).not.toContain('script')
  })

  it('sanitizes extracted head link and style fragments before inserting srcdoc head', () => {
    const html = buildCloneStudioHtml({
      rendered: '<link rel="stylesheet" href="javascript:alert(1)" onload="alert(2)"><link rel="modulepreload" href="/app.js"><link rel="preload" as="script" href="/app.js"><style onload="alert(3)">@import url("https://evil.test/a.css"); .hero { background: url(data:image/svg+xml;base64,abc); color: red; behavior: expression(alert(4)); }</style><main>Mustang</main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const head = extractDocumentHead(html)

    expect(head).not.toContain('onload')
    expect(head).not.toContain('javascript:')
    expect(head).not.toContain('modulepreload')
    expect(head).not.toContain('as="script"')
    expect(head).not.toContain('@import')
    expect(head).not.toContain('data:image/svg')
    expect(head).not.toContain('expression(')
    expect(head).toContain('color: red')
  })

  it('drops stale generated Clone Studio bridge styles from saved clone heads', () => {
    const html = buildCloneStudioHtml({
      rendered: '<style>.stale-clone-bridge { color: red; } [data-clone-studio-responsive-content-variant="desktop"] { display: block; }</style><style>.oem-style { color: blue; }</style><main><p>Mustang</p></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const head = extractDocumentHead(html)

    expect(head).toContain('data-clone-studio-bridge-style="2026-07-03-empty-feature-app-v1"')
    expect(head).toContain('p[class*="heading3-medium"]')
    expect(head).toContain('.oem-style')
    expect(head).not.toContain('.stale-clone-bridge')
  })

  it('sanitizes escaped CSS bypasses in extracted head styles', () => {
    const html = buildCloneStudioHtml({
      rendered: '<style>@\\69mport url("/evil.css"); .hero { color: blue; width: e\\78pression(alert(1)); background: url(ja\\76ascript:alert(2)); mask-image: url(data:image/s\\76g+xml;base64,abc); }</style><main>Mustang</main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const head = extractDocumentHead(html)

    expect(head).not.toContain('@import')
    expect(head).not.toContain('@\\69mport')
    expect(head).not.toContain('expression(')
    expect(head).not.toContain('e\\78pression')
    expect(head).not.toContain('javascript:')
    expect(head).not.toContain('ja\\76ascript')
    expect(head).not.toContain('data:image/svg')
    expect(head).not.toContain('data:image/s\\76g')
    expect(head).toContain('color: blue')
  })

  it('neutralizes escaped style-tag breakouts in extracted head styles', () => {
    const html = buildCloneStudioHtml({
      rendered: '<style>.hero { color: purple; } .hero::before { content: "\\3c/style\\3e<script>alert(1)</script>"; }</style><main>Mustang</main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const head = extractDocumentHead(html)

    expect(head).not.toContain('</style><script')
    expect(head).not.toContain('<script>alert')
    expect(head).not.toContain('</style&gt;&lt;script')
    expect(head).toContain('\\3C')
    expect(head).toContain('color: purple')
  })

  it('preserves safe CSS child combinators in extracted head styles', () => {
    const html = buildCloneStudioHtml({
      rendered: '<style>.vw-grid > * { grid-column: full; } .vw-grid [data-layout-type="text"] > p { color: blue; }</style><main>Amarok</main>',
      title: 'Amarok',
      baseHref: 'https://www.volkswagen.com.au/en/models/amarok.html',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const head = extractDocumentHead(html)

    expect(head).toContain('.vw-grid > *')
    expect(head).toContain('[data-layout-type="text"] > p')
    expect(head).not.toContain('\\3E')
  })

  it('preserves safe extracted head stylesheet links and CSS', () => {
    const html = buildCloneStudioHtml({
      rendered: '<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen"><link rel="preconnect" href="https://fonts.example.test" crossorigin="anonymous"><link rel="preload" as="font" href="/fonts/oem.woff2" type="font/woff2"><style>.hero { background-image: url(/images/mustang.png); color: #111; }</style><main>Mustang</main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const head = extractDocumentHead(html)

    expect(head).toContain('<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen">')
    expect(head).toContain('<link rel="preconnect" href="https://fonts.example.test" crossorigin="anonymous">')
    expect(head).toContain('<link rel="preload" href="/fonts/oem.woff2" as="font" type="font/woff2">')
    expect(head).toContain('background-image: url("/images/mustang.png")')
    expect(head).toContain('color: #111')
  })

  it('includes bridge token handling and parent-source guard', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main data-oem-region-id="r1"><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: 'r1',
      bridgeToken: 'test-token',
    })

    expect(html).toContain('var BRIDGE_TOKEN = "test-token"')
    expect(html).toContain('bridgeToken: BRIDGE_TOKEN')
    expect(html).toContain('event.source !== window.parent')
    expect(html).toContain('message.bridgeToken !== BRIDGE_TOKEN')
    expect(html).toContain('clone-studio:select')
  })

  it('emits clone region payload extraction with editable fields', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><h1>Mustang</h1><a href="/showroom">Compare</a><img src="/car.png" alt="Mustang"></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const bridgeScript = extractBridgeScript(html)

    expect(bridgeScript).toContain('function candidateFrom(eventTarget)')
    expect(bridgeScript).toContain('function regionPayload(element)')
    expect(bridgeScript).toContain('function extractFields(element)')
    expect(bridgeScript).toContain('clone-region-')
    expect(bridgeScript).toContain('editable_fields')
    expect(bridgeScript).toContain('region: regionPayload(selectedRegion)')
    expect(bridgeScript).toContain('kind: \'text\'')
    expect(bridgeScript).toContain('kind: \'image\'')
    expect(bridgeScript).toContain('kind: \'link\'')
    expect(bridgeScript).toContain('kind: \'button\'')
    expect(bridgeScript).toContain('kind: \'visibility\'')
    expect(bridgeScript).toContain('getBoundingClientRect')
    expect(bridgeScript).toContain('viewport_left: rect.left || 0')
    expect(bridgeScript).toContain('viewport_top: rect.top || 0')
    expect(bridgeScript).toContain('left: (rect.left || 0) + (window.scrollX || 0)')
    expect(bridgeScript).toContain('width: rect.width || 0')
    expect(bridgeScript).toContain('computed_snapshots')
    expect(bridgeScript).toContain('root: root')
  })

  it('uses message.html for html patch-field messages', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main data-oem-region-id="r1"><p>Mustang</p></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const bridgeScript = extractBridgeScript(html)

    expect(bridgeScript).toContain('target.innerHTML = sanitizeHtml(message.html != null ? message.html : value == null ? \'\' : value)')
  })

  it('scrolls parent-selected regions into view', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main data-oem-region-id="r1"><p>Mustang</p></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const bridgeScript = extractBridgeScript(html)

    expect(bridgeScript).toContain('scrollIntoView({ behavior: \'smooth\', block: \'center\' })')
    expect(bridgeScript).toContain('selectRegion(targetRegion, true, true)')
  })

  it('sanitizes unsafe javascript URLs for clone patches', () => {
    expect(sanitizeCloneStudioUrlForTest('javascript:alert(1)', 'link')).toBe('')
    expect(sanitizeCloneStudioUrlForTest('https://example.test/image.jpg', 'media')).toBe('https://example.test/image.jpg')
    expect(sanitizeCloneStudioUrlForTest('/showroom', 'link')).toBe('/showroom')
    expect(sanitizeCloneStudioUrlForTest('#features', 'link')).toBe('#features')
    expect(sanitizeCloneStudioUrlForTest('data:image/png;base64,abc', 'media')).toBe('data:image/png;base64,abc')
  })

  it('sanitizes unsafe HTML patches', () => {
    const html = sanitizeCloneStudioHtmlForTest(
      '<div onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)" onmouseover="alert(2)">Go</a><img src="javascript:alert(3)" onerror="alert(4)"></div>',
    )

    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onmouseover')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href=""')
    expect(html).toContain('src=""')
  })

  it('sanitizes unquoted unsafe URL and style attributes in HTML patches', () => {
    const html = sanitizeCloneStudioHtmlForTest(
      '<a href=javascript:alert(1)>Go</a><img src=javascript:alert(2) srcset=javascript:alert(3)><div style=background:url(javascript:alert(4))></div>',
    )

    expect(html).not.toContain('javascript:')
    expect(html).toContain('href=""')
    expect(html).toContain('src=""')
    expect(html).toContain('srcset=""')
  })

  it('sanitizes escaped CSS bypasses in inline style patches', () => {
    const html = sanitizeCloneStudioHtmlForTest(
      '<div style="color: green; width:e\\78pression(alert(1)); background:url(ja\\76ascript:alert(2)); border-image:url(data:image/s\\76g+xml;base64,abc)"></div>',
    )

    expect(html).not.toContain('expression(')
    expect(html).not.toContain('e\\78pression')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('ja\\76ascript')
    expect(html).not.toContain('data:image/svg')
    expect(html).not.toContain('data:image/s\\76g')
    expect(html).toContain('color: green')
  })

  it('removes dangerous patch elements and navigation-capable attributes', () => {
    const html = sanitizeCloneStudioHtmlForTest(
      '<form action=/lead><button formaction=javascript:alert(1)>Send</button></form><iframe srcdoc="<script>alert(2)</script>"></iframe><object data=javascript:alert(3)></object><embed src=javascript:alert(4)><base href=https://evil.test><meta http-equiv=refresh content="0;url=javascript:alert(5)"><link rel=modulepreload href=javascript:alert(6)><blockquote cite=javascript:alert(7)>Quote</blockquote>',
    )

    expect(html).toContain('formaction=""')
    expect(html).toContain('cite=""')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<object')
    expect(html).not.toContain('<embed')
    expect(html).not.toContain('<base')
    expect(html).not.toContain('<meta')
    expect(html).not.toContain('<link')
    expect(html).not.toContain('srcdoc')
    expect(html).not.toContain('javascript:')
  })

  it('applies context-specific URL policy for link and media patches', () => {
    expect(sanitizeCloneStudioUrlForTest('data:image/png;base64,abc', 'link')).toBe('')
    expect(sanitizeCloneStudioUrlForTest('data:image/png;base64,abc', 'media')).toBe('data:image/png;base64,abc')
    expect(sanitizeCloneStudioUrlForTest('data:image/jpeg;base64,abc', 'media')).toBe('data:image/jpeg;base64,abc')
    expect(sanitizeCloneStudioUrlForTest('data:image/svg+xml;base64,abc', 'media')).toBe('')
    expect(sanitizeCloneStudioUrlForTest('//example.test/image.jpg', 'media')).toBe('')
  })

  it('blocks navigation-capable interaction events in the bridge', () => {
    const html = buildCloneStudioHtml({
      rendered: '<form action="/lead"><button type="submit">Submit</button></form>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    expect(html).toContain('document.addEventListener(\'submit\'')
    expect(html).toContain('\'auxclick\'')
    expect(html).toContain('\'dblclick\'')
    expect(html).toContain('isNavigationElement')
    expect(html).toContain('stopBlockedEvent')
    expect(html).toContain('stopImmediatePropagation')
    expect(html).toContain('isMediaInteractionElement')
    expect(html).toContain('[data-video]')
    expect(html).toContain('[data-media][data-source-id]')
    expect(html).toContain('.play-video')
  })

  it('suppresses default behavior and propagation for blocked events', () => {
    const calls: string[] = []

    stopCloneStudioBlockedEventForTest({
      preventDefault: () => calls.push('preventDefault'),
      stopPropagation: () => calls.push('stopPropagation'),
      stopImmediatePropagation: () => calls.push('stopImmediatePropagation'),
    })

    expect(calls).toEqual(['preventDefault', 'stopPropagation', 'stopImmediatePropagation'])
  })

  it('emits parseable clone studio bridge script', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main data-oem-region-id="r1"><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: 'r1',
      bridgeToken: 'test-token',
    })
    const bridgeScript = html.match(/<script data-clone-studio-bridge="true">([\s\S]*?)<\/script>/)?.[1]

    expect(bridgeScript).toBeTruthy()
    if (!bridgeScript)
      throw new Error('Clone Studio bridge script was not emitted')
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('bridge wires a contextmenu listener that posts clone-studio:context-menu', () => {
    const html = buildCloneStudioHtml({ rendered: '<main><section class="hero"><h1>X</h1></section></main>', title: 't', baseHref: '/', mediaBase: '/', stylesheetUrls: [], selectedRegionId: null, bridgeToken: 'tok' })
    expect(html).toContain('addEventListener(\'contextmenu\'')
    expect(html).toContain('clone-studio:context-menu')
  })

  it('bridge enables contenteditable on a begin-edit message and commits text', () => {
    const html = buildCloneStudioHtml({ rendered: '<main><section class="hero"><h1>X</h1></section></main>', title: 't', baseHref: '/', mediaBase: '/', stylesheetUrls: [], selectedRegionId: null, bridgeToken: 'tok' })
    expect(html).toContain('clone-studio:begin-edit')
    expect(html).toContain('setAttribute(\'contenteditable\'')
  })

  it('applies a height_override as max-height + overflow on the region', () => {
    const html = buildCloneStudioHtml({ rendered: '<main><section class="hero"><h1>X</h1></section></main>', title: 't', baseHref: '/', mediaBase: '/', stylesheetUrls: [], selectedRegionId: null, bridgeToken: 'tok', regionOverrides: [{ id: 'r1', height_override: 320 }] })
    expect(html).toContain('clone-studio:set-height')
  })

  it('classifies a tablist region with type_hint=tabs and supports panel switching', () => {
    const html = buildCloneStudioHtml({ rendered: '<main><div class="tabs" role="tablist"><div role="tabpanel">A</div><div role="tabpanel" hidden>B</div></div></main>', title: 't', baseHref: '/', mediaBase: '/', stylesheetUrls: [], selectedRegionId: null, bridgeToken: 'tok' })
    expect(html).toContain('clone-studio:switch-panel')
  })

  it('commits inline edits by posting dom-updated (not patch-field) upward', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok' })
    const bridgeScript = extractBridgeScript(html)

    // finishInlineEdit commit path must post dom-updated so the parent persists the edit.
    expect(bridgeScript).toContain('function finishInlineEdit(commit)')
    const commitBlock = bridgeScript.slice(bridgeScript.indexOf('function finishInlineEdit(commit)'))
    expect(commitBlock).toContain('post(MESSAGE_DOM_UPDATED, {')
    expect(commitBlock).toContain('region: regionPayload(edit.el)')
    // It must NOT post the unhandled patch-field upward from the commit path.
    expect(commitBlock).not.toContain('post(MESSAGE_PATCH_FIELD')
  })

  it('returns refreshed region payloads after quick clone patches', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok' })
    const bridgeScript = extractBridgeScript(html)

    expect(bridgeScript).toContain('var patchedRegionId = message.regionId || message.selectedRegionId || null')
    expect(bridgeScript).toContain('var patchedRegion = findRegionById(patchedRegionId)')
    expect(bridgeScript).toContain('post(MESSAGE_DOM_UPDATED, { regionId: patchedRegionId, region: regionPayload(patchedRegion) })')
    expect(bridgeScript).toContain('var heightRegion = findRegionById(heightRegionId)')
    expect(bridgeScript).toContain('post(MESSAGE_DOM_UPDATED, { regionId: heightRegionId, region: regionPayload(heightRegion) })')
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('patchField handles alt and background kinds without clobbering text', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><img src="/a.png" alt="old"></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok' })
    const bridgeScript = extractBridgeScript(html)

    // alt branch: set the img alt attribute, never textContent.
    expect(bridgeScript).toContain('kind === \'alt\'')
    expect(bridgeScript).toContain('setAttribute(\'alt\'')
    // background branch: set backgroundColor on the region container, guarded by a colour check.
    expect(bridgeScript).toContain('kind === \'background\'')
    expect(bridgeScript).toContain('backgroundColor')
    expect(bridgeScript).toContain('isPlausibleCssColor')
  })

  it('patchField handles whitelisted text style kinds without accepting arbitrary CSS', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok' })
    const bridgeScript = extractBridgeScript(html)

    expect(bridgeScript).toContain('function patchTextStyle(target, message)')
    expect(bridgeScript).toContain('kind === \'style\'')
    expect(bridgeScript).toContain('property === \'text-align\'')
    expect(bridgeScript).toContain('property === \'font-weight\'')
    expect(bridgeScript).toContain('property === \'color\'')
    expect(bridgeScript).toContain('target.style.color = value')
    expect(bridgeScript).toContain('if (!isPlausibleCssColor(value))')
    expect(bridgeScript).toContain('target.style.textAlign = value')
    expect(bridgeScript).toContain('target.style.fontWeight = value')
    expect(bridgeScript).not.toContain('setProperty(property')
  })

  it('locks the bridge read-only when built with editable:false', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok', editable: false })

    // The editable flag is injected like selectedRegion, and the bridge reads it into EDITABLE.
    expect(html).toContain('window.__CLONE_STUDIO_EDITABLE__ = false')
    const bridgeScript = extractBridgeScript(html)
    expect(bridgeScript).toContain('var EDITABLE = window.__CLONE_STUDIO_EDITABLE__ !== false')
    // dblclick inline edit and context-menu emit are guarded by EDITABLE.
    expect(bridgeScript).toContain('if (EDITABLE && event.type === \'dblclick\')')
    expect(bridgeScript).toContain('if (!EDITABLE)')
    // Still parses as valid JS.
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('wires trusted click-navigation for tabs/carousels/accordions/galleries/dropdowns only in read-only preview', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok', editable: false })
    const bridgeScript = extractBridgeScript(html)

    // The interactivity layer is defined and invoked, guarded by !EDITABLE.
    expect(bridgeScript).toContain('function enableInteractivity()')
    expect(bridgeScript).toContain('if (!EDITABLE)')
    // It uses the existing panel-switching primitive (not OEM scripts) to navigate.
    const interactivityBlock = bridgeScript.slice(bridgeScript.indexOf('function enableInteractivity()'))
    expect(interactivityBlock).toContain('switchPanel')
    expect(interactivityBlock).toContain('classifyRegion')
    expect(interactivityBlock).toContain('ensureRegionId')
    // Tab triggers: role=tab / aria-controls / tablist children are detected and click-wired.
    expect(interactivityBlock).toContain('[role="tab"]')
    expect(interactivityBlock).toContain('aria-controls')
    expect(interactivityBlock).toContain('[data-bs-toggle="tab"]')
    expect(interactivityBlock).toContain('[data-tab-target]')
    expect(interactivityBlock).toContain('function switchTabPanel(regionId, regionEl, trigger, index)')
    expect(interactivityBlock).toContain('function tabTargetPanel(regionEl, trigger)')
    expect(interactivityBlock).toContain('function findTabPanelByTarget(regionEl, value)')
    expect(interactivityBlock).toContain('document.getElementById(id)')
    expect(interactivityBlock).toContain('data-tab-panel')
    expect(interactivityBlock).toContain('addEventListener(\'click\'')
    // Carousel next/prev controls are detected.
    expect(interactivityBlock).toContain('swiper-button-next')
    expect(interactivityBlock).toContain('swiper-button-prev')
    expect(interactivityBlock).toContain('slick-next')
    expect(interactivityBlock).toContain('slick-prev')
    expect(interactivityBlock).toContain('brand-next')
    expect(interactivityBlock).toContain('brand-previous')
    expect(bridgeScript).toContain('function switchCarouselPanels(regionId, regionEl, index)')
    expect(bridgeScript).toContain('function initializeCarouselWindowSize(regionEl)')
    expect(bridgeScript).toContain('data-clone-studio-carousel-window-size')
    expect(bridgeScript).toContain('isMobileCarouselViewport')
    expect(bridgeScript).toContain('window.matchMedia(\'(max-width: 1023.98px)\')')
    // Gallery thumbnail controls are detected and swap the main image without OEM scripts.
    expect(interactivityBlock).toContain('[data-gallery]')
    expect(interactivityBlock).toContain('[data-thumbnail]')
    expect(interactivityBlock).toContain('function wireGalleryRegion(regionId, regionEl)')
    expect(interactivityBlock).toContain('function switchGalleryImage(regionEl, control)')
    expect(interactivityBlock).toContain('function setMainGalleryImage(main, url, thumb)')
    expect(interactivityBlock).toContain('main.setAttribute(\'src\', url)')
    expect(interactivityBlock).toContain('sources[i].setAttribute(\'srcset\', url)')
    expect(interactivityBlock).toContain('function setGalleryActiveState(items, activeControl)')
    // Dropdown/disclosure controls are detected, skip header/nav chrome, and toggle hidden panels.
    expect(interactivityBlock).toContain('[data-dropdown]')
    expect(interactivityBlock).toContain('[aria-haspopup]')
    expect(interactivityBlock).toContain('[data-bs-toggle="dropdown"]')
    expect(interactivityBlock).toContain('function wireDropdownRegion(regionId, regionEl)')
    expect(interactivityBlock).toContain('function toggleDropdownPanel(regionEl, trigger)')
    expect(interactivityBlock).toContain('function isPageChromeInteractivityRegion(element)')
    expect(interactivityBlock).toContain('element.closest(\'header, nav, [role="navigation"]\')')
    expect(interactivityBlock).toContain('panel.setAttribute(\'hidden\', \'hidden\')')
    expect(interactivityBlock).toContain('panel.style.display = \'none\'')
    // Accordion disclosures are detected and click-wired without relying on stripped OEM scripts.
    expect(interactivityBlock).toContain('[data-cmp-is="accordion"]')
    expect(interactivityBlock).toContain('function wireAccordionRegion(regionId, regionEl)')
    expect(interactivityBlock).toContain('function toggleAccordionPanel(regionEl, trigger)')
    expect(interactivityBlock).toContain('.cmp-accordion__button')
    expect(interactivityBlock).toContain('.accordion-button')
    expect(interactivityBlock).toContain('aria-expanded')
    expect(interactivityBlock).toContain('panel.setAttribute(\'hidden\', \'hidden\')')
    expect(interactivityBlock).toContain('panel.style.display = \'none\'')
    expect(interactivityBlock).toContain('if (kind === \'accordion\')')
    // Clicks must not navigate or trigger region-select.
    expect(interactivityBlock).toContain('preventDefault')
    expect(interactivityBlock).toContain('stopImmediatePropagation')
    expect(bridgeScript).toContain('data-clone-studio-interactive-control')
    expect(bridgeScript).toContain('[data-clone-studio-bridge], [data-clone-studio-interactive-control], [data-clone-tab], [data-clone-acc-trigger], [data-clone-prev], [data-clone-next], [data-clone-gallery-thumb]')
    // Read-only build still parses.
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('exempts compiler-stamped Alpine clone-runtime triggers from the document click-navigation guard', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok', editable: false })
    const bridgeScript = extractBridgeScript(html)

    // Alpine's cloneTabs/cloneAccordion/cloneCarousel/cloneGallery bind x-on:click directly on
    // data-clone-tab / data-clone-acc-trigger / data-clone-prev / data-clone-next /
    // data-clone-gallery-thumb (see clone-annotator.ts) — none of those carry
    // data-clone-studio-bridge or -interactive-control. Without this exemption, the document-level
    // capture-phase click guard (handleNavigationEvent) calls stopImmediatePropagation() on every
    // click before Alpine's own bubble-phase listener ever runs, so a stamped tab/accordion/carousel/
    // gallery trigger would silently never respond to clicks in the read-only preview.
    const isBridgeOwnedTargetBlock = bridgeScript.slice(
      bridgeScript.indexOf('function isBridgeOwnedTarget(target)'),
      bridgeScript.indexOf('function handleNavigationEvent('),
    )
    expect(isBridgeOwnedTargetBlock).toContain('[data-clone-tab]')
    expect(isBridgeOwnedTargetBlock).toContain('[data-clone-acc-trigger]')
    expect(isBridgeOwnedTargetBlock).toContain('[data-clone-prev]')
    expect(isBridgeOwnedTargetBlock).toContain('[data-clone-next]')
    expect(isBridgeOwnedTargetBlock).toContain('[data-clone-gallery-thumb]')
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('never lets the legacy heuristic shim adopt a region that a compiler-stamped clone-interaction region wraps or is wrapped by', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok', editable: false })
    const bridgeScript = extractBridgeScript(html)

    // Some OEM markup (e.g. a broad AEM "EditableComponent__..." wrapper — note "tab" is a literal
    // substring of "Editable", a real false-positive against the [class*="tab"] heuristic below)
    // wraps a compiler-stamped clone-interaction region as a descendant rather than an ancestor. The
    // closest()-only guard only catches the ancestor-or-self direction; classifyRegion()/collectPanels()
    // then search the WHOLE candidate subtree and can pick up (and double-drive) an already
    // Alpine-owned nested region's own triggers/panels. Guard both directions.
    const loopBody = bridgeScript.slice(
      bridgeScript.indexOf('function enableInteractivity()'),
      bridgeScript.indexOf('function wireRegion('),
    )
    expect(loopBody).toContain('candidates[i].closest(\'[data-clone-interaction]\')')
    expect(loopBody).toContain('candidates[i].querySelector(\'[data-clone-interaction]\')')
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('supports Ford/Slick multi-card carousel windows without Alpine', () => {
    const html = buildCloneStudioHtml({
      rendered: `
        <main>
          <div class="brandcard-wrapper slick-initialized slick-slider">
            <div class="slick-list draggable">
              <div class="slick-track">
                <div class="slick-slide slick-current slick-active" data-slick-index="0" aria-hidden="false">One</div>
                <div class="slick-slide slick-active" data-slick-index="1" aria-hidden="false">Two</div>
                <div class="slick-slide" data-slick-index="2" aria-hidden="true">Three</div>
              </div>
            </div>
            <div class="slick-controls showControl">
              <button class="brand-previous slick-arrow slick-disabled" aria-disabled="true">Previous</button>
              <button class="brand-next slick-arrow" aria-disabled="false">Next</button>
            </div>
          </div>
        </main>
      `,
      title: 't',
      baseHref: '/',
      selectedRegionId: null,
      bridgeToken: 'tok',
      editable: false,
    })
    const bridgeScript = extractBridgeScript(html)

    expect(bridgeScript).toContain('function detectedCarouselWindowSize(regionEl, panels)')
    expect(bridgeScript).toContain('panel.classList.contains(\'slick-active\')')
    expect(bridgeScript).toContain('Math.min(active, 3, panels.length)')
    expect(bridgeScript).toContain('regionEl.setAttribute(\'data-clone-studio-carousel-window-size\', String(count))')
    expect(bridgeScript).toContain('function setPanelWindowVisibility(panels, targetIndex, windowSize)')
    expect(bridgeScript).toContain('function refreshCarouselWindows()')
    expect(bridgeScript).toContain('function installCarouselResizeHandler()')
    expect(bridgeScript).toContain('function carouselControlScopes(regionEl)')
    expect(bridgeScript).toContain('function addSiblingCarouselControlScopes(scopes, node)')
    expect(bridgeScript).toContain('function isCarouselScopeBoundary(node)')
    expect(bridgeScript).toContain('window.addEventListener(\'resize\'')
    expect(bridgeScript).toContain('carouselActiveIndex(panels)')
    expect(bridgeScript).toContain('panel.classList.add(\'slick-active\')')
    expect(bridgeScript).toContain('panel.classList.add(\'slick-current\')')
    expect(bridgeScript).toContain('setCarouselControlDisabled')
    expect(bridgeScript).not.toContain('Alpine.start')
    expect(bridgeScript).not.toContain('x-data')
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('finds Ford/Slick controls when they are sibling nodes outside the slider wrapper', () => {
    const html = buildCloneStudioHtml({
      rendered: `
        <main>
          <section class="brandcardComponent">
            <div class="brandcard-wrapper slick-initialized slick-slider">
              <div class="slick-list draggable">
                <div class="slick-track">
                  <div class="slick-slide slick-current slick-active" data-slick-index="0" aria-hidden="false">One</div>
                  <div class="slick-slide slick-active" data-slick-index="1" aria-hidden="false">Two</div>
                  <div class="slick-slide" data-slick-index="2" aria-hidden="true">Three</div>
                  <div class="slick-slide" data-slick-index="3" aria-hidden="true">Four</div>
                </div>
              </div>
            </div>
            <div class="slick-controls showControl">
              <button class="brand-previous slick-arrow slick-disabled" aria-disabled="true">Previous</button>
              <button class="brand-next slick-arrow" aria-disabled="false">Next</button>
            </div>
          </section>
        </main>
      `,
      title: 't',
      baseHref: '/',
      selectedRegionId: null,
      bridgeToken: 'tok',
      editable: false,
    })
    const bridgeScript = extractBridgeScript(html)

    expect(bridgeScript).toContain('addSiblingCarouselControlScopes(scopes, regionEl)')
    expect(bridgeScript).toContain('addSiblingCarouselControlScopes(scopes, parent)')
    expect(bridgeScript).toContain('node.nextElementSibling')
    expect(bridgeScript).toContain('node.previousElementSibling')
    expect(bridgeScript).toContain('slideCount > collectPanels(regionEl).length')
    expect(bridgeScript).toContain('addUniqueInteractivityNode(next, nextNodes[n])')
    expect(bridgeScript).toContain('addUniqueInteractivityNode(prev, prevNodes[p])')
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('wires Ford AEM disclosure-heading accordions in read-only preview', () => {
    const html = buildCloneStudioHtml({
      rendered: `
        <main>
          <section class="accordion">
            <div class="accordion-disclosure" data-cmp-hook-accordion="item" data-cmp-expanded="true">
              <div class="block disclosure-block">
                <h4 class="cmp-accordion__title trigger disclosure">Disclosures</h4>
                <div data-cmp-hook-accordion="panel" class="content" role="region">Disclosure copy</div>
              </div>
            </div>
          </section>
        </main>
      `,
      title: 't',
      baseHref: '/',
      selectedRegionId: null,
      bridgeToken: 'tok',
      editable: false,
    })
    const bridgeScript = extractBridgeScript(html)

    expect(bridgeScript).toContain('.cmp-accordion__title')
    expect(bridgeScript).toContain('.trigger.disclosure')
    expect(bridgeScript).toContain('[class*="accordian"]')
    expect(bridgeScript).toContain('data-cmp-expanded')
    expect(bridgeScript).toContain('.accordion-disclosure')
    expect(bridgeScript).toContain('[data-cmp-hook-accordion="panel"]')
    expect(bridgeScript).toContain('function accordionScopeFor(regionEl, trigger)')
    expect(bridgeScript).toContain('function accordionVisualBlockFor(trigger, item)')
    expect(bridgeScript).toContain('function accordionShouldForceStartCollapsed(regionEl, trigger, item)')
    expect(bridgeScript).toContain('function accordionShouldStartCollapsed(regionEl, trigger, item)')
    expect(bridgeScript).toContain('trigger.closest(\'.block\')')
    expect(bridgeScript).toContain('data-view')
    expect(bridgeScript).toContain('/disclosure/i.test(view)')
    expect(bridgeScript).toContain('data-expand-collapse-option-desktop')
    expect(bridgeScript).toContain('data-expand-collapse-option-mobile')
    expect(bridgeScript).toContain('closeOtherAccordionPanels(scope, trigger)')
    expect(bridgeScript).toContain('visualBlock.classList.add(\'active\')')
    expect(bridgeScript).toContain('panel.style.setProperty(\'display\', \'none\', \'important\')')
    expect(bridgeScript).toContain('panel.style.removeProperty(\'display\')')
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('injects trusted prev/next/dot controls for multi-panel carousels/tabs lacking usable controls', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok', editable: false })
    const bridgeScript = extractBridgeScript(html)

    const interactivityBlock = bridgeScript.slice(bridgeScript.indexOf('function enableInteractivity()'))
    // A control-bar injector exists and is gated to multi-panel regions (collectPanels length > 1).
    expect(bridgeScript).toContain('function injectControlBar(')
    expect(interactivityBlock).toContain('collectPanels(regionEl).length > 1')
    // It creates prev/next buttons and a dot per panel via document.createElement.
    expect(bridgeScript).toContain('document.createElement')
    expect(bridgeScript).toContain('\\u2039') // ‹ prev chevron
    expect(bridgeScript).toContain('\\u203a') // › next chevron
    expect(bridgeScript).toContain('bar.style.opacity = \'0\'')
    expect(bridgeScript).toContain('bar.addEventListener(\'mouseenter\'')
    expect(bridgeScript).toContain('bar.addEventListener(\'focusin\'')
    // Every injected node is marked as bridge scaffolding so it never serializes into saved HTML.
    expect(bridgeScript).toContain('setAttribute(\'data-clone-studio-bridge\', \'true\')')
    // Clicks drive switchPanel + clamp index + suppress navigation/propagation.
    expect(bridgeScript).toContain('switchPanel')
    expect(bridgeScript).toContain('stopImmediatePropagation')
    // The injection is part of the read-only-only interactivity path.
    expect(bridgeScript).toContain('if (!EDITABLE)')
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('enables interactivity on bridge init for the read-only preview build', () => {
    const html = buildCloneStudioHtml({ rendered: '<main role="tablist"><button role="tab">A</button><button role="tab">B</button><div role="tabpanel">A</div><div role="tabpanel" hidden>B</div></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok', editable: false })
    const bridgeScript = extractBridgeScript(html)

    // The init sequence calls enableInteractivity guarded by !EDITABLE.
    expect(bridgeScript).toMatch(/if\s*\(!EDITABLE\)[\s\S]*enableInteractivity\(\)/)
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('scopes interactivity wiring per region so controls switch the right region (no shared loop var)', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok', editable: false })
    const bridgeScript = extractBridgeScript(html)

    // Each candidate is wired through a dedicated per-region function call (fresh scope per region),
    // NOT inline in the loop where a `var regionId`/`var regionEl` would be captured by reference and
    // resolve to the LAST region by the time a click fires.
    expect(bridgeScript).toContain('function wireRegion(regionEl)')
    expect(bridgeScript).toContain('wireRegion(candidates[i])')

    // The enableInteractivity loop body must be a single call into wireRegion — no inline wiring that
    // could close over the loop variable. Assert the loop does not declare per-region vars itself.
    const interactivityBlock = bridgeScript.slice(
      bridgeScript.indexOf('function enableInteractivity()'),
      bridgeScript.indexOf('function wireRegion('),
    )
    expect(interactivityBlock).not.toContain('var regionId')
    expect(interactivityBlock).not.toContain('wireTabRegion')
    expect(interactivityBlock).not.toContain('wireCarouselRegion')
    expect(interactivityBlock).not.toContain('wireAccordionRegion')
    expect(interactivityBlock).not.toContain('wireGalleryRegion')
    expect(interactivityBlock).not.toContain('wireDropdownRegion')

    // Per-region handler functions receive regionId/regionEl as params and keep their own current-index
    // state, so handlers close over per-call values rather than a shared outer var.
    expect(bridgeScript).toContain('function wireTabRegion(regionId, regionEl)')
    expect(bridgeScript).toContain('function switchTabPanel(regionId, regionEl, trigger, index)')
    expect(bridgeScript).toContain('function wireCarouselRegion(regionId, regionEl)')
    expect(bridgeScript).toContain('function wireAccordionRegion(regionId, regionEl)')
    expect(bridgeScript).toContain('function wireGalleryRegion(regionId, regionEl)')
    expect(bridgeScript).toContain('function wireDropdownRegion(regionId, regionEl)')
    expect(bridgeScript).toContain('function injectControlBar(regionId, regionEl, panelCount)')

    // Bridge-owned controls bypass the document navigation guard so their click handlers actually run.
    expect(bridgeScript).toContain('function isBridgeOwnedTarget(target)')
    expect(bridgeScript).toContain('if (isBridgeOwnedTarget(target))')
    expect(bridgeScript).toContain('markInteractivityControl(triggers[t])')
    expect(bridgeScript).toContain('markInteractivityControl(triggers[a])')
    expect(bridgeScript).toContain('markInteractivityControl(parts.items[g].control)')
    expect(bridgeScript).toContain('markInteractivityControl(triggers[d])')

    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('injects editable:true by default and keeps editing affordances', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok' })
    expect(html).toContain('window.__CLONE_STUDIO_EDITABLE__ = true')
  })

  it('renders an ns-resize drag handle and posts clone-studio:region-height on release', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok' })
    const bridgeScript = extractBridgeScript(html)

    // Handle message constant + cursor affordance present.
    expect(bridgeScript).toContain('var MESSAGE_REGION_HEIGHT = \'clone-studio:region-height\'')
    expect(bridgeScript).toContain('ns-resize')
    // Drag release persists via the region-height message; double-click clears (height null).
    expect(bridgeScript).toContain('post(MESSAGE_REGION_HEIGHT')
    expect(bridgeScript).toContain('height: null')
    // Live crop reuses setRegionHeight.
    expect(bridgeScript).toContain('setRegionHeight')
    // Still parses as valid JS.
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('strips ALL bridge-marked nodes from serialized HTML (handle div, not just the script)', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok' })
    const bridgeScript = extractBridgeScript(html)

    // getBodyHtml must query the broad attribute selector — the old `script[...]` only form leaked the
    // appended resize handle <div data-clone-studio-bridge> into persisted clone HTML.
    expect(bridgeScript).toContain('clone.querySelectorAll(\'[data-clone-studio-bridge]\')')
    expect(bridgeScript).not.toContain('clone.querySelectorAll(\'script[data-clone-studio-bridge]\')')

    // Behavioral: a clone containing a bridge-marked node AND normal content drops only the marked node.
    const removed: string[] = []
    const bridgeDiv = { tag: 'div-handle', parentNode: { removeChild: (c: any) => removed.push(c.tag) } }
    const bridgeScriptEl = { tag: 'script', parentNode: { removeChild: (c: any) => removed.push(c.tag) } }
    const fakeClone = {
      querySelectorAll: (selector: string) =>
        selector === '[data-clone-studio-bridge]' ? [bridgeScriptEl, bridgeDiv] : [],
    }
    stripCloneStudioBridgeNodesForTest(fakeClone)
    expect(removed).toEqual(['script', 'div-handle'])
  })

  it('gates the resize handle behind EDITABLE so the read-only preview never shows it', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok', editable: false })
    const bridgeScript = extractBridgeScript(html)

    // The handle is created via ensureResizeHandle, which must early-return when not EDITABLE.
    expect(bridgeScript).toContain('function ensureResizeHandle()')
    const handleBlock = bridgeScript.slice(bridgeScript.indexOf('function ensureResizeHandle()'))
    expect(handleBlock.slice(0, 200)).toContain('if (!EDITABLE)')
    // Read-only build still parses.
    expect(() => new Function(bridgeScript)).not.toThrow()
  })

  it('injects the clone runtime as a trusted script after the bridge when provided', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><section data-clone-interaction="tabs" data-clone-region-id="cr-1" x-data="cloneTabs"><p>Panel</p></section></main>',
      title: 'Amarok',
      baseHref: 'https://www.volkswagen.com.au/en/models/amarok.html',
      selectedRegionId: null,
      runtimeJs: 'document.addEventListener(\'alpine:init\', function () {});',
    })

    const bridge = html.indexOf('data-clone-studio-bridge="true"')
    const runtime = html.indexOf('data-clone-studio-runtime="true"')

    expect(bridge).toBeGreaterThan(-1)
    expect(runtime).toBeGreaterThan(bridge)
    expect(html).toContain('alpine:init')
  })

  it('omits the runtime script when no runtimeJs is provided', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><p>No interactions here.</p></main>',
      title: 'Amarok',
      baseHref: 'https://example.com/',
      selectedRegionId: null,
    })

    expect(html).not.toContain('data-clone-studio-runtime')
  })

  it('keeps stamped Alpine attributes through sanitization', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><section data-clone-interaction="tabs" x-data="cloneTabs"><button data-clone-tab="0" x-on:click="selectTab">A</button><div data-clone-panel="0">P</div></section></main>',
      title: 'Amarok',
      baseHref: 'https://example.com/',
      selectedRegionId: null,
    })

    expect(html).toContain('x-data="cloneTabs"')
    expect(html).toContain('x-on:click="selectTab"')
    expect(html).toContain('data-clone-panel="0"')
  })

  it('legacy bridge interactivity skips stamped regions', () => {
    const source = readFileSync(new URL('./clone-studio-html.ts', import.meta.url), 'utf8')
    const enable = source.indexOf('function enableInteractivity')
    const guard = source.indexOf('closest(\'[data-clone-interaction]\')', enable)

    expect(enable).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(enable)
  })
})

describe('sanitizeStyle preserves inline fidelity styles', () => {
  it('keeps box-shadow, gradient and transform; strips js/expression', () => {
    const safe = sanitizeCloneStudioHtmlForTest(
      '<div style="box-shadow:0 4px 12px rgba(0,0,0,0.3);background-image:linear-gradient(180deg,#000,rgba(0,0,0,0));transform:translateX(-50%)">x</div>',
    )
    expect(safe).toContain('box-shadow:0 4px 12px rgba(0,0,0,0.3)')
    expect(safe).toContain('linear-gradient(180deg,#000,rgba(0,0,0,0))')
    expect(safe).toContain('transform:translateX(-50%)')

    const danger = sanitizeCloneStudioHtmlForTest(
      '<div style="width:expression(alert(1));background:url(javascript:alert(1))">x</div>',
    )
    expect(danger).not.toContain('expression(')
    expect(danger).not.toContain('javascript:')
  })

  it('keeps inline border declarations', () => {
    const safe = sanitizeCloneStudioHtmlForTest(
      '<div style="border-bottom:1px solid rgb(204, 204, 204)">x</div>',
    )
    expect(safe).toContain('border-bottom:1px solid rgb(204, 204, 204)')
  })
})

describe('reassignClonedRegionIdsForTest', () => {
  it('removes the clone root id and every nested region id so ids re-assign collision-free', () => {
    const removed: string[] = []
    const makeNode = (id: string) => ({
      removeAttribute: (name: string) => {
        if (name === 'data-oem-region-id')
          removed.push(id)
      },
    })
    const nested = [makeNode('nested-1'), makeNode('nested-2')]
    const fakeClone = {
      removeAttribute: (name: string) => {
        if (name === 'data-oem-region-id')
          removed.push('root')
      },
      querySelectorAll: (selector: string) =>
        (selector === '[data-oem-region-id]' ? nested : []) as any,
    }

    const count = reassignClonedRegionIdsForTest(fakeClone as any)

    expect(count).toBe(2)
    expect(removed).toEqual(['root', 'nested-1', 'nested-2'])
  })
})

describe('buildCloneStudioHtml duplicate-region bridge handler', () => {
  it('wires the duplicate-region message to clone, re-ID and post newRegion', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main data-oem-region-id="r1"><h1>Mustang</h1></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/',
      selectedRegionId: null,
    })
    const bridge = extractBridgeScript(html)

    expect(bridge).toContain('clone-studio:duplicate-region')
    expect(bridge).toContain('cloneNode(true)')
    expect(bridge).toContain('insertBefore')
    expect(bridge).toContain('querySelectorAll(\'[data-oem-region-id]\')')
    expect(bridge).toContain('newRegion')
  })
})
