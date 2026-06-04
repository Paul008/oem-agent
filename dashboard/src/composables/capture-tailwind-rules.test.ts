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
  it('dropped props emit nothing (box-shadow deferred to Task 5–6)', () => {
    expect(R.cssTw('line-height', '26.4px')).toEqual(['leading-[26.4px]'])
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
    expect(R.cssTw('opacity', '0')).toEqual(['opacity-[0]'])
    expect(R.cssTw('opacity', '1')).toEqual([])
  })
})

describe('newly-emitted Tailwind props', () => {
  it('line-height: px and unitless', () => {
    expect(R.cssTw('line-height', '26.4px')).toEqual(['leading-[26.4px]'])
    expect(R.cssTw('line-height', '1.55')).toEqual(['leading-[1.55]'])
    expect(R.cssTw('line-height', 'normal')).toEqual([])
  })
  it('letter-spacing', () => {
    expect(R.cssTw('letter-spacing', '0.3px')).toEqual(['tracking-[0.3px]'])
    expect(R.cssTw('letter-spacing', 'normal')).toEqual([])
  })
  it('position offsets and z-index', () => {
    expect(R.cssTw('top', '37px')).toEqual(['top-[37px]'])
    expect(R.cssTw('left', '0px')).toEqual([]) // filtered by the existing 0px guard
    expect(R.cssTw('z-index', '10')).toEqual(['z-[10]'])
    expect(R.cssTw('z-index', 'auto')).toEqual([])
  })
  it('min-width, font-style, text-decoration, font-family', () => {
    expect(R.cssTw('min-width', '240px')).toEqual(['min-w-[240px]'])
    expect(R.cssTw('font-style', 'italic')).toEqual(['italic'])
    expect(R.cssTw('text-decoration', 'underline solid rgb(0,0,0)')).toEqual(['underline'])
    expect(R.cssTw('font-family', 'Inter, sans-serif')).toEqual(['font-[Inter]'])
  })
  it('font-weight: arbitrary fallback for unmapped weights', () => {
    expect(R.cssTw('font-weight', '700')).toEqual(['font-bold'])
    expect(R.cssTw('font-weight', '350')).toEqual(['font-[350]'])
  })
})
