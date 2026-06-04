import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchGeneratedPage, fetchRecipes } from '@/lib/worker-api'
import { normalizeStoredMediaUrls, usePageBuilder } from './use-page-builder'

vi.mock('@/lib/worker-api', () => ({
  adaptivePipeline: vi.fn(),
  clonePage: vi.fn(),
  fetchGeneratedPage: vi.fn(),
  fetchRecipes: vi.fn(),
  regenerateSection: vi.fn(),
  saveRecipe: vi.fn(),
  structurePage: vi.fn(),
  updateClonePage: vi.fn(),
  updatePageSections: vi.fn(),
}))

describe('usePageBuilder media URL resolution', () => {
  beforeEach(() => {
    vi.mocked(fetchGeneratedPage).mockReset()
    vi.mocked(fetchRecipes).mockReset()
    vi.mocked(fetchRecipes).mockResolvedValue([])
  })

  it('does not define duplicate section media resolver cases', () => {
    const source = readFileSync(new URL('./use-page-builder.ts', import.meta.url), 'utf8')
    const resolverStart = source.indexOf('function resolveSectionMediaUrls')
    const resolverEnd = source.indexOf('export interface HistoryEntry')
    const resolverSource = source.slice(resolverStart, resolverEnd)
    const cases = Array.from(resolverSource.matchAll(/case '([^']+)'/g), match => match[1])
    const duplicates = cases.filter((type, index) => cases.indexOf(type) !== index)

    expect(duplicates).toEqual([])
  })

  it('loads page-builder detail pages with cloned HTML retained for OEM preview', () => {
    const source = readFileSync(new URL('./use-page-builder.ts', import.meta.url), 'utf8')

    expect(source).toContain('fetchGeneratedPage(newSlug, { includeRendered: true, includeModes: true })')
    expect(source).toContain('fetchGeneratedPage(slug.value, { includeRendered: true, includeModes: true })')
  })

  it('parses Renault page-builder slugs from the canonical OEM list', async () => {
    vi.mocked(fetchGeneratedPage).mockResolvedValueOnce({
      name: 'Arkana',
      header: { slides: [] },
      content: { sections: [] },
    })

    const builder = usePageBuilder()

    await builder.loadPage('renault-au-arkana')

    expect(builder.oemId.value).toBe('renault-au')
    expect(builder.modelSlug.value).toBe('arkana')
    expect(fetchGeneratedPage).toHaveBeenCalledWith('renault-au-arkana', { includeRendered: true, includeModes: true })
    expect(fetchRecipes).toHaveBeenCalledWith('renault-au')
  })

  it('exposes clone-first mode state while keeping structured sections available', () => {
    const builder = usePageBuilder()
    builder.page.value = {
      active_mode: 'clone',
      content: {
        rendered: '<main>OEM clone</main>',
        sections: [{ id: 's1', type: 'hero' }],
        modes: {
          clone: {
            rendered: '<main>OEM clone</main>',
            section_index: [{
              id: 'r1',
              label: 'Hero',
              selector: 'main',
              tag: 'main',
              classes: [],
              top: 0,
              height: 400,
              editable_fields: [],
            }],
          },
          sections: {
            items: [{ id: 's1', type: 'hero' }],
          },
        },
      },
    }

    expect(builder.activeMode.value).toBe('clone')
    expect(builder.cloneHtml.value).toContain('OEM clone')
    expect(builder.cloneRegions.value).toHaveLength(1)
    expect(builder.sections.value).toEqual([{ id: 's1', type: 'hero' }])
  })

  it('restores mode-aware section items on undo', () => {
    const builder = usePageBuilder()
    builder.page.value = {
      active_mode: 'sections',
      content: {
        sections: [{ id: 's1', type: 'hero', heading: 'Original' }],
        modes: {
          sections: {
            items: [{ id: 's1', type: 'hero', heading: 'Original' }],
          },
        },
      },
    }

    builder.replaceSections([{ id: 's1', type: 'hero', heading: 'Edited' }])
    builder.replaceSections([{ id: 's1', type: 'hero', heading: 'Second edit' }])

    expect(builder.sections.value[0].heading).toBe('Second edit')

    builder.undo()

    expect(builder.sections.value[0].heading).toBe('Original')
    expect(builder.page.value.content.sections[0].heading).toBe('Original')
    expect(builder.page.value.content.modes.sections.items[0].heading).toBe('Original')
  })

  it('clears selections that do not belong to the active page mode', () => {
    const builder = usePageBuilder()
    builder.page.value = {
      active_mode: 'clone',
      content: {
        rendered: '<main>OEM clone</main>',
        sections: [{ id: 's1', type: 'hero' }],
        modes: {
          clone: {
            rendered: '<main>OEM clone</main>',
            section_index: [{
              id: 'r1',
              label: 'Hero',
              selector: 'main',
              tag: 'main',
              classes: [],
              top: 0,
              height: 400,
              editable_fields: [],
            }],
          },
          sections: {
            items: [{ id: 's1', type: 'hero' }],
          },
          generated: {
            rendered: '<main>Generated</main>',
          },
        },
      },
    }

    builder.selectSection('s1')
    builder.selectCloneRegion('r1')

    builder.setActiveMode('sections')
    expect(builder.selectedCloneRegionId.value).toBeNull()
    expect(builder.selectedSectionId.value).toBe('s1')

    builder.selectCloneRegion('r1')
    builder.setActiveMode('clone')
    expect(builder.selectedSectionId.value).toBeNull()
    expect(builder.selectedCloneRegionId.value).toBe('r1')

    builder.selectSection('s1')
    builder.selectCloneRegion('r1')
    builder.setActiveMode('generated')
    expect(builder.selectedSectionId.value).toBeNull()
    expect(builder.selectedCloneRegionId.value).toBeNull()
  })

  it('exposes the live selected clone region even when section_index is empty', () => {
    const builder = usePageBuilder()
    builder.page.value = {
      active_mode: 'clone',
      content: {
        rendered: '<main>OEM clone</main>',
        modes: {
          clone: {
            rendered: '<main>OEM clone</main>',
            // Fresh clone: no persisted regions yet.
            section_index: [],
          },
        },
      },
    }

    const liveRegion = {
      id: 'clone-region-1',
      label: 'Hero',
      selector: '[data-oem-region-id="clone-region-1"]',
      tag: 'section',
      classes: ['hero'],
      top: 0,
      height: 800,
      editable_fields: [
        { id: 'f1', selector: 'h1', kind: 'text' as const, label: 'h1', value: 'Mustang' },
      ],
    }

    expect(builder.cloneRegions.value).toHaveLength(0)

    builder.selectCloneRegion(liveRegion)

    expect(builder.selectedCloneRegionId.value).toBe('clone-region-1')
    expect(builder.selectedCloneRegionData.value).toEqual(liveRegion)
    expect(builder.selectedCloneRegionData.value?.editable_fields).toHaveLength(1)

    builder.selectCloneRegion(null)
    expect(builder.selectedCloneRegionData.value).toBeNull()
  })

  it('accumulates touched clone regions into the save set so the sidebar survives reload', () => {
    const builder = usePageBuilder()
    builder.page.value = {
      active_mode: 'clone',
      content: {
        rendered: '<main>OEM clone</main>',
        modes: {
          clone: { rendered: '<main>OEM clone</main>', section_index: [] },
        },
      },
    }

    const region = (id: string, label: string) => ({
      id,
      label,
      selector: `[data-oem-region-id="${id}"]`,
      tag: 'section',
      classes: [],
      top: 0,
      height: 400,
      editable_fields: [],
    })

    expect(builder.cloneRegionsForSave.value).toHaveLength(0)

    builder.selectCloneRegion(region('r1', 'Hero'))
    builder.selectCloneRegion(region('r2', 'Gallery'))
    builder.selectCloneRegion(region('r1', 'Hero (re-selected)')) // upsert, not duplicate

    const ids = builder.cloneRegionsForSave.value.map(r => r.id)
    expect(ids).toEqual(['r1', 'r2'])
    expect(builder.cloneRegionsForSave.value.find(r => r.id === 'r1')?.label).toBe('Hero (re-selected)')
  })

  it('persists a region height override into the save set and clears it on null', () => {
    const builder = usePageBuilder()
    builder.page.value = {
      active_mode: 'clone',
      content: {
        rendered: '<main>OEM clone</main>',
        modes: {
          clone: {
            rendered: '<main>OEM clone</main>',
            section_index: [{
              id: 'r1',
              label: 'Hero',
              selector: 'main',
              tag: 'main',
              classes: [],
              top: 0,
              height: 800,
              editable_fields: [],
            }],
          },
        },
      },
    }

    expect(builder.isDirty.value).toBe(false)

    builder.setRegionHeight('r1', 400)

    const saved = builder.cloneRegionsForSave.value.find(r => r.id === 'r1')
    expect(saved?.height_override).toBe(400)
    expect(builder.isDirty.value).toBe(true)

    builder.setRegionHeight('r1', null)
    const cleared = builder.cloneRegionsForSave.value.find(r => r.id === 'r1')
    expect(cleared?.height_override).toBeUndefined()
  })

  it('normalizes resolved worker media URLs before storage', () => {
    const section = {
      id: 'hero-1',
      type: 'hero',
      desktop_image_url: 'https://oem-agent.adme-dev.workers.dev/media/pages/ford-au/mustang/hero.jpg?size=large',
      mobile_image_url: '/media/pages/ford-au/mustang/hero-mobile.jpg',
      cards: [
        {
          title: 'Interior',
          image_url: 'https://oem-agent.adme-dev.workers.dev/media/pages/ford-au/mustang/interior.jpg',
        },
      ],
    }

    const normalized = normalizeStoredMediaUrls([section])

    expect(normalized).toEqual([
      {
        id: 'hero-1',
        type: 'hero',
        desktop_image_url: '/media/pages/ford-au/mustang/hero.jpg?size=large',
        mobile_image_url: '/media/pages/ford-au/mustang/hero-mobile.jpg',
        cards: [
          {
            title: 'Interior',
            image_url: '/media/pages/ford-au/mustang/interior.jpg',
          },
        ],
      },
    ])
    expect(section.desktop_image_url).toBe('https://oem-agent.adme-dev.workers.dev/media/pages/ford-au/mustang/hero.jpg?size=large')
  })

  it('stores normalized media URLs when page sections are updated', () => {
    const builder = usePageBuilder()
    builder.page.value = {
      content: {
        sections: [],
      },
    }

    builder.sections.value = [
      {
        id: 'gallery-1',
        type: 'gallery',
        images: [
          {
            url: 'https://oem-agent.adme-dev.workers.dev/media/pages/ford-au/mustang/exterior.jpg',
          },
        ],
      },
    ]

    expect(builder.page.value.content.sections).toEqual([
      {
        id: 'gallery-1',
        type: 'gallery',
        images: [
          {
            url: '/media/pages/ford-au/mustang/exterior.jpg',
          },
        ],
      },
    ])
    expect(builder.page.value.content.modes.sections.items).toEqual(builder.page.value.content.sections)
  })
})
