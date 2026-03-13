<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import { Loader2, Search, Film, ImageIcon, Copy, Check, Image, Video, X } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { listMedia } from '@/lib/worker-api'
import type { MediaItem } from '@/lib/worker-api'

const OEM_IDS = [
  'ford-au', 'gac-au', 'gwm-au', 'hyundai-au', 'isuzu-au', 'kia-au', 'ldv-au',
  'mazda-au', 'mitsubishi-au', 'nissan-au', 'subaru-au', 'suzuki-au',
  'toyota-au', 'volkswagen-au', 'kgm-au',
]

const selectedOem = ref('')
const items = ref<MediaItem[]>([])
const loading = ref(false)
const cursor = ref<string | null>(null)
const loadingMore = ref(false)
const searchQuery = ref('')
const filterModel = ref('')
const filterType = ref('all')
const previewItem = ref<MediaItem | null>(null)
const copied = ref(false)

// Derived model slugs with counts
const modelSlugs = computed(() => {
  const map = new Map<string, number>()
  for (const item of items.value) {
    if (item.modelSlug) {
      map.set(item.modelSlug, (map.get(item.modelSlug) || 0) + 1)
    }
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})

// Stats
const totalFiles = computed(() => items.value.length)
const imageCount = computed(() => items.value.filter(i => i.contentType.startsWith('image/')).length)
const videoCount = computed(() => items.value.filter(i => i.contentType.startsWith('video/')).length)

// Client-side filtering
const filteredItems = computed(() => {
  let result = items.value
  if (filterModel.value) {
    result = result.filter(i => i.modelSlug === filterModel.value)
  }
  if (filterType.value === 'images') {
    result = result.filter(i => i.contentType.startsWith('image/'))
  } else if (filterType.value === 'videos') {
    result = result.filter(i => i.contentType.startsWith('video/'))
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(i => i.filename.toLowerCase().includes(q))
  }
  return result
})

// Fetch when OEM changes
watch(selectedOem, async (oemId) => {
  if (!oemId) return
  items.value = []
  cursor.value = null
  filterModel.value = ''
  searchQuery.value = ''
  filterType.value = 'all'
  await fetchItems(oemId)
})

async function fetchItems(oemId: string) {
  loading.value = true
  try {
    const res = await listMedia(oemId)
    items.value = res.items
    cursor.value = res.cursor
  } catch (err) {
    console.error('Failed to list media:', err)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!cursor.value || loadingMore.value || !selectedOem.value) return
  loadingMore.value = true
  try {
    const res = await listMedia(selectedOem.value, { cursor: cursor.value })
    items.value = [...items.value, ...res.items]
    cursor.value = res.cursor
  } catch (err) {
    console.error('Failed to load more media:', err)
  } finally {
    loadingMore.value = false
  }
}

function isVideo(item: MediaItem) {
  return item.contentType.startsWith('video/')
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function oemLabel(id: string) {
  return id.replace(/-au$/, '').replace(/^./, c => c.toUpperCase())
}

async function copyUrl(url: string) {
  await navigator.clipboard.writeText(url)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <BasicPage title="Media Library" description="Browse uploaded media assets across OEMs" sticky>
    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <UiSelect v-model="selectedOem">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="Select OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem v-for="oem in OEM_IDS" :key="oem" :value="oem">
            {{ oemLabel(oem) }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <template v-if="selectedOem">
        <UiSelect v-model="filterModel">
          <UiSelectTrigger class="w-[180px]">
            <UiSelectValue placeholder="All models" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="">All Models</UiSelectItem>
            <UiSelectItem v-for="[slug, count] in modelSlugs" :key="slug" :value="slug">
              {{ slug }} ({{ count }})
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>

        <UiSelect v-model="filterType">
          <UiSelectTrigger class="w-[140px]">
            <UiSelectValue placeholder="All types" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="all">All Types</UiSelectItem>
            <UiSelectItem value="images">Images</UiSelectItem>
            <UiSelectItem value="videos">Videos</UiSelectItem>
          </UiSelectContent>
        </UiSelect>

        <div class="relative">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <UiInput
            v-model="searchQuery"
            placeholder="Search by filename..."
            class="pl-8 w-[220px] h-9"
          />
        </div>

        <span class="text-sm text-muted-foreground">
          {{ filteredItems.length }} file{{ filteredItems.length !== 1 ? 's' : '' }}
        </span>
      </template>
    </div>

    <!-- Empty state: no OEM selected -->
    <div v-if="!selectedOem" class="text-center py-16">
      <ImageIcon class="size-10 text-muted-foreground/30 mx-auto mb-3" />
      <p class="text-sm text-muted-foreground">Select an OEM to browse uploaded media</p>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Stats Cards -->
      <div class="grid gap-4 grid-cols-3 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Total Files</UiCardTitle>
            <ImageIcon class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ totalFiles.toLocaleString() }}</div>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Images</UiCardTitle>
            <Image class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-blue-500">{{ imageCount.toLocaleString() }}</div>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Videos</UiCardTitle>
            <Video class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-purple-500">{{ videoCount.toLocaleString() }}</div>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Asset Grid -->
      <div class="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        <div
          v-for="item in filteredItems"
          :key="item.key || item.url"
          class="group relative rounded-lg border bg-card overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
          @click="previewItem = item"
        >
          <div class="aspect-square bg-muted flex items-center justify-center overflow-hidden">
            <Film v-if="isVideo(item)" class="size-8 text-muted-foreground/30" />
            <img
              v-else
              :src="item.url"
              :alt="item.filename"
              loading="lazy"
              class="w-full h-full object-cover"
            />
          </div>
          <div class="p-2">
            <p class="text-xs font-medium truncate" :title="item.filename">{{ item.filename }}</p>
            <div class="flex items-center gap-1 mt-1">
              <UiBadge v-if="item.modelSlug" variant="secondary" class="text-[10px] px-1">
                {{ item.modelSlug }}
              </UiBadge>
            </div>
            <p class="text-[10px] text-muted-foreground mt-1">
              {{ formatSize(item.size) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="filteredItems.length === 0 && !loading" class="text-center py-16">
        <ImageIcon class="size-10 text-muted-foreground/30 mx-auto mb-3" />
        <p class="text-sm text-muted-foreground">
          {{ items.length === 0 ? 'No media uploaded for this OEM' : 'No files matching your filters' }}
        </p>
      </div>

      <!-- Load More -->
      <div v-if="cursor" class="flex justify-center pt-6">
        <UiButton size="sm" variant="outline" :disabled="loadingMore" @click="loadMore">
          <Loader2 v-if="loadingMore" class="size-3.5 mr-1 animate-spin" />
          Load More
        </UiButton>
      </div>
    </template>

    <!-- Preview Dialog -->
    <UiDialog :open="!!previewItem" @update:open="v => { if (!v) previewItem = null }">
      <UiDialogContent v-if="previewItem" class="sm:max-w-[800px]">
        <UiDialogHeader>
          <UiDialogTitle class="text-sm">{{ previewItem.filename }}</UiDialogTitle>
          <UiDialogDescription>
            {{ formatSize(previewItem.size) }} &middot;
            {{ previewItem.contentType }} &middot;
            {{ formatDate(previewItem.uploadedAt) }}
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="bg-muted rounded-md overflow-hidden">
          <video
            v-if="isVideo(previewItem)"
            :src="previewItem.url"
            controls
            class="w-full max-h-[500px]"
          />
          <img
            v-else
            :src="previewItem.url"
            :alt="previewItem.filename"
            class="w-full object-contain max-h-[500px]"
          />
        </div>
        <div class="flex flex-wrap gap-2 mt-2">
          <UiBadge v-if="previewItem.modelSlug" variant="secondary">
            {{ previewItem.modelSlug }}
          </UiBadge>
          <UiBadge variant="outline">{{ previewItem.contentType }}</UiBadge>
        </div>
        <UiDialogFooter class="gap-2">
          <UiButton variant="outline" size="sm" @click="copyUrl(previewItem!.url)">
            <Check v-if="copied" class="size-4 mr-1" />
            <Copy v-else class="size-4 mr-1" />
            {{ copied ? 'Copied!' : 'Copy URL' }}
          </UiButton>
          <UiButton variant="outline" size="sm" @click="previewItem = null">
            <X class="size-4 mr-1" />
            Close
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </BasicPage>
</template>
