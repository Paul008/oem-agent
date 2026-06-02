import { beforeAll, describe, expect, it, vi } from 'vitest'

import { SECTION_DEFAULTS } from './section-templates'

vi.mock('vue', () => ({
  defineAsyncComponent: (loader: () => Promise<unknown>) => ({ loader }),
}))

let registry: typeof import('./section-registry')

beforeAll(async () => {
  registry = await import('./section-registry')
})

describe('section-registry', () => {
  it('has one renderer for every known section type', () => {
    expect(new Set(registry.registeredSectionTypes)).toEqual(new Set(Object.keys(SECTION_DEFAULTS)))
  })

  it('routes composition-driven sections to card-grid', () => {
    const component = registry.resolveSectionComponent({
      id: 's1',
      type: 'feature-cards',
      card_composition: ['image', 'title'],
    })

    expect(component).toBe(registry.sectionComponentMap['card-grid'])
  })

  it('returns undefined for unknown section types', () => {
    expect(registry.resolveSectionComponent({ id: 's1', type: 'unknown' })).toBeUndefined()
  })
})
