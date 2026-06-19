import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  convertSectionData,
  getConversionGridColumns,
} from './section-converter'

describe('section conversion grid columns', () => {
  it('chooses valid grid columns for conversion-generated card layouts', () => {
    expect(getConversionGridColumns([])).toBe(3)
    expect(getConversionGridColumns([{}])).toBe(3)
    expect(getConversionGridColumns([{}, {}])).toBe(2)
    expect(getConversionGridColumns([{}, {}, {}])).toBe(3)
    expect(getConversionGridColumns([{}, {}, {}, {}])).toBe(4)
    expect(getConversionGridColumns([{}, {}, {}, {}, {}])).toBe(4)
  })

  it('uses the shared grid-column helper when converting lists into feature cards', () => {
    const converted = convertSectionData({
      id: 'gallery-1',
      order: 1,
      type: 'gallery',
      title: 'Gallery',
      images: [{ url: '/media/one.jpg', alt: 'One', caption: 'One' }],
    }, 'feature-cards')

    expect(converted).toMatchObject({
      id: 'gallery-1',
      order: 1,
      type: 'feature-cards',
      title: 'Gallery',
      columns: 3,
      cards: [{ title: 'One', description: '', image_url: '/media/one.jpg' }],
    })
  })

  it('keeps conversion column selection centralized', () => {
    const source = readFileSync(new URL('./section-converter.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('columns: Math.min(')
  })
})

describe('section conversion nested item defaults', () => {
  it('uses the full shared tab item shape when converting galleries into tabs', () => {
    const converted = convertSectionData({
      id: 'gallery-tabs',
      order: 2,
      type: 'gallery',
      title: 'Highlights',
      images: [{ url: '/media/design.jpg', alt: 'Design', caption: 'Design', description: 'Sharp lines' }],
    }, 'tabs')

    expect(converted).toMatchObject({
      id: 'gallery-tabs',
      order: 2,
      type: 'tabs',
      title: 'Highlights',
      tabs: [{
        label: 'Design',
        content_html: '<p>Sharp lines</p>',
        image_url: '/media/design.jpg',
        image_disclaimer: '',
        disclaimer: '',
      }],
      default_tab: 0,
    })
  })

  it('keeps tab item literals centralized in conversions', () => {
    const source = readFileSync(new URL('./section-converter.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('image_disclaimer: \'\',\n        disclaimer: \'\',')
  })

  it('uses the full shared showcase image shape when converting a single image into an image showcase', () => {
    const converted = convertSectionData({
      id: 'image-1',
      order: 3,
      type: 'image',
      desktop_image_url: '/media/detail.jpg',
      alt: 'Detail',
      caption: 'Cabin detail',
    }, 'image-showcase')

    expect(converted).toMatchObject({
      id: 'image-1',
      order: 3,
      type: 'image-showcase',
      title: 'Cabin detail',
      images: [{
        url: '/media/detail.jpg',
        alt: 'Detail',
        caption: 'Cabin detail',
        description: '',
        overlay_position: 'bottom-left',
      }],
      layout: 'stacked',
    })
  })

  it('keeps image showcase item literals centralized in conversions', () => {
    const source = readFileSync(new URL('./section-converter.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('description: \'\', overlay_position: \'bottom-left\'')
    expect(source).not.toContain('description: img.description || \'\',\n        overlay_position: \'bottom-left\',')
  })

  it('uses the shared feature card shape when converting stats into feature cards', () => {
    const converted = convertSectionData({
      id: 'stats-1',
      order: 4,
      type: 'stats',
      title: 'Performance',
      stats: [{ value: '350', unit: 'kW', label: 'Power', icon_url: '/media/power.svg' }],
    }, 'feature-cards')

    expect(converted).toMatchObject({
      id: 'stats-1',
      order: 4,
      type: 'feature-cards',
      title: 'Performance',
      cards: [{
        title: '350 kW',
        description: 'Power',
        image_url: '/media/power.svg',
      }],
      columns: 3,
    })
  })

  it('keeps feature card item literals centralized in conversions', () => {
    const source = readFileSync(new URL('./section-converter.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('cards: (s.images || []).map((img: any) => ({')
    expect(source).not.toContain('cards: (s.tabs || []).map((t: any) => ({')
    expect(source).not.toContain('cards: (s.items || []).map((item: any) => ({')
    expect(source).not.toContain('cards: (s.testimonials || []).map((t: any) => ({')
    expect(source).not.toContain('cards: (s.stats || []).map((stat: any) => ({')
    expect(source).not.toContain('cards: (s.logos || []).map((logo: any) => ({')
    expect(source).not.toContain('cards: (s.tiers || []).map((t: any) => ({')
  })

  it('uses the shared accordion item shape when converting feature cards into accordion items', () => {
    const converted = convertSectionData({
      id: 'features-1',
      order: 5,
      type: 'feature-cards',
      title: 'Highlights',
      cards: [{ title: 'Towing', description: 'Up to 3500kg', image_url: '/media/tow.jpg' }],
    }, 'accordion')

    expect(converted).toMatchObject({
      id: 'features-1',
      order: 5,
      type: 'accordion',
      title: 'Highlights',
      items: [{
        question: 'Towing',
        answer: 'Up to 3500kg',
      }],
      section_id: '',
    })
  })

  it('keeps accordion item literals centralized in conversions', () => {
    const source = readFileSync(new URL('./section-converter.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('items: (s.cards || []).map((c: any) => ({')
    expect(source).not.toContain('items: (s.tabs || []).map((t: any) => ({')
    expect(source).not.toContain('items: (s.testimonials || []).map((t: any) => ({')
    expect(source).not.toContain('items: (s.rows || []).map((r: any) => ({')
    expect(source).not.toContain('items: (s.categories || []).map((cat: any) => ({')
    expect(source).not.toContain('items: (s.tiers || []).map((t: any) => ({')
  })
})
