<script lang="ts" setup>
import { onMounted, ref, computed, watch } from 'vue'
import { Loader2, ImageOff, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import type { Accessory, AccessoryModel, VehicleModel } from '@/composables/use-oem-data'

const { fetchAccessories, fetchAccessoryModels, fetchVehicleModels, fetchOems } = useOemData()

const accessories = ref<Accessory[]>([])
const accessoryModels = ref<AccessoryModel[]>([])
const models = ref<VehicleModel[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)

const filterOem = ref('all')
const filterCategory = ref('all')
const filterModel = ref('all')
const searchQuery = ref('')
const sortBy = ref<'name' | 'price-asc' | 'price-desc'>('name')
const viewMode = ref<'table' | 'grid'>('table')

const page = ref(1)
const pageSize = ref(50)
const PAGE_SIZES = [25, 50, 100, 200]

onMounted(async () => {
  try {
    const [a, am, m, o] = await Promise.all([
      fetchAccessories(),
      fetchAccessoryModels(),
      fetchVehicleModels(),
      fetchOems(),
    ])
    accessories.value = a
    accessoryModels.value = am
    models.value = m
    oems.value = o
  }
  finally {
    loading.value = false
  }
})

// ── Computed data ──────────────────────────────────────────────────────────

const oemsWithAccessories = computed(() => {
  const oemIds = new Set(accessories.value.map(a => a.oem_id))
  return oems.value.filter(o => oemIds.has(o.id))
})

const categories = computed(() => {
  const cats = new Set<string>()
  accessories.value.forEach(a => { if (a.category) cats.add(a.category) })
  return [...cats].sort()
})

const modelMap = computed(() => {
  const map = new Map<string, VehicleModel>()
  models.value.forEach(m => map.set(m.id, m))
  return map
})

const accessoryModelMap = computed(() => {
  const map = new Map<string, string[]>()
  accessoryModels.value.forEach(am => {
    if (!map.has(am.accessory_id)) map.set(am.accessory_id, [])
    map.get(am.accessory_id)!.push(am.model_id)
  })
  return map
})

const modelsWithAccessories = computed(() => {
  const modelIds = new Set(accessoryModels.value.map(am => am.model_id))
  return models.value
    .filter(m => modelIds.has(m.id))
    .sort((a, b) => {
      const oemCmp = a.oem_id.localeCompare(b.oem_id)
      return oemCmp !== 0 ? oemCmp : a.name.localeCompare(b.name)
    })
})

// Reverse map: model_id → Set of accessory_ids
const modelAccessoryMap = computed(() => {
  const map = new Map<string, Set<string>>()
  accessoryModels.value.forEach(am => {
    if (!map.has(am.model_id)) map.set(am.model_id, new Set())
    map.get(am.model_id)!.add(am.accessory_id)
  })
  return map
})

const filtered = computed(() => {
  let list = accessories.value

  if (filterOem.value !== 'all') {
    list = list.filter(a => a.oem_id === filterOem.value)
  }
  if (filterCategory.value !== 'all') {
    list = list.filter(a => a.category === filterCategory.value)
  }
  if (filterModel.value !== 'all') {
    const accIds = modelAccessoryMap.value.get(filterModel.value)
    if (accIds) {
      list = list.filter(a => accIds.has(a.id))
    } else {
      list = []
    }
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.part_number?.toLowerCase().includes(q) ||
      a.category?.toLowerCase().includes(q)
    )
  }

  if (sortBy.value === 'price-asc') {
    list = [...list].sort((a, b) => (a.price ?? 99999) - (b.price ?? 99999))
  } else if (sortBy.value === 'price-desc') {
    list = [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
  } else {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name))
  }

  return list
})

// Reset to page 1 when any filter/search/sort changes
watch([filterOem, filterCategory, filterModel, searchQuery, sortBy, pageSize], () => { page.value = 1 })

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))

const paginatedItems = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

// ── OEM summary stats ──────────────────────────────────────────────────────

const oemStats = computed(() => {
  const stats: Record<string, { count: number, withPrice: number, minPrice: number, maxPrice: number, categories: Set<string>, modelLinks: number }> = {}
  accessories.value.forEach(a => {
    if (!stats[a.oem_id]) stats[a.oem_id] = { count: 0, withPrice: 0, minPrice: Infinity, maxPrice: 0, categories: new Set(), modelLinks: 0 }
    const s = stats[a.oem_id]
    s.count++
    if (a.price) {
      s.withPrice++
      s.minPrice = Math.min(s.minPrice, a.price)
      s.maxPrice = Math.max(s.maxPrice, a.price)
    }
    if (a.category) s.categories.add(a.category)
  })
  accessoryModels.value.forEach(am => {
    const acc = accessories.value.find(a => a.id === am.accessory_id)
    if (acc && stats[acc.oem_id]) stats[acc.oem_id].modelLinks++
  })
  return stats
})

// ── Helpers ────────────────────────────────────────────────────────────────

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function formatPrice(amount: number | null) {
  if (!amount) return '-'
  return `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function modelNamesForAccessory(accId: string) {
  const modelIds = accessoryModelMap.value.get(accId) || []
  return modelIds
    .map(id => modelMap.value.get(id)?.name)
    .filter(Boolean)
    .join(', ')
}

function fittingLabel(val: string | null) {
  if (val === 'includes') return 'Inc. fitting'
  if (val === 'excludes') return 'Parts only'
  return null
}
</script>

<template>
  <BasicPage title="Accessories Catalog" description="Genuine accessories across all OEMs with pricing intelligence" sticky>
    <!-- OEM Summary Cards -->
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-6">
      <UiCard
        v-for="oem in oemsWithAccessories"
        :key="oem.id"
        class="cursor-pointer transition-colors"
        :class="filterOem === oem.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'"
        @click="filterOem = filterOem === oem.id ? 'all' : oem.id"
      >
        <UiCardContent class="p-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold">{{ oemName(oem.id) }}</h3>
            <UiBadge variant="secondary" class="text-xs">
              {{ oemStats[oem.id]?.count ?? 0 }}
            </UiBadge>
          </div>
          <div v-if="oemStats[oem.id]" class="space-y-1">
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>Price range</span>
              <span v-if="oemStats[oem.id].withPrice" class="font-medium text-foreground">
                {{ formatPrice(oemStats[oem.id].minPrice) }} – {{ formatPrice(oemStats[oem.id].maxPrice) }}
              </span>
              <span v-else>No pricing</span>
            </div>
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>Categories</span>
              <span>{{ oemStats[oem.id].categories.size }}</span>
            </div>
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>Model links</span>
              <span>{{ oemStats[oem.id].modelLinks || 'N/A' }}</span>
            </div>
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <UiSelect v-model="filterOem">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="Filter by OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All OEMs</UiSelectItem>
          <UiSelectItem v-for="oem in oemsWithAccessories" :key="oem.id" :value="oem.id">
            {{ oemName(oem.id) }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect v-model="filterCategory">
        <UiSelectTrigger class="w-[200px]">
          <UiSelectValue placeholder="Filter by category" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Categories</UiSelectItem>
          <UiSelectItem v-for="cat in categories" :key="cat" :value="cat">
            {{ cat }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect v-model="filterModel">
        <UiSelectTrigger class="w-[200px]">
          <UiSelectValue placeholder="Filter by model" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Models</UiSelectItem>
          <UiSelectItem v-for="m in modelsWithAccessories" :key="m.id" :value="m.id">
            {{ oemName(m.oem_id) }} {{ m.name }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect v-model="sortBy">
        <UiSelectTrigger class="w-[160px]">
          <UiSelectValue placeholder="Sort by" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="name">Name A-Z</UiSelectItem>
          <UiSelectItem value="price-asc">Price: Low-High</UiSelectItem>
          <UiSelectItem value="price-desc">Price: High-Low</UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <div class="relative flex-1 min-w-[200px] max-w-sm">
        <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <UiInput
          v-model="searchQuery"
          placeholder="Search name, part number..."
          class="pl-9"
        />
      </div>

      <div class="flex gap-1 ml-auto">
        <UiButton
          variant="ghost"
          size="sm"
          :class="viewMode === 'table' ? 'bg-muted' : ''"
          @click="viewMode = 'table'"
        >
          Table
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          :class="viewMode === 'grid' ? 'bg-muted' : ''"
          @click="viewMode = 'grid'"
        >
          Grid
        </UiButton>
      </div>

      <span class="text-sm text-muted-foreground whitespace-nowrap">
        {{ filtered.length }} of {{ accessories.length }} accessories
      </span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <!-- Table View -->
    <UiCard v-else-if="viewMode === 'table'">
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="w-[50px]" />
            <UiTableHead>Name</UiTableHead>
            <UiTableHead>OEM</UiTableHead>
            <UiTableHead>Category</UiTableHead>
            <UiTableHead>Part #</UiTableHead>
            <UiTableHead class="text-right">Price</UiTableHead>
            <UiTableHead>Fitting</UiTableHead>
            <UiTableHead>Models</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow v-for="acc in paginatedItems" :key="acc.id">
            <UiTableCell>
              <div class="size-8 rounded border overflow-hidden bg-muted flex items-center justify-center shrink-0">
                <img
                  v-if="acc.image_url"
                  :src="acc.image_url"
                  :alt="acc.name"
                  class="size-8 object-cover"
                  loading="lazy"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                />
                <ImageOff v-else class="size-3 text-muted-foreground" />
              </div>
            </UiTableCell>
            <UiTableCell>
              <div class="font-medium text-sm max-w-[250px] truncate" :title="acc.name">
                {{ acc.name }}
              </div>
              <p v-if="acc.description_html && acc.description_html !== acc.name" class="text-xs text-muted-foreground max-w-[250px] truncate">
                {{ acc.description_html.replace(/<[^>]+>/g, '') }}
              </p>
            </UiTableCell>
            <UiTableCell class="text-sm whitespace-nowrap">
              {{ oemName(acc.oem_id) }}
            </UiTableCell>
            <UiTableCell>
              <UiBadge v-if="acc.category" variant="outline" class="text-xs whitespace-nowrap">
                {{ acc.category }}
              </UiBadge>
              <span v-else class="text-muted-foreground">-</span>
            </UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">
              {{ acc.part_number ?? '-' }}
            </UiTableCell>
            <UiTableCell class="text-right font-medium whitespace-nowrap">
              {{ formatPrice(acc.price) }}
            </UiTableCell>
            <UiTableCell>
              <UiBadge v-if="fittingLabel(acc.inc_fitting)" variant="secondary" class="text-[10px]">
                {{ fittingLabel(acc.inc_fitting) }}
              </UiBadge>
            </UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground max-w-[180px] truncate" :title="modelNamesForAccessory(acc.id)">
              {{ modelNamesForAccessory(acc.id) || '-' }}
            </UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>

      <!-- Pagination -->
      <div class="flex items-center justify-between px-4 py-2 border-t">
        <div class="text-sm text-muted-foreground">
          {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, filtered.length) }} of {{ filtered.length }}
        </div>
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium hidden md:block">Rows per page</span>
            <UiSelect :model-value="`${pageSize}`" @update:model-value="(v: string) => pageSize = Number(v)">
              <UiSelectTrigger class="h-8 w-[70px]">
                <UiSelectValue :placeholder="`${pageSize}`" />
              </UiSelectTrigger>
              <UiSelectContent side="top">
                <UiSelectItem v-for="size in PAGE_SIZES" :key="size" :value="`${size}`">
                  {{ size }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div class="text-sm font-medium w-[100px] text-center">
            Page {{ page }} of {{ totalPages }}
          </div>
          <div class="flex items-center gap-1">
            <UiButton variant="outline" class="hidden size-8 p-0 lg:flex" :disabled="page <= 1" @click="page = 1">
              <ChevronsLeft class="size-4" />
            </UiButton>
            <UiButton variant="outline" class="size-8 p-0" :disabled="page <= 1" @click="page--">
              <ChevronLeft class="size-4" />
            </UiButton>
            <UiButton variant="outline" class="size-8 p-0" :disabled="page >= totalPages" @click="page++">
              <ChevronRight class="size-4" />
            </UiButton>
            <UiButton variant="outline" class="hidden size-8 p-0 lg:flex" :disabled="page >= totalPages" @click="page = totalPages">
              <ChevronsRight class="size-4" />
            </UiButton>
          </div>
        </div>
      </div>
    </UiCard>

    <!-- Grid View -->
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <UiCard v-for="acc in paginatedItems" :key="acc.id" class="overflow-hidden">
          <div class="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
            <img
              v-if="acc.image_url"
              :src="acc.image_url"
              :alt="acc.name"
              class="w-full h-full object-contain p-2"
              loading="lazy"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
            <ImageOff v-else class="size-8 text-muted-foreground/30" />
          </div>
          <UiCardContent class="p-3">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="text-sm font-semibold leading-tight line-clamp-2">{{ acc.name }}</h3>
              <span class="text-sm font-bold whitespace-nowrap" :class="acc.price ? 'text-foreground' : 'text-muted-foreground'">
                {{ formatPrice(acc.price) }}
              </span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap mt-2">
              <UiBadge variant="outline" class="text-[10px]">{{ oemName(acc.oem_id) }}</UiBadge>
              <UiBadge v-if="acc.category" variant="secondary" class="text-[10px]">{{ acc.category }}</UiBadge>
              <UiBadge v-if="fittingLabel(acc.inc_fitting)" variant="secondary" class="text-[10px]">
                {{ fittingLabel(acc.inc_fitting) }}
              </UiBadge>
            </div>
            <p v-if="acc.part_number" class="text-[10px] text-muted-foreground font-mono mt-1.5">
              {{ acc.part_number }}
            </p>
            <p v-if="modelNamesForAccessory(acc.id)" class="text-[10px] text-muted-foreground mt-1 truncate" :title="modelNamesForAccessory(acc.id)">
              {{ modelNamesForAccessory(acc.id) }}
            </p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Grid Pagination -->
      <div class="flex items-center justify-between px-2 py-3 mt-3">
        <div class="text-sm text-muted-foreground">
          {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, filtered.length) }} of {{ filtered.length }}
        </div>
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium hidden md:block">Per page</span>
            <UiSelect :model-value="`${pageSize}`" @update:model-value="(v: string) => pageSize = Number(v)">
              <UiSelectTrigger class="h-8 w-[70px]">
                <UiSelectValue :placeholder="`${pageSize}`" />
              </UiSelectTrigger>
              <UiSelectContent side="top">
                <UiSelectItem v-for="size in PAGE_SIZES" :key="size" :value="`${size}`">
                  {{ size }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div class="text-sm font-medium w-[100px] text-center">
            Page {{ page }} of {{ totalPages }}
          </div>
          <div class="flex items-center gap-1">
            <UiButton variant="outline" class="hidden size-8 p-0 lg:flex" :disabled="page <= 1" @click="page = 1">
              <ChevronsLeft class="size-4" />
            </UiButton>
            <UiButton variant="outline" class="size-8 p-0" :disabled="page <= 1" @click="page--">
              <ChevronLeft class="size-4" />
            </UiButton>
            <UiButton variant="outline" class="size-8 p-0" :disabled="page >= totalPages" @click="page++">
              <ChevronRight class="size-4" />
            </UiButton>
            <UiButton variant="outline" class="hidden size-8 p-0 lg:flex" :disabled="page >= totalPages" @click="page = totalPages">
              <ChevronsRight class="size-4" />
            </UiButton>
          </div>
        </div>
      </div>
    </template>
  </BasicPage>
</template>
