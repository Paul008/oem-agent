import { describe, expect, it } from 'vitest'

import { classifyRegionFidelity, compareRegionPixels } from './region-fidelity'

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
