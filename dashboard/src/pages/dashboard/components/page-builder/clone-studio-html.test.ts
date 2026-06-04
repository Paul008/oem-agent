import { describe, expect, it } from 'vitest'

import {
  buildCloneStudioHtml,
  sanitizeCloneStudioHtmlForTest,
  sanitizeCloneStudioUrlForTest,
  serializeCloneStudioBodyForTest,
  stopCloneStudioBlockedEventForTest,
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

  it('clips document-level horizontal overflow and caps media to the desktop frame', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><div class="article-wrapper"><picture><img src="/hero.jpg"></picture></div></main>',
      title: 'i30',
      baseHref: 'https://www.hyundai.com/au/en/cars/small-cars/i30/',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toMatch(/html,[\s\S]*body[\s\S]*overflow-x:\s*clip\s*!important/i)
    expect(head).toMatch(/img,[\s\S]*picture[\s\S]*max-width:\s*100%\s*!important/i)
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

  it('force-shows OEM desktop-only image classes hidden by stripped responsive scripts', () => {
    const html = buildCloneStudioHtml({
      rendered: '<main><picture><img class="imgdesktop dsktoponly" src="/media/pages/assets/ford-au/mustang/hero.webp"></picture></main>',
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/showroom/cars/mustang/',
      mediaBase: 'https://oem-agent.adme-dev.workers.dev',
      selectedRegionId: null,
    })

    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toMatch(/img\.imgdesktop[\s\S]*display:\s*block\s*!important/i)
    expect(head).toContain('dsktoponly')
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
    expect(bridgeScript).toContain("kind: 'text'")
    expect(bridgeScript).toContain("kind: 'image'")
    expect(bridgeScript).toContain("kind: 'link'")
    expect(bridgeScript).toContain("kind: 'button'")
    expect(bridgeScript).toContain("kind: 'visibility'")
    expect(bridgeScript).toContain('getBoundingClientRect')
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

    expect(bridgeScript).toContain("target.innerHTML = sanitizeHtml(message.html != null ? message.html : value == null ? '' : value)")
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

    expect(bridgeScript).toContain("scrollIntoView({ behavior: 'smooth', block: 'center' })")
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

    expect(html).toContain("document.addEventListener('submit'")
    expect(html).toContain("'auxclick'")
    expect(html).toContain("'dblclick'")
    expect(html).toContain('isNavigationElement')
    expect(html).toContain('stopBlockedEvent')
    expect(html).toContain('stopImmediatePropagation')
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
    expect(html).toContain("addEventListener('contextmenu'")
    expect(html).toContain('clone-studio:context-menu')
  })

  it('bridge enables contenteditable on a begin-edit message and commits text', () => {
    const html = buildCloneStudioHtml({ rendered: '<main><section class="hero"><h1>X</h1></section></main>', title: 't', baseHref: '/', mediaBase: '/', stylesheetUrls: [], selectedRegionId: null, bridgeToken: 'tok' })
    expect(html).toContain('clone-studio:begin-edit')
    expect(html).toContain("setAttribute('contenteditable'")
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
    // It must NOT post the unhandled patch-field upward from the commit path.
    expect(commitBlock).not.toContain('post(MESSAGE_PATCH_FIELD')
  })

  it('patchField handles alt and background kinds without clobbering text', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><img src="/a.png" alt="old"></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok' })
    const bridgeScript = extractBridgeScript(html)

    // alt branch: set the img alt attribute, never textContent.
    expect(bridgeScript).toContain("kind === 'alt'")
    expect(bridgeScript).toContain("setAttribute('alt'")
    // background branch: set backgroundColor on the region container, guarded by a colour check.
    expect(bridgeScript).toContain("kind === 'background'")
    expect(bridgeScript).toContain('backgroundColor')
    expect(bridgeScript).toContain('isPlausibleCssColor')
  })

  it('locks the bridge read-only when built with editable:false', () => {
    const html = buildCloneStudioHtml({ rendered: '<main data-oem-region-id="r1"><h1>X</h1></main>', title: 't', baseHref: '/', selectedRegionId: null, bridgeToken: 'tok', editable: false })

    // The editable flag is injected like selectedRegion, and the bridge reads it into EDITABLE.
    expect(html).toContain('window.__CLONE_STUDIO_EDITABLE__ = false')
    const bridgeScript = extractBridgeScript(html)
    expect(bridgeScript).toContain('var EDITABLE = window.__CLONE_STUDIO_EDITABLE__ !== false')
    // dblclick inline edit and context-menu emit are guarded by EDITABLE.
    expect(bridgeScript).toContain("if (EDITABLE && event.type === 'dblclick')")
    expect(bridgeScript).toContain('if (!EDITABLE)')
    // Still parses as valid JS.
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
    expect(bridgeScript).toContain("var MESSAGE_REGION_HEIGHT = 'clone-studio:region-height'")
    expect(bridgeScript).toContain('ns-resize')
    // Drag release persists via the region-height message; double-click clears (height null).
    expect(bridgeScript).toContain('post(MESSAGE_REGION_HEIGHT')
    expect(bridgeScript).toContain('height: null')
    // Live crop reuses setRegionHeight.
    expect(bridgeScript).toContain('setRegionHeight')
    // Still parses as valid JS.
    expect(() => new Function(bridgeScript)).not.toThrow()
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
})
