<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps<{
  section: {
    type: 'divider'
    style: 'line' | 'space' | 'dots'
    spacing: 'sm' | 'md' | 'lg'
  }
}>()

const spacingClass = computed(() => {
  const map: Record<string, string> = { sm: 'py-4', md: 'py-8', lg: 'py-16' }
  return map[props.section.spacing] || 'py-8'
})
</script>

<template>
  <div :class="spacingClass" class="px-8">
    <hr v-if="section.style === 'line'" class="border-t border-border">
    <div v-else-if="section.style === 'dots'" class="flex items-center justify-center gap-2">
      <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
      <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
      <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
    </div>
    <!-- style === 'space': empty spacer, just the padding -->
  </div>
</template>
