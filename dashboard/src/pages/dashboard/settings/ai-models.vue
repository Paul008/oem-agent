<script lang="ts" setup>
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Info, Loader2, RotateCcw, Save, Undo } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { BasicPage } from '@/components/global-layout'
import { fetchAiModelConfig, saveAiModelConfig } from '@/lib/worker-api'

interface AvailableModel {
  id: string
  provider: string
  model: string
  displayName: string
  costTier: 'free' | 'low' | 'medium' | 'high'
  capabilities: string[]
}

interface TaskTypeGroup {
  label: string
  taskTypes: { type: string, label: string }[]
}

interface ModelOverride {
  provider?: string
  model?: string
  fallbackProvider?: string
  fallbackModel?: string
}

// State
const loading = ref(false)
const saving = ref(false)
const saveStatus = ref<'idle' | 'success' | 'error'>('idle')
const errorMessage = ref<string | null>(null)

const defaults = ref<Record<string, ModelOverride>>({})
const overrides = ref<Record<string, ModelOverride>>({})
const availableModels = ref<AvailableModel[]>([])
const taskTypeGroups = ref<TaskTypeGroup[]>([])
const collapsedGroups = ref<Set<string>>(new Set())

// Build model options for select dropdowns
const modelOptions = computed(() =>
  availableModels.value.map(m => ({
    value: `${m.provider}::${m.model}`,
    label: m.displayName,
    costTier: m.costTier,
    capabilities: m.capabilities,
  })),
)

const overrideCount = computed(() => Object.keys(overrides.value).length)

function toggleGroup(label: string) {
  if (collapsedGroups.value.has(label)) {
    collapsedGroups.value.delete(label)
  }
  else {
    collapsedGroups.value.add(label)
  }
}

function getEffective(taskType: string): { provider: string, model: string, isOverridden: boolean } {
  const override = overrides.value[taskType]
  const def = defaults.value[taskType]
  if (override?.provider && override?.model) {
    return { provider: override.provider, model: override.model, isOverridden: true }
  }
  return { provider: def?.provider || '', model: def?.model || '', isOverridden: false }
}

function getEffectiveFallback(taskType: string): { provider: string, model: string, isOverridden: boolean } {
  const override = overrides.value[taskType]
  const def = defaults.value[taskType]
  if (override?.fallbackProvider && override?.fallbackModel) {
    return { provider: override.fallbackProvider, model: override.fallbackModel, isOverridden: true }
  }
  return { provider: def?.fallbackProvider || '', model: def?.fallbackModel || '', isOverridden: false }
}

function getSelectValue(taskType: string): string {
  const eff = getEffective(taskType)
  return eff.provider && eff.model ? `${eff.provider}::${eff.model}` : ''
}

function getFallbackSelectValue(taskType: string): string {
  const eff = getEffectiveFallback(taskType)
  return eff.provider && eff.model ? `${eff.provider}::${eff.model}` : ''
}

function setOverride(taskType: string, value: string) {
  if (!value)
    return
  const [provider, model] = value.split('::')
  const def = defaults.value[taskType]
  // If selecting back to the default, remove override for this field
  if (provider === def?.provider && model === def?.model) {
    const existing = overrides.value[taskType]
    if (existing) {
      const { provider: _p, model: _m, ...rest } = existing
      if (Object.keys(rest).length === 0) {
        delete overrides.value[taskType]
      }
      else {
        overrides.value[taskType] = rest
      }
    }
    return
  }
  overrides.value[taskType] = {
    ...overrides.value[taskType],
    provider,
    model,
  }
}

function setFallbackOverride(taskType: string, value: string) {
  if (!value)
    return
  const [provider, model] = value.split('::')
  const def = defaults.value[taskType]
  if (provider === def?.fallbackProvider && model === def?.fallbackModel) {
    const existing = overrides.value[taskType]
    if (existing) {
      const { fallbackProvider: _fp, fallbackModel: _fm, ...rest } = existing
      if (Object.keys(rest).length === 0) {
        delete overrides.value[taskType]
      }
      else {
        overrides.value[taskType] = rest
      }
    }
    return
  }
  overrides.value[taskType] = {
    ...overrides.value[taskType],
    fallbackProvider: provider,
    fallbackModel: model,
  }
}

function resetTask(taskType: string) {
  delete overrides.value[taskType]
}

function resetAll() {
  overrides.value = {}
}

function displayModel(provider: string, model: string): string {
  const found = availableModels.value.find(m => m.provider === provider && m.model === model)
  return found?.displayName || `${provider}/${model}`
}

const COST_COLORS: Record<string, string> = {
  free: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400',
  low: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400',
  medium: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',
  high: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400',
}

function costBadge(provider: string, model: string): { label: string, classes: string } {
  const found = availableModels.value.find(m => m.provider === provider && m.model === model)
  const tier = found?.costTier || 'medium'
  return { label: tier, classes: COST_COLORS[tier] || '' }
}

async function saveConfiguration() {
  saving.value = true
  saveStatus.value = 'idle'
  errorMessage.value = null

  try {
    await saveAiModelConfig(overrides.value)
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
    const config = await fetchAiModelConfig()
    defaults.value = config.defaults || {}
    overrides.value = config.overrides || {}
    availableModels.value = config.availableModels || []
    taskTypeGroups.value = config.taskTypeGroups || []
  }
  catch (e) {
    console.error('[AI Models] Failed to load config:', e)
    errorMessage.value = 'Failed to load AI model configuration'
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <BasicPage
    title="AI Model Routing"
    description="Configure which AI models handle each task type"
    sticky
  >
    <div class="max-w-5xl">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <Loader2 class="size-8 animate-spin text-muted-foreground" />
      </div>

      <template v-else>
        <!-- Info Banner -->
        <UiCard class="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <UiCardContent class="flex items-start gap-3 pt-6">
            <Info class="size-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div class="text-sm text-blue-900 dark:text-blue-100">
              <p class="font-medium mb-1">
                AI Model Routing
              </p>
              <p class="text-blue-800 dark:text-blue-200">
                Override the default model for any task type. Changes take effect immediately.
                Use the page builder model selector for per-generation A/B testing.
              </p>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Task Type Groups -->
        <div class="space-y-4">
          <UiCard v-for="group in taskTypeGroups" :key="group.label">
            <!-- Group header (collapsible) -->
            <button
              class="w-full flex items-center gap-2 px-6 py-4 text-left hover:bg-muted/30 transition-colors"
              @click="toggleGroup(group.label)"
            >
              <component
                :is="collapsedGroups.has(group.label) ? ChevronRight : ChevronDown"
                class="size-4 text-muted-foreground shrink-0"
              />
              <span class="font-semibold text-sm">{{ group.label }}</span>
              <span class="text-xs text-muted-foreground ml-2">
                {{ group.taskTypes.length }} task{{ group.taskTypes.length !== 1 ? 's' : '' }}
              </span>
              <!-- Override count badge -->
              <UiBadge
                v-if="group.taskTypes.some(t => overrides[t.type])"
                variant="secondary"
                class="text-[10px] ml-auto bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              >
                {{ group.taskTypes.filter(t => overrides[t.type]).length }} override{{ group.taskTypes.filter(t => overrides[t.type]).length !== 1 ? 's' : '' }}
              </UiBadge>
            </button>

            <!-- Task type rows -->
            <div v-show="!collapsedGroups.has(group.label)" class="border-t">
              <div
                v-for="tt in group.taskTypes"
                :key="tt.type"
                class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-6 py-3 border-b last:border-b-0"
              >
                <!-- Task label -->
                <div class="sm:w-48 shrink-0">
                  <div class="text-sm font-medium">
                    {{ tt.label }}
                  </div>
                  <div class="text-[10px] text-muted-foreground font-mono">
                    {{ tt.type }}
                  </div>
                </div>

                <!-- Primary model select -->
                <div class="flex-1 min-w-0">
                  <label class="text-[10px] text-muted-foreground uppercase tracking-wide">Primary</label>
                  <UiSelect
                    :model-value="getSelectValue(tt.type)"
                    @update:model-value="setOverride(tt.type, $event as string)"
                  >
                    <UiSelectTrigger class="h-8 text-xs">
                      <UiSelectValue>
                        <span class="flex items-center gap-1.5">
                          <span>{{ displayModel(getEffective(tt.type).provider, getEffective(tt.type).model) }}</span>
                          <span
                            v-if="!getEffective(tt.type).isOverridden"
                            class="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground"
                          >default</span>
                          <span
                            v-if="getEffective(tt.type).provider"
                            class="text-[9px] px-1 py-0.5 rounded"
                            :class="costBadge(getEffective(tt.type).provider, getEffective(tt.type).model).classes"
                          >{{ costBadge(getEffective(tt.type).provider, getEffective(tt.type).model).label }}</span>
                        </span>
                      </UiSelectValue>
                    </UiSelectTrigger>
                    <UiSelectContent>
                      <UiSelectItem
                        v-for="opt in modelOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        <span class="flex items-center gap-2">
                          <span>{{ opt.label }}</span>
                          <span class="text-[9px] px-1 py-0.5 rounded" :class="COST_COLORS[opt.costTier]">{{ opt.costTier }}</span>
                        </span>
                      </UiSelectItem>
                    </UiSelectContent>
                  </UiSelect>
                </div>

                <!-- Fallback model select -->
                <div class="flex-1 min-w-0">
                  <label class="text-[10px] text-muted-foreground uppercase tracking-wide">Fallback</label>
                  <UiSelect
                    :model-value="getFallbackSelectValue(tt.type)"
                    @update:model-value="setFallbackOverride(tt.type, $event as string)"
                  >
                    <UiSelectTrigger class="h-8 text-xs">
                      <UiSelectValue>
                        <template v-if="getEffectiveFallback(tt.type).provider">
                          <span class="flex items-center gap-1.5">
                            <span>{{ displayModel(getEffectiveFallback(tt.type).provider, getEffectiveFallback(tt.type).model) }}</span>
                            <span
                              v-if="!getEffectiveFallback(tt.type).isOverridden"
                              class="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground"
                            >default</span>
                          </span>
                        </template>
                        <template v-else>
                          <span class="text-muted-foreground">None</span>
                        </template>
                      </UiSelectValue>
                    </UiSelectTrigger>
                    <UiSelectContent>
                      <UiSelectItem
                        v-for="opt in modelOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </UiSelectItem>
                    </UiSelectContent>
                  </UiSelect>
                </div>

                <!-- Reset button -->
                <UiButton
                  v-if="overrides[tt.type]"
                  size="sm"
                  variant="ghost"
                  class="shrink-0 size-8 p-0"
                  title="Reset to default"
                  @click="resetTask(tt.type)"
                >
                  <Undo class="size-3.5 text-muted-foreground" />
                </UiButton>
                <div v-else class="shrink-0 w-8" />
              </div>
            </div>
          </UiCard>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 mt-6">
          <UiButton :disabled="saving" @click="saveConfiguration">
            <Loader2 v-if="saving" class="size-4 mr-2 animate-spin" />
            <Save v-else class="size-4 mr-2" />
            Save Configuration
          </UiButton>
          <UiButton variant="outline" :disabled="saving || overrideCount === 0" @click="resetAll">
            <RotateCcw class="size-4 mr-2" />
            Reset All to Defaults
          </UiButton>
          <span v-if="overrideCount > 0" class="text-xs text-muted-foreground self-center">
            {{ overrideCount }} override{{ overrideCount !== 1 ? 's' : '' }}
          </span>
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
          Overrides are stored in <code class="text-xs bg-muted px-1 py-0.5 rounded">workflow_settings</code>
          and take effect immediately for all subsequent AI calls.
          The hardcoded defaults in <code class="text-xs bg-muted px-1 py-0.5 rounded">router.ts</code> are used as fallback.
        </p>
      </template>
    </div>
  </BasicPage>
</template>
