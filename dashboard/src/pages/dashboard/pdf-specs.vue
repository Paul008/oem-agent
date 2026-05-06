<script lang="ts" setup>
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, ExternalLink, FileText, Loader2, RefreshCw, Search } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { workerFetch } from '@/lib/worker-api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpecItem {
  key: string
  label: string
  value: string
  unit: string | null
}

interface SpecCategory {
  name: string
  specs: SpecItem[]
}

interface PdfSpecModel {
  model_id: string
  oem_id: string
  model_name: string
  slug: string
  brochure_url: string | null
  extracted_at: string | null
  category_count: number
  spec_count: number
  categories: SpecCategory[]
}

// ── State ─────────────────────────────────────────────────────────────────────

const loading = ref(true)
const loadError = ref<string | null>(null)
const models = ref<PdfSpecModel[]>([])

const filterOem = ref('all')
const filterCategory = ref('all')
const searchQuery = ref('')
const page = ref(1)
const pageSize = ref(25)

const expandedModels = ref<Set<string>>(new Set())

// ── Load data ─────────────────────────────────────────────────────────────────

async function loadData() {
  loading.value = true
  loadError.value = null
  try {
    const data = await workerFetch('/api/v1/admin/pdf-specs')
    models.value = data.models ?? []
  }
  catch (err: any) {
    loadError.value = err.message || 'Failed to load PDF specs'
    toast.error(loadError.value!)
  }
  finally {
    loading.value = false
  }
}

onMounted(loadData)

// ── Derived ───────────────────────────────────────────────────────────────────

const oemList = computed(() => {
  const seen = new Map<string, string>()
  for (const row of models.value) {
    if (!seen.has(row.oem_id))
      seen.set(row.oem_id, row.oem_id.replace(/-au$/, '').toUpperCase())
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
})

const allCategories = computed(() => {
  const cats = new Set<string>()
  for (const m of models.value) {
    for (const c of m.categories) cats.add(c.name)
  }
  return [...cats].sort()
})

const totalSpecs = computed(() => models.value.reduce((sum, m) => sum + m.spec_count, 0))

// ── Filtering ─────────────────────────────────────────────────────────────────

const filtered = computed(() => {
  let list = models.value

  if (filterOem.value !== 'all') {
    list = list.filter(m => m.oem_id === filterOem.value)
  }

  if (filterCategory.value !== 'all') {
    list = list.filter(m => m.categories.some(c => c.name === filterCategory.value))
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter((m) => {
      if (m.model_name.toLowerCase().includes(q))
        return true
      if (m.oem_id.toLowerCase().includes(q))
        return true
      for (const cat of m.categories) {
        for (const s of cat.specs) {
          if (s.label.toLowerCase().includes(q) || s.value.toLowerCase().includes(q))
            return true
        }
      }
      return false
    })
  }

  return list
})

watch([filterOem, filterCategory, searchQuery, pageSize], () => { page.value = 1 })

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const paginated = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function oemLabel(id: string) {
  return id.replace(/-au$/, '').toUpperCase()
}

function formatDate(dateStr: string | null) {
  if (!dateStr)
    return '-'
  return new Date(dateStr).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })
}

function toggleModel(id: string) {
  if (expandedModels.value.has(id)) {
    expandedModels.value.delete(id)
  }
  else {
    expandedModels.value.add(id)
  }
}

function filteredCategories(model: PdfSpecModel): SpecCategory[] {
  if (filterCategory.value === 'all')
    return model.categories
  return model.categories.filter(c => c.name === filterCategory.value)
}
</script>

<template>
  <BasicPage title="PDF Extracted Specs" description="Structured specifications extracted from OEM brochure PDFs" sticky>
    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <UiSelect :model-value="filterOem" @update:model-value="v => filterOem = String(v ?? 'all')">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="All OEMs" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">
            All OEMs
          </UiSelectItem>
          <UiSelectItem v-for="oem in oemList" :key="oem.id" :value="oem.id">
            {{ oem.name }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect :model-value="filterCategory" @update:model-value="v => filterCategory = String(v ?? 'all')">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="All Categories" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">
            All Categories
          </UiSelectItem>
          <UiSelectItem v-for="cat in allCategories" :key="cat" :value="cat">
            {{ cat }}
          </UiSelectItem>
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

      <span class="text-sm text-muted-foreground ml-auto">
        {{ filtered.length }} models &middot; {{ totalSpecs }} total specs
      </span>

      <UiButton variant="outline" size="sm" @click="loadData">
        <RefreshCw class="size-3.5 mr-1.5" />
        Refresh
      </UiButton>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <div v-else-if="loadError" class="flex flex-col items-center justify-center h-64 gap-2">
      <AlertTriangle class="size-8 text-destructive" />
      <p class="text-sm text-muted-foreground">
        {{ loadError }}
      </p>
      <UiButton variant="outline" size="sm" @click="loadData">
        <RefreshCw class="size-3.5 mr-1.5" /> Retry
      </UiButton>
    </div>

    <div v-else-if="models.length === 0" class="flex flex-col items-center justify-center h-64 gap-2">
      <FileText class="size-8 text-muted-foreground/30" />
      <p class="text-sm text-muted-foreground">
        No PDF specs extracted yet
      </p>
      <p class="text-xs text-muted-foreground">
        Run the extraction pipeline from the PDFs & Specs page
      </p>
    </div>

    <!-- Table -->
    <UiCard v-else>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead>OEM</UiTableHead>
            <UiTableHead>Model</UiTableHead>
            <UiTableHead>PDF</UiTableHead>
            <UiTableHead class="text-center">
              Categories
            </UiTableHead>
            <UiTableHead class="text-center">
              Specs
            </UiTableHead>
            <UiTableHead>Extracted</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <template v-for="model in paginated" :key="model.model_id">
            <UiTableRow
              class="cursor-pointer group"
              @click="toggleModel(model.model_id)"
            >
              <UiTableCell class="text-xs font-medium text-muted-foreground">
                {{ oemLabel(model.oem_id) }}
              </UiTableCell>
              <UiTableCell class="text-sm font-medium">
                <div class="flex items-center gap-1.5">
                  <component :is="expandedModels.has(model.model_id) ? ChevronUp : ChevronDown" class="size-3.5 text-muted-foreground" />
                  {{ model.model_name }}
                </div>
              </UiTableCell>
              <UiTableCell class="max-w-[200px]">
                <a
                  v-if="model.brochure_url"
                  :href="model.brochure_url"
                  target="_blank"
                  class="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate max-w-full"
                  :title="model.brochure_url"
                  @click.stop
                >
                  <ExternalLink class="size-3 shrink-0" />
                  PDF
                </a>
              </UiTableCell>
              <UiTableCell class="text-center text-sm font-medium">
                {{ model.category_count }}
              </UiTableCell>
              <UiTableCell class="text-center text-sm font-medium">
                {{ model.spec_count }}
              </UiTableCell>
              <UiTableCell class="text-xs text-muted-foreground whitespace-nowrap">
                {{ formatDate(model.extracted_at) }}
              </UiTableCell>
            </UiTableRow>

            <!-- Expanded spec categories -->
            <UiTableRow v-if="expandedModels.has(model.model_id)" class="bg-muted/30 hover:bg-muted/40">
              <UiTableCell :colspan="6" class="p-0">
                <div class="px-6 py-4">
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div
                      v-for="cat in filteredCategories(model)"
                      :key="cat.name"
                      class="rounded-lg border bg-card p-3"
                    >
                      <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {{ cat.name }}
                      </h4>
                      <dl class="space-y-1.5">
                        <div
                          v-for="spec in cat.specs"
                          :key="spec.key"
                          class="flex justify-between gap-3 text-xs"
                        >
                          <dt class="text-muted-foreground shrink-0">
                            {{ spec.label }}
                          </dt>
                          <dd class="text-right font-medium truncate" :title="`${spec.value}${spec.unit ? ` ${spec.unit}` : ''}`">
                            {{ spec.value }}
                            <span v-if="spec.unit" class="text-muted-foreground ml-0.5">{{ spec.unit }}</span>
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  <div v-if="filteredCategories(model).length === 0" class="text-center text-sm text-muted-foreground py-4">
                    No specs in the selected category
                  </div>
                </div>
              </UiTableCell>
            </UiTableRow>
          </template>

          <UiTableRow v-if="paginated.length === 0">
            <UiTableCell :colspan="6" class="text-center text-muted-foreground py-8">
              No models match the current filters
            </UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>

      <!-- Pagination -->
      <div class="flex items-center justify-between border-t px-4 py-3">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <UiSelect :model-value="String(pageSize)" @update:model-value="v => { pageSize = Number(v); page = 1 }">
            <UiSelectTrigger class="w-[70px] h-8">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="25">
                25
              </UiSelectItem>
              <UiSelectItem value="50">
                50
              </UiSelectItem>
              <UiSelectItem value="100">
                100
              </UiSelectItem>
            </UiSelectContent>
          </UiSelect>
          <span>
            {{ filtered.length === 0 ? 0 : (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, filtered.length) }}
            of {{ filtered.length }}
          </span>
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
