<script lang="ts" setup>
const props = defineProps<{
  section: {
    type: 'sticky-bar'
    position: 'top' | 'bottom'
    model_name: string
    price_text?: string
    buttons: Array<{ text: string; url: string; variant: 'primary' | 'secondary' | 'ghost' }>
    show_after_scroll_px: number
    background_color?: string
  }
}>()

const variantClasses: Record<string, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border',
  ghost: 'hover:bg-muted',
}
</script>

<template>
  <div
    class="px-6 py-3 flex items-center justify-between gap-4 border-y"
    :style="section.background_color ? { backgroundColor: section.background_color, color: '#fff' } : {}"
    :class="!section.background_color && 'bg-card'"
  >
    <div class="flex items-center gap-3 min-w-0">
      <span class="font-semibold text-sm truncate">{{ section.model_name || 'Model Name' }}</span>
      <span v-if="section.price_text" class="text-sm opacity-80 shrink-0">{{ section.price_text }}</span>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <a
        v-for="(btn, i) in section.buttons"
        :key="i"
        :href="btn.url || '#'"
        class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
        :class="variantClasses[btn.variant] || variantClasses.primary"
      >
        {{ btn.text }}
      </a>
    </div>
    <div class="absolute right-2 top-0">
      <span class="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-b">
        sticky-{{ section.position }} (after {{ section.show_after_scroll_px }}px scroll)
      </span>
    </div>
  </div>
</template>
