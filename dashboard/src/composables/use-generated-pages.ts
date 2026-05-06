import { ref } from 'vue'

import { workerFetch } from '@/lib/worker-api'

export interface RegenerationDecision {
  shouldRegenerate: boolean
  reason: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  checksDone: string[]
  pageAge?: number
}

export interface PageStats {
  total_models: number
  generated_pages: number
  pending_generation: number
  last_run: {
    jobId: string
    startedAt: string
    completedAt: string
    status: string
    result: {
      generated: number
      skipped: number
      failed: number
    }
  } | null
}

export function useGeneratedPages() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function checkShouldRegenerate(oemId: string, modelSlug: string): Promise<RegenerationDecision | null> {
    loading.value = true
    error.value = null

    try {
      const result = await workerFetch(`/api/v1/oem-agent/pages/${oemId}/${modelSlug}/should-regenerate`)
      return result as RegenerationDecision
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to check regeneration status'
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function fetchPageStats(oemId?: string): Promise<PageStats | null> {
    loading.value = true
    error.value = null

    try {
      const url = oemId
        ? `/api/v1/oem-agent/pages/stats?oemId=${oemId}`
        : '/api/v1/oem-agent/pages/stats'

      const result = await workerFetch(url)
      return result as PageStats
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch page stats'
      return null
    }
    finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    checkShouldRegenerate,
    fetchPageStats,
  }
}
