<script lang="ts" setup>
import { Film, ImageIcon, Library, Loader2, Palette, Search, Upload } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import type { PortalAsset } from '@/composables/use-portal-assets'
import type { MediaItem } from '@/lib/worker-api'

import { usePortalAssets } from '@/composables/use-portal-assets'
import { listMedia, uploadMedia } from '@/lib/worker-api'

const props = defineProps<{
  open: boolean
  oemId: string
  modelSlug: string
  mediaKind?: 'all' | 'image' | 'video'
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
  'select': [url: string]
}>()

const { fetchPortalAssetsPage, fetchParsedModels, thumbnailUrl } = usePortalAssets()

type Tab = 'library' | 'portal'
const tab = ref<Tab>('library')
type LibraryScope = 'model' | 'oem'
type PortalTypeOption = { value: string, label: string }

// ── Library (R2 uploads — existing behaviour) ──
const items = ref<MediaItem[]>([])
const loading = ref(false)
const cursor = ref<string | null>(null)
const loadingMore = ref(false)
const search = ref('')
const filterModel = ref('')
const libraryScope = ref<LibraryScope>('model')
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const mediaKind = computed(() => props.mediaKind || 'all')
const uploadAccept = computed(() => {
  if (mediaKind.value === 'image')
    return 'image/jpeg,image/png,image/webp,image/gif'
  if (mediaKind.value === 'video')
    return 'video/mp4,video/webm'
  return 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm'
})
const uploadLabel = computed(() => {
  if (mediaKind.value === 'image')
    return 'Upload image'
  if (mediaKind.value === 'video')
    return 'Upload video'
  return 'Upload'
})

function matchesMediaKind(contentType: string | null | undefined): boolean {
  if (mediaKind.value === 'image')
    return String(contentType || '').startsWith('image/')
  if (mediaKind.value === 'video')
    return String(contentType || '').startsWith('video/')
  return true
}

const modelSlugs = computed(() => {
  const slugs = new Set(items.value.filter(item => matchesMediaKind(item.contentType)).map(i => i.modelSlug).filter(Boolean))
  return Array.from(slugs).sort()
})

const filteredItems = computed(() => {
  let result = items.value.filter(item => matchesMediaKind(item.contentType))
  if (libraryScope.value === 'oem' && filterModel.value)
    result = result.filter(i => i.modelSlug === filterModel.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(i => i.filename.toLowerCase().includes(q))
  }
  return result
})

const libraryScopeModelLabel = computed(() => props.modelSlug || 'Current model')
const librarySearchPlaceholder = computed(() => libraryScope.value === 'model'
  ? `Search ${libraryScopeModelLabel.value} media...`
  : 'Search all OEM media...'
)
const libraryEmptyText = computed(() => {
  if (items.value.length > 0)
    return 'No matching files'
  return libraryScope.value === 'model'
    ? `No media uploaded for ${libraryScopeModelLabel.value}`
    : `No media uploaded for ${props.oemId}`
})

// ── Portal Assets (DAM-backed) ──
const portalRows = ref<PortalAsset[]>([])
const portalTotal = ref(0)
const portalPage = ref(1)
const portalLoading = ref(false)
const portalParsedModels = ref<string[]>([])
const portalFilterModel = ref<string>('') // blank = all
const portalFilterType = ref<string>('IMAGE') // default to images for page-builder use
const portalSearch = ref('')
const PORTAL_PAGE_SIZE = 60
let resettingLibrary = false

// Best-effort match between a model slug (e.g. "ranger") and our parsed_model
// values (e.g. "ranger", "ranger-hybrid", "ranger-raptor"). Pick the most
// specific contains-match, else leave blank so user can pick.
function autoDetectParsedModel(slug: string | null | undefined, options: string[]): string {
  if (!slug)
    return ''
  const s = slug.toLowerCase()
  const direct = options.find(o => o === s)
  if (direct)
    return direct
  const contains = options.find(o => o.includes(s) || s.includes(o))
  return contains ?? ''
}

function defaultLibraryModelFilter(modelSlug: string, mediaItems: MediaItem[]): string {
  if (!modelSlug)
    return ''
  return mediaItems.some(item => item.modelSlug === modelSlug && matchesMediaKind(item.contentType)) ? modelSlug : ''
}

function defaultPortalFilterType(): string {
  if (mediaKind.value === 'video')
    return 'VIDEO'
  if (mediaKind.value === 'all')
    return 'IMAGE'
  return 'IMAGE'
}

const portalTypeOptions = computed<PortalTypeOption[]>(() => {
  if (mediaKind.value === 'image')
    return [{ value: 'IMAGE', label: 'Images' }]
  if (mediaKind.value === 'video')
    return [{ value: 'VIDEO', label: 'Videos' }]
  return [
    { value: '', label: 'Any type' },
    { value: 'IMAGE', label: 'Images' },
    { value: 'VIDEO', label: 'Videos' },
    { value: 'DOCUMENT', label: 'Documents' },
    { value: 'TEMPLATE', label: 'Templates' },
  ]
})

function portalAssetMatchesMediaKind(asset: PortalAsset): boolean {
  if (mediaKind.value === 'image')
    return asset.asset_type === 'IMAGE'
  if (mediaKind.value === 'video')
    return asset.asset_type === 'VIDEO'
  return true
}

async function loadPortalFilters() {
  portalParsedModels.value = await fetchParsedModels(props.oemId)
  portalFilterModel.value = autoDetectParsedModel(props.modelSlug, portalParsedModels.value)
}

async function loadPortalPage() {
  portalLoading.value = true
  try {
    const { rows, total } = await fetchPortalAssetsPage({
      oemId: props.oemId,
      model: portalFilterModel.value || undefined,
      assetType: portalFilterType.value || undefined,
      search: portalSearch.value.trim() || undefined,
      page: portalPage.value,
      pageSize: PORTAL_PAGE_SIZE,
    })
    portalRows.value = rows
    portalTotal.value = total
  }
  finally {
    portalLoading.value = false
  }
}

// ── Lifecycle ──
watch(() => props.open, async (val) => {
  if (!val)
    return
  tab.value = 'library'
  // Library
  resettingLibrary = true
  try {
    items.value = []
    cursor.value = null
    search.value = ''
    filterModel.value = ''
    libraryScope.value = props.modelSlug ? 'model' : 'oem'
    await fetchItems()
    filterModel.value = libraryScope.value === 'oem'
      ? defaultLibraryModelFilter(props.modelSlug, items.value)
      : ''
  }
  finally {
    resettingLibrary = false
  }
  // Portal (prep — loads on first tab switch to avoid unnecessary queries)
  portalRows.value = []
  portalPage.value = 1
  portalSearch.value = ''
  portalFilterType.value = defaultPortalFilterType()
  await loadPortalFilters()
})

watch(libraryScope, async () => {
  if (resettingLibrary || !props.open || tab.value !== 'library')
    return
  items.value = []
  cursor.value = null
  search.value = ''
  filterModel.value = ''
  await fetchItems()
  filterModel.value = libraryScope.value === 'oem'
    ? defaultLibraryModelFilter(props.modelSlug, items.value)
    : ''
})

// Refetch portal when filters change (after first visit)
watch([portalFilterModel, portalFilterType], () => {
  if (tab.value !== 'portal')
    return
  portalPage.value = 1
  loadPortalPage()
})

let portalSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(portalSearch, () => {
  if (tab.value !== 'portal')
    return
  if (portalSearchTimer)
    clearTimeout(portalSearchTimer)
  portalSearchTimer = setTimeout(() => {
    portalPage.value = 1
    loadPortalPage()
  }, 300)
})

// Lazy-load portal the first time the tab opens
watch(tab, async (t) => {
  if (t === 'portal' && portalRows.value.length === 0 && !portalLoading.value) {
    await loadPortalPage()
  }
})

async function fetchItems() {
  loading.value = true
  try {
    const res = await listMedia(props.oemId, libraryScope.value === 'model' && props.modelSlug
      ? { modelSlug: props.modelSlug }
      : undefined)
    items.value = res.items
    cursor.value = res.cursor
  }
  catch (err) {
    console.error('Failed to list media:', err)
  }
  finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!cursor.value || loadingMore.value)
    return
  loadingMore.value = true
  try {
    const res = await listMedia(props.oemId, {
      cursor: cursor.value,
      ...(libraryScope.value === 'model' && props.modelSlug ? { modelSlug: props.modelSlug } : {}),
    })
    items.value = [...items.value, ...res.items]
    cursor.value = res.cursor
  }
  catch (err) {
    console.error('Failed to load more media:', err)
  }
  finally {
    loadingMore.value = false
  }
}

function selectLibraryItem(item: MediaItem) {
  if (!matchesMediaKind(item.contentType))
    return
  emit('select', item.url)
  emit('update:open', false)
}

function selectPortalAsset(a: PortalAsset) {
  if (!portalAssetMatchesMediaKind(a))
    return
  emit('select', a.cdn_url)
  emit('update:open', false)
}

function isVideo(item: MediaItem) {
  return item.contentType.startsWith('video/')
}

function formatSize(bytes: number | null) {
  if (!bytes)
    return ''
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function openUploadPicker() {
  fileInput.value?.click()
}

async function handleUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  if (!matchesMediaKind(file.type)) {
    input.value = ''
    return
  }
  uploading.value = true
  try {
    const result = await uploadMedia(props.oemId, props.modelSlug, file)
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
  }
  catch (err) {
    console.error('Upload failed:', err)
  }
  finally {
    uploading.value = false
    input.value = ''
  }
}

const portalPageCount = computed(() => Math.max(1, Math.ceil(portalTotal.value / PORTAL_PAGE_SIZE)))

function goPortal(delta: number) {
  const next = Math.min(portalPageCount.value, Math.max(1, portalPage.value + delta))
  if (next !== portalPage.value) {
    portalPage.value = next
    loadPortalPage()
  }
}
</script>

<template>
  <input
    ref="fileInput"
    type="file"
    :accept="uploadAccept"
    class="hidden"
    @change="handleUpload"
  >
  <UiDialog :open="open" @update:open="emit('update:open', $event)">
    <UiDialogContent class="sm:max-w-[900px] max-h-[85vh] flex flex-col p-0">
      <UiDialogHeader class="px-4 py-3 border-b shrink-0">
        <UiDialogTitle>Media Library</UiDialogTitle>
        <UiDialogDescription>
          Upload media to this OEM's page library, or pick from the {{ oemId }} DAM.
        </UiDialogDescription>
      </UiDialogHeader>

      <!-- Tabs -->
      <div class="flex items-center gap-1 px-4 pt-3 border-b shrink-0">
        <button
          class="inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition" :class="[
            tab === 'library' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          ]"
          @click="tab = 'library'"
        >
          <Library class="size-3.5" />
          Library <span class="text-xs text-muted-foreground">({{ items.length }})</span>
        </button>
        <button
          class="inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition" :class="[
            tab === 'portal' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          ]"
          @click="tab = 'portal'"
        >
          <Palette class="size-3.5" />
          Portal Assets <span v-if="portalTotal" class="text-xs text-muted-foreground">({{ portalTotal.toLocaleString() }})</span>
        </button>
      </div>

      <!-- LIBRARY TAB -->
      <template v-if="tab === 'library'">
        <div class="flex flex-wrap items-center gap-2 px-4 py-2 border-b shrink-0">
          <div class="inline-flex rounded-md border bg-background p-0.5">
            <button
              class="rounded px-2.5 py-1 text-xs font-medium transition"
              :class="libraryScope === 'model' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
              @click="libraryScope = 'model'"
            >
              {{ libraryScopeModelLabel }}
            </button>
            <button
              class="rounded px-2.5 py-1 text-xs font-medium transition"
              :class="libraryScope === 'oem' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
              @click="libraryScope = 'oem'"
            >
              All {{ oemId }}
            </button>
          </div>
          <div class="relative flex-1">
            <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              v-model="search"
              type="text"
              :placeholder="librarySearchPlaceholder"
              class="w-full text-sm bg-background border rounded-md pl-7 pr-2 py-1.5"
            >
          </div>
          <select v-if="libraryScope === 'oem'" v-model="filterModel" class="text-sm bg-background border rounded-md px-2 py-1.5 min-w-[140px]">
            <option value="">
              All models
            </option>
            <option v-for="slug in modelSlugs" :key="slug" :value="slug">
              {{ slug }}
            </option>
          </select>
          <UiButton size="sm" variant="outline" :disabled="uploading" @click="openUploadPicker">
            <Loader2 v-if="uploading" class="size-3.5 mr-1 animate-spin" />
            <Upload v-else class="size-3.5 mr-1" />
            {{ uploadLabel }}
          </UiButton>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="loading" class="flex items-center justify-center py-12">
            <Loader2 class="size-6 animate-spin text-muted-foreground" />
          </div>
          <div v-else-if="filteredItems.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ImageIcon class="size-8 mb-2" />
            <p class="text-sm">
              {{ libraryEmptyText }}
            </p>
          </div>
          <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3">
            <button
              v-for="item in filteredItems"
              :key="item.url"
              class="group relative rounded-lg border overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left bg-muted"
              @click="selectLibraryItem(item)"
            >
              <div class="aspect-square flex items-center justify-center overflow-hidden">
                <Film v-if="isVideo(item)" class="size-8 text-muted-foreground" />
                <img v-else :src="item.url" :alt="item.filename" loading="lazy" class="w-full h-full object-cover">
              </div>
              <div class="px-2 py-1.5 border-t bg-background">
                <p class="text-[10px] font-medium truncate">
                  {{ item.filename }}
                </p>
                <p class="text-[9px] text-muted-foreground">
                  {{ formatSize(item.size) }} · {{ item.modelSlug }}
                </p>
              </div>
            </button>
          </div>
          <div v-if="cursor && !loading" class="flex justify-center pt-4">
            <UiButton size="sm" variant="outline" :disabled="loadingMore" @click="loadMore">
              <Loader2 v-if="loadingMore" class="size-3.5 mr-1 animate-spin" />
              Load More
            </UiButton>
          </div>
        </div>
      </template>

      <!-- PORTAL TAB -->
      <template v-else>
        <div class="flex items-center gap-2 px-4 py-2 border-b shrink-0">
          <div class="relative flex-1">
            <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              v-model="portalSearch"
              type="text"
              placeholder="Search portal assets..."
              class="w-full text-sm bg-background border rounded-md pl-7 pr-2 py-1.5"
            >
          </div>
          <select v-model="portalFilterModel" class="text-sm bg-background border rounded-md px-2 py-1.5 min-w-[160px]">
            <option value="">
              All models
            </option>
            <option v-for="m in portalParsedModels" :key="m" :value="m">
              {{ m }}
            </option>
          </select>
          <select v-model="portalFilterType" class="text-sm bg-background border rounded-md px-2 py-1.5 min-w-[110px]">
            <option v-for="option in portalTypeOptions" :key="option.value || 'any'" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="portalLoading" class="flex items-center justify-center py-12">
            <Loader2 class="size-6 animate-spin text-muted-foreground" />
          </div>
          <div v-else-if="portalRows.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ImageIcon class="size-8 mb-2" />
            <p class="text-sm">
              No portal assets match these filters
            </p>
          </div>
          <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3">
            <button
              v-for="a in portalRows"
              :key="a.id"
              class="group relative rounded-lg border overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left bg-muted"
              :title="a.record_name || a.name"
              @click="selectPortalAsset(a)"
            >
              <div class="aspect-square flex items-center justify-center overflow-hidden">
                <img
                  v-if="a.asset_type === 'IMAGE'"
                  :src="thumbnailUrl(a.cdn_url)"
                  :alt="a.name"
                  loading="lazy"
                  class="w-full h-full object-cover"
                >
                <ImageIcon v-else class="size-8 text-muted-foreground/40" />
              </div>
              <div class="px-2 py-1.5 border-t bg-background">
                <p class="text-[10px] font-medium truncate">
                  {{ a.record_name || a.name }}
                </p>
                <p class="text-[9px] text-muted-foreground truncate">
                  {{ a.width && a.height ? `${a.width}×${a.height}` : '' }}
                  {{ a.parsed_model ? `· ${a.parsed_model}` : '' }}
                  {{ a.original_format ? `· ${a.original_format}` : '' }}
                </p>
              </div>
            </button>
          </div>
        </div>

        <div
          v-if="portalTotal > PORTAL_PAGE_SIZE"
          class="flex items-center justify-between px-4 py-2 border-t shrink-0 text-xs text-muted-foreground"
        >
          <span>Page {{ portalPage }} of {{ portalPageCount.toLocaleString() }} &middot; {{ portalTotal.toLocaleString() }} assets</span>
          <div class="flex gap-1">
            <UiButton size="sm" variant="outline" :disabled="portalPage <= 1 || portalLoading" @click="goPortal(-1)">
              Prev
            </UiButton>
            <UiButton size="sm" variant="outline" :disabled="portalPage >= portalPageCount || portalLoading" @click="goPortal(1)">
              Next
            </UiButton>
          </div>
        </div>
      </template>
    </UiDialogContent>
  </UiDialog>
</template>
