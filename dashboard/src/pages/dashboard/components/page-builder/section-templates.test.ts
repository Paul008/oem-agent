import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createSectionTabItem,
  getSectionRecipeDefaults,
  getSectionRecipePattern,
  getSectionSplittableField,
  SECTION_DEFAULTS,
  SECTION_RECIPE_CONTENT_FIELDS,
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

describe('section nested item defaults', () => {
  it('creates fresh tab items with the full tabs schema', () => {
    const first = createSectionTabItem()
    const second = createSectionTabItem({ label: 'Design', content_html: '<p>Design</p>' })

    expect(first).toEqual({
      label: 'Tab 1',
      content_html: '',
      image_url: '',
      image_disclaimer: '',
      disclaimer: '',
    })
    expect(second).toEqual({
      label: 'Design',
      content_html: '<p>Design</p>',
      image_url: '',
      image_disclaimer: '',
      disclaimer: '',
    })
    expect(first).not.toBe(second)
  })

  it('uses shared tab item defaults for blank tab sections', () => {
    const section = SECTION_DEFAULTS.tabs()

    expect(section.tabs).toEqual([createSectionTabItem()])
    expect(section.tabs[0]).not.toBe(createSectionTabItem())
  })

  it('keeps tab item literals out of the editor add action', () => {
    const source = readFileSync(new URL('./SectionProperties.vue', import.meta.url), 'utf8')

    expect(source).not.toContain("addArrayItem('tabs', {")
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

describe('section recipe defaults', () => {
  it('centralizes fields excluded from saved recipe defaults', () => {
    expect([...SECTION_RECIPE_CONTENT_FIELDS]).toEqual([
      'id',
      'order',
      'type',
      '_recipe',
      'heading',
      'sub_heading',
      'title',
      'body',
      'body_html',
      'content_html',
      'cta_text',
      'cta_url',
      'message',
      'cards',
      'tabs',
      'images',
      'colors',
      'categories',
      'testimonials',
      'logos',
      'stats',
      'tiers',
      'columns_data',
      'rows',
      'items',
      'video_url',
      'poster_url',
      'embed_url',
      'desktop_image_url',
      'mobile_image_url',
      'image_url',
      'background_image_url',
    ])
  })

  it('extracts reusable defaults while stripping content fields and empty values', () => {
    const defaults = getSectionRecipeDefaults({
      id: 'hero-1',
      order: 0,
      type: 'hero',
      heading: 'Mustang',
      desktop_image_url: '/media/hero.jpg',
      overlay_position: 'center',
      show_overlay: true,
      empty_string: '',
      null_value: null,
      undefined_value: undefined,
    })

    expect(defaults).toEqual({
      overlay_position: 'center',
      show_overlay: true,
    })
  })

  it('infers card composition from the first saved card', () => {
    const defaults = getSectionRecipeDefaults({
      type: 'card-grid',
      cards: [
        {
          image_url: '/media/card.jpg',
          icon: 'zap',
          title: 'Fast',
          description: 'Built for pace',
          cta_text: 'Explore',
        },
      ],
      columns: 3,
    })

    expect(defaults).toEqual({
      columns: 3,
      card_composition: ['image', 'icon', 'title', 'body', 'cta'],
    })
  })

  it('keeps recipe default extraction out of page-builder consumers', () => {
    const source = readFileSync(new URL('../../../../composables/use-page-builder.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('const CONTENT_FIELDS')
  })
})
