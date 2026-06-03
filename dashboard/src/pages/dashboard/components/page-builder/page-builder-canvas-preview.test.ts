import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { disableClonePreviewNavigation } from './clone-preview-html'

describe('PageBuilderCanvas preview mode', () => {
  it('keeps cloned OEM HTML available when extracted sections also exist', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('activeMode')
    expect(source).toContain('showCloneFrame')
    expect(source).toContain('showStructuredPreview')

    const cloneFrame = source.indexOf('v-if="showCloneFrame"')
    const structuredPreview = source.indexOf('v-else-if="showStructuredPreview"')
    const legacyClonedBranch = source.indexOf('v-else-if="isCloned && page?.content?.rendered"')

    expect(cloneFrame).toBeGreaterThan(-1)
    expect(structuredPreview).toBeGreaterThan(cloneFrame)
    expect(legacyClonedBranch).toBe(-1)
    expect(source).toContain("props.activeMode === 'clone'")
    expect(source).toContain("props.activeMode === 'sections'")
  })

  it('keeps clone mode active when a structured section is selected', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('activeMode')
    expect(source).toContain("activeMode === 'clone'")
    expect(source).toContain("activeMode === 'sections'")
    expect(source).not.toContain('() => props.selectedSectionId')
    expect(source).not.toContain("previewMode.value = 'sections'")
  })

  it('forwards clone editor patch payloads into the Clone Studio iframe', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')

    expect(source).toContain('function patchCloneField(payload: Record<string, unknown>)')
    expect(source).toContain('cloneStudioCanvas.value?.patchField(payload)')
    expect(source).toContain('defineExpose({')
    expect(source).toContain('patchCloneField,')
    expect(source).toContain('ref="cloneStudioCanvas"')

    expect(pageSource).toContain('import CloneRegionEditor')
    expect(pageSource).toContain('ref="pageBuilderCanvas"')
    expect(pageSource).toContain('function patchCloneField(payload: CloneFieldPatchPayload)')
    expect(pageSource).toContain('pageBuilderCanvas.value?.patchCloneField(payload)')
    expect(pageSource).toContain('<CloneRegionEditor')
    expect(pageSource).toContain('@patch-field="patchCloneField"')
  })

  it('clears clone drafts and section editor state on mode and page changes', () => {
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')

    expect(pageSource).toContain("if (mode !== 'clone')")
    expect(pageSource).toContain('cloneDraftHtml.value = null')
    expect(pageSource).toContain('cloneEditorOpen.value = false')
    expect(pageSource).toContain('cloneDraftHtml.value = cloneHtml.value')
    expect(pageSource).toContain('closeEditor()')
    expect(pageSource).toContain("() => page.value?.id ?? page.value?.slug")
  })

  it('keeps unsaved clone draft HTML when clone save fails', () => {
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')
    const saveStart = pageSource.indexOf('async function saveActiveMode()')
    const saveEnd = pageSource.indexOf('function openSourceUrl()')
    const saveSource = pageSource.slice(saveStart, saveEnd)

    expect(saveSource).toContain('const saved = await saveClone')
    expect(saveSource).toContain('if (saved)')
    expect(saveSource).toContain('cloneDraftHtml.value = null')
    expect(saveSource.indexOf('if (saved)')).toBeLessThan(saveSource.indexOf('cloneDraftHtml.value = null'))
  })

  it('keeps desktop-only cloned OEM images visible in the static iframe preview', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('oem-static-clone-shim')
    expect(source).toContain('.imgdesktop')
    expect(source).toContain('.dsktoponly')
  })

  it('keeps Clone Studio same-origin sandboxing behind an explicit flag', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('VITE_CLONE_STUDIO_SAME_ORIGIN')
    expect(source).toContain('allowSameOriginSandbox')
    expect(source).toContain(':sandbox="iframeSandbox"')
    expect(source).not.toContain('sandbox="allow-scripts"')
  })

  it('disables cloned page links so preview clicks cannot navigate into the worker app', () => {
    const html = '<a href="/showroom/cars/mustang/specs.html" onclick="window.location.href=\'/\'"><img src="/media/pages/assets/ford-au/mustang/hero.webp"></a>'
    const disabled = disableClonePreviewNavigation(html)

    expect(disabled).toContain('href="#oem-preview-disabled"')
    expect(disabled).toContain('data-oem-preview-href="/showroom/cars/mustang/specs.html"')
    expect(disabled).toContain('data-oem-preview-onclick="window.location.href=&#39;/&#39;"')
    expect(disabled).toContain('data-oem-preview-link="true"')
    expect(disabled).toContain('onclick="return false"')
  })
})
