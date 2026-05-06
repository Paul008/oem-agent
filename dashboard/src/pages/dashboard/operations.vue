<script lang="ts" setup>
import { AlertTriangle, Loader2, Play, RefreshCw, Server, Zap } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import type { ImportRun } from '@/composables/use-oem-data'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { supabase } from '@/lib/supabase'
import {
  fetchCronJobs,
  fetchWorkerHealth,
  triggerCrawl,
  triggerCrawlAll,
  triggerCronJob,
  triggerForceCrawl,
} from '@/lib/worker-api'

const { fetchOems, fetchImportRuns } = useOemData()

const oems = ref<{ id: string, name: string }[]>([])
const zombieRuns = ref<ImportRun[]>([])
const workerHealth = ref<any>(null)
const cronJobs = ref<any>(null)
const loading = ref(true)
const actionLoading = ref<string | null>(null)

onMounted(async () => {
  try {
    const [o, runs] = await Promise.all([fetchOems(), fetchImportRuns(500)])
    oems.value = o

    // Find zombie runs (stuck in "running" for more than 1 hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
    zombieRuns.value = runs.filter(
      r => r.status === 'running' && r.created_at < oneHourAgo,
    )

    // Try to fetch worker health and cron jobs (may fail if worker is down)
    try {
      workerHealth.value = await fetchWorkerHealth()
    }
    catch { /* worker may be unreachable */ }

    try {
      cronJobs.value = await fetchCronJobs()
    }
    catch { /* worker may be unreachable */ }
  }
  finally {
    loading.value = false
  }
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60)
    return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)
    return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

async function handleAction(actionId: string, fn: () => Promise<any>, label: string) {
  actionLoading.value = actionId
  try {
    await fn()
    toast.success(`${label} triggered successfully`)
  }
  catch (err: any) {
    toast.error(`Failed: ${err.message}`)
  }
  finally {
    actionLoading.value = null
  }
}

async function cleanupZombieRuns() {
  actionLoading.value = 'cleanup-zombies'
  try {
    const ids = zombieRuns.value.map(r => r.id)
    const { error } = await supabase
      .from('import_runs')
      .update({ status: 'failed', error_log: 'Manually cleaned up - stuck in running state' })
      .in('id', ids)
    if (error)
      throw error
    toast.success(`Cleaned up ${ids.length} zombie runs`)
    zombieRuns.value = []
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
  <BasicPage title="Operations" description="Trigger crawls, manage crons, cleanup zombie runs" sticky>
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Worker Health -->
      <UiCard class="mb-4">
        <UiCardHeader class="pb-2">
          <UiCardTitle class="text-base flex items-center gap-2">
            <Server class="size-4" />
            Worker Status
          </UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div v-if="workerHealth" class="flex items-center gap-4">
            <UiBadge variant="default" class="bg-green-500">
              Online
            </UiBadge>
            <span class="text-sm text-muted-foreground">{{ workerHealth.version || 'unknown version' }}</span>
          </div>
          <div v-else class="flex items-center gap-2">
            <UiBadge variant="destructive">
              Unreachable
            </UiBadge>
            <span class="text-sm text-muted-foreground">Worker may be down or CORS blocked</span>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Zombie Runs Alert -->
      <UiCard v-if="zombieRuns.length > 0" class="mb-4 border-orange-500/30">
        <UiCardHeader class="pb-2">
          <div class="flex items-center justify-between">
            <UiCardTitle class="text-base text-orange-500 flex items-center gap-2">
              <AlertTriangle class="size-4" />
              {{ zombieRuns.length }} Zombie Runs Detected
            </UiCardTitle>
            <UiButton
              size="sm"
              variant="destructive"
              :disabled="actionLoading === 'cleanup-zombies'"
              @click="cleanupZombieRuns"
            >
              <Loader2 v-if="actionLoading === 'cleanup-zombies'" class="size-3 mr-1 animate-spin" />
              Clean Up All
            </UiButton>
          </div>
          <UiCardDescription>Runs stuck in "running" for over 1 hour</UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <div class="space-y-1 text-sm">
            <div v-for="run in zombieRuns.slice(0, 10)" :key="run.id" class="flex items-center gap-3 text-muted-foreground">
              <span class="font-medium text-foreground">{{ oemName(run.oem_id) }}</span>
              <span>{{ run.run_type }}</span>
              <span>started {{ timeAgo(run.created_at) }}</span>
            </div>
            <p v-if="zombieRuns.length > 10" class="text-muted-foreground">
              ...and {{ zombieRuns.length - 10 }} more
            </p>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Crawl Actions -->
      <div class="grid gap-4 lg:grid-cols-2 mb-4">
        <!-- Quick Actions -->
        <UiCard>
          <UiCardHeader class="pb-2">
            <UiCardTitle class="text-base flex items-center gap-2">
              <Zap class="size-4" />
              Quick Actions
            </UiCardTitle>
          </UiCardHeader>
          <UiCardContent class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">
                  Crawl All OEMs
                </p>
                <p class="text-xs text-muted-foreground">
                  Trigger crawl for all active OEMs
                </p>
              </div>
              <UiButton
                size="sm"
                :disabled="actionLoading === 'crawl-all'"
                @click="handleAction('crawl-all', triggerCrawlAll, 'Crawl all OEMs')"
              >
                <Loader2 v-if="actionLoading === 'crawl-all'" class="size-3 mr-1 animate-spin" />
                <Play v-else class="size-3 mr-1" />
                Run
              </UiButton>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Per-OEM Crawl -->
        <UiCard>
          <UiCardHeader class="pb-2">
            <UiCardTitle class="text-base flex items-center gap-2">
              <RefreshCw class="size-4" />
              Per-OEM Crawl
            </UiCardTitle>
          </UiCardHeader>
          <UiCardContent>
            <div class="space-y-2 max-h-[300px] overflow-y-auto">
              <div v-for="oem in oems" :key="oem.id" class="flex items-center justify-between">
                <span class="text-sm">{{ oem.name?.replace(' Australia', '') }}</span>
                <div class="flex gap-1">
                  <UiButton
                    size="sm"
                    variant="outline"
                    :disabled="actionLoading === `crawl-${oem.id}`"
                    @click="handleAction(`crawl-${oem.id}`, () => triggerCrawl(oem.id), `Crawl ${oem.name}`)"
                  >
                    <Loader2 v-if="actionLoading === `crawl-${oem.id}`" class="size-3 mr-1 animate-spin" />
                    <Play v-else class="size-3 mr-1" />
                    Crawl
                  </UiButton>
                  <UiButton
                    size="sm"
                    variant="ghost"
                    :disabled="actionLoading === `force-${oem.id}`"
                    @click="handleAction(`force-${oem.id}`, () => triggerForceCrawl(oem.id), `Force crawl ${oem.name}`)"
                  >
                    <Loader2 v-if="actionLoading === `force-${oem.id}`" class="size-3 mr-1 animate-spin" />
                    <RefreshCw v-else class="size-3 mr-1" />
                    Force
                  </UiButton>
                </div>
              </div>
            </div>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Cron Jobs -->
      <UiCard v-if="cronJobs">
        <UiCardHeader class="pb-2">
          <UiCardTitle class="text-base">
            Cron Jobs
          </UiCardTitle>
          <UiCardDescription>Scheduled crawl triggers</UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <div class="space-y-3">
            <div
              v-for="job in cronJobs.jobs"
              :key="job.id"
              class="flex items-center justify-between border-b border-border pb-2 last:border-0"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ job.name || job.id }}
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ job.schedule }} · {{ job.description || '' }}
                </p>
              </div>
              <UiButton
                size="sm"
                variant="outline"
                :disabled="actionLoading === `cron-${job.id}`"
                @click="handleAction(`cron-${job.id}`, () => triggerCronJob(job.id), job.name)"
              >
                <Loader2 v-if="actionLoading === `cron-${job.id}`" class="size-3 mr-1 animate-spin" />
                <Play v-else class="size-3 mr-1" />
                Trigger
              </UiButton>
            </div>
          </div>
        </UiCardContent>
      </UiCard>
    </template>
  </BasicPage>
</template>
