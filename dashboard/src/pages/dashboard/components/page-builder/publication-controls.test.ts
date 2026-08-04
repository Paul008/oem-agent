// @vitest-environment jsdom

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApp, createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

import type { PublicationHistoryEntry, PublicationValidationSummary } from '@/lib/model-page-publication'

import PublicationControls from './PublicationControls.vue'

const componentPath = resolve(process.cwd(), 'src/pages/dashboard/components/page-builder/PublicationControls.vue')

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

    const rendered = await renderToString(createSSRApp(PublicationControls, {
      draftVersion: 24,
      publishedRevision: 21,
      candidateRevision: 22,
      candidateStatus: 'ready',
      canBuild: true,
      canPublish: true,
      busy: false,
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

  it('disables mounted publication mutations while an operation is busy', async () => {
    const onBuildCandidate = vi.fn()
    const onPublish = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(PublicationControls, {
      draftVersion: 24,
      publishedRevision: 21,
      candidateRevision: 22,
      candidateStatus: 'ready',
      canBuild: true,
      canPublish: true,
      busy: true,
      validation,
      history,
      onBuildCandidate,
      onPublish,
    })
    app.mount(container)

    const buildButton = container.querySelector<HTMLButtonElement>('[title="Build and validate a candidate from the saved draft"]')
    const publishButton = container.querySelector<HTMLButtonElement>('[title="Publish validated candidate"]')
    const rollbackButton = container.querySelector<HTMLButtonElement>('[data-publication-rollback="20"]')

    expect(buildButton?.disabled).toBe(true)
    expect(publishButton?.disabled).toBe(true)
    expect(rollbackButton?.disabled).toBe(true)
    buildButton?.click()
    publishButton?.click()
    expect(onBuildCandidate).not.toHaveBeenCalled()
    expect(onPublish).not.toHaveBeenCalled()
    app.unmount()
    container.remove()
  })

  it('provides a bounded mobile publication menu without removing desktop actions', async () => {
    const rendered = await renderToString(createSSRApp(PublicationControls, {
      draftVersion: 24,
      publishedRevision: 21,
      candidateRevision: 22,
      candidateStatus: 'ready',
      canBuild: true,
      canPublish: true,
      busy: false,
      validation,
      history,
    }))

    expect(rendered).toContain('data-publication-desktop-actions="true"')
    expect(rendered).toContain('hidden items-center gap-1.5 sm:flex')
    expect(rendered).toContain('data-publication-mobile-menu="true"')
    expect(rendered).toContain('sm:hidden')
    expect(rendered).toContain('max-w-[calc(100vw-1rem)]')
  })
})
