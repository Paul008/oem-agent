<script lang="ts" setup>
import { AlertTriangle, Ban, CheckCircle, Loader2, RefreshCw, XCircle } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import type { SourcePage } from '@/composables/use-oem-data'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { triggerForceCrawl } from '@/lib/worker-api'

const { fetchSourcePages, fetchOems } = useOemData()

const pages = ref<SourcePage[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)
const filterOem = ref('all')
const filterStatus = ref('all')
const triggeringCrawl = ref<string | null>(null)

onMounted(async () => {
  try {
    const [p, o] = await Promise.all([fetchSourcePages(), fetchOems()])
    pages.value = p
    oems.value = o
  }
  finally {
    loading.value = false
  }
})

const filtered = computed(() => {
  return pages.value.filter((p) => {
    if (filterOem.value !== 'all' && p.oem_id !== filterOem.value)
      return false
    if (filterStatus.value !== 'all' && p.status !== filterStatus.value)
      return false
    return true
  })
})

const healthSummary = computed(() => {
  const active = pages.value.filter(p => p.status === 'active').length
  const errored = pages.value.filter(p => p.status === 'error').length
  const blocked = pages.value.filter(p => p.status === 'blocked').length
  const removed = pages.value.filter(p => p.status === 'removed').length
  return { active, errored, blocked, removed, total: pages.value.length }
})

const brokenOems = computed(() => {
  const byOem: Record<string, { total: number, errored: number }> = {}
  pages.value.forEach((p) => {
    if (!byOem[p.oem_id])
      byOem[p.oem_id] = { total: 0, errored: 0 }
    byOem[p.oem_id].total++
    if (p.status === 'error')
      byOem[p.oem_id].errored++
  })
  return Object.entries(byOem)
    .filter(([_, v]) => v.errored > 0)
    .sort((a, b) => b[1].errored - a[1].errored)
    .map(([oemId, v]) => ({ oemId, ...v, pct: Math.round((v.errored / v.total) * 100) }))
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function statusIcon(status: string) {
  if (status === 'active')
    return CheckCircle
  if (status === 'error')
    return XCircle
  if (status === 'blocked')
    return Ban
  return AlertTriangle
}

function statusColor(status: string) {
  if (status === 'active')
    return 'text-green-500'
  if (status === 'error')
    return 'text-red-500'
  if (status === 'blocked')
    return 'text-orange-500'
  return 'text-muted-foreground'
}

function timeAgo(dateStr: string | null) {
  if (!dateStr)
    return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60)
    return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)
    return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

async function handleForceCrawl(oemId: string) {
  triggeringCrawl.value = oemId
  try {
    await triggerForceCrawl(oemId)
    toast.success(`Force crawl triggered for ${oemName(oemId)}`)
  }
  catch (err: any) {
    toast.error(`Failed: ${err.message}`)
  }
  finally {
    triggeringCrawl.value = null
  }
}
</script>

<template>
  <BasicPage title="Source Pages" description="Monitored pages and feed health" sticky>
    <!-- Health Summary -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            Active
          </UiCardTitle>
          <CheckCircle class="size-4 text-green-500" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold text-green-500">
            {{ healthSummary.active }}
          </div>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            Errored
          </UiCardTitle>
          <XCircle class="size-4 text-red-500" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold text-red-500">
            {{ healthSummary.errored }}
          </div>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            Blocked
          </UiCardTitle>
          <Ban class="size-4 text-orange-500" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold text-orange-500">
            {{ healthSummary.blocked }}
          </div>
        </UiCardContent>
      </UiCard>
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
          <UiCardTitle class="text-sm font-medium">
            Total Pages
          </UiCardTitle>
          <AlertTriangle class="size-4 text-muted-foreground" />
        </UiCardHeader>
        <UiCardContent>
          <div class="text-2xl font-bold">
            {{ healthSummary.total }}
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- Broken OEMs Alert -->
    <UiCard v-if="brokenOems.length > 0" class="mb-4 border-red-500/30">
      <UiCardHeader class="pb-2">
        <UiCardTitle class="text-base text-red-500 flex items-center gap-2">
          <XCircle class="size-4" />
          Broken Feeds
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <div class="space-y-2">
          <div v-for="oem in brokenOems" :key="oem.oemId" class="flex items-center justify-between">
            <div>
              <span class="font-medium">{{ oemName(oem.oemId) }}</span>
              <span class="text-sm text-muted-foreground ml-2">{{ oem.errored }}/{{ oem.total }} pages errored ({{ oem.pct }}%)</span>
            </div>
            <UiButton
              size="sm"
              variant="outline"
              :disabled="triggeringCrawl === oem.oemId"
              @click="handleForceCrawl(oem.oemId)"
            >
              <RefreshCw v-if="triggeringCrawl !== oem.oemId" class="size-3 mr-1" />
              <Loader2 v-else class="size-3 mr-1 animate-spin" />
              Force Re-crawl
            </UiButton>
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
          <UiSelectItem value="all">
            All OEMs
          </UiSelectItem>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <UiSelect v-model="filterStatus">
        <UiSelectTrigger class="w-[160px]">
          <UiSelectValue placeholder="Status" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">
            All Status
          </UiSelectItem>
          <UiSelectItem value="active">
            Active
          </UiSelectItem>
          <UiSelectItem value="error">
            Error
          </UiSelectItem>
          <UiSelectItem value="blocked">
            Blocked
          </UiSelectItem>
          <UiSelectItem value="removed">
            Removed
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <span class="text-sm text-muted-foreground">{{ filtered.length }} pages</span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <UiCard v-else>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="w-[40px]">
              Status
            </UiTableHead>
            <UiTableHead>OEM</UiTableHead>
            <UiTableHead>Type</UiTableHead>
            <UiTableHead>URL</UiTableHead>
            <UiTableHead>Last Checked</UiTableHead>
            <UiTableHead>Last Changed</UiTableHead>
            <UiTableHead class="text-right">
              No-Change Streak
            </UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow v-for="page in filtered" :key="page.id">
            <UiTableCell>
              <component :is="statusIcon(page.status)" class="size-4" :class="statusColor(page.status)" />
            </UiTableCell>
            <UiTableCell class="font-medium text-sm">
              {{ oemName(page.oem_id) }}
            </UiTableCell>
            <UiTableCell>
              <UiBadge variant="outline" class="text-xs">
                {{ page.page_type }}
              </UiBadge>
            </UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground max-w-[300px] truncate">
              <a :href="page.url" target="_blank" class="hover:underline">{{ page.url }}</a>
            </UiTableCell>
            <UiTableCell class="text-sm text-muted-foreground whitespace-nowrap">
              {{ timeAgo(page.last_checked_at) }}
            </UiTableCell>
            <UiTableCell class="text-sm text-muted-foreground whitespace-nowrap">
              {{ timeAgo(page.last_changed_at) }}
            </UiTableCell>
            <UiTableCell class="text-right">
              <span :class="page.consecutive_no_change > 20 ? 'text-orange-500 font-medium' : 'text-muted-foreground'">
                {{ page.consecutive_no_change }}
              </span>
            </UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>
  </BasicPage>
</template>
