<script lang="ts" setup>
import { onMounted, ref, computed, reactive } from 'vue'
import { Loader2, Palette, Image, ImageOff, ChevronLeft, ChevronRight, X, Search, RotateCw } from 'lucide-vue-next'


import { BasicPage } from '@/components/global-layout'
import Vehicle360Viewer from '@/components/Vehicle360Viewer.vue'
import { useOemData } from '@/composables/use-oem-data'
import type { VariantColor } from '@/composables/use-oem-data'

type ColorWithOem = VariantColor & { products: { oem_id: string; title: string; price_amount: number | null } }

interface VariantCard {
  productId: string
  productTitle: string
  oemId: string
  priceAmount: number | null
  colors: ColorWithOem[]
  heroCount: number
  swatchCount: number
  galleryCount: number
}

// OEM-specific URL resolution for relative image paths (fallback for non-proxied URLs)
const IMAGE_RESOLVERS: Record<string, (path: string) => string> = {
  'kgm-au': (path) =>
    `https://kgm.com.au/_next/image?url=${encodeURIComponent('https://payloadb.therefinerydesign.com' + path)}&w=828&q=75`,
}

const { fetchOems, fetchVariantColorsWithProducts } = useOemData()

const allColors = ref<ColorWithOem[]>([])
const oems = ref<{ id: string; name: string }[]>([])
const loading = ref(true)
const filterOem = ref('all')
const searchQuery = ref('')
const page = ref(1)
const perPage = ref(24)
const previewUrl = ref<string | null>(null)
const previewName = ref('')
const previewGallery = ref<string[]>([])

// Track selected color per card
const selectedColor = reactive<Record<string, string>>({})

// Track broken images
const brokenImages = reactive<Set<string>>(new Set())

onMounted(async () => {
  try {
    const [o, c] = await Promise.all([
      fetchOems(),
      fetchVariantColorsWithProducts(),
    ])
    oems.value = o
    allColors.value = c
  } finally {
    loading.value = false
  }
})

function resolveUrl(url: string | null, oemId: string): string | null {
  if (!url) return null
  if (url.startsWith('http')) return url
  const resolver = IMAGE_RESOLVERS[oemId]
  return resolver ? resolver(url) : url
}

function onImgError(colorId: string) {
  brokenImages.add(colorId)
}

function isImageBroken(colorId: string) {
  return brokenImages.has(colorId)
}

// Group colors by product
const variantCards = computed((): VariantCard[] => {
  const map = new Map<string, VariantCard>()
  for (const c of allColors.value) {
    const pid = c.product_id
    if (!map.has(pid)) {
      map.set(pid, {
        productId: pid,
        productTitle: c.products.title,
        oemId: c.products.oem_id,
        priceAmount: c.products.price_amount,
        colors: [],
        heroCount: 0,
        swatchCount: 0,
        galleryCount: 0,
      })
    }
    const card = map.get(pid)!
    card.colors.push(c)
    if (c.hero_image_url) card.heroCount++
    if (c.swatch_url) card.swatchCount++
    if (c.gallery_urls?.length) card.galleryCount++
  }
  for (const card of map.values()) {
    card.colors.sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
  }
  return Array.from(map.values()).sort((a, b) => b.colors.length - a.colors.length)
})

// Apply filters
const filteredCards = computed(() => {
  let cards = variantCards.value
  if (filterOem.value !== 'all') {
    cards = cards.filter(c => c.oemId === filterOem.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    cards = cards.filter(c =>
      c.productTitle.toLowerCase().includes(q)
      || c.colors.some(color => color.color_name.toLowerCase().includes(q)),
    )
  }
  return cards
})

// Pagination
const totalPages = computed(() => Math.ceil(filteredCards.value.length / perPage.value) || 1)
const paginatedCards = computed(() => {
  const start = (page.value - 1) * perPage.value
  return filteredCards.value.slice(start, start + perPage.value)
})

function setFilter(oem: string) {
  filterOem.value = oem
  page.value = 1
}
function onSearch() {
  page.value = 1
}

// Coverage stats
const totalStats = computed(() => {
  const t = { total: 0, variants: 0, swatch: 0, hero: 0, gallery: 0, broken: 0, noImage: 0 }
  for (const card of filteredCards.value) {
    t.variants++
    for (const c of card.colors) {
      t.total++
      if (c.swatch_url) t.swatch++
      if (c.hero_image_url) t.hero++
      if (c.gallery_urls?.length) t.gallery++
      const resolvedHero = resolveUrl(c.hero_image_url, card.oemId)
      const resolvedSwatch = resolveUrl(c.swatch_url, card.oemId)
      if (isImageBroken(`hero-${c.id}`) || isImageBroken(`swatch-${c.id}`)) {
        t.broken++
      }
      if (!resolvedHero && !resolvedSwatch) {
        t.noImage++
      }
    }
  }
  return t
})

function getSelected(card: VariantCard): ColorWithOem {
  const selId = selectedColor[card.productId]
  if (selId) {
    const found = card.colors.find(c => c.id === selId)
    if (found) return found
  }
  return card.colors.find(c => c.hero_image_url) || card.colors[0]
}

function selectColor(productId: string, colorId: string) {
  selectedColor[productId] = colorId
}

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function pct(n: number, total: number) {
  return total ? Math.round((n / total) * 100) : 0
}

function formatPrice(amount: number | null) {
  if (!amount) return null
  return `$${Math.round(amount).toLocaleString()}`
}

function fallbackHex(name: string) {
  const n = (name || '').toLowerCase()
  if (n.includes('white') || n.includes('pearl') || n.includes('ivory')) return '#f5f5f5'
  if (n.includes('black') || n.includes('mica') || n.includes('eclipse')) return '#1a1a1a'
  if (n.includes('grey') || n.includes('gray') || n.includes('graphite')) return '#808080'
  if (n.includes('silver') || n.includes('platinum') || n.includes('steel')) return '#c0c0c0'
  if (n.includes('blue') || n.includes('sapphire') || n.includes('denim') || n.includes('ocean')) return '#4a90d9'
  if (n.includes('red') || n.includes('ruby') || n.includes('flame') || n.includes('scarlet')) return '#d64545'
  if (n.includes('green') || n.includes('jungle') || n.includes('khaki') || n.includes('olive')) return '#45a049'
  if (n.includes('orange') || n.includes('amber') || n.includes('sunset') || n.includes('copper')) return '#e67e22'
  if (n.includes('brown') || n.includes('bronze') || n.includes('earth') || n.includes('mocha')) return '#8b4513'
  if (n.includes('yellow') || n.includes('gold') || n.includes('sand')) return '#f1c40f'
  if (n.includes('beige') || n.includes('cream') || n.includes('latte')) return '#f5f0e1'
  if (n.includes('purple') || n.includes('plum') || n.includes('violet')) return '#8e44ad'
  return '#888888'
}

function is360Url(url: string | null) {
  if (!url) return false
  // Nissan Helios: pov=E01 pattern
  if (url.includes('heliosnissan.net/iris/iris')) return true
  // Kia KWCMS: _00000 frame pattern
  if (/_\d{5}\./.test(url)) return true
  return false
}

function hasMultiAngleGallery(gallery: string[] | null | undefined) {
  return (gallery?.length ?? 0) > 1
}

function openPreview(url: string, name: string, gallery?: string[] | null) {
  previewUrl.value = url
  previewName.value = name
  previewGallery.value = gallery?.length ? gallery : []
}

function closePreview() {
  previewUrl.value = null
  previewGallery.value = []
}
</script>

<template>
  <BasicPage title="Variant Colors" description="Interactive color gallery grouped by vehicle variant" sticky>
    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <UiSelect :model-value="filterOem" @update:model-value="setFilter">
        <UiSelectTrigger class="w-[200px]">
          <UiSelectValue placeholder="Filter by OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All OEMs</UiSelectItem>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <UiInput
          v-model="searchQuery"
          placeholder="Search variant or color..."
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
        {{ totalStats.total.toLocaleString() }} colors &middot; {{ totalStats.variants }} variants
      </span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Coverage Summary -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-5 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Variants</UiCardTitle>
            <Palette class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ totalStats.variants }}</div>
            <p class="text-xs text-muted-foreground">{{ totalStats.total.toLocaleString() }} total colors</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Hero Images</UiCardTitle>
            <Image class="size-4 text-green-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ pct(totalStats.hero, totalStats.total) }}%</div>
            <p class="text-xs text-muted-foreground">{{ totalStats.hero.toLocaleString() }} of {{ totalStats.total.toLocaleString() }}</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Swatches</UiCardTitle>
            <Image class="size-4 text-blue-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ pct(totalStats.swatch, totalStats.total) }}%</div>
            <p class="text-xs text-muted-foreground">{{ totalStats.swatch.toLocaleString() }} of {{ totalStats.total.toLocaleString() }}</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">No Image</UiCardTitle>
            <ImageOff class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold" :class="totalStats.noImage > 0 ? 'text-yellow-500' : ''">{{ totalStats.noImage }}</div>
            <p class="text-xs text-muted-foreground">Missing hero &amp; swatch</p>
          </UiCardContent>
        </UiCard>
        <UiCard :class="totalStats.broken > 0 ? 'border-red-500/30' : ''">
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Broken</UiCardTitle>
            <ImageOff class="size-4" :class="totalStats.broken > 0 ? 'text-red-500' : 'text-muted-foreground'" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold" :class="totalStats.broken > 0 ? 'text-red-500' : ''">{{ totalStats.broken }}</div>
            <p class="text-xs text-muted-foreground">Failed to load</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Variant Cards Grid -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <UiCard
          v-for="card in paginatedCards"
          :key="card.productId"
          class="overflow-hidden flex flex-col !py-0"
        >
          <!-- Hero Image Area -->
          <div class="aspect-[16/10] relative bg-muted overflow-hidden">
            <!-- Resolved hero image -->
            <template v-if="resolveUrl(getSelected(card).hero_image_url, card.oemId) && !isImageBroken(`hero-${getSelected(card).id}`)">
              <img
                :key="getSelected(card).id"
                :src="resolveUrl(getSelected(card).hero_image_url, card.oemId)!"
                :alt="getSelected(card).color_name"
                class="w-full h-full object-contain transition-opacity duration-200 cursor-pointer"
                loading="lazy"
                @error="onImgError(`hero-${getSelected(card).id}`)"
                @click="openPreview(resolveUrl(getSelected(card).hero_image_url, card.oemId)!, `${getSelected(card).color_name} — ${card.productTitle}`, getSelected(card).gallery_urls)"
              />
            </template>
            <!-- Fallback: swatch image or solid color -->
            <div
              v-else
              class="w-full h-full flex items-center justify-center"
              :style="{ backgroundColor: fallbackHex(getSelected(card).color_name) }"
            >
              <img
                v-if="resolveUrl(getSelected(card).swatch_url, card.oemId) && !isImageBroken(`swatch-${getSelected(card).id}`)"
                :src="resolveUrl(getSelected(card).swatch_url, card.oemId)!"
                :alt="getSelected(card).color_name"
                class="max-w-[50%] max-h-[50%] object-contain rounded-lg"
                loading="lazy"
                @error="onImgError(`swatch-${getSelected(card).id}`)"
              />
              <div v-else class="flex flex-col items-center gap-1">
                <ImageOff class="size-6 text-white/30" />
                <span class="text-[10px] text-white/40">{{ isImageBroken(`hero-${getSelected(card).id}`) ? 'Broken' : 'No image' }}</span>
              </div>
            </div>
            <!-- OEM badge -->
            <div class="absolute top-2 left-2">
              <span class="bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                {{ oemName(card.oemId) }}
              </span>
            </div>
            <!-- Price badge -->
            <div v-if="card.priceAmount" class="absolute bottom-2 left-2">
              <span class="bg-black/60 text-white text-xs font-medium px-1.5 py-0.5 rounded">
                {{ formatPrice(card.priceAmount) }}
              </span>
            </div>
            <!-- Gallery/360 badge -->
            <div v-if="getSelected(card).gallery_urls?.length" class="absolute top-2 right-2">
              <span class="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <RotateCw class="size-2.5" />
                {{ getSelected(card).gallery_urls!.length > 1 ? `${getSelected(card).gallery_urls!.length} angles` : '360' }}
              </span>
            </div>
          </div>

          <!-- Card Body -->
          <div class="p-3 flex flex-col gap-2 flex-1">
            <!-- Title + meta -->
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-semibold truncate">{{ card.productTitle }}</h3>
                <p class="text-xs text-muted-foreground mt-0.5 truncate">
                  {{ getSelected(card).color_name }}
                  <span v-if="getSelected(card).color_type" class="opacity-60"> &middot; {{ getSelected(card).color_type }}</span>
                </p>
              </div>
              <div class="flex flex-col items-end gap-0.5 shrink-0">
                <UiBadge variant="secondary" class="text-[10px]">
                  {{ card.colors.length }} {{ card.colors.length === 1 ? 'color' : 'colors' }}
                </UiBadge>
                <span v-if="getSelected(card).price_delta" class="text-[10px] text-muted-foreground">
                  +${{ getSelected(card).price_delta!.toLocaleString() }}
                </span>
              </div>
            </div>

            <!-- Color Picker Swatches -->
            <div class="flex flex-wrap gap-1.5 mt-auto pt-1">
              <button
                v-for="color in card.colors"
                :key="color.id"
                class="size-7 rounded-full border-2 transition-all hover:scale-110 shrink-0 overflow-hidden"
                :class="[
                  getSelected(card).id === color.id
                    ? 'border-primary ring-2 ring-primary/30 scale-110'
                    : 'border-border hover:border-foreground/30',
                  isImageBroken(`swatch-${color.id}`) || (!resolveUrl(color.swatch_url, card.oemId))
                    ? '' : '',
                ]"
                :style="{ backgroundColor: fallbackHex(color.color_name) }"
                :title="`${color.color_name}${color.price_delta ? ` (+$${color.price_delta})` : ''}`"
                @click="selectColor(card.productId, color.id)"
              >
                <img
                  v-if="resolveUrl(color.swatch_url, card.oemId) && !isImageBroken(`swatch-${color.id}`)"
                  :src="resolveUrl(color.swatch_url, card.oemId)!"
                  :alt="color.color_name"
                  class="w-full h-full rounded-full object-cover"
                  loading="lazy"
                  @error="onImgError(`swatch-${color.id}`)"
                />
              </button>
            </div>
          </div>
        </UiCard>
      </div>

      <!-- Empty state -->
      <div v-if="filteredCards.length === 0" class="text-center py-16">
        <Palette class="size-10 text-muted-foreground/30 mx-auto mb-3" />
        <p class="text-sm text-muted-foreground">No variants found matching your filters</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between mt-6 pt-4 border-t">
        <p class="text-sm text-muted-foreground">
          Page {{ page }} of {{ totalPages }}
          <span class="text-muted-foreground/60">({{ filteredCards.length }} variants)</span>
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

      <!-- Image Preview Modal -->
      <Teleport to="body">
        <div
          v-if="previewUrl"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          @click.self="closePreview"
        >
          <div class="relative max-w-4xl max-h-[90vh] mx-4 w-full">
            <button
              class="absolute -top-10 right-0 text-white hover:text-white/80 z-10"
              @click="closePreview"
            >
              <X class="size-6" />
            </button>

            <!-- 360/Gallery Viewer: Helios patterns, Kia frames, or multi-angle gallery -->
            <template v-if="is360Url(previewUrl) || hasMultiAngleGallery(previewGallery)">
              <Vehicle360Viewer
                :hero-url="previewUrl!"
                :gallery-urls="previewGallery.length > 1 ? previewGallery : undefined"
                :name="previewName"
              />
            </template>

            <!-- Single image when no gallery -->
            <template v-else>
              <div class="bg-white rounded-xl p-4">
                <img
                  :src="previewUrl"
                  :alt="previewName"
                  class="max-w-full max-h-[75vh] rounded-lg object-contain mx-auto block"
                />
                <p v-if="previewName" class="text-sm text-neutral-500 mt-3 text-center">{{ previewName }}</p>
              </div>
            </template>
          </div>
        </div>
      </Teleport>
    </template>
  </BasicPage>
</template>
