<script lang="ts" setup>
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Circle,
  ClipboardPaste,
  Code,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  Globe,
  History,
  Import,
  Loader2,
  Lock,
  Menu,
  MousePointer2,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  Zap,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import type { CaptureDiagnosticsRecord } from '@/lib/worker-api'

import { useModelPagePublication } from '@/composables/use-model-page-publication'
import { useOemData } from '@/composables/use-oem-data'
import { usePageBuilder } from '@/composables/use-page-builder'
import { describeCaptureStatus } from '@/lib/capture-status'
import { getModelPageWriteProtectedMessage, isModelPageWriteProtected } from '@/lib/oem-ids'
import { compileTailwindRecipeArtifact, fetchCaptureDiagnostics, fetchCompileRunStatus, mapPagePreview } from '@/lib/worker-api'
import { useThemeStore } from '@/stores/theme'

import type { CloneFieldPatchPayload } from '../components/page-builder/CloneRegionEditor.vue'
import type { RegionActionId } from '../components/page-builder/region-actions'
import type { CloneRegion, PageMode } from './page-modes'

import { buildCatalogSectionsFromModel, buildEditableSectionFromCloneRegion, convertCloneRegionsToTailwindSections, extractTailwindRecipeArtifactCss } from '../components/page-builder/clone-region-converter'
import CloneRegionEditor from '../components/page-builder/CloneRegionEditor.vue'
import FidelityAssistantDialog from '../components/page-builder/FidelityAssistantDialog.vue'
import HistoryPanel from '../components/page-builder/HistoryPanel.vue'
import JsonEditorView from '../components/page-builder/JsonEditorView.vue'
import PageBuilderCanvas from '../components/page-builder/PageBuilderCanvas.vue'
import PageBuilderSidebar from '../components/page-builder/PageBuilderSidebar.vue'
import PublicationControls from '../components/page-builder/PublicationControls.vue'
import SectionBrowserDialog from '../components/page-builder/SectionBrowserDialog.vue'
import SectionCapture from '../components/page-builder/SectionCapture.vue'
import SectionEditorDialog from '../components/page-builder/SectionEditorDialog.vue'
import { AI_MODEL_OPTIONS, DEFAULT_AI_MODEL_VALUE, getAiModelOverride } from './ai-model-options'
import { getPageWorkflowState, getPrimaryWorkflowAction, isPipelineActionDisabled, needsDestructiveActionConfirmation, shouldShowSourceUrlInput } from './page-workflow'

const route = useRoute()
const router = useRouter()
const compileStageLabel = ref('')
let compileStatusPoller: ReturnType<typeof setInterval> | null = null
const {
  fetchOems,
  fetchProductsForModel,
  fetchVariantColors,
} = useOemData()

const {
  page,
  loading,
  saving,
  error,
  isDirty,
  sections,
  selectedSectionId,
  selectedCloneRegionId,
  selectedCloneRegionData,
  isStructured,
  isCloned,
  activeMode,
  availableModes,
  cloneHtml,
  cloneRegions,
  cloneRegionsForSave,
  oemId,
  modelSlug,
  isSubpage,
  subpageSlug,
  parentModelSlug,
  parentFullSlug,
  sourceUrlOverride,
  regenerating,
  cloning,
  structuring,
  pipelining,
  pipelineResult,
  history,
  historyIndex,
  canUndo,
  canRedo,
  loadPage,
  selectSection,
  deleteSection,
  moveSection,
  addSection,
  addSectionFromTemplate,
  addSectionFromLiveData,
  addSectionFromRecipe,
  duplicateSection,
  updateSection,
  saveSections,
  saveClone,
  regenerateSectionById,
  handleClone,
  handleMapAndStructure,
  handleAdaptivePipeline,
  undo,
  redo,
  jumpTo,
  recipes,
  pasteSections,
  copySectionToClipboard,
  pasteSectionFromClipboard,
  replaceSections,
  convertSection,
  splitSection,
  saveCurrentAsRecipe,
  setActiveMode,
  selectCloneRegion,
  setRegionHeight,
  addCloneRegion,
} = usePageBuilder()

const publicationPageId = computed(() => (route.params as { slug?: string }).slug ?? null)
const draftVersion = computed(() => {
  const version = Number(page.value?.version)
  return Number.isInteger(version) && version > 0 ? version : null
})
const publication = useModelPagePublication({ pageId: publicationPageId, draftVersion })

const themeStore = useThemeStore()

const showJson = ref(false)
const showHistory = ref(false)
const showSectionBrowser = ref(false)
const showCapture = ref(false)
const cloneDraftHtml = ref<string | null>(null)
const cloneEditorOpen = ref(false)
const fidelityOpen = ref(false)
const fidelityRegionId = ref('')
const fidelityOriginalHtml = ref('')
const fidelityOriginalCss = ref('')
const fidelityCandidateSection = ref<Record<string, any> | null>(null)
const fidelityRecipeArtifact = ref<Record<string, unknown> | null>(null)
const pageBuilderCanvas = ref<{
  patchCloneField: (payload: CloneFieldPatchPayload) => void
  duplicateRegion: (regionId: string) => void
  collectCloneRegions: () => Promise<CloneRegion[]>
} | null>(null)
const editorSectionId = ref<string | null>(null)
const editorSection = computed(() =>
  editorSectionId.value ? sections.value.find((s: any) => s.id === editorSectionId.value) ?? null : null,
)
const selectedCloneRegion = computed(() => {
  if (!selectedCloneRegionId.value)
    return null
  // Prefer the live region emitted by the clone bridge (carries editable_fields); fall back to the
  // persisted section_index for regions restored from a saved page.
  if (selectedCloneRegionData.value && selectedCloneRegionData.value.id === selectedCloneRegionId.value)
    return selectedCloneRegionData.value
  return cloneRegions.value.find(region => region.id === selectedCloneRegionId.value) ?? null
})
const catalogModelSlug = computed(() =>
  parentModelSlug.value || (modelSlug.value.includes('--') ? modelSlug.value.split('--')[0] : modelSlug.value),
)

function openEditor(id: string) {
  selectSection(id)
  if (isWriteProtectedPage.value)
    return
  editorSectionId.value = id
}
function closeEditor() {
  editorSectionId.value = null
}
function updateEditorSection(updates: Record<string, any>) {
  if (isWriteProtectedPage.value)
    return
  if (editorSectionId.value)
    updateSection(editorSectionId.value, updates)
}

function setPageMode(mode: PageMode) {
  if (mode !== 'clone') {
    cloneDraftHtml.value = null
    cloneEditorOpen.value = false
  }
  else {
    cloneDraftHtml.value = cloneHtml.value
    closeEditor()
  }
  setActiveMode(mode)
}

function onCloneDomUpdated(html: string) {
  if (isWriteProtectedPage.value)
    return
  cloneDraftHtml.value = html
  isDirty.value = true
}

function onCloneRegionAdded(region: CloneRegion) {
  if (isWriteProtectedPage.value)
    return
  addCloneRegion(region)
}

function onCloneRegionSelected(region: CloneRegion) {
  selectCloneRegion(region)
  if (isWriteProtectedPage.value)
    return
  cloneEditorOpen.value = true
}

function patchCloneField(payload: CloneFieldPatchPayload) {
  if (isWriteProtectedPage.value)
    return
  pageBuilderCanvas.value?.patchCloneField(payload)
}

// Canvas emits update-field for both structured sections and clone-region height crops. Height crops
// live in section_index (via setRegionHeight); everything else is a section field update.
function onUpdateField(id: string, field: string, value: any) {
  if (isWriteProtectedPage.value)
    return
  if (activeMode.value === 'clone' && field === 'height_override') {
    setRegionHeight(id, value == null ? null : Number(value))
    return
  }
  updateSection(id, { [field]: value })
}

// Structural region actions. `delete`/`hide` map to a visibility patch (the pragmatic delete for a
// clone). `duplicate` clones the region via the bridge; `convert` stages an editable section.
async function onRegionAction({ action, regionId, html, tailwindRecipeArtifact }: { action: RegionActionId, regionId: string, html?: string, tailwindRecipeArtifact?: any }) {
  if (isWriteProtectedPage.value)
    return
  if (action === 'delete' || action === 'hide') {
    const selector = `[data-oem-region-id="${regionId}"]`
    patchCloneField({
      regionId,
      fieldId: `${regionId}:visibility`,
      selector,
      kind: 'visibility',
      value: false,
    })
    return
  }
  if (action === 'duplicate') {
    pageBuilderCanvas.value?.duplicateRegion(regionId)
    return
  }
  if (action === 'match-oem') {
    const section = await buildEditableSectionFromCloneRegion({
      html,
      tailwindRecipeArtifact,
      compileTailwindRecipeArtifact,
    })
    if (!section || !html?.trim()) {
      toast.error('This region does not include enough captured HTML to compare')
      return
    }
    fidelityRegionId.value = regionId
    fidelityOriginalHtml.value = html
    fidelityOriginalCss.value = extractTailwindRecipeArtifactCss(tailwindRecipeArtifact)
    fidelityRecipeArtifact.value = tailwindRecipeArtifact && typeof tailwindRecipeArtifact === 'object' ? tailwindRecipeArtifact : null
    fidelityCandidateSection.value = {
      ...section,
      _clone_region_id: regionId,
      _tailwind_original_html: html,
    }
    fidelityOpen.value = true
    cloneEditorOpen.value = false
    return
  }
  if (action === 'convert' || action === 'convert-tailwind-selected') {
    const section = await buildEditableSectionFromCloneRegion({
      html,
      tailwindRecipeArtifact,
      compileTailwindRecipeArtifact,
    })
    if (!section) {
      toast.error('Region HTML is not available')
      return
    }
    addSectionFromLiveData(section)
    setActiveMode('sections')
    cloneEditorOpen.value = false
    toast.success('Region converted to editable section')
    return
  }
  if (action === 'convert-tailwind-all') {
    const collectedRegions = await pageBuilderCanvas.value?.collectCloneRegions()
    const result = await convertCloneRegionsToTailwindSections({
      regions: collectedRegions?.length ? collectedRegions : cloneRegionsForSave.value,
      compileTailwindRecipeArtifact,
      failClosed: true,
    })
    if (result.blocked) {
      toast.error(result.blocked.message)
      return
    }
    if (!result.sections.length) {
      toast.error('No clone regions are ready to convert')
      return
    }
    replaceSections(result.sections)
    setActiveMode('sections')
    const skippedSuffix = result.skipped.length ? ` (${result.skipped.length} skipped)` : ''
    toast.success(`Converted ${result.sections.length} region${result.sections.length === 1 ? '' : 's'} to Tailwind sections${skippedSuffix}`)
    return
  }
  if (action === 'bind-catalog') {
    if (!oemId.value) {
      toast.error('Model context is required to bind catalog data')
      return
    }
    if (!catalogModelSlug.value) {
      toast.error('Model slug is not available for this page')
      return
    }
    try {
      const products = await fetchProductsForModel(oemId.value, catalogModelSlug.value)
      if (!products.length) {
        toast.error(`No catalog products found for ${catalogModelSlug.value}`)
        return
      }
      const productIds = products.map(product => product.id)
      const variantColors = productIds.length ? await fetchVariantColors(productIds) : []
      const sectionsToInsert = buildCatalogSectionsFromModel({
        oemId: oemId.value,
        modelSlug: catalogModelSlug.value,
        regionId,
        products,
        variantColors,
      })
      for (const section of sectionsToInsert)
        addSectionFromLiveData(section)
      setActiveMode('sections')
      cloneEditorOpen.value = false
      toast.success('Model catalog data added to page sections')
    }
    catch (error: any) {
      toast.error(`Failed to bind catalog data: ${error?.message || 'Unknown error'}`)
    }
  }
}

function applyFidelityCandidate(section: Record<string, any>) {
  if (!fidelityOpen.value || isModelPageWriteProtected(oemId.value))
    return
  addSectionFromLiveData(section)
  setActiveMode('sections')
  fidelityOpen.value = false
  toast.success('OEM-matched conversion added to the unsaved draft')
}

async function saveActiveMode() {
  if (guardProtectedWrite())
    return

  if (activeMode.value === 'clone') {
    const saved = await saveClone(cloneDraftHtml.value ?? cloneHtml.value, cloneRegionsForSave.value)
    if (saved) {
      cloneDraftHtml.value = null
      if (page.value?.version) {
        publication.markDraftChanged(page.value.version)
        try {
          await publication.refresh()
        }
        catch (cause: any) {
          toast.warning(`Draft saved; publication state could not refresh: ${cause?.message || 'Unknown error'}`)
        }
      }
    }
    return
  }

  const previousVersion = page.value?.version
  await saveSections()
  if (!isDirty.value && page.value?.version && page.value.version !== previousVersion) {
    publication.markDraftChanged(page.value.version)
    try {
      await publication.refresh()
    }
    catch (cause: any) {
      toast.warning(`Draft saved; publication state could not refresh: ${cause?.message || 'Unknown error'}`)
    }
  }
}

async function refreshPublicationState() {
  if (!publicationPageId.value)
    return
  try {
    await publication.refresh()
  }
  catch (cause: any) {
    toast.error(`Failed to load publication state: ${cause?.message || 'Unknown error'}`)
  }
}

async function buildPublicationCandidate() {
  try {
    await publication.buildCandidate()
    toast.success(publication.canPublish.value ? 'Candidate passed validation' : 'Candidate validation needs attention')
  }
  catch (cause: any) {
    toast.error(`Failed to build candidate: ${cause?.message || 'Unknown error'}`)
  }
}

async function publishCandidate() {
  try {
    const response = await publication.publish()
    toast.success(`Revision ${response.published_revision} is now production`)
  }
  catch (cause: any) {
    toast.error(`Failed to publish candidate: ${cause?.message || 'Unknown error'}`)
  }
}

async function rollbackPublication(revision: number) {
  try {
    await publication.rollback(revision)
    toast.success(`Production rolled back to revision ${revision}`)
  }
  catch (cause: any) {
    toast.error(`Failed to roll back production: ${cause?.message || 'Unknown error'}`)
  }
}

function openCandidatePreview() {
  const slug = (route.params as { slug?: string }).slug
  if (slug)
    window.open(`/preview/${slug}?view=candidate`, '_blank', 'noopener,noreferrer')
}

function openSourceUrl() {
  const sourceUrl = page.value?.source_url
  if (sourceUrl)
    window.open(sourceUrl, '_blank', 'noopener,noreferrer')
}

function openPagePreview() {
  const slug = (route.params as { slug?: string }).slug
  if (slug)
    window.open(`/preview/${slug}`, '_blank', 'noopener,noreferrer')
}

function onCaptureHtml(html: string) {
  if (isWriteProtectedPage.value)
    return
  // Fallback: add captured HTML as a content-block section
  addSection('content-block')
  const newest = sections.value[sections.value.length - 1]
  if (newest) {
    updateSection(newest.id, {
      title: 'Captured Section',
      content_html: html,
      layout: 'full-width',
    })
  }
}

function onSmartCapture(section: { type: string, data: Record<string, any> }) {
  if (isWriteProtectedPage.value)
    return
  // AI identified the section type — create a properly typed section
  const type = section.type as any
  addSection(type)
  const newest = sections.value[sections.value.length - 1]
  if (newest) {
    updateSection(newest.id, section.data)
  }
}
const oems = ref<{ id: string, name: string }[]>([])

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

const selectedModel = ref(DEFAULT_AI_MODEL_VALUE)
const selectedModelOverride = computed(() => getAiModelOverride(selectedModel.value))
const isWriteProtectedPage = computed(() => isModelPageWriteProtected(oemId.value))
const writeProtectedMessage = computed(() =>
  getModelPageWriteProtectedMessage(oemName(oemId.value)),
)

interface ModelOverride { provider: string, model: string }

const DESTRUCTIVE_ACTION_COPY = {
  clone: 'Clone again? Existing manual edits or sections may be overwritten. Other mode data is preserved where possible.',
  structure: 'Structure again? Existing manual section edits may be overwritten. Clone mode is preserved.',
  pipeline: 'Run the pipeline again? Existing edits, sections, or clone HTML may be overwritten. Other mode data is preserved where possible.',
} as const

function confirmDestructiveAction(action: keyof typeof DESTRUCTIVE_ACTION_COPY) {
  if (!needsDestructiveActionConfirmation(action, page.value))
    return true

  return window.confirm(DESTRUCTIVE_ACTION_COPY[action])
}

function guardProtectedWrite() {
  if (!isWriteProtectedPage.value)
    return false
  error.value = writeProtectedMessage.value
  return true
}

async function runClone() {
  if (guardProtectedWrite())
    return
  if (!confirmDestructiveAction('clone'))
    return

  await handleClone()
  await loadCaptureDiagnostics()
  await loadMappingPreview()
}

async function runStructure(modelOverride?: ModelOverride) {
  if (guardProtectedWrite())
    return
  if (!confirmDestructiveAction('structure'))
    return

  await handleMapAndStructure(modelOverride)
  await loadMappingPreview()
}

async function runAdaptivePipeline(modelOverride?: ModelOverride) {
  if (guardProtectedWrite())
    return
  if (!confirmDestructiveAction('pipeline'))
    return

  startCompileStatusPolling()
  try {
    await handleAdaptivePipeline(modelOverride)
    await loadCaptureDiagnostics()
    await loadMappingPreview()
  }
  finally {
    stopCompileStatusPolling()
  }
}

function stopCompileStatusPolling() {
  if (!compileStatusPoller)
    return
  clearInterval(compileStatusPoller)
  compileStatusPoller = null
}

function startCompileStatusPolling() {
  stopCompileStatusPolling()
  compileStageLabel.value = 'Starting full preview pipeline'

  const poll = async () => {
    try {
      const status = await fetchCompileRunStatus(oemId.value, modelSlug.value)
      compileStageLabel.value = status.stageLabel
      if (status.status === 'succeeded' || status.status === 'failed')
        stopCompileStatusPolling()
    }
    catch {
      // Supporting indicator only; the pipeline action still owns success/failure.
    }
  }

  void poll()
  compileStatusPoller = setInterval(poll, 1500)
}

function handleKeyboard(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  if (!mod)
    return

  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  }
  else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
    e.preventDefault()
    redo()
  }
  else if (e.key === 'v' && !e.shiftKey) {
    if (isWriteProtectedPage.value)
      return
    // Only intercept if no input/textarea is focused
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
      return
    e.preventDefault()
    pasteSectionFromClipboard()
  }
}

let prevLayout: string
onMounted(async () => {
  // Force full-width content (removes container mx-auto from layout wrapper)
  prevLayout = themeStore.contentLayout
  themeStore.setContentLayout('full' as any)

  document.addEventListener('keydown', handleKeyboard)

  oems.value = await fetchOems()
  const slug = (route.params as { slug?: string }).slug
  if (slug) {
    await loadPage(slug)
    cloneDraftHtml.value = null
    cloneEditorOpen.value = false
    await refreshPublicationState()
    void loadCaptureDiagnostics()
    void loadMappingPreview()
  }
})

const captureDiagnostics = ref<CaptureDiagnosticsRecord | null>(null)
async function loadCaptureDiagnostics() {
  captureDiagnostics.value = null
  if (!oemId.value || !modelSlug.value)
    return
  try {
    const res = await fetchCaptureDiagnostics(oemId.value, modelSlug.value)
    captureDiagnostics.value = res.found ? res.latest ?? null : null
  }
  catch {
    captureDiagnostics.value = null
  }
}
const captureStatus = computed(() => describeCaptureStatus(captureDiagnostics.value))
const captureStatusBadgeClass = computed(() => {
  switch (captureStatus.value.tone) {
    case 'success': return 'bg-emerald-600 text-white'
    case 'warning': return 'bg-amber-600 text-white'
    case 'error': return 'bg-red-600 text-white'
    default: return 'bg-muted text-muted-foreground'
  }
})

interface MappingPreviewSummary {
  overall_confidence: number
  needs_ai_fallback: boolean
  sections: Array<{ type: string, confidence: number }>
}

const mappingPreview = ref<MappingPreviewSummary | null>(null)
async function loadMappingPreview() {
  mappingPreview.value = null
  if (!oemId.value || !modelSlug.value || !isCloned.value)
    return
  try {
    const res = await mapPagePreview(oemId.value, modelSlug.value)
    mappingPreview.value = res.success && res.mapping ? res.mapping : null
  }
  catch {
    mappingPreview.value = null
  }
}
const mappingStatus = computed(() => {
  const mapping = mappingPreview.value
  if (!mapping)
    return null
  const percent = Math.round((mapping.overall_confidence || 0) * 100)
  const count = Array.isArray(mapping.sections) ? mapping.sections.length : 0
  return {
    percent,
    count,
    needsAiFallback: mapping.needs_ai_fallback,
    detail: `${count} mapped section${count === 1 ? '' : 's'}; ${mapping.needs_ai_fallback ? 'AI fallback expected' : 'deterministic structure available'}`,
  }
})

onUnmounted(() => {
  stopCompileStatusPolling()
  themeStore.setContentLayout(prevLayout as any)
  document.removeEventListener('keydown', handleKeyboard)
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

const pageTitle = computed(() => {
  if (!page.value)
    return 'Page Builder'
  return `${page.value.name} (${oemName(page.value.oem_id)})`
})

const needsSourceUrl = computed(() => isSubpage.value && !isCloned.value)
const pageWorkflowState = computed(() => getPageWorkflowState({
  page: page.value,
  error: error.value,
}))
const primaryWorkflowAction = computed(() => getPrimaryWorkflowAction(pageWorkflowState.value, {
  isDirty: isDirty.value,
}))
const canShowEditorActions = computed(() => pageWorkflowState.value !== 'missing')
const canShowWorkflowActions = computed(() => canShowEditorActions.value && !isWriteProtectedPage.value && pageWorkflowState.value !== 'custom')
const canShowSectionActions = computed(() => canShowEditorActions.value && !isWriteProtectedPage.value && (isStructured.value || sections.value.length > 0))
const canShowSaveAction = computed(() => canShowEditorActions.value && !isWriteProtectedPage.value && (activeMode.value === 'clone' ? isCloned.value : canShowSectionActions.value))
const canShowModeSwitcher = computed(() => availableModes.value.length > 1)
const canShowSourceUrlInput = computed(() => !isWriteProtectedPage.value && shouldShowSourceUrlInput(pageWorkflowState.value))
const pipelineActionDisabled = computed(() => isPipelineActionDisabled({
  needsSourceUrl: needsSourceUrl.value,
  sourceUrlOverride: sourceUrlOverride.value,
  pipelining: pipelining.value,
  cloning: cloning.value,
  structuring: structuring.value,
}) || isWriteProtectedPage.value)
const fullPreviewActionLabel = computed(() =>
  pageWorkflowState.value === 'missing' || pageWorkflowState.value === 'empty'
    ? 'Build Full Preview'
    : 'Rebuild Full Preview',
)
const fullPreviewButtonLabel = computed(() =>
  pipelining.value ? (compileStageLabel.value || 'Building...') : fullPreviewActionLabel.value,
)

const subpageDisplayName = computed(() => {
  if (!isSubpage.value || !subpageSlug.value)
    return ''
  return page.value?.subpage_name || subpageSlug.value.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
})

const parentPageName = computed(() => {
  if (!parentModelSlug.value)
    return ''
  return parentModelSlug.value.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
})

// Workflow steps for the stepper
const workflowSteps = computed(() => {
  if (pageWorkflowState.value === 'custom') {
    return [{
      label: 'Refine',
      description: 'Add sections manually',
      done: false,
      active: true,
    }]
  }
  const workflowState = pageWorkflowState.value
  return [
    {
      label: 'Clone',
      description: 'Capture OEM page',
      done: workflowState === 'cloned' || workflowState === 'structured',
      active: workflowState === 'empty' || workflowState === 'missing',
    },
    {
      label: 'Structure',
      description: 'Extract sections via AI',
      done: workflowState === 'structured',
      active: workflowState === 'cloned',
    },
    {
      label: 'Refine',
      description: 'Edit, reorder, regenerate',
      done: false,
      active: workflowState === 'structured',
    },
  ]
})

watch(
  () => page.value?.id ?? page.value?.slug,
  () => {
    cloneDraftHtml.value = null
    cloneEditorOpen.value = false
    mappingPreview.value = null
  },
)

watch(
  activeMode,
  (mode, previousMode) => {
    if (previousMode === 'clone' && mode !== 'clone') {
      cloneDraftHtml.value = null
      cloneEditorOpen.value = false
    }
    if (mode === 'clone')
      closeEditor()
  },
)
</script>

<template>
  <!-- Full-width layout: -m-4 cancels p-4 from default layout -->
  <div class="-m-4 flex flex-col h-[calc(100vh-4rem)]">
    <!-- Toolbar -->
    <div data-page-builder-toolbar="true" class="flex items-center gap-1.5 overflow-hidden border-b bg-card px-2 py-2 shrink-0 sm:gap-2 sm:px-4">
      <div data-page-builder-context="true" class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
        <UiButton
          size="sm"
          variant="ghost"
          class="shrink-0"
          @click="router.push('/dashboard/model-pages')"
        >
          <ArrowLeft class="size-4 sm:mr-1" />
          <span class="hidden sm:inline">Pages</span>
        </UiButton>

        <UiSeparator orientation="vertical" class="h-5 shrink-0 hidden sm:block" />

        <template v-if="page">
          <!-- Subpage breadcrumb -->
          <template v-if="isSubpage && parentFullSlug">
            <button
              class="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-[100px] sm:max-w-[160px]"
              @click="router.push(`/dashboard/page-builder/${parentFullSlug}`)"
            >
              {{ parentPageName }}
            </button>
            <ChevronRight class="size-3.5 text-muted-foreground shrink-0" />
            <span class="font-semibold text-sm truncate min-w-0 max-w-[120px] sm:max-w-[200px] 2xl:max-w-[320px]">{{ subpageDisplayName }}</span>
            <UiBadge variant="secondary" class="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 shrink-0">
              Subpage
            </UiBadge>
          </template>
          <template v-else>
            <span class="font-semibold text-sm truncate min-w-0 max-w-[120px] sm:max-w-[220px] xl:max-w-[280px] 2xl:max-w-[420px]">{{ pageTitle }}</span>
          </template>
          <UiBadge v-if="page.version" variant="secondary" class="text-[10px] shrink-0">
            v{{ page.version }}
          </UiBadge>
          <UiBadge v-if="isWriteProtectedPage" variant="secondary" class="text-[10px] shrink-0">
            <Lock class="size-3 mr-1" />
            Read-only
          </UiBadge>
          <UiBadge v-if="pageWorkflowState === 'structured'" variant="default" class="text-[10px] bg-emerald-600 shrink-0 hidden sm:inline-flex">
            Structured
          </UiBadge>
          <UiBadge v-else-if="pageWorkflowState === 'cloned'" variant="default" class="text-[10px] bg-amber-600 shrink-0 hidden sm:inline-flex">
            Cloned
          </UiBadge>
          <UiBadge
            v-if="captureStatus.tone !== 'neutral'"
            variant="default"
            class="text-[10px] shrink-0 hidden md:inline-flex"
            :class="captureStatusBadgeClass"
            :title="captureStatus.detail"
          >
            {{ captureStatus.label }}
          </UiBadge>
          <UiBadge
            v-if="mappingStatus"
            variant="default"
            class="text-[10px] shrink-0 hidden md:inline-flex"
            :class="mappingStatus.needsAiFallback ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'"
            :title="mappingStatus.detail"
          >
            <template v-if="mappingStatus.needsAiFallback">
              AI fallback {{ mappingStatus.percent }}%
            </template>
            <template v-else>
              Map {{ mappingStatus.percent }}%
            </template>
          </UiBadge>
          <div v-if="canShowModeSwitcher" class="ml-1 hidden lg:inline-flex items-center rounded-md border bg-muted/40 p-0.5 shrink-0">
            <button
              v-for="mode in availableModes"
              :key="mode"
              type="button"
              class="px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize"
              :class="activeMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="setPageMode(mode)"
            >
              {{ mode === 'clone' ? 'Clone Studio' : mode === 'sections' ? 'Sections' : mode.replace('-', ' ') }}
            </button>
          </div>
        </template>
      </div>

      <!-- Actions -->
      <div data-page-builder-actions="true" class="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
        <!-- Undo/Redo — always visible (icon-only, small) -->
        <UiButton
          v-if="canShowSectionActions"
          size="sm"
          variant="ghost"
          :disabled="!canUndo"
          title="Undo (Ctrl+Z)"
          class="size-8 p-0"
          @click="undo"
        >
          <Undo2 class="size-3.5" />
        </UiButton>
        <UiButton
          v-if="canShowSectionActions"
          size="sm"
          variant="ghost"
          :disabled="!canRedo"
          title="Redo (Ctrl+Shift+Z)"
          class="size-8 p-0"
          @click="redo"
        >
          <Redo2 class="size-3.5" />
        </UiButton>

        <!-- === INLINE buttons on very wide screens === -->

        <!-- Import -->
        <UiButton
          v-if="canShowSectionActions"
          size="sm"
          variant="outline"
          title="Import sections from another page"
          class="hidden min-[2400px]:inline-flex"
          @click="showSectionBrowser = true"
        >
          <Import class="size-3.5 mr-1" />
          Import
        </UiButton>

        <!-- Capture from URL -->
        <UiButton
          v-if="canShowSectionActions"
          size="sm"
          variant="outline"
          title="Capture sections from a live webpage"
          class="hidden min-[2400px]:inline-flex"
          @click="showCapture = true"
        >
          <MousePointer2 class="size-3.5 mr-1" />
          Capture
        </UiButton>

        <!-- Paste -->
        <UiButton
          v-if="canShowSectionActions"
          size="sm"
          variant="outline"
          title="Paste sections from clipboard (Ctrl+V)"
          class="hidden min-[2400px]:inline-flex"
          @click="pasteSectionFromClipboard()"
        >
          <ClipboardPaste class="size-3.5 mr-1" />
          Paste
        </UiButton>

        <!-- History -->
        <UiButton
          v-if="canShowSectionActions"
          size="sm"
          :variant="showHistory ? 'default' : 'outline'"
          title="History"
          class="hidden min-[2400px]:inline-flex"
          @click="showHistory = !showHistory"
        >
          <History class="size-3.5 mr-1" />
          History
        </UiButton>

        <UiSeparator v-if="canShowSectionActions" orientation="vertical" class="h-5 hidden min-[2400px]:block" />

        <!-- Clone -->
        <UiButton
          v-if="canShowWorkflowActions"
          size="sm"
          variant="outline"
          :disabled="cloning || pipelining || (needsSourceUrl && !sourceUrlOverride?.trim())"
          class="hidden min-[2400px]:inline-flex"
          @click="runClone()"
        >
          <Copy v-if="!cloning" class="size-3.5 mr-1" />
          <Loader2 v-else class="size-3.5 mr-1 animate-spin" />
          Clone
        </UiButton>

        <!-- AI model selector -->
        <div v-if="canShowWorkflowActions" class="hidden min-[2400px]:flex items-center gap-1.5 rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 px-1.5 py-1">
          <Cpu class="size-3.5 text-violet-500 shrink-0" />
          <UiSelect v-model="selectedModel">
            <UiSelectTrigger class="h-7 w-44 text-xs bg-background">
              <UiSelectValue placeholder="Default (from settings)" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="opt in AI_MODEL_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>

        <!-- Structure -->
        <UiButton
          v-if="canShowWorkflowActions && (pageWorkflowState === 'cloned' || pageWorkflowState === 'structured')"
          size="sm"
          :variant="primaryWorkflowAction.key === 'structure' ? 'default' : 'outline'"
          :disabled="structuring || pipelining"
          class="hidden min-[2400px]:inline-flex"
          @click="runStructure(selectedModelOverride)"
        >
          <Sparkles v-if="!structuring" class="size-3.5 mr-1" />
          <Loader2 v-else class="size-3.5 mr-1 animate-spin" />
          {{ primaryWorkflowAction.key === 'structure' ? primaryWorkflowAction.label : 'Structure' }}
        </UiButton>

        <!-- Adaptive Pipeline -->
        <UiButton
          v-if="canShowWorkflowActions"
          size="sm"
          :variant="pipelining || primaryWorkflowAction.key === 'pipeline' ? 'default' : 'outline'"
          :disabled="pipelineActionDisabled"
          class="hidden min-[2400px]:inline-flex border-violet-300 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950"
          title="Run full preview pipeline (clone, structure, refresh preview)"
          @click="runAdaptivePipeline(selectedModelOverride)"
        >
          <Zap v-if="!pipelining" class="size-3.5 mr-1 text-violet-500" />
          <Loader2 v-else class="size-3.5 mr-1 animate-spin" />
          {{ fullPreviewButtonLabel }}
        </UiButton>

        <UiSeparator v-if="canShowWorkflowActions" orientation="vertical" class="h-5 hidden min-[2400px]:block" />

        <!-- Save Draft — persistence stays separate from candidate build and publish -->
        <UiButton
          v-if="canShowSaveAction"
          size="sm"
          :variant="isDirty ? 'default' : 'outline'"
          :disabled="saving || !isDirty"
          @click="saveActiveMode"
        >
          <Save v-if="!saving" class="size-3.5 mr-1" />
          <Loader2 v-else class="size-3.5 mr-1 animate-spin" />
          <span class="hidden sm:inline">Save Draft</span>
          <span v-if="isDirty" class="ml-1 size-1.5 rounded-full bg-amber-400 inline-block" />
        </UiButton>

        <PublicationControls
          v-if="canShowEditorActions"
          :draft-version="draftVersion"
          :published-revision="publication.publishedRevision.value"
          :candidate-revision="publication.candidate.value?.revision ?? null"
          :candidate-status="publication.status.value"
          :can-build="draftVersion != null && !publication.isLoading.value && !saving && !isDirty"
          :can-publish="publication.canPublish.value && !publication.isLoading.value"
          :busy="publication.isLoading.value || saving"
          :validation="publication.validation.value"
          :history="publication.history.value"
          @build-candidate="buildPublicationCandidate"
          @preview-candidate="openCandidatePreview"
          @publish="publishCandidate"
          @rollback="rollbackPublication"
        />

        <!-- Source — inline on very wide screens -->
        <a
          v-if="canShowEditorActions && page?.source_url"
          :href="page.source_url"
          target="_blank"
          class="hidden min-[2400px]:inline-flex"
        >
          <UiButton size="sm" variant="outline">
            <ExternalLink class="size-3.5 mr-1" />
            Source
          </UiButton>
        </a>

        <!-- Preview — opens the page chrome-free in a new tab -->
        <UiButton
          v-if="canShowEditorActions && (isCloned || isStructured)"
          size="sm"
          variant="outline"
          class="hidden min-[2400px]:inline-flex"
          title="Preview page in a new tab"
          @click="openPagePreview"
        >
          <Eye class="size-3.5 mr-1" />
          Preview
        </UiButton>

        <!-- JSON toggle — inline on very wide screens -->
        <UiButton
          v-if="canShowEditorActions && !isWriteProtectedPage"
          size="sm"
          :variant="showJson ? 'default' : 'outline'"
          class="hidden min-[2400px]:inline-flex"
          @click="showJson = !showJson"
        >
          <Code class="size-3.5 mr-1" />
          JSON
        </UiButton>

        <!-- === OVERFLOW MENU except on very wide screens === -->
        <UiDropdownMenu v-if="canShowEditorActions">
          <UiDropdownMenuTrigger as-child>
            <UiButton size="sm" variant="outline" class="min-[2400px]:hidden size-8 p-0" title="More actions">
              <Menu class="size-4" />
            </UiButton>
          </UiDropdownMenuTrigger>
          <UiDropdownMenuContent align="end" class="w-48">
            <UiDropdownMenuLabel class="text-[10px] text-muted-foreground">
              Edit
            </UiDropdownMenuLabel>
            <UiDropdownMenuItem
              v-if="canShowSectionActions"
              @select="showSectionBrowser = true"
            >
              <Import class="size-3.5 mr-2" />
              Import Sections
            </UiDropdownMenuItem>
            <UiDropdownMenuItem
              v-if="canShowSectionActions"
              @select="pasteSectionFromClipboard()"
            >
              <ClipboardPaste class="size-3.5 mr-2" />
              Paste from Clipboard
              <UiDropdownMenuShortcut>Ctrl+V</UiDropdownMenuShortcut>
            </UiDropdownMenuItem>
            <UiDropdownMenuItem
              v-if="canShowSectionActions"
              @select="showHistory = !showHistory"
            >
              <History class="size-3.5 mr-2" />
              History
            </UiDropdownMenuItem>

            <template v-if="canShowWorkflowActions">
              <UiDropdownMenuSeparator />
              <UiDropdownMenuLabel class="text-[10px] text-muted-foreground">
                Pipeline
              </UiDropdownMenuLabel>
              <UiDropdownMenuItem
                :disabled="cloning || pipelining || (needsSourceUrl && !sourceUrlOverride?.trim())"
                @select="runClone()"
              >
                <Copy class="size-3.5 mr-2" />
                Clone{{ needsSourceUrl && !sourceUrlOverride?.trim() ? ' (enter URL first)' : '' }}
              </UiDropdownMenuItem>
              <UiDropdownMenuSub>
                <UiDropdownMenuSubTrigger>
                  <Cpu class="size-3.5 mr-2 text-violet-500" />
                  AI Model
                </UiDropdownMenuSubTrigger>
                <UiDropdownMenuSubContent>
                  <UiDropdownMenuRadioGroup v-model="selectedModel">
                    <UiDropdownMenuRadioItem v-for="opt in AI_MODEL_OPTIONS" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </UiDropdownMenuRadioItem>
                  </UiDropdownMenuRadioGroup>
                </UiDropdownMenuSubContent>
              </UiDropdownMenuSub>
              <UiDropdownMenuItem
                v-if="pageWorkflowState === 'cloned' || pageWorkflowState === 'structured'"
                :disabled="structuring || pipelining"
                @select="runStructure(selectedModelOverride)"
              >
                <Sparkles class="size-3.5 mr-2" />
                {{ primaryWorkflowAction.key === 'structure' ? primaryWorkflowAction.label : 'Structure' }}
              </UiDropdownMenuItem>
              <UiDropdownMenuItem
                :disabled="pipelineActionDisabled"
                @select="runAdaptivePipeline(selectedModelOverride)"
              >
                <Zap class="size-3.5 mr-2 text-violet-500" />
                {{ fullPreviewActionLabel }}
              </UiDropdownMenuItem>
            </template>

            <UiDropdownMenuSeparator />
            <UiDropdownMenuLabel class="text-[10px] text-muted-foreground">
              View
            </UiDropdownMenuLabel>
            <UiDropdownMenuItem v-if="!isWriteProtectedPage" @select="showJson = !showJson">
              <Code class="size-3.5 mr-2" />
              {{ showJson ? 'Hide JSON' : 'Show JSON' }}
            </UiDropdownMenuItem>
            <UiDropdownMenuItem
              v-if="isCloned || isStructured"
              @select="openPagePreview"
            >
              <Eye class="size-3.5 mr-2" />
              Preview page
            </UiDropdownMenuItem>
            <UiDropdownMenuItem
              v-if="page?.source_url"
              @select="openSourceUrl"
            >
              <ExternalLink class="size-3.5 mr-2" />
              View Source
            </UiDropdownMenuItem>
          </UiDropdownMenuContent>
        </UiDropdownMenu>
      </div>
    </div>

    <!-- Required source URL gets its own row so it never competes with primary actions. -->
    <div
      v-if="canShowSourceUrlInput"
      data-page-builder-source-url="true"
      class="flex min-w-0 items-center gap-2 border-b bg-card px-3 py-2 shrink-0 sm:px-4"
    >
      <Globe class="size-3.5 text-muted-foreground shrink-0" />
      <label for="page-builder-source-url" class="sr-only">OEM source page URL</label>
      <input
        id="page-builder-source-url"
        v-model="sourceUrlOverride"
        type="url"
        placeholder="OEM page URL to clone..."
        class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
    </div>

    <div
      v-if="isWriteProtectedPage && page"
      class="flex items-center gap-2 px-4 py-2 border-b bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm shrink-0"
    >
      <Lock class="size-4 shrink-0" />
      <span>{{ writeProtectedMessage }}. This page is read-only in the dashboard.</span>
    </div>

    <!-- Workflow Stepper -->
    <div v-if="canShowEditorActions && page && !loading" class="flex items-center gap-0 px-4 py-2 border-b bg-muted/30 shrink-0 overflow-x-auto">
      <template v-for="(step, i) in workflowSteps" :key="step.label">
        <div
          class="flex items-center gap-1.5 text-xs shrink-0"
          :class="step.active ? 'text-foreground font-medium' : step.done ? 'text-emerald-600' : 'text-muted-foreground'"
        >
          <div
            class="size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            :class="step.done ? 'bg-emerald-100 dark:bg-emerald-900/50' : step.active ? 'bg-primary/10 ring-1 ring-primary' : 'bg-muted'"
          >
            <Check v-if="step.done" class="size-3 text-emerald-600" />
            <Circle v-else-if="step.active" class="size-2.5 fill-primary text-primary" />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <div>
            <span>{{ step.label }}</span>
            <span class="hidden sm:inline text-muted-foreground ml-1">{{ step.description }}</span>
          </div>
        </div>
        <div
          v-if="i < workflowSteps.length - 1"
          class="w-8 sm:w-12 h-px mx-2 shrink-0"
          :class="step.done ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-border'"
        />
      </template>

      <!-- Pipeline result summary (shows after pipeline finishes) -->
      <div v-if="pipelineResult" class="ml-auto flex items-center gap-2 text-xs shrink-0">
        <UiBadge
          :variant="pipelineResult.success ? 'default' : 'destructive'"
          class="text-[10px]"
          :class="pipelineResult.success ? 'bg-emerald-600' : ''"
        >
          {{ pipelineResult.success ? 'Pipeline Complete' : 'Pipeline Failed' }}
        </UiBadge>
        <span v-if="pipelineResult.quality_score" class="text-muted-foreground">
          Quality: {{ (pipelineResult.quality_score * 100).toFixed(0) }}%
        </span>
        <span v-if="pipelineResult.total_cost_usd" class="text-muted-foreground">
          ${{ pipelineResult.total_cost_usd.toFixed(4) }}
        </span>
        <span v-if="pipelineResult.total_duration_ms" class="text-muted-foreground">
          {{ (pipelineResult.total_duration_ms / 1000).toFixed(1) }}s
        </span>
      </div>
    </div>

    <!-- Error banner (non-404) -->
    <div
      v-if="error && pageWorkflowState !== 'missing'"
      class="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b shrink-0"
    >
      {{ error }}
    </div>

    <!-- 404 empty state — page not generated yet -->
    <div v-if="pageWorkflowState === 'missing' && !loading" class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-md space-y-4">
        <div class="mx-auto size-16 rounded-full bg-muted flex items-center justify-center">
          <Globe class="size-8 text-muted-foreground" />
        </div>
        <h2 class="text-xl font-semibold">
          Page not generated yet
        </h2>
        <p class="text-sm text-muted-foreground">
          No page exists for <span class="font-medium text-foreground">{{ oemId }} / {{ modelSlug }}</span>.
          Run the adaptive pipeline from the OEM source site.
        </p>
        <div v-if="canShowSourceUrlInput" class="space-y-1">
          <label for="missing-source-url" class="sr-only">OEM source URL</label>
          <input
            id="missing-source-url"
            v-model="sourceUrlOverride"
            type="url"
            placeholder="OEM page URL to clone..."
            class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
        </div>
        <button
          class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          :disabled="pipelineActionDisabled"
          title="Run full preview pipeline (clone, structure, refresh preview)"
          @click="runAdaptivePipeline(selectedModelOverride)"
        >
          <Loader2 v-if="pipelining" class="size-4 animate-spin" />
          <Zap v-else class="size-4" />
          {{ isWriteProtectedPage ? 'Protected' : fullPreviewButtonLabel }}
        </button>
        <p v-if="isWriteProtectedPage" class="text-xs text-amber-600 dark:text-amber-400">
          {{ writeProtectedMessage }}.
        </p>
        <p v-if="pipelining" class="text-xs text-muted-foreground">
          {{ compileStageLabel || 'This may take 1-2 minutes' }}
        </p>
        <div class="pt-2">
          <button class="text-sm text-muted-foreground hover:text-foreground" @click="router.push('/dashboard/model-pages')">
            <ArrowLeft class="size-3 inline mr-1" /> Back to model pages
          </button>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- JSON view -->
    <div v-else-if="canShowEditorActions && !isWriteProtectedPage && showJson" class="flex-1 overflow-hidden">
      <JsonEditorView
        :sections="sections"
        @move-section="moveSection"
        @delete-section="deleteSection"
        @copy-section="copySectionToClipboard"
        @update-section="updateSection"
        @replace-sections="replaceSections"
      />
    </div>

    <!-- Split panel layout -->
    <template v-else-if="canShowEditorActions && page">
      <UiResizablePanelGroup direction="horizontal" class="flex-1 min-h-0">
        <!-- Canvas (left) -->
        <UiResizablePanel :default-size="65" :min-size="40">
          <PageBuilderCanvas
            ref="pageBuilderCanvas"
            :page="page"
            :sections="sections"
            :selected-section-id="selectedSectionId"
            :active-mode="activeMode"
            :selected-clone-region-id="selectedCloneRegionId"
            :is-cloned="isCloned"
            :is-structured="isStructured"
            :worker-base="WORKER_BASE"
            :oem-id="oemId"
            :model-slug="modelSlug"
            :read-only="isWriteProtectedPage"
            @select-section="selectSection"
            @open-editor="openEditor"
            @move-section="moveSection"
            @duplicate-section="duplicateSection"
            @delete-section="deleteSection"
            @update-field="onUpdateField"
            @select-clone-region="onCloneRegionSelected"
            @clone-dom-updated="onCloneDomUpdated"
            @clone-region-added="onCloneRegionAdded"
            @region-action="onRegionAction"
          />
        </UiResizablePanel>

        <UiResizableHandle with-handle />

        <!-- Sidebar (right) -->
        <UiResizablePanel :default-size="35" :min-size="20">
          <PageBuilderSidebar
            :page="page"
            :sections="sections"
            :selected-section-id="selectedSectionId"
            :active-mode="activeMode"
            :clone-regions="cloneRegions"
            :selected-clone-region-id="selectedCloneRegionId"
            :oem-name="oemName(page.oem_id)"
            :oem-id="oemId"
            :recipes="recipes"
            :read-only="isWriteProtectedPage"
            @select-section="selectSection"
            @add-from-recipe="addSectionFromRecipe"
            @open-editor="openEditor"
            @move-section="moveSection"
            @delete-section="deleteSection"
            @duplicate-section="duplicateSection"
            @copy-section-json="copySectionToClipboard"
            @convert-section="(id: string, type: string) => convertSection(id, type as any)"
            @split-section="splitSection"
            @save-as-recipe="saveCurrentAsRecipe"
            @add-section="addSection"
            @add-section-from-template="addSectionFromTemplate"
            @insert-from-gallery="addSectionFromLiveData"
            @paste-from-clipboard="pasteSectionFromClipboard()"
            @select-clone-region="onCloneRegionSelected"
            @edit-clone-region="onCloneRegionSelected"
          />
        </UiResizablePanel>
      </UiResizablePanelGroup>

      <!-- Floating section editor dialog -->
      <SectionEditorDialog
        v-if="editorSection && !isWriteProtectedPage"
        :section="editorSection"
        :regenerating="regenerating"
        :oem-id="oemId"
        :model-slug="modelSlug"
        @close="closeEditor"
        @regenerate="regenerateSectionById(editorSection.id)"
        @delete="deleteSection(editorSection.id); closeEditor()"
        @convert="(type: string) => convertSection(editorSection.id, type as any)"
        @update:section="updateEditorSection($event)"
      />

      <UiSheet
        v-if="activeMode === 'clone'"
        :open="cloneEditorOpen && !!selectedCloneRegion"
        @update:open="cloneEditorOpen = $event"
      >
        <UiSheetContent side="right" class="w-80 sm:w-96 p-0">
          <UiSheetHeader class="sr-only">
            <UiSheetTitle>Clone Inspector</UiSheetTitle>
            <UiSheetDescription>Edit fields in the selected cloned DOM region</UiSheetDescription>
          </UiSheetHeader>
          <CloneRegionEditor
            :region="selectedCloneRegion"
            @patch-field="patchCloneField"
          />
        </UiSheetContent>
      </UiSheet>
    </template>

    <!-- Section Capture (load page in iframe, click to capture) -->
    <SectionCapture
      v-if="canShowEditorActions && !isWriteProtectedPage && showCapture"
      :worker-base="WORKER_BASE"
      :oem-id="oemId"
      :model-slug="modelSlug"
      :default-url="page?.source_url"
      @close="showCapture = false"
      @capture="onCaptureHtml"
      @smart-capture="onSmartCapture"
    />

    <!-- Section Browser Dialog (import from other pages) -->
    <SectionBrowserDialog
      v-if="canShowEditorActions && !isWriteProtectedPage"
      :open="showSectionBrowser"
      @update:open="showSectionBrowser = $event"
      @paste="pasteSections"
    />

    <FidelityAssistantDialog
      v-if="canShowEditorActions && !isWriteProtectedPage"
      :open="fidelityOpen"
      :oem-id="oemId"
      :model-slug="modelSlug"
      :source-url="page?.source_url || ''"
      :region-id="fidelityRegionId"
      :original-html="fidelityOriginalHtml"
      :original-css="fidelityOriginalCss"
      :candidate-section="fidelityCandidateSection"
      :recipe-artifact="fidelityRecipeArtifact"
      @update:open="fidelityOpen = $event"
      @apply="applyFidelityCandidate"
    />

    <!-- History Sheet -->
    <UiSheet v-if="canShowEditorActions" v-model:open="showHistory">
      <UiSheetContent side="right" class="w-80 sm:w-96 p-0">
        <UiSheetHeader class="sr-only">
          <UiSheetTitle>History</UiSheetTitle>
          <UiSheetDescription>View and navigate change history</UiSheetDescription>
        </UiSheetHeader>
        <HistoryPanel
          :history="history"
          :history-index="historyIndex"
          :can-undo="canUndo"
          :can-redo="canRedo"
          @undo="undo"
          @redo="redo"
          @jump-to="jumpTo"
        />
      </UiSheetContent>
    </UiSheet>
  </div>
</template>
