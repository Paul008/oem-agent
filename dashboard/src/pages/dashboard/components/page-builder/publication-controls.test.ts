import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

import type { PublicationHistoryEntry, PublicationValidationSummary } from '@/lib/model-page-publication'

const componentUrl = new URL('./PublicationControls.vue', import.meta.url)
const componentPath = fileURLToPath(componentUrl)

const history: PublicationHistoryEntry[] = [{
  pageId: 'nissan-au-ariya',
  revision: 20,
  draftVersion: 23,
  format: 'composed-html-body',
  bodyPath: 'model-pages/nissan-au-ariya/publication/revisions/20/body.html',
  publishedAt: '2026-08-04T00:00:00.000Z',
  publishedBy: 'editor@example.com',
  platformRegions: ['hero', 'variants', 'inventory'],
  etag: '"revision-20"',
  bodyBytes: 1024,
  bodySha256: 'revision-20',
  regionRenderers: [],
}]

const validation: PublicationValidationSummary = {
  publishable: true,
  blocking: [],
  warnings: [{ code: 'visual-diff', message: 'Desktop differs by 0.4%', viewport: 'desktop' }],
  viewports: [],
  digest: 'validation-22',
}

describe('publicationControls', () => {
  it('shows saved draft, production, candidate, validation, and history state', async () => {
    expect(existsSync(componentPath)).toBe(true)
    if (!existsSync(componentPath))
      return

    const { default: PublicationControls } = await import(/* @vite-ignore */ componentUrl.href)
    const rendered = await renderToString(createSSRApp(PublicationControls, {
      draftVersion: 24,
      publishedRevision: 21,
      candidateRevision: 22,
      candidateStatus: 'ready',
      canBuild: true,
      canPublish: true,
      validation,
      history,
    }))

    expect(rendered).toContain('Draft 24 saved')
    expect(rendered).toContain('Production 21')
    expect(rendered).toContain('Candidate 22 ready')
    expect(rendered).toContain('Validation passed')
    expect(rendered).toContain('Desktop differs by 0.4%')
    expect(rendered).toContain('Revision 20')
  })

  it('keeps candidate creation, publish, preview, and rollback as explicit separate actions', () => {
    const source = existsSync(componentPath) ? readFileSync(componentPath, 'utf8') : ''

    expect(source).toContain('emit(\'buildCandidate\')')
    expect(source).toContain('emit(\'previewCandidate\')')
    expect(source).toContain('emit(\'publish\')')
    expect(source).toContain('emit(\'rollback\', revision)')
    expect(source).toContain('Publish candidate {{ candidateRevision }} over production {{ publishedRevision ?? \'none\' }}?')
    expect(source).toContain('Roll back production from {{ publishedRevision ?? \'none\' }} to revision {{ rollbackRevision }}?')

    const rollbackStart = source.indexOf('function confirmRollback')
    const rollbackEnd = source.indexOf('</script>', rollbackStart)
    expect(source.slice(rollbackStart, rollbackEnd)).not.toContain('emit(\'buildCandidate\')')
  })
})
