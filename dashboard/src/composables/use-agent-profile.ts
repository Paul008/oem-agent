/**
 * Composable for Agent Profile Pages
 *
 * Provides WORKFLOW_METADATA (static info about all 8 workflows)
 * and useAgentProfile(workflowId) for detailed per-workflow data.
 */

import type { Component } from 'vue'

import {
  Clock,
  DollarSign,
  FileText,
  GitBranch,
  ImageIcon,
  Link,
  Package,
  Shield,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { AgentAction, WorkflowSetting } from '@/composables/use-agents'

import { supabase } from '@/lib/supabase'

export interface WorkflowMeta {
  id: string
  name: string
  description: string
  agent_type: string
  skill: string
  tools: string[]
  icon: Component
  colorClass: string
  defaultConfidence: number
  defaultPriority: number
}

export const WORKFLOW_METADATA: Record<string, WorkflowMeta> = {
  'price-validation': {
    id: 'price-validation',
    name: 'Price Validation & Correction',
    description: 'Validates price changes against OEM source and corrects mismatches',
    agent_type: 'browser-validator',
    skill: 'price-validator',
    tools: ['browser', 'read', 'edit'],
    icon: DollarSign,
    colorClass: 'bg-red-500/10 text-red-500 border-red-500/20',
    defaultConfidence: 0.95,
    defaultPriority: 10,
  },
  'product-enrichment': {
    id: 'product-enrichment',
    name: 'Missing Product Data Enrichment',
    description: 'Extracts and enriches missing product data from OEM source',
    agent_type: 'data-enricher',
    skill: 'product-enricher',
    tools: ['browser', 'exec', 'read', 'write', 'edit', 'image'],
    icon: Package,
    colorClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    defaultConfidence: 0.85,
    defaultPriority: 8,
  },
  'link-repair': {
    id: 'link-repair',
    name: 'Broken Link Repair',
    description: 'Detects and repairs broken URLs in product/offer records',
    agent_type: 'link-validator',
    skill: 'link-validator',
    tools: ['web_fetch', 'exec', 'read', 'edit'],
    icon: Link,
    colorClass: 'bg-green-500/10 text-green-500 border-green-500/20',
    defaultConfidence: 0.90,
    defaultPriority: 7,
  },
  'offer-expiry': {
    id: 'offer-expiry',
    name: 'Offer Expiry Management',
    description: 'Manages expiring offers and archives when confirmed expired',
    agent_type: 'offer-manager',
    skill: 'offer-manager',
    tools: ['browser', 'read', 'edit'],
    icon: Clock,
    colorClass: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    defaultConfidence: 1.0,
    defaultPriority: 6,
  },
  'image-quality': {
    id: 'image-quality',
    name: 'Image Quality Validation',
    description: 'Validates image quality and re-downloads if issues detected',
    agent_type: 'image-validator',
    skill: 'image-validator',
    tools: ['browser', 'exec', 'read', 'write', 'image'],
    icon: ImageIcon,
    colorClass: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
    defaultConfidence: 0.80,
    defaultPriority: 5,
  },
  'new-model-page': {
    id: 'new-model-page',
    name: 'New Model Page Generation',
    description: 'Generates marketing pages for newly discovered vehicle models',
    agent_type: 'brand-ambassador',
    skill: 'page-generator',
    tools: ['browser', 'read', 'write', 'image'],
    icon: FileText,
    colorClass: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    defaultConfidence: 0.90,
    defaultPriority: 9,
  },
  'disclaimer-compliance': {
    id: 'disclaimer-compliance',
    name: 'Disclaimer Text Compliance Check',
    description: 'Validates disclaimer text against compliance templates',
    agent_type: 'compliance-checker',
    skill: 'compliance-checker',
    tools: ['read'],
    icon: Shield,
    colorClass: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    defaultConfidence: 0.95,
    defaultPriority: 8,
  },
  'variant-sync': {
    id: 'variant-sync',
    name: 'Variant Data Synchronization',
    description: 'Syncs variant data with OEM source when changes detected',
    agent_type: 'variant-sync',
    skill: 'variant-sync',
    tools: ['browser', 'read', 'edit'],
    icon: GitBranch,
    colorClass: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    defaultConfidence: 0.85,
    defaultPriority: 7,
  },
}

/**
 * OpenClaw tool descriptions — shown as tooltips on agent profile pages.
 * See https://docs.openclaw.ai/tools for full reference.
 */
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  browser: 'Control a browser via CDP — navigate, screenshot, interact with UI elements',
  exec: 'Run shell commands in the sandbox environment',
  read: 'Read files from the workspace',
  write: 'Write files to the workspace',
  edit: 'Modify existing files in the workspace',
  apply_patch: 'Apply multi-hunk patches across files',
  image: 'Analyze images using a vision model',
  web_fetch: 'Fetch and parse web pages as markdown',
  web_search: 'Search the web via Brave Search API',
  process: 'Manage background processes (list, poll, kill)',
}

export interface ProfileStats {
  total: number
  completed: number
  failed: number
  pending: number
  running: number
  requires_approval: number
  success_rate: number
  avg_execution_ms: number
  total_cost_usd: number
  avg_cost_usd: number
  this_week: number
}

export interface DailyActivity {
  date: string
  completed: number
  failed: number
  other: number
}

export interface ErrorGroup {
  message: string
  count: number
  first_seen: string
  last_seen: string
}

export function useAgentProfile(workflowId: string) {
  const workflowSetting = ref<WorkflowSetting | null>(null)
  const allActions = ref<AgentAction[]>([])
  const recentActions = ref<AgentAction[]>([])
  const stats = ref<ProfileStats | null>(null)
  const dailyActivity = ref<DailyActivity[]>([])
  const errorGroups = ref<ErrorGroup[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Pagination for recent actions
  const currentPage = ref(1)
  const pageSize = ref(20)
  const totalCount = ref(0)
  const totalPages = computed(() => Math.ceil(totalCount.value / pageSize.value))
  const hasNextPage = computed(() => currentPage.value < totalPages.value)
  const hasPrevPage = computed(() => currentPage.value > 1)

  const meta = computed(() => WORKFLOW_METADATA[workflowId] || null)

  async function fetchProfile() {
    try {
      const { data, error: queryError } = await supabase
        .from('workflow_settings')
        .select('*')
        .eq('id', workflowId)
        .single()

      if (queryError) {
        // Workflow may not have a settings row yet — that's fine
        if (queryError.code !== 'PGRST116')
          throw new Error(queryError.message)
      }

      workflowSetting.value = data as WorkflowSetting | null
    }
    catch (e) {
      console.error('[useAgentProfile] Error fetching profile:', e)
    }
  }

  async function fetchStats() {
    try {
      const { data, error: queryError } = await supabase
        .from('agent_actions')
        .select('status, execution_time_ms, cost_usd, created_at')
        .eq('workflow_id', workflowId)

      if (queryError)
        throw new Error(queryError.message)

      const rows = data || []
      const byStatus = { pending: 0, running: 0, completed: 0, failed: 0, requires_approval: 0 }
      let totalCost = 0
      let totalTime = 0
      let timeCount = 0
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      let weekCount = 0

      for (const r of rows) {
        const s = r.status as keyof typeof byStatus
        if (s in byStatus)
          byStatus[s]++
        if (r.cost_usd != null)
          totalCost += r.cost_usd
        if (r.execution_time_ms != null) {
          totalTime += r.execution_time_ms
          timeCount++
        }
        if (new Date(r.created_at).getTime() >= weekAgo)
          weekCount++
      }

      const finished = byStatus.completed + byStatus.failed

      stats.value = {
        total: rows.length,
        ...byStatus,
        success_rate: finished > 0 ? (byStatus.completed / finished) * 100 : 0,
        avg_execution_ms: timeCount > 0 ? Math.round(totalTime / timeCount) : 0,
        total_cost_usd: totalCost,
        avg_cost_usd: rows.length > 0 ? totalCost / rows.length : 0,
        this_week: weekCount,
      }
    }
    catch (e) {
      console.error('[useAgentProfile] Error fetching stats:', e)
    }
  }

  async function fetchDailyActivity() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const { data, error: queryError } = await supabase
        .from('agent_actions')
        .select('status, created_at')
        .eq('workflow_id', workflowId)
        .gte('created_at', thirtyDaysAgo)

      if (queryError)
        throw new Error(queryError.message)

      // Group by date
      const byDate = new Map<string, { completed: number, failed: number, other: number }>()

      // Initialize all 30 days
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        const key = d.toISOString().slice(0, 10)
        byDate.set(key, { completed: 0, failed: 0, other: 0 })
      }

      for (const r of data || []) {
        const key = r.created_at.slice(0, 10)
        const bucket = byDate.get(key)
        if (!bucket)
          continue
        if (r.status === 'completed')
          bucket.completed++
        else if (r.status === 'failed')
          bucket.failed++
        else bucket.other++
      }

      dailyActivity.value = Array.from(byDate.entries()).map(([date, counts]) => ({
        date,
        ...counts,
      }))
    }
    catch (e) {
      console.error('[useAgentProfile] Error fetching daily activity:', e)
    }
  }

  async function fetchRecentActions() {
    try {
      const offset = (currentPage.value - 1) * pageSize.value

      const { data, error: queryError, count } = await supabase
        .from('agent_actions')
        .select(`
          *,
          change_events (
            id, summary, event_type, severity, entity_type, entity_id
          )
        `, { count: 'exact' })
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize.value - 1)

      if (queryError)
        throw new Error(queryError.message)

      recentActions.value = (data || []) as AgentAction[]
      totalCount.value = count || 0
    }
    catch (e) {
      console.error('[useAgentProfile] Error fetching recent actions:', e)
    }
  }

  async function fetchErrorGroups() {
    try {
      const { data, error: queryError } = await supabase
        .from('agent_actions')
        .select('error_message, created_at')
        .eq('workflow_id', workflowId)
        .eq('status', 'failed')
        .not('error_message', 'is', null)
        .order('created_at', { ascending: false })

      if (queryError)
        throw new Error(queryError.message)

      const groups = new Map<string, { count: number, first_seen: string, last_seen: string }>()

      for (const r of data || []) {
        const msg = r.error_message || 'Unknown error'
        const existing = groups.get(msg)
        if (existing) {
          existing.count++
          if (r.created_at < existing.first_seen)
            existing.first_seen = r.created_at
          if (r.created_at > existing.last_seen)
            existing.last_seen = r.created_at
        }
        else {
          groups.set(msg, { count: 1, first_seen: r.created_at, last_seen: r.created_at })
        }
      }

      errorGroups.value = Array.from(groups.entries())
        .map(([message, g]) => ({ message, ...g }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10) // Top 10 errors
    }
    catch (e) {
      console.error('[useAgentProfile] Error fetching error groups:', e)
    }
  }

  async function fetchAll() {
    loading.value = true
    error.value = null

    try {
      await Promise.all([
        fetchProfile(),
        fetchStats(),
        fetchDailyActivity(),
        fetchRecentActions(),
        fetchErrorGroups(),
      ])
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    }
    finally {
      loading.value = false
    }
  }

  function nextPage() {
    if (hasNextPage.value) {
      currentPage.value++
      fetchRecentActions()
    }
  }

  function prevPage() {
    if (hasPrevPage.value) {
      currentPage.value--
      fetchRecentActions()
    }
  }

  return {
    meta,
    workflowSetting,
    stats,
    dailyActivity,
    recentActions,
    errorGroups,
    loading,
    error,
    currentPage,
    totalPages,
    totalCount,
    hasNextPage,
    hasPrevPage,
    fetchAll,
    fetchRecentActions,
    nextPage,
    prevPage,
  }
}
