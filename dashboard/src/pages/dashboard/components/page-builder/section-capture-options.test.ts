import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { RAW_HTML_CAPTURE_TYPE, SECTION_CAPTURE_TYPE_OPTIONS } from './section-capture-options'

describe('section capture options', () => {
  it('derives capture type labels from shared section metadata', () => {
    expect(SECTION_CAPTURE_TYPE_OPTIONS).toEqual([
      { value: '_raw_html', label: 'HTML → Tailwind', divider: true },
      { value: 'content-block', label: 'Content Block' },
      { value: 'feature-cards', label: 'Feature Cards' },
      { value: 'hero', label: 'Hero' },
      { value: 'intro', label: 'Intro' },
      { value: 'image', label: 'Image' },
      { value: 'gallery', label: 'Gallery' },
      { value: 'heading', label: 'Heading' },
      { value: 'testimonial', label: 'Testimonial' },
      { value: 'stats', label: 'Stats' },
      { value: 'cta-banner', label: 'CTA Banner' },
    ])

    expect(RAW_HTML_CAPTURE_TYPE).toBe('_raw_html')
  })

  it('keeps capture type option catalogs out of SectionCapture', () => {
    const source = readFileSync(new URL('./SectionCapture.vue', import.meta.url), 'utf8')

    expect(source).not.toContain('const SECTION_TYPE_OPTIONS')
  })
})
