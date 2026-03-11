<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import { Search, Loader2, Copy, Check } from 'lucide-vue-next'
import { fetchGeneratedPages, fetchGeneratedPage } from '@/lib/worker-api'

const OEM_IDS = [
  'ford-au', 'gac-au', 'gwm-au', 'hyundai-au', 'isuzu-au', 'kia-au', 'ldv-au',
  'mazda-au', 'mitsubishi-au', 'nissan-au', 'subaru-au', 'suzuki-au',
  'toyota-au', 'volkswagen-au', 'kgm-au',
]

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
  paste: [sections: any[]]
}>()

const selectedOem = ref(OEM_IDS[0])
const pages = ref<any[]>([])
const loadingPages = ref(false)
const selectedPageSlug = ref<string | null>(null)
const pageSections = ref<any[]>([])
const loadingPage = ref(false)
const selectedSectionIds = ref<Set<string>>(new Set())
const search = ref('')

watch(() => props.open, (val) => {
  if (val) {
    loadPages()
  } else {
    selectedPageSlug.value = null
    pageSections.value = []
    selectedSectionIds.value = new Set()
    search.value = ''
  }
})

watch(selectedOem, () => {
  selectedPageSlug.value = null
  pageSections.value = []
  selectedSectionIds.value = new Set()
  loadPages()
})

async function loadPages() {
  loadingPages.value = true
  try {
    const result = await fetchGeneratedPages(selectedOem.value)
    pages.value = Array.isArray(result) ? result : (result as any)?.pages ?? []
  } catch {
    pages.value = []
  } finally {
    loadingPages.value = false
  }
}

async function selectPage(slug: string) {
  selectedPageSlug.value = slug
  selectedSectionIds.value = new Set()
  loadingPage.value = true
  try {
    const pg = await fetchGeneratedPage(slug)
    pageSections.value = pg?.content?.sections ?? []
  } catch {
    pageSections.value = []
  } finally {
    loadingPage.value = false
  }
}

function toggleSection(id: string) {
  const s = new Set(selectedSectionIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedSectionIds.value = s
}

function toggleAll() {
  if (selectedSectionIds.value.size === pageSections.value.length) {
    selectedSectionIds.value = new Set()
  } else {
    selectedSectionIds.value = new Set(pageSections.value.map((s: any) => s.id))
  }
}

const filteredPages = computed(() => {
  if (!search.value) return pages.value
  const q = search.value.toLowerCase()
  return pages.value.filter((p: any) =>
    (p.name || p.slug || '').toLowerCase().includes(q),
  )
})

const selectedSections = computed(() =>
  pageSections.value.filter((s: any) => selectedSectionIds.value.has(s.id)),
)

function handlePaste() {
  if (selectedSections.value.length === 0) return
  emit('paste', selectedSections.value)
  emit('update:open', false)
}

async function copySelectedJson() {
  if (selectedSections.value.length === 0) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(selectedSections.value, null, 2))
  } catch { /* ignore */ }
}

function sectionLabel(s: any): string {
  return s.heading || s.title || s.type
}

function sectionPreview(s: any): string {
  const text = s.body_html || s.content_html || s.sub_heading || ''
  const stripped = text.replace(/<[^>]*>/g, '')
  return stripped.length > 80 ? stripped.slice(0, 80) + '...' : stripped
}

function oemLabel(id: string): string {
  return id.replace('-au', '').replace(/^./, (c: string) => c.toUpperCase())
}
</script>

<template>
  <UiDialog :open="open" @update:open="emit('update:open', $event)">
    <UiDialogContent class="sm:max-w-[900px] max-h-[80vh] flex flex-col p-0">
      <UiDialogHeader class="px-4 py-3 border-b shrink-0">
        <UiDialogTitle>Import Sections from Another Page</UiDialogTitle>
        <UiDialogDescription>
          Browse pages from any OEM, select sections, and paste them into your current page.
        </UiDialogDescription>
      </UiDialogHeader>

      <div class="flex flex-1 min-h-0">
        <!-- Left: OEM + page list -->
        <div class="w-72 border-r flex flex-col shrink-0">
          <!-- OEM selector -->
          <div class="px-3 py-2 border-b">
            <select
              v-model="selectedOem"
              class="w-full text-sm bg-background border rounded-md px-2 py-1.5"
            >
              <option v-for="oem in OEM_IDS" :key="oem" :value="oem">
                {{ oemLabel(oem) }}
              </option>
            </select>
          </div>

          <!-- Search -->
          <div class="px-3 py-2 border-b">
            <div class="relative">
              <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                v-model="search"
                type="text"
                placeholder="Search pages..."
                class="w-full text-sm bg-background border rounded-md pl-7 pr-2 py-1.5"
              />
            </div>
          </div>

          <!-- Page list -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="loadingPages" class="flex items-center justify-center py-8">
              <Loader2 class="size-5 animate-spin text-muted-foreground" />
            </div>
            <div v-else-if="filteredPages.length === 0" class="px-3 py-4 text-xs text-muted-foreground text-center">
              No pages found
            </div>
            <button
              v-else
              v-for="pg in filteredPages"
              :key="pg.slug"
              class="flex flex-col w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
              :class="selectedPageSlug === pg.slug ? 'bg-primary/10 text-primary' : ''"
              @click="selectPage(pg.slug)"
            >
              <span class="font-medium truncate">{{ pg.name || pg.slug }}</span>
              <span class="text-[10px] text-muted-foreground truncate">{{ pg.slug }}</span>
            </button>
          </div>
        </div>

        <!-- Right: sections from selected page -->
        <div class="flex-1 flex flex-col min-w-0">
          <div v-if="!selectedPageSlug" class="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a page to view its sections
          </div>
          <div v-else-if="loadingPage" class="flex-1 flex items-center justify-center">
            <Loader2 class="size-5 animate-spin text-muted-foreground" />
          </div>
          <template v-else>
            <!-- Select all header -->
            <div class="flex items-center gap-2 px-3 py-2 border-b text-xs text-muted-foreground">
              <UiCheckbox
                :checked="selectedSectionIds.size === pageSections.length && pageSections.length > 0"
                @update:checked="toggleAll"
              />
              <span>{{ pageSections.length }} section{{ pageSections.length !== 1 ? 's' : '' }}</span>
              <span v-if="selectedSectionIds.size > 0" class="ml-auto font-medium text-primary">
                {{ selectedSectionIds.size }} selected
              </span>
            </div>

            <!-- Section list -->
            <div class="flex-1 overflow-y-auto">
              <div
                v-for="section in pageSections"
                :key="section.id"
                class="flex items-start gap-2.5 px-3 py-2.5 border-b hover:bg-muted/30 cursor-pointer transition-colors"
                @click="toggleSection(section.id)"
              >
                <UiCheckbox
                  :checked="selectedSectionIds.has(section.id)"
                  class="mt-0.5"
                  @update:checked="toggleSection(section.id)"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <UiBadge variant="secondary" class="text-[9px] px-1.5 py-0 font-normal shrink-0">
                      {{ section.type }}
                    </UiBadge>
                    <span class="text-sm font-medium truncate">{{ sectionLabel(section) }}</span>
                  </div>
                  <p v-if="sectionPreview(section)" class="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                    {{ sectionPreview(section) }}
                  </p>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <UiDialogFooter class="px-4 py-3 border-t shrink-0">
        <UiButton variant="outline" size="sm" @click="copySelectedJson" :disabled="selectedSections.length === 0">
          <Copy class="size-3.5 mr-1" />
          Copy JSON
        </UiButton>
        <UiButton size="sm" @click="handlePaste" :disabled="selectedSections.length === 0">
          Paste {{ selectedSections.length }} Section{{ selectedSections.length !== 1 ? 's' : '' }}
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
