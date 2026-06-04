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

  it('uses captured clone viewport metadata for the full clone frame width', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const helperImport = source.indexOf('getCloneViewport')
    const viewportComputed = source.indexOf('const cloneViewport = computed(() => getCloneViewport(props.page))')
    const fullWidthBranch = source.indexOf('return cloneViewport.value.width')
    const tabletBranch = source.indexOf("if (previewWidth.value === 'tablet')")
    const mobileBranch = source.indexOf("if (previewWidth.value === 'mobile')")

    expect(helperImport).toBeGreaterThan(-1)
    expect(viewportComputed).toBeGreaterThan(helperImport)
    expect(tabletBranch).toBeGreaterThan(viewportComputed)
    expect(mobileBranch).toBeGreaterThan(tabletBranch)
    expect(fullWidthBranch).toBeGreaterThan(mobileBranch)
    expect(source).not.toContain('return 1280')
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

  it('lets the standalone preview host editable canvas menus unless the OEM is write protected', () => {
    const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

    expect(previewSource).toContain('isModelPageWriteProtected')
    expect(previewSource).toContain(':read-only="isWriteProtectedPage"')
    expect(previewSource).toContain(':allow-same-origin-sandbox="isWriteProtectedPage"')
    expect(previewSource).not.toContain(':read-only="true"')
    expect(previewSource).not.toContain(':allow-same-origin-sandbox="true"')
    expect(previewSource).toContain('@select-section="selectSection"')
    expect(previewSource).toContain('@open-editor="openEditor"')
    expect(previewSource).toContain('@move-section="moveSection"')
    expect(previewSource).toContain('@duplicate-section="duplicateSection"')
    expect(previewSource).toContain('@delete-section="deleteSection"')
    expect(previewSource).toContain('@update-field="onUpdateField"')
    expect(previewSource).toContain('@select-clone-region="onCloneRegionSelected"')
    expect(previewSource).toContain('@clone-dom-updated="onCloneDomUpdated"')
    expect(previewSource).toContain('@clone-region-added="onCloneRegionAdded"')
    expect(previewSource).toContain('@region-action="onRegionAction"')
  })

  it('persists edits made from the standalone preview through the existing save paths', () => {
    const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

    expect(previewSource).toContain('async function savePreview()')
    expect(previewSource).toContain('saveClone(cloneDraftHtml.value ?? cloneHtml.value, cloneRegionsForSave.value)')
    expect(previewSource).toContain('saveSections()')
    expect(previewSource).toContain('function onCloneDomUpdated(html: string)')
    expect(previewSource).toContain('cloneDraftHtml.value = html')
    expect(previewSource).toContain('addCloneRegion(region)')
    expect(previewSource).toContain('setRegionHeight(id, value == null ? null : Number(value))')
    expect(previewSource).toContain('pageBuilderCanvas.value?.duplicateRegion(regionId)')
    expect(previewSource).toContain('fieldId: `${regionId}:visibility`')
    expect(previewSource).toContain('<SectionEditorDialog')
  })
})

describe('CloneStudioCanvas duplicate-region relay', () => {
  it('exposes duplicateRegion and re-emits the bridge newRegion as regionAdded', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('regionAdded: [region: CloneRegion]')
    expect(source).toContain("type: 'clone-studio:duplicate-region'")
    expect(source).toContain('duplicateRegion,')
    expect(source).toContain("emit('regionAdded', data.newRegion)")
  })
})

describe('clone region conversion wiring', () => {
  it('threads selected clone region HTML from iframe context menus into region actions', () => {
    const bridgeSource = readFileSync(new URL('./clone-studio-html.ts', import.meta.url), 'utf8')
    const cloneCanvasSource = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')
    const canvasSource = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(bridgeSource).toContain('function getRegionHtml(element)')
    expect(bridgeSource).toContain('regionHtml: getRegionHtml(region)')
    expect(cloneCanvasSource).toContain("html: typeof data.regionHtml === 'string' ? data.regionHtml : ''")
    expect(canvasSource).toContain('html?: string')
    expect(canvasSource).toContain('html: menu.html')
    expect(canvasSource).toContain("emit('regionAction', { action: id, regionId: region.id, html: region.html })")
  })

  it('converts clone region HTML into raw content-block sections in builder and preview', () => {
    const builderSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')
    const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

    for (const source of [builderSource, previewSource]) {
      expect(source).toContain('buildRawHtmlSectionFromCloneRegion')
      expect(source).toContain('addSectionFromLiveData')
      expect(source).toContain('setActiveMode')
      expect(source).toContain('const section = buildRawHtmlSectionFromCloneRegion(html)')
      expect(source).toContain("toast.error('Region HTML is not available')")
      expect(source).toContain('addSectionFromLiveData(section)')
      expect(source).toContain("setActiveMode('sections')")
    }
  })
})

describe('duplicate region wiring through the host layers', () => {
  it('threads duplicateRegion and cloneRegionAdded from page to bridge', () => {
    const canvasSource = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')

    // Wrapper exposes duplicateRegion and re-emits cloneRegionAdded
    expect(canvasSource).toContain('cloneRegionAdded: [region: CloneRegion]')
    expect(canvasSource).toContain('cloneStudioCanvas.value?.duplicateRegion(regionId)')
    expect(canvasSource).toContain('duplicateRegion,')
    expect(canvasSource).toContain("@region-added=\"!props.readOnly && emit('cloneRegionAdded', $event)\"")

    // Page dispatches duplicate and persists the new region
    expect(pageSource).toContain('pageBuilderCanvas.value?.duplicateRegion(regionId)')
    expect(pageSource).toContain('@clone-region-added="onCloneRegionAdded"')
    expect(pageSource).toContain('function onCloneRegionAdded')
    expect(pageSource).toContain('addCloneRegion,')
    expect(pageSource).toContain("action === 'convert'")
  })
})
