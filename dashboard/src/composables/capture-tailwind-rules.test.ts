import { describe, expect, it } from 'vitest'
import { tailwindRules } from './capture-tailwind-rules'

const R = tailwindRules()

describe('tailwindRules (characterization — current behavior)', () => {
  it('colors → exact hex / keywords', () => {
    expect(R.colTw('rgb(0, 0, 0)')).toBe('black')
    expect(R.colTw('rgb(255, 255, 255)')).toBe('white')
    expect(R.colTw('rgba(0, 0, 0, 0)')).toBe('transparent')
    expect(R.colTw('rgb(26, 26, 26)')).toBe('[#1a1a1a]')
  })
  it('spacing → scale or exact arbitrary', () => {
    expect(R.cssTw('padding-top', '16px')).toEqual(['pt-4'])
    expect(R.cssTw('padding-top', '37px')).toEqual(['pt-[37px]'])
  })
  it('font-size currently SNAPS to scale (lossy — changes in Task 3)', () => {
    expect(R.cssTw('font-size', '16px')).toEqual(['text-base'])
    expect(R.cssTw('font-size', '17px')).toEqual(['text-base'])
  })
  it('border-radius currently BUCKETED (lossy — changes in Task 3)', () => {
    expect(R.cssTw('border-radius', '6px')).toEqual(['rounded-lg'])
  })
  it('opacity currently emits round(*100) (lossy — changes in Task 3)', () => {
    expect(R.cssTw('opacity', '0.73')).toEqual(['opacity-73'])
  })
  it('dropped props currently emit nothing (changes in Tasks 4–6)', () => {
    expect(R.cssTw('line-height', '26.4px')).toEqual([])
    expect(R.cssTw('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')).toEqual([])
    expect(R.styleTw('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')).toBe('')
  })
  it('maps Bootstrap classes', () => {
    expect(R.mapClasses('d-flex justify-content-center')).toEqual(['flex', 'justify-center'])
    expect(R.mapClasses('col-6')).toEqual(['w-1/2'])
  })
})
