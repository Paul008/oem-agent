<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Loader2, Search, Image, Camera, Palette, Car, X } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { usePortalAssets } from '@/composables/use-portal-assets'
import type { PortalAsset, PortalAssetCoverage } from '@/composables/use-portal-assets'

const { fetchOems } = useOemData()
const { fetchPortalAssets, fetchPortalAssetCoverage, fetchPortalAssetStats, thumbnailUrl } = usePortalAssets()

const assets = ref<PortalAsset[]>([])
const coverage = ref<PortalAssetCoverage[]>([])
const oems = ref<{ id: string; name: string }[]>([])
const stats = ref({ total: 0, images: 0, renders: 0, models: 0 })
const loading = ref(true)
const filterOem = ref('all')
const filterType = ref('all')
const filterModel = ref('all')
const searchQuery = ref('')
const previewAsset = ref<PortalAsset | null>(null)

onMounted(async () => {
  try {
    const [a, c, o, s] = await Promise.all([
      fetchPortalAssets(),
      fetchPortalAssetCoverage(),
      fetchOems(),
      fetchPortalAssetStats(),
    ])
    assets.value = a
    coverage.value = c
    oems.value = o
    stats.value = s
  }
  finally {
    loading.value = false
  }
})

const models = computed(() => {
  const set = new Set<string>()
  for (const a of assets.value) {
    if (a.parsed_model) set.add(a.parsed_model)
  }
  return [...set].sort()
})

const assetTypes = computed(() => {
  const map = new Map<string, number>()
  for (const a of assets.value) {
    map.set(a.asset_type, (map.get(a.asset_type) || 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
})

const filtered = computed(() => {
  let list = assets.value
  if (filterOem.value !== 'all') {
    list = list.filter(a => a.oem_id === filterOem.value)
  }
  if (filterType.value !== 'all') {
    list = list.filter(a => a.asset_type === filterType.value)
  }
  if (filterModel.value !== 'all') {
    list = list.filter(a => a.parsed_model === filterModel.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(a =>
      a.name.toLowerCase().includes(q)
      || a.parsed_color?.toLowerCase().includes(q)
      || a.tags?.some(t => t.toLowerCase().includes(q)),
    )
  }
  return list
})

// Show max 200 in grid for perf
const displayedAssets = computed(() => filtered.value.slice(0, 200))

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
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
          <UiSelectItem v-for="[type, count] in assetTypes" :key="type" :value="type">
            {{ type }} ({{ count }})
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-model="filterModel">
        <UiSelectTrigger class="w-[180px]">
          <UiSelectValue placeholder="Filter by model" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Models</UiSelectItem>
          <UiSelectItem v-for="m in models" :key="m" :value="m">
            {{ m }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <UiInput
          v-model="searchQuery"
          placeholder="Search assets..."
          class="pl-8 w-[220px] h-9"
        />
      </div>
      <span class="text-sm text-muted-foreground">
        {{ filtered.length }} assets{{ filtered.length > 200 ? ' (showing 200)' : '' }}
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
            <p class="text-xs text-muted-foreground">Across all portals</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Images</UiCardTitle>
            <Camera class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold text-blue-500">{{ stats.images.toLocaleString() }}</div>
            <p class="text-xs text-muted-foreground">{{ stats.renders }} 3D renders</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Models</UiCardTitle>
            <Car class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ models.length }}</div>
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
              {{ coverage.reduce((s, c) => s + c.unique_colors, 0) }}
            </div>
            <p class="text-xs text-muted-foreground">Unique colors across models</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Coverage Table -->
      <UiCard class="mb-6">
        <UiCardHeader>
          <UiCardTitle class="text-base">Per-Model Coverage</UiCardTitle>
        </UiCardHeader>
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead>Model</UiTableHead>
              <UiTableHead class="text-right">Total</UiTableHead>
              <UiTableHead class="text-right">Images</UiTableHead>
              <UiTableHead class="text-right">Renders</UiTableHead>
              <UiTableHead class="text-right">Colors</UiTableHead>
              <UiTableHead>Angles</UiTableHead>
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow v-for="c in coverage" :key="`${c.oem_id}-${c.parsed_model}`">
              <UiTableCell class="font-medium capitalize">
                {{ c.parsed_model || '(unparsed)' }}
              </UiTableCell>
              <UiTableCell class="text-right">{{ c.total_assets }}</UiTableCell>
              <UiTableCell class="text-right">{{ c.image_count }}</UiTableCell>
              <UiTableCell class="text-right">{{ c.render_count }}</UiTableCell>
              <UiTableCell class="text-right">{{ c.unique_colors }}</UiTableCell>
              <UiTableCell>
                <div class="flex gap-1">
                  <UiBadge
                    v-for="angle in c.angles_available"
                    :key="angle"
                    variant="secondary"
                    class="text-xs"
                  >
                    {{ angle }}
                  </UiBadge>
                </div>
              </UiTableCell>
            </UiTableRow>
          </UiTableBody>
        </UiTable>
      </UiCard>

      <!-- Asset Grid -->
      <div class="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        <div
          v-for="asset in displayedAssets"
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
            <p class="text-xs font-medium truncate" :title="asset.name">{{ asset.name }}</p>
            <div class="flex items-center gap-1 mt-1">
              <UiBadge v-if="asset.parsed_model" variant="secondary" class="text-[10px] px-1">
                {{ asset.parsed_model }}
              </UiBadge>
              <UiBadge v-if="asset.parsed_angle" variant="outline" class="text-[10px] px-1">
                {{ asset.parsed_angle }}
              </UiBadge>
            </div>
            <p class="text-[10px] text-muted-foreground mt-1">
              {{ asset.width }}x{{ asset.height }} {{ asset.original_format }} {{ formatBytes(asset.file_size_bytes) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="filtered.length === 0 && !loading" class="text-center py-16">
        <Image class="size-10 text-muted-foreground/30 mx-auto mb-3" />
        <p class="text-sm text-muted-foreground">No assets found matching your filters</p>
      </div>
    </template>

    <!-- Preview Modal -->
    <UiDialog :open="!!previewAsset" @update:open="v => { if (!v) previewAsset = null }">
      <UiDialogContent v-if="previewAsset" class="sm:max-w-[800px]">
        <UiDialogHeader>
          <UiDialogTitle class="text-sm">{{ previewAsset.name }}</UiDialogTitle>
          <UiDialogDescription>
            {{ oemName(previewAsset.oem_id) }} &middot;
            {{ previewAsset.width }}x{{ previewAsset.height }} {{ previewAsset.original_format }} &middot;
            {{ formatBytes(previewAsset.file_size_bytes) }}
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="bg-muted rounded-md overflow-hidden">
          <img
            :src="previewAsset.cdn_url.replace('/image/upload/v1/', '/image/upload/f_auto/q_auto/w_1200/v1/')"
            :alt="previewAsset.name"
            class="w-full object-contain max-h-[500px]"
          />
        </div>
        <div class="flex flex-wrap gap-2 mt-2">
          <UiBadge v-if="previewAsset.parsed_model" variant="secondary">{{ previewAsset.parsed_model }}</UiBadge>
          <UiBadge v-if="previewAsset.parsed_trim" variant="secondary">{{ previewAsset.parsed_trim }}</UiBadge>
          <UiBadge v-if="previewAsset.parsed_angle" variant="outline">{{ previewAsset.parsed_angle }}</UiBadge>
          <UiBadge v-if="previewAsset.parsed_color" variant="outline">{{ previewAsset.parsed_color }}</UiBadge>
          <UiBadge v-for="tag in (previewAsset.tags || []).slice(0, 8)" :key="tag" variant="outline" class="text-xs">
            {{ tag }}
          </UiBadge>
        </div>
        <div class="mt-2">
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
            <X class="size-4 mr-1" />
            Close
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </BasicPage>
</template>
