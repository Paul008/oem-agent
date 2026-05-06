<script lang="ts" setup>
import { Library, Loader2, Search } from 'lucide-vue-next'
import { onMounted, ref, watch } from 'vue'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useTemplateGallery } from '@/composables/use-template-gallery'

import { SECTION_TYPE_INFO } from './section-templates'
import SectionTemplateCard from './SectionTemplateCard.vue'

const props = defineProps<{
  open: boolean
  oemId?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'insertSection': [section: any]
}>()

const {
  indexLoaded,
  indexLoading,
  filterOem,
  filterSectionType,
  searchQuery,
  loadingSections,
  oemGroups,
  filteredSlugs,
  filteredCuratedTemplates,
  loadIndex,
  loadPageSections,
  getPageMeta,
  getCachedSections,
} = useTemplateGallery()

const activeTab = ref<'pages' | 'curated'>('pages')
const expandedSlug = ref<string | null>(null)

// Default OEM filter to current page's OEM
watch(() => props.open, (isOpen) => {
  if (isOpen && props.oemId) {
    filterOem.value = props.oemId
  }
})

onMounted(() => {
  loadIndex()
})

async function toggleSlug(oemId: string, slug: string) {
  const key = `${oemId}-${slug}`
  if (expandedSlug.value === key) {
    expandedSlug.value = null
    return
  }
  expandedSlug.value = key
  await loadPageSections(oemId, slug)
}

function handleInsert(section: any) {
  emit('insertSection', section)
  emit('update:open', false)
}

function oemLabel(id: string): string {
  return id.replace('-au', '').replace(/^\w/, c => c.toUpperCase())
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="sm:max-w-lg w-full flex flex-col">
      <SheetHeader class="shrink-0">
        <SheetTitle class="flex items-center gap-2">
          <Library class="size-4" />
          Template Gallery
        </SheetTitle>
        <SheetDescription>
          Browse sections from existing pages or curated OEM templates
        </SheetDescription>
      </SheetHeader>

      <!-- Filters -->
      <div class="flex items-center gap-2 shrink-0">
        <UiSelect v-model="filterOem" @update:model-value="expandedSlug = null">
          <UiSelectTrigger class="w-[140px] h-8 text-xs">
            <UiSelectValue placeholder="OEM" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="all">
              All OEMs
            </UiSelectItem>
            <UiSelectItem v-for="g in oemGroups" :key="g.oem_id" :value="g.oem_id">
              {{ oemLabel(g.oem_id) }} ({{ g.count }})
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <UiSelect v-model="filterSectionType">
          <UiSelectTrigger class="w-[130px] h-8 text-xs">
            <UiSelectValue placeholder="Type" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="all">
              All Types
            </UiSelectItem>
            <UiSelectItem
              v-for="(info, type) in SECTION_TYPE_INFO"
              :key="type"
              :value="type"
            >
              {{ info.label }}
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <div class="relative flex-1">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <UiInput
            v-model="searchQuery"
            placeholder="Search..."
            class="pl-7 h-8 text-xs"
          />
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 border-b shrink-0">
        <button
          class="px-3 py-1.5 text-xs font-medium border-b-2 transition-colors"
          :class="activeTab === 'pages'
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'pages'"
        >
          From Pages
        </button>
        <button
          class="px-3 py-1.5 text-xs font-medium border-b-2 transition-colors"
          :class="activeTab === 'curated'
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'curated'"
        >
          Curated ({{ filteredCuratedTemplates.length }})
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto min-h-0">
        <!-- Loading index -->
        <div v-if="indexLoading" class="flex items-center justify-center py-12">
          <Loader2 class="size-5 animate-spin text-muted-foreground" />
        </div>

        <!-- From Pages tab -->
        <template v-else-if="activeTab === 'pages'">
          <div v-if="filteredSlugs.length === 0" class="text-center py-8">
            <p class="text-sm text-muted-foreground">
              No pages found
            </p>
          </div>
          <div v-else class="space-y-1 py-2">
            <div v-for="item in filteredSlugs" :key="`${item.oem_id}-${item.slug}`">
              <!-- Page row -->
              <button
                class="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-muted/50 rounded-md transition-colors"
                @click="toggleSlug(item.oem_id, item.slug)"
              >
                <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                  {{ oemLabel(item.oem_id) }}
                </span>
                <span class="flex-1 truncate font-medium text-xs">
                  {{ getPageMeta(item.oem_id, item.slug)?.name || item.slug }}
                </span>
                <span
                  v-if="getCachedSections(item.oem_id, item.slug)"
                  class="text-[10px] text-muted-foreground"
                >
                  {{ getCachedSections(item.oem_id, item.slug)!.length }} sections
                </span>
                <Loader2
                  v-else-if="expandedSlug === `${item.oem_id}-${item.slug}` && loadingSections"
                  class="size-3 animate-spin text-muted-foreground"
                />
              </button>

              <!-- Expanded sections -->
              <div
                v-if="expandedSlug === `${item.oem_id}-${item.slug}` && getCachedSections(item.oem_id, item.slug)"
                class="grid grid-cols-2 gap-2 px-3 pb-2"
              >
                <SectionTemplateCard
                  v-for="(section, idx) in getCachedSections(item.oem_id, item.slug)!.filter(
                    s => filterSectionType === 'all' || s.type === filterSectionType,
                  )"
                  :key="idx"
                  :section="section"
                  :source-oem-id="item.oem_id"
                  :source-page-name="getPageMeta(item.oem_id, item.slug)?.name"
                  mode="editor"
                  @insert-section="handleInsert"
                />
              </div>
            </div>
          </div>
        </template>

        <!-- Curated tab -->
        <template v-else>
          <div v-if="filteredCuratedTemplates.length === 0" class="text-center py-8">
            <p class="text-sm text-muted-foreground">
              No curated templates match filters
            </p>
          </div>
          <div v-else class="grid grid-cols-2 gap-2 p-3">
            <SectionTemplateCard
              v-for="tmpl in filteredCuratedTemplates"
              :key="tmpl.id"
              :section="{ ...tmpl.data, type: tmpl.type, name: tmpl.name, description: tmpl.description }"
              :source-oem-id="tmpl.oem_id !== '*' ? tmpl.oem_id : undefined"
              mode="editor"
              @insert-section="handleInsert"
            />
          </div>
        </template>
      </div>
    </SheetContent>
  </Sheet>
</template>
