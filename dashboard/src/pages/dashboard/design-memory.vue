<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Loader2, Brain, Activity, AlertTriangle, TrendingUp } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { fetchDesignMemory, fetchExtractionRuns } from '@/lib/worker-api'

const { fetchOems } = useOemData()

const oems = ref<{ id: string; name: string }[]>([])
const selectedOem = ref('kia-au')
const loading = ref(true)
const profile = ref<any>(null)
const runs = ref<any[]>([])
const runsLoading = ref(false)

onMounted(async () => {
  oems.value = await fetchOems()
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    const [memoryRes, runsRes] = await Promise.all([
      fetchDesignMemory(selectedOem.value),
      fetchExtractionRuns(selectedOem.value, 20),
    ])
    profile.value = memoryRes.profile
    runs.value = runsRes.runs || []
  } catch (e: any) {
    console.error('Failed to load design memory:', e)
  } finally {
    loading.value = false
  }
}

async function onOemChange() {
  await loadData()
}

const hasProfile = computed(() => {
  if (!profile.value) return false
  return profile.value.quality_history?.total_runs > 0
    || profile.value.brand_tokens?.primary_color
    || profile.value.extraction_hints?.hero_selectors?.length > 0
})

const avgScore = computed(() => {
  return profile.value?.quality_history?.avg_quality_score ?? 0
})

const totalRuns = computed(() => {
  return profile.value?.quality_history?.total_runs ?? 0
})

function formatDate(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function scoreColor(score: number | null) {
  if (score === null || score === undefined) return 'text-muted-foreground'
  if (score >= 0.8) return 'text-green-500'
  if (score >= 0.5) return 'text-yellow-500'
  return 'text-red-500'
}
</script>

<template>
  <BasicPage title="Design Memory" subtitle="Per-OEM accumulated design knowledge from extraction runs">
    <!-- OEM Selector -->
    <div class="flex items-center gap-4 mb-6">
      <select
        v-model="selectedOem"
        class="px-3 py-2 border rounded-md bg-background text-sm"
        @change="onOemChange"
      >
        <option v-for="oem in oems" :key="oem.id" :value="oem.id">{{ oem.name }}</option>
      </select>
      <Loader2 v-if="loading" class="w-4 h-4 animate-spin text-muted-foreground" />
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="border rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Activity class="w-4 h-4" /> Total Runs
        </div>
        <div class="text-2xl font-bold">{{ totalRuns }}</div>
      </div>
      <div class="border rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <TrendingUp class="w-4 h-4" /> Avg Quality
        </div>
        <div class="text-2xl font-bold" :class="scoreColor(avgScore)">
          {{ avgScore > 0 ? avgScore.toFixed(2) : '-' }}
        </div>
      </div>
      <div class="border rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Brain class="w-4 h-4" /> Known Selectors
        </div>
        <div class="text-2xl font-bold">
          {{ (profile?.extraction_hints?.hero_selectors?.length ?? 0) + (profile?.extraction_hints?.gallery_selectors?.length ?? 0) + (profile?.extraction_hints?.tab_selectors?.length ?? 0) }}
        </div>
      </div>
      <div class="border rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <AlertTriangle class="w-4 h-4" /> Known Failures
        </div>
        <div class="text-2xl font-bold text-orange-500">
          {{ profile?.extraction_hints?.known_failures?.length ?? 0 }}
        </div>
      </div>
    </div>

    <!-- Design Profile -->
    <div v-if="!loading" class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <!-- Brand Tokens -->
      <div class="border rounded-lg p-5">
        <h3 class="font-semibold mb-3">Brand Tokens</h3>
        <div v-if="profile?.brand_tokens?.primary_color" class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <div class="w-5 h-5 rounded border" :style="{ backgroundColor: profile.brand_tokens.primary_color }" />
            <span class="text-muted-foreground">Primary:</span>
            <code>{{ profile.brand_tokens.primary_color }}</code>
          </div>
          <div v-if="profile.brand_tokens.font_family">
            <span class="text-muted-foreground">Font:</span> {{ profile.brand_tokens.font_family }}
          </div>
          <div v-if="profile.brand_tokens.border_radius">
            <span class="text-muted-foreground">Border radius:</span> {{ profile.brand_tokens.border_radius }}
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground">No brand tokens recorded yet. Run an extraction to populate.</p>
      </div>

      <!-- Extraction Hints -->
      <div class="border rounded-lg p-5">
        <h3 class="font-semibold mb-3">Extraction Hints</h3>
        <div class="space-y-2 text-sm">
          <div v-if="profile?.extraction_hints?.hero_selectors?.length">
            <span class="text-muted-foreground">Hero:</span>
            <code v-for="s in profile.extraction_hints.hero_selectors" :key="s" class="ml-1 px-1 py-0.5 bg-muted rounded text-xs">{{ s }}</code>
          </div>
          <div v-if="profile?.extraction_hints?.gallery_selectors?.length">
            <span class="text-muted-foreground">Gallery:</span>
            <code v-for="s in profile.extraction_hints.gallery_selectors" :key="s" class="ml-1 px-1 py-0.5 bg-muted rounded text-xs">{{ s }}</code>
          </div>
          <div v-if="profile?.extraction_hints?.tab_selectors?.length">
            <span class="text-muted-foreground">Tabs:</span>
            <code v-for="s in profile.extraction_hints.tab_selectors" :key="s" class="ml-1 px-1 py-0.5 bg-muted rounded text-xs">{{ s }}</code>
          </div>
          <div v-if="profile?.extraction_hints?.known_failures?.length">
            <span class="text-muted-foreground">Failures:</span>
            <code v-for="s in profile.extraction_hints.known_failures.slice(0, 5)" :key="s" class="ml-1 px-1 py-0.5 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-700 dark:text-red-400">{{ s }}</code>
          </div>
          <p v-if="!hasProfile" class="text-muted-foreground">No extraction hints yet.</p>
        </div>
      </div>

      <!-- Common Errors -->
      <div class="border rounded-lg p-5 lg:col-span-2">
        <h3 class="font-semibold mb-3">Common Errors</h3>
        <div v-if="profile?.quality_history?.common_errors?.length" class="space-y-1">
          <div
            v-for="err in profile.quality_history.common_errors.slice(0, 10)"
            :key="err.message"
            class="flex items-center justify-between text-sm py-1 border-b last:border-0"
          >
            <span class="text-muted-foreground truncate max-w-[80%]">{{ err.message }}</span>
            <span class="px-2 py-0.5 bg-muted rounded text-xs font-mono">{{ err.count }}x</span>
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground">No errors recorded.</p>
      </div>
    </div>

    <!-- Extraction Run History -->
    <div class="border rounded-lg">
      <div class="p-5 border-b">
        <h3 class="font-semibold">Extraction Run History</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b bg-muted/50">
              <th class="px-4 py-2 text-left font-medium">Started</th>
              <th class="px-4 py-2 text-left font-medium">Model</th>
              <th class="px-4 py-2 text-left font-medium">Pipeline</th>
              <th class="px-4 py-2 text-left font-medium">Status</th>
              <th class="px-4 py-2 text-right font-medium">Sections</th>
              <th class="px-4 py-2 text-right font-medium">Quality</th>
              <th class="px-4 py-2 text-right font-medium">Tokens</th>
              <th class="px-4 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="runs.length === 0">
              <td colspan="8" class="px-4 py-8 text-center text-muted-foreground">
                No extraction runs yet for this OEM.
              </td>
            </tr>
            <tr v-for="run in runs" :key="run.id" class="border-b last:border-0 hover:bg-muted/30">
              <td class="px-4 py-2">{{ formatDate(run.started_at) }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ run.model_slug }}</td>
              <td class="px-4 py-2">
                <span class="px-2 py-0.5 rounded text-xs" :class="{
                  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400': run.pipeline === 'structurer',
                  'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400': run.pipeline === 'generator',
                  'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400': run.pipeline === 'cloner',
                  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400': run.pipeline === 'capturer',
                }">{{ run.pipeline }}</span>
              </td>
              <td class="px-4 py-2">
                <span class="px-2 py-0.5 rounded text-xs" :class="{
                  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400': run.status === 'completed',
                  'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400': run.status === 'running',
                  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400': run.status === 'failed',
                }">{{ run.status }}</span>
              </td>
              <td class="px-4 py-2 text-right font-mono">{{ run.sections_extracted ?? '-' }}</td>
              <td class="px-4 py-2 text-right font-mono" :class="scoreColor(run.quality_score)">
                {{ run.quality_score != null ? Number(run.quality_score).toFixed(2) : '-' }}
              </td>
              <td class="px-4 py-2 text-right font-mono">{{ run.total_tokens?.toLocaleString() ?? '-' }}</td>
              <td class="px-4 py-2 text-right font-mono">${{ run.total_cost_usd != null ? Number(run.total_cost_usd).toFixed(4) : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </BasicPage>
</template>
