// @vitest-environment jsdom

import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, createSSRApp, defineComponent, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

import type { PublicationHistoryEntry, PublicationValidationSummary } from '@/lib/model-page-publication'

import PublicationControls from './PublicationControls.vue'

const componentUrl = new URL('./PublicationControls.vue', pathToFileURL(import.meta.filename))

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

afterEach(() => {
  document.body.innerHTML = ''
})

function findDialog(title: string): HTMLElement | null {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[data-slot="alert-dialog-content"]'))
    .find(dialog => dialog.textContent?.includes(title)) ?? null
}

function findButton(root: ParentNode, label: string): HTMLButtonElement | null {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button.textContent?.trim() === label) ?? null
}

describe('publicationControls', () => {
  it('shows saved draft, production, candidate, validation, and history state', async () => {
    expect(existsSync(componentUrl)).toBe(true)
    if (!existsSync(componentUrl))
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

    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(PublicationControls, {
      draftVersion: 24,
      publishedRevision: 21,
      candidateRevision: 22,
      candidateStatus: 'ready',
      canBuild: true,
      canPublish: true,
      busy: false,
      validation,
      history,
    })
    app.mount(container)
    container.querySelector<HTMLElement>('[data-publication-mobile-menu="true"] [data-slot="popover-trigger"]')?.click()
    await nextTick()
    const menu = document.body.querySelector<HTMLElement>('[data-publication-mobile-menu-content="true"]')
    expect(menu?.textContent).toContain('Validation passed')
    expect(menu?.textContent).toContain('Desktop differs by 0.4%')
    expect(menu?.textContent).toContain('Revision 20')
    app.unmount()
    container.remove()
  })

  it('keeps candidate creation, publish, preview, and rollback as explicit separate actions', () => {
    const source = existsSync(componentUrl) ? readFileSync(componentUrl, 'utf8') : ''

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

    container.querySelector<HTMLElement>('[data-publication-desktop-actions="true"] [data-slot="popover-trigger"]')?.click()
    await nextTick()

    const buildButton = container.querySelector<HTMLButtonElement>('[title="Build and validate a candidate from the saved draft"]')
    const publishButton = container.querySelector<HTMLButtonElement>('[title="Publish validated candidate"]')
    const rollbackButton = document.body.querySelector<HTMLButtonElement>('[data-publication-rollback="20"]')

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

  it('allows an idle editor to recover a candidate stranded in building state', async () => {
    const onBuildCandidate = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(PublicationControls, {
      draftVersion: 8,
      publishedRevision: null,
      candidateRevision: 2,
      candidateStatus: 'building',
      canBuild: true,
      canPublish: false,
      busy: false,
      validation: null,
      history: [],
      onBuildCandidate,
    })
    app.mount(container)

    const retryButton = findButton(container, 'Retry Build')
    expect(retryButton?.disabled).toBe(false)
    retryButton?.click()
    expect(onBuildCandidate).toHaveBeenCalledOnce()

    app.unmount()
    container.remove()
  })

  it('keeps open publish and rollback confirmations inert when busy begins', async () => {
    const busy = ref(false)
    const onPublish = vi.fn()
    const onRollback = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
      setup: () => () => h(PublicationControls, {
        draftVersion: 24,
        publishedRevision: 21,
        candidateRevision: 22,
        candidateStatus: 'ready',
        canBuild: true,
        canPublish: true,
        busy: busy.value,
        validation,
        history,
        onPublish,
        onRollback,
      }),
    }))
    app.mount(container)

    const publicationTrigger = container.querySelector<HTMLButtonElement>('[data-publication-desktop-actions="true"] [data-slot="popover-trigger"]')
    publicationTrigger?.click()
    await nextTick()
    document.body.querySelector<HTMLButtonElement>('[data-publication-rollback="20"]')?.click()
    container.querySelector<HTMLButtonElement>('[title="Publish validated candidate"]')?.click()
    await nextTick()

    const publishDialog = findDialog('Publish candidate?')
    const rollbackDialog = findDialog('Roll back production?')
    expect(publishDialog).not.toBeNull()
    expect(rollbackDialog).not.toBeNull()

    busy.value = true
    await nextTick()

    const publishConfirm = findButton(publishDialog!, 'Publish candidate')
    const rollbackConfirm = findButton(rollbackDialog!, 'Roll back')
    expect(publishConfirm?.disabled).toBe(true)
    expect(rollbackConfirm?.disabled).toBe(true)
    publishConfirm?.click()
    rollbackConfirm?.click()
    expect(onPublish).not.toHaveBeenCalled()
    expect(onRollback).not.toHaveBeenCalled()

    findButton(rollbackDialog!, 'Cancel')?.click()
    await nextTick()
    expect(findDialog('Roll back production?')?.dataset.state).toBe('closed')
    if (publicationTrigger?.dataset.state !== 'open') {
      publicationTrigger?.click()
      await nextTick()
    }
    const busyRollbackTrigger = document.body.querySelector<HTMLButtonElement>('[data-publication-rollback="20"]')
    expect(busyRollbackTrigger?.disabled).toBe(true)
    busyRollbackTrigger?.click()
    await nextTick()
    expect(findDialog('Roll back production?')?.dataset.state).toBe('closed')
    expect(onRollback).not.toHaveBeenCalled()

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
  })

  it('opens the 375px publication menu outside the toolbar clipping ancestor', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
    const toolbar = document.createElement('div')
    toolbar.dataset.oemPreviewToolbar = 'true'
    toolbar.style.width = '375px'
    toolbar.style.overflowX = 'auto'
    toolbar.style.overflowY = 'hidden'
    document.body.append(toolbar)
    const app = createApp(PublicationControls, {
      draftVersion: 24,
      publishedRevision: 21,
      candidateRevision: 22,
      candidateStatus: 'ready',
      canBuild: true,
      canPublish: true,
      busy: false,
      validation,
      history,
    })
    app.mount(toolbar)

    const mobileMenu = toolbar.querySelector<HTMLElement>('[data-publication-mobile-menu="true"]')
    const trigger = mobileMenu?.querySelector<HTMLElement>('summary, button')
    trigger?.click()
    await nextTick()

    const menuContent = Array.from(document.body.querySelectorAll<HTMLElement>('.w-72'))
      .find(element => element.textContent?.includes('Validation passed')) ?? null
    expect(menuContent).not.toBeNull()
    expect(menuContent?.classList.contains('max-w-[calc(100vw-1rem)]')).toBe(true)
    expect(toolbar.contains(menuContent)).toBe(false)

    app.unmount()
    toolbar.remove()
  })
})
