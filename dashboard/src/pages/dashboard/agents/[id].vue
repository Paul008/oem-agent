<script lang="ts" setup>
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  Loader2,
  RefreshCw,
  Settings,
  ShieldCheck,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'

import type { AgentAction } from '@/composables/use-agents'

import { BasicPage } from '@/components/global-layout'
import { TOOL_DESCRIPTIONS, useAgentProfile, WORKFLOW_METADATA } from '@/composables/use-agent-profile'
import { useRealtimeSubscription } from '@/composables/use-realtime'

const route = useRoute()
const router = useRouter()
const workflowId = route.params.id as string

// Validate workflow exists
const meta = WORKFLOW_METADATA[workflowId]
if (!meta) {
  router.replace('/dashboard/agents/')
}

const {
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
} = useAgentProfile(workflowId)

onMounted(() => {
  fetchAll()
})

useRealtimeSubscription<AgentAction>({
  channelName: `agent-profile-${workflowId}-live`,
  table: 'agent_actions',
  event: '*',
  filter: `workflow_id=eq.${workflowId}`,
  dataRef: recentActions,
  maxItems: 20,
  onEvent: () => fetchAll(),
})

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-AU', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

function statusIcon(status: string) {
  if (status === 'completed')
    return { icon: CheckCircle, class: 'text-green-500' }
  if (status === 'failed')
    return { icon: XCircle, class: 'text-red-500' }
  if (status === 'running')
    return { icon: Loader2, class: 'text-blue-500 animate-spin' }
  if (status === 'requires_approval')
    return { icon: ShieldCheck, class: 'text-yellow-500' }
  return { icon: Clock, class: 'text-muted-foreground' }
}

function confidenceColor(score: number) {
  if (score >= 0.9)
    return 'text-green-500'
  if (score >= 0.7)
    return 'text-yellow-500'
  return 'text-red-500'
}

// Activity chart helpers
const chartMax = computed(() => {
  if (!dailyActivity.value.length)
    return 1
  return Math.max(1, ...dailyActivity.value.map(d => d.completed + d.failed + d.other))
})

// Detail dialog
const selectedAction = ref<AgentAction | null>(null)
const detailOpen = ref(false)

function viewDetails(action: AgentAction) {
  selectedAction.value = action
  detailOpen.value = true
}
</script>

<template>
  <BasicPage v-if="meta" :title="meta.name" :description="meta.description" sticky>
    <template #actions>
      <UiButton variant="outline" size="sm" @click="router.push('/dashboard/agents/')">
        <ArrowLeft class="size-4 mr-2" />
        Back
      </UiButton>
      <UiButton variant="outline" size="sm" :disabled="loading" @click="fetchAll">
        <RefreshCw class="size-4 mr-2" :class="{ 'animate-spin': loading }" />
        Refresh
      </UiButton>
    </template>

    <!-- Loading -->
    <div v-if="loading && !stats" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Identity Card -->
      <UiCard class="mb-6">
        <UiCardContent class="pt-6">
          <div class="flex items-start gap-4">
            <div class="rounded-lg p-3 border" :class="meta.colorClass">
              <component :is="meta.icon" class="size-6" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <UiBadge
                  variant="outline"
                  :class="workflowSetting?.enabled ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-muted text-muted-foreground border-border'"
                >
                  {{ workflowSetting?.enabled ? 'Enabled' : 'Disabled' }}
                </UiBadge>
                <UiBadge variant="secondary">
                  {{ meta.agent_type }}
                </UiBadge>
              </div>
              <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <p class="text-xs text-muted-foreground uppercase mb-1">
                    Skill
                  </p>
                  <p class="font-mono text-xs">
                    {{ meta.skill }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground uppercase mb-1">
                    Tools
                  </p>
                  <div class="flex flex-wrap gap-1">
                    <UiTooltipProvider v-for="t in meta.tools" :key="t">
                      <UiTooltip>
                        <UiTooltipTrigger as-child>
                          <UiBadge variant="outline" class="text-[10px] cursor-help">
                            {{ t }}
                          </UiBadge>
                        </UiTooltipTrigger>
                        <UiTooltipContent side="bottom" class="max-w-xs text-xs">
                          {{ TOOL_DESCRIPTIONS[t] || t }}
                        </UiTooltipContent>
                      </UiTooltip>
                    </UiTooltipProvider>
                  </div>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground uppercase mb-1">
                    Confidence Threshold
                  </p>
                  <p class="font-medium" :class="confidenceColor(workflowSetting?.confidence_threshold ?? meta.defaultConfidence)">
                    {{ ((workflowSetting?.confidence_threshold ?? meta.defaultConfidence) * 100).toFixed(0) }}%
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground uppercase mb-1">
                    Priority
                  </p>
                  <p class="font-medium">
                    {{ workflowSetting?.priority ?? meta.defaultPriority }}/10
                  </p>
                </div>
              </div>
              <div v-if="workflowSetting?.rate_limit_hourly || workflowSetting?.rate_limit_daily" class="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span v-if="workflowSetting?.rate_limit_hourly">{{ workflowSetting.rate_limit_hourly }}/hour</span>
                <span v-if="workflowSetting?.rate_limit_daily">{{ workflowSetting.rate_limit_daily }}/day</span>
              </div>
            </div>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Stats Grid -->
      <div v-if="stats" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              Total Runs
            </UiCardTitle>
            <Activity class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">
              {{ stats.total }}
            </div>
            <p class="text-xs text-muted-foreground">
              All time
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              Success Rate
            </UiCardTitle>
            <TrendingUp class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold" :class="stats.success_rate >= 90 ? 'text-green-500' : stats.success_rate >= 70 ? 'text-yellow-500' : 'text-red-500'">
              {{ stats.success_rate.toFixed(1) }}%
            </div>
            <p class="text-xs text-muted-foreground">
              {{ stats.completed }} / {{ stats.completed + stats.failed }}
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              Avg Time
            </UiCardTitle>
            <Zap class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">
              {{ stats.avg_execution_ms }}ms
            </div>
            <p class="text-xs text-muted-foreground">
              Per run
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              Total Cost
            </UiCardTitle>
            <DollarSign class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">
              ${{ stats.total_cost_usd.toFixed(4) }}
            </div>
            <p class="text-xs text-muted-foreground">
              All time
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              Avg Cost
            </UiCardTitle>
            <DollarSign class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">
              ${{ stats.avg_cost_usd.toFixed(6) }}
            </div>
            <p class="text-xs text-muted-foreground">
              Per run
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              This Week
            </UiCardTitle>
            <Calendar class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">
              {{ stats.this_week }}
            </div>
            <p class="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Activity Chart (last 30 days) -->
      <UiCard v-if="dailyActivity.length" class="mb-6">
        <UiCardHeader>
          <UiCardTitle class="text-sm font-medium">
            Activity — Last 30 Days
          </UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="flex items-end gap-[2px] h-24">
            <div
              v-for="day in dailyActivity"
              :key="day.date"
              class="flex-1 flex flex-col justify-end gap-[1px] group relative"
            >
              <!-- Tooltip -->
              <div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 whitespace-nowrap rounded bg-popover border px-2 py-1 text-xs shadow-md">
                <p class="font-medium">
                  {{ formatShortDate(day.date) }}
                </p>
                <p class="text-green-500">
                  {{ day.completed }} ok
                </p>
                <p v-if="day.failed" class="text-red-500">
                  {{ day.failed }} fail
                </p>
              </div>
              <!-- Bars -->
              <div
                v-if="day.failed"
                class="w-full rounded-t-[1px] bg-red-500 transition-all"
                :style="{ height: `${(day.failed / chartMax) * 100}%`, minHeight: day.failed ? '2px' : '0' }"
              />
              <div
                v-if="day.completed"
                class="w-full bg-green-500 transition-all"
                :class="{ 'rounded-t-[1px]': !day.failed }"
                :style="{ height: `${(day.completed / chartMax) * 100}%`, minHeight: day.completed ? '2px' : '0' }"
              />
              <div
                v-if="day.other"
                class="w-full bg-muted transition-all"
                :style="{ height: `${(day.other / chartMax) * 100}%`, minHeight: day.other ? '2px' : '0' }"
              />
              <!-- Empty state indicator -->
              <div
                v-if="!day.completed && !day.failed && !day.other"
                class="w-full bg-muted/30 rounded-t-[1px]"
                style="height: 2px"
              />
            </div>
          </div>
          <div class="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{{ formatShortDate(dailyActivity[0]?.date || '') }}</span>
            <div class="flex gap-3">
              <span class="flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full bg-green-500" /> Completed</span>
              <span class="flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full bg-red-500" /> Failed</span>
            </div>
            <span>Today</span>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Recent Actions Table -->
      <UiCard class="mb-6">
        <UiCardHeader>
          <div class="flex items-center justify-between">
            <UiCardTitle class="text-sm font-medium">
              Recent Actions
            </UiCardTitle>
            <span class="text-xs text-muted-foreground">{{ totalCount }} total</span>
          </div>
        </UiCardHeader>
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead>When</UiTableHead>
              <UiTableHead>OEM</UiTableHead>
              <UiTableHead>Change Event</UiTableHead>
              <UiTableHead>Status</UiTableHead>
              <UiTableHead class="text-right">
                Confidence
              </UiTableHead>
              <UiTableHead class="text-right">
                Cost
              </UiTableHead>
              <UiTableHead class="text-right">
                Time
              </UiTableHead>
              <UiTableHead class="w-[60px]" />
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow v-if="recentActions.length === 0">
              <UiTableCell :colspan="8" class="text-center text-muted-foreground py-8">
                No actions yet for this workflow
              </UiTableCell>
            </UiTableRow>
            <UiTableRow
              v-for="action in recentActions"
              :key="action.id"
              class="cursor-pointer"
              @click="viewDetails(action)"
            >
              <UiTableCell class="text-sm text-muted-foreground whitespace-nowrap">
                {{ timeAgo(action.created_at) }}
              </UiTableCell>
              <UiTableCell class="font-medium text-sm uppercase">
                {{ action.oem_id }}
              </UiTableCell>
              <UiTableCell class="text-sm max-w-[250px] truncate">
                {{ action.change_events?.summary || '—' }}
              </UiTableCell>
              <UiTableCell>
                <div class="flex items-center gap-1.5">
                  <component
                    :is="statusIcon(action.status).icon"
                    class="size-3.5"
                    :class="statusIcon(action.status).class"
                  />
                  <span class="text-sm">{{ action.status.replace('_', ' ') }}</span>
                </div>
              </UiTableCell>
              <UiTableCell class="text-right">
                <span
                  v-if="action.confidence_score !== null"
                  class="text-sm font-medium"
                  :class="confidenceColor(action.confidence_score)"
                >
                  {{ (action.confidence_score * 100).toFixed(0) }}%
                </span>
                <span v-else class="text-muted-foreground">—</span>
              </UiTableCell>
              <UiTableCell class="text-right text-sm font-mono text-muted-foreground">
                <template v-if="action.cost_usd !== null">
                  ${{ action.cost_usd.toFixed(6) }}
                </template>
                <template v-else>
                  —
                </template>
              </UiTableCell>
              <UiTableCell class="text-right text-sm text-muted-foreground">
                <template v-if="action.execution_time_ms !== null">
                  {{ action.execution_time_ms }}ms
                </template>
                <template v-else>
                  —
                </template>
              </UiTableCell>
              <UiTableCell>
                <UiButton variant="ghost" size="icon-sm" title="View details" @click.stop="viewDetails(action)">
                  <Eye class="size-4" />
                </UiButton>
              </UiTableCell>
            </UiTableRow>
          </UiTableBody>
        </UiTable>
      </UiCard>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-4 mb-6">
        <UiButton variant="outline" size="sm" :disabled="!hasPrevPage" @click="prevPage">
          Previous
        </UiButton>
        <span class="text-sm text-muted-foreground">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
        <UiButton variant="outline" size="sm" :disabled="!hasNextPage" @click="nextPage">
          Next
        </UiButton>
      </div>

      <!-- Error Analysis -->
      <UiCard v-if="errorGroups.length" class="mb-6">
        <UiCardHeader>
          <UiCardTitle class="text-sm font-medium flex items-center gap-2">
            <AlertTriangle class="size-4 text-red-500" />
            Error Analysis
          </UiCardTitle>
        </UiCardHeader>
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead>Error Message</UiTableHead>
              <UiTableHead class="text-right w-[80px]">
                Count
              </UiTableHead>
              <UiTableHead class="w-[120px]">
                First Seen
              </UiTableHead>
              <UiTableHead class="w-[120px]">
                Last Seen
              </UiTableHead>
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow v-for="eg in errorGroups" :key="eg.message">
              <UiTableCell class="text-sm font-mono text-red-400 max-w-[400px] truncate">
                {{ eg.message }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm font-bold">
                {{ eg.count }}
              </UiTableCell>
              <UiTableCell class="text-xs text-muted-foreground whitespace-nowrap">
                {{ formatDate(eg.first_seen) }}
              </UiTableCell>
              <UiTableCell class="text-xs text-muted-foreground whitespace-nowrap">
                {{ formatDate(eg.last_seen) }}
              </UiTableCell>
            </UiTableRow>
          </UiTableBody>
        </UiTable>
      </UiCard>

      <!-- Configuration -->
      <UiCard v-if="workflowSetting">
        <UiCardHeader>
          <UiCardTitle class="text-sm font-medium flex items-center gap-2">
            <Settings class="size-4 text-muted-foreground" />
            Configuration
          </UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm mb-4">
            <div>
              <p class="text-xs text-muted-foreground uppercase mb-1">
                Confidence Threshold
              </p>
              <p class="font-medium" :class="confidenceColor(workflowSetting.confidence_threshold)">
                {{ (workflowSetting.confidence_threshold * 100).toFixed(0) }}%
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase mb-1">
                Hourly Limit
              </p>
              <p class="font-medium">
                {{ workflowSetting.rate_limit_hourly ?? 'None' }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase mb-1">
                Daily Limit
              </p>
              <p class="font-medium">
                {{ workflowSetting.rate_limit_daily ?? 'None' }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase mb-1">
                Priority
              </p>
              <p class="font-medium">
                {{ workflowSetting.priority }}/10
              </p>
            </div>
          </div>
          <div v-if="workflowSetting.config && Object.keys(workflowSetting.config).length">
            <p class="text-xs text-muted-foreground uppercase mb-2">
              Raw Config
            </p>
            <pre class="text-xs font-mono rounded-lg border bg-muted/50 p-3 overflow-x-auto">{{ JSON.stringify(workflowSetting.config, null, 2) }}</pre>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Infrastructure Note -->
      <UiCard>
        <UiCardContent class="pt-6">
          <div class="flex items-start gap-3">
            <div class="rounded-md bg-blue-500/10 p-2 mt-0.5">
              <Settings class="size-3.5 text-blue-500" />
            </div>
            <div class="text-xs text-muted-foreground leading-relaxed">
              <p class="font-medium text-foreground mb-1">
                How tools work
              </p>
              <p>
                Tools are <a href="https://docs.openclaw.ai/tools" target="_blank" rel="noopener" class="underline hover:text-foreground">OpenClaw capabilities</a> granted to the agent at spawn time.
                The <code class="rounded bg-muted px-1 py-0.5">browser</code> tool sends CDP commands over WebSocket to our
                Cloudflare Browser Rendering binding — agents never touch Puppeteer directly.
                Tool definitions live in <code class="rounded bg-muted px-1 py-0.5">src/workflows/router.ts</code>.
              </p>
            </div>
          </div>
        </UiCardContent>
      </UiCard>
    </template>

    <!-- Error Banner -->
    <div
      v-if="error"
      class="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
    >
      <XCircle class="size-4 shrink-0" />
      {{ error }}
    </div>

    <!-- Detail Dialog -->
    <UiDialog v-model:open="detailOpen">
      <UiDialogScrollContent class="max-w-2xl">
        <UiDialogHeader>
          <UiDialogTitle>Agent Action Details</UiDialogTitle>
          <UiDialogDescription>
            Full details for this autonomous agent execution
          </UiDialogDescription>
        </UiDialogHeader>

        <div v-if="selectedAction" class="space-y-6 py-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase mb-1">
                ID
              </p>
              <p class="text-sm font-mono">
                {{ selectedAction.id.slice(0, 8) }}...
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase mb-1">
                OEM
              </p>
              <p class="text-sm font-medium uppercase">
                {{ selectedAction.oem_id }}
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase mb-1">
                Status
              </p>
              <div class="flex items-center gap-1.5">
                <component
                  :is="statusIcon(selectedAction.status).icon"
                  class="size-3.5"
                  :class="statusIcon(selectedAction.status).class"
                />
                <span class="text-sm">{{ selectedAction.status.replace('_', ' ') }}</span>
              </div>
            </div>
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase mb-1">
                Confidence
              </p>
              <p class="text-sm" :class="selectedAction.confidence_score !== null ? confidenceColor(selectedAction.confidence_score) : 'text-muted-foreground'">
                {{ selectedAction.confidence_score !== null ? `${(selectedAction.confidence_score * 100).toFixed(1)}%` : 'N/A' }}
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase mb-1">
                Cost
              </p>
              <p class="text-sm font-mono">
                {{ selectedAction.cost_usd !== null ? `$${selectedAction.cost_usd.toFixed(6)}` : 'N/A' }}
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase mb-1">
                Duration
              </p>
              <p class="text-sm">
                {{ selectedAction.execution_time_ms !== null ? `${selectedAction.execution_time_ms}ms` : 'N/A' }}
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase mb-1">
                Created
              </p>
              <p class="text-sm text-muted-foreground">
                {{ formatDate(selectedAction.created_at) }}
              </p>
            </div>
          </div>

          <div v-if="selectedAction.change_events" class="rounded-lg border bg-muted/50 p-4">
            <p class="text-xs font-medium text-muted-foreground uppercase mb-2">
              Change Event
            </p>
            <p class="text-sm font-medium mb-2">
              {{ selectedAction.change_events.summary }}
            </p>
            <div class="flex items-center gap-2 flex-wrap">
              <UiBadge variant="secondary" class="text-xs">
                {{ selectedAction.change_events.event_type }}
              </UiBadge>
              <UiBadge
                variant="outline"
                :class="{
                  'bg-red-500/10 text-red-500 border-red-500/20': selectedAction.change_events.severity === 'critical',
                  'bg-orange-500/10 text-orange-500 border-orange-500/20': selectedAction.change_events.severity === 'high',
                  'bg-yellow-500/10 text-yellow-500 border-yellow-500/20': selectedAction.change_events.severity === 'medium',
                  'bg-muted text-muted-foreground border-border': selectedAction.change_events.severity === 'low',
                }"
                class="text-xs"
              >
                {{ selectedAction.change_events.severity }}
              </UiBadge>
              <span class="text-xs font-mono text-muted-foreground">
                {{ selectedAction.change_events.entity_type }}:{{ selectedAction.change_events.entity_id }}
              </span>
            </div>
          </div>

          <div v-if="selectedAction.reasoning">
            <p class="text-xs font-medium text-muted-foreground uppercase mb-2">
              AI Reasoning
            </p>
            <pre class="text-sm whitespace-pre-wrap rounded-lg border bg-muted/50 p-4 leading-relaxed">{{ selectedAction.reasoning }}</pre>
          </div>

          <div v-if="selectedAction.actions_taken?.length">
            <p class="text-xs font-medium text-muted-foreground uppercase mb-2">
              Actions Taken
            </p>
            <ul class="space-y-1 pl-4">
              <li v-for="(a, idx) in selectedAction.actions_taken" :key="idx" class="text-sm list-disc text-muted-foreground">
                {{ a }}
              </li>
            </ul>
          </div>

          <div v-if="selectedAction.error_message" class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p class="text-xs font-medium text-red-500 uppercase mb-2">
              Error
            </p>
            <pre class="text-sm whitespace-pre-wrap text-red-400">{{ selectedAction.error_message }}</pre>
          </div>
        </div>
      </UiDialogScrollContent>
    </UiDialog>
  </BasicPage>
</template>
