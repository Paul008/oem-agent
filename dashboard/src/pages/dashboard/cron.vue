<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import cronstrue from 'cronstrue'
import { Clock, Play, CheckCircle2, XCircle, Loader2, Calendar, Activity, AlertCircle, RefreshCw, Settings2, ChevronDown, Cloud, Globe, Tag, Newspaper, Map } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useCronJobs, type JobRun, type CloudflareTriggerStatus } from '@/composables/use-cron-jobs'

const { loading, error, jobs, cloudflareTriggers, runHistory, loadJobs, triggerJob, toggleJob, loadRunHistory } = useCronJobs()

const cfTriggerIcons: Record<string, any> = {
  homepage: Globe,
  offers: Tag,
  vehicles: Activity,
  news: Newspaper,
  sitemap: Map,
}

function getCfIcon(trigger: CloudflareTriggerStatus) {
  const crawlType = (trigger.config?.crawl_type as string) || ''
  return cfTriggerIcons[crawlType] || Cloud
}

const triggering = ref<Set<string>>(new Set())
const toggling = ref<Set<string>>(new Set())
const selectedJob = ref<string | null>(null)
const showHistoryModal = ref(false)
const expandedConfigs = ref<Set<string>>(new Set())

onMounted(async () => {
  await loadJobs()
})

// Auto-refresh every 30s
const { isActive: autoRefreshActive } = useIntervalFn(() => {
  loadJobs()
}, 30000)

async function handleRefresh() {
  await loadJobs()
}

async function handleTriggerJob(jobId: string) {
  if (triggering.value.has(jobId)) return

  triggering.value.add(jobId)
  try {
    await triggerJob(jobId)
  } catch (err) {
    console.error('Failed to trigger job:', err)
  } finally {
    triggering.value.delete(jobId)
  }
}

async function handleToggleJob(jobId: string, enabled: boolean) {
  if (toggling.value.has(jobId)) return

  toggling.value.add(jobId)
  try {
    await toggleJob(jobId, enabled)
  } catch (err) {
    console.error('Failed to toggle job:', err)
  } finally {
    toggling.value.delete(jobId)
  }
}

function toggleConfig(jobId: string) {
  if (expandedConfigs.value.has(jobId)) {
    expandedConfigs.value.delete(jobId)
  } else {
    expandedConfigs.value.add(jobId)
  }
}

async function viewHistory(jobId: string) {
  selectedJob.value = jobId
  showHistoryModal.value = true
  await loadRunHistory(jobId, 50)
}

function closeHistory() {
  showHistoryModal.value = false
  selectedJob.value = null
}

function formatSchedule(cronExpr: string): string {
  try {
    return cronstrue.toString(cronExpr, { use24HourTimeFormat: false })
  } catch {
    return cronExpr
  }
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDuration(run: JobRun): string {
  if (!run.completedAt) return 'Running...'
  const start = new Date(run.startedAt).getTime()
  const end = new Date(run.completedAt).getTime()
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function isStaleRun(run: JobRun): boolean {
  if (run.status !== 'running') return false
  const elapsed = Date.now() - new Date(run.startedAt).getTime()
  return elapsed > 10 * 60 * 1000 // 10 minutes
}

function effectiveStatus(run: JobRun): string {
  if (isStaleRun(run)) return 'timed out'
  return run.status
}

function statusColor(status: string): string {
  if (status === 'success') return 'text-green-500'
  if (status === 'failed' || status === 'timed out') return 'text-red-500'
  if (status === 'running') return 'text-blue-500'
  return 'text-muted-foreground'
}

function configSummary(config: Record<string, unknown>): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = []
  if (config.oem_ids) items.push({ label: 'OEMs', value: (config.oem_ids as string[]).join(', ') })
  if (config.pilot_oems) items.push({ label: 'Pilot OEMs', value: (config.pilot_oems as string[]).join(', ') })
  if (config.max_concurrent) items.push({ label: 'Concurrency', value: String(config.max_concurrent) })
  if (config.action) items.push({ label: 'Action', value: String(config.action) })
  if (config.max_models_per_run) items.push({ label: 'Max models', value: String(config.max_models_per_run) })
  if (config.batch_size) items.push({ label: 'Batch', value: String(config.batch_size) })
  return items.slice(0, 3)
}

const enabledJobs = computed(() => jobs.value.filter(j => j.enabled))
const disabledJobs = computed(() => jobs.value.filter(j => !j.enabled))
const selectedJobData = computed(() => {
  if (!selectedJob.value) return null
  return jobs.value.find(j => j.id === selectedJob.value)
    || cloudflareTriggers.value.find(t => t.id === selectedJob.value)
})
const selectedJobHistory = computed(() => {
  if (!selectedJob.value) return []
  return runHistory.value[selectedJob.value] || []
})
</script>

<template>
  <BasicPage
    title="Cron Jobs"
    description="Monitor and manage scheduled tasks"
    sticky
  >
    <template #actions>
      <div class="flex items-center gap-3">
        <span v-if="autoRefreshActive" class="text-xs text-muted-foreground flex items-center gap-1">
          <span class="size-1.5 rounded-full bg-green-500 animate-pulse" />
          Auto-refreshing
        </span>
        <UiButton size="sm" variant="outline" @click="handleRefresh" :disabled="loading">
          <RefreshCw :class="['size-3.5 mr-1.5', loading ? 'animate-spin' : '']" />
          Refresh
        </UiButton>
      </div>
    </template>

    <div v-if="loading && jobs.length === 0" class="flex items-center justify-center h-64">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="error" class="flex items-center justify-center h-64">
      <div class="text-center">
        <AlertCircle class="size-12 text-red-500 mx-auto mb-4" />
        <p class="text-red-500">{{ error }}</p>
      </div>
    </div>

    <template v-else>
      <!-- Enabled Jobs -->
      <div v-if="enabledJobs.length > 0">
        <h2 class="text-lg font-semibold mb-4">Active Jobs ({{ enabledJobs.length }})</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
          <UiCard v-for="job in enabledJobs" :key="job.id" class="relative">
            <UiCardHeader class="pb-3">
              <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                  <UiCardTitle class="text-base">{{ job.name }}</UiCardTitle>
                  <p class="text-xs text-muted-foreground mt-1">{{ job.description }}</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                  <UiSwitch
                    :model-value="job.enabled"
                    :disabled="toggling.has(job.id)"
                    @update:model-value="(val: boolean) => handleToggleJob(job.id, val)"
                  />
                </div>
              </div>
            </UiCardHeader>

            <UiCardContent class="space-y-3">
              <!-- Schedule -->
              <UiTooltipProvider>
                <UiTooltip>
                  <UiTooltipTrigger as-child>
                    <div class="flex items-center text-sm cursor-help">
                      <Clock class="size-4 mr-2 text-muted-foreground" />
                      <span class="text-muted-foreground">{{ formatSchedule(job.schedule) }}</span>
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent>
                    <code class="text-xs">{{ job.schedule }}</code>
                  </UiTooltipContent>
                </UiTooltip>
              </UiTooltipProvider>

              <!-- Last Run -->
              <div v-if="job.lastRun" class="flex items-center text-sm">
                <component
                  :is="effectiveStatus(job.lastRun) === 'success' ? CheckCircle2 : effectiveStatus(job.lastRun) === 'running' ? Loader2 : XCircle"
                  :class="[
                    'size-4 mr-2',
                    statusColor(effectiveStatus(job.lastRun)),
                    effectiveStatus(job.lastRun) === 'running' ? 'animate-spin' : ''
                  ]"
                />
                <span :class="statusColor(effectiveStatus(job.lastRun))">
                  {{ effectiveStatus(job.lastRun) }} &bull; {{ formatRelative(job.lastRun.completedAt || job.lastRun.startedAt) }}
                </span>
              </div>
              <div v-else class="flex items-center text-sm text-muted-foreground">
                <Calendar class="size-4 mr-2" />
                <span>Never run</span>
              </div>

              <!-- Run Count -->
              <div class="text-xs text-muted-foreground">
                {{ job.runCount }} total run{{ job.runCount !== 1 ? 's' : '' }}
              </div>

              <!-- Config Summary Badges -->
              <div v-if="configSummary(job.config).length > 0" class="flex flex-wrap gap-1">
                <UiBadge
                  v-for="item in configSummary(job.config)"
                  :key="item.label"
                  variant="outline"
                  class="text-[10px] font-normal"
                >
                  {{ item.label }}: {{ item.value }}
                </UiBadge>
              </div>

              <!-- Expandable Full Config -->
              <button
                class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                @click="toggleConfig(job.id)"
              >
                <Settings2 class="size-3" />
                Config
                <ChevronDown :class="['size-3 transition-transform', expandedConfigs.has(job.id) ? 'rotate-180' : '']" />
              </button>
              <pre
                v-if="expandedConfigs.has(job.id)"
                class="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-40"
              >{{ JSON.stringify(job.config, null, 2) }}</pre>

              <!-- Actions -->
              <div class="flex gap-2 pt-2">
                <UiButton
                  size="sm"
                  variant="outline"
                  class="flex-1"
                  :disabled="triggering.has(job.id)"
                  @click="handleTriggerJob(job.id)"
                >
                  <Loader2 v-if="triggering.has(job.id)" class="size-3 mr-1 animate-spin" />
                  <Play v-else class="size-3 mr-1" />
                  Run Now
                </UiButton>
                <UiButton
                  size="sm"
                  variant="ghost"
                  @click="viewHistory(job.id)"
                >
                  History
                </UiButton>
              </div>
            </UiCardContent>
          </UiCard>
        </div>
      </div>

      <!-- Disabled Jobs -->
      <div v-if="disabledJobs.length > 0">
        <h2 class="text-lg font-semibold mb-4 text-muted-foreground">Disabled Jobs ({{ disabledJobs.length }})</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UiCard v-for="job in disabledJobs" :key="job.id" class="opacity-60">
            <UiCardHeader class="pb-2">
              <div class="flex items-start justify-between">
                <UiCardTitle class="text-sm">{{ job.name }}</UiCardTitle>
                <UiSwitch
                  :model-value="job.enabled"
                  :disabled="toggling.has(job.id)"
                  @update:model-value="(val: boolean) => handleToggleJob(job.id, val)"
                  class="flex-shrink-0 ml-2"
                />
              </div>
            </UiCardHeader>
            <UiCardContent>
              <p class="text-xs text-muted-foreground">{{ job.description }}</p>
              <div class="flex items-center text-xs text-muted-foreground mt-2">
                <Clock class="size-3 mr-1" />
                {{ formatSchedule(job.schedule) }}
              </div>
            </UiCardContent>
          </UiCard>
        </div>
      </div>

      <!-- Cloudflare Workers Triggers -->
      <div v-if="cloudflareTriggers.length > 0" class="mt-8">
        <h2 class="text-lg font-semibold mb-1 flex items-center gap-2">
          <Cloud class="size-5 text-orange-500" />
          Cloudflare Triggers ({{ cloudflareTriggers.length }})
        </h2>
        <p class="text-xs text-muted-foreground mb-4">
          Page crawl schedules managed by Cloudflare Workers cron. These run automatically and cannot be toggled from the dashboard.
        </p>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <UiCard v-for="trigger in cloudflareTriggers" :key="trigger.id">
            <UiCardHeader class="pb-2">
              <div class="flex items-start justify-between">
                <UiCardTitle class="text-sm">{{ trigger.name }}</UiCardTitle>
                <component :is="getCfIcon(trigger)" class="size-4 text-orange-500 flex-shrink-0 ml-2" />
              </div>
            </UiCardHeader>
            <UiCardContent class="space-y-2">
              <p class="text-xs text-muted-foreground">{{ trigger.description }}</p>

              <!-- Schedule -->
              <UiTooltipProvider>
                <UiTooltip>
                  <UiTooltipTrigger as-child>
                    <div class="flex items-center text-xs text-muted-foreground cursor-help">
                      <Clock class="size-3 mr-1" />
                      {{ formatSchedule(trigger.schedule) }}
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent>
                    <code class="text-xs">{{ trigger.schedule }}</code>
                  </UiTooltipContent>
                </UiTooltip>
              </UiTooltipProvider>

              <!-- Last Run -->
              <div v-if="trigger.lastRun" class="flex items-center text-xs">
                <component
                  :is="effectiveStatus(trigger.lastRun) === 'success' ? CheckCircle2 : effectiveStatus(trigger.lastRun) === 'running' ? Loader2 : XCircle"
                  :class="[
                    'size-3 mr-1',
                    statusColor(effectiveStatus(trigger.lastRun)),
                    effectiveStatus(trigger.lastRun) === 'running' ? 'animate-spin' : ''
                  ]"
                />
                <span :class="statusColor(effectiveStatus(trigger.lastRun))">
                  {{ effectiveStatus(trigger.lastRun) }} &bull; {{ formatRelative(trigger.lastRun.completedAt || trigger.lastRun.startedAt) }}
                </span>
              </div>
              <div v-else class="flex items-center text-xs text-muted-foreground">
                <Calendar class="size-3 mr-1" />
                <span>No runs recorded</span>
              </div>

              <!-- Run Count -->
              <div v-if="trigger.runCount > 0" class="text-[10px] text-muted-foreground">
                {{ trigger.runCount }} run{{ trigger.runCount !== 1 ? 's' : '' }} recorded
              </div>

              <!-- History button -->
              <div class="pt-1">
                <UiButton
                  size="sm"
                  variant="ghost"
                  class="h-7 text-xs"
                  @click="viewHistory(trigger.id)"
                >
                  History
                </UiButton>
              </div>
            </UiCardContent>
          </UiCard>
        </div>
      </div>

      <!-- History Modal -->
      <div
        v-if="showHistoryModal && selectedJobData"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        @click.self="closeHistory"
      >
        <div class="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
          <div class="p-6 border-b">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">{{ selectedJobData.name }}</h3>
                <p class="text-sm text-muted-foreground">Run History ({{ selectedJobHistory.length }} runs)</p>
              </div>
              <UiButton variant="ghost" size="sm" @click="closeHistory">
                Close
              </UiButton>
            </div>
          </div>

          <div class="overflow-y-auto max-h-[calc(80vh-120px)] p-6">
            <!-- Job Configuration Section -->
            <details class="mb-6 border rounded-lg">
              <summary class="p-4 cursor-pointer hover:bg-accent/50 transition-colors flex items-center gap-2 text-sm font-medium">
                <Settings2 class="size-4" />
                Job Configuration
              </summary>
              <div class="p-4 pt-0 border-t">
                <div class="flex items-center text-sm text-muted-foreground mb-3">
                  <Clock class="size-4 mr-2" />
                  Schedule: {{ formatSchedule(selectedJobData.schedule) }}
                  <code class="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">{{ selectedJobData.schedule }}</code>
                </div>
                <pre class="text-xs bg-muted p-3 rounded overflow-x-auto">{{ JSON.stringify(selectedJobData.config, null, 2) }}</pre>
              </div>
            </details>

            <div v-if="selectedJobHistory.length === 0" class="text-center py-12 text-muted-foreground">
              No run history available
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="run in selectedJobHistory"
                :key="run.id"
                class="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <component
                      :is="effectiveStatus(run) === 'success' ? CheckCircle2 : effectiveStatus(run) === 'running' ? Loader2 : XCircle"
                      :class="['size-4', statusColor(effectiveStatus(run))]"
                    />
                    <span class="font-medium capitalize" :class="statusColor(effectiveStatus(run))">
                      {{ effectiveStatus(run) }}
                    </span>
                  </div>
                  <span class="text-sm text-muted-foreground">
                    {{ formatRelative(run.startedAt) }} &bull; {{ formatDuration(run) }}
                  </span>
                </div>

                <div v-if="run.error" class="mt-2 text-sm text-red-500 bg-red-500/10 rounded p-2">
                  {{ run.error }}
                </div>

                <details v-if="run.result" class="mt-2">
                  <summary class="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                    View Result
                  </summary>
                  <pre class="mt-2 text-xs bg-muted p-3 rounded overflow-x-auto">{{ JSON.stringify(run.result, null, 2) }}</pre>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </BasicPage>
</template>
