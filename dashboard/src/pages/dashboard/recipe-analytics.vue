<script lang="ts" setup>
import { AlertTriangle, BarChart3, Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { BasicPage } from '@/components/global-layout'
import { fetchRecipeAnalytics } from '@/lib/worker-api'

const loading = ref(true)
const error = ref<string | null>(null)
const analytics = ref<any>(null)

onMounted(async () => {
  try {
    analytics.value = await fetchRecipeAnalytics()
  }
  catch (err: any) {
    error.value = err.message || 'Failed to load analytics'
  }
  finally {
    loading.value = false
  }
})

const sortedOems = computed(() => {
  if (!analytics.value?.by_oem)
    return []
  return Object.entries(analytics.value.by_oem)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([oemId, patterns]) => ({ oemId, patterns: patterns as Record<string, number> }))
})

const maxPatternCount = computed(() => {
  if (!analytics.value?.by_pattern)
    return 1
  return Math.max(...Object.values(analytics.value.by_pattern as Record<string, number>), 1)
})

function oemLabel(id: string) {
  return id.replace('-au', '').replace(/^\w/, c => c.toUpperCase())
}
</script>

<template>
  <BasicPage title="Recipe Analytics" description="Recipe coverage, pattern distribution, and gap analysis across all OEMs.">
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="error" class="flex flex-col items-center justify-center h-64 gap-2">
      <AlertTriangle class="size-8 text-destructive" />
      <p class="text-sm text-muted-foreground">
        {{ error }}
      </p>
    </div>

    <div v-else-if="analytics" class="space-y-8">
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <UiCard class="p-4">
          <p class="text-xs text-muted-foreground">
            Brand Recipes
          </p>
          <p class="text-2xl font-bold">
            {{ analytics.total_brand }}
          </p>
        </UiCard>
        <UiCard class="p-4">
          <p class="text-xs text-muted-foreground">
            Default Recipes
          </p>
          <p class="text-2xl font-bold">
            {{ analytics.total_default }}
          </p>
        </UiCard>
        <UiCard class="p-4">
          <p class="text-xs text-muted-foreground">
            OEMs with Recipes
          </p>
          <p class="text-2xl font-bold">
            {{ Object.keys(analytics.by_oem).length }}
          </p>
        </UiCard>
        <UiCard class="p-4">
          <p class="text-xs text-muted-foreground">
            OEMs with Gaps
          </p>
          <p class="text-2xl font-bold" :class="analytics.gaps.length ? 'text-amber-600' : 'text-green-600'">
            {{ analytics.gaps.length }}
          </p>
        </UiCard>
      </div>

      <!-- Pattern Distribution -->
      <UiCard class="p-6">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 class="size-5 text-muted-foreground" />
          Pattern Distribution
        </h2>
        <div class="space-y-2">
          <div v-for="pattern in analytics.patterns" :key="pattern" class="flex items-center gap-3">
            <span class="text-xs font-mono w-24 text-right text-muted-foreground">{{ pattern }}</span>
            <div class="flex-1 h-6 bg-muted rounded-full overflow-hidden">
              <div
                class="h-full bg-primary/80 rounded-full flex items-center justify-end pr-2"
                :style="{ width: `${(analytics.by_pattern[pattern] || 0) / maxPatternCount * 100}%`, minWidth: analytics.by_pattern[pattern] ? '2rem' : '0' }"
              >
                <span v-if="analytics.by_pattern[pattern]" class="text-[10px] font-semibold text-primary-foreground">
                  {{ analytics.by_pattern[pattern] }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </UiCard>

      <!-- Coverage Matrix -->
      <UiCard class="p-6 overflow-x-auto">
        <h2 class="text-lg font-semibold mb-4">
          Coverage Matrix
        </h2>
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b">
              <th class="px-2 py-1.5 text-left font-medium">
                OEM
              </th>
              <th v-for="p in analytics.patterns" :key="p" class="px-2 py-1.5 text-center font-medium">
                {{ p.split('-').map((w: string) => w[0]?.toUpperCase()).join('') }}
              </th>
              <th class="px-2 py-1.5 text-center font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="oem in sortedOems" :key="oem.oemId">
              <td class="px-2 py-1.5 font-medium">
                {{ oemLabel(oem.oemId) }}
              </td>
              <td
                v-for="p in analytics.patterns"
                :key="p"
                class="px-2 py-1.5 text-center"
                :class="(oem.patterns[p] || 0) === 0 ? 'bg-red-50 dark:bg-red-950/30 text-red-400' : 'text-foreground'"
              >
                {{ oem.patterns[p] || 0 }}
              </td>
              <td class="px-2 py-1.5 text-center font-semibold">
                {{ Object.values(oem.patterns).reduce((a: number, b: number) => a + b, 0) }}
              </td>
            </tr>
          </tbody>
        </table>
      </UiCard>

      <!-- Gaps -->
      <UiCard v-if="analytics.gaps.length" class="p-6">
        <h2 class="text-lg font-semibold mb-4 text-amber-600">
          Coverage Gaps
        </h2>
        <div class="space-y-2">
          <div v-for="gap in analytics.gaps" :key="gap.oem_id" class="flex items-center gap-3">
            <span class="text-sm font-medium w-28">{{ oemLabel(gap.oem_id) }}</span>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="p in gap.missing_patterns"
                :key="p"
                class="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              >
                {{ p }}
              </span>
            </div>
          </div>
        </div>
      </UiCard>
    </div>
  </BasicPage>
</template>
