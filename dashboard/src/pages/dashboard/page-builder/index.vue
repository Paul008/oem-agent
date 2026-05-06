<script lang="ts" setup>
import {
  ChevronRight,
  Columns3,
  FileText,
  Image,
  Images,
  Layers,
  LayoutGrid,
  Loader2,
  Megaphone,
  Palette,
  Search,
  Sparkles,
  TableProperties,
  Type,
  Video,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { useTemplateGallery } from '@/composables/use-template-gallery'

import { SECTION_TYPE_INFO } from '../components/page-builder/section-templates'
import SectionTemplateCard from '../components/page-builder/SectionTemplateCard.vue'

const router = useRouter()
const { fetchOems } = useOemData()

const {
  allSlugs,
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

const oems = ref<{ id: string, name: string }[]>([])
const activeTab = ref<'pages' | 'curated'>('pages')
const expandedOem = ref<string | null>(null)
const expandedSlug = ref<string | null>(null)

onMounted(async () => {
  oems.value = await fetchOems()
  await loadIndex()
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id.replace('-au', '').replace(/^\w/, c => c.toUpperCase())
}

function toggleOem(oemId: string) {
  expandedOem.value = expandedOem.value === oemId ? null : oemId
  expandedSlug.value = null
}

async function toggleSlug(oemId: string, slug: string) {
  const key = `${oemId}-${slug}`
  if (expandedSlug.value === key) {
    expandedSlug.value = null
    return
  }
  expandedSlug.value = key
  await loadPageSections(oemId, slug)
}

function slugsForOem(oemId: string) {
  return filteredSlugs.value.filter(s => s.oem_id === oemId)
}

function handleUseTemplate(section: any) {
  // Navigate to a page builder (pick the first structured page or just go to model-pages)
  router.push('/dashboard/model-pages')
}

// Stats
const stats = computed(() => {
  let totalSections = 0
  for (const [, sections] of Object.entries(Object.fromEntries(
    Array.from({ length: 0 }), // placeholder
  ))) {
    totalSections += (sections as any[]).length
  }
  return {
    totalPages: allSlugs.value.length,
    oemsCovered: oemGroups.value.length,
    curatedCount: filteredCuratedTemplates.value.length,
  }
})

const typeIcons: Record<string, any> = {
  'hero': Image,
  'intro': Type,
  'tabs': Columns3,
  'color-picker': Palette,
  'specs-grid': TableProperties,
  'gallery': Images,
  'feature-cards': LayoutGrid,
  'video': Video,
  'cta-banner': Megaphone,
  'content-block': FileText,
}
</script>

<template>
  <BasicPage title="Template Gallery" description="Browse section templates from generated pages and curated OEM styles" sticky>
    <!-- Stats row -->
    <div class="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            Total Pages
          </UiCardTitle>
          <FileText class="size-4 text-muted-foreground" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">
            {{ stats.totalPages }}
          </div>
          <p class="text-xs text-muted-foreground">
            Generated model pages
          </p>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            OEMs
          </UiCardTitle>
          <Layers class="size-4 text-blue-500" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold text-blue-500">
            {{ stats.oemsCovered }}
          </div>
          <p class="text-xs text-muted-foreground">
            With generated pages
          </p>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            Curated Templates
          </UiCardTitle>
          <Sparkles class="size-4 text-violet-500" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold text-violet-500">
            {{ stats.curatedCount }}
          </div>
          <p class="text-xs text-muted-foreground">
            OEM-branded templates
          </p>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            Section Types
          </UiCardTitle>
          <LayoutGrid class="size-4 text-emerald-500" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold text-emerald-500">
            {{ Object.keys(SECTION_TYPE_INFO).length }}
          </div>
          <p class="text-xs text-muted-foreground">
            Available section types
          </p>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- Filter bar -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <UiSelect v-model="filterOem" @update:model-value="expandedOem = null; expandedSlug = null">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="Filter by OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">
            All OEMs
          </UiSelectItem>
          <UiSelectItem v-for="g in oemGroups" :key="g.oem_id" :value="g.oem_id">
            {{ oemName(g.oem_id) }} ({{ g.count }})
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-model="filterSectionType">
        <UiSelectTrigger class="w-[160px]">
          <UiSelectValue placeholder="Section type" />
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
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <UiInput
          v-model="searchQuery"
          placeholder="Search templates..."
          class="pl-8 w-[250px] h-9"
        />
      </div>
      <span class="text-sm text-muted-foreground ml-auto">
        {{ filteredSlugs.length }} pages
      </span>
    </div>

    <!-- Loading state -->
    <div v-if="indexLoading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Tabs -->
      <div class="flex gap-1 border-b mb-4">
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'pages'
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'pages'"
        >
          From Pages ({{ filteredSlugs.length }})
        </button>
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'curated'
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'curated'"
        >
          Curated ({{ filteredCuratedTemplates.length }})
        </button>
      </div>

      <!-- From Pages tab -->
      <template v-if="activeTab === 'pages'">
        <div v-if="filteredSlugs.length === 0" class="text-center py-16">
          <FileText class="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p class="text-sm text-muted-foreground">
            No pages found matching filters
          </p>
        </div>

        <!-- OEM groups -->
        <div v-else class="space-y-2">
          <div v-for="group in oemGroups" :key="group.oem_id">
            <template v-if="filterOem === 'all' || filterOem === group.oem_id">
              <!-- OEM header -->
              <button
                class="flex items-center gap-3 w-full px-4 py-3 text-left rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                @click="toggleOem(group.oem_id)"
              >
                <div class="size-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Layers class="size-4 text-primary" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-sm">
                    {{ oemName(group.oem_id) }}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {{ slugsForOem(group.oem_id).length }} pages
                  </p>
                </div>
                <ChevronRight
                  class="size-4 text-muted-foreground transition-transform"
                  :class="expandedOem === group.oem_id && 'rotate-90'"
                />
              </button>

              <!-- Expanded pages list -->
              <div v-if="expandedOem === group.oem_id" class="ml-4 mt-1 space-y-1">
                <div v-for="item in slugsForOem(group.oem_id)" :key="`${item.oem_id}-${item.slug}`">
                  <button
                    class="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-muted/50 rounded-md transition-colors"
                    @click="toggleSlug(item.oem_id, item.slug)"
                  >
                    <FileText class="size-3.5 text-muted-foreground shrink-0" />
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
                    <ChevronRight
                      class="size-3.5 text-muted-foreground transition-transform"
                      :class="expandedSlug === `${item.oem_id}-${item.slug}` && 'rotate-90'"
                    />
                  </button>

                  <!-- Expanded sections grid -->
                  <div
                    v-if="expandedSlug === `${item.oem_id}-${item.slug}` && getCachedSections(item.oem_id, item.slug)"
                    class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 px-3 py-2"
                  >
                    <SectionTemplateCard
                      v-for="(section, idx) in getCachedSections(item.oem_id, item.slug)!.filter(
                        s => filterSectionType === 'all' || s.type === filterSectionType,
                      )"
                      :key="idx"
                      :section="section"
                      :source-oem-id="item.oem_id"
                      :source-page-name="getPageMeta(item.oem_id, item.slug)?.name"
                      mode="landing"
                      @insert-section="handleUseTemplate"
                    />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- Curated tab -->
      <template v-else>
        <div v-if="filteredCuratedTemplates.length === 0" class="text-center py-16">
          <Sparkles class="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p class="text-sm text-muted-foreground">
            No curated templates match your filters
          </p>
        </div>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <SectionTemplateCard
            v-for="tmpl in filteredCuratedTemplates"
            :key="tmpl.id"
            :section="{ ...tmpl.data, type: tmpl.type, name: tmpl.name, description: tmpl.description }"
            :source-oem-id="tmpl.oem_id !== '*' ? tmpl.oem_id : undefined"
            mode="landing"
            @insert-section="handleUseTemplate"
          />
        </div>
      </template>
    </template>
  </BasicPage>
</template>
