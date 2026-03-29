<script lang="ts" setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2, Search, ChevronLeft, ChevronRight, ImageOff, ExternalLink, FileText, Factory, Clock, DollarSign, AlertCircle, LayoutGrid, List, CheckCircle2, Circle, ChevronDown, ChevronUp, Play, Layers, FilePlus2, Plus, Trash2, Zap, Square } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData, type VehicleModel } from '@/composables/use-oem-data'
import { fetchGeneratedPages, fetchGeneratedPage, adaptivePipeline, createCustomPage, deleteCustomPage, createSubpage, deleteSubpage } from '@/lib/worker-api'
import ConfirmDialog from '@/components/confirm-dialog.vue'
import env from '@/utils/env'

const router = useRouter()
const { fetchOems, fetchVehicleModels } = useOemData()

interface VehicleModelPage {
  id: string
  slug: string
  name: string
  oem_id: string
  header: {
    slides: Array<{
      heading: string
      sub_heading: string
      button: string
      desktop: string
      mobile: string
      bottom_strip: Array<{ heading: string; sub_heading: string }>
    }>
  }
  content: {
    rendered: string
    sections?: any[]
  }
  form: boolean
  variant_link: string
  generated_at: string
  source_url: string
  version: number
  total_cost_usd?: number
  total_tokens?: number
  page_type?: string
  parent_slug?: string
  subpage_type?: string
  subpage_name?: string
}

const oems = ref<{ id: string; name: string }[]>([])
const allModels = ref<VehicleModel[]>([])
const loading = ref(true)
const filterOem = ref('all')
const searchQuery = ref('')
const page = ref(1)
const perPage = ref(24)
const viewMode = ref<'grid' | 'coverage'>('coverage')

// Page data: slug list per OEM, and cached full page objects
const allSlugs = ref<{ oem_id: string; slug: string }[]>([])
const pageCache = ref<Map<string, VehicleModelPage>>(new Map())

// Inline generation tracking
const generating = ref(new Set<string>())
const generateErrors = ref(new Map<string, string>())

// Custom page creation state
const customPageName = ref('')
const customPageSlug = ref('')
const creatingCustomPage = ref<Record<string, boolean>>({})
const showCustomPageForm = ref<Record<string, boolean>>({})

// Custom page deletion state
const deletingPage = ref<{ oem_id: string; slug: string; name: string } | null>(null)
const deleteLoading = ref(false)
const showDeleteDialog = computed({
  get: () => !!deletingPage.value,
  set: (v: boolean) => { if (!v) deletingPage.value = null },
})

// Subpage types
const SUBPAGE_TYPES = [
  { slug: 'specs', name: 'Specifications' },
  { slug: 'design', name: 'Design' },
  { slug: 'performance', name: 'Performance' },
  { slug: 'safety', name: 'Safety' },
  { slug: 'gallery', name: 'Gallery' },
  { slug: 'pricing', name: 'Pricing & Offers' },
  { slug: 'lifestyle', name: 'Lifestyle' },
  { slug: 'accessories', name: 'Accessories' },
  { slug: 'colours', name: 'Colours' },
]

// Track which models have subpage panel expanded
const expandedModels = ref(new Set<string>())

// Subpage creation state
const showSubpageMenu = ref<string | null>(null)
const showCustomSubpageForm = ref<string | null>(null)
const customSubpageName = ref('')
const customSubpageSlug = ref('')
const creatingSubpage = ref(false)

// Subpage deletion state
const deletingSubpage = ref<{ oem_id: string; modelSlug: string; subpageSlug: string; name: string } | null>(null)
const deleteSubpageLoading = ref(false)
const showDeleteSubpageDialog = computed({
  get: () => !!deletingSubpage.value,
  set: (v: boolean) => { if (!v) deletingSubpage.value = null },
})

// Group subpages by parent model from allSlugs
const subpagesByModel = computed(() => {
  const map: Record<string, { slug: string; subpageSlug: string; oem_id: string }[]> = {}
  for (const s of allSlugs.value) {
    if (s.slug.includes('--')) {
      const [parentSlug, subSlug] = s.slug.split('--', 2)
      const key = `${s.oem_id}/${parentSlug}`
      if (!map[key]) map[key] = []
      map[key].push({ slug: s.slug, subpageSlug: subSlug, oem_id: s.oem_id })
    }
  }
  return map
})

function toggleModelExpand(oemId: string, modelSlug: string) {
  const key = `${oemId}/${modelSlug}`
  if (expandedModels.value.has(key)) {
    expandedModels.value.delete(key)
    showSubpageMenu.value = null
    showCustomSubpageForm.value = null
  } else {
    expandedModels.value.add(key)
  }
}

function getSubpages(oemId: string, modelSlug: string) {
  return subpagesByModel.value[`${oemId}/${modelSlug}`] || []
}

function subpageCount(oemId: string, modelSlug: string): number {
  return getSubpages(oemId, modelSlug).length
}

function getSubpageDisplayName(subpageSlug: string): string {
  const predefined = SUBPAGE_TYPES.find(t => t.slug === subpageSlug)
  if (predefined) return predefined.name
  // Format custom slug to title case
  return subpageSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function existingSubpageSlugs(oemId: string, modelSlug: string): Set<string> {
  return new Set(getSubpages(oemId, modelSlug).map(s => s.subpageSlug))
}

async function handleCreateSubpage(oemId: string, modelSlug: string, subpageSlug: string, name: string, subpageType?: string) {
  creatingSubpage.value = true
  try {
    await createSubpage(oemId, modelSlug, subpageSlug, name, subpageType)
    const compositeSlug = `${modelSlug}--${subpageSlug}`
    allSlugs.value = [...allSlugs.value, { oem_id: oemId, slug: compositeSlug }]
    showSubpageMenu.value = null
    showCustomSubpageForm.value = null
    customSubpageName.value = ''
    customSubpageSlug.value = ''
    router.push(`/dashboard/page-builder/${oemId}-${compositeSlug}`)
  } catch (err: any) {
    alert(`Failed to create subpage: ${err?.message || 'Unknown error'}`)
  } finally {
    creatingSubpage.value = false
  }
}

async function handleCreateCustomSubpage(oemId: string, modelSlug: string) {
  const name = customSubpageName.value.trim()
  const slug = customSubpageSlug.value.trim() || toKebabCase(name)
  if (!name || !slug) return
  await handleCreateSubpage(oemId, modelSlug, slug, name, 'custom')
}

async function handleDeleteSubpage() {
  const sp = deletingSubpage.value
  if (!sp) return
  deleteSubpageLoading.value = true
  try {
    await deleteSubpage(sp.oem_id, sp.modelSlug, sp.subpageSlug)
    const compositeSlug = `${sp.modelSlug}--${sp.subpageSlug}`
    allSlugs.value = allSlugs.value.filter(
      s => !(s.oem_id === sp.oem_id && s.slug === compositeSlug)
    )
    pageCache.value.delete(`${sp.oem_id}-${compositeSlug}`)
    deletingSubpage.value = null
  } catch (err: any) {
    alert(`Failed to delete subpage: ${err?.message || 'Unknown error'}`)
  } finally {
    deleteSubpageLoading.value = false
  }
}

async function handleDeleteCustomPage() {
  const page = deletingPage.value
  if (!page) return
  deleteLoading.value = true
  try {
    await deleteCustomPage(page.oem_id, page.slug)
    allSlugs.value = allSlugs.value.filter(
      s => !(s.oem_id === page.oem_id && s.slug === page.slug)
    )
    pageCache.value.delete(`${page.oem_id}-${page.slug}`)
    deletingPage.value = null
  } catch (err: any) {
    alert(`Failed to delete page: ${err?.message || 'Unknown error'}`)
  } finally {
    deleteLoading.value = false
  }
}

function toKebabCase(str: string) {
  if (!str?.trim()) return ''
  return str.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

function toggleCustomPageForm(oemId: string) {
  if (showCustomPageForm.value[oemId]) {
    showCustomPageForm.value[oemId] = false
  } else {
    showCustomPageForm.value[oemId] = true
  }
  // Always reset form fields when toggling
  customPageName.value = ''
  customPageSlug.value = ''
}

// Custom pages: slugs that exist in R2 but don't match any vehicle_model and aren't subpages
const customPagesByOem = computed(() => {
  const modelSlugs = new Set(allModels.value.map(m => `${m.oem_id}/${m.slug}`))
  const result: Record<string, { slug: string; oem_id: string }[]> = {}
  for (const s of allSlugs.value) {
    // Skip subpages (contain --) and matching model pages
    if (s.slug.includes('--')) continue
    if (!modelSlugs.has(`${s.oem_id}/${s.slug}`)) {
      if (!result[s.oem_id]) result[s.oem_id] = []
      result[s.oem_id].push(s)
    }
  }
  return result
})

const totalCustomPages = computed(() => {
  return Object.values(customPagesByOem.value).reduce((sum, pages) => sum + pages.length, 0)
})

async function handleCreateCustomPage(oemId: string) {
  const name = customPageName.value.trim()
  const slug = customPageSlug.value.trim() || toKebabCase(name)
  if (!name || !slug) return

  // Check collision
  if (generatedSlugsSet.value.has(`${oemId}/${slug}`)) {
    alert(`A page with slug "${slug}" already exists for this OEM.`)
    return
  }

  creatingCustomPage.value[oemId] = true
  try {
    await createCustomPage(oemId, slug, name)
    // Add to allSlugs for immediate UI update
    allSlugs.value = [...allSlugs.value, { oem_id: oemId, slug }]
    // Reset form
    customPageName.value = ''
    customPageSlug.value = ''
    showCustomPageForm.value[oemId] = false
    // Navigate to page builder
    router.push(`/dashboard/page-builder/${oemId}-${slug}`)
  } catch (err: any) {
    alert(`Failed to create custom page: ${err?.message || 'Unknown error'}`)
  } finally {
    creatingCustomPage.value[oemId] = false
  }
}

function getCustomPageData(item: { oem_id: string; slug: string }) {
  return pageCache.value.get(fullSlug(item)) ?? null
}

const OEM_IDS = [
  'chery-au', 'ford-au', 'foton-au', 'gac-au', 'gmsv-au', 'gwm-au', 'hyundai-au',
  'isuzu-au', 'kia-au', 'kgm-au', 'ldv-au', 'mazda-au', 'mitsubishi-au',
  'nissan-au', 'subaru-au', 'suzuki-au', 'toyota-au', 'volkswagen-au',
]

// Track collapsed OEM groups in coverage view
const collapsedOems = ref(new Set<string>())

function toggleOemCollapse(oemId: string) {
  if (collapsedOems.value.has(oemId)) {
    collapsedOems.value.delete(oemId)
  } else {
    collapsedOems.value.add(oemId)
  }
}

onMounted(async () => {
  try {
    const [oemList, models] = await Promise.all([
      fetchOems(),
      fetchVehicleModels(),
    ])
    oems.value = oemList
    allModels.value = models

    // Fetch slug lists from all OEMs in parallel
    const results = await Promise.allSettled(
      OEM_IDS.map(async (oemId) => {
        const res = await fetchGeneratedPages(oemId)
        return { oemId, pages: res.pages as string[] }
      }),
    )

    const slugs: { oem_id: string; slug: string }[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.pages?.length) {
        for (const s of r.value.pages) {
          slugs.push({ oem_id: r.value.oemId, slug: s })
        }
      }
    }
    allSlugs.value = slugs

    // Prefetch first batch of page details for stats and cards
    await prefetchPages(slugs.slice(0, 48))
  }
  finally {
    loading.value = false
  }
})

async function prefetchPages(items: { oem_id: string; slug: string }[]) {
  const toFetch = items.filter(i => !pageCache.value.has(fullSlug(i)))
  if (!toFetch.length) return
  const results = await Promise.allSettled(
    toFetch.map(async (item) => {
      const data = await fetchGeneratedPage(fullSlug(item))
      return { key: fullSlug(item), data: data as VehicleModelPage }
    }),
  )
  for (const r of results) {
    if (r.status === 'fulfilled') {
      pageCache.value.set(r.value.key, r.value.data)
    }
  }
}

function fullSlug(item: { oem_id: string; slug: string }) {
  return `${item.oem_id}-${item.slug}`
}

// Set of generated slugs for fast lookup: "ford-au/ranger" style
const generatedSlugsSet = computed(() => {
  const set = new Set<string>()
  for (const s of allSlugs.value) {
    set.add(`${s.oem_id}/${s.slug}`)
  }
  return set
})

function isModelPageCreated(model: VehicleModel): boolean {
  return generatedSlugsSet.value.has(`${model.oem_id}/${model.slug}`)
}

function getModelPageSlug(model: VehicleModel): { oem_id: string; slug: string } | null {
  if (!isModelPageCreated(model)) return null
  return { oem_id: model.oem_id, slug: model.slug }
}

function getModelPageData(model: VehicleModel): VehicleModelPage | null {
  const item = getModelPageSlug(model)
  if (!item) return null
  return pageCache.value.get(fullSlug(item)) ?? null
}

function modelKey(model: VehicleModel) {
  return `${model.oem_id}/${model.slug}`
}

// Inline adaptive pipeline trigger
async function triggerGenerate(model: VehicleModel, event: Event) {
  event.stopPropagation()
  const key = modelKey(model)
  if (generating.value.has(key)) return

  generating.value.add(key)
  generateErrors.value.delete(key)

  try {
    await adaptivePipeline(model.oem_id, model.slug)
    // Add to allSlugs so UI updates immediately
    if (!isModelPageCreated(model)) {
      allSlugs.value = [...allSlugs.value, { oem_id: model.oem_id, slug: model.slug }]
    }
    // Fetch the new page data
    await prefetchPages([{ oem_id: model.oem_id, slug: model.slug }])
  } catch (err: any) {
    generateErrors.value.set(key, err?.message || 'Generation failed')
  } finally {
    generating.value.delete(key)
  }
}

function isGenerating(model: VehicleModel): boolean {
  return generating.value.has(modelKey(model))
}

function getGenerateError(model: VehicleModel): string | null {
  return generateErrors.value.get(modelKey(model)) ?? null
}

// Bulk generation: generate all pending models for an OEM
const bulkProgress = ref<Record<string, { done: number; total: number; errors: number; running: boolean }>>({})

function isBulkRunning(oemId: string): boolean {
  return bulkProgress.value[oemId]?.running ?? false
}

function getBulkProgress(oemId: string) {
  return bulkProgress.value[oemId] ?? null
}

// AbortController per OEM for cancellation
const bulkAbort = ref<Record<string, AbortController>>({})

async function triggerGenerateAll(oemId: string, event: Event) {
  event.stopPropagation()
  if (isBulkRunning(oemId)) return

  const pendingModels = allModels.value.filter(m => m.oem_id === oemId && !isModelPageCreated(m))
  if (!pendingModels.length) return

  const controller = new AbortController()
  bulkAbort.value[oemId] = controller
  bulkProgress.value[oemId] = { done: 0, total: pendingModels.length, errors: 0, running: true }

  for (const model of pendingModels) {
    if (controller.signal.aborted) break

    const key = modelKey(model)
    generating.value.add(key)
    generateErrors.value.delete(key)

    try {
      await adaptivePipeline(model.oem_id, model.slug)
      if (!isModelPageCreated(model)) {
        allSlugs.value = [...allSlugs.value, { oem_id: model.oem_id, slug: model.slug }]
      }
      await prefetchPages([{ oem_id: model.oem_id, slug: model.slug }])
    } catch (err: any) {
      generateErrors.value.set(key, err?.message || 'Generation failed')
      bulkProgress.value[oemId] = {
        ...bulkProgress.value[oemId],
        errors: bulkProgress.value[oemId].errors + 1,
      }
    } finally {
      generating.value.delete(key)
      bulkProgress.value[oemId] = {
        ...bulkProgress.value[oemId],
        done: bulkProgress.value[oemId].done + 1,
      }
    }
  }

  bulkProgress.value[oemId] = { ...bulkProgress.value[oemId], running: false }
  delete bulkAbort.value[oemId]
}

function stopBulkGenerate(oemId: string, event: Event) {
  event.stopPropagation()
  bulkAbort.value[oemId]?.abort()
}

// Coverage data grouped by OEM
const coverageByOem = computed(() => {
  const groups: { oemId: string; oemName: string; models: VehicleModel[]; created: number; total: number }[] = []

  for (const oemId of OEM_IDS) {
    const models = allModels.value.filter(m => m.oem_id === oemId)
    if (!models.length) continue
    const created = models.filter(m => isModelPageCreated(m)).length
    groups.push({
      oemId,
      oemName: oemName(oemId),
      models,
      created,
      total: models.length,
    })
  }

  return groups
})

// Filter coverage view
const filteredCoverage = computed(() => {
  let groups = coverageByOem.value
  if (filterOem.value !== 'all') {
    groups = groups.filter(g => g.oemId === filterOem.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    groups = groups.map(g => ({
      ...g,
      models: g.models.filter(m =>
        m.name.toLowerCase().includes(q)
        || m.slug.toLowerCase().includes(q)
        || (m.body_type?.toLowerCase().includes(q))
      ),
    })).filter(g => g.models.length > 0)
    // Recalculate created count for filtered models
    groups = groups.map(g => ({
      ...g,
      created: g.models.filter(m => isModelPageCreated(m)).length,
      total: g.models.length,
    }))
  }
  return groups
})

// Overall coverage stats
const coverageStats = computed(() => {
  const total = allModels.value.length
  const created = allModels.value.filter(m => isModelPageCreated(m)).length
  const pending = total - created
  const percentage = total > 0 ? Math.round((created / total) * 100) : 0
  return { total, created, pending, percentage }
})

// Section count helper
function sectionCount(model: VehicleModel): number {
  const p = getModelPageData(model)
  return p?.content?.sections?.length ?? 0
}

// Filter & pagination (for grid view)
const filtered = computed(() => {
  let list = allSlugs.value
  if (filterOem.value !== 'all') {
    list = list.filter(s => s.oem_id === filterOem.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter((s) => {
      const cached = pageCache.value.get(fullSlug(s))
      return s.slug.toLowerCase().includes(q)
        || cached?.name?.toLowerCase().includes(q)
        || s.oem_id.toLowerCase().includes(q)
    })
  }
  return list
})

const totalPages = computed(() => Math.ceil(filtered.value.length / perPage.value) || 1)
const paginated = computed(() => {
  const start = (page.value - 1) * perPage.value
  return filtered.value.slice(start, start + perPage.value)
})

// Prefetch pages when pagination changes
watch(paginated, async (items) => {
  await prefetchPages(items)
}, { immediate: true })

function setFilterOem(oem: any) {
  filterOem.value = String(oem ?? 'all')
  page.value = 1
}
function onSearch() {
  page.value = 1
}

// Stats
const stats = computed(() => {
  const cached = [...pageCache.value.values()]
  const oemSet = new Set(allSlugs.value.map(s => s.oem_id))
  const latestDate = cached.reduce((max, p) => {
    const d = p.generated_at
    return d && d > max ? d : max
  }, '')
  const costs = cached.filter(p => p.total_cost_usd).map(p => p.total_cost_usd!)
  const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0

  return {
    total: allSlugs.value.length,
    oemsCovered: oemSet.size,
    latest: latestDate,
    avgCost,
    cached: cached.length,
  }
})

const oemCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const s of allSlugs.value) {
    counts[s.oem_id] = (counts[s.oem_id] || 0) + 1
  }
  return counts
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function getPageData(item: { oem_id: string; slug: string }) {
  return pageCache.value.get(fullSlug(item))
}

function heroImage(item: { oem_id: string; slug: string }) {
  const p = getPageData(item)
  let url = p?.header?.slides?.[0]?.desktop || null

  // Convert relative URLs to absolute by prepending the Worker URL
  if (url && url.startsWith('/')) {
    url = `${env.VITE_SERVER_API_URL}${url}`
  }

  return url
}

function formatDate(iso: string | undefined) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCost(cost: number | undefined) {
  if (!cost) return '-'
  return `$${cost.toFixed(4)}`
}

function hasStructuredSections(p: VehicleModelPage | null): boolean {
  return !!(p?.content?.sections?.length)
}

function isClonedPage(p: VehicleModelPage | null): boolean {
  if (!p?.content?.rendered) return false
  return p.content.rendered.includes('tailwindcss.com') || p.content.rendered.includes('<link rel="stylesheet"')
}

type PageStatus = 'generated' | 'structured' | 'cloned'

function getPageStatus(p: VehicleModelPage | null): PageStatus {
  if (hasStructuredSections(p)) return 'structured'
  if (isClonedPage(p)) return 'cloned'
  return 'generated'
}

const statusConfig: Record<PageStatus, { label: string; color: string }> = {
  structured: { label: 'Structured', color: 'bg-emerald-600/80' },
  cloned: { label: 'Cloned', color: 'bg-amber-600/80' },
  generated: { label: 'Generated', color: 'bg-blue-600/80' },
}

function openPageBuilder(item: { oem_id: string; slug: string }) {
  router.push(`/dashboard/page-builder/${fullSlug(item)}`)
}
</script>

<template>
  <BasicPage title="Model Pages" description="AI-generated model pages (Gemini + Claude pipeline)" sticky>
    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <!-- View toggle -->
      <div class="inline-flex rounded-md border overflow-hidden">
        <button
          class="flex items-center justify-center size-9 transition-colors"
          :class="viewMode === 'coverage' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
          title="Coverage Tracker"
          @click="viewMode = 'coverage'"
        >
          <List class="size-4" />
        </button>
        <button
          class="flex items-center justify-center size-9 border-l transition-colors"
          :class="viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
          title="Page Gallery"
          @click="viewMode = 'grid'"
        >
          <LayoutGrid class="size-4" />
        </button>
      </div>

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
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <UiInput
          v-model="searchQuery"
          placeholder="Search models..."
          class="pl-8 w-[250px] h-9"
          @input="onSearch"
        />
      </div>
      <UiSelect v-if="viewMode === 'grid'" :model-value="String(perPage)" @update:model-value="v => { perPage = Number(v); page = 1 }">
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
        <template v-if="viewMode === 'coverage'">
          {{ coverageStats.created }}/{{ coverageStats.total }} models ({{ coverageStats.percentage }}%)
        </template>
        <template v-else>
          {{ filtered.length }} pages
        </template>
      </span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Summary Stats -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Total Pages</UiCardTitle>
            <FileText class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.total }}</div>
            <p class="text-xs text-muted-foreground">{{ totalCustomPages > 0 ? `Incl. ${totalCustomPages} custom` : 'Generated pages' }}</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Total Models</UiCardTitle>
            <Factory class="size-4 text-blue-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-blue-500">{{ coverageStats.total }}</div>
            <p class="text-xs text-muted-foreground">Across {{ oems.length }} OEMs</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Coverage</UiCardTitle>
            <CheckCircle2 class="size-4 text-emerald-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-emerald-500">{{ coverageStats.percentage }}%</div>
            <p class="text-xs text-muted-foreground">{{ coverageStats.created }} of {{ coverageStats.total }} models</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Pending</UiCardTitle>
            <AlertCircle class="size-4 text-orange-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-orange-500">{{ coverageStats.pending }}</div>
            <p class="text-xs text-muted-foreground">Models without pages</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Latest</UiCardTitle>
            <Clock class="size-4 text-green-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-lg font-bold text-green-500">{{ formatDate(stats.latest) }}</div>
            <p class="text-xs text-muted-foreground">Most recent generation</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Avg Cost</UiCardTitle>
            <DollarSign class="size-4 text-amber-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-amber-500">{{ formatCost(stats.avgCost) }}</div>
            <p class="text-xs text-muted-foreground">Per page (USD)</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- ===== COVERAGE VIEW ===== -->
      <template v-if="viewMode === 'coverage'">
        <div class="space-y-3">
          <div
            v-for="group in filteredCoverage"
            :key="group.oemId"
            class="border rounded-lg overflow-hidden"
          >
            <!-- OEM Header -->
            <div
              class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
              @click="toggleOemCollapse(group.oemId)"
            >
              <component
                :is="collapsedOems.has(group.oemId) ? ChevronRight : ChevronDown"
                class="size-4 text-muted-foreground shrink-0"
              />
              <span class="font-semibold text-sm">{{ group.oemName }}</span>
              <!-- Progress bar -->
              <div class="flex-1 mx-3">
                <div class="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="group.created === group.total ? 'bg-emerald-500' : group.created > 0 ? 'bg-blue-500' : 'bg-muted-foreground/20'"
                    :style="{ width: `${group.total > 0 ? (group.created / group.total) * 100 : 0}%` }"
                  />
                </div>
              </div>
              <span class="text-sm tabular-nums shrink-0" :class="group.created === group.total ? 'text-emerald-600 font-medium' : 'text-muted-foreground'">
                {{ group.created }}/{{ group.total }}
              </span>

              <!-- Bulk generate: progress indicator -->
              <span
                v-if="isBulkRunning(group.oemId)"
                class="text-[11px] text-blue-600 font-medium tabular-nums shrink-0"
              >
                {{ getBulkProgress(group.oemId)!.done }}/{{ getBulkProgress(group.oemId)!.total }}
                <span v-if="getBulkProgress(group.oemId)!.errors" class="text-red-500 ml-1">
                  ({{ getBulkProgress(group.oemId)!.errors }} failed)
                </span>
              </span>
              <!-- Bulk generate: completed summary -->
              <span
                v-else-if="getBulkProgress(group.oemId) && !isBulkRunning(group.oemId)"
                class="text-[11px] tabular-nums shrink-0"
                :class="getBulkProgress(group.oemId)!.errors ? 'text-amber-600' : 'text-emerald-600'"
              >
                Done{{ getBulkProgress(group.oemId)!.errors ? ` (${getBulkProgress(group.oemId)!.errors} failed)` : '' }}
              </span>

              <!-- Bulk generate: stop button -->
              <UiButton
                v-if="isBulkRunning(group.oemId)"
                size="sm"
                variant="outline"
                class="h-7 text-xs px-2.5 shrink-0 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                title="Stop generation"
                @click="stopBulkGenerate(group.oemId, $event)"
              >
                <Square class="size-3 mr-1 fill-current" />
                Stop
              </UiButton>
              <!-- Bulk generate: generate all button -->
              <UiButton
                v-else-if="group.created < group.total"
                size="sm"
                variant="outline"
                class="h-7 text-xs px-2.5 shrink-0"
                title="Generate all pending model pages for this OEM"
                @click="triggerGenerateAll(group.oemId, $event)"
              >
                <Zap class="size-3 mr-1" />
                Generate All
              </UiButton>
            </div>

            <!-- Model rows -->
            <div v-if="!collapsedOems.has(group.oemId)" class="border-t divide-y">
              <div v-for="model in group.models" :key="model.id">
                <div
                  class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                  @click="openPageBuilder({ oem_id: model.oem_id, slug: model.slug })"
                >
                  <!-- Status icon -->
                  <CheckCircle2
                    v-if="isModelPageCreated(model)"
                    class="size-4 text-emerald-500 shrink-0"
                  />
                  <Loader2
                    v-else-if="isGenerating(model)"
                    class="size-4 text-blue-500 shrink-0 animate-spin"
                  />
                  <Circle
                    v-else
                    class="size-4 text-muted-foreground/40 shrink-0"
                  />

                  <!-- Model name -->
                  <span class="text-sm min-w-0 truncate" :class="isModelPageCreated(model) ? 'font-medium' : 'text-muted-foreground'">
                    {{ model.name }}
                  </span>

                  <!-- Body type -->
                  <span v-if="model.body_type" class="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {{ model.body_type }}
                  </span>

                  <!-- Subpage count badge -->
                  <button
                    v-if="isModelPageCreated(model) && subpageCount(model.oem_id, model.slug) > 0"
                    class="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded shrink-0 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                    :title="`${subpageCount(model.oem_id, model.slug)} subpage(s)`"
                    @click.stop="toggleModelExpand(model.oem_id, model.slug)"
                  >
                    <Layers class="size-3" />
                    {{ subpageCount(model.oem_id, model.slug) }} subpage{{ subpageCount(model.oem_id, model.slug) > 1 ? 's' : '' }}
                    <component
                      :is="expandedModels.has(`${model.oem_id}/${model.slug}`) ? ChevronUp : ChevronDown"
                      class="size-3"
                    />
                  </button>
                  <!-- Expand toggle for models with pages but no subpages yet -->
                  <button
                    v-else-if="isModelPageCreated(model)"
                    class="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-indigo-600 px-1.5 py-0.5 rounded shrink-0 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                    title="Add subpage"
                    @click.stop="toggleModelExpand(model.oem_id, model.slug)"
                  >
                    <Plus class="size-3" />
                    Subpage
                  </button>

                  <!-- Spacer -->
                  <div class="flex-1" />

                  <!-- Error message -->
                  <span v-if="getGenerateError(model)" class="text-[10px] text-red-500 max-w-[200px] truncate shrink-0" :title="getGenerateError(model)!">
                    {{ getGenerateError(model) }}
                  </span>

                  <!-- Page info for created pages -->
                  <template v-if="isModelPageCreated(model)">
                    <!-- Section count -->
                    <span v-if="sectionCount(model)" class="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Layers class="size-3" />
                      {{ sectionCount(model) }}
                    </span>
                    <!-- Status badge -->
                    <span
                      :class="statusConfig[getPageStatus(getModelPageData(model))].color"
                      class="text-white text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                    >
                      {{ statusConfig[getPageStatus(getModelPageData(model))].label }}
                    </span>
                    <span
                      v-if="getModelPageData(model)?.version"
                      class="text-[10px] text-muted-foreground shrink-0"
                    >
                      v{{ getModelPageData(model)!.version }}
                    </span>
                    <span class="text-[10px] text-muted-foreground shrink-0 w-20 text-right">
                      {{ formatDate(getModelPageData(model)?.generated_at) }}
                    </span>
                  </template>

                  <!-- Actions for pending pages -->
                  <template v-else-if="!isGenerating(model)">
                    <UiButton
                      size="sm"
                      variant="outline"
                      class="h-7 text-xs px-2.5 shrink-0"
                      title="Run adaptive pipeline (Clone + Structure + Generate)"
                      @click="triggerGenerate(model, $event)"
                    >
                      <Play class="size-3 mr-1" />
                      Generate
                    </UiButton>
                  </template>

                  <!-- Generating state -->
                  <template v-else>
                    <span class="text-[10px] text-blue-500 font-medium shrink-0">
                      Generating...
                    </span>
                  </template>
                </div>

                <!-- Subpage list (expanded) -->
                <div
                  v-if="isModelPageCreated(model) && expandedModels.has(`${model.oem_id}/${model.slug}`)"
                  class="bg-indigo-50/50 dark:bg-indigo-950/20 border-t border-dashed"
                >
                  <!-- Existing subpages -->
                  <div
                    v-for="sp in getSubpages(model.oem_id, model.slug)"
                    :key="`sp-${sp.oem_id}-${sp.slug}`"
                    class="flex items-center gap-3 pl-11 pr-4 py-2 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
                    @click="openPageBuilder({ oem_id: sp.oem_id, slug: sp.slug })"
                  >
                    <FileText class="size-3.5 text-indigo-500 shrink-0" />
                    <span class="text-sm min-w-0 truncate">
                      {{ getSubpageDisplayName(sp.subpageSlug) }}
                    </span>
                    <span class="text-[10px] text-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded shrink-0">
                      {{ sp.subpageSlug }}
                    </span>
                    <div class="flex-1" />
                    <button
                      class="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Delete subpage"
                      @click.stop="deletingSubpage = { oem_id: sp.oem_id, modelSlug: model.slug, subpageSlug: sp.subpageSlug, name: getSubpageDisplayName(sp.subpageSlug) }"
                    >
                      <Trash2 class="size-3.5" />
                    </button>
                  </div>

                  <!-- Add subpage controls -->
                  <div class="pl-11 pr-4 py-2 border-t border-dashed">
                    <!-- Predefined type buttons -->
                    <div v-if="showSubpageMenu !== `${model.oem_id}/${model.slug}`" class="flex items-center gap-1">
                      <UiButton
                        size="sm"
                        variant="ghost"
                        class="h-6 text-xs px-2 text-indigo-600 dark:text-indigo-400"
                        @click.stop="showSubpageMenu = `${model.oem_id}/${model.slug}`"
                      >
                        <Plus class="size-3 mr-1" />
                        Add Subpage
                      </UiButton>
                    </div>
                    <div v-else class="space-y-2" @click.stop>
                      <div class="flex flex-wrap gap-1">
                        <UiButton
                          v-for="stype in SUBPAGE_TYPES.filter(t => !existingSubpageSlugs(model.oem_id, model.slug).has(t.slug))"
                          :key="stype.slug"
                          size="sm"
                          variant="outline"
                          class="h-6 text-[11px] px-2"
                          :disabled="creatingSubpage"
                          @click="handleCreateSubpage(model.oem_id, model.slug, stype.slug, stype.name, stype.slug)"
                        >
                          {{ stype.name }}
                        </UiButton>
                        <UiButton
                          size="sm"
                          variant="outline"
                          class="h-6 text-[11px] px-2 border-dashed"
                          @click="showCustomSubpageForm = `${model.oem_id}/${model.slug}`"
                        >
                          Custom...
                        </UiButton>
                      </div>
                      <!-- Custom subpage form -->
                      <div
                        v-if="showCustomSubpageForm === `${model.oem_id}/${model.slug}`"
                        class="flex items-center gap-2"
                      >
                        <UiInput
                          v-model="customSubpageName"
                          placeholder="Page name"
                          class="h-7 text-xs flex-1"
                          @input="customSubpageSlug = toKebabCase(customSubpageName)"
                          @keydown.enter="handleCreateCustomSubpage(model.oem_id, model.slug)"
                        />
                        <span class="text-[10px] text-muted-foreground shrink-0">/{{ customSubpageSlug || '...' }}</span>
                        <UiButton
                          size="sm"
                          variant="default"
                          class="h-7 text-xs px-3 shrink-0"
                          :disabled="!customSubpageName.trim() || creatingSubpage"
                          @click="handleCreateCustomSubpage(model.oem_id, model.slug)"
                        >
                          <Loader2 v-if="creatingSubpage" class="size-3 mr-1 animate-spin" />
                          Create
                        </UiButton>
                      </div>
                      <div class="flex justify-end">
                        <UiButton
                          size="sm"
                          variant="ghost"
                          class="h-5 text-[10px] px-1.5 text-muted-foreground"
                          @click="showSubpageMenu = null; showCustomSubpageForm = null"
                        >
                          Cancel
                        </UiButton>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Custom Pages subsection -->
              <div class="bg-muted/20">
                <!-- Custom page header / add button -->
                <div class="flex items-center gap-2 px-4 py-2 border-t border-dashed">
                  <FilePlus2 class="size-3.5 text-violet-500 shrink-0" />
                  <span class="text-xs font-medium text-muted-foreground">Custom Pages</span>
                  <span v-if="customPagesByOem[group.oemId]?.length" class="text-[10px] text-muted-foreground">({{ customPagesByOem[group.oemId].length }})</span>
                  <div class="flex-1" />
                  <UiButton
                    size="sm"
                    variant="ghost"
                    class="h-6 text-xs px-2"
                    @click.stop="toggleCustomPageForm(group.oemId)"
                  >
                    <Plus class="size-3 mr-1" />
                    Add
                  </UiButton>
                </div>

                <!-- Existing custom pages -->
                <div
                  v-for="cp in customPagesByOem[group.oemId] || []"
                  :key="`custom-${cp.oem_id}-${cp.slug}`"
                  class="flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors cursor-pointer"
                  @click="openPageBuilder(cp)"
                >
                  <FilePlus2 class="size-4 text-violet-500 shrink-0" />
                  <span class="text-sm font-medium min-w-0 truncate">
                    {{ getCustomPageData(cp)?.name || cp.slug }}
                  </span>
                  <span class="text-[10px] text-violet-500 bg-violet-100 dark:bg-violet-900/30 px-1.5 py-0.5 rounded shrink-0">
                    Custom
                  </span>
                  <div class="flex-1" />
                  <template v-if="getCustomPageData(cp)">
                    <span v-if="getCustomPageData(cp)!.content?.sections?.length" class="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Layers class="size-3" />
                      {{ getCustomPageData(cp)!.content.sections!.length }}
                    </span>
                    <span class="text-[10px] text-muted-foreground shrink-0 w-20 text-right">
                      {{ formatDate(getCustomPageData(cp)!.generated_at) }}
                    </span>
                  </template>
                  <button
                    class="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Delete custom page"
                    @click.stop="deletingPage = { oem_id: cp.oem_id, slug: cp.slug, name: getCustomPageData(cp)?.name || cp.slug }"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>

                <!-- Create custom page form -->
                <div
                  v-if="showCustomPageForm[group.oemId]"
                  class="flex items-center gap-2 px-4 py-2 border-t border-dashed"
                  @click.stop
                >
                  <UiInput
                    v-model="customPageName"
                    placeholder="Page name (e.g. Warranty)"
                    class="h-7 text-xs flex-1"
                    @input="customPageSlug = toKebabCase(customPageName)"
                    @keydown.enter="handleCreateCustomPage(group.oemId)"
                  />
                  <span class="text-[10px] text-muted-foreground shrink-0">/{{ customPageSlug || '...' }}</span>
                  <UiButton
                    size="sm"
                    variant="default"
                    class="h-7 text-xs px-3 shrink-0"
                    :disabled="!customPageName.trim() || creatingCustomPage[group.oemId]"
                    @click="handleCreateCustomPage(group.oemId)"
                  >
                    <Loader2 v-if="creatingCustomPage[group.oemId]" class="size-3 mr-1 animate-spin" />
                    Create
                  </UiButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="filteredCoverage.length === 0" class="text-center py-16">
          <FileText class="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p class="text-sm text-muted-foreground">No models found matching your search</p>
        </div>
      </template>

      <!-- ===== GRID VIEW ===== -->
      <template v-else>
        <!-- Pages Grid -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <UiCard
            v-for="item in paginated"
            :key="fullSlug(item)"
            class="overflow-hidden flex flex-col !py-0 cursor-pointer group"
            @click="openPageBuilder(item)"
          >
            <!-- Hero Image -->
            <div class="aspect-[16/9] relative bg-muted overflow-hidden">
              <img
                v-if="heroImage(item)"
                :src="heroImage(item)!"
                :alt="getPageData(item)?.name ?? item.slug"
                class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
              />
              <div v-if="!heroImage(item)" class="w-full h-full flex items-center justify-center">
                <ImageOff class="size-8 text-muted-foreground/20" />
              </div>
              <!-- Fallback for broken images -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <ImageOff class="size-8 text-muted-foreground/20" />
              </div>
              <!-- OEM badge -->
              <div class="absolute top-2 left-2">
                <span class="bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                  {{ oemName(item.oem_id) }}
                </span>
              </div>
              <!-- Status + Version badge -->
              <div class="absolute top-2 right-2 flex gap-1">
                <span
                  :class="statusConfig[getPageStatus(getPageData(item) ?? null)].color"
                  class="text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
                >
                  {{ statusConfig[getPageStatus(getPageData(item) ?? null)].label }}
                </span>
                <span
                  v-if="getPageData(item)?.version"
                  class="bg-indigo-600/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
                >
                  v{{ getPageData(item)!.version }}
                </span>
              </div>
              <!-- Text overlay -->
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-10 pb-3 px-3">
                <h3 class="text-white text-sm font-bold leading-tight drop-shadow-lg line-clamp-1">
                  {{ getPageData(item)?.name ?? item.slug }}
                </h3>
                <p
                  v-if="getPageData(item)?.header?.slides?.[0]?.sub_heading"
                  class="text-white/80 text-[11px] mt-0.5 drop-shadow line-clamp-1"
                >
                  {{ getPageData(item)!.header.slides[0].sub_heading }}
                </p>
              </div>
            </div>

            <!-- Card Footer -->
            <div class="px-3 py-2 flex items-center justify-between text-[10px] text-muted-foreground border-t">
              <span>{{ formatDate(getPageData(item)?.generated_at) }}</span>
              <div class="flex items-center gap-2">
                <span v-if="hasStructuredSections(getPageData(item) ?? null)" class="text-emerald-600">
                  {{ getPageData(item)!.content.sections!.length }} sections
                </span>
                <a
                  v-if="getPageData(item)?.source_url"
                  :href="getPageData(item)!.source_url"
                  target="_blank"
                  class="flex items-center gap-0.5 hover:text-foreground"
                  @click.stop
                >
                  <ExternalLink class="size-2.5" /> Source
                </a>
              </div>
            </div>
          </UiCard>
        </div>

        <!-- Empty state -->
        <div v-if="filtered.length === 0" class="text-center py-16">
          <FileText class="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p class="text-sm text-muted-foreground">No generated model pages found</p>
          <p class="text-xs text-muted-foreground mt-1">Run the page generation pipeline to create model pages</p>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex items-center justify-between mt-6 pt-4 border-t">
          <p class="text-sm text-muted-foreground">
            Page {{ page }} of {{ totalPages }}
            <span class="text-muted-foreground/60">({{ filtered.length }} pages)</span>
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
    </template>

    <!-- Delete custom page confirmation -->
    <ConfirmDialog
      v-model:open="showDeleteDialog"
      destructive
      confirm-button-text="Delete"
      :is-loading="deleteLoading"
      @confirm="handleDeleteCustomPage"
    >
      <template #title>Delete Custom Page</template>
      <template #description>
        <p>Are you sure you want to delete <strong>{{ deletingPage?.name }}</strong>? This action cannot be undone.</p>
      </template>
    </ConfirmDialog>

    <!-- Delete subpage confirmation -->
    <ConfirmDialog
      v-model:open="showDeleteSubpageDialog"
      destructive
      confirm-button-text="Delete"
      :is-loading="deleteSubpageLoading"
      @confirm="handleDeleteSubpage"
    >
      <template #title>Delete Subpage</template>
      <template #description>
        <p>Are you sure you want to delete the <strong>{{ deletingSubpage?.name }}</strong> subpage? This action cannot be undone.</p>
      </template>
    </ConfirmDialog>
  </BasicPage>
</template>
