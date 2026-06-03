import { describe, expect, it } from 'vitest'

import {
  getActivePageMode,
  getAvailablePageModes,
  getCloneHtml,
  getCloneRegions,
  getSectionItems,
  normalizeDashboardPageModes,
} from './page-modes'

describe('dashboard page modes', () => {
  it('defaults cloned pages to clone mode even when sections exist', () => {
    const page = normalizeDashboardPageModes({
      active_mode: 'clone',
      content: {
        rendered: '<main>Ford clone</main>',
        sections: [{ id: 's1', type: 'hero' }],
      },
    })

    expect(getActivePageMode(page)).toBe('clone')
    expect(getCloneHtml(page)).toContain('Ford clone')
    expect(getSectionItems(page)).toHaveLength(1)
  })

  it('finds clone HTML from edited clone before original clone', () => {
    const page = normalizeDashboardPageModes({
      content: {
        modes: {
          clone: {
            rendered: '<main>Original</main>',
            edited_rendered: '<main>Edited</main>',
            section_index: [],
          },
        },
      },
    })

    expect(getCloneHtml(page)).toContain('Edited')
  })

  it('returns clone regions from mode metadata', () => {
    const page = normalizeDashboardPageModes({
      content: {
        rendered: '<main>Clone</main>',
        modes: {
          clone: {
            rendered: '<main>Clone</main>',
            section_index: [{ id: 'r1', label: 'Hero', selector: 'main', tag: 'main', classes: [], top: 0, height: 400, editable_fields: [] }],
          },
        },
      },
    })

    expect(getCloneRegions(page)[0].label).toBe('Hero')
  })

  it('reports available modes without duplicating legacy data', () => {
    const page = normalizeDashboardPageModes({
      content: {
        rendered: '<main>Clone</main>',
        sections: [{ id: 's1', type: 'hero' }],
      },
    })

    expect(getAvailablePageModes(page)).toEqual(['clone', 'sections'])
  })
})
