<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'

defineProps<{
  section: {
    type: 'map'
    title?: string
    sub_heading?: string
    embed_url: string
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()
const titleEdit = useInlineEdit((v) => emit('update-text', 'title', v))
const subEdit = useInlineEdit((v) => emit('update-text', 'sub_heading', v))
function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement; edit.startEdit(el); emit('inline-edit', field, el.textContent || '', el)
}
</script>

<template>
  <div class="px-8 py-10">
    <h3 class="text-xl font-bold mb-2 cursor-text outline-none" :style="{ opacity: section.title ? 1 : 0.4 }" @dblclick="startEditing('title', titleEdit, $event)" @blur="titleEdit.stopEdit()" @keydown="titleEdit.onKeydown" @paste="titleEdit.onPaste">{{ section.title || 'Double-click to add title' }}</h3>
    <p class="text-sm text-muted-foreground mb-6 cursor-text outline-none" :style="{ opacity: section.sub_heading ? 1 : 0.4 }" @dblclick="startEditing('sub_heading', subEdit, $event)" @blur="subEdit.stopEdit()" @keydown="subEdit.onKeydown" @paste="subEdit.onPaste">{{ section.sub_heading || 'Double-click to add subtitle' }}</p>
    <div v-if="section.embed_url" class="rounded-lg overflow-hidden border">
      <iframe :src="section.embed_url" width="100%" height="400" style="border: 0" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade" />
    </div>
    <div v-else class="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center bg-muted/20 h-[400px] flex items-center justify-center">
      <p class="text-sm text-muted-foreground">Paste a Google Maps embed URL to display the map</p>
    </div>
  </div>
</template>
