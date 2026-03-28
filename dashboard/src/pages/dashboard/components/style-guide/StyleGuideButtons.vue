<script lang="ts" setup>
import { MousePointerClick } from 'lucide-vue-next'

defineProps<{
  buttons: any
  colors: any
}>()
</script>

<template>
  <UiCard v-if="buttons" class="overflow-hidden">
    <div class="px-6 pt-6 pb-2">
      <div class="flex items-center gap-2 mb-1">
        <MousePointerClick class="size-5 text-muted-foreground" />
        <h2 class="text-2xl font-bold">Buttons</h2>
      </div>
      <p class="text-sm text-muted-foreground">All button variants with their computed styles</p>
    </div>

    <div class="px-6 pb-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
        <div
          v-for="variant in ['primary', 'secondary', 'outline', 'text']"
          :key="variant"
        >
          <template v-if="buttons[variant]">
            <div class="space-y-3">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{{ variant }}</h3>

              <!-- Rendered button -->
              <div class="flex items-center gap-4">
                <div
                  class="inline-flex items-center justify-center cursor-default select-none transition-colors"
                  :style="{
                    backgroundColor: buttons[variant].background || 'transparent',
                    color: buttons[variant].color || 'inherit',
                    border: buttons[variant].border || 'none',
                    borderRadius: buttons[variant].borderRadius || buttons[variant].radius || '6px',
                    padding: buttons[variant].padding || '10px 24px',
                    fontSize: buttons[variant].fontSize || '14px',
                    fontWeight: buttons[variant].fontWeight || '500',
                    letterSpacing: buttons[variant].letterSpacing || 'normal',
                    textTransform: buttons[variant].textTransform || 'none',
                  }"
                >
                  {{ variant === 'text' ? 'Learn More' : 'Button Label' }}
                </div>
              </div>

              <!-- Metadata -->
              <div class="text-[10px] text-muted-foreground font-mono leading-relaxed">
                <span v-if="buttons[variant].background">bg: {{ buttons[variant].background }}</span>
                <span v-if="buttons[variant].color"> &middot; color: {{ buttons[variant].color }}</span>
                <span v-if="buttons[variant].borderRadius || buttons[variant].radius"> &middot; radius: {{ buttons[variant].borderRadius || buttons[variant].radius }}</span>
                <span v-if="buttons[variant].padding"> &middot; padding: {{ buttons[variant].padding }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </UiCard>
</template>
