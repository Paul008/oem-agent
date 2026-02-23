<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Clock, Play, CheckCircle2, XCircle, Loader2, Calendar, Activity, AlertCircle } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useCronJobs, type JobStatus, type JobRun } from '@/composables/use-cron-jobs'

const { loading, error, jobs, runHistory, loadJobs, triggerJob, loadRunHistory } = useCronJobs()

const triggering = ref<Set<string>>(new Set())
const selectedJob = ref<string | null>(null)
const showHistoryModal = ref(false)

onMounted(async () => {
  await loadJobs()
})

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

async function viewHistory(jobId: string) {
  selectedJob.value = jobId
  showHistoryModal.value = true
  await loadRunHistory(jobId, 50)
}

function closeHistory() {
  showHistoryModal.value = false
  selectedJob.value = null
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

function statusColor(status: string): string {
  if (status === 'success') return 'text-green-500'
  if (status === 'failed') return 'text-red-500'
  if (status === 'running') return 'text-blue-500'
  return 'text-muted-foreground'
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'success') return 'default'
  if (status === 'failed') return 'destructive'
  if (status === 'running') return 'secondary'
  return 'outline'
}

const enabledJobs = computed(() => jobs.value.filter(j => j.enabled))
const disabledJobs = computed(() => jobs.value.filter(j => !j.enabled))
const selectedJobData = computed(() => {
  if (!selectedJob.value) return null
  return jobs.value.find(j => j.id === selectedJob.value)
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
                <div class="flex-1">
                  <UiCardTitle class="text-base">{{ job.name }}</UiCardTitle>
                  <p class="text-xs text-muted-foreground mt-1">{{ job.description }}</p>
                </div>
                <Activity class="size-4 text-green-500 flex-shrink-0 ml-2" />
              </div>
            </UiCardHeader>

            <UiCardContent class="space-y-3">
              <!-- Schedule -->
              <div class="flex items-center text-sm">
                <Clock class="size-4 mr-2 text-muted-foreground" />
                <span class="text-muted-foreground">{{ job.nextRun }}</span>
              </div>

              <!-- Last Run -->
              <div v-if="job.lastRun" class="flex items-center text-sm">
                <component
                  :is="job.lastRun.status === 'success' ? CheckCircle2 : job.lastRun.status === 'failed' ? XCircle : Loader2"
                  :class="[
                    'size-4 mr-2',
                    statusColor(job.lastRun.status),
                    job.lastRun.status === 'running' ? 'animate-spin' : ''
                  ]"
                />
                <span :class="statusColor(job.lastRun.status)">
                  {{ job.lastRun.status }} • {{ formatRelative(job.lastRun.completedAt || job.lastRun.startedAt) }}
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
              <UiCardTitle class="text-sm">{{ job.name }}</UiCardTitle>
            </UiCardHeader>
            <UiCardContent>
              <p class="text-xs text-muted-foreground">{{ job.description }}</p>
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
                      :is="run.status === 'success' ? CheckCircle2 : run.status === 'failed' ? XCircle : Loader2"
                      :class="['size-4', statusColor(run.status)]"
                    />
                    <span class="font-medium capitalize" :class="statusColor(run.status)">
                      {{ run.status }}
                    </span>
                  </div>
                  <span class="text-sm text-muted-foreground">
                    {{ formatRelative(run.startedAt) }} • {{ formatDuration(run) }}
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
