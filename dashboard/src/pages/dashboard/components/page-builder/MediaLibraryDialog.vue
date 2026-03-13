<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import { Search, Loader2, Upload, Film, ImageIcon } from 'lucide-vue-next'
import { listMedia, uploadMedia } from '@/lib/worker-api'
import type { MediaItem } from '@/lib/worker-api'

const props = defineProps<{
  open: boolean
  oemId: string
  modelSlug: string
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
  select: [url: string]
}>()

const items = ref<MediaItem[]>([])
const loading = ref(false)
const cursor = ref<string | null>(null)
const loadingMore = ref(false)
const search = ref('')
const filterModel = ref('')
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const modelSlugs = computed(() => {
  const slugs = new Set(items.value.map((i) => i.modelSlug).filter(Boolean))
  return Array.from(slugs).sort()
})

const filteredItems = computed(() => {
  let result = items.value
  if (filterModel.value) {
    result = result.filter((i) => i.modelSlug === filterModel.value)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter((i) => i.filename.toLowerCase().includes(q))
  }
  return result
})

watch(() => props.open, async (val) => {
  if (val) {
    items.value = []
    cursor.value = null
    search.value = ''
    filterModel.value = ''
    await fetchItems()
  }
})

async function fetchItems() {
  loading.value = true
  try {
    const res = await listMedia(props.oemId)
    items.value = res.items
    cursor.value = res.cursor
  } catch (err) {
    console.error('Failed to list media:', err)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!cursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await listMedia(props.oemId, { cursor: cursor.value })
    items.value = [...items.value, ...res.items]
    cursor.value = res.cursor
  } catch (err) {
    console.error('Failed to load more media:', err)
  } finally {
    loadingMore.value = false
  }
}

function selectItem(item: MediaItem) {
  emit('select', item.url)
  emit('update:open', false)
}

function isVideo(item: MediaItem) {
  return item.contentType.startsWith('video/')
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function openUploadPicker() {
  fileInput.value?.click()
}

async function handleUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const result = await uploadMedia(props.oemId, props.modelSlug, file)
    // Add newly uploaded item to the top of the list
    const newItem: MediaItem = {
      key: '',
      url: result.url,
      filename: result.filename,
      size: result.size,
      contentType: result.type,
      modelSlug: props.modelSlug,
      uploadedAt: new Date().toISOString(),
    }
    items.value = [newItem, ...items.value]
  } catch (err) {
    console.error('Upload failed:', err)
  } finally {
    uploading.value = false
    input.value = ''
  }
}
</script>

<template>
  <input
    ref="fileInput"
    type="file"
    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
    class="hidden"
    @change="handleUpload"
  />
  <UiDialog :open="open" @update:open="emit('update:open', $event)">
    <UiDialogContent class="sm:max-w-[800px] max-h-[80vh] flex flex-col p-0">
      <UiDialogHeader class="px-4 py-3 border-b shrink-0">
        <UiDialogTitle>Media Library</UiDialogTitle>
        <UiDialogDescription>
          Browse and select previously uploaded media for this OEM.
        </UiDialogDescription>
      </UiDialogHeader>

      <!-- Filter bar -->
      <div class="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        <div class="relative flex-1">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            v-model="search"
            type="text"
            placeholder="Search by filename..."
            class="w-full text-sm bg-background border rounded-md pl-7 pr-2 py-1.5"
          />
        </div>
        <select
          v-model="filterModel"
          class="text-sm bg-background border rounded-md px-2 py-1.5 min-w-[140px]"
        >
          <option value="">All models</option>
          <option v-for="slug in modelSlugs" :key="slug" :value="slug">
            {{ slug }}
          </option>
        </select>
        <UiButton size="sm" variant="outline" :disabled="uploading" @click="openUploadPicker">
          <Loader2 v-if="uploading" class="size-3.5 mr-1 animate-spin" />
          <Upload v-else class="size-3.5 mr-1" />
          Upload
        </UiButton>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="filteredItems.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ImageIcon class="size-8 mb-2" />
          <p class="text-sm">{{ items.length === 0 ? 'No media uploaded yet' : 'No matching files' }}</p>
        </div>
        <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3">
          <button
            v-for="item in filteredItems"
            :key="item.url"
            class="group relative rounded-lg border overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left bg-muted"
            @click="selectItem(item)"
          >
            <!-- Thumbnail -->
            <div class="aspect-square flex items-center justify-center overflow-hidden">
              <Film v-if="isVideo(item)" class="size-8 text-muted-foreground" />
              <img
                v-else
                :src="item.url"
                :alt="item.filename"
                loading="lazy"
                class="w-full h-full object-cover"
              />
            </div>
            <!-- Info overlay -->
            <div class="px-2 py-1.5 border-t bg-background">
              <p class="text-[10px] font-medium truncate">{{ item.filename }}</p>
              <p class="text-[9px] text-muted-foreground">{{ formatSize(item.size) }} · {{ item.modelSlug }}</p>
            </div>
          </button>
        </div>

        <!-- Load more -->
        <div v-if="cursor && !loading" class="flex justify-center pt-4">
          <UiButton size="sm" variant="outline" :disabled="loadingMore" @click="loadMore">
            <Loader2 v-if="loadingMore" class="size-3.5 mr-1 animate-spin" />
            Load More
          </UiButton>
        </div>
      </div>
    </UiDialogContent>
  </UiDialog>
</template>
