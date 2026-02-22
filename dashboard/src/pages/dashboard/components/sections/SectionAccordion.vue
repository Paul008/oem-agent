<script lang="ts" setup>
import { ref } from 'vue'

defineProps<{
  section: {
    type: 'accordion'
    title?: string
    items: Array<{ question: string; answer: string }>
    section_id?: string
  }
}>()

const expanded = ref<Set<number>>(new Set())

function toggle(index: number) {
  if (expanded.value.has(index)) {
    expanded.value.delete(index)
  } else {
    expanded.value.add(index)
  }
}
</script>

<template>
  <div :id="section.section_id || undefined" class="px-8 py-10">
    <h3 v-if="section.title" class="text-xl font-bold mb-6">{{ section.title }}</h3>
    <div class="divide-y border rounded-lg">
      <div
        v-for="(item, i) in section.items"
        :key="i"
      >
        <button
          class="flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 transition-colors"
          @click="toggle(i)"
        >
          <span>{{ item.question || 'Untitled question' }}</span>
          <span class="text-muted-foreground text-lg leading-none shrink-0 ml-4">
            {{ expanded.has(i) ? '−' : '+' }}
          </span>
        </button>
        <div
          v-if="expanded.has(i)"
          class="px-4 pb-3 text-sm text-muted-foreground"
        >
          {{ item.answer || 'No answer provided.' }}
        </div>
      </div>
    </div>
  </div>
</template>
