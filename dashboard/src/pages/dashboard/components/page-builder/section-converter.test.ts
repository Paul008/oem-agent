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

    expect(source).not.toContain("image_disclaimer: '',\n        disclaimer: '',")
  })
})
