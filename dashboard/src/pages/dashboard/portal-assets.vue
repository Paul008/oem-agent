<script lang="ts" setup>
import { onMounted, ref, watch, computed } from 'vue'
import { Loader2, Search, Image, Camera, Palette, Car, X, ChevronLeft, ChevronRight } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { usePortalAssets } from '@/composables/use-portal-assets'
import type { PortalAsset, PortalAssetCoverage, PortalAssetCampaign } from '@/composables/use-portal-assets'

const { fetchOems } = useOemData()
const {
  fetchPortalAssetsPage,
  fetchPortalAssetCoverage,
  fetchPortalAssetCampaigns,
  fetchRelatedAssets,
  fetchFacets,
  fetchPortalAssetStats,
  fetchParsedModels,
  thumbnailUrl,
} = usePortalAssets()

const ASSET_TYPES = ['IMAGE', 'VIDEO', 'DOCUMENT', 'TEMPLATE', 'OTHER']
const PAGE_SIZE = 60

// Filter state
const filterOem = ref('all')
const filterType = ref('all')
const filterModel = ref('all')
const filterNameplate = ref('all')
const filterMediaType = ref('all')
const filterUsageRights = ref('all')
const filterAssetTypeLabel = ref('all')
const filterCategoryLeaf = ref('all')
const filterExcludeExpired = ref(false)
const searchQuery = ref('')

// Data state
const oems = ref<{ id: string; name: string }[]>([])
const coverage = ref<PortalAssetCoverage[]>([])
const campaigns = ref<PortalAssetCampaign[]>([])
const facets = ref<Record<string, { value: string; n: number }[]>>({})
const stats = ref({ total: 0, images: 0, renders: 0, models: 0 })
const models = ref<string[]>([])
const pageRows = ref<PortalAsset[]>([])
const pageTotal = ref(0)
const page = ref(1)
const loading = ref(true)
const loadingPage = ref(false)

const previewAsset = ref<PortalAsset | null>(null)
const relatedAssets = ref<PortalAsset[]>([])
const loadingRelated = ref(false)

function filterOpts() {
  return {
    oemId: filterOem.value === 'all' ? undefined : filterOem.value,
    assetType: filterType.value === 'all' ? undefined : filterType.value,
    model: filterModel.value === 'all' ? undefined : filterModel.value,
    nameplate: filterNameplate.value === 'all' ? undefined : filterNameplate.value,
    mediaType: filterMediaType.value === 'all' ? undefined : filterMediaType.value,
    usageRights: filterUsageRights.value === 'all' ? undefined : filterUsageRights.value,
    assetTypeLabel: filterAssetTypeLabel.value === 'all' ? undefined : filterAssetTypeLabel.value,
    categoryLeaf: filterCategoryLeaf.value === 'all' ? undefined : filterCategoryLeaf.value,
    excludeExpired: filterExcludeExpired.value || undefined,
    search: searchQuery.value.trim() || undefined,
  }
}

async function loadPage() {
  loadingPage.value = true
  try {
    const { rows, total } = await fetchPortalAssetsPage({
      ...filterOpts(),
      page: page.value,
      pageSize: PAGE_SIZE,
    })
    pageRows.value = rows
    pageTotal.value = total
  }
  finally {
    loadingPage.value = false
  }
}

async function refreshAggregates() {
  // Coverage + stats + model list + campaigns + facets are scoped to the active OEM.
  const oemId = filterOpts().oemId
  const [c, s, m, camps, f] = await Promise.all([
    fetchPortalAssetCoverage(oemId),
    fetchPortalAssetStats(oemId),
    fetchParsedModels(oemId),
    fetchPortalAssetCampaigns(oemId),
    fetchFacets(oemId),
  ])
  coverage.value = c
  stats.value = s
  models.value = m
  campaigns.value = camps
  facets.value = f
}

onMounted(async () => {
  try {
    oems.value = await fetchOems()
    await Promise.all([refreshAggregates(), loadPage()])
  }
  finally {
    loading.value = false
  }
})

// Reset to page 1 and refetch when filters change. Aggregates only re-run on
// OEM change (type/model don't affect the coverage view).
watch(filterOem, async () => {
  page.value = 1
  filterModel.value = 'all'
  await Promise.all([refreshAggregates(), loadPage()])
})
watch(
  [filterType, filterModel, filterNameplate, filterMediaType, filterUsageRights, filterAssetTypeLabel, filterCategoryLeaf, filterExcludeExpired],
  () => {
    page.value = 1
    loadPage()
  },
)

// Load related assets whenever the preview opens.
watch(previewAsset, async (a) => {
  relatedAssets.value = []
  if (!a) return
  loadingRelated.value = true
  try {
    relatedAssets.value = await fetchRelatedAssets(a, 24)
  }
  catch {
    relatedAssets.value = []
  }
  finally {
    loadingRelated.value = false
  }
})

// Debounced search — wait 300ms after the last keystroke.
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadPage()
  }, 300)
})

const pageCount = computed(() => Math.max(1, Math.ceil(pageTotal.value / PAGE_SIZE)))
const pageStart = computed(() => (page.value - 1) * PAGE_SIZE + (pageRows.value.length ? 1 : 0))
const pageEnd = computed(() => Math.min(page.value * PAGE_SIZE, pageTotal.value))

function go(delta: number) {
  const next = Math.min(pageCount.value, Math.max(1, page.value + delta))
  if (next !== page.value) {
    page.value = next
    loadPage()
  }
}

function resetFilters() {
  filterOem.value = 'all'
  filterType.value = 'all'
  filterModel.value = 'all'
  filterNameplate.value = 'all'
  filterMediaType.value = 'all'
  filterUsageRights.value = 'all'
  filterAssetTypeLabel.value = 'all'
  filterCategoryLeaf.value = 'all'
  filterExcludeExpired.value = false
  searchQuery.value = ''
}

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

const hasFilters = computed(() =>
  filterOem.value !== 'all'
  || filterType.value !== 'all'
  || filterModel.value !== 'all'
  || filterNameplate.value !== 'all'
  || filterMediaType.value !== 'all'
  || filterUsageRights.value !== 'all'
  || filterAssetTypeLabel.value !== 'all'
  || filterCategoryLeaf.value !== 'all'
  || filterExcludeExpired.value
  || !!searchQuery.value.trim(),
)

function fmtDate(s: string | null | undefined) {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isExpired(a: PortalAsset) {
  if (!a.expiry_date) return false
  return new Date(a.expiry_date).getTime() < Date.now()
}
</script>

<template>
  <BasicPage title="Portal Assets" description="Marketing portal assets synced from OEM platforms" sticky>
    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <UiSelect v-model="filterOem">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="Filter by OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All OEMs</UiSelectItem>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-model="filterType">
        <UiSelectTrigger class="w-[150px]">
          <UiSelectValue placeholder="Asset type" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Types</UiSelectItem>
          <UiSelectItem v-for="t in ASSET_TYPES" :key="t" :value="t">{{ t }}</UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-model="filterModel">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="Filter by model" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Models</UiSelectItem>
          <UiSelectItem v-for="m in models" :key="m" :value="m">{{ m }}</UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-if="campaigns.length" v-model="filterNameplate">
        <UiSelectTrigger class="w-[220px]">
          <UiSelectValue placeholder="Filter by campaign" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Campaigns ({{ campaigns.length }})</UiSelectItem>
          <UiSelectItem v-for="c in campaigns" :key="`${c.oem_id}-${c.nameplate}`" :value="c.nameplate">
            {{ c.nameplate }} &middot; {{ c.asset_count }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-if="facets.category_leaf?.length" v-model="filterCategoryLeaf">
        <UiSelectTrigger class="w-[220px]">
          <UiSelectValue placeholder="DAM category" />
        </UiSelectTrigger>
        <UiSelectContent class="max-h-[400px]">
          <UiSelectItem value="all">All DAM categories ({{ facets.category_leaf.length }})</UiSelectItem>
          <UiSelectItem v-for="f in facets.category_leaf" :key="f.value" :value="f.value">
            {{ f.value }} &middot; {{ f.n }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-if="facets.asset_type_label?.length" v-model="filterAssetTypeLabel">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="DAM type" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All DAM types</UiSelectItem>
          <UiSelectItem v-for="f in facets.asset_type_label" :key="f.value" :value="f.value">
            {{ f.value }} &middot; {{ f.n }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-if="facets.media_type?.length" v-model="filterMediaType">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="Media type" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All media types</UiSelectItem>
          <UiSelectItem v-for="f in facets.media_type" :key="f.value" :value="f.value">
            {{ f.value }} &middot; {{ f.n }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-if="facets.usage_rights?.length" v-model="filterUsageRights">
        <UiSelectTrigger class="w-[160px]">
          <UiSelectValue placeholder="Usage rights" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">Any rights</UiSelectItem>
          <UiSelectItem v-for="f in facets.usage_rights" :key="f.value" :value="f.value">
            {{ f.value }} &middot; {{ f.n }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <UiInput v-model="searchQuery" placeholder="Search assets..." class="pl-8 w-[220px] h-9" />
      </div>
      <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
        <UiCheckbox v-model:checked="filterExcludeExpired" />
        Hide expired
      </label>
      <UiButton v-if="hasFilters" size="sm" variant="ghost" @click="resetFilters">
        <X class="size-3.5 mr-1" />Reset
      </UiButton>
      <span class="text-sm text-muted-foreground ml-auto">
        <template v-if="loadingPage">Loading…</template>
        <template v-else-if="pageTotal === 0">0 assets</template>
        <template v-else>{{ pageStart.toLocaleString() }}–{{ pageEnd.toLocaleString() }} of {{ pageTotal.toLocaleString() }}</template>
      </span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Stats Cards -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Total Assets</UiCardTitle>
            <Image class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.total.toLocaleString() }}</div>
            <p class="text-xs text-muted-foreground">
              {{ filterOem === 'all' ? 'Across all portals' : oemName(filterOem) }}
            </p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Images</UiCardTitle>
            <Camera class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-blue-500">{{ stats.images.toLocaleString() }}</div>
            <p class="text-xs text-muted-foreground">{{ stats.renders.toLocaleString() }} 3D renders</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Models</UiCardTitle>
            <Car class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ stats.models }}</div>
            <p class="text-xs text-muted-foreground">With parsed assets</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Coverage</UiCardTitle>
            <Palette class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-green-500">
              {{ coverage.reduce((s, c) => s + (c.unique_colors ?? 0), 0) }}
            </div>
            <p class="text-xs text-muted-foreground">Unique colors across models</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Coverage Table -->
      <UiCard class="mb-6">
        <UiCardHeader class="flex flex-row items-center justify-between">
          <UiCardTitle class="text-base">Per-Model Coverage</UiCardTitle>
          <span class="text-xs text-muted-foreground">
            {{ coverage.length }} model{{ coverage.length === 1 ? '' : 's' }}
          </span>
        </UiCardHeader>
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead>OEM</UiTableHead>
              <UiTableHead>Model</UiTableHead>
              <UiTableHead class="text-right">Total</UiTableHead>
              <UiTableHead class="text-right">Images</UiTableHead>
              <UiTableHead class="text-right">Renders</UiTableHead>
              <UiTableHead class="text-right">Colors</UiTableHead>
              <UiTableHead>Angles</UiTableHead>
              <UiTableHead />
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow
              v-for="c in coverage"
              :key="`${c.oem_id}-${c.parsed_model || 'unparsed'}`"
              class="cursor-pointer"
              @click="filterOem = c.oem_id; filterModel = c.parsed_model || 'all'"
            >
              <UiTableCell class="text-xs text-muted-foreground">{{ oemName(c.oem_id) }}</UiTableCell>
              <UiTableCell class="font-medium capitalize">{{ c.parsed_model || '(unparsed)' }}</UiTableCell>
              <UiTableCell class="text-right">{{ c.total_assets.toLocaleString() }}</UiTableCell>
              <UiTableCell class="text-right">{{ c.image_count.toLocaleString() }}</UiTableCell>
              <UiTableCell class="text-right">{{ c.render_count.toLocaleString() }}</UiTableCell>
              <UiTableCell class="text-right">{{ c.unique_colors }}</UiTableCell>
              <UiTableCell>
                <div class="flex gap-1 flex-wrap">
                  <UiBadge v-for="angle in c.angles_available" :key="angle" variant="secondary" class="text-xs">
                    {{ angle }}
                  </UiBadge>
                </div>
              </UiTableCell>
              <UiTableCell class="text-right text-xs text-muted-foreground">Click to filter</UiTableCell>
            </UiTableRow>
          </UiTableBody>
        </UiTable>
      </UiCard>

      <!-- Asset Grid -->
      <div v-if="loadingPage" class="flex items-center justify-center h-32">
        <Loader2 class="size-5 animate-spin text-muted-foreground" />
      </div>

      <div v-else-if="pageRows.length === 0" class="text-center py-16">
        <Image class="size-10 text-muted-foreground/30 mx-auto mb-3" />
        <p class="text-sm text-muted-foreground">No assets match these filters</p>
        <UiButton v-if="hasFilters" size="sm" variant="outline" class="mt-3" @click="resetFilters">
          Reset filters
        </UiButton>
      </div>

      <div
        v-else
        class="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        <div
          v-for="asset in pageRows"
          :key="asset.id"
          class="group relative rounded-lg border bg-card overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
          @click="previewAsset = asset"
        >
          <div class="aspect-video bg-muted flex items-center justify-center overflow-hidden">
            <img
              v-if="asset.asset_type === 'IMAGE'"
              :src="thumbnailUrl(asset.cdn_url)"
              :alt="asset.name"
              class="w-full h-full object-contain"
              loading="lazy"
            />
            <Image v-else class="size-8 text-muted-foreground/30" />
          </div>
          <div class="p-2">
            <p class="text-xs font-medium truncate" :title="asset.record_name || asset.name">
              {{ asset.record_name || asset.name }}
            </p>
            <p v-if="asset.nameplate" class="text-[10px] text-muted-foreground truncate" :title="asset.nameplate">
              {{ asset.nameplate }}
            </p>
            <div class="flex items-center gap-1 mt-1 flex-wrap">
              <UiBadge v-if="asset.parsed_model" variant="secondary" class="text-[10px] px-1">
                {{ asset.parsed_model }}
              </UiBadge>
              <UiBadge v-if="asset.parsed_angle" variant="outline" class="text-[10px] px-1">
                {{ asset.parsed_angle }}
              </UiBadge>
              <UiBadge
                v-if="asset.asset_type !== 'IMAGE'"
                variant="outline"
                class="text-[10px] px-1"
              >
                {{ asset.asset_type }}
              </UiBadge>
              <UiBadge v-if="isExpired(asset)" variant="destructive" class="text-[10px] px-1">
                Expired
              </UiBadge>
            </div>
            <p class="text-[10px] text-muted-foreground mt-1">
              <template v-if="asset.width && asset.height">
                {{ asset.width }}×{{ asset.height }}
              </template>
              {{ asset.original_format }} {{ formatBytes(asset.file_size_bytes) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="pageTotal > PAGE_SIZE" class="flex items-center justify-between mt-6">
        <span class="text-xs text-muted-foreground">Page {{ page }} of {{ pageCount.toLocaleString() }}</span>
        <div class="flex items-center gap-1">
          <UiButton size="sm" variant="outline" :disabled="page <= 1 || loadingPage" @click="go(-1)">
            <ChevronLeft class="size-4" />Prev
          </UiButton>
          <UiButton size="sm" variant="outline" :disabled="page >= pageCount || loadingPage" @click="go(1)">
            Next<ChevronRight class="size-4" />
          </UiButton>
        </div>
      </div>
    </template>

    <!-- Preview Modal -->
    <UiDialog :open="!!previewAsset" @update:open="v => { if (!v) previewAsset = null }">
      <UiDialogContent v-if="previewAsset" class="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <UiDialogHeader>
          <UiDialogTitle class="text-sm">{{ previewAsset.record_name || previewAsset.name }}</UiDialogTitle>
          <UiDialogDescription>
            {{ oemName(previewAsset.oem_id) }} &middot;
            {{ previewAsset.width || '?' }}×{{ previewAsset.height || '?' }} {{ previewAsset.original_format }} &middot;
            {{ formatBytes(previewAsset.file_size_bytes) }}
          </UiDialogDescription>
        </UiDialogHeader>

        <div class="bg-muted rounded-md overflow-hidden">
          <img
            :src="previewAsset.cdn_url.includes('/image/upload/v1/')
              ? previewAsset.cdn_url.replace('/image/upload/v1/', '/image/upload/f_auto/q_auto/w_1200/v1/')
              : previewAsset.cdn_url"
            :alt="previewAsset.name"
            class="w-full object-contain max-h-[500px]"
          />
        </div>

        <!-- Quick chips -->
        <div class="flex flex-wrap gap-1.5 mt-3">
          <UiBadge v-if="previewAsset.asset_type_label" variant="secondary">{{ previewAsset.asset_type_label }}</UiBadge>
          <UiBadge v-if="previewAsset.media_type" variant="outline">{{ previewAsset.media_type }}</UiBadge>
          <UiBadge v-if="previewAsset.usage_rights" variant="outline">{{ previewAsset.usage_rights }}</UiBadge>
          <UiBadge v-if="previewAsset.parsed_model" variant="secondary">{{ previewAsset.parsed_model }}</UiBadge>
          <UiBadge v-if="previewAsset.parsed_trim" variant="secondary">{{ previewAsset.parsed_trim }}</UiBadge>
          <UiBadge v-if="previewAsset.parsed_angle" variant="outline">{{ previewAsset.parsed_angle }}</UiBadge>
          <UiBadge v-if="previewAsset.parsed_color" variant="outline">{{ previewAsset.parsed_color }}</UiBadge>
          <UiBadge v-if="isExpired(previewAsset)" variant="destructive">Expired</UiBadge>
          <UiBadge v-if="previewAsset.discontinued" variant="destructive">Discontinued</UiBadge>
        </div>

        <!-- Metadata grid -->
        <div class="grid grid-cols-2 gap-x-6 gap-y-1 mt-4 text-xs">
          <div v-if="previewAsset.nameplate">
            <span class="text-muted-foreground">Campaign:</span>
            <button
              class="ml-2 text-foreground hover:underline text-left"
              @click="filterNameplate = previewAsset!.nameplate!; previewAsset = null"
            >
              {{ previewAsset.nameplate }}
            </button>
          </div>
          <div v-if="previewAsset.job_number && previewAsset.job_number !== 'NA'">
            <span class="text-muted-foreground">Job #:</span>
            <span class="ml-2">{{ previewAsset.job_number }}</span>
          </div>
          <div v-if="fmtDate(previewAsset.appearance_date)">
            <span class="text-muted-foreground">Released:</span>
            <span class="ml-2">{{ fmtDate(previewAsset.appearance_date) }}</span>
          </div>
          <div v-if="fmtDate(previewAsset.expiry_date)">
            <span class="text-muted-foreground">Expires:</span>
            <span class="ml-2" :class="{ 'text-destructive': isExpired(previewAsset) }">
              {{ fmtDate(previewAsset.expiry_date) }}
            </span>
          </div>
          <div v-if="previewAsset.interface_id">
            <span class="text-muted-foreground">Interface ID:</span>
            <span class="ml-2 font-mono">{{ previewAsset.interface_id }}</span>
          </div>
          <div v-if="previewAsset.modified_by">
            <span class="text-muted-foreground">Modified by:</span>
            <span class="ml-2">{{ previewAsset.modified_by }}</span>
          </div>
          <div v-if="fmtDate(previewAsset.source_modified_at)">
            <span class="text-muted-foreground">Modified:</span>
            <span class="ml-2">{{ fmtDate(previewAsset.source_modified_at) }}</span>
          </div>
          <div v-if="previewAsset.copyright_notice" class="col-span-2">
            <span class="text-muted-foreground">Copyright:</span>
            <span class="ml-2">{{ previewAsset.copyright_notice }}</span>
          </div>
          <div v-if="previewAsset.category_path" class="col-span-2 truncate" :title="previewAsset.category_path">
            <span class="text-muted-foreground">Category:</span>
            <span class="ml-2">{{ previewAsset.category_path }}</span>
          </div>
        </div>

        <!-- Keywords -->
        <div v-if="previewAsset.keywords?.length" class="mt-3">
          <p class="text-xs text-muted-foreground mb-1">Keywords</p>
          <div class="flex flex-wrap gap-1">
            <UiBadge v-for="kw in previewAsset.keywords" :key="kw" variant="outline" class="text-xs">{{ kw }}</UiBadge>
          </div>
        </div>

        <!-- Related (same campaign) -->
        <div v-if="previewAsset.nameplate" class="mt-4">
          <p class="text-xs text-muted-foreground mb-2">
            Related in same campaign
            <span v-if="!loadingRelated && relatedAssets.length">({{ relatedAssets.length }}+)</span>
          </p>
          <div v-if="loadingRelated" class="text-xs text-muted-foreground">
            <Loader2 class="size-3 animate-spin inline mr-1" />Loading…
          </div>
          <div v-else-if="relatedAssets.length === 0" class="text-xs text-muted-foreground italic">
            No other assets in this campaign.
          </div>
          <div v-else class="grid grid-cols-4 sm:grid-cols-6 gap-2">
            <div
              v-for="r in relatedAssets"
              :key="r.id"
              class="aspect-video bg-muted rounded border cursor-pointer overflow-hidden hover:ring-2 hover:ring-primary/50"
              :title="r.record_name || r.name"
              @click="previewAsset = r"
            >
              <img
                v-if="r.asset_type === 'IMAGE'"
                :src="thumbnailUrl(r.cdn_url)"
                :alt="r.name"
                class="w-full h-full object-contain"
                loading="lazy"
              />
              <Image v-else class="size-6 text-muted-foreground/30 m-auto" />
            </div>
          </div>
        </div>

        <!-- Raw CDN URL -->
        <div class="mt-4">
          <a
            :href="previewAsset.cdn_url"
            target="_blank"
            rel="noopener"
            class="text-xs text-blue-500 hover:underline break-all"
          >
            {{ previewAsset.cdn_url }}
          </a>
        </div>

        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="previewAsset = null">
            <X class="size-4 mr-1" />Close
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </BasicPage>
</template>
