import { describe, expect, it } from 'vitest'

import { scopeOemSection } from './scope-oem-section'

describe('scopeOemSection', () => {
  it('scopes html and css together', () => {
    const result = scopeOemSection(
      { html: '<div class="hero">Hi</div>', css: '.hero { color: red; }' },
      'abc123',
    )
    expect(result.scopeClass).toBe('oem-section-abc123')
    expect(result.html).toBe('<div class="hero">Hi</div>')
    expect(result.css).toBe('.oem-section-abc123 .hero { color: red; }')
  })

  it('rewrites id attributes and selectors together', () => {
    const result = scopeOemSection(
      { html: '<h1 id="title">Title</h1>', css: '#title { font-size: 48px; }' },
      's1',
    )
    expect(result.html).toBe('<h1 data-oem-id="title">Title</h1>')
    expect(result.css).toBe('.oem-section-s1 [data-oem-id="title"] { font-size: 48px; }')
  })

  it('rewrites inline animation keyframe names', () => {
    const result = scopeOemSection(
      {
        html: '<div style="animation: 1s fade infinite">x</div>',
        css: '@keyframes fade { from { opacity: 0; } }',
      },
      'anim',
    )
    expect(result.css).toContain('@keyframes oem-section-anim-fade')
    expect(result.html).toContain('animation: 1s oem-section-anim-fade infinite')
  })

  it('leaves html untouched when no css is supplied', () => {
    const result = scopeOemSection(
      { html: '<h1 id="title">Title</h1>' },
      'empty',
    )
    expect(result.html).toBe('<h1 data-oem-id="title">Title</h1>')
    expect(result.css).toBe('')
  })

  it('sanitizes section ids into valid class names', () => {
    const result = scopeOemSection(
      { html: '<div></div>', css: '.a { color: red; }' },
      'sec/with:weird#id',
    )
    expect(result.scopeClass).toBe('oem-section-sec-with-weird-id')
    expect(result.css).toBe('.oem-section-sec-with-weird-id .a { color: red; }')
  })
})
