<script lang="ts" setup>
import { computed } from 'vue'

import { useInlineEdit } from '@/composables/use-inline-edit'

const props = defineProps<{
  section: {
    type: 'alert'
    title?: string
    message: string
    variant: 'info' | 'warning' | 'success' | 'destructive'
    dismissible: boolean
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()

const titleEdit = useInlineEdit(v => emit('update-text', 'title', v))
const msgEdit = useInlineEdit(v => emit('update-text', 'message', v))

function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement
  edit.startEdit(el)
  emit('inline-edit', field, el.textContent || '', el)
}

const variantStyles = computed(() => {
  const styles: Record<string, { bg: string, border: string, text: string, icon: string }> = {
    info: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-800 dark:text-blue-200', icon: 'i' },
    warning: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-800 dark:text-amber-200', icon: '!' },
    success: { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800', text: 'text-green-800 dark:text-green-200', icon: '\u2713' },
    destructive: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', text: 'text-red-800 dark:text-red-200', icon: '\u2717' },
  }
  return styles[props.section.variant] || styles.info
})
</script>

<template>
  <div class="px-8 py-4">
    <div class="border rounded-lg px-4 py-3 flex items-start gap-3" :class="[variantStyles.bg, variantStyles.border]">
      <span class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border" :class="[variantStyles.text, variantStyles.border]">
        {{ variantStyles.icon }}
      </span>
      <div class="flex-1 min-w-0" :class="variantStyles.text">
        <p
          class="font-semibold text-sm mb-0.5 cursor-text outline-none"
          :style="{ opacity: section.title ? 1 : 0.4 }"
          @dblclick="startEditing('title', titleEdit, $event)"
          @blur="titleEdit.stopEdit()"
          @keydown="titleEdit.onKeydown"
          @paste="titleEdit.onPaste"
        >
          {{ section.title || 'Double-click to add title' }}
        </p>
        <p
          class="text-sm cursor-text outline-none"
          @dblclick="startEditing('message', msgEdit, $event)"
          @blur="msgEdit.stopEdit()"
          @keydown="msgEdit.onKeydown"
          @paste="msgEdit.onPaste"
        >
          {{ section.message || 'Double-click to add message' }}
        </p>
      </div>
      <span v-if="section.dismissible" class="shrink-0 text-sm opacity-50 cursor-pointer" :class="variantStyles.text">&times;</span>
    </div>
  </div>
</template>
