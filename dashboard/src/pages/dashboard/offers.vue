<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Loader2, Calendar, Search, ChevronLeft, ChevronRight, Tag, ImageOff, Clock, RefreshCw } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { useRealtimeSubscription } from '@/composables/use-realtime'
import type { Offer } from '@/composables/use-oem-data'

const { fetchOffers, fetchOems } = useOemData()

const offers = ref<Offer[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)
const filterOem = ref('all')
const searchQuery = ref('')
const page = ref(1)
const perPage = ref(24)

onMounted(async () => {
  try {
    const [o, oemList] = await Promise.all([fetchOffers(), fetchOems()])
    offers.value = o
    oems.value = oemList
  }
  finally {
    loading.value = false
  }
})

useRealtimeSubscription<Offer>({
  channelName: 'offers-live',
  table: 'offers',
  event: '*',
  dataRef: offers,
  maxItems: 2000,
})

const filtered = computed(() => {
  let list = offers.value
  if (filterOem.value !== 'all') {
    list = list.filter(o => o.oem_id === filterOem.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(o =>
      o.title.toLowerCase().includes(q)
      || o.description?.toLowerCase().includes(q)
      || o.offer_type?.toLowerCase().includes(q),
    )
  }
  // Sort: active first, then by updated_at descending
  return [...list].sort((a, b) => {
    const aExpired = isExpired(a) ? 1 : 0
    const bExpired = isExpired(b) ? 1 : 0
    if (aExpired !== bExpired) return aExpired - bExpired
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
})

const totalPages = computed(() => Math.ceil(filtered.value.length / perPage.value) || 1)
const paginated = computed(() => {
  const start = (page.value - 1) * perPage.value
  return filtered.value.slice(start, start + perPage.value)
})

function setFilter(oem: string) {
  filterOem.value = oem
  page.value = 1
}
function onSearch() {
  page.value = 1
}

const stats = computed(() => {
  const t = { total: offers.value.length, active: 0, expired: 0, withSaving: 0, withAbnPrice: 0 }
  for (const o of offers.value) {
    if (isExpired(o)) t.expired++
    else t.active++
    if (o.saving_amount) t.withSaving++
    if (o.abn_price_amount && o.abn_price_amount !== o.price_amount) t.withAbnPrice++
  }
  return t
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function formatPrice(amount: number | null) {
  if (!amount) return '-'
  return `$${Math.round(amount).toLocaleString()}`
}

function isExpired(offer: Offer) {
  if (!offer.validity_end) return false
  return new Date(offer.validity_end) < new Date()
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'never'
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
</script>

<template>
  <BasicPage title="Offers" description="Active and recent promotions across OEMs" sticky>
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
          placeholder="Search offers..."
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
        {{ filtered.length }} offers
      </span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Summary Stats -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Total</UiCardTitle>
            <Tag class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.total }}</div>
            <p class="text-xs text-muted-foreground">All offers</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Active</UiCardTitle>
            <Tag class="size-4 text-green-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-green-500">{{ stats.active }}</div>
            <p class="text-xs text-muted-foreground">Currently valid</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Expired</UiCardTitle>
            <Tag class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold" :class="stats.expired > 0 ? 'text-yellow-500' : ''">{{ stats.expired }}</div>
            <p class="text-xs text-muted-foreground">Past end date</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">With Savings</UiCardTitle>
            <Tag class="size-4 text-blue-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.withSaving }}</div>
            <p class="text-xs text-muted-foreground">Have saving amount</p>
          </UiCardContent>
        </UiCard>
        <UiCard v-if="stats.withAbnPrice > 0">
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">ABN Pricing</UiCardTitle>
            <Tag class="size-4 text-blue-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-blue-500">{{ stats.withAbnPrice }}</div>
            <p class="text-xs text-muted-foreground">Different ABN price</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Offers Grid -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <UiCard
          v-for="offer in paginated"
          :key="offer.id"
          class="overflow-hidden flex flex-col !py-0"
          :class="{ 'opacity-50': isExpired(offer) }"
        >
          <!-- Hero Image Area -->
          <div class="aspect-[16/10] relative bg-muted overflow-hidden">
            <img
              v-if="offer.hero_image_r2_key"
              :src="offer.hero_image_r2_key"
              :alt="offer.title"
              class="w-full h-full object-contain transition-opacity duration-200"
              loading="lazy"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <ImageOff class="size-8 text-muted-foreground/20" />
            </div>
            <!-- OEM badge -->
            <div class="absolute top-2 left-2">
              <span class="bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                {{ oemName(offer.oem_id) }}
              </span>
            </div>
            <!-- Savings badge -->
            <div v-if="offer.saving_amount" class="absolute top-2 right-2">
              <span class="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                Save {{ formatPrice(offer.saving_amount) }}
              </span>
            </div>
            <!-- Price badges -->
            <div v-if="offer.price_amount || offer.abn_price_amount" class="absolute bottom-2 left-2 flex flex-col gap-0.5">
              <span v-if="offer.price_amount" class="bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                Private {{ formatPrice(offer.price_amount) }}
              </span>
              <span v-if="offer.abn_price_amount && offer.abn_price_amount !== offer.price_amount" class="bg-blue-600/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                ABN {{ formatPrice(offer.abn_price_amount) }}
              </span>
            </div>
            <!-- Expired badge -->
            <div v-if="isExpired(offer)" class="absolute bottom-2 right-2">
              <span class="bg-red-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                Expired
              </span>
            </div>
          </div>

          <!-- Card Body -->
          <div class="p-3 flex flex-col gap-2 flex-1">
            <!-- Title + type -->
            <div class="flex items-start justify-between gap-2">
              <h3 class="text-sm font-semibold leading-tight line-clamp-2 min-w-0 flex-1">{{ offer.title }}</h3>
              <UiBadge v-if="offer.offer_type" variant="secondary" class="text-[10px] shrink-0">
                {{ offer.offer_type }}
              </UiBadge>
            </div>

            <!-- Description -->
            <p v-if="offer.description" class="text-xs text-muted-foreground line-clamp-2">
              {{ offer.description }}
            </p>

            <!-- Spacer -->
            <div class="flex-1" />

            <!-- Validity -->
            <div v-if="offer.validity_start || offer.validity_end || offer.validity_raw" class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Calendar class="size-3 shrink-0" />
              <span v-if="offer.validity_raw" class="truncate">{{ offer.validity_raw }}</span>
              <span v-else class="truncate">
                {{ formatDate(offer.validity_start) }} - {{ formatDate(offer.validity_end) }}
              </span>
            </div>

            <!-- Timestamps -->
            <div class="flex items-center justify-between text-[10px] text-muted-foreground/60 gap-2">
              <span class="flex items-center gap-1" :title="`Last crawl saw this offer: ${offer.last_seen_at}`">
                <RefreshCw class="size-2.5" />
                Seen {{ timeAgo(offer.last_seen_at) }}
              </span>
              <span class="flex items-center gap-1" :title="`Content last changed: ${offer.updated_at}`">
                <Clock class="size-2.5" />
                Updated {{ timeAgo(offer.updated_at) }}
              </span>
            </div>
          </div>
        </UiCard>
      </div>

      <!-- Empty state -->
      <div v-if="filtered.length === 0" class="text-center py-16">
        <Tag class="size-10 text-muted-foreground/30 mx-auto mb-3" />
        <p class="text-sm text-muted-foreground">No offers found matching your filters</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between mt-6 pt-4 border-t">
        <p class="text-sm text-muted-foreground">
          Page {{ page }} of {{ totalPages }}
          <span class="text-muted-foreground/60">({{ filtered.length }} offers)</span>
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
