import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { fallbackSectionTypeIcon, getSectionTypeIcon, SECTION_TYPE_ICONS } from './section-icons'

describe('section icon metadata', () => {
  it('provides shared section type icons with a fallback', () => {
    expect(getSectionTypeIcon('hero')).toBe(SECTION_TYPE_ICONS.hero)
    expect(getSectionTypeIcon('feature-cards')).toBe(SECTION_TYPE_ICONS['feature-cards'])
    expect(getSectionTypeIcon('unknown')).toBe(fallbackSectionTypeIcon)
    expect(getSectionTypeIcon(undefined)).toBe(fallbackSectionTypeIcon)
  })

  it('keeps icon maps out of page-builder consumers', () => {
    const consumerSources = [
      readFileSync(new URL('./SectionListItem.vue', import.meta.url), 'utf8'),
      readFileSync(new URL('./SectionTemplateCard.vue', import.meta.url), 'utf8'),
    ]

    for (const source of consumerSources) {
      expect(source).not.toContain('const typeIcons')
    }
  })
})
