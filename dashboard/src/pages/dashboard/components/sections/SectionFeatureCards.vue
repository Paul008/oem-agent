<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'
import ImageOverlay from '../page-builder/ImageOverlay.vue'

const props = defineProps<{
  section: {
    type: 'feature-cards'
    title?: string
    cards: Array<{ title: string; description: string; image_url?: string }>
    columns: 2 | 3 | 4
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

// Card-level inline editing updates the cards array
function updateCardField(index: number, field: string, value: string) {
  const cards = [...props.section.cards]
  cards[index] = { ...cards[index], [field]: value }
  emit('update-text', 'cards', cards as any)
}

function makeCardEdit(index: number, field: string) {
  return useInlineEdit((v) => updateCardField(index, field, v))
}

const colClass: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}
</script>

<template>
  <div v-if="section.cards?.length" class="px-8 py-10">
    <h3
      class="text-xl font-bold mb-6 cursor-text outline-none"
      :style="{ opacity: section.title ? 1 : 0.4 }"
      @dblclick="startEditing('title', titleEdit, $event)"
      @blur="titleEdit.stopEdit()"
      @keydown="titleEdit.onKeydown"
      @paste="titleEdit.onPaste"
    >{{ section.title || 'Double-click to add section title' }}</h3>
    <div :class="['grid gap-4', colClass[section.columns] || colClass[3]]">
      <UiCard v-for="(card, i) in section.cards" :key="i" class="overflow-hidden">
        <div v-if="card.image_url" class="aspect-[16/9] bg-muted relative">
          <img
            :src="card.image_url"
            :alt="card.title"
            class="w-full h-full object-cover"
          />
          <ImageOverlay
            :current-url="card.image_url"
            :oem-id="oemId"
            :model-slug="modelSlug"
            @replace="updateCardField(i, 'image_url', $event)"
          />
        </div>
        <UiCardHeader>
          <UiCardTitle
            class="text-base cursor-text outline-none"
            @dblclick="(e: MouseEvent) => { const edit = makeCardEdit(i, 'title'); edit.startEdit(e.target as HTMLElement); emit('inline-edit', `cards[${i}].title`, card.title, e.target as HTMLElement) }"
            @blur="makeCardEdit(i, 'title').stopEdit()"
            @keydown="makeCardEdit(i, 'title').onKeydown"
            @paste="makeCardEdit(i, 'title').onPaste"
          >{{ card.title || 'Double-click to edit' }}</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none" v-html="card.description" />
        </UiCardContent>
      </UiCard>
    </div>
  </div>
</template>
