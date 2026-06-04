import { describe, it, expect } from 'vitest'
import { clampRegionHeight } from './CloneStudioCanvas.vue'
describe('clampRegionHeight', () => {
  it('returns pointer offset within [min, naturalHeight]', () => {
    expect(clampRegionHeight(300, 100, 500)).toBe(200)
  })
  it('clamps to min', () => {
    expect(clampRegionHeight(110, 100, 500, 40)).toBe(40)
  })
  it('clamps to natural height', () => {
    expect(clampRegionHeight(900, 100, 500)).toBe(500)
  })
})
