<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'

const props = defineProps<{
  section: {
    type: 'sticky-bar'
    position: 'top' | 'bottom'
    model_name: string
    price_text?: string
    buttons: Array<{ text: string, url: string, variant: 'primary' | 'secondary' | 'ghost' }>
    show_after_scroll_px: number
    background_color?: string
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()

const nameEdit = useInlineEdit(v => emit('update-text', 'model_name', v))
const priceEdit = useInlineEdit(v => emit('update-text', 'price_text', v))

function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement
  edit.startEdit(el)
  emit('inline-edit', field, el.textContent || '', el)
}

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
      <span
        class="font-semibold text-sm truncate cursor-text outline-none"
        @dblclick="startEditing('model_name', nameEdit, $event)"
        @blur="nameEdit.stopEdit()"
        @keydown="nameEdit.onKeydown"
        @paste="nameEdit.onPaste"
      >{{ section.model_name || 'Model Name' }}</span>
      <span
        class="text-sm shrink-0 cursor-text outline-none"
        :style="{ opacity: section.price_text ? 0.8 : 0.4 }"
        @dblclick="startEditing('price_text', priceEdit, $event)"
        @blur="priceEdit.stopEdit()"
        @keydown="priceEdit.onKeydown"
        @paste="priceEdit.onPaste"
      >{{ section.price_text || 'Double-click for price' }}</span>
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
