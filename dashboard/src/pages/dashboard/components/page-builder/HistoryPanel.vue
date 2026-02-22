<script lang="ts" setup>
import { computed } from 'vue'
import { Undo2, Redo2, Clock, ChevronRight } from 'lucide-vue-next'
import type { HistoryEntry } from '@/composables/use-page-builder'

const props = defineProps<{
  history: HistoryEntry[]
  historyIndex: number
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  undo: []
  redo: []
  jumpTo: [index: number]
}>()

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const reversedEntries = computed(() =>
  props.history.map((entry, i) => ({ ...entry, originalIndex: i })).reverse(),
)
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-3 border-b shrink-0">
      <Clock class="size-4 text-muted-foreground" />
      <span class="font-semibold text-sm">History</span>
      <span class="text-xs text-muted-foreground">({{ history.length }})</span>
      <div class="flex-1" />
      <UiButton
        size="sm"
        variant="outline"
        :disabled="!canUndo"
        @click="emit('undo')"
      >
        <Undo2 class="size-3.5 mr-1" />
        Undo
      </UiButton>
      <UiButton
        size="sm"
        variant="outline"
        :disabled="!canRedo"
        @click="emit('redo')"
      >
        <Redo2 class="size-3.5 mr-1" />
        Redo
      </UiButton>
    </div>

    <!-- Timeline -->
    <div class="flex-1 overflow-y-auto">
      <div class="py-2">
        <button
          v-for="entry in reversedEntries"
          :key="entry.id"
          class="flex items-center gap-2.5 w-full px-4 py-2 text-left text-sm transition-colors"
          :class="entry.originalIndex === historyIndex
            ? 'bg-primary/10 text-primary font-medium'
            : entry.originalIndex < historyIndex
              ? 'hover:bg-muted/50 text-foreground'
              : 'hover:bg-muted/50 text-muted-foreground'"
          @click="emit('jumpTo', entry.originalIndex)"
        >
          <!-- Timeline dot -->
          <div class="flex flex-col items-center shrink-0">
            <div
              class="size-2.5 rounded-full"
              :class="entry.originalIndex === historyIndex
                ? 'bg-primary'
                : entry.originalIndex < historyIndex
                  ? 'bg-muted-foreground/40'
                  : 'bg-muted-foreground/20'"
            />
          </div>

          <div class="flex-1 min-w-0">
            <p class="truncate text-sm">{{ entry.label }}</p>
            <p class="text-[10px] text-muted-foreground">{{ formatTime(entry.timestamp) }}</p>
          </div>

          <ChevronRight
            v-if="entry.originalIndex === historyIndex"
            class="size-3.5 text-primary shrink-0"
          />
        </button>
      </div>
    </div>
  </div>
</template>
