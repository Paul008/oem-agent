<script lang="ts" setup>
import { Check, Copy, Ruler } from 'lucide-vue-next'

import { useClipboard } from '@/composables/use-clipboard'

defineProps<{
  spacing: any
  colors: any
}>()

const { copy, isCopied } = useClipboard()

function formatSpacingValue(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text)
    return ''
  return /[a-z%]$/i.test(text) ? text : `${text}px`
}

function spacingBarWidth(value: unknown): string {
  return `${Math.min(Number.parseFloat(String(value)) || 0, 400)}px`
}

async function copySpacingMetric(key: string, value: unknown): Promise<void> {
  await copy(formatSpacingValue(value), `spacing-${key}`)
}

async function copySpacingScale(name: string, value: unknown): Promise<void> {
  await copy(formatSpacingValue(value), `spacing-scale-${name}`)
}
</script>

<template>
  <UiCard v-if="spacing" class="overflow-hidden">
    <div class="px-6 pt-6 pb-2">
      <div class="flex items-center gap-2 mb-1">
        <Ruler class="size-5 text-muted-foreground" />
        <h2 class="text-2xl font-bold">
          Spacing
        </h2>
      </div>
      <p class="text-sm text-muted-foreground">
        Layout spacing scale and container dimensions
      </p>
    </div>

    <div class="px-6 pb-6">
      <!-- Key metrics -->
      <div class="grid grid-cols-3 gap-4 mt-4 mb-6">
        <button
          v-if="spacing.container_max_width"
          type="button"
          class="group rounded-lg border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :title="`Copy ${formatSpacingValue(spacing.container_max_width)}`"
          @click="copySpacingMetric('container-max-width', spacing.container_max_width)"
        >
          <p class="text-xs text-muted-foreground mb-1">
            Container Max Width
          </p>
          <p class="flex items-center justify-between gap-2 text-lg font-semibold font-mono">
            <span>{{ formatSpacingValue(spacing.container_max_width) }}</span>
            <span
              class="inline-flex shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
              :class="{ '!opacity-100': isCopied('spacing-container-max-width') }"
              data-export-ignore
            >
              <Check v-if="isCopied('spacing-container-max-width')" class="size-3.5" />
              <Copy v-else class="size-3.5" />
            </span>
          </p>
        </button>
        <button
          v-if="spacing.section_gap"
          type="button"
          class="group rounded-lg border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :title="`Copy ${formatSpacingValue(spacing.section_gap)}`"
          @click="copySpacingMetric('section-gap', spacing.section_gap)"
        >
          <p class="text-xs text-muted-foreground mb-1">
            Section Gap
          </p>
          <p class="flex items-center justify-between gap-2 text-lg font-semibold font-mono">
            <span>{{ formatSpacingValue(spacing.section_gap) }}</span>
            <span
              class="inline-flex shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
              :class="{ '!opacity-100': isCopied('spacing-section-gap') }"
              data-export-ignore
            >
              <Check v-if="isCopied('spacing-section-gap')" class="size-3.5" />
              <Copy v-else class="size-3.5" />
            </span>
          </p>
        </button>
        <button
          v-if="spacing.container_padding"
          type="button"
          class="group rounded-lg border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :title="`Copy ${formatSpacingValue(spacing.container_padding)}`"
          @click="copySpacingMetric('container-padding', spacing.container_padding)"
        >
          <p class="text-xs text-muted-foreground mb-1">
            Container Padding
          </p>
          <p class="flex items-center justify-between gap-2 text-lg font-semibold font-mono">
            <span>{{ formatSpacingValue(spacing.container_padding) }}</span>
            <span
              class="inline-flex shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
              :class="{ '!opacity-100': isCopied('spacing-container-padding') }"
              data-export-ignore
            >
              <Check v-if="isCopied('spacing-container-padding')" class="size-3.5" />
              <Copy v-else class="size-3.5" />
            </span>
          </p>
        </button>
      </div>

      <!-- Scale bars -->
      <template v-if="spacing.scale && Object.keys(spacing.scale).length">
        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Spacing Scale
        </h3>
        <div class="space-y-2">
          <div
            v-for="(value, name) in spacing.scale"
            :key="String(name)"
            class="flex items-center gap-3"
          >
            <span class="w-16 text-xs text-muted-foreground font-mono text-right shrink-0">{{ name }}</span>
            <div
              class="h-5 rounded"
              :style="{
                width: spacingBarWidth(value),
                backgroundColor: colors?.primary || 'hsl(var(--primary))',
                opacity: 0.6,
              }"
            />
            <button
              type="button"
              class="group inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground font-mono transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :title="`Copy ${formatSpacingValue(value)}`"
              @click="copySpacingScale(String(name), value)"
            >
              <span>{{ formatSpacingValue(value) }}</span>
              <span
                class="inline-flex shrink-0 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
                :class="{ '!opacity-100': isCopied(`spacing-scale-${String(name)}`) }"
                data-export-ignore
              >
                <Check v-if="isCopied(`spacing-scale-${String(name)}`)" class="size-3" />
                <Copy v-else class="size-3" />
              </span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </UiCard>
</template>
