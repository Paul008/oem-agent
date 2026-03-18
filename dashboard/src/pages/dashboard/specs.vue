<script lang="ts" setup>
import { onMounted, ref, computed, watch } from 'vue'
import { Loader2, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import type { Product, VehicleModel, ProductSpecs } from '@/composables/use-oem-data'

const { fetchProducts, fetchVehicleModels, fetchOems } = useOemData()

const products = ref<Product[]>([])
const models = ref<VehicleModel[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

const filterOem = ref('all')
const filterModel = ref('all')
const filterFuel = ref('all')
const filterBody = ref('all')
const filterCategory = ref('all')
const searchQuery = ref('')
const sortBy = ref<'title' | 'price-asc' | 'price-desc' | 'oem'>('oem')

const page = ref(1)
const pageSize = ref(50)
const PAGE_SIZES = [25, 50, 100, 200]

const expandedSpecs = ref<Set<string>>(new Set())

onMounted(async () => {
  try {
    const [p, m, o] = await Promise.all([fetchProducts(), fetchVehicleModels(), fetchOems()])
    products.value = p
    models.value = m
    oems.value = o
  } catch (err: any) {
    loadError.value = err.message || 'Failed to load specifications data'
    toast.error(loadError.value!)
  } finally {
    loading.value = false
  }
})

// ── Lookup maps ──────────────────────────────────────────────────────────────

const modelMap = computed(() => {
  const map = new Map<string, VehicleModel>()
  models.value.forEach(m => map.set(m.id, m))
  return map
})

// ── Only products with specs ─────────────────────────────────────────────────

const productsWithSpecs = computed(() =>
  products.value.filter(p => p.specs_json !== null && Object.keys(p.specs_json).length > 0),
)

// ── Filter options ───────────────────────────────────────────────────────────

const modelsForOem = computed(() => {
  if (filterOem.value === 'all') return models.value
  return models.value.filter(m => m.oem_id === filterOem.value)
})

const fuelTypes = computed(() => {
  const types = new Set<string>()
  productsWithSpecs.value.forEach(p => { if (p.fuel_type) types.add(p.fuel_type) })
  return [...types].sort()
})

const bodyTypes = computed(() => {
  const types = new Set<string>()
  productsWithSpecs.value.forEach(p => { if (p.body_type) types.add(p.body_type) })
  return [...types].sort()
})

const allCategories = computed(() => {
  const cats = new Set<string>()
  productsWithSpecs.value.forEach(p => {
    if (p.specs_json) {
      Object.keys(p.specs_json).forEach(k => {
        const section = p.specs_json![k as keyof ProductSpecs]
        if (section && Object.keys(section).length > 0) cats.add(k)
      })
    }
  })
  return [...cats].sort()
})

// ── Spec helpers ─────────────────────────────────────────────────────────────

const SPEC_CATEGORY_ORDER = ['engine', 'transmission', 'dimensions', 'performance', 'towing', 'capacity', 'safety', 'wheels']

const CATEGORY_LABELS: Record<string, string> = {
  engine: 'Engine', transmission: 'Transmission', dimensions: 'Dimensions',
  performance: 'Performance', towing: 'Towing', capacity: 'Capacity',
  safety: 'Safety', wheels: 'Wheels',
}

function orderedCategories(specs: ProductSpecs): { key: string, label: string, entries: [string, string][] }[] {
  const result: { key: string, label: string, entries: [string, string][] }[] = []
  const otherEntries: [string, string][] = []

  for (const cat of SPEC_CATEGORY_ORDER) {
    const section = specs[cat]
    if (!section) continue
    if (typeof section === 'string' || typeof section === 'number') {
      otherEntries.push([formatSpecKey(cat), String(section)])
    } else if (typeof section === 'object' && Object.keys(section).length > 0) {
      result.push({ key: cat, label: CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1), entries: Object.entries(section).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]) })
    }
  }
  for (const cat of Object.keys(specs)) {
    if (SPEC_CATEGORY_ORDER.includes(cat)) continue
    const section = specs[cat]
    if (!section) continue
    if (typeof section === 'string' || typeof section === 'number') {
      otherEntries.push([formatSpecKey(cat), String(section)])
    } else if (typeof section === 'object' && Object.keys(section).length > 0) {
      result.push({ key: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' '), entries: Object.entries(section).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]) })
    }
  }
  if (otherEntries.length > 0) {
    result.push({ key: '_other', label: 'Other', entries: otherEntries })
  }
  return result
}

function formatSpecKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')
}

function specCount(specs: ProductSpecs): number {
  let count = 0
  for (const cat of Object.keys(specs)) {
    const section = specs[cat as keyof ProductSpecs]
    if (section) count += Object.keys(section).length
  }
  return count
}

function categoryCount(specs: ProductSpecs): number {
  return orderedCategories(specs).length
}

// ── Filtered & sorted ────────────────────────────────────────────────────────

const filtered = computed(() => {
  let list = productsWithSpecs.value

  if (filterOem.value !== 'all') {
    list = list.filter(p => p.oem_id === filterOem.value)
  }
  if (filterModel.value !== 'all') {
    list = list.filter(p => p.model_id === filterModel.value)
  }
  if (filterFuel.value !== 'all') {
    list = list.filter(p => p.fuel_type === filterFuel.value)
  }
  if (filterBody.value !== 'all') {
    list = list.filter(p => p.body_type === filterBody.value)
  }
  if (filterCategory.value !== 'all') {
    list = list.filter(p => {
      if (!p.specs_json) return false
      const section = p.specs_json[filterCategory.value as keyof ProductSpecs]
      return section && Object.keys(section).length > 0
    })
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(p => {
      // Search title
      if (p.title.toLowerCase().includes(q)) return true
      if (p.variant_name?.toLowerCase().includes(q)) return true
      // Search spec keys and values
      if (p.specs_json) {
        for (const cat of Object.keys(p.specs_json)) {
          const section = p.specs_json[cat as keyof ProductSpecs]
          if (!section) continue
          for (const [key, value] of Object.entries(section)) {
            if (key.toLowerCase().includes(q) || value.toLowerCase().includes(q)) return true
          }
        }
      }
      return false
    })
  }

  if (sortBy.value === 'price-asc') {
    list = [...list].sort((a, b) => (a.price_amount ?? 99999999) - (b.price_amount ?? 99999999))
  } else if (sortBy.value === 'price-desc') {
    list = [...list].sort((a, b) => (b.price_amount ?? 0) - (a.price_amount ?? 0))
  } else if (sortBy.value === 'title') {
    list = [...list].sort((a, b) => a.title.localeCompare(b.title))
  } else {
    list = [...list].sort((a, b) => {
      const oemCmp = a.oem_id.localeCompare(b.oem_id)
      if (oemCmp !== 0) return oemCmp
      const modelA = modelMap.value.get(a.model_id ?? '')?.name ?? ''
      const modelB = modelMap.value.get(b.model_id ?? '')?.name ?? ''
      const modelCmp = modelA.localeCompare(modelB)
      return modelCmp !== 0 ? modelCmp : a.title.localeCompare(b.title)
    })
  }

  return list
})

// Reset page on filter change
watch([filterOem, filterModel, filterFuel, filterBody, filterCategory, searchQuery, sortBy, pageSize], () => { page.value = 1 })

// Reset model filter when OEM changes
watch(filterOem, () => { filterModel.value = 'all' })

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))

const paginatedItems = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function modelName(id: string | null) {
  if (!id) return '-'
  return modelMap.value.get(id)?.name ?? '-'
}

function formatPrice(amount: number | null) {
  if (!amount) return '-'
  return `$${Math.round(amount).toLocaleString()}`
}

function toggleSpecs(id: string) {
  if (expandedSpecs.value.has(id)) {
    expandedSpecs.value.delete(id)
  } else {
    expandedSpecs.value.add(id)
  }
}

// ── Coverage stats ───────────────────────────────────────────────────────────

const uniqueCategories = computed(() => {
  const cats = new Set<string>()
  filtered.value.forEach(p => {
    if (p.specs_json) {
      Object.keys(p.specs_json).forEach(k => {
        const section = p.specs_json![k as keyof ProductSpecs]
        if (section && Object.keys(section).length > 0) cats.add(k)
      })
    }
  })
  return cats.size
})

const avgSpecsPerProduct = computed(() => {
  if (filtered.value.length === 0) return 0
  const total = filtered.value.reduce((sum, p) => sum + (p.specs_json ? specCount(p.specs_json) : 0), 0)
  return Math.round(total / filtered.value.length)
})
</script>

<template>
  <BasicPage title="Specifications" description="Browse vehicle specifications across all OEMs" sticky>
    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <UiSelect v-model="filterOem">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="All OEMs" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All OEMs</UiSelectItem>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect v-model="filterModel">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="All Models" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Models</UiSelectItem>
          <UiSelectItem v-for="m in modelsForOem" :key="m.id" :value="m.id">
            {{ m.name }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect v-model="filterFuel">
        <UiSelectTrigger class="w-[140px]">
          <UiSelectValue placeholder="All Fuels" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Fuels</UiSelectItem>
          <UiSelectItem v-for="ft in fuelTypes" :key="ft" :value="ft">{{ ft }}</UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect v-model="filterBody">
        <UiSelectTrigger class="w-[140px]">
          <UiSelectValue placeholder="All Body Types" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Body Types</UiSelectItem>
          <UiSelectItem v-for="bt in bodyTypes" :key="bt" :value="bt">{{ bt }}</UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect v-model="filterCategory">
        <UiSelectTrigger class="w-[160px]">
          <UiSelectValue placeholder="All Categories" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Categories</UiSelectItem>
          <UiSelectItem v-for="cat in allCategories" :key="cat" :value="cat">{{ categoryLabel(cat) }}</UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <div class="relative">
        <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <UiInput
          v-model="searchQuery"
          placeholder="Search specs..."
          class="pl-9 w-[200px]"
        />
      </div>

      <UiSelect v-model="sortBy">
        <UiSelectTrigger class="w-[150px]">
          <UiSelectValue placeholder="Sort by" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="oem">OEM / Model</UiSelectItem>
          <UiSelectItem value="title">Name A-Z</UiSelectItem>
          <UiSelectItem value="price-asc">Price Low-High</UiSelectItem>
          <UiSelectItem value="price-desc">Price High-Low</UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <span class="text-sm text-muted-foreground ml-auto">
        {{ filtered.length }} / {{ products.length }} products with specs
        &middot; {{ uniqueCategories }} categories
        &middot; ~{{ avgSpecsPerProduct }} specs/product
      </span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <div v-else-if="loadError" class="flex flex-col items-center justify-center h-64 gap-2">
      <AlertTriangle class="size-8 text-destructive" />
      <p class="text-sm text-muted-foreground">{{ loadError }}</p>
    </div>

    <!-- Table View -->
    <UiCard v-else>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead>OEM</UiTableHead>
            <UiTableHead>Model</UiTableHead>
            <UiTableHead>Variant</UiTableHead>
            <UiTableHead class="text-right">Price</UiTableHead>
            <UiTableHead class="text-center">Categories</UiTableHead>
            <UiTableHead class="text-center">Total Specs</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <template v-for="product in paginatedItems" :key="product.id">
            <UiTableRow
              class="cursor-pointer group"
              @click="toggleSpecs(product.id)"
            >
              <UiTableCell class="text-sm">{{ oemName(product.oem_id) }}</UiTableCell>
              <UiTableCell class="text-sm font-medium">{{ modelName(product.model_id) }}</UiTableCell>
              <UiTableCell>
                <span class="text-sm font-medium">{{ product.variant_name || product.subtitle || product.title }}</span>
                <p v-if="product.variant_code" class="text-xs text-muted-foreground mt-0.5">{{ product.variant_code }}</p>
              </UiTableCell>
              <UiTableCell class="text-right font-medium text-sm">{{ formatPrice(product.price_amount) }}</UiTableCell>
              <UiTableCell class="text-center">
                <button
                  class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950 transition-colors"
                  @click.stop="toggleSpecs(product.id)"
                >
                  <component :is="expandedSpecs.has(product.id) ? ChevronUp : ChevronDown" class="size-3" />
                  {{ categoryCount(product.specs_json!) }}
                </button>
              </UiTableCell>
              <UiTableCell class="text-center text-sm">
                {{ specCount(product.specs_json!) }}
              </UiTableCell>
            </UiTableRow>
            <!-- Expandable Specs -->
            <UiTableRow v-if="expandedSpecs.has(product.id)" class="bg-muted/30 hover:bg-muted/40">
              <UiTableCell :colspan="6" class="p-0">
                <div class="px-6 py-4">
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div
                      v-for="category in orderedCategories(product.specs_json!)"
                      :key="category.key"
                      class="rounded-md bg-muted/50 p-3"
                    >
                      <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {{ category.label }}
                      </h4>
                      <dl class="space-y-1">
                        <div
                          v-for="[key, value] in category.entries"
                          :key="key"
                          class="flex justify-between gap-2 text-xs"
                        >
                          <dt class="text-muted-foreground shrink-0">{{ formatSpecKey(key) }}</dt>
                          <dd class="text-right font-medium truncate" :title="value">{{ value }}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              </UiTableCell>
            </UiTableRow>
          </template>
          <UiTableRow v-if="paginatedItems.length === 0">
            <UiTableCell :colspan="6" class="text-center text-muted-foreground py-8">
              No products with specifications found matching your filters
            </UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>

      <!-- Pagination -->
      <div class="flex items-center justify-between border-t px-4 py-3">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <UiSelect v-model="pageSize">
            <UiSelectTrigger class="w-[70px] h-8">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
          <span>{{ (page - 1) * pageSize + 1 }}-{{ Math.min(page * pageSize, filtered.length) }} of {{ filtered.length }}</span>
        </div>
        <div class="flex items-center gap-1">
          <UiButton variant="outline" size="icon" class="size-8" :disabled="page <= 1" @click="page = 1">
            <ChevronsLeft class="size-4" />
          </UiButton>
          <UiButton variant="outline" size="icon" class="size-8" :disabled="page <= 1" @click="page--">
            <ChevronLeft class="size-4" />
          </UiButton>
          <span class="text-sm px-2">{{ page }} / {{ totalPages }}</span>
          <UiButton variant="outline" size="icon" class="size-8" :disabled="page >= totalPages" @click="page++">
            <ChevronRight class="size-4" />
          </UiButton>
          <UiButton variant="outline" size="icon" class="size-8" :disabled="page >= totalPages" @click="page = totalPages">
            <ChevronsRight class="size-4" />
          </UiButton>
        </div>
      </div>
    </UiCard>
  </BasicPage>
</template>
