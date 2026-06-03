import { describe, expect, it } from 'vitest'

import { buildCloneStudioHtml } from './clone-studio-html'

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
})
