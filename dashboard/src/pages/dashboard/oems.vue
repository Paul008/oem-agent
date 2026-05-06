<script lang="ts" setup>
import { AlertTriangle, ExternalLink, Loader2, Play, RefreshCw } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import type { ImportRun, Oem, SourcePage } from '@/composables/use-oem-data'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { triggerCrawl, triggerForceCrawl } from '@/lib/worker-api'

const { fetchOems, fetchImportRuns, fetchSourcePages } = useOemData()

const oems = ref<Oem[]>([])
const runs = ref<ImportRun[]>([])
const pages = ref<SourcePage[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const actionLoading = ref<string | null>(null)

onMounted(async () => {
  try {
    const [o, r, p] = await Promise.all([fetchOems(), fetchImportRuns(500), fetchSourcePages()])
    oems.value = o
    runs.value = r
    pages.value = p
  }
  catch (err: any) {
    loadError.value = err.message || 'Failed to load OEM data'
    toast.error(loadError.value!)
  }
  finally {
    loading.value = false
  }
})

function lastRunForOem(oemId: string) {
  return runs.value.find(r => r.oem_id === oemId)
}

function runCountForOem(oemId: string) {
  return runs.value.filter(r => r.oem_id === oemId).length
}

function erroredPagesForOem(oemId: string) {
  return pages.value.filter(p => p.oem_id === oemId && p.status === 'error').length
}

function pageCountForOem(oemId: string) {
  return pages.value.filter(p => p.oem_id === oemId && p.is_active).length
}

function successRate(oemId: string) {
  const oemRuns = runs.value.filter(r => r.oem_id === oemId)
  if (!oemRuns.length)
    return '-'
  const success = oemRuns.filter(r => r.status === 'success').length
  return `${Math.round((success / oemRuns.length) * 100)}%`
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

async function handleCrawl(oemId: string, oemName: string) {
  actionLoading.value = `crawl-${oemId}`
  try {
    await triggerCrawl(oemId)
    toast.success(`Crawl triggered for ${oemName}`)
  }
  catch (err: any) {
    toast.error(`Failed: ${err.message}`)
  }
  finally {
    actionLoading.value = null
  }
}

async function handleForceCrawl(oemId: string, oemName: string) {
  actionLoading.value = `force-${oemId}`
  try {
    await triggerForceCrawl(oemId)
    toast.success(`Force crawl triggered for ${oemName}`)
  }
  catch (err: any) {
    toast.error(`Failed: ${err.message}`)
  }
  finally {
    actionLoading.value = null
  }
}
</script>

<template>
  <BasicPage title="OEMs" description="Monitored Australian OEM manufacturers" sticky>
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <div v-else-if="loadError" class="flex flex-col items-center justify-center h-64 gap-2">
      <AlertTriangle class="size-8 text-destructive" />
      <p class="text-sm text-muted-foreground">
        {{ loadError }}
      </p>
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UiCard v-for="oem in oems" :key="oem.id">
        <UiCardHeader class="pb-3">
          <div class="flex items-center justify-between">
            <UiCardTitle class="text-base">
              {{ oem.name?.replace(' Australia', '') }}
            </UiCardTitle>
            <div class="flex items-center gap-1">
              <UiBadge v-if="erroredPagesForOem(oem.id) > 0" variant="destructive" class="text-[10px]">
                {{ erroredPagesForOem(oem.id) }} errors
              </UiBadge>
              <UiBadge :variant="oem.is_active ? 'default' : 'secondary'">
                {{ oem.is_active ? 'Active' : 'Inactive' }}
              </UiBadge>
            </div>
          </div>
          <UiCardDescription class="flex items-center gap-1">
            <a v-if="oem.base_url" :href="oem.base_url" target="_blank" class="hover:underline flex items-center gap-1">
              {{ oem.base_url?.replace('https://', '') }}
              <ExternalLink class="size-3" />
            </a>
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <div class="grid grid-cols-2 gap-y-2 text-sm mb-3">
            <div>
              <span class="text-muted-foreground">Pages monitored</span>
              <p class="font-medium">
                {{ pageCountForOem(oem.id) }}
              </p>
            </div>
            <div>
              <span class="text-muted-foreground">Total runs</span>
              <p class="font-medium">
                {{ runCountForOem(oem.id) }}
              </p>
            </div>
            <div>
              <span class="text-muted-foreground">Success rate</span>
              <p class="font-medium">
                {{ successRate(oem.id) }}
              </p>
            </div>
            <div>
              <span class="text-muted-foreground">Last run</span>
              <p class="font-medium">
                {{ timeAgo(lastRunForOem(oem.id)?.created_at ?? null) }}
              </p>
            </div>
          </div>
          <div class="flex gap-2 pt-2 border-t">
            <UiButton
              size="sm"
              variant="outline"
              class="flex-1"
              :disabled="actionLoading === `crawl-${oem.id}`"
              @click="handleCrawl(oem.id, oem.name?.replace(' Australia', '') ?? oem.id)"
            >
              <Loader2 v-if="actionLoading === `crawl-${oem.id}`" class="size-3 mr-1 animate-spin" />
              <Play v-else class="size-3 mr-1" />
              Crawl
            </UiButton>
            <UiButton
              size="sm"
              variant="ghost"
              class="flex-1"
              :disabled="actionLoading === `force-${oem.id}`"
              @click="handleForceCrawl(oem.id, oem.name?.replace(' Australia', '') ?? oem.id)"
            >
              <Loader2 v-if="actionLoading === `force-${oem.id}`" class="size-3 mr-1 animate-spin" />
              <RefreshCw v-else class="size-3 mr-1" />
              Force
            </UiButton>
          </div>
        </UiCardContent>
      </UiCard>
    </div>
  </BasicPage>
</template>
