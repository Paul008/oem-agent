import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { PageSectionType } from './section-templates'

import { SECTION_DEFAULTS } from './section-templates'

interface MockAsyncComponent {
  loader: () => Promise<unknown>
  loaderSource: string
}

vi.mock('vue', () => ({
  defineAsyncComponent: (loader: () => Promise<unknown>) => ({
    loader,
    loaderSource: loader.toString(),
  }),
}))

let registry: typeof import('./section-registry')

beforeAll(async () => {
  registry = await import('./section-registry')
})

function expectComponentPath(component: unknown, path: string) {
  expect((component as MockAsyncComponent).loaderSource).toContain(path)
}

describe('section-registry', () => {
  it('has one canvas renderer for every known section type', () => {
    expect(new Set(Object.keys(registry.canvasSectionComponentMap))).toEqual(new Set(Object.keys(SECTION_DEFAULTS)))
    expect(new Set(registry.registeredSectionTypes)).toEqual(new Set(Object.keys(SECTION_DEFAULTS)))
  })

  it('has one display renderer for every known section type', () => {
    expect(new Set(Object.keys(registry.displaySectionComponentMap))).toEqual(new Set(Object.keys(SECTION_DEFAULTS)))
  })

  it('keeps display-specific renderer mappings', () => {
    const displayMappings: Array<[string, string]> = [
      ['intro', 'SectionSplitContent.vue'],
      ['content-block', 'SectionSplitContent.vue'],
      ['gallery', 'SectionMedia.vue'],
      ['image', 'SectionMedia.vue'],
      ['image-showcase', 'SectionMedia.vue'],
      ['video', 'SectionMedia.vue'],
      ['embed', 'SectionMedia.vue'],
      ['media', 'SectionMedia.vue'],
      ['cta-banner', 'SectionHero.vue'],
      ['countdown', 'SectionHero.vue'],
    ]

    for (const [type, expectedPath] of displayMappings) {
      expectComponentPath(
        registry.resolveSectionComponent({ id: `display-${type}`, type }, { context: 'display' }),
        expectedPath,
      )
    }
  })

  it('reuses renderer instances for display mappings that do not need overrides', () => {
    const displayOverrideTypes = new Set<PageSectionType>([
      'intro',
      'content-block',
      'gallery',
      'image',
      'image-showcase',
      'video',
      'embed',
      'cta-banner',
    ])

    for (const type of Object.keys(SECTION_DEFAULTS) as PageSectionType[]) {
      if (displayOverrideTypes.has(type)) {
        expect(registry.displaySectionComponentMap[type]).not.toBe(registry.canvasSectionComponentMap[type])
      }
      else {
        expect(registry.displaySectionComponentMap[type]).toBe(registry.canvasSectionComponentMap[type])
      }
    }
  })

  it('routes composition-driven sections to card-grid in every context', () => {
    const section = {
      id: 's1',
      type: 'feature-cards',
      card_composition: ['image', 'title'],
    }

    expect(registry.resolveSectionComponent(section)).toBe(registry.canvasSectionComponentMap['card-grid'])
    expect(registry.resolveSectionComponent(section, { context: 'display' })).toBe(registry.displaySectionComponentMap['card-grid'])
  })

  it('returns undefined for unknown section types', () => {
    expect(registry.resolveSectionComponent({ id: 's1', type: 'unknown' })).toBeUndefined()
    expect(registry.resolveSectionComponent({ id: 's1', type: 'unknown' }, { context: 'display' })).toBeUndefined()
  })
})
