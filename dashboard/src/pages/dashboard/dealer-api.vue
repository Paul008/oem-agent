<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Loader2, Globe, Factory, Car, Palette, ExternalLink, Copy, Check, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import type { Oem, VehicleModel } from '@/composables/use-oem-data'
import { supabase } from '@/lib/supabase'

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

interface EndpointStatus {
  oemId: string
  oemName: string
  modelCount: number
  variantCount: number
  colorCount: number
  pricingCount: number
  catalogUrl: string
  modelsUrl: string
  status: 'unknown' | 'ok' | 'error' | 'checking'
  responseTime: number | null
  lastChecked: Date | null
  variantCountFromApi: number | null
}

const { fetchOems, fetchVehicleModels } = useOemData()

const oems = ref<Oem[]>([])
const models = ref<VehicleModel[]>([])
const endpoints = ref<EndpointStatus[]>([])
const loading = ref(true)
const checking = ref(false)
const copiedUrl = ref<string | null>(null)
const filterOem = ref('all')
const expandedOem = ref<string | null>(null)
const expandedModels = ref<{ slug: string; name: string; variantsUrl: string }[]>([])

onMounted(async () => {
  try {
    const [o, m] = await Promise.all([fetchOems(), fetchVehicleModels()])
    oems.value = o.filter(oem => oem.is_active)
    models.value = m

    // Build endpoint status per OEM
    const activeOemIds = new Set(oems.value.map(o => o.id))
    const modelsByOem = new Map<string, VehicleModel[]>()
    for (const model of m) {
      if (!activeOemIds.has(model.oem_id)) continue
      if (!modelsByOem.has(model.oem_id)) modelsByOem.set(model.oem_id, [])
      modelsByOem.get(model.oem_id)!.push(model)
    }

    // Fetch counts from DB
    const [colorCounts, pricingCounts, variantCounts] = await Promise.all([
      fetchCountsByOem('variant_colors'),
      fetchCountsByOem('variant_pricing'),
      fetchVariantCountsByOem(),
    ])

    endpoints.value = oems.value.map(oem => {
      const oemModels = modelsByOem.get(oem.id) || []
      return {
        oemId: oem.id,
        oemName: oem.name.replace(' Australia', ''),
        modelCount: oemModels.length,
        variantCount: variantCounts.get(oem.id) || 0,
        colorCount: colorCounts.get(oem.id) || 0,
        pricingCount: pricingCounts.get(oem.id) || 0,
        catalogUrl: `${WORKER_BASE}/api/wp/v2/catalog?oem_id=${oem.id}`,
        modelsUrl: `${WORKER_BASE}/api/wp/v2/models?oem_id=${oem.id}`,
        status: 'unknown' as const,
        responseTime: null,
        lastChecked: null,
        variantCountFromApi: null,
      }
    })
  } finally {
    loading.value = false
  }
})

async function fetchCountsByOem(table: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const oem of oems.value) {
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('oem_id', oem.id)
    if (!products?.length) continue

    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in('product_id', products.map(p => p.id))
    counts.set(oem.id, count || 0)
  }
  return counts
}

async function fetchVariantCountsByOem(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const oem of oems.value) {
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('oem_id', oem.id)
    counts.set(oem.id, count || 0)
  }
  return counts
}

async function checkEndpoint(ep: EndpointStatus) {
  ep.status = 'checking'
  const start = performance.now()
  try {
    const res = await fetch(ep.catalogUrl, {
      headers: { Accept: 'application/json' },
    })
    const elapsed = Math.round(performance.now() - start)
    ep.responseTime = elapsed
    ep.lastChecked = new Date()

    if (!res.ok) {
      ep.status = 'error'
      return
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      ep.status = 'error'
      return
    }

    const data = await res.json()
    if (Array.isArray(data)) {
      ep.variantCountFromApi = data.reduce((sum: number, m: any) => sum + (m.variant_count || 0), 0)
      ep.status = 'ok'
    } else {
      ep.status = 'error'
    }
  } catch {
    ep.status = 'error'
    ep.responseTime = Math.round(performance.now() - start)
    ep.lastChecked = new Date()
  }
}

async function checkAllEndpoints() {
  checking.value = true
  const withData = endpoints.value.filter(ep => ep.modelCount > 0)
  await Promise.allSettled(withData.map(ep => checkEndpoint(ep)))
  checking.value = false
}

function copyUrl(url: string) {
  navigator.clipboard.writeText(url)
  copiedUrl.value = url
  toast.success('URL copied to clipboard')
  setTimeout(() => { copiedUrl.value = null }, 2000)
}

function toggleExpand(oemId: string) {
  if (expandedOem.value === oemId) {
    expandedOem.value = null
    expandedModels.value = []
    return
  }
  expandedOem.value = oemId
  const oemModels = models.value.filter(m => m.oem_id === oemId && m.is_active)
  expandedModels.value = oemModels.map(m => ({
    slug: m.slug,
    name: m.name,
    variantsUrl: `${WORKER_BASE}/api/wp/v2/variants?filter[variant_category]=${m.slug}&oem_id=${oemId}`,
  }))
}

const filtered = computed(() => {
  if (filterOem.value === 'all') return endpoints.value
  return endpoints.value.filter(ep => ep.oemId === filterOem.value)
})

const stats = computed(() => {
  const withData = endpoints.value.filter(ep => ep.modelCount > 0)
  const live = endpoints.value.filter(ep => ep.status === 'ok')
  const totalModels = endpoints.value.reduce((s, ep) => s + ep.modelCount, 0)
  const totalVariants = endpoints.value.reduce((s, ep) => s + ep.variantCount, 0)
  return {
    totalOems: endpoints.value.length,
    withData: withData.length,
    live: live.length,
    totalModels,
    totalVariants,
  }
})

function statusBadge(status: string) {
  if (status === 'ok') return 'bg-green-500/10 text-green-500 border-green-500/20'
  if (status === 'checking') return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
  if (status === 'error') return 'bg-red-500/10 text-red-500 border-red-500/20'
  return 'bg-muted text-muted-foreground border-muted'
}
</script>

<template>
  <BasicPage title="Dealer API" description="WP-compatible legacy API endpoints for dealer websites" sticky>
    <template #actions>
      <UiButton
        variant="outline"
        size="sm"
        :disabled="checking || loading"
        @click="checkAllEndpoints"
      >
        <RefreshCw class="size-4 mr-2" :class="{ 'animate-spin': checking }" />
        Health Check All
      </UiButton>
    </template>

    <!-- Stats -->
    <div class="grid gap-4 sm:grid-cols-4 mb-4">
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">Active OEMs</UiCardTitle>
          <Factory class="size-4 text-muted-foreground" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">{{ stats.withData }}</div>
          <p class="text-xs text-muted-foreground">of {{ stats.totalOems }} with catalog data</p>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">Total Models</UiCardTitle>
          <Car class="size-4 text-muted-foreground" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">{{ stats.totalModels }}</div>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">Total Variants</UiCardTitle>
          <Palette class="size-4 text-muted-foreground" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">{{ stats.totalVariants }}</div>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">Live Endpoints</UiCardTitle>
          <Globe class="size-4 text-green-500" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold" :class="stats.live > 0 ? 'text-green-500' : ''">
            {{ stats.live }}
          </div>
          <p class="text-xs text-muted-foreground">verified responding</p>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- API Schema Info -->
    <UiCard class="mb-4">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium">Endpoint Reference</UiCardTitle>
        <UiCardDescription>
          WordPress REST API compatible endpoints — drop-in replacement for legacy WP variant APIs
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        <div class="grid gap-3 text-sm font-mono">
          <div class="flex items-start gap-3">
            <UiBadge variant="outline" class="shrink-0 mt-0.5">GET</UiBadge>
            <div>
              <p class="text-foreground">/api/wp/v2/catalog?oem_id=<span class="text-blue-500">{oem_id}</span></p>
              <p class="text-muted-foreground text-xs font-sans mt-0.5">All models with nested variants, colours, and pricing for an OEM</p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <UiBadge variant="outline" class="shrink-0 mt-0.5">GET</UiBadge>
            <div>
              <p class="text-foreground">/api/wp/v2/models?oem_id=<span class="text-blue-500">{oem_id}</span></p>
              <p class="text-muted-foreground text-xs font-sans mt-0.5">List of active models for an OEM</p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <UiBadge variant="outline" class="shrink-0 mt-0.5">GET</UiBadge>
            <div>
              <p class="text-foreground">/api/wp/v2/variants?filter[variant_category]=<span class="text-blue-500">{slug}</span>&amp;oem_id=<span class="text-blue-500">{oem_id}</span></p>
              <p class="text-muted-foreground text-xs font-sans mt-0.5">Paginated variants for a specific model (supports per_page, page params)</p>
            </div>
          </div>
        </div>
      </UiCardContent>
    </UiCard>

    <!-- Filters -->
    <div class="flex items-center gap-4 mb-4 flex-wrap">
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
      <span class="text-sm text-muted-foreground">{{ filtered.length }} endpoints</span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <!-- Endpoints Table -->
    <UiCard v-else>
      <div class="overflow-x-auto">
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead>OEM</UiTableHead>
              <UiTableHead class="text-right">Models</UiTableHead>
              <UiTableHead class="text-right">Variants</UiTableHead>
              <UiTableHead class="text-right">Colors</UiTableHead>
              <UiTableHead class="text-right">Pricing</UiTableHead>
              <UiTableHead>Status</UiTableHead>
              <UiTableHead class="text-right">Response</UiTableHead>
              <UiTableHead>Catalog URL</UiTableHead>
              <UiTableHead />
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <template v-for="ep in filtered" :key="ep.oemId">
              <UiTableRow
                class="cursor-pointer hover:bg-muted/50"
                @click="toggleExpand(ep.oemId)"
              >
                <UiTableCell class="font-medium text-sm">{{ ep.oemName }}</UiTableCell>
                <UiTableCell class="text-right text-sm">
                  <span :class="ep.modelCount > 0 ? 'text-foreground' : 'text-muted-foreground'">
                    {{ ep.modelCount }}
                  </span>
                </UiTableCell>
                <UiTableCell class="text-right text-sm">
                  <span :class="ep.variantCount > 0 ? 'text-foreground' : 'text-muted-foreground'">
                    {{ ep.variantCount }}
                  </span>
                </UiTableCell>
                <UiTableCell class="text-right text-sm">
                  <span :class="ep.colorCount > 0 ? 'text-foreground' : 'text-muted-foreground'">
                    {{ ep.colorCount }}
                  </span>
                </UiTableCell>
                <UiTableCell class="text-right text-sm">
                  <span :class="ep.pricingCount > 0 ? 'text-foreground' : 'text-muted-foreground'">
                    {{ ep.pricingCount }}
                  </span>
                </UiTableCell>
                <UiTableCell>
                  <UiBadge variant="outline" :class="statusBadge(ep.status)" class="text-[10px]">
                    <Loader2 v-if="ep.status === 'checking'" class="size-3 animate-spin mr-1" />
                    {{ ep.status === 'unknown' ? 'not checked' : ep.status }}
                  </UiBadge>
                </UiTableCell>
                <UiTableCell class="text-right text-sm">
                  <span v-if="ep.responseTime !== null" class="text-muted-foreground">
                    {{ ep.responseTime }}ms
                  </span>
                  <span v-else class="text-muted-foreground">—</span>
                </UiTableCell>
                <UiTableCell class="max-w-[300px]">
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs text-muted-foreground font-mono truncate">
                      /api/wp/v2/catalog?oem_id={{ ep.oemId }}
                    </span>
                    <button
                      class="shrink-0 p-1 rounded hover:bg-muted"
                      @click.stop="copyUrl(ep.catalogUrl)"
                    >
                      <Check v-if="copiedUrl === ep.catalogUrl" class="size-3 text-green-500" />
                      <Copy v-else class="size-3 text-muted-foreground" />
                    </button>
                  </div>
                </UiTableCell>
                <UiTableCell>
                  <div class="flex items-center gap-1">
                    <a
                      :href="ep.catalogUrl"
                      target="_blank"
                      class="p-1 rounded hover:bg-muted"
                      @click.stop
                    >
                      <ExternalLink class="size-3.5 text-muted-foreground" />
                    </a>
                    <UiButton
                      v-if="ep.status === 'unknown' || ep.status === 'error'"
                      variant="ghost"
                      size="sm"
                      class="h-7 px-2 text-xs"
                      @click.stop="checkEndpoint(ep)"
                    >
                      Check
                    </UiButton>
                  </div>
                </UiTableCell>
              </UiTableRow>

              <!-- Expanded model list -->
              <UiTableRow v-if="expandedOem === ep.oemId" class="bg-muted/30">
                <UiTableCell :colspan="9" class="p-0">
                  <div class="px-6 py-3">
                    <p class="text-xs font-medium text-muted-foreground mb-2">
                      Model-level variant endpoints for {{ ep.oemName }}
                    </p>
                    <div v-if="expandedModels.length === 0" class="text-xs text-muted-foreground py-1">
                      No active models found
                    </div>
                    <div v-else class="grid gap-1.5">
                      <div
                        v-for="model in expandedModels"
                        :key="model.slug"
                        class="flex items-center justify-between gap-4 text-xs py-1 px-2 rounded hover:bg-muted/50"
                      >
                        <div class="flex items-center gap-2">
                          <Car class="size-3 text-muted-foreground shrink-0" />
                          <span class="font-medium">{{ model.name }}</span>
                          <span class="text-muted-foreground font-mono">{{ model.slug }}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                          <span class="text-muted-foreground font-mono truncate max-w-[400px]">
                            {{ model.variantsUrl }}
                          </span>
                          <button class="p-1 rounded hover:bg-muted" @click.stop="copyUrl(model.variantsUrl)">
                            <Check v-if="copiedUrl === model.variantsUrl" class="size-3 text-green-500" />
                            <Copy v-else class="size-3 text-muted-foreground" />
                          </button>
                          <a
                            :href="model.variantsUrl"
                            target="_blank"
                            class="p-1 rounded hover:bg-muted"
                            @click.stop
                          >
                            <ExternalLink class="size-3 text-muted-foreground" />
                          </a>
                        </div>
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
  </BasicPage>
</template>
