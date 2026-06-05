<script lang="ts" setup>
import { ExternalLink, Loader2, Lock, Save } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'

import type { RegionActionId } from '@/pages/dashboard/components/page-builder/region-actions'
import type { CloneRegion } from '@/pages/dashboard/page-builder/page-modes'

import { usePageBuilder } from '@/composables/use-page-builder'
import { getModelPageWriteProtectedMessage, isModelPageWriteProtected } from '@/lib/oem-ids'
import { buildRawHtmlSectionFromCloneRegion } from '@/pages/dashboard/components/page-builder/clone-region-converter'
import PageBuilderCanvas from '@/pages/dashboard/components/page-builder/PageBuilderCanvas.vue'
import SectionEditorDialog from '@/pages/dashboard/components/page-builder/SectionEditorDialog.vue'

// Standalone, chrome-free preview of a model page as the builder renders it.
// Reuses PageBuilderCanvas so clone and structured pages render faithfully. Non-protected pages keep
// the same right-click editing affordances as the builder, with a small preview-local save bar.
const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

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
  cloneRegionsForSave,
  oemId,
  modelSlug,
  loadPage,
  selectSection,
  deleteSection,
  moveSection,
  duplicateSection,
  updateSection,
  addSectionFromLiveData,
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
} | null>(null)
const cloneDraftHtml = ref<string | null>(null)
const editorSectionId = ref<string | null>(null)
const pageSlug = computed(() => (route.params as { slug?: string }).slug ?? '')
const builderUrl = computed(() => pageSlug.value ? `/dashboard/page-builder/${pageSlug.value}` : '/dashboard/model-pages')
const isWriteProtectedPage = computed(() => isModelPageWriteProtected(oemId.value))
const writeProtectedMessage = computed(() => getModelPageWriteProtectedMessage(page.value?.name ?? oemId.value))
const editorSection = computed(() =>
  editorSectionId.value ? sections.value.find((section: any) => section.id === editorSectionId.value) ?? null : null,
)

onMounted(async () => {
  const slug = pageSlug.value
  if (slug)
    await loadPage(slug)
})

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
}

function patchCloneField(payload: Record<string, unknown>) {
  if (isWriteProtectedPage.value)
    return
  pageBuilderCanvas.value?.patchCloneField(payload)
}

function onUpdateField(id: string, field: string, value: any) {
  if (isWriteProtectedPage.value)
    return
  if (activeMode.value === 'clone' && field === 'height_override') {
    setRegionHeight(id, value == null ? null : Number(value))
    return
  }
  updateSection(id, { [field]: value })
}

function onRegionAction({ action, regionId, html }: { action: RegionActionId, regionId: string, html?: string }) {
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

  if (action === 'convert') {
    const section = buildRawHtmlSectionFromCloneRegion(html)
    if (!section) {
      toast.error('Region HTML is not available')
      return
    }
    addSectionFromLiveData(section)
    setActiveMode('sections')
    toast.success('Region converted to editable section')
  }
}

async function savePreview() {
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
      <div class="fixed right-2 top-2 z-[70] flex max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-lg border bg-background/95 px-1.5 py-1.5 shadow-lg backdrop-blur sm:right-3 sm:top-3 sm:gap-2 sm:px-2">
        <div
          v-if="isWriteProtectedPage"
          class="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
          :title="writeProtectedMessage"
        >
          <Lock class="size-3.5" />
          Read-only
        </div>
        <div v-else class="hidden items-center gap-1.5 px-1 text-xs text-muted-foreground sm:flex">
          <span
            class="size-2 rounded-full"
            :class="isDirty ? 'bg-amber-500' : 'bg-emerald-500'"
          />
          {{ isDirty ? 'Unsaved' : 'Saved' }}
        </div>
        <button
          v-if="!isWriteProtectedPage"
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
        :fit-width="true"
        :allow-same-origin-sandbox="isWriteProtectedPage"
        :auto-responsive-preview="true"
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
    </div>

    <div v-else class="flex h-screen items-center justify-center text-muted-foreground">
      Page not found.
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: false
</route>
