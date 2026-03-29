<script lang="ts" setup>
import { computed } from 'vue'
import { useInlineEdit } from '@/composables/use-inline-edit'

const props = defineProps<{
  section: {
    type: 'embed'
    title?: string
    embed_url: string
    embed_type: 'iframe' | 'script'
    aspect_ratio: '16:9' | '4:3' | '1:1' | 'auto'
    max_width?: string
  }
}>()

const paddingTop = computed(() => {
  const ratios: Record<string, string> = {
    '16:9': '56.25%',
    '4:3': '75%',
    '1:1': '100%',
    'auto': '56.25%',
  }
  return ratios[props.section.aspect_ratio] || '56.25%'
})
const emit = defineEmits<{ 'inline-edit': [field: string, value: string, el: HTMLElement]; 'update-text': [field: string, value: string] }>()
const titleEdit = useInlineEdit((v) => emit('update-text', 'title', v))
function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) { const el = e.target as HTMLElement; edit.startEdit(el); emit('inline-edit', field, el.textContent || '', el) }
</script>

<template>
  <div class="px-8 py-8">
    <h2 class="text-lg font-bold text-center mb-4 cursor-text outline-none" :style="{ opacity: section.title ? 1 : 0.4 }" @dblclick="startEditing('title', titleEdit, $event)" @blur="titleEdit.stopEdit()" @keydown="titleEdit.onKeydown" @paste="titleEdit.onPaste">{{ section.title || 'Double-click to add title' }}</h2>
    <div
      class="mx-auto"
      :style="section.max_width ? { maxWidth: section.max_width } : {}"
    >
      <div
        v-if="section.embed_url"
        class="relative w-full overflow-hidden rounded-lg bg-muted"
        :style="{ paddingTop }"
      >
        <iframe
          v-if="section.embed_type === 'iframe'"
          :src="section.embed_url"
          class="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        />
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
        >
          Script embed — preview not available in editor
        </div>
      </div>
      <div
        v-else
        class="flex items-center justify-center h-40 rounded-lg border-2 border-dashed border-muted-foreground/20 text-sm text-muted-foreground"
      >
        No embed URL configured
      </div>
    </div>
  </div>
</template>
