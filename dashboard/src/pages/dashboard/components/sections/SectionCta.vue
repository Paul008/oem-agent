<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'

defineProps<{
  section: {
    type: 'cta-banner'
    heading: string
    body?: string
    cta_text: string
    cta_url: string
    background_color?: string
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()

const headingEdit = useInlineEdit((v) => emit('update-text', 'heading', v))
const bodyEdit = useInlineEdit((v) => emit('update-text', 'body', v))
const ctaEdit = useInlineEdit((v) => emit('update-text', 'cta_text', v))

function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement
  edit.startEdit(el)
  emit('inline-edit', field, el.textContent || '', el)
}
</script>

<template>
  <div
    class="px-8 py-12 text-center"
    :style="section.background_color ? { backgroundColor: section.background_color } : {}"
    :class="section.background_color ? 'text-white' : 'bg-primary text-primary-foreground'"
  >
    <h3
      class="text-2xl font-bold mb-2 cursor-text outline-none"
      @dblclick="startEditing('heading', headingEdit, $event)"
      @blur="headingEdit.stopEdit()"
      @keydown="headingEdit.onKeydown"
      @paste="headingEdit.onPaste"
    >{{ section.heading || 'Double-click to edit' }}</h3>
    <p
      class="mb-4 cursor-text outline-none"
      :style="{ opacity: section.body ? 0.9 : 0.4 }"
      @dblclick="startEditing('body', bodyEdit, $event)"
      @blur="bodyEdit.stopEdit()"
      @keydown="bodyEdit.onKeydown"
      @paste="bodyEdit.onPaste"
    >{{ section.body || 'Double-click to add body text' }}</p>
    <a
      v-if="section.cta_text"
      class="inline-block bg-white text-black text-sm font-semibold px-6 py-2.5 rounded hover:bg-white/90 transition-colors cursor-text outline-none"
      @dblclick.prevent="startEditing('cta_text', ctaEdit, $event)"
      @blur="ctaEdit.stopEdit()"
      @keydown="ctaEdit.onKeydown"
      @paste="ctaEdit.onPaste"
    >{{ section.cta_text }}</a>
  </div>
</template>
