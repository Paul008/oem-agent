<script lang="ts" setup>
import { ref } from 'vue'
import { Clock, DollarSign, Hash, Layers } from 'lucide-vue-next'
import SectionListItem from './SectionListItem.vue'
import AddSectionPicker from './AddSectionPicker.vue'
import TemplateGalleryDrawer from './TemplateGalleryDrawer.vue'
import type { PageSectionType } from './section-templates'

const props = defineProps<{
  page: any
  sections: any[]
  selectedSectionId: string | null
  oemName: string
  oemId?: string
}>()

const emit = defineEmits<{
  selectSection: [id: string]
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
}>()

const galleryOpen = ref(false)

function formatDate(iso: string | undefined) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCost(cost: number | undefined) {
  if (!cost) return '-'
  return `$${cost.toFixed(4)}`
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Metadata -->
    <div class="px-4 py-3 border-b space-y-1.5 shrink-0">
      <h2 class="text-sm font-semibold">Page Metadata</h2>
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

    <!-- Section list -->
    <div class="flex-1 overflow-y-auto min-h-0">
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
            @select="emit('selectSection', section.id)"
            @move-up="emit('moveSection', index, index - 1)"
            @move-down="emit('moveSection', index, index + 1)"
            @duplicate="emit('duplicateSection', section.id)"
            @copy-json="emit('copySectionJson', section.id)"
            @convert="(targetType: string) => emit('convertSection', section.id, targetType)"
            @split="emit('splitSection', section.id)"
            @delete="emit('deleteSection', section.id)"
          />
        </div>

        <div v-if="sections.length === 0" class="text-center py-8">
          <p class="text-sm text-muted-foreground">No structured sections</p>
          <p class="text-xs text-muted-foreground mt-1">Click "Structure" to extract sections, or add manually</p>
        </div>

        <!-- Add Section picker -->
        <AddSectionPicker
          @add-blank="emit('addSection', $event)"
          @add-from-template="emit('addSectionFromTemplate', $event)"
          @open-gallery="galleryOpen = true"
          @paste-from-clipboard="emit('pasteFromClipboard')"
        />
      </div>
    </div>

    <!-- Template Gallery Drawer -->
    <TemplateGalleryDrawer
      v-model:open="galleryOpen"
      :oem-id="oemId"
      @insert-section="emit('insertFromGallery', $event)"
    />
  </div>
</template>
