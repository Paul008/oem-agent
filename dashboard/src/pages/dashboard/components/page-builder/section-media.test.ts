import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  countSectionImages,
  resolveSectionMediaPaths,
  SECTION_IMAGE_FIELD_KEYS,
} from './section-media'

describe('section media helpers', () => {
  it('resolves media paths recursively without mutating the source section', () => {
    const section = {
      type: 'pinned-scroll',
      title: 'Performance',
      background_image: '/media/pages/ford-au/mustang/bg.jpg',
      background_image_mobile: '/media/pages/ford-au/mustang/bg-mobile.jpg',
      cards: [
        {
          image: '/media/pages/ford-au/mustang/card.jpg',
          mobile_image: '/media/pages/ford-au/mustang/card-mobile.jpg',
          caption: 'Track mode',
        },
      ],
    }

    const resolved = resolveSectionMediaPaths(section, url => `https://worker.example${url}`)

    expect(resolved).toEqual({
      type: 'pinned-scroll',
      title: 'Performance',
      background_image: 'https://worker.example/media/pages/ford-au/mustang/bg.jpg',
      background_image_mobile: 'https://worker.example/media/pages/ford-au/mustang/bg-mobile.jpg',
      cards: [
        {
          image: 'https://worker.example/media/pages/ford-au/mustang/card.jpg',
          mobile_image: 'https://worker.example/media/pages/ford-au/mustang/card-mobile.jpg',
          caption: 'Track mode',
        },
      ],
    })
    expect(section.background_image).toBe('/media/pages/ford-au/mustang/bg.jpg')
  })

  it('counts visual media references across old and newer section shapes', () => {
    expect(countSectionImages({
      type: 'hero',
      desktop_image_url: '/media/desktop.jpg',
      mobile_image_url: '/media/mobile.jpg',
      video_url: '/media/video.mp4',
    })).toBe(2)

    expect(countSectionImages({
      type: 'card-grid',
      cards: [
        { image_url: '/media/card.jpg' },
        { logo_url: '/media/logo.svg' },
      ],
    })).toBe(2)

    expect(countSectionImages({
      type: 'split-content',
      image_url: '/media/split.jpg',
    })).toBe(1)

    expect(countSectionImages({
      type: 'media',
      images: [{ url: '/media/one.jpg' }, { url: '' }],
    })).toBe(1)

    expect(countSectionImages({
      type: 'pinned-scroll',
      background_image: '/media/bg.jpg',
      background_image_mobile: '/media/bg-mobile.jpg',
      cards: [
        { image: '/media/card.jpg', mobile_image: '/media/card-mobile.jpg' },
      ],
    })).toBe(4)
  })

  it('does not count non-visual URL fields as image references', () => {
    expect(countSectionImages({
      type: 'logo-strip',
      logos: [
        { image_url: '/media/logo.svg', link_url: 'https://example.com' },
      ],
      cta_url: 'https://example.com/enquire',
    })).toBe(1)
  })

  it('keeps media traversal rules out of page-builder consumers', () => {
    expect([...SECTION_IMAGE_FIELD_KEYS]).toContain('background_image_mobile')

    const consumerSources = [
      readFileSync(new URL('../../../../composables/use-page-builder.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('./SectionTemplateCard.vue', import.meta.url), 'utf8'),
    ]

    for (const source of consumerSources) {
      expect(source).not.toContain('switch (s.type)')
      expect(source).not.toContain('function countImages')
    }
  })
})
