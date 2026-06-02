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
  })
})
