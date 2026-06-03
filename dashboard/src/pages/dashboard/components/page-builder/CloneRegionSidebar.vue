<script lang="ts" setup>
import { computed } from 'vue'

import type { CloneRegion } from '../../page-builder/page-modes'

const props = withDefaults(defineProps<{
  regions: CloneRegion[]
  structuredSections?: any[]
  selectedRegionId: string | null
}>(), {
  structuredSections: () => [],
})

const emit = defineEmits<{
  selectRegion: [region: CloneRegion]
  editRegion: [region: CloneRegion]
}>()

const sortedRegions = computed(() => [...props.regions].sort((a, b) => a.top - b.top))

function formatHeight(height: number): string {
  if (!Number.isFinite(height) || height <= 0)
    return '-'

  return `${Math.round(height)}px`
}

function fieldCount(region: CloneRegion): number {
  return Array.isArray(region.editable_fields) ? region.editable_fields.length : 0
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="shrink-0 border-b px-4 py-3">
      <h3 class="text-sm font-semibold">
        Clone Regions ({{ regions.length }})
      </h3>
      <p class="mt-1 text-xs text-muted-foreground">
        Structured sections: {{ structuredSections.length }}
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div v-if="sortedRegions.length" class="space-y-2">
        <button
          v-for="region in sortedRegions"
          :key="region.id"
          type="button"
          class="w-full rounded-md border p-3 text-left transition hover:bg-muted/60"
          :class="selectedRegionId === region.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-background'"
          :aria-pressed="selectedRegionId === region.id"
          @click="emit('selectRegion', region)"
        >
          <span class="flex items-start justify-between gap-3">
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{{ region.label || region.id }}</span>
              <span class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span class="rounded bg-muted px-1.5 py-0.5 uppercase">{{ region.tag }}</span>
                <span v-if="region.type_hint">{{ region.type_hint }}</span>
                <span>{{ formatHeight(region.height) }}</span>
                <span>{{ fieldCount(region) }} fields</span>
              </span>
            </span>
            <button
              type="button"
              class="shrink-0 rounded border px-2 py-1 text-xs font-medium hover:bg-background"
              title="Edit clone region"
              aria-label="Edit clone region"
              @click.stop="emit('editRegion', region)"
            >
              Edit
            </button>
          </span>
        </button>
      </div>

      <div v-else class="py-8 text-center">
        <p class="text-sm text-muted-foreground">
          No clone regions indexed
        </p>
      </div>
    </div>
  </div>
</template>
