<script lang="ts" setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { Loader2, Search, ChevronLeft, ChevronRight, Image, ImageOff, ExternalLink, Monitor, Smartphone, X, Play } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { useRealtimeSubscription } from '@/composables/use-realtime'
import type { Banner } from '@/composables/use-oem-data'

const { fetchBanners, fetchOems } = useOemData()

const banners = ref<Banner[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)
const filterOem = ref('all')
const filterPage = ref('all')
const searchQuery = ref('')
const page = ref(1)
const perPage = ref(24)
const previewBanner = ref<Banner | null>(null)
const previewMode = ref<'desktop' | 'mobile'>('desktop')

onMounted(async () => {
  try {
    const [b, oemList] = await Promise.all([fetchBanners(), fetchOems()])
    banners.value = b
    oems.value = oemList
  }
  finally {
    loading.value = false
  }
})

useRealtimeSubscription<Banner>({
  channelName: 'banners-live',
  table: 'banners',
  event: '*',
  dataRef: banners,
  maxItems: 2000,
})

const filtered = computed(() => {
  let list = banners.value
  if (filterOem.value !== 'all') {
    list = list.filter(b => b.oem_id === filterOem.value)
  }
  if (filterPage.value !== 'all') {
    list = list.filter(b => pageType(b) === filterPage.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(b =>
      b.headline?.toLowerCase().includes(q)
      || b.sub_headline?.toLowerCase().includes(q)
      || b.cta_text?.toLowerCase().includes(q)
      || b.page_url?.toLowerCase().includes(q),
    )
  }
  return list
})

const totalPages = computed(() => Math.ceil(filtered.value.length / perPage.value) || 1)
const paginated = computed(() => {
  const start = (page.value - 1) * perPage.value
  return filtered.value.slice(start, start + perPage.value)
})

function setFilterOem(oem: any) {
  filterOem.value = String(oem ?? 'all')
  page.value = 1
}
function setFilterPage(p: any) {
  filterPage.value = String(p ?? 'all')
  page.value = 1
}
function onSearch() {
  page.value = 1
}

function pageType(b: Banner) {
  const url = b.page_url?.toLowerCase() ?? ''
  if (url.includes('offer') || url.includes('special') || url.includes('deal')) return 'offers'
  return 'homepage'
}

function hasVideo(b: Banner) {
  return !!(b.video_url_desktop || b.video_url_mobile)
}

const stats = computed(() => {
  const t = { total: banners.value.length, homepage: 0, offers: 0, withDesktop: 0, withMobile: 0, withCta: 0, withVideo: 0 }
  for (const b of banners.value) {
    if (pageType(b) === 'homepage') t.homepage++
    else t.offers++
    if (b.image_url_desktop) t.withDesktop++
    if (b.image_url_mobile) t.withMobile++
    if (b.cta_url) t.withCta++
    if (hasVideo(b)) t.withVideo++
  }
  return t
})

const oemCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const b of banners.value) {
    counts[b.oem_id] = (counts[b.oem_id] || 0) + 1
  }
  return counts
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function displayImage(b: Banner) {
  return b.image_url_desktop || b.image_url_mobile || null
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  const now = Date.now()
  const diffH = Math.round((now - d.getTime()) / 3600000)
  if (diffH < 1) return 'just now'
  if (diffH < 24) return diffH + 'h ago'
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return diffD + 'd ago'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: diffD > 365 ? 'numeric' : undefined })
}

function openPreview(b: Banner) {
  previewBanner.value = b
  previewMode.value = 'desktop'
}

function closePreview() {
  previewBanner.value = null
  previewMode.value = 'desktop'
}

function previewImageUrl(b: Banner): string | null {
  if (previewMode.value === 'mobile' && b.image_url_mobile) return b.image_url_mobile
  return b.image_url_desktop || b.image_url_mobile || null
}

// Navigate between banners in preview
const previewIndex = computed(() => {
  if (!previewBanner.value) return -1
  return filtered.value.findIndex(b => b.id === previewBanner.value!.id)
})

function prevPreview() {
  if (previewIndex.value > 0) {
    previewBanner.value = filtered.value[previewIndex.value - 1]
  }
}

function nextPreview() {
  if (previewIndex.value < filtered.value.length - 1) {
    previewBanner.value = filtered.value[previewIndex.value + 1]
  }
}

// Global keyboard handler for preview
function onKeydown(e: KeyboardEvent) {
  if (!previewBanner.value) return
  if (e.key === 'Escape') closePreview()
  else if (e.key === 'ArrowLeft') prevPreview()
  else if (e.key === 'ArrowRight') nextPreview()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <BasicPage title="Banners" description="Homepage and offers page hero banners across OEMs" sticky>
    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <UiSelect :model-value="filterOem" @update:model-value="setFilterOem">
        <UiSelectTrigger class="w-[200px]">
          <UiSelectValue placeholder="Filter by OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All OEMs</UiSelectItem>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
            <span v-if="oemCounts[oem.id]" class="text-muted-foreground ml-1">({{ oemCounts[oem.id] }})</span>
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect :model-value="filterPage" @update:model-value="setFilterPage">
        <UiSelectTrigger class="w-[160px]">
          <UiSelectValue placeholder="Page type" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Pages</UiSelectItem>
          <UiSelectItem value="homepage">Homepage</UiSelectItem>
          <UiSelectItem value="offers">Offers</UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <UiInput
          v-model="searchQuery"
          placeholder="Search banners..."
          class="pl-8 w-[250px] h-9"
          @input="onSearch"
        />
      </div>
      <UiSelect :model-value="String(perPage)" @update:model-value="v => { perPage = Number(v); page = 1 }">
        <UiSelectTrigger class="w-[120px]">
          <UiSelectValue />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="12">12 per page</UiSelectItem>
          <UiSelectItem value="24">24 per page</UiSelectItem>
          <UiSelectItem value="48">48 per page</UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <span class="text-sm text-muted-foreground ml-auto">
        {{ filtered.length }} banners
      </span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Summary Stats -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Total</UiCardTitle>
            <Image class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.total }}</div>
            <p class="text-xs text-muted-foreground">All banners</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Homepage</UiCardTitle>
            <Monitor class="size-4 text-blue-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-blue-500">{{ stats.homepage }}</div>
            <p class="text-xs text-muted-foreground">Hero banners</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Offers</UiCardTitle>
            <Image class="size-4 text-green-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-green-500">{{ stats.offers }}</div>
            <p class="text-xs text-muted-foreground">Offers page banners</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Desktop</UiCardTitle>
            <Monitor class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.withDesktop }}</div>
            <p class="text-xs text-muted-foreground">Have desktop image</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Mobile</UiCardTitle>
            <Smartphone class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.withMobile }}</div>
            <p class="text-xs text-muted-foreground">Have mobile image</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Video</UiCardTitle>
            <Play class="size-4 text-purple-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-purple-500">{{ stats.withVideo }}</div>
            <p class="text-xs text-muted-foreground">Have video content</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Banners Grid -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <UiCard
          v-for="banner in paginated"
          :key="banner.id"
          class="overflow-hidden flex flex-col !py-0 cursor-pointer group"
          @click="openPreview(banner)"
        >
          <!-- Hero Image with Text Overlay -->
          <div class="aspect-[16/9] relative bg-muted overflow-hidden">
            <img
              v-if="displayImage(banner)"
              :src="displayImage(banner)!"
              :alt="banner.headline ?? 'Banner'"
              class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <ImageOff class="size-8 text-muted-foreground/20" />
            </div>
            <!-- OEM badge -->
            <div class="absolute top-2 left-2">
              <span class="bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                {{ oemName(banner.oem_id) }}
              </span>
            </div>
            <!-- Page type badge + video badge -->
            <div class="absolute top-2 right-2 flex items-center gap-1">
              <span
                v-if="hasVideo(banner)"
                class="bg-purple-600/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5"
              >
                <Play class="size-2.5 fill-current" /> Video
              </span>
              <span
                class="text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
                :class="pageType(banner) === 'homepage' ? 'bg-blue-600/80' : 'bg-green-600/80'"
              >
                {{ pageType(banner) === 'homepage' ? 'Homepage' : 'Offers' }}
              </span>
            </div>
            <!-- Text overlay on image -->
            <div
              v-if="banner.headline || banner.cta_text"
              class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-10 pb-3 px-3"
            >
              <h3 v-if="banner.headline" class="text-white text-sm font-bold leading-tight drop-shadow-lg line-clamp-1">
                {{ banner.headline }}
              </h3>
              <p v-if="banner.sub_headline" class="text-white/80 text-[11px] mt-0.5 drop-shadow line-clamp-1">
                {{ banner.sub_headline }}
              </p>
              <span
                v-if="banner.cta_text"
                class="inline-block mt-1.5 bg-white/90 text-black text-[10px] font-semibold px-2 py-0.5 rounded"
              >
                {{ banner.cta_text }}
              </span>
            </div>
          </div>

          <!-- Compact Card Footer -->
          <div class="px-3 py-2 flex items-center justify-between text-[10px] text-muted-foreground border-t">
            <div class="flex items-center gap-2">
              <span v-if="banner.image_url_desktop" class="flex items-center gap-0.5">
                <Monitor class="size-2.5" /> Desktop
              </span>
              <span v-if="banner.image_url_mobile" class="flex items-center gap-0.5">
                <Smartphone class="size-2.5" /> Mobile
              </span>
              <span class="text-muted-foreground/60">·</span>
              <span :title="banner.updated_at || banner.created_at || ''">
                {{ formatDate(banner.updated_at || banner.created_at) }}
              </span>
            </div>
            <span class="truncate max-w-[140px]">
              {{ banner.page_url?.replace(/^https?:\/\/[^/]+/, '') || '-' }}
            </span>
          </div>
        </UiCard>
      </div>

      <!-- Preview Dialog -->
      <Teleport to="body">
        <Transition name="fade">
          <div
            v-if="previewBanner"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            @click.self="closePreview"
          >
            <div class="relative w-full max-w-5xl mx-4">
              <!-- Close button -->
              <button
                class="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors"
                @click="closePreview"
              >
                <X class="size-6" />
              </button>

              <!-- Navigation arrows -->
              <button
                v-if="previewIndex > 0"
                class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 text-white/60 hover:text-white transition-colors"
                @click.stop="prevPreview"
              >
                <ChevronLeft class="size-8" />
              </button>
              <button
                v-if="previewIndex < filtered.length - 1"
                class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 text-white/60 hover:text-white transition-colors"
                @click.stop="nextPreview"
              >
                <ChevronRight class="size-8" />
              </button>

              <!-- Desktop / Mobile toggle -->
              <div class="flex items-center justify-center gap-1 mb-3">
                <button
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-l-md text-xs font-medium transition-colors"
                  :class="previewMode === 'desktop' ? 'bg-white text-black' : 'bg-white/10 text-white/60 hover:text-white'"
                  @click="previewMode = 'desktop'"
                >
                  <Monitor class="size-3.5" /> Desktop
                </button>
                <button
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-r-md text-xs font-medium transition-colors"
                  :class="previewMode === 'mobile'
                    ? 'bg-white text-black'
                    : previewBanner!.image_url_mobile
                      ? 'bg-white/10 text-white/60 hover:text-white'
                      : 'bg-white/5 text-white/20 cursor-not-allowed'"
                  :disabled="!previewBanner!.image_url_mobile"
                  @click="previewBanner!.image_url_mobile && (previewMode = 'mobile')"
                >
                  <Smartphone class="size-3.5" /> Mobile
                  <span v-if="!previewBanner!.image_url_mobile" class="text-[10px] text-white/30">(n/a)</span>
                </button>
              </div>

              <!-- Banner Preview -->
              <div class="rounded-lg overflow-hidden shadow-2xl">
                <div
                  :class="previewMode === 'mobile' ? 'aspect-[9/16] max-w-sm mx-auto' : 'aspect-[16/9]'"
                  class="relative bg-muted transition-all duration-300"
                >
                  <!-- Video player -->
                  <video
                    v-if="hasVideo(previewBanner)"
                    :key="previewBanner.id + previewMode"
                    class="w-full h-full object-cover"
                    autoplay
                    muted
                    loop
                    playsinline
                    :poster="previewImageUrl(previewBanner) ?? undefined"
                  >
                    <source v-if="previewMode === 'mobile' && previewBanner.video_url_mobile" :src="previewBanner.video_url_mobile" type="video/mp4" />
                    <source v-else-if="previewBanner.video_url_desktop" :src="previewBanner.video_url_desktop" type="video/mp4" />
                  </video>
                  <img
                    v-else-if="previewImageUrl(previewBanner)"
                    :key="previewMode"
                    :src="previewImageUrl(previewBanner)!"
                    :alt="previewBanner.headline ?? 'Banner'"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center bg-muted">
                    <ImageOff class="size-16 text-muted-foreground/20" />
                  </div>

                  <!-- Full-size text overlay -->
                  <div
                    v-if="previewBanner.headline || previewBanner.cta_text"
                    class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-20 pb-8 px-8"
                  >
                    <h2 v-if="previewBanner.headline" class="text-white text-3xl font-bold drop-shadow-lg">
                      {{ previewBanner.headline }}
                    </h2>
                    <p v-if="previewBanner.sub_headline" class="text-white/85 text-lg mt-1 drop-shadow">
                      {{ previewBanner.sub_headline }}
                    </p>
                    <a
                      v-if="previewBanner.cta_text"
                      :href="previewBanner.cta_url || '#'"
                      target="_blank"
                      class="inline-block mt-3 bg-white text-black text-sm font-semibold px-5 py-2 rounded hover:bg-white/90 transition-colors"
                      @click.stop
                    >
                      {{ previewBanner.cta_text }}
                    </a>
                  </div>
                </div>

                <!-- Preview metadata bar -->
                <div class="bg-card px-6 py-3 flex items-center justify-between text-sm border-t">
                  <div class="flex items-center gap-3">
                    <span class="font-medium">{{ oemName(previewBanner.oem_id) }}</span>
                    <span
                      class="text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
                      :class="pageType(previewBanner) === 'homepage' ? 'bg-blue-600' : 'bg-green-600'"
                    >
                      {{ pageType(previewBanner) === 'homepage' ? 'Homepage' : 'Offers' }}
                    </span>
                    <span v-if="hasVideo(previewBanner)" class="text-purple-500 flex items-center gap-1 text-xs font-medium">
                      <Play class="size-3 fill-current" /> Video
                    </span>
                    <span v-if="previewBanner.image_url_desktop" class="text-muted-foreground flex items-center gap-1 text-xs">
                      <Monitor class="size-3" /> Desktop
                    </span>
                    <span v-if="previewBanner.image_url_mobile" class="text-muted-foreground flex items-center gap-1 text-xs">
                      <Smartphone class="size-3" /> Mobile
                    </span>
                  </div>
                  <div class="flex items-center gap-3">
                    <a
                      v-if="previewBanner.page_url"
                      :href="previewBanner.page_url"
                      target="_blank"
                      class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      @click.stop
                    >
                      <ExternalLink class="size-3" />
                      {{ previewBanner.page_url.replace(/^https?:\/\/[^/]+/, '') || '/' }}
                    </a>
                    <span class="text-xs text-muted-foreground" :title="previewBanner.created_at || ''">
                      {{ formatDate(previewBanner.updated_at || previewBanner.created_at) }}
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {{ previewIndex + 1 }} / {{ filtered.length }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Empty state -->
      <div v-if="filtered.length === 0" class="text-center py-16">
        <Image class="size-10 text-muted-foreground/30 mx-auto mb-3" />
        <p class="text-sm text-muted-foreground">No banners found matching your filters</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between mt-6 pt-4 border-t">
        <p class="text-sm text-muted-foreground">
          Page {{ page }} of {{ totalPages }}
          <span class="text-muted-foreground/60">({{ filtered.length }} banners)</span>
        </p>
        <div class="flex items-center gap-1">
          <UiButton size="sm" variant="outline" :disabled="page <= 1" @click="page--">
            <ChevronLeft class="size-4" />
          </UiButton>
          <template v-for="p in totalPages" :key="p">
            <UiButton
              v-if="p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)"
              size="sm"
              :variant="p === page ? 'default' : 'outline'"
              class="w-9"
              @click="page = p"
            >
              {{ p }}
            </UiButton>
            <span
              v-else-if="p === page - 2 || p === page + 2"
              class="text-muted-foreground px-1"
            >...</span>
          </template>
          <UiButton size="sm" variant="outline" :disabled="page >= totalPages" @click="page++">
            <ChevronRight class="size-4" />
          </UiButton>
        </div>
      </div>
    </template>
  </BasicPage>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
