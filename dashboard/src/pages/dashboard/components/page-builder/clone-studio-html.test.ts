import { describe, expect, it } from 'vitest'

import {
  buildCloneStudioHtml,
  sanitizeCloneStudioHtmlForTest,
  sanitizeCloneStudioUrlForTest,
  stripCloneStudioScaffoldingForTest,
} from './clone-studio-html'

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

  it('sanitizes unsafe javascript URLs for clone patches', () => {
    expect(sanitizeCloneStudioUrlForTest('javascript:alert(1)')).toBe('')
    expect(sanitizeCloneStudioUrlForTest('https://example.test/image.jpg')).toBe('https://example.test/image.jpg')
    expect(sanitizeCloneStudioUrlForTest('/showroom')).toBe('/showroom')
    expect(sanitizeCloneStudioUrlForTest('#features')).toBe('#features')
    expect(sanitizeCloneStudioUrlForTest('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
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
