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
