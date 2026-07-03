import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  getGeneratedPageSectionCount,
  getGeneratedPageStatus,
  hasGeneratedPageClone,
  hasGeneratedPageSections,
  summarizeGeneratedPageStatuses,
} from './model-pages-status'

describe('model-pages status helpers', () => {
  it('returns unknown for missing page detail data', () => {
    expect(getGeneratedPageStatus(null)).toBe('unknown')
    expect(getGeneratedPageStatus(undefined)).toBe('unknown')
  })

  it('counts legacy content sections', () => {
    const page = {
      content: {
        sections: [{ id: 'hero' }, { id: 'specs' }],
      },
    }

    expect(getGeneratedPageSectionCount(page)).toBe(2)
    expect(hasGeneratedPageSections(page)).toBe(true)
    expect(getGeneratedPageStatus(page)).toBe('structured')
  })

  it('counts mode-aware section items', () => {
    const page = {
      content: {
        modes: {
          sections: {
            items: [{ id: 'hero' }, { id: 'features' }, { id: 'cta' }],
          },
        },
      },
    }

    expect(getGeneratedPageSectionCount(page)).toBe(3)
    expect(hasGeneratedPageSections(page)).toBe(true)
    expect(getGeneratedPageStatus(page)).toBe('structured')
  })

  it('prefers structured status when clone payloads and sections both exist', () => {
    const page = {
      active_mode: 'clone',
      content: {
        modes: {
          clone: { rendered: '<html><body>Clone</body></html>' },
          sections: { items: [{ id: 'hero' }] },
        },
      },
    }

    expect(hasGeneratedPageClone(page)).toBe(true)
    expect(getGeneratedPageStatus(page)).toBe('structured')
  })

  it('detects clone-only pages from mode rendered HTML', () => {
    expect(getGeneratedPageStatus({
      content: {
        modes: {
          clone: { rendered: '<main>Clone</main>' },
        },
      },
    })).toBe('cloned')

    expect(getGeneratedPageStatus({
      content: {
        modes: {
          clone: { edited_rendered: '<main>Edited clone</main>' },
        },
      },
    })).toBe('cloned')
  })

  it('detects legacy clone HTML with clone markers', () => {
    expect(getGeneratedPageStatus({
      content: {
        rendered: '<html><head><script src="https://cdn.tailwindcss.com"></script></head></html>',
      },
    })).toBe('cloned')

    expect(getGeneratedPageStatus({
      content: {
        rendered: '<html><head><link rel="stylesheet" href="/captured.css"></head></html>',
      },
    })).toBe('cloned')
  })

  it('returns generated for loaded pages without sections or clone HTML', () => {
    expect(getGeneratedPageStatus({
      content: {
        rendered: '<section>Legacy generated component</section>',
      },
    })).toBe('generated')
  })

  it('summarizes cached page status counts', () => {
    const summary = summarizeGeneratedPageStatuses([
      null,
      { content: { sections: [{ id: 'hero' }] } },
      { content: { modes: { clone: { rendered: '<main>Clone</main>' } } } },
      { content: { rendered: '<section>Generated</section>' } },
    ])

    expect(summary).toEqual({
      total: 4,
      loaded: 3,
      unknown: 1,
      structured: 1,
      cloned: 1,
      generated: 1,
    })
  })
})

describe('model-pages dashboard integration', () => {
  it('uses mode-aware status helpers for details, badges, and cached inventory', () => {
    const source = readFileSync(new URL('./model-pages.vue', import.meta.url), 'utf8')

    expect(source).toContain('getGeneratedPageSectionCount')
    expect(source).toContain('getGeneratedPageStatus')
    expect(source).toContain('summarizeGeneratedPageStatuses')
    expect(source).toContain('import type { GeneratedPageStatus } from \'./model-pages-status\'')
    expect(source).toContain('} from \'./model-pages-status\'')

    expect(source).toContain('fetchGeneratedPage(fullSlug(item), { includeModes: true })')
    expect(source).toContain('type PageStatus = GeneratedPageStatus')
    expect(source).toContain('unknown: { label: \'Loading\'')
    expect(source).toContain('getGeneratedPageSectionCount(getModelPageData(model))')
    expect(source).toContain('summarizeGeneratedPageStatuses([...pageCache.value.values()])')

    expect(source).toContain('Structured Pages')
    expect(source).toContain('Clone-only')
    expect(source).toContain('Loaded Details')
  })

  it('surfaces the adaptive pipeline as the full preview action', () => {
    const source = readFileSync(new URL('./model-pages.vue', import.meta.url), 'utf8')

    expect(source).toContain('Build Full Preview')
    expect(source).toContain('Rebuild Full Preview')
    expect(source).toContain('Run full preview pipeline (clone, structure, refresh preview)')
    expect(source).toContain('@click.stop="triggerGenerate(model, $event)"')
    expect(source).toContain('triggerGenerateAll(group.oemId, $event)')
    expect(source).toContain('Rebuilding full preview...')
    expect(source).toContain('fetchCompileRunStatus')
    expect(source).toContain('startCompileStatusPolling(model)')
    expect(source).toContain('setCompileStatusMessage(model, status.stageLabel)')
    expect(source).toContain('Full preview rebuilt')
    expect(source).toContain('result?.success === false')
  })
})
