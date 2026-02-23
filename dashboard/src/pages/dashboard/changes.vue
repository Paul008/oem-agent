<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Activity, Bell, BellOff, Loader2 } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { useRealtimeSubscription } from '@/composables/use-realtime'
import type { ChangeEvent } from '@/composables/use-oem-data'

const { fetchChangeEvents, fetchOems } = useOemData()

const changes = ref<ChangeEvent[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)
const filterOem = ref('all')
const filterSeverity = ref('all')
const filterNotified = ref('all')

onMounted(async () => {
  try {
    const [c, o] = await Promise.all([fetchChangeEvents(500), fetchOems()])
    changes.value = c
    oems.value = o
  }
  finally {
    loading.value = false
  }
})

useRealtimeSubscription<ChangeEvent>({
  channelName: 'change-events-live',
  table: 'change_events',
  event: 'INSERT',
  dataRef: changes,
  maxItems: 500,
})

const unnotifiedCount = computed(() => changes.value.filter(c => !c.notified_at).length)

const filtered = computed(() => {
  return changes.value.filter(c => {
    if (filterOem.value !== 'all' && c.oem_id !== filterOem.value) return false
    if (filterSeverity.value !== 'all' && c.severity !== filterSeverity.value) return false
    if (filterNotified.value === 'unnotified' && c.notified_at) return false
    if (filterNotified.value === 'notified' && !c.notified_at) return false
    return true
  })
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function severityColor(severity: string) {
  if (severity === 'critical') return 'bg-red-500/10 text-red-500 border-red-500/20'
  if (severity === 'high') return 'bg-orange-500/10 text-orange-500 border-orange-500/20'
  if (severity === 'medium') return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
  return 'bg-muted text-muted-foreground border-border'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-AU', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <BasicPage title="Change Feed" description="All data changes detected across OEMs" sticky>
    <!-- Unnotified Alert -->
    <UiCard v-if="unnotifiedCount > 0" class="mb-4 border-yellow-500/30">
      <UiCardContent class="flex items-center gap-3 py-3">
        <BellOff class="size-4 text-yellow-500 shrink-0" />
        <span class="text-sm">
          <strong class="text-yellow-500">{{ unnotifiedCount }}</strong> change events have not been notified yet
        </span>
        <UiButton
          size="sm"
          variant="outline"
          class="ml-auto"
          @click="filterNotified = filterNotified === 'unnotified' ? 'all' : 'unnotified'"
        >
          {{ filterNotified === 'unnotified' ? 'Show All' : 'Show Unnotified' }}
        </UiButton>
      </UiCardContent>
    </UiCard>

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

      <UiSelect v-model="filterSeverity">
        <UiSelectTrigger class="w-[160px]">
          <UiSelectValue placeholder="Severity" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All Severity</UiSelectItem>
          <UiSelectItem value="critical">Critical</UiSelectItem>
          <UiSelectItem value="high">High</UiSelectItem>
          <UiSelectItem value="medium">Medium</UiSelectItem>
          <UiSelectItem value="low">Low</UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <span class="text-sm text-muted-foreground">{{ filtered.length }} events</span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <UiCard v-else>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="w-[100px]">Severity</UiTableHead>
            <UiTableHead>OEM</UiTableHead>
            <UiTableHead>Entity</UiTableHead>
            <UiTableHead>Event</UiTableHead>
            <UiTableHead>Summary</UiTableHead>
            <UiTableHead>When</UiTableHead>
            <UiTableHead class="w-[40px]"></UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow v-if="filtered.length === 0">
            <UiTableCell :colspan="7" class="text-center text-muted-foreground py-8">
              No change events found
            </UiTableCell>
          </UiTableRow>
          <UiTableRow v-for="change in filtered" :key="change.id">
            <UiTableCell>
              <UiBadge variant="outline" :class="severityColor(change.severity)" class="text-[10px]">
                {{ change.severity }}
              </UiBadge>
            </UiTableCell>
            <UiTableCell class="font-medium text-sm">{{ oemName(change.oem_id) }}</UiTableCell>
            <UiTableCell>
              <UiBadge variant="secondary" class="text-xs">{{ change.entity_type }}</UiBadge>
            </UiTableCell>
            <UiTableCell class="text-sm">{{ change.event_type }}</UiTableCell>
            <UiTableCell class="text-sm max-w-[300px] truncate">{{ change.summary }}</UiTableCell>
            <UiTableCell class="text-sm text-muted-foreground whitespace-nowrap">
              {{ formatDate(change.created_at) }}
            </UiTableCell>
            <UiTableCell>
              <Bell v-if="change.notified_at" class="size-3 text-green-500" />
              <BellOff v-else class="size-3 text-muted-foreground" />
            </UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>
  </BasicPage>
</template>
