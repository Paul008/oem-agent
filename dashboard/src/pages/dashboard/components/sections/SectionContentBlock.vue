<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'
import ImageOverlay from '../page-builder/ImageOverlay.vue'

defineProps<{
  section: {
    type: 'content-block'
    title?: string
    content_html: string
    layout: 'full-width' | 'contained' | 'two-column'
    columns?: 1 | 2 | 3
    background?: string
    image_url?: string
  }
  oemId?: string
  modelSlug?: string
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()

const titleEdit = useInlineEdit((v) => emit('update-text', 'title', v))

function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement
  edit.startEdit(el)
  emit('inline-edit', field, el.textContent || '', el)
}
</script>

<template>
  <div
    class="py-10"
    :style="section.background ? { backgroundColor: section.background } : {}"
  >
    <div :class="section.layout === 'full-width' ? 'px-8' : 'px-8 max-w-5xl mx-auto'">
      <h3
        class="text-xl font-bold mb-4 cursor-text outline-none"
        :style="{ opacity: section.title ? 1 : 0.4 }"
        @dblclick="startEditing('title', titleEdit, $event)"
        @blur="titleEdit.stopEdit()"
        @keydown="titleEdit.onKeydown"
        @paste="titleEdit.onPaste"
      >{{ section.title || 'Double-click to add title' }}</h3>

      <!-- Two-column layout -->
      <div v-if="section.layout === 'two-column' && section.image_url" class="flex flex-col md:flex-row gap-8 items-center">
        <div
          class="prose prose-sm dark:prose-invert max-w-none flex-1"
          v-html="section.content_html"
        />
        <div class="relative max-w-sm w-full">
          <img :src="section.image_url" :alt="section.title || ''" class="rounded-lg w-full object-cover" />
          <ImageOverlay :current-url="section.image_url" :oem-id="oemId" :model-slug="modelSlug" @replace="emit('update-text', 'image_url', $event)" />
        </div>
      </div>

      <!-- Single/multi column layout -->
      <div v-else>
        <div
          class="prose prose-sm dark:prose-invert max-w-none"
          :style="section.columns && section.columns > 1 ? { columns: section.columns, columnGap: '2rem' } : {}"
          v-html="section.content_html"
        />
        <div v-if="section.image_url" class="relative mt-4 max-w-2xl w-full">
          <img :src="section.image_url" :alt="section.title || ''" class="rounded-lg w-full object-cover" />
          <ImageOverlay :current-url="section.image_url" :oem-id="oemId" :model-slug="modelSlug" @replace="emit('update-text', 'image_url', $event)" />
        </div>
      </div>
    </div>
  </div>
</template>
