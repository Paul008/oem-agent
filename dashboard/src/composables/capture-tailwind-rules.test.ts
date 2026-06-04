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

describe('exact values (font-size, radius, opacity)', () => {
  it('font-size: exact scale match keeps token, else exact px', () => {
    expect(R.cssTw('font-size', '16px')).toEqual(['text-base'])
    expect(R.cssTw('font-size', '17px')).toEqual(['text-[17px]'])
    expect(R.cssTw('font-size', '22px')).toEqual(['text-[22px]'])
  })
  it('border-radius: exact px, rounded-full for pill', () => {
    expect(R.cssTw('border-radius', '6px')).toEqual(['rounded-[6px]'])
    expect(R.cssTw('border-radius', '9999px')).toEqual(['rounded-full'])
  })
  it('opacity: exact arbitrary fraction', () => {
    expect(R.cssTw('opacity', '0.73')).toEqual(['opacity-[.73]'])
    expect(R.cssTw('opacity', '1')).toEqual([])
  })
})
