<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'
import ImageOverlay from '../page-builder/ImageOverlay.vue'

const props = defineProps<{
  section: {
    type: 'intro'
    title?: string
    body_html: string
    image_url?: string
    image_position: 'left' | 'right' | 'background'
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
  <!-- Background image variant -->
  <div
    v-if="section.image_url && section.image_position === 'background'"
    class="relative bg-cover bg-center min-h-[300px] flex items-center"
    :style="{ backgroundImage: `url(${section.image_url})` }"
  >
    <div class="absolute inset-0 bg-black/50" />
    <ImageOverlay
      :current-url="section.image_url"
      :oem-id="oemId"
      :model-slug="modelSlug"
      @replace="emit('update-text', 'image_url', $event)"
    />
    <div class="relative z-10 px-8 py-10 w-full">
      <h3
        v-if="section.title || true"
        class="text-xl font-bold mb-4 text-white cursor-text outline-none"
        @dblclick="startEditing('title', titleEdit, $event)"
        @blur="titleEdit.stopEdit()"
        @keydown="titleEdit.onKeydown"
        @paste="titleEdit.onPaste"
      >{{ section.title || 'Double-click to add title' }}</h3>
      <div
        class="prose prose-sm prose-invert max-w-none"
        v-html="section.body_html"
      />
    </div>
  </div>

  <!-- Standard left/right variant -->
  <div v-else class="px-8 py-10">
    <h3
      class="text-xl font-bold mb-4 cursor-text outline-none"
      :style="{ opacity: section.title ? 1 : 0.4 }"
      @dblclick="startEditing('title', titleEdit, $event)"
      @blur="titleEdit.stopEdit()"
      @keydown="titleEdit.onKeydown"
      @paste="titleEdit.onPaste"
    >{{ section.title || 'Double-click to add title' }}</h3>
    <div
      :class="[
        'gap-8',
        section.image_url ? 'flex flex-col md:flex-row items-center' : '',
        section.image_position === 'left' ? 'md:flex-row-reverse' : '',
      ]"
    >
      <div
        class="prose prose-sm dark:prose-invert max-w-none flex-1"
        v-html="section.body_html"
      />
      <div v-if="section.image_url" class="relative max-w-sm w-full">
        <img
          :src="section.image_url"
          :alt="section.title || ''"
          class="rounded-lg w-full object-cover"
        />
        <ImageOverlay
          :current-url="section.image_url"
          :oem-id="oemId"
          :model-slug="modelSlug"
          @replace="emit('update-text', 'image_url', $event)"
        />
      </div>
    </div>
  </div>
</template>
