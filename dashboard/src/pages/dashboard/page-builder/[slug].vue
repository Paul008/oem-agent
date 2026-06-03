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
  Globe,
  History,
  Import,
  Loader2,
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

import { useOemData } from '@/composables/use-oem-data'
import { usePageBuilder } from '@/composables/use-page-builder'
import { useThemeStore } from '@/stores/theme'

import type { CloneRegion, PageMode } from './page-modes'

import HistoryPanel from '../components/page-builder/HistoryPanel.vue'
import JsonEditorView from '../components/page-builder/JsonEditorView.vue'
import CloneRegionEditor from '../components/page-builder/CloneRegionEditor.vue'
import type { CloneFieldPatchPayload } from '../components/page-builder/CloneRegionEditor.vue'
import PageBuilderCanvas from '../components/page-builder/PageBuilderCanvas.vue'
import PageBuilderSidebar from '../components/page-builder/PageBuilderSidebar.vue'
import SectionBrowserDialog from '../components/page-builder/SectionBrowserDialog.vue'
import SectionCapture from '../components/page-builder/SectionCapture.vue'
import SectionEditorDialog from '../components/page-builder/SectionEditorDialog.vue'
import { AI_MODEL_OPTIONS, DEFAULT_AI_MODEL_VALUE, getAiModelOverride } from './ai-model-options'
import { getPageWorkflowState, getPrimaryWorkflowAction, isPipelineActionDisabled, needsDestructiveActionConfirmation, shouldShowSourceUrlInput } from './page-workflow'

const route = useRoute()
const router = useRouter()
const { fetchOems } = useOemData()

const {
  page,
  loading,
  saving,
  error,
  isDirty,
  sections,
  selectedSectionId,
  selectedCloneRegionId,
  isStructured,
  isCloned,
  activeMode,
  availableModes,
  cloneHtml,
  cloneRegions,
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
  handleStructure,
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
} = usePageBuilder()

const themeStore = useThemeStore()

const showJson = ref(false)
const showHistory = ref(false)
const showSectionBrowser = ref(false)
const showCapture = ref(false)
const cloneDraftHtml = ref<string | null>(null)
const cloneEditorOpen = ref(false)
const pageBuilderCanvas = ref<{ patchCloneField: (payload: Record<string, unknown>) => void } | null>(null)
const editorSectionId = ref<string | null>(null)
const editorSection = computed(() =>
  editorSectionId.value ? sections.value.find((s: any) => s.id === editorSectionId.value) ?? null : null,
)
const selectedCloneRegion = computed(() =>
  selectedCloneRegionId.value ? cloneRegions.value.find(region => region.id === selectedCloneRegionId.value) ?? null : null,
)

function openEditor(id: string) {
  selectSection(id)
  editorSectionId.value = id
}
function closeEditor() {
  editorSectionId.value = null
}
function updateEditorSection(updates: Record<string, any>) {
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
  cloneDraftHtml.value = html
  isDirty.value = true
}

function onCloneRegionSelected(region: CloneRegion) {
  selectCloneRegion(region)
  cloneEditorOpen.value = true
}

function patchCloneField(payload: CloneFieldPatchPayload) {
  pageBuilderCanvas.value?.patchCloneField(payload)
}

async function saveActiveMode() {
  if (activeMode.value === 'clone') {
    const saved = await saveClone(cloneDraftHtml.value ?? cloneHtml.value, cloneRegions.value)
    if (saved)
      cloneDraftHtml.value = null
    return
  }

  await saveSections()
}

function openSourceUrl() {
  const sourceUrl = page.value?.source_url
  if (sourceUrl)
    window.open(sourceUrl, '_blank', 'noopener,noreferrer')
}

function onCaptureHtml(html: string) {
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

type ModelOverride = { provider: string, model: string }

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

async function runClone() {
  if (!confirmDestructiveAction('clone'))
    return

  await handleClone()
}

async function runStructure(modelOverride?: ModelOverride) {
  if (!confirmDestructiveAction('structure'))
    return

  await handleStructure(modelOverride)
}

async function runAdaptivePipeline(modelOverride?: ModelOverride) {
  if (!confirmDestructiveAction('pipeline'))
    return

  await handleAdaptivePipeline(modelOverride)
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
  }
})

onUnmounted(() => {
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
const canShowWorkflowActions = computed(() => canShowEditorActions.value && pageWorkflowState.value !== 'custom')
const canShowSectionActions = computed(() => canShowEditorActions.value && (isStructured.value || sections.value.length > 0))
const canShowSaveAction = computed(() => canShowEditorActions.value && (activeMode.value === 'clone' ? isCloned.value : canShowSectionActions.value))
const canShowModeSwitcher = computed(() => availableModes.value.length > 1)
const canShowSourceUrlInput = computed(() => shouldShowSourceUrlInput(pageWorkflowState.value))
const pipelineActionDisabled = computed(() => isPipelineActionDisabled({
  needsSourceUrl: needsSourceUrl.value,
  sourceUrlOverride: sourceUrlOverride.value,
  pipelining: pipelining.value,
  cloning: cloning.value,
  structuring: structuring.value,
}))

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
    <div class="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-2 border-b bg-card shrink-0 overflow-hidden">
      <UiButton
        size="sm"
        variant="ghost"
        class="shrink-0"
        @click="router.push('/dashboard/model-pages')"
      >
        <ArrowLeft class="size-4 sm:mr-1" />
        <span class="hidden sm:inline">Pages</span>
      </UiButton>

      <UiSeparator orientation="vertical" class="h-5 shrink-0" />

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
          <span class="font-semibold text-sm truncate min-w-0 max-w-[120px] sm:max-w-[200px]">{{ subpageDisplayName }}</span>
          <UiBadge variant="secondary" class="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 shrink-0">
            Subpage
          </UiBadge>
        </template>
        <template v-else>
          <span class="font-semibold text-sm truncate min-w-0 max-w-[120px] sm:max-w-[200px] lg:max-w-none">{{ pageTitle }}</span>
        </template>
        <UiBadge v-if="page.version" variant="secondary" class="text-[10px] shrink-0">
          v{{ page.version }}
        </UiBadge>
        <UiBadge v-if="pageWorkflowState === 'structured'" variant="default" class="text-[10px] bg-emerald-600 shrink-0 hidden sm:inline-flex">
          Structured
        </UiBadge>
        <UiBadge v-else-if="pageWorkflowState === 'cloned'" variant="default" class="text-[10px] bg-amber-600 shrink-0 hidden sm:inline-flex">
          Cloned
        </UiBadge>
        <div v-if="canShowModeSwitcher" class="ml-1 hidden md:inline-flex items-center rounded-md border bg-muted/40 p-0.5 shrink-0">
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

      <div class="flex-1 min-w-0" />

      <!-- Actions -->
      <div class="flex items-center gap-1.5 shrink-0">
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

        <!-- === INLINE buttons (xl+ screens) === -->

        <!-- Import -->
        <UiButton
          v-if="canShowSectionActions"
          size="sm"
          variant="outline"
          title="Import sections from another page"
          class="hidden xl:inline-flex"
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
          class="hidden xl:inline-flex"
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
          class="hidden xl:inline-flex"
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
          class="hidden xl:inline-flex"
          @click="showHistory = !showHistory"
        >
          <History class="size-3.5 mr-1" />
          History
        </UiButton>

        <UiSeparator v-if="canShowSectionActions" orientation="vertical" class="h-5 hidden xl:block" />

        <!-- Source URL input for subpages -->
        <div v-if="canShowSourceUrlInput" class="hidden xl:flex items-center gap-1.5">
          <Globe class="size-3.5 text-muted-foreground shrink-0" />
          <input
            v-model="sourceUrlOverride"
            type="url"
            placeholder="OEM page URL to clone..."
            class="h-7 w-64 rounded-md border border-input bg-background px-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
        </div>

        <!-- Clone -->
        <UiButton
          v-if="canShowWorkflowActions"
          size="sm"
          variant="outline"
          :disabled="cloning || pipelining || (needsSourceUrl && !sourceUrlOverride?.trim())"
          class="hidden xl:inline-flex"
          @click="runClone()"
        >
          <Copy v-if="!cloning" class="size-3.5 mr-1" />
          <Loader2 v-else class="size-3.5 mr-1 animate-spin" />
          Clone
        </UiButton>

        <!-- AI model selector -->
        <div v-if="canShowWorkflowActions" class="hidden xl:flex items-center gap-1.5 rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 px-1.5 py-1">
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
          class="hidden xl:inline-flex"
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
          class="hidden xl:inline-flex border-violet-300 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950"
          @click="runAdaptivePipeline(selectedModelOverride)"
        >
          <Zap v-if="!pipelining" class="size-3.5 mr-1 text-violet-500" />
          <Loader2 v-else class="size-3.5 mr-1 animate-spin" />
          {{ pipelining ? 'Running...' : primaryWorkflowAction.key === 'pipeline' ? primaryWorkflowAction.label : 'Pipeline' }}
        </UiButton>

        <UiSeparator v-if="canShowWorkflowActions" orientation="vertical" class="h-5 hidden xl:block" />

        <!-- Save — always visible -->
        <UiButton
          v-if="canShowSaveAction"
          size="sm"
          :variant="isDirty ? 'default' : 'outline'"
          :disabled="saving || !isDirty"
          @click="saveActiveMode"
        >
          <Save v-if="!saving" class="size-3.5 mr-1" />
          <Loader2 v-else class="size-3.5 mr-1 animate-spin" />
          <span class="hidden sm:inline">Save</span>
          <span v-if="isDirty" class="ml-1 size-1.5 rounded-full bg-amber-400 inline-block" />
        </UiButton>

        <!-- Source — inline on xl+ -->
        <a
          v-if="canShowEditorActions && page?.source_url"
          :href="page.source_url"
          target="_blank"
          class="hidden xl:inline-flex"
        >
          <UiButton size="sm" variant="outline">
            <ExternalLink class="size-3.5 mr-1" />
            Source
          </UiButton>
        </a>

        <!-- JSON toggle — inline on xl+ -->
        <UiButton
          v-if="canShowEditorActions"
          size="sm"
          :variant="showJson ? 'default' : 'outline'"
          class="hidden xl:inline-flex"
          @click="showJson = !showJson"
        >
          <Code class="size-3.5 mr-1" />
          JSON
        </UiButton>

        <!-- === OVERFLOW MENU (below xl) === -->
        <UiDropdownMenu v-if="canShowEditorActions">
          <UiDropdownMenuTrigger as-child>
            <UiButton size="sm" variant="outline" class="xl:hidden size-8 p-0" title="More actions">
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
                {{ primaryWorkflowAction.key === 'pipeline' ? primaryWorkflowAction.label : 'Adaptive Pipeline' }}
              </UiDropdownMenuItem>
            </template>

            <UiDropdownMenuSeparator />
            <UiDropdownMenuLabel class="text-[10px] text-muted-foreground">
              View
            </UiDropdownMenuLabel>
            <UiDropdownMenuItem @select="showJson = !showJson">
              <Code class="size-3.5 mr-2" />
              {{ showJson ? 'Hide JSON' : 'Show JSON' }}
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

    <!-- Workflow Stepper -->
    <div v-if="canShowEditorActions && page && !loading" class="flex items-center gap-0 px-4 py-2 border-b bg-muted/30 shrink-0">
      <template v-for="(step, i) in workflowSteps" :key="step.label">
        <div
          class="flex items-center gap-1.5 text-xs"
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
          class="w-8 sm:w-12 h-px mx-2"
          :class="step.done ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-border'"
        />
      </template>

      <!-- Pipeline result summary (shows after pipeline finishes) -->
      <div v-if="pipelineResult" class="ml-auto flex items-center gap-2 text-xs">
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
          @click="runAdaptivePipeline(selectedModelOverride)"
        >
          <Loader2 v-if="pipelining" class="size-4 animate-spin" />
          <Zap v-else class="size-4" />
          {{ pipelining ? 'Running...' : primaryWorkflowAction.label }}
        </button>
        <p v-if="pipelining" class="text-xs text-muted-foreground">
          This may take 1-2 minutes
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
    <div v-else-if="canShowEditorActions && showJson" class="flex-1 overflow-hidden">
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
            @select-section="selectSection"
            @open-editor="openEditor"
            @move-section="moveSection"
            @duplicate-section="duplicateSection"
            @delete-section="deleteSection"
            @update-field="(id: string, field: string, value: any) => updateSection(id, { [field]: value })"
            @select-clone-region="onCloneRegionSelected"
            @clone-dom-updated="onCloneDomUpdated"
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
        v-if="editorSection"
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
      v-if="canShowEditorActions && showCapture"
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
      v-if="canShowEditorActions"
      :open="showSectionBrowser"
      @update:open="showSectionBrowser = $event"
      @paste="pasteSections"
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
