import { describe, expect, it } from 'vitest'

import { classifyRegionFidelity, compareRegionPixels, measureRegionOverflow } from './region-fidelity'

describe('classifyRegionFidelity', () => {
  it.each([
    [0, 'pixel-perfect'],
    [0.01, 'pixel-perfect'],
    [0.010001, 'review'],
    [0.03, 'review'],
    [0.030001, 'mismatch'],
    [Number.NaN, 'mismatch'],
  ] as const)('classifies %s as %s', (value, expected) => {
    expect(classifyRegionFidelity(value)).toBe(expected)
  })
})

describe('compareRegionPixels', () => {
  it('uses the maximum RGBA channel delta', () => {
    const reference = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255])
    const candidate = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255])
    expect(compareRegionPixels(reference, candidate)).toMatchObject({
      comparedPixels: 2,
      differentPixels: 1,
      mismatchRatio: 0.5,
      status: 'mismatch',
    })
  })

  it('fails closed when image dimensions differ', () => {
    expect(compareRegionPixels(new Uint8ClampedArray(4), new Uint8ClampedArray(8))).toMatchObject({
      comparedPixels: 0,
      mismatchRatio: 1,
      status: 'mismatch',
    })
  })
})

describe('measureRegionOverflow', () => {
  it('records dimensions and detects horizontal overflow and clipped media', () => {
    const root = {
      scrollWidth: 401,
      clientWidth: 390,
      scrollHeight: 844,
      clientHeight: 844,
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 390, bottom: 844 }),
      querySelectorAll: () => [{
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 420, bottom: 300 }),
      }],
    } as unknown as Element

    expect(measureRegionOverflow(root)).toEqual({
      scrollWidth: 401,
      clientWidth: 390,
      scrollHeight: 844,
      clientHeight: 844,
      horizontalOverflow: true,
      verticalOverflow: false,
      clippedMedia: 1,
      clippedContent: true,
    })
  })
})
