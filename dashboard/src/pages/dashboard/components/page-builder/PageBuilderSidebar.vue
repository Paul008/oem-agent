<script lang="ts" setup>
import { Clock, DollarSign, Hash, Layers } from 'lucide-vue-next'
import { ref } from 'vue'

import type { CloneRegion, PageMode } from '../../page-builder/page-modes'
import type { PageSectionType } from './section-templates'

import AddSectionPicker from './AddSectionPicker.vue'
import CloneRegionSidebar from './CloneRegionSidebar.vue'
import SectionListItem from './SectionListItem.vue'
import TemplateGalleryDrawer from './TemplateGalleryDrawer.vue'

const props = defineProps<{
  page: any
  sections: any[]
  selectedSectionId: string | null
  activeMode: PageMode
  cloneRegions: CloneRegion[]
  selectedCloneRegionId: string | null
  oemName: string
  oemId?: string
  recipes?: any[]
  readOnly?: boolean
}>()

const emit = defineEmits<{
  selectSection: [id: string]
  openEditor: [id: string]
  moveSection: [from: number, to: number]
  deleteSection: [id: string]
  duplicateSection: [id: string]
  copySectionJson: [id: string]
  convertSection: [id: string, targetType: string]
  splitSection: [id: string]
  addSection: [type: PageSectionType]
  addSectionFromTemplate: [templateId: string]
  insertFromGallery: [section: any]
  pasteFromClipboard: []
  addFromRecipe: [recipe: any]
  saveAsRecipe: [id: string]
  selectCloneRegion: [region: CloneRegion]
  editCloneRegion: [region: CloneRegion]
}>()

const galleryOpen = ref(false)

// Drag-and-drop state for section list
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(e: DragEvent, index: number) {
  if (props.readOnly)
    return
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}
function onDragOver(e: DragEvent, index: number) {
  if (props.readOnly)
    return
  if (dragIndex.value === null)
    return
  e.preventDefault()
  if (e.dataTransfer)
    e.dataTransfer.dropEffect = 'move'
  dropIndex.value = index
}
function onDragLeave() {
  dropIndex.value = null
}
function onDrop(e: DragEvent, index: number) {
  if (props.readOnly)
    return
  e.preventDefault()
  if (dragIndex.value !== null && dragIndex.value !== index) {
    emit('moveSection', dragIndex.value, index)
  }
  dragIndex.value = null
  dropIndex.value = null
}
function onDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}

function formatDate(iso: string | undefined) {
  if (!iso)
    return '-'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCost(cost: number | undefined) {
  if (!cost)
    return '-'
  return `$${cost.toFixed(4)}`
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Metadata -->
    <div class="px-4 py-3 border-b space-y-1.5 shrink-0">
      <h2 class="text-sm font-semibold">
        Page Metadata
      </h2>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div class="flex items-center gap-1.5 text-muted-foreground">
          <Layers class="size-3" />
          <span>OEM</span>
        </div>
        <span class="font-medium">{{ oemName }}</span>

        <div class="flex items-center gap-1.5 text-muted-foreground">
          <Hash class="size-3" />
          <span>Version</span>
        </div>
        <span class="font-medium">v{{ page?.version ?? 0 }}</span>

        <div class="flex items-center gap-1.5 text-muted-foreground">
          <Clock class="size-3" />
          <span>Generated</span>
        </div>
        <span class="font-medium">{{ formatDate(page?.generated_at) }}</span>

        <div class="flex items-center gap-1.5 text-muted-foreground">
          <DollarSign class="size-3" />
          <span>Cost</span>
        </div>
        <span class="font-medium">{{ formatCost(page?.total_cost_usd) }}</span>
      </div>
    </div>

    <CloneRegionSidebar
      v-if="activeMode === 'clone'"
      class="min-h-0 flex-1"
      :regions="cloneRegions"
      :structured-sections="sections"
      :selected-region-id="selectedCloneRegionId"
      @select-region="emit('selectCloneRegion', $event)"
      @edit-region="emit('editCloneRegion', $event)"
    />

    <!-- Section list -->
    <div v-else class="flex-1 overflow-y-auto min-h-0">
      <div class="px-4 py-3">
        <h3 class="text-sm font-semibold mb-2">
          Sections ({{ sections.length }})
        </h3>
        <div class="space-y-2">
          <SectionListItem
            v-for="(section, index) in sections"
            :key="section.id"
            :section="section"
            :index="index"
            :total="sections.length"
            :selected="selectedSectionId === section.id"
            :read-only="props.readOnly"
            :class="{
              'opacity-40': dragIndex === index,
              'ring-2 ring-blue-500 ring-offset-1 rounded-lg': dropIndex === index && dragIndex !== index,
            }"
            @select="emit('selectSection', section.id)"
            @open-editor="!props.readOnly && emit('openEditor', section.id)"
            @move-up="!props.readOnly && emit('moveSection', index, index - 1)"
            @move-down="!props.readOnly && emit('moveSection', index, index + 1)"
            @duplicate="!props.readOnly && emit('duplicateSection', section.id)"
            @copy-json="emit('copySectionJson', section.id)"
            @convert="(targetType: string) => !props.readOnly && emit('convertSection', section.id, targetType)"
            @split="!props.readOnly && emit('splitSection', section.id)"
            @save-as-recipe="!props.readOnly && emit('saveAsRecipe', section.id)"
            @delete="!props.readOnly && emit('deleteSection', section.id)"
            @dragstart="onDragStart($event, index)"
            @dragover="onDragOver($event, index)"
            @dragleave="onDragLeave"
            @drop="onDrop($event, index)"
            @dragend="onDragEnd"
          />
        </div>

        <div v-if="sections.length === 0" class="text-center py-8">
          <p class="text-sm text-muted-foreground">
            No structured sections
          </p>
          <p class="text-xs text-muted-foreground mt-1">
            Click "Structure" to extract sections, or add manually
          </p>
        </div>

        <!-- Add Section picker -->
        <AddSectionPicker
          v-if="!props.readOnly"
          :recipes="recipes"
          :oem-id="oemId"
          @add-blank="emit('addSection', $event)"
          @add-from-template="emit('addSectionFromTemplate', $event)"
          @add-from-recipe="emit('addFromRecipe', $event)"
          @open-gallery="galleryOpen = true"
          @paste-from-clipboard="emit('pasteFromClipboard')"
        />
      </div>
    </div>

    <!-- Template Gallery Drawer -->
    <TemplateGalleryDrawer
      v-if="!props.readOnly"
      v-model:open="galleryOpen"
      :oem-id="oemId"
      @insert-section="emit('insertFromGallery', $event)"
    />
  </div>
</template>
