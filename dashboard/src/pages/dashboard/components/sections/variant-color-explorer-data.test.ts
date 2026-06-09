import { describe, expect, it } from 'vitest'

import { mergeVariantFallbacks } from './variant-color-explorer-data'

describe('mergeVariantFallbacks', () => {
  it('keeps database variant content while filling missing visuals from captured fallback', () => {
    const result = mergeVariantFallbacks([
      {
        id: 'db-es',
        title: 'ES',
        description: 'Database description',
        key_features: [],
        image_url: null,
        colors: [
          { name: 'White', code: 'WHT', hero_image_url: null, swatch_url: null, hex: null },
        ],
      },
    ], [
      {
        title: 'ES',
        description: 'Captured description',
        key_features: ['Wireless Apple CarPlay'],
        image_url: 'https://example.test/outlander-es-white.png',
        colors: [
          { name: 'White', hero_image_url: 'https://example.test/outlander-es-white.png', hex: 'rgb(255, 255, 255)' },
          { name: 'Red Diamond', hero_image_url: '', hex: 'rgb(200, 0, 20)' },
        ],
      },
    ])

    expect(result).toEqual([
      {
        id: 'db-es',
        title: 'ES',
        description: 'Database description',
        key_features: ['Wireless Apple CarPlay'],
        image_url: 'https://example.test/outlander-es-white.png',
        colors: [
          {
            name: 'White',
            code: 'WHT',
            hero_image_url: 'https://example.test/outlander-es-white.png',
            swatch_url: null,
            hex: 'rgb(255, 255, 255)',
          },
        ],
      },
    ])
  })

  it('returns manual variants when database variants are absent', () => {
    const manual = [
      {
        title: 'ES',
        description: '',
        image_url: '/manual.png',
        key_features: [],
        colors: [],
      },
    ]

    expect(mergeVariantFallbacks([], manual)).toEqual(manual)
  })
})
