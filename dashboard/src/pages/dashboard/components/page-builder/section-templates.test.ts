import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getSectionSplittableField, SECTION_SPLITTABLE_FIELDS } from './section-templates'

describe('section split metadata', () => {
  it('centralizes splittable section field definitions', () => {
    expect(SECTION_SPLITTABLE_FIELDS).toEqual({
      'gallery': 'images',
      'image-showcase': 'images',
      'feature-cards': 'cards',
      'tabs': 'tabs',
      'accordion': 'items',
      'testimonial': 'testimonials',
      'logo-strip': 'logos',
      'stats': 'stats',
      'pricing-table': 'tiers',
      'comparison-table': 'rows',
    })

    expect(getSectionSplittableField('gallery')).toBe('images')
    expect(getSectionSplittableField('hero')).toBeUndefined()
    expect(getSectionSplittableField(undefined)).toBeUndefined()
  })

  it('keeps split metadata out of page-builder consumers', () => {
    const consumerSources = [
      readFileSync(new URL('../../../../composables/use-page-builder.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('./SectionListItem.vue', import.meta.url), 'utf8'),
    ]

    for (const source of consumerSources) {
      expect(source).not.toContain('const SPLITTABLE_FIELDS')
    }
  })
})
