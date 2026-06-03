import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { normalizeStoredMediaUrls, usePageBuilder } from './use-page-builder'

describe('usePageBuilder media URL resolution', () => {
  it('does not define duplicate section media resolver cases', () => {
    const source = readFileSync(new URL('./use-page-builder.ts', import.meta.url), 'utf8')
    const resolverStart = source.indexOf('function resolveSectionMediaUrls')
    const resolverEnd = source.indexOf('export interface HistoryEntry')
    const resolverSource = source.slice(resolverStart, resolverEnd)
    const cases = Array.from(resolverSource.matchAll(/case '([^']+)'/g), match => match[1])
    const duplicates = cases.filter((type, index) => cases.indexOf(type) !== index)

    expect(duplicates).toEqual([])
  })

  it('loads page-builder detail pages with cloned HTML retained for OEM preview', () => {
    const source = readFileSync(new URL('./use-page-builder.ts', import.meta.url), 'utf8')

    expect(source).toContain('fetchGeneratedPage(newSlug, { includeRendered: true, includeModes: true })')
    expect(source).toContain('fetchGeneratedPage(slug.value, { includeRendered: true, includeModes: true })')
  })

  it('exposes clone-first mode state while keeping structured sections available', () => {
    const builder = usePageBuilder()
    builder.page.value = {
      active_mode: 'clone',
      content: {
        rendered: '<main>OEM clone</main>',
        sections: [{ id: 's1', type: 'hero' }],
        modes: {
          clone: {
            rendered: '<main>OEM clone</main>',
            section_index: [{
              id: 'r1',
              label: 'Hero',
              selector: 'main',
              tag: 'main',
              classes: [],
              top: 0,
              height: 400,
              editable_fields: [],
            }],
          },
          sections: {
            items: [{ id: 's1', type: 'hero' }],
          },
        },
      },
    }

    expect(builder.activeMode.value).toBe('clone')
    expect(builder.cloneHtml.value).toContain('OEM clone')
    expect(builder.cloneRegions.value).toHaveLength(1)
    expect(builder.sections.value).toEqual([{ id: 's1', type: 'hero' }])
  })

  it('normalizes resolved worker media URLs before storage', () => {
    const section = {
      id: 'hero-1',
      type: 'hero',
      desktop_image_url: 'https://oem-agent.adme-dev.workers.dev/media/pages/ford-au/mustang/hero.jpg?size=large',
      mobile_image_url: '/media/pages/ford-au/mustang/hero-mobile.jpg',
      cards: [
        {
          title: 'Interior',
          image_url: 'https://oem-agent.adme-dev.workers.dev/media/pages/ford-au/mustang/interior.jpg',
        },
      ],
    }

    const normalized = normalizeStoredMediaUrls([section])

    expect(normalized).toEqual([
      {
        id: 'hero-1',
        type: 'hero',
        desktop_image_url: '/media/pages/ford-au/mustang/hero.jpg?size=large',
        mobile_image_url: '/media/pages/ford-au/mustang/hero-mobile.jpg',
        cards: [
          {
            title: 'Interior',
            image_url: '/media/pages/ford-au/mustang/interior.jpg',
          },
        ],
      },
    ])
    expect(section.desktop_image_url).toBe('https://oem-agent.adme-dev.workers.dev/media/pages/ford-au/mustang/hero.jpg?size=large')
  })

  it('stores normalized media URLs when page sections are updated', () => {
    const builder = usePageBuilder()
    builder.page.value = {
      content: {
        sections: [],
      },
    }

    builder.sections.value = [
      {
        id: 'gallery-1',
        type: 'gallery',
        images: [
          {
            url: 'https://oem-agent.adme-dev.workers.dev/media/pages/ford-au/mustang/exterior.jpg',
          },
        ],
      },
    ]

    expect(builder.page.value.content.sections).toEqual([
      {
        id: 'gallery-1',
        type: 'gallery',
        images: [
          {
            url: '/media/pages/ford-au/mustang/exterior.jpg',
          },
        ],
      },
    ])
    expect(builder.page.value.content.modes.sections.items).toEqual(builder.page.value.content.sections)
  })
})
