<script lang="ts" setup>
import { onMounted, ref, computed, watch } from 'vue'
import { Loader2, FileText, CheckCircle2, Layers, Cpu, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, X, RefreshCw, AlertTriangle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { workerFetch } from '@/lib/worker-api'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PdfCatalogStats {
  total_models: number
  with_brochure: number
  vectorized: number
  specs_extracted: number
}

interface PdfRow {
  model_id: string
  oem_id: string
  model_name: string
  brochure_url: string | null
  chunk_count: number
  has_specs: boolean
  spec_count: number
  extracted_at: string | null
}

interface ExtractedSpecItem {
  label: string
  value: string
  unit?: string | null
  raw_text?: string | null
  category?: string | null
}

// ── State ─────────────────────────────────────────────────────────────────────

const loading = ref(true)
const loadError = ref<string | null>(null)
const stats = ref<PdfCatalogStats>({ total_models: 0, with_brochure: 0, vectorized: 0, specs_extracted: 0 })
const pdfs = ref<PdfRow[]>([])

const filterOem = ref('all')
const filterStatus = ref<'all' | 'vectorized' | 'specs_extracted' | 'pending'>('all')
const page = ref(1)
const pageSize = ref(50)

// Extract modal state
const extractingIds = ref<Set<string>>(new Set())
const extractingAll = ref(false)

// Specs modal state
const specsModalOpen = ref(false)
const specsLoading = ref(false)
const specsModelId = ref<string | null>(null)
const specsModelName = ref('')
const specsData = ref<ExtractedSpecItem[]>([])

// ── Load data ─────────────────────────────────────────────────────────────────

async function loadData() {
  loading.value = true
  loadError.value = null
  try {
    const data = await workerFetch('/api/v1/admin/pdf-catalog')
    stats.value = data.stats ?? { total_models: 0, with_brochure: 0, vectorized: 0, specs_extracted: 0 }
    pdfs.value = data.pdfs ?? []
  }
  catch (err: any) {
    loadError.value = err.message || 'Failed to load PDF catalog'
    toast.error(loadError.value!)
  }
  finally {
    loading.value = false
  }
}

onMounted(loadData)

// ── OEM list derived from data ────────────────────────────────────────────────

const oemList = computed(() => {
  const seen = new Map<string, string>()
  for (const row of pdfs.value) {
    if (!seen.has(row.oem_id)) seen.set(row.oem_id, row.oem_id.replace(/-au$/, '').toUpperCase())
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
})

// ── Filters ───────────────────────────────────────────────────────────────────

const filtered = computed(() => {
  let list = pdfs.value
  if (filterOem.value !== 'all') {
    list = list.filter(r => r.oem_id === filterOem.value)
  }
  if (filterStatus.value === 'vectorized') {
    list = list.filter(r => r.chunk_count > 0)
  }
  else if (filterStatus.value === 'specs_extracted') {
    list = list.filter(r => r.has_specs)
  }
  else if (filterStatus.value === 'pending') {
    list = list.filter(r => r.brochure_url && !r.has_specs)
  }
  return list
})

watch([filterOem, filterStatus, pageSize], () => { page.value = 1 })

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const paginated = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function oemLabel(id: string) {
  return id.replace(/-au$/, '').toUpperCase()
}

function truncateUrl(url: string | null) {
  if (!url) return '-'
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/')
    const filename = parts[parts.length - 1] || u.hostname
    return filename.length > 40 ? `…${filename.slice(-38)}` : filename
  }
  catch {
    return url.slice(0, 40)
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Extract actions ───────────────────────────────────────────────────────────

async function extractSpecs(row: PdfRow) {
  if (extractingIds.value.has(row.model_id)) return
  extractingIds.value.add(row.model_id)
  try {
    await workerFetch('/api/v1/admin/extract-specs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: row.model_id }),
    })
    toast.success(`Spec extraction queued for ${row.model_name}`)
    // Refresh after short delay to pick up new status
    setTimeout(loadData, 3000)
  }
  catch (err: any) {
    toast.error(`Extract failed: ${err.message}`)
  }
  finally {
    extractingIds.value.delete(row.model_id)
  }
}

async function extractAllMissing() {
  const missing = pdfs.value.filter(r => r.brochure_url && !r.has_specs)
  if (missing.length === 0) {
    toast.info('No models with brochures missing specs')
    return
  }
  extractingAll.value = true
  try {
    await workerFetch('/api/v1/admin/extract-specs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    toast.success(`Bulk spec extraction queued for ${missing.length} models`)
    setTimeout(loadData, 5000)
  }
  catch (err: any) {
    toast.error(`Bulk extract failed: ${err.message}`)
  }
  finally {
    extractingAll.value = false
  }
}

// ── View specs modal ──────────────────────────────────────────────────────────

async function viewSpecs(row: PdfRow) {
  specsModelId.value = row.model_id
  specsModelName.value = row.model_name
  specsData.value = []
  specsModalOpen.value = true
  specsLoading.value = true
  try {
    const { data, error } = await supabase
      .from('vehicle_models')
      .select('extracted_specs')
      .eq('id', row.model_id)
      .single()
    if (error) throw error
    const raw = data?.extracted_specs
    // extracted_specs is { categories: [{ name, specs: [{ label, value, unit }] }] }
    if (raw?.categories && Array.isArray(raw.categories)) {
      specsData.value = raw.categories.flatMap((cat: any) =>
        (cat.specs ?? []).map((s: any) => ({ ...s, category: cat.name }))
      )
    } else if (Array.isArray(raw)) {
      specsData.value = raw
    } else {
      specsData.value = []
    }
  }
  catch (err: any) {
    toast.error(`Failed to load specs: ${err.message}`)
  }
  finally {
    specsLoading.value = false
  }
}

function closeModal() {
  specsModalOpen.value = false
  specsModelId.value = null
  specsData.value = []
}

// ── Specs grouping ────────────────────────────────────────────────────────────

const specsByCategory = computed(() => {
  const groups = new Map<string, ExtractedSpecItem[]>()
  for (const item of specsData.value) {
    const cat = item.category || 'General'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(item)
  }
  return [...groups.entries()].map(([cat, items]) => ({ cat, items }))
})

// Models with brochure but no specs (for bulk action label)
const missingSpecsCount = computed(() => pdfs.value.filter(r => r.brochure_url && !r.has_specs).length)
</script>

<template>
  <BasicPage title="PDFs & Specs" description="Brochure PDF vectorization and spec extraction across OEMs" sticky>
    <!-- Filters + Bulk Action -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <UiSelect :model-value="filterOem" @update:model-value="v => { filterOem = String(v ?? 'all'); page = 1 }">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="All OEMs" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All OEMs</UiSelectItem>
          <UiSelectItem v-for="oem in oemList" :key="oem.id" :value="oem.id">
            {{ oem.name }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect :model-value="filterStatus" @update:model-value="v => { filterStatus = (v as any) ?? 'all'; page = 1 }">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="All statuses" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All</UiSelectItem>
          <UiSelectItem value="vectorized">Vectorized</UiSelectItem>
          <UiSelectItem value="specs_extracted">Specs Extracted</UiSelectItem>
          <UiSelectItem value="pending">Pending (brochure, no specs)</UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <span class="text-sm text-muted-foreground">
        {{ filtered.length }} models
      </span>

      <div class="ml-auto">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="extractingAll || missingSpecsCount === 0"
          @click="extractAllMissing"
        >
          <Loader2 v-if="extractingAll" class="size-3.5 mr-1.5 animate-spin" />
          <Cpu v-else class="size-3.5 mr-1.5" />
          Extract All Missing
          <span v-if="missingSpecsCount > 0" class="ml-1.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs px-1.5 py-px font-medium">
            {{ missingSpecsCount }}
          </span>
        </UiButton>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <div v-else-if="loadError" class="flex flex-col items-center justify-center h-64 gap-2">
      <AlertTriangle class="size-8 text-destructive" />
      <p class="text-sm text-muted-foreground">{{ loadError }}</p>
      <UiButton variant="outline" size="sm" @click="loadData">
        <RefreshCw class="size-3.5 mr-1.5" /> Retry
      </UiButton>
    </div>

    <template v-else>
      <!-- Stats Bar -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Total Models</UiCardTitle>
            <FileText class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.total_models }}</div>
            <p class="text-xs text-muted-foreground">Across all OEMs</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">With Brochures</UiCardTitle>
            <FileText class="size-4 text-blue-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-blue-500">{{ stats.with_brochure }}</div>
            <p class="text-xs text-muted-foreground">Have PDF brochure URL</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Vectorized</UiCardTitle>
            <Layers class="size-4 text-purple-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-purple-500">{{ stats.vectorized }}</div>
            <p class="text-xs text-muted-foreground">Have embedded chunks</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Specs Extracted</UiCardTitle>
            <CheckCircle2 class="size-4 text-green-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-green-500">{{ stats.specs_extracted }}</div>
            <p class="text-xs text-muted-foreground">Have structured specs</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Table -->
      <UiCard>
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead>OEM</UiTableHead>
              <UiTableHead>Model</UiTableHead>
              <UiTableHead>PDF</UiTableHead>
              <UiTableHead class="text-right">Chunks</UiTableHead>
              <UiTableHead class="text-center">Specs</UiTableHead>
              <UiTableHead class="text-right">Spec Count</UiTableHead>
              <UiTableHead>Extracted</UiTableHead>
              <UiTableHead class="text-right">Actions</UiTableHead>
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow v-for="row in paginated" :key="row.model_id">
              <UiTableCell class="text-xs font-medium text-muted-foreground">
                {{ oemLabel(row.oem_id) }}
              </UiTableCell>
              <UiTableCell class="text-sm font-medium">
                {{ row.model_name }}
              </UiTableCell>
              <UiTableCell class="max-w-[200px]">
                <a
                  v-if="row.brochure_url"
                  :href="row.brochure_url"
                  target="_blank"
                  class="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate max-w-full"
                  :title="row.brochure_url"
                >
                  <ExternalLink class="size-3 shrink-0" />
                  {{ truncateUrl(row.brochure_url) }}
                </a>
                <span v-else class="text-xs text-muted-foreground">—</span>
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                <span v-if="row.chunk_count > 0" class="text-purple-600 dark:text-purple-400 font-medium">
                  {{ row.chunk_count }}
                </span>
                <span v-else class="text-muted-foreground">—</span>
              </UiTableCell>
              <UiTableCell class="text-center">
                <UiBadge
                  v-if="row.has_specs"
                  variant="secondary"
                  class="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                >
                  Yes
                </UiBadge>
                <UiBadge
                  v-else-if="row.chunk_count > 0"
                  variant="secondary"
                  class="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                >
                  Pending
                </UiBadge>
                <UiBadge
                  v-else
                  variant="secondary"
                  class="text-[10px] text-muted-foreground"
                >
                  No chunks
                </UiBadge>
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                <span v-if="row.spec_count > 0" class="font-medium">{{ row.spec_count }}</span>
                <span v-else class="text-muted-foreground">—</span>
              </UiTableCell>
              <UiTableCell class="text-xs text-muted-foreground whitespace-nowrap">
                {{ formatDate(row.extracted_at) }}
              </UiTableCell>
              <UiTableCell class="text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <UiButton
                    v-if="row.has_specs"
                    variant="ghost"
                    size="sm"
                    class="h-7 text-xs"
                    @click="viewSpecs(row)"
                  >
                    View
                  </UiButton>
                  <UiButton
                    v-if="row.brochure_url"
                    variant="outline"
                    size="sm"
                    class="h-7 text-xs"
                    :disabled="extractingIds.has(row.model_id)"
                    @click="extractSpecs(row)"
                  >
                    <Loader2 v-if="extractingIds.has(row.model_id)" class="size-3 mr-1 animate-spin" />
                    <Cpu v-else class="size-3 mr-1" />
                    Extract
                  </UiButton>
                </div>
              </UiTableCell>
            </UiTableRow>

            <UiTableRow v-if="paginated.length === 0">
              <UiTableCell :colspan="8" class="text-center text-muted-foreground py-8">
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
                <UiSelectItem value="25">25</UiSelectItem>
                <UiSelectItem value="50">50</UiSelectItem>
                <UiSelectItem value="100">100</UiSelectItem>
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
    </template>

    <!-- Specs Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="specsModalOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          @click.self="closeModal"
        >
          <div class="bg-card border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <!-- Modal header -->
            <div class="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div>
                <h2 class="text-base font-semibold">{{ specsModelName }}</h2>
                <p class="text-xs text-muted-foreground mt-0.5">Extracted specifications from brochure PDF</p>
              </div>
              <button
                class="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1"
                @click="closeModal"
              >
                <X class="size-5" />
              </button>
            </div>

            <!-- Modal body -->
            <div class="overflow-y-auto flex-1 px-6 py-4">
              <div v-if="specsLoading" class="flex items-center justify-center h-32">
                <Loader2 class="size-5 animate-spin" />
              </div>

              <div v-else-if="specsData.length === 0" class="flex flex-col items-center justify-center h-32 gap-2">
                <FileText class="size-8 text-muted-foreground/30" />
                <p class="text-sm text-muted-foreground">No specs extracted yet</p>
              </div>

              <div v-else class="space-y-5">
                <div
                  v-for="group in specsByCategory"
                  :key="group.cat"
                >
                  <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {{ group.cat }}
                  </h3>
                  <div class="rounded-lg border overflow-hidden">
                    <table class="w-full text-sm">
                      <tbody>
                        <tr
                          v-for="(item, idx) in group.items"
                          :key="idx"
                          class="border-b last:border-0"
                        >
                          <td class="px-3 py-2 text-muted-foreground w-[40%] align-top text-xs font-medium">
                            {{ item.label }}
                          </td>
                          <td class="px-3 py-2 align-top">
                            <span class="font-medium text-sm">{{ item.value }}</span>
                            <span v-if="item.unit" class="text-muted-foreground text-xs ml-1">{{ item.unit }}</span>
                            <p v-if="item.raw_text && item.raw_text !== item.value" class="text-muted-foreground/60 text-[11px] mt-0.5">
                              {{ item.raw_text }}
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <!-- Modal footer -->
            <div class="px-6 py-3 border-t shrink-0 flex items-center justify-between">
              <span class="text-xs text-muted-foreground">{{ specsData.length }} spec entries</span>
              <UiButton variant="outline" size="sm" @click="closeModal">
                Close
              </UiButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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
