import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  getSectionRecipePattern,
  getSectionSplittableField,
  SECTION_RECIPE_PATTERNS,
  SECTION_SPLITTABLE_FIELDS,
} from './section-templates'

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

describe('section recipe metadata', () => {
  it('centralizes section recipe pattern definitions', () => {
    expect(SECTION_RECIPE_PATTERNS).toEqual({
      'hero': { pattern: 'hero', variant: 'image-overlay' },
      'feature-cards': { pattern: 'card-grid', variant: 'image-title-body' },
      'stats': { pattern: 'card-grid', variant: 'stat' },
      'logo-strip': { pattern: 'card-grid', variant: 'logo' },
      'testimonial': { pattern: 'card-grid', variant: 'testimonial' },
      'pricing-table': { pattern: 'card-grid', variant: 'pricing-tier' },
      'intro': { pattern: 'split-content', variant: 'text-left-image-right' },
      'content-block': { pattern: 'split-content', variant: 'full-width-text' },
      'gallery': { pattern: 'media', variant: 'carousel' },
      'video': { pattern: 'media', variant: 'video' },
      'embed': { pattern: 'media', variant: 'embed' },
      'image': { pattern: 'media', variant: 'single-image' },
      'image-showcase': { pattern: 'media', variant: 'showcase' },
      'tabs': { pattern: 'tabs', variant: 'horizontal' },
      'specs-grid': { pattern: 'data-display', variant: 'specs-accordion' },
      'comparison-table': { pattern: 'data-display', variant: 'comparison' },
      'color-picker': { pattern: 'data-display', variant: 'color-picker' },
      'cta-banner': { pattern: 'action-bar', variant: 'banner' },
      'sticky-bar': { pattern: 'action-bar', variant: 'sticky' },
      'enquiry-form': { pattern: 'action-bar', variant: 'form' },
      'heading': { pattern: 'utility', variant: 'heading' },
      'alert': { pattern: 'utility', variant: 'alert' },
      'divider': { pattern: 'utility', variant: 'divider' },
      'countdown': { pattern: 'hero', variant: 'countdown' },
      'finance-calculator': { pattern: 'utility', variant: 'calculator' },
      'accordion': { pattern: 'utility', variant: 'accordion' },
      'map': { pattern: 'utility', variant: 'map' },
    })

    expect(getSectionRecipePattern('hero')).toEqual({ pattern: 'hero', variant: 'image-overlay' })
    expect(getSectionRecipePattern('card-grid')).toEqual({ pattern: 'utility', variant: 'card-grid' })
  })

  it('keeps recipe metadata out of page-builder consumers', () => {
    const source = readFileSync(new URL('../../../../composables/use-page-builder.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('const SECTION_TO_PATTERN')
  })
})
