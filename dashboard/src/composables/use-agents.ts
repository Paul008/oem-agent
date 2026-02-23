/**
 * Composable for Autonomous Agent Actions
 *
 * Manages agent actions, workflow settings, and approval/rollback operations.
 * Uses Supabase client directly (matching project pattern).
 */

import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export interface AgentAction {
  id: string
  workflow_id: string
  change_event_id: string
  oem_id: string
  agent_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'requires_approval'
  confidence_score: number | null
  actions_taken: string[]
  reasoning: string | null
  execution_time_ms: number | null
  cost_usd: number | null
  error_message: string | null
  rollback_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
  completed_at: string | null
  change_events?: {
    id: string
    summary: string
    event_type: string
    severity: string
    entity_type: string
    entity_id: string
  }
}

export interface AgentStats {
  total: number
  by_status: {
    pending: number
    running: number
    completed: number
    failed: number
    requires_approval: number
  }
  by_workflow: Record<string, number>
  success_rate: number
  total_cost_usd: number
  avg_execution_ms: number
}

export interface WorkflowSetting {
  id: string
  enabled: boolean
  priority: number
  confidence_threshold: number
  rate_limit_hourly: number | null
  rate_limit_daily: number | null
  config: Record<string, unknown>
  created_at: string
  updated_at: string
  stats?: {
    total: number
    today: number
    week: number
    success_rate: number
  }
}

export function useAgents() {
  const actions = ref<AgentAction[]>([])
  const stats = ref<AgentStats | null>(null)
  const workflows = ref<WorkflowSetting[]>([])
  const selectedAction = ref<AgentAction | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Pagination
  const currentPage = ref(1)
  const pageSize = ref(50)
  const totalCount = ref(0)

  // Filters
  const filterWorkflow = ref<string>('all')
  const filterStatus = ref<string>('all')
  const filterOem = ref<string>('all')

  // Computed
  const totalPages = computed(() => Math.ceil(totalCount.value / pageSize.value))
  const hasNextPage = computed(() => currentPage.value < totalPages.value)
  const hasPrevPage = computed(() => currentPage.value > 1)

  async function fetchActions() {
    loading.value = true
    error.value = null

    try {
      const offset = (currentPage.value - 1) * pageSize.value

      let query = supabase
        .from('agent_actions')
        .select(`
          *,
          change_events (
            id, summary, event_type, severity, entity_type, entity_id
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize.value - 1)

      if (filterWorkflow.value && filterWorkflow.value !== 'all') query = query.eq('workflow_id', filterWorkflow.value)
      if (filterStatus.value && filterStatus.value !== 'all') query = query.eq('status', filterStatus.value)
      if (filterOem.value && filterOem.value !== 'all') query = query.eq('oem_id', filterOem.value)

      const { data, error: queryError, count } = await query

      if (queryError) throw new Error(queryError.message)

      actions.value = (data || []) as AgentAction[]
      totalCount.value = count || 0
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      console.error('[useAgents] Error fetching actions:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    try {
      let query = supabase
        .from('agent_actions')
        .select('status, workflow_id, cost_usd, execution_time_ms, created_at')

      if (filterOem.value && filterOem.value !== 'all') query = query.eq('oem_id', filterOem.value)

      const { data: allActions, error: queryError } = await query

      if (queryError) throw new Error(queryError.message)

      const byStatus = { pending: 0, running: 0, completed: 0, failed: 0, requires_approval: 0 }
      const byWorkflow: Record<string, number> = {}
      let totalCost = 0
      let totalTime = 0
      let costCount = 0

      for (const a of allActions || []) {
        const s = a.status as keyof typeof byStatus
        if (s in byStatus) byStatus[s]++
        byWorkflow[a.workflow_id] = (byWorkflow[a.workflow_id] || 0) + 1
        if (a.cost_usd != null) {
          totalCost += a.cost_usd
          totalTime += a.execution_time_ms || 0
          costCount++
        }
      }

      const completed = byStatus.completed
      const failed = byStatus.failed
      const total = completed + failed

      stats.value = {
        total: allActions?.length || 0,
        by_status: byStatus,
        by_workflow: byWorkflow,
        success_rate: total > 0 ? (completed / total) * 100 : 0,
        total_cost_usd: totalCost,
        avg_execution_ms: costCount > 0 ? Math.round(totalTime / costCount) : 0,
      }
    } catch (e) {
      console.error('[useAgents] Error fetching stats:', e)
    }
  }

  async function fetchAction(id: string) {
    loading.value = true
    error.value = null

    try {
      const { data, error: queryError } = await supabase
        .from('agent_actions')
        .select(`*, change_events (*)`)
        .eq('id', id)
        .single()

      if (queryError) throw new Error(queryError.message)

      selectedAction.value = data as AgentAction
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      console.error('[useAgents] Error fetching action:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  async function approveAction(id: string) {
    try {
      const { error: updateError } = await supabase
        .from('agent_actions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (updateError) throw new Error(updateError.message)

      await fetchActions()
      await fetchStats()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      console.error('[useAgents] Error approving action:', e)
      return false
    }
  }

  async function rollbackAction(id: string) {
    try {
      const { error: updateError } = await supabase
        .from('agent_actions')
        .update({
          status: 'failed',
          error_message: 'Manually rolled back by user',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (updateError) throw new Error(updateError.message)

      await fetchActions()
      await fetchStats()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      console.error('[useAgents] Error rolling back action:', e)
      return false
    }
  }

  async function fetchWorkflows() {
    loading.value = true
    error.value = null

    try {
      const { data, error: queryError } = await supabase
        .from('workflow_settings')
        .select('*')
        .order('priority', { ascending: false })

      if (queryError) throw new Error(queryError.message)

      // Get action counts for each workflow
      const { data: actionCounts } = await supabase
        .from('agent_actions')
        .select('workflow_id, status, created_at')

      workflows.value = (data || []).map((workflow: any) => {
        const wfActions = (actionCounts || []).filter((a: any) => a.workflow_id === workflow.id)
        const completed = wfActions.filter((a: any) => a.status === 'completed').length
        const failed = wfActions.filter((a: any) => a.status === 'failed').length
        const total = completed + failed

        return {
          ...workflow,
          stats: {
            total: wfActions.length,
            today: wfActions.filter((a: any) => {
              return new Date(a.created_at).toDateString() === new Date().toDateString()
            }).length,
            week: wfActions.filter((a: any) => {
              return new Date(a.created_at) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }).length,
            success_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
          },
        }
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      console.error('[useAgents] Error fetching workflows:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchWorkflowConfig(id: string): Promise<Record<string, unknown>> {
    try {
      const { data, error: queryError } = await supabase
        .from('workflow_settings')
        .select('config')
        .eq('id', id)
        .single()

      if (queryError && queryError.code !== 'PGRST116') throw new Error(queryError.message)

      return (data?.config as Record<string, unknown>) || {}
    } catch (e) {
      console.error('[useAgents] Error fetching workflow config:', e)
      return {}
    }
  }

  async function updateWorkflow(id: string, updates: Partial<WorkflowSetting>) {
    try {
      const allowedFields = ['enabled', 'priority', 'confidence_threshold', 'rate_limit_hourly', 'rate_limit_daily', 'config']
      const cleanUpdates: Record<string, unknown> = {}
      for (const field of allowedFields) {
        if (field in updates) cleanUpdates[field] = (updates as any)[field]
      }
      cleanUpdates.updated_at = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('workflow_settings')
        .update(cleanUpdates)
        .eq('id', id)

      if (updateError) throw new Error(updateError.message)

      await fetchWorkflows()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      console.error('[useAgents] Error updating workflow:', e)
      return false
    }
  }

  function nextPage() {
    if (hasNextPage.value) {
      currentPage.value++
      fetchActions()
    }
  }

  function prevPage() {
    if (hasPrevPage.value) {
      currentPage.value--
      fetchActions()
    }
  }

  function resetFilters() {
    filterWorkflow.value = 'all'
    filterStatus.value = 'all'
    filterOem.value = 'all'
    currentPage.value = 1
    fetchActions()
    fetchStats()
  }

  return {
    actions,
    stats,
    workflows,
    selectedAction,
    loading,
    error,
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage,
    hasPrevPage,
    filterWorkflow,
    filterStatus,
    filterOem,
    fetchActions,
    fetchStats,
    fetchAction,
    approveAction,
    rollbackAction,
    fetchWorkflows,
    fetchWorkflowConfig,
    updateWorkflow,
    nextPage,
    prevPage,
    resetFilters,
  }
}
