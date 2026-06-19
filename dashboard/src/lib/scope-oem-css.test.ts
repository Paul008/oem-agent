import { describe, expect, it } from 'vitest'

import { scopeOemCss } from './scope-oem-css'

describe('scopeOemCss', () => {
  it('prefixes simple class selectors', () => {
    const input = '.hero { color: red; }'
    expect(scopeOemCss(input, 'abc123')).toBe('.oem-section-abc123 .hero { color: red; }')
  })

  it('scopes html, body, and :root selectors to the section wrapper', () => {
    const input = 'html { font-size: 16px; } body { margin: 0; } :root { --brand: blue; }'
    expect(scopeOemCss(input, 'sec-1')).toBe('.oem-section-sec-1 { font-size: 16px; } .oem-section-sec-1 { margin: 0; } .oem-section-sec-1 { --brand: blue; }')
  })

  it('rewrites id selectors to data-oem-id attributes', () => {
    const input = '#model-name { font-size: 48px; }'
    expect(scopeOemCss(input, 'x')).toBe('.oem-section-x [data-oem-id="model-name"] { font-size: 48px; }')
  })

  it('preserves media queries and scopes their contents', () => {
    const input = '@media (min-width: 1024px) { .hero h1 { color: white; } }'
    expect(scopeOemCss(input, 's')).toBe('@media (min-width: 1024px) { .oem-section-s .hero h1 { color: white; } }')
  })

  it('leaves @font-face rules global', () => {
    const input = '@font-face { font-family: OEM; src: url(/font.woff); } .x { font-family: OEM; }'
    expect(scopeOemCss(input, 'f')).toBe('@font-face { font-family: OEM; src: url(/font.woff); } .oem-section-f .x { font-family: OEM; }')
  })

  it('prefixes @keyframes names and their references', () => {
    const input = '@keyframes fade { from { opacity: 0; } } .x { animation: 1s fade infinite; }'
    expect(scopeOemCss(input, 'k')).toBe('@keyframes oem-section-k-fade { from { opacity: 0; } } .oem-section-k .x { animation: 1s oem-section-k-fade infinite; }')
  })

  it('sanitizes section ids into valid class names', () => {
    const input = '.a { color: red; }'
    expect(scopeOemCss(input, 'sec/with:weird#id')).toBe('.oem-section-sec-with-weird-id .a { color: red; }')
  })

  it('can drop root-only rules when configured', () => {
    const input = 'html { font-size: 16px; } .hero { color: red; }'
    expect(scopeOemCss(input, 'r', { rootSelectorMode: 'remove' })).toBe('.oem-section-r .hero { color: red; }')
  })
})
