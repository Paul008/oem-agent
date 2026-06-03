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
    expect(() => new Function(bridgeScript)).not.toThrow()
  })
})
