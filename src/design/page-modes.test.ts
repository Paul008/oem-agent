import { describe, expect, it } from 'vitest'

import {
  applyCloneEdit,
  applyCloneMode,
  applySectionsMode,
  getRenderableCloneHtml,
  normalizePageModes,
} from './page-modes'

describe('page mode helpers', () => {
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
      sourceMode: 'clone',
      sourceVersion: 4,
      generatedAt: '2026-06-03T01:00:00.000Z',
    })

    expect(updated.active_mode).toBe('clone')
    expect(updated.content.modes.sections.items[0].heading).toBe('Extracted')
    expect(updated.content.modes.sections.source.mode).toBe('clone')
    expect(updated.content.rendered).toContain('Clone')
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
})
