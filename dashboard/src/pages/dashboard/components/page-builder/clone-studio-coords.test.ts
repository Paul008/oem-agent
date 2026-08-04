import { describe, expect, it } from 'vitest'

import { computeCloneToolbarAnchor, formatCloneToolbarRegionLabel, translateFramePoint } from './clone-studio-canvas-helpers'

describe('translateFramePoint', () => {
  it('scales iframe coords by frame scale and adds the iframe origin', () => {
    expect(translateFramePoint({ x: 100, y: 50 }, { left: 20, top: 10 }, 0.5)).toEqual({ x: 70, y: 35 })
  })
})

describe('computeCloneToolbarAnchor', () => {
  it('anchors the toolbar inside the visible top edge of a tall selected region', () => {
    const anchor = computeCloneToolbarAnchor(
      { left: 0, top: -200, width: 1252, height: 1549 },
      { width: 1252, height: 900 },
      12,
    )

    expect(anchor).toEqual({ x: 626, y: 12 })
  })
})

describe('formatCloneToolbarRegionLabel', () => {
  it('uses the selected section label and falls back to its region id', () => {
    expect(formatCloneToolbarRegionLabel({ id: 'charging', label: '  Charge ahead  ' })).toBe('Charge ahead')
    expect(formatCloneToolbarRegionLabel({ id: 'clone-region-7' })).toBe('clone-region-7')
  })
})
