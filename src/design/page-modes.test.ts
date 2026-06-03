import { describe, expect, it } from 'vitest'

import {
  applyCloneEdit,
  applyCloneMode,
  applySectionsMode,
  getRenderableCloneHtml,
  normalizePageModes,
} from './page-modes'
import type { SectionsModeContent } from './page-modes'

describe('page mode helpers', () => {
  it('allows sections mode content without source metadata', () => {
    const sectionsMode: SectionsModeContent = { items: [] }

    expect(sectionsMode.items).toHaveLength(0)
  })

  it('normalizes legacy rendered HTML into clone mode', () => {
    const page: any = {
      id: 'ford-au-mustang',
      content: {
        rendered: '<link rel="stylesheet" href="/ford.css"><main>Mustang</main>',
        sections: [],
      },
    }

    const normalized = normalizePageModes(page)

    expect(normalized.active_mode).toBe('clone')
    expect(normalized.content.modes.clone.rendered).toContain('Mustang')
    expect(normalized.content.modes.clone.stylesheet_urls).toEqual(['/ford.css'])
    expect(normalized.content.rendered).toContain('Mustang')
  })

  it('normalizes legacy sections into sections mode without deleting clone HTML', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'clone',
      content: {
        rendered: '<main>Clone</main>',
        sections: [{ id: 's1', type: 'hero', heading: 'Ford Mustang' }],
      },
    }

    const normalized = normalizePageModes(page)

    expect(normalized.active_mode).toBe('clone')
    expect(normalized.content.modes.clone.rendered).toContain('Clone')
    expect(normalized.content.modes.sections.items).toHaveLength(1)
    expect(normalized.content.sections).toHaveLength(1)
  })

  it('applies clone capture without clearing existing sections', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'sections',
      content: {
        sections: [{ id: 's1', type: 'hero', heading: 'Manual Hero' }],
      },
    }

    const updated = applyCloneMode(page, {
      rendered: '<main>Captured Clone</main>',
      source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
      viewport: { width: 1440, height: 1080 },
      asset_map: { 'https://example.com/hero.jpg': '/media/pages/assets/ford-au/mustang/hero.jpg' },
      stylesheet_urls: ['https://www.ford.com.au/site.css'],
      section_index: [{ id: 'clone-1', label: 'Hero', selector: '[data-oem-region="clone-1"]', tag: 'section', classes: ['hero'], top: 0, height: 800, editable_fields: [] }],
      warnings: ['script tags stripped'],
    }, { activate: true })

    expect(updated.active_mode).toBe('clone')
    expect(updated.content.modes.clone.rendered).toContain('Captured Clone')
    expect(updated.content.modes.sections.items).toHaveLength(1)
    expect(updated.content.sections).toHaveLength(1)
  })

  it('activates clone capture when no explicit active mode existed before normalization', () => {
    const page: any = {
      id: 'ford-au-mustang',
      content: {
        modes: {
          generated: { rendered: '<main>Generated</main>' },
        },
      },
    }

    const updated = applyCloneMode(page, {
      rendered: '<main>Captured Clone</main>',
      source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
      viewport: { width: 1440, height: 1080 },
      asset_map: {},
      stylesheet_urls: [],
      section_index: [],
      warnings: [],
    })

    expect(updated.active_mode).toBe('clone')
  })

  it('preserves an explicit valid active mode for clone capture when activation is disabled', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'sections',
      content: {
        sections: [{ id: 's1', type: 'hero', heading: 'Manual Hero' }],
      },
    }

    const updated = applyCloneMode(page, {
      rendered: '<main>Captured Clone</main>',
      source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
      viewport: { width: 1440, height: 1080 },
      asset_map: {},
      stylesheet_urls: [],
      section_index: [],
      warnings: [],
    }, { activate: false })

    expect(updated.active_mode).toBe('sections')
  })

  it('applies structured sections as a derivative without switching away from clone mode', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'clone',
      version: 4,
      content: {
        rendered: '<main>Clone</main>',
        modes: {
          clone: {
            rendered: '<main>Clone</main>',
            source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
        },
      },
    }

    const updated = applySectionsMode(page, [{ id: 's1', type: 'hero', heading: 'Extracted' }], {
      mode: 'clone',
      version: 4,
      generated_at: '2026-06-03T01:00:00.000Z',
    })

    expect(updated.active_mode).toBe('clone')
    expect(updated.content.modes.sections.items[0].heading).toBe('Extracted')
    expect(updated.content.modes.sections.source).toEqual({
      mode: 'clone',
      version: 4,
      generated_at: '2026-06-03T01:00:00.000Z',
    })
    expect(updated.content.rendered).toContain('Clone')
  })

  it('keeps active clone mode when sections are regenerated', () => {
    const page: any = {
      active_mode: 'clone',
      version: 9,
      content: {
        rendered: '<main>Clone</main>',
        sections: [{ id: 'old', type: 'intro' }],
      },
    }

    const updated = applySectionsMode(page, [{ id: 'new', type: 'hero' }], {
      mode: 'clone',
      version: 9,
      generated_at: '2026-06-03T02:00:00.000Z',
    })

    expect(updated.active_mode).toBe('clone')
    expect(updated.content.sections).toEqual([{ id: 'new', type: 'hero' }])
    expect(updated.content.rendered).toContain('Clone')
  })

  it('can refresh clone mode while preserving section mode', () => {
    const page: any = {
      active_mode: 'sections',
      content: {
        modes: {
          sections: { items: [{ id: 's1', type: 'hero', heading: 'Manual' }] },
        },
        sections: [{ id: 's1', type: 'hero', heading: 'Manual' }],
      },
    }

    const updated = applyCloneMode(page, {
      rendered: '<main>New Clone</main>',
      source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
      viewport: { width: 1440, height: 1080 },
      asset_map: {},
      stylesheet_urls: [],
      section_index: [],
      warnings: [],
    })

    expect(updated.active_mode).toBe('sections')
    expect(updated.content.modes.clone.rendered).toContain('New Clone')
    expect(updated.content.modes.sections.items[0].heading).toBe('Manual')
  })

  it('activates sections when the original active mode was invalid despite existing generated content', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'missing-mode',
      content: {
        modes: {
          clone: {
            rendered: '<main>Clone</main>',
            source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
          generated: { rendered: '<main>Generated</main>' },
          template: { template_id: 'x', sections: [] },
        },
      },
    }

    const updated = applySectionsMode(page, [{ id: 's1', type: 'hero', heading: 'Extracted' }], {
      mode: 'generated',
      version: 4,
      generated_at: '2026-06-03T01:00:00.000Z',
    })

    expect(updated.active_mode).toBe('sections')
  })

  it('canonicalizes raw_html section source mode without dropping metadata', () => {
    const page: any = {
      id: 'ford-au-mustang',
      content: {
        modes: {
          sections: {
            items: [{ id: 's1', type: 'hero', heading: 'Extracted' }],
            source: {
              mode: 'raw_html',
              version: 7,
              generated_at: '2026-06-03T03:00:00.000Z',
            },
          },
        },
      },
    }

    const normalized = normalizePageModes(page)

    expect(normalized.content.modes.sections.source).toEqual({
      mode: 'raw-html',
      version: 7,
      generated_at: '2026-06-03T03:00:00.000Z',
    })
  })

  it('preserves generated active mode when generated rendered content is available', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'generated',
      content: {
        rendered: '<main>Legacy</main>',
        modes: {
          generated: { rendered: '<main>Generated</main>' },
        },
      },
    }

    const normalized = normalizePageModes(page)

    expect(normalized.active_mode).toBe('generated')
  })

  it('preserves template active mode when template content is available', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'template',
      content: {
        modes: {
          template: { template_id: 'x', sections: [] },
        },
      },
    }

    const normalized = normalizePageModes(page)

    expect(normalized.active_mode).toBe('template')
  })

  it('saves clone edits separately from the original captured clone', () => {
    const page: any = {
      id: 'ford-au-mustang',
      active_mode: 'clone',
      content: {
        rendered: '<main>Original</main>',
        modes: {
          clone: {
            rendered: '<main>Original</main>',
            source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
        },
      },
    }

    const updated = applyCloneEdit(page, {
      edited_rendered: '<main>Edited</main>',
      section_index: [{ id: 'clone-1', label: 'Main', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
    })

    expect(updated.content.modes.clone.rendered).toContain('Original')
    expect(updated.content.modes.clone.edited_rendered).toContain('Edited')
    expect(getRenderableCloneHtml(updated)).toContain('Edited')
  })

  it('throws when applying clone edits without clone mode content', () => {
    const page: any = {
      id: 'ford-au-mustang',
      content: {
        sections: [],
      },
    }

    expect(() => applyCloneEdit(page, {
      edited_rendered: '<main>Edited</main>',
      section_index: [],
    })).toThrow('Cannot apply clone edit without clone mode content')
  })

  it('throws when saving clone edits for a page without clone mode', () => {
    expect(() => applyCloneEdit({
      active_mode: 'sections',
      content: { sections: [{ id: 's1', type: 'hero' }] },
    }, {
      edited_rendered: '<main>Edited</main>',
      section_index: [],
    })).toThrow('Cannot apply clone edit without clone mode content')
  })

  it('returns renderable clone HTML by edited, original, legacy, empty fallback order', () => {
    expect(getRenderableCloneHtml({
      content: {
        rendered: '<main>Legacy</main>',
        modes: {
          clone: {
            rendered: '<main>Original</main>',
            edited_rendered: '<main>Edited</main>',
            source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
        },
      },
    })).toContain('Edited')

    expect(getRenderableCloneHtml({
      content: {
        rendered: '<main>Legacy</main>',
        modes: {
          clone: {
            rendered: '<main>Original</main>',
            source_url: 'https://www.ford.com.au/showroom/cars/mustang/',
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
        },
      },
    })).toContain('Original')

    expect(getRenderableCloneHtml({
      content: {
        rendered: '<main>Legacy</main>',
      },
    })).toContain('Legacy')

    expect(getRenderableCloneHtml({ content: {} })).toBe('')
  })
})
