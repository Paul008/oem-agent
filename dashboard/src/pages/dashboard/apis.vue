<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Loader2, Globe, Zap, AlertTriangle } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { supabase } from '@/lib/supabase'
import { useOemData } from '@/composables/use-oem-data'

interface DiscoveredApi {
  id: string
  oem_id: string
  url: string
  method: string
  content_type: string
  response_type: string
  data_type: string
  reliability_score: number
  status: string
  last_successful_call: string | null
  call_count: number
  error_count: number
  created_at: string
}

const { fetchOems } = useOemData()

const apis = ref<DiscoveredApi[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)
const filterOem = ref('all')
const filterDataType = ref('all')

onMounted(async () => {
  try {
    const [o, { data }] = await Promise.all([
      fetchOems(),
      supabase.from('discovered_apis').select('*').order('reliability_score', { ascending: false }),
    ])
    oems.value = o
    apis.value = (data ?? []) as DiscoveredApi[]
  }
  finally {
    loading.value = false
  }
})

const filtered = computed(() => {
  return apis.value.filter(a => {
    if (filterOem.value !== 'all' && a.oem_id !== filterOem.value) return false
    if (filterDataType.value !== 'all' && a.data_type !== filterDataType.value) return false
    return true
  })
})

const dataTypes = computed(() => {
  return [...new Set(apis.value.map(a => a.data_type))].filter(Boolean).sort()
})

const stats = computed(() => {
  const highValue = apis.value.filter(a => a.reliability_score >= 0.7).length
  const verified = apis.value.filter(a => a.status === 'verified').length
  const oemsWithApis = new Set(apis.value.map(a => a.oem_id)).size
  return { total: apis.value.length, highValue, verified, oemsWithApis }
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function reliabilityColor(score: number) {
  if (score >= 0.8) return 'text-green-500'
  if (score >= 0.5) return 'text-yellow-500'
  return 'text-red-500'
}

function statusBadge(status: string) {
  if (status === 'verified') return 'bg-green-500/10 text-green-500 border-green-500/20'
  if (status === 'discovered') return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
  if (status === 'stale') return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
  return 'bg-red-500/10 text-red-500 border-red-500/20'
}

function shortenUrl(url: string) {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  }
  catch {
    return url
  }
}
</script>

<template>
  <BasicPage title="Discovered APIs" description="APIs found via network capture during crawls" sticky>
    <!-- Stats -->
    <div class="grid gap-4 sm:grid-cols-4 mb-4">
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">Total APIs</UiCardTitle>
          <Globe class="size-4 text-muted-foreground" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">{{ stats.total }}</div>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">High Value</UiCardTitle>
          <Zap class="size-4 text-green-500" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold text-green-500">{{ stats.highValue }}</div>
          <p class="text-xs text-muted-foreground">reliability >= 0.7</p>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">Verified</UiCardTitle>
          <Zap class="size-4 text-blue-500" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">{{ stats.verified }}</div>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">OEMs Covered</UiCardTitle>
          <Globe class="size-4 text-muted-foreground" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">{{ stats.oemsWithApis }} / {{ oems.length }}</div>
        </UiCardContent>
      </UiCard>
    </div>

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
      <UiSelect v-model="filterDataType">
        <UiSelectTrigger class="w-[160px]">
          <UiSelectValue placeholder="Data Type" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Types</UiSelectItem>
          <UiSelectItem v-for="dt in dataTypes" :key="dt" :value="dt">{{ dt }}</UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <span class="text-sm text-muted-foreground">{{ filtered.length }} APIs</span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <UiCard v-else>
      <div class="overflow-x-auto">
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead>OEM</UiTableHead>
              <UiTableHead>Endpoint</UiTableHead>
              <UiTableHead>Method</UiTableHead>
              <UiTableHead>Data Type</UiTableHead>
              <UiTableHead>Status</UiTableHead>
              <UiTableHead class="text-right">Reliability</UiTableHead>
              <UiTableHead class="text-right">Calls</UiTableHead>
              <UiTableHead class="text-right">Errors</UiTableHead>
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow v-for="api in filtered" :key="api.id">
              <UiTableCell class="font-medium text-sm">{{ oemName(api.oem_id) }}</UiTableCell>
              <UiTableCell class="text-xs text-muted-foreground max-w-[350px] truncate font-mono">
                {{ shortenUrl(api.url) }}
              </UiTableCell>
              <UiTableCell>
                <UiBadge variant="outline" class="text-xs">{{ api.method }}</UiBadge>
              </UiTableCell>
              <UiTableCell>
                <UiBadge v-if="api.data_type" variant="secondary" class="text-xs">{{ api.data_type }}</UiBadge>
                <span v-else class="text-muted-foreground">-</span>
              </UiTableCell>
              <UiTableCell>
                <UiBadge variant="outline" :class="statusBadge(api.status)" class="text-[10px]">
                  {{ api.status }}
                </UiBadge>
              </UiTableCell>
              <UiTableCell class="text-right">
                <span class="font-medium" :class="reliabilityColor(api.reliability_score)">
                  {{ (api.reliability_score * 100).toFixed(0) }}%
                </span>
              </UiTableCell>
              <UiTableCell class="text-right text-sm">{{ api.call_count }}</UiTableCell>
              <UiTableCell class="text-right text-sm">
                <span :class="api.error_count > 0 ? 'text-red-500' : 'text-muted-foreground'">
                  {{ api.error_count }}
                </span>
              </UiTableCell>
            </UiTableRow>
          </UiTableBody>
        </UiTable>
      </div>
    </UiCard>
  </BasicPage>
</template>
