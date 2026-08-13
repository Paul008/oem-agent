import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { disableClonePreviewNavigation } from './clone-preview-html'

describe('pageBuilderCanvas preview mode', () => {
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
    expect(source).toContain('props.activeMode === \'clone\'')
    expect(source).toContain('props.activeMode === \'sections\'')
  })

  it('keeps clone mode active when a structured section is selected', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('activeMode')
    expect(source).toContain('activeMode === \'clone\'')
    expect(source).toContain('activeMode === \'sections\'')
    expect(source).not.toContain('() => props.selectedSectionId')
    expect(source).not.toContain('previewMode.value = \'sections\'')
  })

  it('forwards clone editor patch payloads into the Clone Studio iframe', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')

    expect(source).toContain('function patchCloneField(payload: CloneFieldPatchPayload)')
    expect(source).toContain('cloneStudioCanvas.value?.patchField(payload as unknown as Record<string, unknown>)')
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

  it('renders a compact clone selection toolbar for quick text styling', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('const cloneToolbarRegion = ref<CloneMenuRegion | null>(null)')
    expect(source).toContain('const cloneToolbarViewport = ref({ width: 1024, height: 768 })')
    expect(source).toContain('const cloneToolbarVisible = computed')
    expect(source).toContain('const cloneToolbarHasImage = computed')
    expect(source).toContain('const cloneToolbarHasLink = computed')
    expect(source).toContain('const cloneToolbarHasPanels = computed')
    expect(source).toContain('const cloneToolbarLinkEditing = ref(false)')
    expect(source).toContain('const cloneToolbarAltEditing = ref(false)')
    expect(source).toContain('const cloneToolbarHeightEditing = ref(false)')
    expect(source).toContain('overflow-x-auto overflow-y-hidden')
    expect(source).toContain('[scrollbar-width:none]')
    expect(source).toContain('[&>button]:shrink-0')
    expect(source).toContain('function syncCloneToolbarViewport')
    expect(source).toContain('window.innerHeight')
    expect(source).toContain('x < cloneToolbarEdgeThreshold')
    expect(source).toContain('translateX(0)')
    expect(source).toContain('translateX(-100%)')
    expect(source).toContain('function onCloneRegionSelected(region: any)')
    expect(source).toContain('syncCloneToolbarViewport()')
    expect(source).toContain('function hasCloneImageField')
    expect(source).toContain('function hasCloneLinkField')
    expect(source).toContain('function hasClonePanelControls')
    expect(source).toContain('function quickCloneReplaceImage')
    expect(source).toContain('function quickCloneEditAlt')
    expect(source).toContain('function quickCloneEditLink')
    expect(source).toContain('function submitCloneToolbarLink')
    expect(source).toContain('function submitCloneToolbarAlt')
    expect(source).toContain('function quickCloneEditHeight')
    expect(source).toContain('function submitCloneToolbarHeight')
    expect(source).toContain('function quickClonePreviousPanel')
    expect(source).toContain('function quickCloneNextPanel')
    expect(source).toContain('function quickCloneHideRegion')
    expect(source).toContain('function quickCloneDuplicateRegion')
    expect(source).toContain('function quickCloneConvertRegion')
    expect(source).toContain('function quickCloneMatchOem')
    expect(source).toContain('function quickCloneDeleteRegion')
    expect(source).toContain('function patchCloneStyle')
    expect(source).toContain('kind: \'style\'')
    expect(source).toContain('patchCloneStyle(\'text-align\', \'left\')')
    expect(source).toContain('patchCloneStyle(\'font-weight\', \'700\')')
    expect(source).toContain('patchCloneStyle(\'color\', (e.target as HTMLInputElement).value)')
    expect(source).toContain('buildPatchPayload(\'edit-link\', region as any, cloneToolbarLinkValue.value.trim())')
    expect(source).toContain('buildPatchPayload(\'alt-text\', region as any, cloneToolbarAltValue.value.trim())')
    expect(source).toContain('buildPatchPayload(\'hide\', region as any)')
    expect(source).toContain('cloneStudioCanvas.value?.setHeight(region.id, n)')
    expect(source).toContain('emit(\'updateField\', region.id, \'height_override\', n)')
    expect(source).toContain('cloneStudioCanvas.value?.switchPanel(region.id, next)')
    expect(source).toContain('emit(\'regionAction\', { action: \'duplicate\', regionId: region.id, html: region.html, tailwindRecipeArtifact: region.tailwindRecipeArtifact })')
    expect(source).toContain('emit(\'regionAction\', { action: \'convert-tailwind-selected\', regionId: region.id, html: region.html, tailwindRecipeArtifact: region.tailwindRecipeArtifact })')
    expect(source).toContain('emit(\'regionAction\', { action: \'delete\', regionId: region.id, html: region.html, tailwindRecipeArtifact: region.tailwindRecipeArtifact })')
    expect(source).toContain('@click="quickCloneReplaceImage"')
    expect(source).toContain('@click="quickCloneEditAlt"')
    expect(source).toContain('@click="quickCloneEditLink"')
    expect(source).toContain('@click="quickClonePreviousPanel"')
    expect(source).toContain('@click="quickCloneNextPanel"')
    expect(source).toContain('@click="quickCloneEditHeight"')
    expect(source).toContain('@click="quickCloneDuplicateRegion"')
    expect(source).toContain('@click="quickCloneConvertRegion"')
    expect(source).toContain('@click="quickCloneMatchOem"')
    expect(source).toContain('@click="quickCloneHideRegion"')
    expect(source).toContain('@click="quickCloneDeleteRegion"')
    expect(source).toContain('@select-region="onCloneRegionSelected"')
    expect(source).toContain('title="Replace image"')
    expect(source).toContain(':disabled="!cloneToolbarHasImage || !cloneHasMediaContext"')
    expect(source).toContain('title="Edit image alt text"')
    expect(source).toContain('title="Edit link"')
    expect(source).toContain(':disabled="!cloneToolbarHasLink"')
    expect(source).toContain('v-if="cloneToolbarLinkEditing"')
    expect(source).toContain('v-else-if="cloneToolbarAltEditing"')
    expect(source).toContain('v-else-if="cloneToolbarHeightEditing"')
    expect(source).toContain('@keydown.enter="submitCloneToolbarLink"')
    expect(source).toContain('@keydown.enter="submitCloneToolbarAlt"')
    expect(source).toContain('@keydown.enter="submitCloneToolbarHeight"')
    expect(source).toContain('title="Apply link"')
    expect(source).toContain('title="Apply alt text"')
    expect(source).toContain('title="Apply height"')
    expect(source).toContain('title="Align left"')
    expect(source).toContain('title="Align center"')
    expect(source).toContain('title="Align right"')
    expect(source).toContain('title="Bold"')
    expect(source).toContain('title="Text color"')
    expect(source).toContain('v-if="cloneToolbarHasPanels"')
    expect(source).toContain('title="Previous panel"')
    expect(source).toContain('title="Next panel"')
    expect(source).toContain('title="Set visible height"')
    expect(source).toContain('title="Duplicate region"')
    expect(source).toContain('title="Convert selected section to Tailwind"')
    expect(source).toContain('title="Match OEM pixel fidelity"')
    expect(source).toContain('title="Hide region"')
    expect(source).toContain('title="Delete region"')
    expect(source).toContain('title="Background color"')
    expect(source).toContain('window.addEventListener(\'resize\', syncCloneToolbarViewport)')
    expect(source).toContain('window.removeEventListener(\'resize\', syncCloneToolbarViewport)')
  })

  it('opens the OEM-scoped media library for clone image replacement', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('import MediaLibraryDialog from \'./MediaLibraryDialog.vue\'')
    expect(source).toContain('const cloneMediaLibraryOpen = ref(false)')
    expect(source).toContain('const cloneMediaTargetRegion = ref<CloneMenuRegion | null>(null)')
    expect(source).toContain('const cloneHasMediaContext = computed(() => Boolean(props.oemId))')
    expect(source).toContain('function openCloneMediaLibrary(region: CloneMenuRegion)')
    expect(source).toContain('buildPatchPayload(\'replace-image\', region as any, url)')
    expect(source).toContain('case \'replace-image\':')
    expect(source).toContain('openCloneMediaLibrary(region)')
    expect(source).toContain('<MediaLibraryDialog')
    expect(source).toContain(':oem-id="oemId || \'\'"')
    expect(source).toContain(':model-slug="modelSlug || \'\'"')
    expect(source).toContain('media-kind="image"')
    expect(source).toContain('@select="onCloneMediaLibrarySelect"')
  })

  it('defaults the media library upload tab to the current model when matching media exists', () => {
    const source = readFileSync(new URL('./MediaLibraryDialog.vue', import.meta.url), 'utf8')

    expect(source).toContain('function defaultLibraryModelFilter(modelSlug: string, mediaItems: MediaItem[]): string')
    expect(source).toContain('return mediaItems.some(item => item.modelSlug === modelSlug && matchesMediaKind(item.contentType)) ? modelSlug : \'\'')
    expect(source).toContain('libraryScope.value === \'oem\'')
    expect(source).toContain('defaultLibraryModelFilter(props.modelSlug, items.value)')
    expect(source).toContain('<option value="">')
    expect(source).toContain('All models')
  })

  it('loads current-model media first while keeping an all-OEM media scope', () => {
    const source = readFileSync(new URL('./MediaLibraryDialog.vue', import.meta.url), 'utf8')

    expect(source).toContain('type LibraryScope = \'model\' | \'oem\'')
    expect(source).toContain('const libraryScope = ref<LibraryScope>(\'model\')')
    expect(source).toContain('libraryScope.value = props.modelSlug ? \'model\' : \'oem\'')
    expect(source).toContain('listMedia(props.oemId, libraryScope.value === \'model\' && props.modelSlug')
    expect(source).toContain('modelSlug: props.modelSlug')
    expect(source).toContain('@click="libraryScope = \'model\'"')
    expect(source).toContain('@click="libraryScope = \'oem\'"')
    expect(source).toContain('All {{ oemId }}')
    expect(source).toContain('v-if="libraryScope === \'oem\'"')
  })

  it('restricts clone image replacement media to image assets', () => {
    const source = readFileSync(new URL('./MediaLibraryDialog.vue', import.meta.url), 'utf8')

    expect(source).toContain('mediaKind?: \'all\' | \'image\' | \'video\'')
    expect(source).toContain('const mediaKind = computed(() => props.mediaKind || \'all\')')
    expect(source).toContain('function matchesMediaKind(contentType: string | null | undefined): boolean')
    expect(source).toContain('mediaKind.value === \'image\'')
    expect(source).toContain('startsWith(\'image/\')')
    expect(source).toContain('let result = items.value.filter(item => matchesMediaKind(item.contentType))')
    expect(source).toContain('if (!matchesMediaKind(item.contentType))')
    expect(source).toContain('if (!matchesMediaKind(file.type))')
    expect(source).toContain(':accept="uploadAccept"')
    expect(source).toContain('function portalAssetMatchesMediaKind(asset: PortalAsset): boolean')
    expect(source).toContain('asset.asset_type === \'IMAGE\'')
    expect(source).toContain('const portalTypeOptions = computed<PortalTypeOption[]>')
    expect(source).toContain('portalFilterType.value = defaultPortalFilterType()')
  })

  it('clears clone drafts and section editor state on mode and page changes', () => {
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')

    expect(pageSource).toContain('if (mode !== \'clone\')')
    expect(pageSource).toContain('cloneDraftHtml.value = null')
    expect(pageSource).toContain('cloneEditorOpen.value = false')
    expect(pageSource).toContain('cloneDraftHtml.value = cloneHtml.value')
    expect(pageSource).toContain('closeEditor()')
    expect(pageSource).toContain('() => page.value?.id ?? page.value?.slug')
  })

  it('keeps unsaved clone draft HTML when clone save fails', () => {
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')
    const saveStart = pageSource.indexOf('async function saveActiveMode()')
    const saveEnd = pageSource.indexOf('async function refreshPublicationState()', saveStart)
    const saveSource = pageSource.slice(saveStart, saveEnd)

    expect(saveSource).toContain('const saved = await saveClone')
    expect(saveSource).toContain('if (saved)')
    expect(saveSource).toContain('cloneDraftHtml.value = null')
    expect(saveSource.indexOf('if (saved)')).toBeLessThan(saveSource.indexOf('cloneDraftHtml.value = null'))
  })

  it('marks a successfully saved draft stale before refreshing publication state', () => {
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')
    const saveStart = pageSource.indexOf('async function saveActiveMode()')
    const saveEnd = pageSource.indexOf('async function refreshPublicationState()', saveStart)
    const saveSource = pageSource.slice(saveStart, saveEnd)

    expect(pageSource).toContain('Save Draft')
    expect(pageSource).toContain('useModelPagePublication')
    expect(pageSource).toContain('<PublicationControls')
    expect(pageSource).toContain('@build-candidate="buildPublicationCandidate"')
    expect(pageSource).toContain('@publish="publishCandidate"')
    expect(pageSource).toContain('@rollback="rollbackPublication"')
    expect(saveSource).toContain('publication.markDraftChanged(page.value.version)')
    expect(saveSource).toContain('await publication.refresh()')
    expect(saveSource).not.toContain('publication.buildCandidate()')
    expect(saveSource).not.toContain('publication.publish()')
  })

  it('requires explicit candidate publish and rollback confirmations', () => {
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')

    expect(pageSource).toContain('async function buildPublicationCandidate()')
    expect(pageSource).toContain('async function publishCandidate()')
    expect(pageSource).toContain('async function rollbackPublication(revision: number)')
    expect(pageSource).toContain('publication.buildCandidate()')
    expect(pageSource).toContain('publication.publish()')
    expect(pageSource).toContain('publication.rollback(revision)')

    const rollbackStart = pageSource.indexOf('async function rollbackPublication')
    const rollbackEnd = pageSource.indexOf('function openSourceUrl()', rollbackStart)
    expect(pageSource.slice(rollbackStart, rollbackEnd)).not.toContain('publication.buildCandidate()')
  })

  it('keeps responsive OEM image classes tied to the clone iframe viewport', () => {
    const source = readFileSync(new URL('./clone-studio-html.ts', import.meta.url), 'utf8')

    expect(source).toContain('@media (min-width: 1024px)')
    expect(source).toContain('@media (max-width: 1023.98px)')
    expect(source).toContain('.imgdesktop')
    expect(source).toContain('.imgmobile')
    expect(source).toContain('.dsktoponly')
    expect(source).toContain('.mobonly')
  })

  it('uses captured clone viewport metadata for the full clone frame width', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const helperImport = source.indexOf('getCloneViewport')
    const viewportComputed = source.indexOf('const cloneViewport = computed(() => getCloneViewport(props.page))')
    const fullWidthBranch = source.indexOf('return cloneViewport.value.width')
    const tabletBranch = source.indexOf('if (previewWidth.value === \'tablet\')')
    const mobileBranch = source.indexOf('if (previewWidth.value === \'mobile\')')

    expect(helperImport).toBeGreaterThan(-1)
    expect(viewportComputed).toBeGreaterThan(helperImport)
    expect(tabletBranch).toBeGreaterThan(viewportComputed)
    expect(mobileBranch).toBeGreaterThan(tabletBranch)
    expect(fullWidthBranch).toBeGreaterThan(mobileBranch)
    expect(source).not.toContain('return 1280')
  })

  it('auto-selects mobile and tablet frames for standalone responsive previews', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

    expect(source).toContain('autoResponsivePreview?: boolean')
    expect(source).toContain('const previewWidthManuallySelected = ref(false)')
    expect(source).toContain('const autoResponsiveViewportWidth = ref<number | null>(null)')
    expect(source).toContain('const previewFrameClass = computed')
    expect(source).toContain('return \'w-full\'')
    expect(source).toContain('return previewWidthClass[previewWidth.value]')
    expect(source).toContain('return autoResponsiveViewportWidth.value')
    expect(source).toContain('function responsivePreviewWidth(width: number): PreviewWidth')
    expect(source).toContain('if (width < 640)')
    expect(source).toContain('return \'mobile\'')
    expect(source).toContain('if (width < 1024)')
    expect(source).toContain('return \'tablet\'')
    expect(source).toContain('window.addEventListener(\'resize\', syncResponsivePreviewWidth)')
    expect(source).toContain('function setPreviewWidth(mode: PreviewWidth)')
    expect(source).toContain('previewWidthManuallySelected.value = true')
    expect(previewSource).toContain(':auto-responsive-preview="true"')
    expect(previewSource).toContain(':hide-preview-chrome="true"')
  })

  it('hides builder chrome in standalone previews while keeping builder controls available elsewhere', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

    expect(source).toContain('hidePreviewChrome?: boolean')
    expect(source).toContain(':class="hidePreviewChrome ? \'bg-background\' : \'bg-muted/30\'"')
    expect(source).toContain('v-if="!hidePreviewChrome && (showStructuredPreview || showCloneFrame)"')
    expect(previewSource).toContain(':hide-preview-chrome="true"')
  })

  it('keeps standalone preview controls compact on mobile screens', () => {
    const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

    expect(previewSource).toContain('max-w-[calc(100vw-1rem)]')
    expect(previewSource).toContain('<span class="hidden sm:inline">Edit</span>')
    expect(previewSource).toContain('<span class="hidden sm:inline">Production</span>')
    expect(previewSource).toContain('<span class="hidden sm:inline">Save Draft</span>')
    expect(previewSource).toContain('<span class="hidden sm:inline">Builder</span>')
  })

  it('feeds preserved clone studio source html into the iframe builder', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')
    const helperImport = source.indexOf('buildCloneStudioFrameHtmlForCanvas')
    const builderUsage = source.indexOf('buildCloneStudioFrameHtmlForCanvas({')

    expect(helperImport).toBeGreaterThan(-1)
    expect(builderUsage).toBeGreaterThan(helperImport)
    expect(source).toContain(':srcdoc="frameHtml"')
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

  it('lets only authenticated standalone previews host editable canvas menus unless the view is read-only', () => {
    const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

    expect(previewSource).toContain('isModelPageWriteProtected')
    expect(previewSource).toContain('const previewReadOnly = computed(() => !canAdministerPreview.value || isWriteProtectedPage.value || isProductionView.value || isCandidateView.value || isSourceView.value || isCompareView.value || isStandaloneView.value)')
    expect(previewSource).toContain('const canEditPreview = computed(() => !previewReadOnly.value)')
    expect(previewSource).toContain(':read-only="previewReadOnly"')
    expect(previewSource).toContain(':allow-same-origin-sandbox="false"')
    expect(previewSource).not.toContain(':read-only="true"')
    expect(previewSource).not.toContain(':allow-same-origin-sandbox="previewReadOnly"')
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

  it('adds a production view to the standalone preview that disables edit/save paths', () => {
    const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

    expect(previewSource).toContain('type PreviewView = \'edit\' | \'production\' | \'candidate\' | \'source\' | \'compare\' | \'standalone\'')
    expect(previewSource).toContain('const previewView = ref<PreviewView>(normalizePreviewView(route.query.view))')
    expect(previewSource).toContain('function normalizePreviewView(value: unknown): PreviewView')
    expect(previewSource).toContain('return raw === \'production\' || raw === \'candidate\' || raw === \'source\' || raw === \'compare\' || raw === \'standalone\' ? raw : \'edit\'')
    expect(previewSource).toContain('function setPreviewView(view: PreviewView)')
    expect(previewSource).toContain('query.view = \'production\'')
    expect(previewSource).toContain('delete query.view')
    expect(previewSource).toContain('@click="setPreviewView(\'edit\')"')
    expect(previewSource).toContain('@click="setPreviewView(\'production\')"')
    expect(previewSource).toContain('Switch to Edit view to save changes')
    expect(previewSource).toContain('v-if="canEditPreview"')
    expect(previewSource).toContain('v-if="editorSection && canEditPreview"')
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
    expect(previewSource).toContain('fieldId: `$' + '{regionId}:visibility`')
    expect(previewSource).toContain('<SectionEditorDialog')
  })

  it('refreshes capture diagnostics after capture-producing page builder actions', () => {
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')
    const mountedStart = pageSource.indexOf('onMounted(async () => {')
    const mountedEnd = pageSource.indexOf('const captureDiagnostics = ref', mountedStart)
    const mountedSource = pageSource.slice(mountedStart, mountedEnd)
    const cloneStart = pageSource.indexOf('async function runClone()')
    const cloneEnd = pageSource.indexOf('async function runStructure', cloneStart)
    const cloneSource = pageSource.slice(cloneStart, cloneEnd)
    const structureStart = pageSource.indexOf('async function runStructure')
    const structureEnd = pageSource.indexOf('async function runAdaptivePipeline', structureStart)
    const structureSource = pageSource.slice(structureStart, structureEnd)
    const pipelineStart = pageSource.indexOf('async function runAdaptivePipeline')
    const pipelineEnd = pageSource.indexOf('function handleKeyboard', pipelineStart)
    const pipelineSource = pageSource.slice(pipelineStart, pipelineEnd)

    expect(mountedSource).toContain('await loadPage(slug)')
    expect(mountedSource).toContain('void loadCaptureDiagnostics()')
    expect(mountedSource).toContain('void loadMappingPreview()')

    expect(cloneSource).toContain('await handleClone()')
    expect(cloneSource).toContain('await loadCaptureDiagnostics()')
    expect(cloneSource).toContain('await loadMappingPreview()')
    expect(cloneSource.indexOf('await loadCaptureDiagnostics()')).toBeGreaterThan(cloneSource.indexOf('await handleClone()'))

    expect(structureSource).toContain('await handleMapAndStructure(modelOverride)')
    expect(structureSource).not.toContain('loadCaptureDiagnostics')
    expect(structureSource).toContain('await loadMappingPreview()')

    expect(pipelineSource).toContain('await handleAdaptivePipeline(modelOverride)')
    expect(pipelineSource).toContain('await loadCaptureDiagnostics()')
    expect(pipelineSource).toContain('await loadMappingPreview()')
    expect(pipelineSource.indexOf('await loadCaptureDiagnostics()')).toBeGreaterThan(pipelineSource.indexOf('await handleAdaptivePipeline(modelOverride)'))
  })

  it('surfaces mapping confidence and routes Structure through deterministic-first persistence', () => {
    const pageSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')
    const composableSource = readFileSync(new URL('../../../../composables/use-page-builder.ts', import.meta.url), 'utf8')

    expect(composableSource).toContain('mapAndStructurePage')
    expect(composableSource).toContain('async function handleMapAndStructure')
    expect(composableSource).toContain('await mapAndStructurePage(oemId.value, modelSlug.value, modelOverride)')

    expect(pageSource).toContain('mapPagePreview')
    expect(pageSource).toContain('const mappingPreview = ref')
    expect(pageSource).toContain('async function loadMappingPreview()')
    expect(pageSource).toContain('const mappingStatus = computed')
    expect(pageSource).toContain('Map {{ mappingStatus.percent }}%')
    expect(pageSource).toContain('AI fallback {{ mappingStatus.percent }}%')

    const structureStart = pageSource.indexOf('async function runStructure')
    const structureEnd = pageSource.indexOf('async function runAdaptivePipeline', structureStart)
    const structureSource = pageSource.slice(structureStart, structureEnd)
    expect(structureSource).toContain('await handleMapAndStructure(modelOverride)')
    expect(structureSource).toContain('await loadMappingPreview()')
    expect(structureSource).not.toContain('await handleStructure(modelOverride)')
  })
})

describe('cloneStudioCanvas duplicate-region relay', () => {
  it('enriches selected clone regions with toolbar viewport coordinates', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('function enrichRegionForHost(region: any): any')
    expect(source).toContain('translateFramePoint(')
    expect(source).toContain('toolbar_x:')
    expect(source).toContain('toolbar_y:')
    expect(source).toContain('emit(\'selectRegion\', enrichRegionForHost(data.region))')
  })

  it('refreshes the selected clone region when dom-updated returns a region payload', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')
    const domUpdatedStart = source.indexOf('if (data.type === \'clone-studio:dom-updated\')')
    const domUpdatedEnd = source.indexOf('if (data.type === \'clone-studio:region-height\')', domUpdatedStart)
    const domUpdatedBlock = source.slice(domUpdatedStart, domUpdatedEnd)

    expect(domUpdatedBlock).toContain('emit(\'domUpdated\', html)')
    expect(domUpdatedBlock).toContain('if (data.region && typeof data.region === \'object\')')
    expect(domUpdatedBlock).toContain('emit(\'selectRegion\', enrichRegionForHost(data.region))')
  })

  it('relays scroll geometry without re-emitting selection', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')
    const geometryStart = source.indexOf('if (data.type === \'clone-studio:selected-geometry\'')
    const geometryEnd = source.indexOf('if (data.type === \'clone-studio:dom-updated\')', geometryStart)
    const geometryBlock = source.slice(geometryStart, geometryEnd)

    expect(source).toContain('regionGeometry: [region: any]')
    expect(geometryBlock).toContain('emit(\'regionGeometry\', enrichRegionForHost(data.region))')
    expect(geometryBlock).not.toContain('emit(\'selectRegion\'')
  })

  it('merges selection geometry without cancelling active toolbar editors', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const handlerStart = source.indexOf('function onCloneRegionGeometry(region: any)')
    const handlerEnd = source.indexOf('\nfunction ', handlerStart + 1)
    const handler = source.slice(handlerStart, handlerEnd)

    expect(source).toContain('@region-geometry="onCloneRegionGeometry"')
    expect(source).toContain('cloneToolbarRegion.value.toolbar_visible !== false')
    expect(handler).toContain('toolbar_visible: region.toolbar_visible !== false')
    expect(handler).not.toContain('cancelCloneToolbar')
    expect(handler).not.toContain('emit(\'selectCloneRegion\'')
  })

  it('exposes duplicateRegion and re-emits the bridge newRegion as regionAdded', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('regionAdded: [region: CloneRegion]')
    expect(source).toContain('type: \'clone-studio:duplicate-region\'')
    expect(source).toContain('duplicateRegion,')
    expect(source).toContain('emit(\'regionAdded\', data.newRegion)')
  })

  it('stages auto-indexed legacy clone regions and HTML when the bridge becomes ready', () => {
    const source = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')
    const readyStart = source.indexOf('if (data.type === \'clone-studio:ready\')')
    const readyEnd = source.indexOf('if (data.type === \'clone-studio:select-region\')', readyStart)
    const readyBlock = source.slice(readyStart, readyEnd)

    expect(readyBlock).toContain('props.editable !== false && data.indexedFallbackRegions === true')
    expect(readyBlock).toContain('emit(\'domUpdated\', html)')
    expect(readyBlock).toContain('emit(\'regionAdded\', region)')
  })
})

describe('clone region conversion wiring', () => {
  it('threads selected clone region HTML from iframe context menus into region actions', () => {
    const bridgeSource = readFileSync(new URL('./clone-studio-html.ts', import.meta.url), 'utf8')
    const cloneCanvasSource = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')
    const canvasSource = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(bridgeSource).toContain('function getRegionHtml(element)')
    expect(bridgeSource).toContain('function getTailwindRecipeArtifact(element)')
    expect(bridgeSource).toContain('html: getRegionHtml(element)')
    expect(bridgeSource).toContain('tailwindRecipeArtifact: getTailwindRecipeArtifact(element)')
    expect(bridgeSource).toContain('regionHtml: getRegionHtml(region)')
    expect(bridgeSource).toContain('tailwindRecipeArtifact: getTailwindRecipeArtifact(region)')
    expect(cloneCanvasSource).toContain('html: typeof data.regionHtml === \'string\' ? data.regionHtml : \'\'')
    expect(cloneCanvasSource).toContain('tailwindRecipeArtifact: data.tailwindRecipeArtifact')
    expect(canvasSource).toContain('html?: string')
    expect(canvasSource).toContain('tailwindRecipeArtifact?: any')
    expect(canvasSource).toContain('html: menu.html')
    expect(canvasSource).toContain('tailwindRecipeArtifact: menu.tailwindRecipeArtifact')
    expect(canvasSource).toContain('tailwindRecipeArtifact: region.tailwindRecipeArtifact')
    expect(canvasSource).toContain('emit(\'regionAction\', { action: id, regionId: region.id, html: region.html, tailwindRecipeArtifact: region.tailwindRecipeArtifact })')
  })

  it('can collect every clone region payload from the iframe for whole-page conversion', () => {
    const bridgeSource = readFileSync(new URL('./clone-studio-html.ts', import.meta.url), 'utf8')
    const cloneCanvasSource = readFileSync(new URL('./CloneStudioCanvas.vue', import.meta.url), 'utf8')
    const canvasSource = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(bridgeSource).toContain('clone-studio:list-regions')
    expect(bridgeSource).toContain('clone-studio:regions-list')
    expect(bridgeSource).toContain('document.querySelectorAll(REGION_SELECTOR)')
    expect(bridgeSource).toContain('regions: collectRegionPayloads()')
    expect(cloneCanvasSource).toContain('function collectRegions(): Promise<CloneRegion[]>')
    expect(cloneCanvasSource).toContain('TAILWIND_CAPTURE_WIDTHS')
    expect(cloneCanvasSource).toContain('captureFrameWidth.value = breakpoint.width')
    expect(cloneCanvasSource).toContain('mergeCapturedBreakpointRegions(captures)')
    expect(cloneCanvasSource).toContain('computed_snapshots: snapshots')
    expect(cloneCanvasSource).toContain('pendingRegionListRequests')
    expect(canvasSource).toContain('function collectCloneRegions(): Promise<CloneRegion[]>')
    expect(canvasSource).toContain('collectCloneRegions,')
  })

  it('keeps builder conversion as section insertion and preview conversion as in-place clone replacement', () => {
    const builderSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')
    const previewSource = readFileSync(new URL('../../../preview/[slug].vue', import.meta.url), 'utf8')

    expect(builderSource).toContain('buildEditableSectionFromCloneRegion')
    expect(builderSource).toContain('compileTailwindRecipeArtifact')
    expect(builderSource).toContain('const section = await buildEditableSectionFromCloneRegion')
    expect(builderSource).toContain('addSectionFromLiveData(section)')
    expect(builderSource).toContain('setActiveMode(\'sections\')')

    expect(previewSource).toContain('buildPreviewReplacementHtmlFromCloneRegion')
    expect(previewSource).toContain('compileTailwindRecipeArtifact')
    expect(previewSource).toContain('patchCloneField({')
    expect(previewSource).toContain('kind: \'outer-html\'')
    expect(previewSource).toContain('html: replacementHtml')
  })

  it('renders a nested Tailwind conversion menu and routes selected/all leaves', () => {
    const canvasSource = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')
    const builderSource = readFileSync(new URL('../../page-builder/[slug].vue', import.meta.url), 'utf8')

    expect(canvasSource).toContain('const cloneSubmenuActionId = ref<RegionActionId | null>(null)')
    expect(canvasSource).toContain('action.children?.length')
    expect(canvasSource).toContain('runCloneAction(child.id)')
    expect(canvasSource).toContain('case \'convert-tailwind-selected\':')
    expect(canvasSource).toContain('case \'convert-tailwind-all\':')
    expect(builderSource).toContain('action === \'convert-tailwind-selected\'')
    expect(builderSource).toContain('action === \'convert-tailwind-all\'')
    expect(builderSource).toContain('convertCloneRegionsToTailwindSections')
    expect(builderSource).toContain('failClosed: true')
    expect(builderSource).toContain('if (result.blocked)')
    expect(builderSource).toContain('toast.error(result.blocked.message)')
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
    expect(canvasSource).toContain('@region-added="!props.readOnly && emit(\'cloneRegionAdded\', $event)"')

    // Page dispatches duplicate and persists the new region
    expect(pageSource).toContain('pageBuilderCanvas.value?.duplicateRegion(regionId)')
    expect(pageSource).toContain('@clone-region-added="onCloneRegionAdded"')
    expect(pageSource).toContain('function onCloneRegionAdded')
    expect(pageSource).toContain('addCloneRegion,')
    expect(pageSource).toContain('action === \'convert\'')
  })
})
