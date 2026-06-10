<script lang="ts" setup>
import { Code2, Columns2, ExternalLink, Eye, Loader2, Lock, Pencil, Save, Wand2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'

import type { RegionActionId } from '@/pages/dashboard/components/page-builder/region-actions'
import type { CloneRegion } from '@/pages/dashboard/page-builder/page-modes'

import { useOemData } from '@/composables/use-oem-data'
import { usePageBuilder } from '@/composables/use-page-builder'
import { getModelPageWriteProtectedMessage, isModelPageWriteProtected } from '@/lib/oem-ids'
import { compileTailwindRecipeArtifact } from '@/lib/worker-api'
import { buildCatalogSectionsFromModel, buildPreviewReplacementHtmlFromCloneRegion, convertCloneRegionsToTailwindSections } from '@/pages/dashboard/components/page-builder/clone-region-converter'
import PageBuilderCanvas from '@/pages/dashboard/components/page-builder/PageBuilderCanvas.vue'
import SectionEditorDialog from '@/pages/dashboard/components/page-builder/SectionEditorDialog.vue'

// Standalone, chrome-free preview of a model page as the builder renders it.
// Reuses PageBuilderCanvas so clone and structured pages render faithfully. Non-protected pages keep
// the same right-click editing affordances as the builder, with a small preview-local save bar.
const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'
type PreviewView = 'edit' | 'production' | 'source' | 'compare'

const route = useRoute()
const {
  page,
  loading,
  saving,
  error,
  isDirty,
  sections,
  selectedSectionId,
  selectedCloneRegionId,
  activeMode,
  isCloned,
  isStructured,
  cloneHtml,
  cloneRegions,
  cloneRegionsForSave,
  selectedCloneRegionData,
  oemId,
  modelSlug,
  loadPage,
  selectSection,
  deleteSection,
  moveSection,
  duplicateSection,
  updateSection,
  addSectionFromLiveData,
  replaceSections,
  saveSections,
  saveClone,
  setActiveMode,
  selectCloneRegion,
  setRegionHeight,
  addCloneRegion,
  regenerating,
  regenerateSectionById,
  convertSection,
} = usePageBuilder()

const pageBuilderCanvas = ref<{
  patchCloneField: (payload: Record<string, unknown>) => void
  duplicateRegion: (regionId: string) => void
  collectCloneRegions: () => Promise<CloneRegion[]>
} | null>(null)
const cloneDraftHtml = ref<string | null>(null)
const convertingCloneRegion = ref(false)
const convertingPage = ref(false)
const editorSectionId = ref<string | null>(null)
const pageSlug = computed(() => (route.params as { slug?: string }).slug ?? '')
const builderUrl = computed(() => pageSlug.value ? `/dashboard/page-builder/${pageSlug.value}` : '/dashboard/model-pages')
const isWriteProtectedPage = computed(() => isModelPageWriteProtected(oemId.value))
const writeProtectedMessage = computed(() => getModelPageWriteProtectedMessage(page.value?.name ?? oemId.value))
const previewView = ref<PreviewView>(normalizePreviewView(route.query.view))
const isProductionView = computed(() => previewView.value === 'production')
const isSourceView = computed(() => previewView.value === 'source')
const isCompareView = computed(() => previewView.value === 'compare')
const previewReadOnly = computed(() => isWriteProtectedPage.value || isProductionView.value || isSourceView.value || isCompareView.value)
const canEditPreview = computed(() => !previewReadOnly.value)
const hasTailwindSource = computed(() => Boolean(
  activeMode.value === 'sections'
  && sections.value.some((section: any) => Boolean(section?._tailwind_conversion || String(section?._generated_html || '').trim())),
))
const hasTailwindCompare = computed(() => Boolean(
  activeMode.value === 'sections'
  && sections.value.some((section: any) => Boolean(section?._tailwind_conversion && tailwindCompareOriginalHtml(section) && tailwindCompareConvertedHtml(section))),
))
const editorSection = computed(() =>
  editorSectionId.value ? sections.value.find((section: any) => section.id === editorSectionId.value) ?? null : null,
)
const selectedCloneRegion = computed(() => {
  if (!selectedCloneRegionId.value)
    return null
  if (selectedCloneRegionData.value && selectedCloneRegionData.value.id === selectedCloneRegionId.value)
    return selectedCloneRegionData.value
  return cloneRegions.value.find(region => region.id === selectedCloneRegionId.value) ?? null
})
const canConvertSelectedCloneRegion = computed(() => Boolean(
  canEditPreview.value
  && activeMode.value === 'clone'
  && selectedCloneRegion.value
  && (selectedCloneRegion.value.html || selectedCloneRegion.value.tailwindRecipeArtifact),
))
const canConvertPageToTailwind = computed(() => Boolean(
  canEditPreview.value
  && activeMode.value === 'clone'
  && isCloned.value,
))
const { fetchProductsForModel, fetchVariantColors } = useOemData()
const catalogModelSlug = computed(() =>
  modelSlug.value.includes('--') ? modelSlug.value.split('--')[0] : modelSlug.value,
)

function normalizePreviewView(value: unknown): PreviewView {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'production' || raw === 'source' || raw === 'compare' ? raw : 'edit'
}

onMounted(async () => {
  const slug = pageSlug.value
  if (slug)
    await loadPage(slug)
})

watch(
  () => route.query.view,
  value => {
    previewView.value = normalizePreviewView(value)
  },
)

function setPreviewView(view: PreviewView) {
  previewView.value = view
  replacePreviewViewQuery(view)
}

function replacePreviewViewQuery(view: PreviewView) {
  // Use History directly to preserve unsaved converted sections when toggling Source/Production.
  if (typeof window === 'undefined')
    return
  const query = { ...route.query }
  if (view === 'production')
    query.view = 'production'
  else if (view === 'source')
    query.view = 'source'
  else if (view === 'compare')
    query.view = 'compare'
  else
    delete query.view
  const url = new URL(window.location.href)
  url.search = ''
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null)
          url.searchParams.append(key, String(item))
      }
    }
    else if (value != null) {
      url.searchParams.set(key, String(value))
    }
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

function tailwindSectionSource(section: any): string {
  const html = section?._generated_html || section?.content_html || section?.body_html || ''
  const leftoverCss = typeof section?._tailwind_leftover_css === 'string' ? section._tailwind_leftover_css.trim() : ''
  const stats = section?._tailwind_conversion?.stats
  const statsSource = stats && typeof stats === 'object'
    ? `/* Tailwind Conversion Stats */\n${JSON.stringify(stats, null, 2)}`
    : ''
  const suffix = [statsSource, leftoverCss ? `/* Leftover CSS */\n${leftoverCss}` : ''].filter(Boolean).join('\n\n')
  if (typeof html === 'string' && html.trim()) {
    const trimmedHtml = html.trim()
    return suffix ? `${trimmedHtml}\n\n${suffix}` : trimmedHtml
  }
  if (suffix)
    return suffix
  return JSON.stringify(section, null, 2)
}

function tailwindCompareOriginalHtml(section: any): string {
  return typeof section?._tailwind_original_html === 'string' ? section._tailwind_original_html.trim() : ''
}

function tailwindCompareConvertedHtml(section: any): string {
  const html = section?._generated_html || section?.content_html || section?.body_html || ''
  return typeof html === 'string' ? html.trim() : ''
}

function tailwindCompareSrcdoc(html: string, label: string): string {
  const safeLabel = escapeHtml(label)
  const body = stripUnsafeCompareHtml(html) || `<div class="empty">${safeLabel} unavailable</div>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;font-family:Inter,Arial,sans-serif;background:#fff;color:#111}.frame-label{position:sticky;top:0;z-index:10;background:rgba(15,23,42,.92);color:#fff;font:600 11px/1.2 Inter,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:8px 10px}.empty{display:grid;min-height:180px;place-items:center;color:#64748b;font:500 13px/1.5 Inter,Arial,sans-serif}</style></head><body><div class="frame-label">${safeLabel}</div>${body}</body></html>`
}

function stripUnsafeCompareHtml(html: string): string {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '')
    .trim()
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function computedDeclarations(section: any): number {
  return Number(section?._tailwind_conversion?.stats?.computed_declarations) || 0
}

function mappedDeclarations(section: any): number {
  return Number(section?._tailwind_conversion?.stats?.mapped_declarations) || 0
}

function mappedDeclarationRate(section: any): string {
  const computed = computedDeclarations(section)
  if (!computed)
    return '0%'
  return `${Math.round((mappedDeclarations(section) / computed) * 100)}%`
}

function compareRiskSummary(section: any): string {
  const stats = section?._tailwind_conversion?.stats || {}
  const risks = [
    Number(stats.leftover_declarations) ? `${Number(stats.leftover_declarations)} unmapped` : '',
    Number(stats.leftover_rules) ? `${Number(stats.leftover_rules)} leftover rules` : '',
    Number(stats.unmatched_rules) ? `${Number(stats.unmatched_rules)} dead rules` : '',
    Number(stats.unresolved_var_count) ? `${Number(stats.unresolved_var_count)} var()` : '',
    Number(stats.calc_count) ? `${Number(stats.calc_count)} calc()` : '',
    Number(stats.important_count) ? `${Number(stats.important_count)} !important` : '',
  ].filter(Boolean)
  return risks.length ? risks.join(' · ') : 'No conversion risk flags'
}

function openEditor(id: string) {
  selectSection(id)
  if (previewReadOnly.value)
    return
  editorSectionId.value = id
}

function closeEditor() {
  editorSectionId.value = null
}

function updateEditorSection(updates: Record<string, any>) {
  if (previewReadOnly.value)
    return
  if (editorSectionId.value)
    updateSection(editorSectionId.value, updates)
}

function onCloneDomUpdated(html: string) {
  if (previewReadOnly.value)
    return
  cloneDraftHtml.value = html
  isDirty.value = true
}

function onCloneRegionAdded(region: CloneRegion) {
  if (previewReadOnly.value)
    return
  addCloneRegion(region)
}

function onCloneRegionSelected(region: CloneRegion) {
  selectCloneRegion(region)
}

function patchCloneField(payload: Record<string, unknown>) {
  if (previewReadOnly.value)
    return
  pageBuilderCanvas.value?.patchCloneField(payload)
}

function onUpdateField(id: string, field: string, value: any) {
  if (previewReadOnly.value)
    return
  if (activeMode.value === 'clone' && field === 'height_override') {
    setRegionHeight(id, value == null ? null : Number(value))
    return
  }
  updateSection(id, { [field]: value })
}

async function onRegionAction({ action, regionId, html, tailwindRecipeArtifact }: { action: RegionActionId, regionId: string, html?: string, tailwindRecipeArtifact?: any }) {
  if (previewReadOnly.value)
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

  if (action === 'convert') {
    await replaceCloneRegionWithTailwind({ regionId, html, tailwindRecipeArtifact })
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
      toast.success('Model catalog data added to page sections')
    }
    catch (error: any) {
      toast.error(`Failed to bind catalog data: ${error?.message || 'Unknown error'}`)
    }
  }
}

async function convertSelectedCloneRegionToTailwind() {
  if (!canConvertSelectedCloneRegion.value)
    return

  convertingCloneRegion.value = true
  try {
    await replaceCloneRegionWithTailwind({
      regionId: selectedCloneRegion.value?.id,
      html: selectedCloneRegion.value?.html,
      tailwindRecipeArtifact: selectedCloneRegion.value?.tailwindRecipeArtifact,
    })
  }
  catch (error: any) {
    toast.error(`Failed to convert region: ${error?.message || 'Unknown error'}`)
  }
  finally {
    convertingCloneRegion.value = false
  }
}

async function replaceCloneRegionWithTailwind(input: { regionId?: string | null, html?: string | null, tailwindRecipeArtifact?: any }) {
  const regionId = input.regionId || selectedCloneRegion.value?.id
  if (!regionId) {
    toast.error('Select a clone region first')
    return
  }

  const replacementHtml = await buildPreviewReplacementHtmlFromCloneRegion({
    regionId,
    html: input.html,
    tailwindRecipeArtifact: input.tailwindRecipeArtifact,
    compileTailwindRecipeArtifact,
  })

  if (!replacementHtml) {
    toast.error('Select a clone region with captured HTML first')
    return
  }

  patchCloneField({
    regionId,
    fieldId: `${regionId}:tailwind-html`,
    selector: `[data-oem-region-id="${regionId}"]`,
    kind: 'outer-html',
    value: replacementHtml,
    html: replacementHtml,
  })
  toast.success('Selected region converted in preview')
}

async function convertPageToTailwind() {
  if (!canConvertPageToTailwind.value)
    return

  convertingPage.value = true
  try {
    const collectedRegions = await pageBuilderCanvas.value?.collectCloneRegions()
    const result = await convertCloneRegionsToTailwindSections({
      regions: collectedRegions?.length ? collectedRegions : cloneRegionsForSave.value,
      compileTailwindRecipeArtifact,
    })

    if (!result.sections.length) {
      toast.error('No clone regions are ready to convert')
      return
    }

    replaceSections(result.sections)
    setActiveMode('sections')
    const skippedSuffix = result.skipped.length ? ` (${result.skipped.length} skipped)` : ''
    toast.success(`Converted ${result.sections.length} region${result.sections.length === 1 ? '' : 's'} to Tailwind sections${skippedSuffix}`)
  }
  catch (error: any) {
    toast.error(`Failed to convert page: ${error?.message || 'Unknown error'}`)
  }
  finally {
    convertingPage.value = false
  }
}

async function savePreview() {
  if (isProductionView.value || isSourceView.value || isCompareView.value) {
    toast.error('Switch to Edit view to save changes')
    return
  }

  if (isWriteProtectedPage.value) {
    toast.error(writeProtectedMessage.value)
    return
  }

  if (activeMode.value === 'clone') {
    const saved = await saveClone(cloneDraftHtml.value ?? cloneHtml.value, cloneRegionsForSave.value)
    if (saved) {
      cloneDraftHtml.value = null
      toast.success('Preview edits saved')
    }
    return
  }

  await saveSections()
  if (!error.value)
    toast.success('Preview edits saved')
}
</script>

<template>
  <div class="min-h-screen w-full bg-background">
    <div v-if="loading" class="flex h-screen items-center justify-center text-muted-foreground">
      <Loader2 class="size-5 animate-spin mr-2" />
      Loading preview…
    </div>

    <div v-else-if="error" class="flex h-screen items-center justify-center text-destructive">
      {{ error }}
    </div>

    <div v-else-if="page" class="h-screen">
      <div data-oem-preview-toolbar="true" class="fixed right-2 top-2 z-[70] flex max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-lg border bg-background/95 px-1.5 py-1.5 shadow-lg backdrop-blur sm:right-3 sm:top-3 sm:gap-2 sm:px-2">
        <div class="inline-flex h-8 items-center rounded-md border bg-muted/40 p-0.5">
          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors"
            :class="previewView === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="Edit preview"
            @click="setPreviewView('edit')"
          >
            <Pencil class="size-3.5" />
            <span class="hidden sm:inline">Edit</span>
          </button>
          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors"
            :class="previewView === 'production' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="Production view"
            @click="setPreviewView('production')"
          >
            <Eye class="size-3.5" />
            <span class="hidden sm:inline">Production</span>
          </button>
          <button
            v-if="hasTailwindSource || isSourceView"
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors"
            :class="previewView === 'source' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="Tailwind source"
            @click="setPreviewView('source')"
          >
            <Code2 class="size-3.5" />
            <span class="hidden md:inline">Source</span>
          </button>
          <button
            v-if="hasTailwindCompare || isCompareView"
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors"
            :class="previewView === 'compare' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="Compare Tailwind"
            @click="setPreviewView('compare')"
          >
            <Columns2 class="size-3.5" />
            <span class="hidden md:inline">Compare</span>
          </button>
        </div>
        <div
          v-if="previewReadOnly"
          class="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
          :title="isCompareView ? 'Tailwind compare view disables editing and save actions' : (isSourceView ? 'Tailwind source view disables editing and save actions' : (isProductionView ? 'Production view disables editing overlays and save actions' : writeProtectedMessage))"
        >
          <Lock class="size-3.5" />
          {{ isCompareView ? 'Compare' : (isSourceView ? 'Source' : (isProductionView ? 'Production' : 'Read-only')) }}
        </div>
        <div v-else class="hidden items-center gap-1.5 px-1 text-xs text-muted-foreground sm:flex">
          <span
            class="size-2 rounded-full"
            :class="isDirty ? 'bg-amber-500' : 'bg-emerald-500'"
          />
          {{ isDirty ? 'Unsaved' : 'Saved' }}
        </div>
        <button
          v-if="canEditPreview && activeMode === 'clone'"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          :disabled="convertingCloneRegion || !canConvertSelectedCloneRegion"
          title="Convert selected region to Tailwind"
          @click="convertSelectedCloneRegionToTailwind"
        >
          <Loader2 v-if="convertingCloneRegion" class="size-3.5 animate-spin" />
          <Wand2 v-else class="size-3.5" />
          <span class="hidden lg:inline">Convert to Tailwind</span>
        </button>
        <button
          v-if="canEditPreview && activeMode === 'clone'"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          :disabled="convertingPage || !canConvertPageToTailwind"
          title="Convert page to Tailwind sections"
          @click="convertPageToTailwind"
        >
          <Loader2 v-if="convertingPage" class="size-3.5 animate-spin" />
          <Wand2 v-else class="size-3.5" />
          <span class="hidden xl:inline">Convert Page</span>
        </button>
        <button
          v-if="canEditPreview"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          :disabled="saving || !isDirty"
          title="Save preview edits"
          @click="savePreview"
        >
          <Loader2 v-if="saving" class="size-3.5 animate-spin" />
          <Save v-else class="size-3.5" />
          <span class="hidden sm:inline">Save</span>
        </button>
        <a
          class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
          :href="builderUrl"
          title="Open full builder"
        >
          <ExternalLink class="size-3.5" />
          <span class="hidden sm:inline">Builder</span>
        </a>
      </div>

      <div
        v-if="isSourceView"
        data-oem-tailwind-source-view="true"
        class="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 sm:px-6 lg:px-10"
      >
        <div class="mx-auto max-w-6xl space-y-4">
          <div class="space-y-1">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Tailwind Source
            </p>
            <h1 class="text-xl font-semibold text-white">
              {{ page?.name || pageSlug }}
            </h1>
            <p class="text-sm text-slate-400">
              Converted section markup rendered from the saved section model.
            </p>
          </div>

          <div v-if="!hasTailwindSource" class="rounded-lg border border-slate-800 bg-slate-900/80 p-5 text-sm text-slate-300">
            No converted Tailwind sections are saved for this page yet.
          </div>

          <div
            v-for="section in sections"
            v-else
            :key="section.id"
            class="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white">
                  {{ section.name || section.title || section.id }}
                </p>
                <p class="text-xs text-slate-400">
                  {{ section.type || 'section' }}
                </p>
              </div>
              <span
                v-if="section._tailwind_conversion"
                class="rounded bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300"
              >
                converted
              </span>
            </div>
            <pre class="max-h-[620px] overflow-auto p-4 text-xs leading-5 text-slate-100"><code>{{ tailwindSectionSource(section) }}</code></pre>
          </div>
        </div>
      </div>

      <div
        v-else-if="isCompareView"
        data-oem-tailwind-compare-view="true"
        class="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 sm:px-6 lg:px-10"
      >
        <div class="mx-auto max-w-7xl space-y-5">
          <div class="space-y-1">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Compare Tailwind
            </p>
            <h1 class="text-xl font-semibold text-white">
              {{ page?.name || pageSlug }}
            </h1>
            <p class="text-sm text-slate-400">
              Original captured markup beside converted Tailwind output, with conversion coverage signals.
            </p>
          </div>

          <div v-if="!hasTailwindCompare" class="rounded-lg border border-slate-800 bg-slate-900/80 p-5 text-sm text-slate-300">
            Convert a page to Tailwind sections before comparing original and converted output.
          </div>

          <div
            v-for="section in sections"
            v-else
            :key="section.id"
            class="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80"
          >
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white">
                  {{ section.name || section.title || section.id }}
                </p>
                <p class="text-xs text-slate-400">
                  {{ section.type || 'section' }}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="rounded bg-emerald-500/15 px-2 py-1 font-medium text-emerald-300">
                  {{ mappedDeclarations(section) }} / {{ computedDeclarations(section) }} mapped
                </span>
                <span class="rounded bg-sky-500/15 px-2 py-1 font-medium text-sky-300">
                  {{ mappedDeclarationRate(section) }}
                </span>
                <span class="rounded bg-slate-800 px-2 py-1 text-slate-300">
                  {{ compareRiskSummary(section) }}
                </span>
              </div>
            </div>
            <div class="grid gap-0 lg:grid-cols-2">
              <div class="border-b border-slate-800 lg:border-b-0 lg:border-r">
                <iframe
                  class="h-[520px] w-full bg-white"
                  sandbox=""
                  title="Original capture"
                  :srcdoc="tailwindCompareSrcdoc(tailwindCompareOriginalHtml(section), 'Original capture')"
                />
              </div>
              <div>
                <iframe
                  class="h-[520px] w-full bg-white"
                  sandbox=""
                  title="Converted Tailwind"
                  :srcdoc="tailwindCompareSrcdoc(tailwindCompareConvertedHtml(section), 'Converted Tailwind')"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <PageBuilderCanvas
        v-else
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
        :read-only="previewReadOnly"
        :fit-width="true"
        :allow-same-origin-sandbox="previewReadOnly"
        :auto-responsive-preview="true"
        :hide-preview-chrome="true"
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

      <SectionEditorDialog
        v-if="editorSection && canEditPreview"
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
    </div>

    <div v-else class="flex h-screen items-center justify-center text-muted-foreground">
      Page not found.
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: false
  auth: false
</route>
