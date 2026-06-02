import { describe, expect, it } from 'vitest'

import { SECTION_DEFAULTS } from './section-templates'
import { registeredSectionTypes, resolveSectionComponent, sectionComponentMap } from './section-registry'

describe('section-registry', () => {
  it('has one renderer for every known section type', () => {
    expect(new Set(registeredSectionTypes)).toEqual(new Set(Object.keys(SECTION_DEFAULTS)))
  })

  it('routes composition-driven sections to card-grid', () => {
    const component = resolveSectionComponent({
      id: 's1',
      type: 'feature-cards',
      card_composition: ['image', 'title'],
    })

    expect(component).toBe(sectionComponentMap['card-grid'])
  })

  it('returns undefined for unknown section types', () => {
    expect(resolveSectionComponent({ id: 's1', type: 'unknown' })).toBeUndefined()
  })
})
