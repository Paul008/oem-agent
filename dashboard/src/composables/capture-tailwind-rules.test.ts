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
  it('box-shadow: cssTw returns [] (routes to inline), styleTw returns inline string', () => {
    expect(R.cssTw('line-height', '26.4px')).toEqual(['leading-[26.4px]'])
    expect(R.cssTw('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')).toEqual([])
    expect(R.styleTw('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')).toBe('box-shadow:0 4px 12px rgba(0,0,0,0.3)')
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

describe('borderTw', () => {
  function makeReader(map: Record<string, string>) {
    return function (p: string) { return map[p] || '' }
  }
  function uniform(width: string, style: string, color: string) {
    var m: Record<string, string> = {}
    ;['top', 'right', 'bottom', 'left'].forEach(function (s) {
      m['border-' + s + '-width'] = width
      m['border-' + s + '-style'] = style
      m['border-' + s + '-color'] = color
    })
    return m
  }

  it('no border → empty', () => {
    expect(R.borderTw(makeReader(uniform('0px', 'none', 'rgb(0, 0, 0)')))).toEqual({ classes: [], style: '' })
  })
  it('uniform solid → Tailwind tokens', () => {
    expect(R.borderTw(makeReader(uniform('2px', 'solid', 'rgb(226, 226, 226)')))).toEqual({
      classes: ['border-[length:2px]', 'border-[color:#e2e2e2]', 'border-solid'],
      style: '',
    })
  })
  it('uniform dashed → border-dashed token', () => {
    const r = R.borderTw(makeReader(uniform('1px', 'dashed', 'rgb(0, 0, 0)')))
    expect(r.classes).toContain('border-dashed')
    expect(r.classes).toContain('border-[length:1px]')
    expect(r.style).toBe('')
  })
  it('non-uniform (only bottom) → inline border-bottom', () => {
    expect(R.borderTw(makeReader({
      'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': 'rgb(204, 204, 204)',
      'border-top-width': '0px', 'border-right-width': '0px', 'border-left-width': '0px',
    }))).toEqual({ classes: [], style: 'border-bottom:1px solid rgb(204, 204, 204)' })
  })
  it('non-tokenizable uniform style (groove) → inline all sides', () => {
    const r = R.borderTw(makeReader(uniform('2px', 'groove', 'rgb(0, 0, 0)')))
    expect(r.classes).toEqual([])
    expect(r.style).toBe('border-top:2px groove rgb(0, 0, 0);border-right:2px groove rgb(0, 0, 0);border-bottom:2px groove rgb(0, 0, 0);border-left:2px groove rgb(0, 0, 0)')
  })
  it('uniform rgba color → inline (not a broken Tailwind token)', () => {
    const r = R.borderTw(makeReader(uniform('1px', 'solid', 'rgba(0, 0, 0, 0.1)')))
    expect(r.classes).toEqual([])
    expect(r.style).toBe('border-top:1px solid rgba(0, 0, 0, 0.1);border-right:1px solid rgba(0, 0, 0, 0.1);border-bottom:1px solid rgba(0, 0, 0, 0.1);border-left:1px solid rgba(0, 0, 0, 0.1)')
  })
  it('mixed widths (4 sides, same color/style) → inline', () => {
    const r = R.borderTw(makeReader({
      'border-top-width': '1px', 'border-top-style': 'solid', 'border-top-color': 'rgb(0, 0, 0)',
      'border-right-width': '2px', 'border-right-style': 'solid', 'border-right-color': 'rgb(0, 0, 0)',
      'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': 'rgb(0, 0, 0)',
      'border-left-width': '1px', 'border-left-style': 'solid', 'border-left-color': 'rgb(0, 0, 0)',
    }))
    expect(r.classes).toEqual([])
    expect(r.style).toBe('border-top:1px solid rgb(0, 0, 0);border-right:2px solid rgb(0, 0, 0);border-bottom:1px solid rgb(0, 0, 0);border-left:1px solid rgb(0, 0, 0)')
  })
})

describe('styleTw inline routing', () => {
  it('routes un-tokenizable props verbatim', () => {
    expect(R.styleTw('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')).toBe('box-shadow:0 4px 12px rgba(0,0,0,0.3)')
    expect(R.styleTw('background-image', 'linear-gradient(180deg, #000, rgba(0,0,0,0))')).toBe('background-image:linear-gradient(180deg, #000, rgba(0,0,0,0))')
    expect(R.styleTw('transform', 'translateX(-50%)')).toBe('transform:translateX(-50%)')
    expect(R.styleTw('filter', 'blur(4px)')).toBe('filter:blur(4px)')
    expect(R.styleTw('backdrop-filter', 'blur(2px)')).toBe('backdrop-filter:blur(2px)')
    expect(R.styleTw('clip-path', 'inset(0 0 50% 0)')).toBe('clip-path:inset(0 0 50% 0)')
    expect(R.styleTw('mask', 'url(#m)')).toBe('mask:url(#m)')
  })
  it('returns empty for none/empty and for non-inline props', () => {
    expect(R.styleTw('box-shadow', 'none')).toBe('')
    expect(R.styleTw('background-image', 'none')).toBe('')
    expect(R.styleTw('transform', 'none')).toBe('')
    expect(R.styleTw('background-image', 'rgba(0, 0, 0, 0)')).toBe('')
    expect(R.styleTw('font-size', '17px')).toBe('') // Tailwind-routed → not inline
  })
})
