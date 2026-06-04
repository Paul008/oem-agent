import { describe, it, expect } from 'vitest'
import { translateFramePoint } from './CloneStudioCanvas.vue'

describe('translateFramePoint', () => {
  it('scales iframe coords by frame scale and adds the iframe origin', () => {
    expect(translateFramePoint({ x: 100, y: 50 }, { left: 20, top: 10 }, 0.5)).toEqual({ x: 70, y: 35 })
  })
})
