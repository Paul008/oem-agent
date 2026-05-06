<script lang="ts" setup>
import { CheckCircle, Clock, Loader2, XCircle } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import type { ImportRun } from '@/composables/use-oem-data'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { useRealtimeSubscription } from '@/composables/use-realtime'

const { fetchImportRuns, fetchOems } = useOemData()

const runs = ref<ImportRun[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)
const filterOem = ref('all')
const filterType = ref('all')

onMounted(async () => {
  try {
    const [r, o] = await Promise.all([fetchImportRuns(200), fetchOems()])
    runs.value = r
    oems.value = o
  }
  finally {
    loading.value = false
  }
})

useRealtimeSubscription<ImportRun>({
  channelName: 'import-runs-live',
  table: 'import_runs',
  event: '*',
  dataRef: runs,
  maxItems: 200,
})

const runTypes = computed(() => {
  const types = new Set(runs.value.map(r => r.run_type))
  return Array.from(types).sort()
})

const filteredRuns = computed(() => {
  let list = runs.value
  if (filterOem.value !== 'all')
    list = list.filter(r => r.oem_id === filterOem.value)
  if (filterType.value !== 'all')
    list = list.filter(r => r.run_type === filterType.value)
  return list
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-AU', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function duration(run: ImportRun) {
  if (!run.started_at || !run.finished_at)
    return '-'
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
  const secs = Math.round(ms / 1000)
  if (secs < 60)
    return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}
</script>

<template>
  <BasicPage title="Import Runs" description="Crawl execution history" sticky>
    <div class="flex items-center gap-4 mb-4">
      <UiSelect v-model="filterOem">
        <UiSelectTrigger class="w-[200px]">
          <UiSelectValue placeholder="Filter by OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">
            All OEMs
          </UiSelectItem>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-model="filterType">
        <UiSelectTrigger class="w-[200px]">
          <UiSelectValue placeholder="Filter by type" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">
            All Types
          </UiSelectItem>
          <UiSelectItem v-for="t in runTypes" :key="t" :value="t">
            {{ t }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <span class="text-sm text-muted-foreground">{{ filteredRuns.length }} runs</span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <UiCard v-else>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead>OEM</UiTableHead>
            <UiTableHead>Type</UiTableHead>
            <UiTableHead>Status</UiTableHead>
            <UiTableHead>Started</UiTableHead>
            <UiTableHead>Duration</UiTableHead>
            <UiTableHead class="text-right">
              Pages
            </UiTableHead>
            <UiTableHead class="text-right">
              Products
            </UiTableHead>
            <UiTableHead class="text-right">
              Offers
            </UiTableHead>
            <UiTableHead class="text-right">
              Banners
            </UiTableHead>
            <UiTableHead class="text-right">
              Brochures
            </UiTableHead>
            <UiTableHead class="text-right">
              Changes
            </UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow v-for="run in filteredRuns" :key="run.id">
            <UiTableCell class="font-medium">
              {{ oemName(run.oem_id) }}
            </UiTableCell>
            <UiTableCell>
              <UiBadge variant="outline" class="text-xs">
                {{ run.run_type }}
              </UiBadge>
            </UiTableCell>
            <UiTableCell>
              <div class="flex items-center gap-1.5">
                <CheckCircle v-if="run.status === 'success' || run.status === 'completed'" class="size-3.5 text-green-500" />
                <XCircle v-else-if="run.status === 'failed'" class="size-3.5 text-red-500" />
                <Loader2 v-else-if="run.status === 'running'" class="size-3.5 text-blue-500 animate-spin" />
                <Clock v-else class="size-3.5 text-muted-foreground" />
                <span class="text-sm">{{ run.status }}</span>
              </div>
            </UiTableCell>
            <UiTableCell class="text-sm text-muted-foreground">
              {{ formatDate(run.created_at) }}
            </UiTableCell>
            <UiTableCell class="text-sm">
              {{ duration(run) }}
            </UiTableCell>
            <UiTableCell class="text-right text-muted-foreground">
              {{ run.pages_checked ?? '-' }}
            </UiTableCell>
            <UiTableCell class="text-right">
              <span :class="run.products_upserted ? 'text-green-600 font-medium' : 'text-muted-foreground'">
                {{ run.products_upserted ?? 0 }}
              </span>
            </UiTableCell>
            <UiTableCell class="text-right">
              <span :class="run.offers_upserted ? 'text-blue-600 font-medium' : 'text-muted-foreground'">
                {{ run.offers_upserted ?? 0 }}
              </span>
            </UiTableCell>
            <UiTableCell class="text-right">
              <span :class="run.banners_upserted ? 'text-purple-600 font-medium' : 'text-muted-foreground'">
                {{ run.banners_upserted ?? 0 }}
              </span>
            </UiTableCell>
            <UiTableCell class="text-right">
              <span :class="run.brochures_upserted ? 'text-orange-600 font-medium' : 'text-muted-foreground'">
                {{ run.brochures_upserted ?? 0 }}
              </span>
            </UiTableCell>
            <UiTableCell class="text-right">
              <span :class="run.changes_found ? 'text-primary font-medium' : 'text-muted-foreground'">
                {{ run.changes_found ?? 0 }}
              </span>
            </UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>
  </BasicPage>
</template>
