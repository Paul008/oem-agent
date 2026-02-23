import { ref } from 'vue'
import { fetchCronJobs, triggerCronJob, fetchCronRuns } from '@/lib/worker-api'

export interface CronJob {
  id: string
  name: string
  description: string
  schedule: string
  timezone: string
  skill: string
  enabled: boolean
  config: Record<string, unknown>
}

export interface JobRun {
  id: string
  jobId: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'success' | 'failed'
  result?: Record<string, unknown>
  error?: string
}

export interface JobStatus extends CronJob {
  lastRun?: JobRun
  nextRun?: string
  runCount: number
}

export interface CronJobsResponse {
  version: string
  description: string
  jobs: JobStatus[]
  globalConfig: Record<string, unknown>
}

export function useCronJobs() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const jobs = ref<JobStatus[]>([])
  const runHistory = ref<Record<string, JobRun[]>>({})

  async function loadJobs() {
    loading.value = true
    error.value = null

    try {
      const response = await fetchCronJobs() as CronJobsResponse
      jobs.value = response.jobs
      return response
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load cron jobs'
      return null
    } finally {
      loading.value = false
    }
  }

  async function triggerJob(jobId: string) {
    try {
      const result = await triggerCronJob(jobId)
      // Reload jobs to get updated status
      await loadJobs()
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to trigger job'
      throw err
    }
  }

  async function loadRunHistory(jobId: string, limit = 20) {
    try {
      const response = await fetchCronRuns(jobId, limit) as {
        jobId: string
        jobName: string
        runs: JobRun[]
        total: number
      }
      runHistory.value[jobId] = response.runs
      return response.runs
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load run history'
      return []
    }
  }

  function getJobById(jobId: string): JobStatus | undefined {
    return jobs.value.find(j => j.id === jobId)
  }

  return {
    loading,
    error,
    jobs,
    runHistory,
    loadJobs,
    triggerJob,
    loadRunHistory,
    getJobById,
  }
}
