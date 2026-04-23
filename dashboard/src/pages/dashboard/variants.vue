<script lang="ts" setup>
import { onMounted, ref, computed, watch } from 'vue'
import { Loader2, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, FileText, ImageOff, LayoutGrid, LayoutList, AlertTriangle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { supabase } from '@/lib/supabase'
import type { Product, VehicleModel, ProductSpecs } from '@/composables/use-oem-data'

const { fetchProducts, fetchVehicleModels, fetchOems } = useOemData()

const products = ref<Product[]>([])
const models = ref<VehicleModel[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const heroMap = ref<Map<string, string>>(new Map())
const loading = ref(true)
const loadError = ref<string | null>(null)

const filterOem = ref('all')
const filterModel = ref('all')
const filterFuel = ref('all')
const filterBody = ref('all')
const searchQuery = ref('')
const sortBy = ref<'title' | 'price-asc' | 'price-desc' | 'oem'>('oem')
const viewMode = ref<'table' | 'card'>('table')

const page = ref(1)
const pageSize = ref(50)
const PAGE_SIZES = [25, 50, 100, 200]

const expandedSpecs = ref<Set<string>>(new Set())

async function fetchHeroImages() {
  // Fetch one hero image per product (distinct on product_id)
  const PAGE = 1000
  const map = new Map<string, string>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('variant_colors')
      .select('product_id, hero_image_url')
      .not('hero_image_url', 'is', null)
      .order('product_id')
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const row of data) {
      if (!map.has(row.product_id)) {
        map.set(row.product_id, row.hero_image_url)
      }
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return map
}

onMounted(async () => {
  try {
    const [p, m, o, heroes] = await Promise.all([fetchProducts(), fetchVehicleModels(), fetchOems(), fetchHeroImages()])
    products.value = p
    models.value = m
    oems.value = o
    heroMap.value = heroes
  } catch (err: any) {
    loadError.value = err.message || 'Failed to load variant data'
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

// ── Filter options ───────────────────────────────────────────────────────────

const modelsForOem = computed(() => {
  if (filterOem.value === 'all') return models.value
  return models.value.filter(m => m.oem_id === filterOem.value)
})

const fuelTypes = computed(() => {
  const types = new Set<string>()
  products.value.forEach(p => { if (p.fuel_type) types.add(p.fuel_type) })
  return [...types].sort()
})

const bodyTypes = computed(() => {
  const types = new Set<string>()
  products.value.forEach(p => { if (p.body_type) types.add(p.body_type) })
  return [...types].sort()
})

// ── Filtered & sorted ────────────────────────────────────────────────────────

const filtered = computed(() => {
  let list = products.value

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
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.variant_name?.toLowerCase().includes(q) ||
      p.subtitle?.toLowerCase().includes(q) ||
      p.variant_code?.toLowerCase().includes(q),
    )
  }

  if (sortBy.value === 'price-asc') {
    list = [...list].sort((a, b) => (a.price_amount ?? 99999999) - (b.price_amount ?? 99999999))
  } else if (sortBy.value === 'price-desc') {
    list = [...list].sort((a, b) => (b.price_amount ?? 0) - (a.price_amount ?? 0))
  } else if (sortBy.value === 'title') {
    list = [...list].sort((a, b) => a.title.localeCompare(b.title))
  } else {
    // default: oem → model → title
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
watch([filterOem, filterModel, filterFuel, filterBody, searchQuery, sortBy, pageSize], () => { page.value = 1 })

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

function hasSpecs(product: Product): boolean {
  return product.specs_json !== null && Object.keys(product.specs_json).length > 0
}

function toggleSpecs(id: string) {
  if (expandedSpecs.value.has(id)) {
    expandedSpecs.value.delete(id)
  } else {
    expandedSpecs.value.add(id)
  }
}

const SPEC_CATEGORY_ORDER = ['engine', 'transmission', 'dimensions', 'performance', 'towing', 'capacity', 'safety', 'wheels']

const CATEGORY_LABELS: Record<string, string> = {
  engine: 'Engine', transmission: 'Transmission', dimensions: 'Dimensions',
  performance: 'Performance', towing: 'Towing', capacity: 'Capacity',
  safety: 'Safety', wheels: 'Wheels',
}

// Keys in specs_json that aren't regular spec categories — rendered separately
const SPEC_META_KEYS = new Set(['_pdf_variant_specs'])

function orderedCategories(specs: ProductSpecs): { key: string, label: string, entries: [string, string][] }[] {
  const result: { key: string, label: string, entries: [string, string][] }[] = []
  // Collect top-level scalar values (strings, numbers) into an "other" bucket
  const otherEntries: [string, string][] = []

  for (const cat of SPEC_CATEGORY_ORDER) {
    const section = specs[cat]
    if (!section) continue
    if (typeof section === 'string' || typeof section === 'number') {
      // Top-level scalar — collect for "other" category
      otherEntries.push([formatSpecKey(cat), String(section)])
    } else if (typeof section === 'object' && Object.keys(section).length > 0) {
      result.push({ key: cat, label: CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1), entries: Object.entries(section).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]) })
    }
  }
  for (const cat of Object.keys(specs)) {
    if (SPEC_CATEGORY_ORDER.includes(cat)) continue
    if (SPEC_META_KEYS.has(cat)) continue // Rendered as its own section
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

// ── PDF variant specs (from brochure extraction) ───────────────────────────
interface PdfSpecItem {
  key: string
  label: string
  value: string
  unit?: string | null
}
interface PdfSpecCategory {
  name: string
  specs: PdfSpecItem[]
}
interface PdfVariantSpecs {
  variant_name?: string
  match_confidence?: number
  extracted_at?: string
  categories?: PdfSpecCategory[]
}

function isSpecUnavailable(v: unknown): boolean {
  if (v == null) return true
  const s = String(v).trim().toLowerCase()
  return s === '' || s === '—' || s === '-' || s === 'unavailable' || s === 'n/a' || s === 'na' || s === 'not available'
}

function pdfVariantSpecs(specs: ProductSpecs | null): PdfVariantSpecs | null {
  if (!specs) return null
  const raw = (specs as any)._pdf_variant_specs as PdfVariantSpecs | undefined
  if (!raw?.categories?.length) return null
  // Filter out unavailable specs and empty categories
  const cats = raw.categories
    .map(cat => ({
      name: cat.name,
      specs: (cat.specs ?? []).filter(s => !isSpecUnavailable(s.value)),
    }))
    .filter(cat => cat.specs.length > 0)
  if (cats.length === 0) return null
  return {
    variant_name: raw.variant_name,
    match_confidence: raw.match_confidence,
    extracted_at: raw.extracted_at,
    categories: cats,
  }
}

function formatSpecKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Extract inline spec badges */
function inlineSpecBadges(specs: ProductSpecs | null): string[] {
  if (!specs) return []
  const badges: string[] = []
  if (specs.engine) {
    const eng = specs.engine
    const displacement = eng.displacement || eng.capacity || eng.engine_capacity || ''
    const induction = eng.induction || eng.aspiration || ''
    const type = eng.type || eng.engine_type || ''
    let label = displacement
    if (/turbo|supercharg/i.test(induction) || /turbo|supercharg/i.test(type)) {
      label = label ? `${label} Turbo` : 'Turbo'
    }
    if (label) badges.push(label)
  }
  if (specs.transmission) {
    const drive = specs.transmission.drivetrain || specs.transmission.drive_type || specs.transmission.drive || ''
    if (drive) badges.push(drive)
    const gearbox = specs.transmission.type || specs.transmission.transmission_type || specs.transmission.gearbox || ''
    if (gearbox) {
      const speedMatch = gearbox.match(/(\d+)[- ]?speed/i)
      const isCVT = /cvt/i.test(gearbox)
      const isAuto = /auto|cvt|dct|dsg/i.test(gearbox)
      const isManual = /manual/i.test(gearbox)
      if (isCVT) badges.push('CVT')
      else if (speedMatch) badges.push(`${speedMatch[1]}${isAuto ? 'AT' : isManual ? 'MT' : 'SP'}`)
      else if (gearbox.length <= 6) badges.push(gearbox)
    }
  }
  return badges
}

function brochureUrl(product: Product): string | null {
  if (!product.model_id) return null
  return modelMap.value.get(product.model_id)?.brochure_url ?? null
}

/** Quick specs summary for card view */
function specsSummary(specs: ProductSpecs | null): string[] {
  if (!specs) return []
  const items: string[] = []
  if (specs.engine) {
    const power = specs.engine.power || specs.engine.max_power || ''
    if (power) items.push(power)
  }
  if (specs.capacity) {
    const seats = specs.capacity.seats || specs.capacity.seating || ''
    if (seats) items.push(`${seats} seats`)
  }
  if (specs.performance) {
    const fuel = specs.performance.fuel_combined || specs.performance.fuel_consumption || ''
    if (fuel) items.push(fuel)
  }
  if (specs.towing) {
    const braked = specs.towing.braked || specs.towing.braked_towing || ''
    if (braked) items.push(`Tow ${braked}`)
  }
  return items.slice(0, 4)
}

/** Extract all specs for card view, grouped by category */
function cardSpecs(specs: ProductSpecs): { label: string, value: string }[] {
  const items: { label: string, value: string }[] = []
  const allCats = [...SPEC_CATEGORY_ORDER, ...Object.keys(specs).filter(k => !SPEC_CATEGORY_ORDER.includes(k))]
  for (const cat of allCats) {
    const section = specs[cat]
    if (!section) continue
    // Handle top-level scalar values (strings like "4-Wheel Antilock Disc")
    if (typeof section === 'string' || typeof section === 'number') {
      items.push({ label: formatSpecKey(cat), value: String(section) })
      continue
    }
    if (typeof section !== 'object') continue
    for (const [key, value] of Object.entries(section)) {
      if (value == null) continue
      // Handle nested objects (e.g. wheels: { front: "19-inch", rear: "20-inch" })
      if (typeof value === 'object') {
        for (const [subKey, subVal] of Object.entries(value as Record<string, string>)) {
          if (subVal) items.push({ label: `${formatSpecKey(key)} ${formatSpecKey(subKey)}`, value: String(subVal) })
        }
      } else {
        items.push({ label: formatSpecKey(key), value: String(value) })
      }
    }
  }
  return items
}

// Stats
const specsWithCount = computed(() => filtered.value.filter(p => hasSpecs(p)).length)
</script>

<template>
  <BasicPage title="Variants Browser" description="Browse all vehicle variants across OEMs" sticky>
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

      <div class="relative">
        <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <UiInput
          v-model="searchQuery"
          placeholder="Search variants..."
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

      <div class="flex items-center gap-1 border rounded-md p-0.5">
        <UiButton
          variant="ghost"
          size="icon"
          class="size-8"
          :class="viewMode === 'table' ? 'bg-muted' : ''"
          @click="viewMode = 'table'"
        >
          <LayoutList class="size-4" />
        </UiButton>
        <UiButton
          variant="ghost"
          size="icon"
          class="size-8"
          :class="viewMode === 'card' ? 'bg-muted' : ''"
          @click="viewMode = 'card'"
        >
          <LayoutGrid class="size-4" />
        </UiButton>
      </div>

      <span class="text-sm text-muted-foreground ml-auto">
        {{ filtered.length }} variants ({{ specsWithCount }} with specs)
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

    <!-- Card View -->
    <template v-else-if="viewMode === 'card'">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <UiCard
          v-for="product in paginatedItems"
          :key="product.id"
          class="overflow-hidden flex flex-col !py-0"
        >
          <!-- Hero Image -->
          <div class="aspect-[16/10] relative bg-muted overflow-hidden">
            <img
              v-if="heroMap.get(product.id)"
              :src="heroMap.get(product.id)"
              :alt="product.title"
              class="w-full h-full object-contain transition-opacity duration-200"
              loading="lazy"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <ImageOff class="size-8 text-muted-foreground/20" />
            </div>
            <!-- OEM badge -->
            <div class="absolute top-2 left-2">
              <span class="bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                {{ oemName(product.oem_id) }}
              </span>
            </div>
            <!-- Price badge (retail driveaway + ABN ex-GST when available) -->
            <div v-if="product.price_amount" class="absolute bottom-2 left-2 flex flex-col gap-0.5 items-start">
              <span class="bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded">
                {{ formatPrice(product.price_amount) }}
              </span>
              <span
                v-if="(product as any).meta_json?.rsc_price_breakdown?.net_retail_ex_gst"
                class="bg-emerald-700/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
                title="Ex-GST list price — effective cost for ABN-registered buyers who claim GST back"
              >
                ABN {{ formatPrice((product as any).meta_json.rsc_price_breakdown.net_retail_ex_gst) }}
              </span>
            </div>
            <!-- Fuel badge -->
            <div v-if="product.fuel_type" class="absolute top-2 right-2">
              <span class="bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                {{ product.fuel_type }}
              </span>
            </div>
          </div>

          <div class="px-3 pt-2 pb-3 flex flex-col gap-1.5 flex-1">
            <!-- Title row -->
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="text-sm font-semibold leading-snug line-clamp-2">{{ product.title }}</h3>
                <p v-if="product.variant_name && product.variant_name !== product.title" class="text-xs text-muted-foreground leading-tight">{{ product.variant_name }}</p>
              </div>
              <a
                v-if="brochureUrl(product)"
                :href="brochureUrl(product)!"
                target="_blank"
                rel="noopener"
                class="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700 mt-0.5"
                @click.stop
              >
                <FileText class="size-3" />
              </a>
            </div>

            <!-- Inline badges -->
            <div v-if="hasSpecs(product)" class="flex flex-wrap gap-1">
              <span
                v-for="badge in inlineSpecBadges(product.specs_json)"
                :key="badge"
                class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {{ badge }}
              </span>
              <span v-if="product.body_type" class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {{ product.body_type }}
              </span>
            </div>

            <!-- Specs grid -->
            <dl v-if="hasSpecs(product)" class="grid grid-cols-2 gap-x-3 gap-y-px mt-1">
              <template v-for="item in cardSpecs(product.specs_json!)" :key="item.label">
                <dt class="text-[10px] text-muted-foreground truncate">{{ item.label }}</dt>
                <dd class="text-[10px] font-medium text-right truncate" :title="item.value">{{ item.value }}</dd>
              </template>
            </dl>
          </div>
        </UiCard>
      </div>

      <!-- Empty state -->
      <div v-if="paginatedItems.length === 0" class="text-center py-16">
        <p class="text-sm text-muted-foreground">No variants found matching your filters</p>
      </div>

      <!-- Card Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between mt-4 pt-3 border-t">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Per page</span>
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
    </template>

    <!-- Table View -->
    <UiCard v-else>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead>OEM</UiTableHead>
            <UiTableHead>Model</UiTableHead>
            <UiTableHead>Variant</UiTableHead>
            <UiTableHead>Fuel</UiTableHead>
            <UiTableHead>Body</UiTableHead>
            <UiTableHead class="text-right">Price</UiTableHead>
            <UiTableHead>Specs</UiTableHead>
            <UiTableHead>Last Seen</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <template v-for="product in paginatedItems" :key="product.id">
            <UiTableRow class="group">
              <UiTableCell class="text-sm">{{ oemName(product.oem_id) }}</UiTableCell>
              <UiTableCell class="text-sm font-medium">{{ modelName(product.model_id) }}</UiTableCell>
              <UiTableCell>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">{{ product.variant_name || product.subtitle || product.title }}</span>
                  <template v-if="hasSpecs(product)">
                    <span
                      v-for="badge in inlineSpecBadges(product.specs_json)"
                      :key="badge"
                      class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {{ badge }}
                    </span>
                  </template>
                </div>
                <p v-if="product.variant_code" class="text-xs text-muted-foreground mt-0.5">{{ product.variant_code }}</p>
              </UiTableCell>
              <UiTableCell class="text-sm">{{ product.fuel_type ?? '-' }}</UiTableCell>
              <UiTableCell class="text-sm">{{ product.body_type ?? '-' }}</UiTableCell>
              <UiTableCell class="text-right font-medium text-sm">
                <div>{{ formatPrice(product.price_amount) }}</div>
                <div
                  v-if="(product as any).meta_json?.rsc_price_breakdown?.net_retail_ex_gst"
                  class="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal"
                  title="Ex-GST — ABN-registered buyer effective price"
                >
                  ABN {{ formatPrice((product as any).meta_json.rsc_price_breakdown.net_retail_ex_gst) }}
                </div>
              </UiTableCell>
              <UiTableCell>
                <button
                  v-if="hasSpecs(product)"
                  class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950 transition-colors"
                  @click="toggleSpecs(product.id)"
                >
                  <component :is="expandedSpecs.has(product.id) ? ChevronUp : ChevronDown" class="size-3" />
                  {{ orderedCategories(product.specs_json!).length }} cats
                  <span
                    v-if="pdfVariantSpecs(product.specs_json)"
                    class="ml-0.5 inline-flex items-center rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[9px] font-semibold px-1 py-px"
                    title="Includes per-variant specs from brochure PDF"
                  >
                    PDF
                  </span>
                </button>
                <span v-else class="text-xs text-muted-foreground">-</span>
              </UiTableCell>
              <UiTableCell class="text-xs text-muted-foreground">
                {{ product.last_seen_at ? new Date(product.last_seen_at).toLocaleDateString('en-AU') : '-' }}
              </UiTableCell>
            </UiTableRow>
            <!-- Expandable Specs -->
            <UiTableRow v-if="expandedSpecs.has(product.id) && hasSpecs(product)" class="bg-muted/30 hover:bg-muted/40">
              <UiTableCell :colspan="8" class="p-0">
                <div class="px-6 py-4 space-y-5">
                  <!-- Regular specs_json categories -->
                  <div v-if="orderedCategories(product.specs_json!).length > 0">
                    <h3 class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Crawled Specs
                    </h3>
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

                  <!-- PDF Variant Specs (from brochure extraction) -->
                  <div v-if="pdfVariantSpecs(product.specs_json)" class="border-t pt-4">
                    <div class="flex items-center gap-2 mb-2">
                      <h3 class="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                        PDF Brochure Specs
                      </h3>
                      <span v-if="pdfVariantSpecs(product.specs_json)?.variant_name" class="text-[10px] text-muted-foreground">
                        → {{ pdfVariantSpecs(product.specs_json)?.variant_name }}
                      </span>
                      <span
                        v-if="pdfVariantSpecs(product.specs_json)?.match_confidence !== undefined"
                        class="text-[10px] text-muted-foreground"
                      >
                        · {{ Math.round((pdfVariantSpecs(product.specs_json)?.match_confidence ?? 0) * 100) }}% match
                      </span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div
                        v-for="category in pdfVariantSpecs(product.specs_json)?.categories ?? []"
                        :key="category.name"
                        class="rounded-md bg-blue-500/5 border border-blue-500/20 p-3"
                      >
                        <h4 class="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-2">
                          {{ category.name }}
                        </h4>
                        <dl class="space-y-1">
                          <div
                            v-for="spec in category.specs"
                            :key="spec.key"
                            class="flex justify-between gap-2 text-xs"
                          >
                            <dt class="text-muted-foreground shrink-0">{{ spec.label }}</dt>
                            <dd class="text-right font-medium truncate" :title="spec.value">
                              {{ spec.value }}<span v-if="spec.unit" class="text-muted-foreground ml-0.5">{{ spec.unit }}</span>
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </UiTableCell>
            </UiTableRow>
          </template>
          <UiTableRow v-if="paginatedItems.length === 0">
            <UiTableCell :colspan="8" class="text-center text-muted-foreground py-8">
              No variants found matching your filters
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
