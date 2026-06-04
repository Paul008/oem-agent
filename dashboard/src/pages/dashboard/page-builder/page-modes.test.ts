import { describe, expect, it } from 'vitest'

import type { CloneRegion } from './page-modes'
import {
  applyRegionHeightOverride,
  getActivePageMode,
  getAvailablePageModes,
  getCloneHtml,
  getCloneRegions,
  getCloneStudioHtml,
  getCloneStylesheetUrls,
  getCloneViewport,
  getSectionItems,
  normalizeDashboardPageModes,
} from './page-modes'

describe('dashboard page modes', () => {
  it('defaults cloned pages to clone mode even when sections exist', () => {
    const page = normalizeDashboardPageModes({
      content: {
        rendered: '<main>Ford clone</main>',
        sections: [{ id: 's1', type: 'hero' }],
      },
    })

    expect((page as { active_mode?: string }).active_mode).toBe('clone')
    expect(getActivePageMode(page)).toBe('clone')
    expect(getCloneHtml(page)).toContain('Ford clone')
    expect(getSectionItems(page)).toHaveLength(1)
  })

  it('finds clone HTML from edited clone before original clone', () => {
    const page = normalizeDashboardPageModes({
      content: {
        modes: {
          clone: {
            rendered: '<main>Original</main>',
            edited_rendered: '<main>Edited</main>',
            section_index: [],
          },
        },
      },
    })

    expect(getCloneHtml(page)).toContain('Edited')
  })

  it('returns clone regions from mode metadata', () => {
    const region: CloneRegion = {
      id: 'r1',
      label: 'Hero',
      selector: 'main',
      tag: 'main',
      classes: [],
      top: 0,
      height: 400,
      type_hint: 'hero',
      editable_fields: [],
    }

    const page = normalizeDashboardPageModes({
      content: {
        rendered: '<main>Clone</main>',
        modes: {
          clone: {
            rendered: '<main>Clone</main>',
            section_index: [region],
          },
        },
      },
    })

    expect(getCloneRegions(page)[0].label).toBe('Hero')
  })

  it('reports available modes without duplicating legacy data', () => {
    const page = normalizeDashboardPageModes({
      content: {
        rendered: '<main>Clone</main>',
        sections: [{ id: 's1', type: 'hero' }],
      },
    })

    expect(getAvailablePageModes(page)).toEqual(['clone', 'sections'])
  })

  it('preserves legacy sections when section mode items are empty', () => {
    const page = normalizeDashboardPageModes({
      content: {
        sections: [{ id: 's1', type: 'hero' }],
        modes: {
          sections: {
            items: [],
          },
        },
      },
    })

    expect(getSectionItems(page)).toEqual([{ id: 's1', type: 'hero' }])
    expect(page.content.sections).toEqual([{ id: 's1', type: 'hero' }])
  })

  it('returns stored clone stylesheet urls', () => {
    const page = {
      content: {
        modes: {
          clone: {
            rendered: '<main>clone</main>',
            edited_rendered: '<main>edited</main>',
            stylesheet_urls: ['https://www.ford.com.au/a.css', 'https://www.ford.com.au/b.css'],
          },
        },
      },
    }

    expect(getCloneStylesheetUrls(page)).toEqual([
      'https://www.ford.com.au/a.css',
      'https://www.ford.com.au/b.css',
    ])
  })

  it('falls back to extracting stylesheet links from original clone HTML when stylesheet_urls is missing', () => {
    const page = {
      content: {
        modes: {
          clone: {
            // original capture retains <link>s; edited_rendered is body-only and loses them
            rendered: '<link rel="stylesheet" href="https://www.ford.com.au/site.css"><main>clone</main>',
            edited_rendered: '<main>edited body only</main>',
          },
        },
      },
    }

    expect(getCloneStylesheetUrls(page)).toEqual(['https://www.ford.com.au/site.css'])
  })

  it('returns the stored clone viewport metadata', () => {
    const page = {
      content: {
        modes: {
          clone: {
            rendered: '<main>clone</main>',
            viewport: { width: 1680, height: 1080 },
          },
        },
      },
    }

    expect(getCloneViewport(page)).toEqual({ width: 1680, height: 1080 })
  })

  it('falls back to the standard desktop viewport when clone viewport metadata is missing or invalid', () => {
    const invalidPages = [
      {},
      { content: { modes: { clone: { rendered: '<main>clone</main>' } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: 0, height: 1080 } } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: -1, height: 1080 } } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: Number.POSITIVE_INFINITY, height: 1080 } } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: '1440', height: 1080 } } } } },
      { content: { modes: { clone: { rendered: '<main>clone</main>', viewport: { width: 1440, height: 0 } } } } },
    ]

    for (const page of invalidPages) {
      expect(getCloneViewport(page)).toEqual({ width: 1280, height: 1080 })
    }
  })

  it('combines original captured head parts with the edited clone body for Clone Studio', () => {
    const page = {
      content: {
        modes: {
          clone: {
            rendered: '<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen"><style>.hero { color: red; }</style><main><h1>Original</h1></main>',
            edited_rendered: '<main><h1>Edited</h1></main>',
          },
        },
      },
    }

    const html = getCloneStudioHtml(page)

    expect(html).toContain('<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen">')
    expect(html).toContain('<style>.hero { color: red; }</style>')
    expect(html).toContain('<main><h1>Edited</h1></main>')
    expect(html).not.toContain('<main><h1>Original</h1></main>')
  })

  it('returns normal clone html for Clone Studio when no edited body exists', () => {
    const rendered = '<link rel="stylesheet" href="https://cdn.example.test/site.css"><main><h1>Original</h1></main>'
    const page = {
      content: {
        modes: {
          clone: {
            rendered,
          },
        },
      },
    }

    expect(getCloneStudioHtml(page)).toBe(rendered)
  })
})

describe('applyRegionHeightOverride', () => {
  it('sets a numeric height_override on the matching region', () => {
    const regions = [{ id: 'r1', height: 800 } as any, { id: 'r2', height: 200 } as any]
    const next = applyRegionHeightOverride(regions, 'r1', 400)
    expect(next.find(r => r.id === 'r1')!.height_override).toBe(400)
    expect(next.find(r => r.id === 'r2')!.height_override).toBeUndefined()
  })
  it('clears the override when passed null', () => {
    const regions = [{ id: 'r1', height: 800, height_override: 400 } as any]
    expect(applyRegionHeightOverride(regions, 'r1', null)[0].height_override).toBeUndefined()
  })
})
