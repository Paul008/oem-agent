<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Loader2, FileText, ChevronDown, ChevronRight, ClipboardList } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import type { VehicleModel, Product, ProductSpecs } from '@/composables/use-oem-data'

const { fetchVehicleModels, fetchProducts, fetchOems } = useOemData()

const models = ref<VehicleModel[]>([])
const products = ref<Product[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)
const filterOem = ref('all')
const expandedModel = ref<string | null>(null)
const expandedSpecs = ref<Set<string>>(new Set())

onMounted(async () => {
  try {
    const [m, p, o] = await Promise.all([fetchVehicleModels(), fetchProducts(), fetchOems()])
    models.value = m
    products.value = p
    oems.value = o
  }
  finally {
    loading.value = false
  }
})

const filteredModels = computed(() => {
  if (filterOem.value === 'all') return models.value
  return models.value.filter(m => m.oem_id === filterOem.value)
})

function productsForModel(modelId: string) {
  return products.value.filter(p => p.model_id === modelId)
}

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function formatPrice(amount: number | null) {
  if (!amount) return '-'
  return `$${Math.round(amount).toLocaleString()}`
}

function toggleModel(id: string) {
  expandedModel.value = expandedModel.value === id ? null : id
}

function toggleSpecs(productId: string) {
  if (expandedSpecs.value.has(productId)) {
    expandedSpecs.value.delete(productId)
  } else {
    expandedSpecs.value.add(productId)
  }
}

function hasSpecs(product: Product): boolean {
  return product.specs_json !== null && Object.keys(product.specs_json).length > 0
}

function specsCount(modelId: string): { withSpecs: number, total: number } {
  const prods = productsForModel(modelId)
  return {
    withSpecs: prods.filter(p => hasSpecs(p)).length,
    total: prods.length,
  }
}

/** Extract key inline spec badges from specs_json */
function inlineSpecBadges(specs: ProductSpecs | null): string[] {
  if (!specs) return []
  const badges: string[] = []

  // Engine displacement/type (e.g. "2.0L Turbo")
  if (specs.engine) {
    const eng = specs.engine
    const displacement = eng.displacement || eng.capacity || eng.engine_capacity || eng['Engine Capacity'] || eng.Displacement || ''
    const type = eng.type || eng.engine_type || eng['Engine Type'] || eng.Type || ''
    const induction = eng.induction || eng.aspiration || eng.Induction || eng.Aspiration || ''
    let label = displacement
    if (induction && /turbo|supercharg/i.test(induction)) {
      label = label ? `${label} Turbo` : 'Turbo'
    } else if (type && /turbo|supercharg/i.test(type)) {
      label = label ? `${label} Turbo` : 'Turbo'
    }
    if (label) badges.push(label)
  }

  // Drivetrain (e.g. "AWD", "4WD", "FWD", "RWD")
  if (specs.transmission) {
    const trans = specs.transmission
    const drive = trans.drivetrain || trans.drive_type || trans.Drivetrain || trans['Drive Type'] || trans.drive || ''
    if (drive) badges.push(drive)
  }

  // Transmission type (e.g. "8AT", "CVT", "6MT")
  if (specs.transmission) {
    const trans = specs.transmission
    const gearbox = trans.type || trans.transmission_type || trans.Type || trans['Transmission Type'] || trans.gearbox || ''
    if (gearbox) {
      // Try to abbreviate: "8-speed automatic" -> "8AT"
      const speedMatch = gearbox.match(/(\d+)[- ]?speed/i)
      const isAuto = /auto|cvt|dct|dsg/i.test(gearbox)
      const isManual = /manual/i.test(gearbox)
      const isCVT = /cvt/i.test(gearbox)
      if (isCVT) {
        badges.push('CVT')
      } else if (speedMatch) {
        badges.push(`${speedMatch[1]}${isAuto ? 'AT' : isManual ? 'MT' : 'SP'}`)
      } else if (gearbox.length <= 6) {
        badges.push(gearbox)
      }
    }
  }

  return badges
}

const SPEC_CATEGORY_ORDER = ['engine', 'transmission', 'dimensions', 'performance', 'towing', 'capacity', 'safety', 'wheels']

const CATEGORY_LABELS: Record<string, string> = {
  engine: 'Engine',
  transmission: 'Transmission',
  dimensions: 'Dimensions',
  performance: 'Performance',
  towing: 'Towing',
  capacity: 'Capacity',
  safety: 'Safety',
  wheels: 'Wheels',
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
      result.push({
        key: cat,
        label: CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1),
        entries: Object.entries(section).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]),
      })
    }
  }
  for (const cat of Object.keys(specs)) {
    if (SPEC_CATEGORY_ORDER.includes(cat)) continue
    const section = specs[cat]
    if (!section) continue
    if (typeof section === 'string' || typeof section === 'number') {
      otherEntries.push([formatSpecKey(cat), String(section)])
    } else if (typeof section === 'object' && Object.keys(section).length > 0) {
      result.push({
        key: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' '),
        entries: Object.entries(section).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]),
      })
    }
  }
  if (otherEntries.length > 0) {
    result.push({ key: '_other', label: 'Other', entries: otherEntries })
  }
  return result
}

function formatSpecKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

const specsCoverage = computed(() => {
  const filtered = filterOem.value === 'all'
    ? products.value
    : products.value.filter(p => p.oem_id === filterOem.value)
  const withSpecs = filtered.filter(p => hasSpecs(p)).length
  return { withSpecs, total: filtered.length, pct: filtered.length ? Math.round((withSpecs / filtered.length) * 100) : 0 }
})

const brochureCoverage = computed(() => {
  const filtered = filteredModels.value
  const withBrochure = filtered.filter(m => m.brochure_url).length
  return { withBrochure, total: filtered.length, pct: filtered.length ? Math.round((withBrochure / filtered.length) * 100) : 0 }
})
</script>

<template>
  <BasicPage title="Models & Variants" description="Vehicle catalog with variant breakdown" sticky>
    <div class="flex items-center gap-4 mb-4">
      <UiSelect v-model="filterOem">
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
      <span class="text-sm text-muted-foreground">
        {{ filteredModels.length }} models / {{ products.length }} variants
      </span>
    </div>

    <!-- Coverage Stats -->
    <div v-if="!loading" class="grid gap-4 sm:grid-cols-3 mb-4">
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">Specs Coverage</UiCardTitle>
          <ClipboardList class="size-4" :class="specsCoverage.pct >= 90 ? 'text-green-500' : 'text-yellow-500'" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold" :class="specsCoverage.pct >= 90 ? 'text-green-500' : 'text-yellow-500'">
            {{ specsCoverage.pct }}%
          </div>
          <p class="text-xs text-muted-foreground">{{ specsCoverage.withSpecs }}/{{ specsCoverage.total }} variants with specs_json</p>
        </UiCardContent>
      </UiCard>

      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">Brochure Coverage</UiCardTitle>
          <FileText class="size-4" :class="brochureCoverage.pct >= 70 ? 'text-green-500' : 'text-yellow-500'" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold" :class="brochureCoverage.pct >= 70 ? 'text-green-500' : 'text-yellow-500'">
            {{ brochureCoverage.pct }}%
          </div>
          <p class="text-xs text-muted-foreground">{{ brochureCoverage.withBrochure }}/{{ brochureCoverage.total }} models with brochure PDF</p>
        </UiCardContent>
      </UiCard>

      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">Total Variants</UiCardTitle>
          <Loader2 class="size-4 text-muted-foreground" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">{{ products.length }}</div>
          <p class="text-xs text-muted-foreground">Across {{ filteredModels.length }} models</p>
        </UiCardContent>
      </UiCard>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <div v-else class="space-y-2">
      <UiCard v-for="model in filteredModels" :key="model.id">
        <div
          class="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          @click="toggleModel(model.id)"
        >
          <div class="flex items-center gap-3">
            <div>
              <h3 class="text-sm font-semibold">{{ model.name }}</h3>
              <p class="text-xs text-muted-foreground">
                {{ oemName(model.oem_id) }} · {{ model.body_type }} · {{ model.category }}
                <span v-if="model.model_year"> · {{ model.model_year }}</span>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <a
              v-if="model.brochure_url"
              :href="model.brochure_url"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline"
              @click.stop
            >
              <FileText class="size-3" />
              Brochure
            </a>
            <UiBadge
              v-if="specsCount(model.id).withSpecs > 0"
              variant="outline"
              class="text-xs"
            >
              {{ specsCount(model.id).withSpecs }}/{{ specsCount(model.id).total }} specs
            </UiBadge>
            <UiBadge variant="secondary" class="text-xs">
              {{ productsForModel(model.id).length }} variants
            </UiBadge>
            <UiBadge v-if="!model.is_active" variant="destructive" class="text-xs">Inactive</UiBadge>
          </div>
        </div>

        <div v-if="expandedModel === model.id" class="border-t">
          <UiTable>
            <UiTableHeader>
              <UiTableRow>
                <UiTableHead>Variant</UiTableHead>
                <UiTableHead>Code</UiTableHead>
                <UiTableHead>Fuel</UiTableHead>
                <UiTableHead>Body</UiTableHead>
                <UiTableHead class="text-right">Price</UiTableHead>
                <UiTableHead>Availability</UiTableHead>
                <UiTableHead>Last Seen</UiTableHead>
              </UiTableRow>
            </UiTableHeader>
            <UiTableBody>
              <template v-for="product in productsForModel(model.id)" :key="product.id">
                <UiTableRow>
                  <UiTableCell class="font-medium">
                    <div class="flex items-center gap-2">
                      <span>{{ product.variant_name || product.subtitle || product.title }}</span>
                      <template v-if="hasSpecs(product)">
                        <span
                          v-for="badge in inlineSpecBadges(product.specs_json)"
                          :key="badge"
                          class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {{ badge }}
                        </span>
                        <button
                          class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950 transition-colors"
                          @click.stop="toggleSpecs(product.id)"
                        >
                          <component :is="expandedSpecs.has(product.id) ? ChevronDown : ChevronRight" class="size-3" />
                          Specs
                        </button>
                      </template>
                    </div>
                  </UiTableCell>
                  <UiTableCell class="text-xs text-muted-foreground">{{ product.variant_code ?? '-' }}</UiTableCell>
                  <UiTableCell class="text-sm">{{ product.fuel_type ?? '-' }}</UiTableCell>
                  <UiTableCell class="text-sm">{{ product.body_type ?? '-' }}</UiTableCell>
                  <UiTableCell class="text-right font-medium">{{ formatPrice(product.price_amount) }}</UiTableCell>
                  <UiTableCell>
                    <UiBadge v-if="product.availability" variant="outline" class="text-xs">
                      {{ product.availability }}
                    </UiBadge>
                    <span v-else class="text-muted-foreground">-</span>
                  </UiTableCell>
                  <UiTableCell class="text-xs text-muted-foreground">
                    {{ new Date(product.last_seen_at).toLocaleDateString('en-AU') }}
                  </UiTableCell>
                </UiTableRow>
                <!-- Expandable Specs Row -->
                <UiTableRow v-if="expandedSpecs.has(product.id) && hasSpecs(product)" class="bg-muted/30 hover:bg-muted/40">
                  <UiTableCell :colspan="7" class="p-0">
                    <div class="px-6 py-4">
                      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
            </UiTableBody>
          </UiTable>
        </div>
      </UiCard>
    </div>
  </BasicPage>
</template>
