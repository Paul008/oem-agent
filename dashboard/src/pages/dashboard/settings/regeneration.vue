<script lang="ts" setup>
import { AlertCircle, CheckCircle2, Info, Loader2, RotateCcw, Save } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { BasicPage } from '@/components/global-layout'
import { useAgents } from '@/composables/use-agents'

interface RegenerationStrategy {
  max_age_days: number
  min_age_days: number
  check_source_timestamps: boolean
  check_content_hash: boolean
  priority_threshold: 'low' | 'medium' | 'high' | 'critical'
}

const WORKFLOW_ID = 'new-model-page'

const DEFAULT_CONFIG: RegenerationStrategy = {
  max_age_days: 30,
  min_age_days: 7,
  check_source_timestamps: true,
  check_content_hash: true,
  priority_threshold: 'medium',
}

const PRESETS: Record<string, RegenerationStrategy> = {
  conservative: {
    max_age_days: 60,
    min_age_days: 14,
    check_source_timestamps: true,
    check_content_hash: false,
    priority_threshold: 'high',
  },
  balanced: {
    max_age_days: 30,
    min_age_days: 7,
    check_source_timestamps: true,
    check_content_hash: true,
    priority_threshold: 'medium',
  },
  aggressive: {
    max_age_days: 14,
    min_age_days: 3,
    check_source_timestamps: true,
    check_content_hash: true,
    priority_threshold: 'low',
  },
}

const { fetchWorkflowConfig, updateWorkflow } = useAgents()

const config = ref<RegenerationStrategy>({ ...DEFAULT_CONFIG })
const loading = ref(false)
const saving = ref(false)
const saveStatus = ref<'idle' | 'success' | 'error'>('idle')
const errorMessage = ref<string | null>(null)

const estimatedSkipRate = computed(() => {
  let rate = 0

  // Age-based skips
  if (config.value.min_age_days > 0)
    rate += 30

  // Timestamp checks reduce unnecessary regenerations
  if (config.value.check_source_timestamps)
    rate += 20

  // Content hash is most effective
  if (config.value.check_content_hash)
    rate += 30

  // Priority threshold affects sensitivity
  if (config.value.priority_threshold === 'high')
    rate += 10
  else if (config.value.priority_threshold === 'critical')
    rate += 20
  else if (config.value.priority_threshold === 'low')
    rate -= 10

  return Math.max(0, Math.min(95, rate))
})

const estimatedCostSavings = computed(() => {
  // Average page generation cost: $0.25
  // Estimated pages per month: 50
  const avgCost = 0.25
  const pagesPerMonth = 50
  const baseCost = avgCost * pagesPerMonth

  return (baseCost * estimatedSkipRate.value / 100).toFixed(2)
})

function applyPreset(presetName: string) {
  if (PRESETS[presetName]) {
    config.value = { ...PRESETS[presetName] }
  }
}

function resetToDefaults() {
  config.value = { ...DEFAULT_CONFIG }
}

async function saveConfiguration() {
  saving.value = true
  saveStatus.value = 'idle'
  errorMessage.value = null

  try {
    const success = await updateWorkflow(WORKFLOW_ID, {
      config: { regeneration_strategy: { ...config.value } },
    })

    if (!success)
      throw new Error('Failed to save configuration')

    saveStatus.value = 'success'
    setTimeout(() => { saveStatus.value = 'idle' }, 3000)
  }
  catch (err) {
    saveStatus.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : 'Failed to save configuration'
  }
  finally {
    saving.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const wfConfig = await fetchWorkflowConfig(WORKFLOW_ID)
    const saved = wfConfig.regeneration_strategy as RegenerationStrategy | undefined
    if (saved) {
      config.value = { ...DEFAULT_CONFIG, ...saved }
    }
  }
  catch (e) {
    console.error('[Regeneration] Failed to load config:', e)
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <BasicPage
    title="Regeneration Strategy"
    description="Configure smart regeneration settings for Brand Ambassador"
    sticky
  >
    <div class="max-w-4xl">
      <!-- Info Banner -->
      <UiCard class="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
        <UiCardContent class="flex items-start gap-3 pt-6">
          <Info class="size-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div class="text-sm text-blue-900 dark:text-blue-100">
            <p class="font-medium mb-1">
              Smart Regeneration Strategy
            </p>
            <p class="text-blue-800 dark:text-blue-200">
              Configure how Brand Ambassador decides when to regenerate model pages.
              Optimal settings can save 70-80% of API costs while keeping pages fresh.
            </p>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Presets -->
      <UiCard class="mb-6">
        <UiCardHeader>
          <UiCardTitle>Quick Presets</UiCardTitle>
          <UiCardDescription>Choose a preset configuration or customize below</UiCardDescription>
        </UiCardHeader>
        <UiCardContent class="flex gap-3">
          <UiButton variant="outline" size="sm" @click="applyPreset('conservative')">
            Conservative
            <span class="text-xs text-muted-foreground ml-2">Minimize costs</span>
          </UiButton>
          <UiButton variant="outline" size="sm" @click="applyPreset('balanced')">
            Balanced
            <span class="text-xs text-muted-foreground ml-2">Recommended</span>
          </UiButton>
          <UiButton variant="outline" size="sm" @click="applyPreset('aggressive')">
            Aggressive
            <span class="text-xs text-muted-foreground ml-2">Maximum freshness</span>
          </UiButton>
        </UiCardContent>
      </UiCard>

      <!-- Configuration Form -->
      <UiCard class="mb-6">
        <UiCardHeader>
          <UiCardTitle>Configuration</UiCardTitle>
        </UiCardHeader>
        <UiCardContent class="space-y-6">
          <!-- Age Thresholds -->
          <div class="grid gap-6 sm:grid-cols-2">
            <div class="space-y-2">
              <label class="text-sm font-medium">Max Age (days)</label>
              <input
                v-model.number="config.max_age_days"
                type="number"
                min="1"
                max="90"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
              <p class="text-xs text-muted-foreground">
                Force regenerate after this many days
              </p>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium">Min Age (days)</label>
              <input
                v-model.number="config.min_age_days"
                type="number"
                min="1"
                max="30"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
              <p class="text-xs text-muted-foreground">
                Skip regeneration if page is newer than this
              </p>
            </div>
          </div>

          <!-- Check Options -->
          <div class="space-y-4">
            <div class="flex items-start gap-3">
              <input
                id="check-timestamps"
                v-model="config.check_source_timestamps"
                type="checkbox"
                class="mt-1"
              >
              <div class="flex-1">
                <label for="check-timestamps" class="text-sm font-medium cursor-pointer">
                  Check Source Timestamps
                </label>
                <p class="text-xs text-muted-foreground mt-1">
                  Compare source data timestamps to detect when content was last updated (Tier 2)
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <input
                id="check-hash"
                v-model="config.check_content_hash"
                type="checkbox"
                class="mt-1"
              >
              <div class="flex-1">
                <label for="check-hash" class="text-sm font-medium cursor-pointer">
                  Check Content Hash
                </label>
                <p class="text-xs text-muted-foreground mt-1">
                  Compute and compare content hashes to detect actual changes (Tier 3, most effective)
                </p>
              </div>
            </div>
          </div>

          <!-- Priority Threshold -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Priority Threshold</label>
            <UiSelect v-model="config.priority_threshold">
              <UiSelectTrigger>
                <UiSelectValue />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="low">
                  Low - Regenerate for all changes
                </UiSelectItem>
                <UiSelectItem value="medium">
                  Medium - Balanced (recommended)
                </UiSelectItem>
                <UiSelectItem value="high">
                  High - Only major changes
                </UiSelectItem>
                <UiSelectItem value="critical">
                  Critical - Emergency only
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
            <p class="text-xs text-muted-foreground">
              Controls sensitivity to content changes
            </p>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Impact Preview -->
      <UiCard class="mb-6 border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
        <UiCardHeader>
          <UiCardTitle class="text-green-900 dark:text-green-100">
            Estimated Impact
          </UiCardTitle>
        </UiCardHeader>
        <UiCardContent class="text-green-900 dark:text-green-100">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <div class="text-3xl font-bold">
                {{ estimatedSkipRate }}%
              </div>
              <p class="text-sm text-green-800 dark:text-green-200">
                Pages skipped
              </p>
            </div>
            <div>
              <div class="text-3xl font-bold">
                ${{ estimatedCostSavings }}
              </div>
              <p class="text-sm text-green-800 dark:text-green-200">
                Estimated monthly savings
              </p>
            </div>
          </div>
          <p class="text-sm text-green-800 dark:text-green-200 mt-4">
            With these settings, approximately <strong>{{ estimatedSkipRate }}%</strong> of page
            regenerations would be skipped, saving an estimated <strong>${{ estimatedCostSavings }}/month</strong> in API costs.
          </p>
        </UiCardContent>
      </UiCard>

      <!-- Actions -->
      <div class="flex gap-3">
        <UiButton :disabled="saving" @click="saveConfiguration">
          <Loader2 v-if="saving" class="size-4 mr-2 animate-spin" />
          <Save v-else class="size-4 mr-2" />
          Save Configuration
        </UiButton>
        <UiButton variant="outline" :disabled="saving" @click="resetToDefaults">
          <RotateCcw class="size-4 mr-2" />
          Reset to Defaults
        </UiButton>
      </div>

      <!-- Save Status -->
      <div v-if="saveStatus === 'success'" class="flex items-center gap-2 mt-4 text-green-600">
        <CheckCircle2 class="size-4" />
        <span class="text-sm">Configuration saved successfully</span>
      </div>
      <div v-if="saveStatus === 'error'" class="flex items-center gap-2 mt-4 text-red-600">
        <AlertCircle class="size-4" />
        <span class="text-sm">{{ errorMessage }}</span>
      </div>

      <!-- Note -->
      <p class="text-xs text-muted-foreground mt-6">
        Changes are saved to the database and take effect on the next Brand Ambassador cron run.
        Static defaults from <code class="text-xs bg-muted px-1 py-0.5 rounded">cron-jobs.json</code>
        are used as fallback if no override is saved.
      </p>
    </div>
  </BasicPage>
</template>
