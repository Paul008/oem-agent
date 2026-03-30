<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'
import ImageOverlay from '../page-builder/ImageOverlay.vue'

const props = defineProps<{
  section: {
    type: 'feature-cards'
    title?: string
    cards: Array<{ title: string; description: string; image_url?: string; cta_text?: string; cta_url?: string }>
    columns: 2 | 3 | 4
    card_style?: 'default' | 'overlay'
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

const isOverlay = computed(() => props.section.card_style === 'overlay')
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
      <!-- Overlay style: image as full background with text on top -->
      <template v-if="isOverlay">
        <div
          v-for="(card, i) in section.cards"
          :key="i"
          class="relative aspect-square overflow-hidden rounded-lg group cursor-pointer"
        >
          <!-- Background image -->
          <img
            v-if="card.image_url"
            :src="card.image_url"
            :alt="card.title"
            class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div v-else class="absolute inset-0 bg-muted" />
          <ImageOverlay
            v-if="card.image_url"
            :current-url="card.image_url"
            :oem-id="oemId"
            :model-slug="modelSlug"
            @replace="updateCardField(i, 'image_url', $event)"
          />
          <!-- Gradient overlay -->
          <div class="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/40" />
          <!-- Text content -->
          <div class="relative h-full flex flex-col justify-between p-6 text-white z-10">
            <div>
              <p
                class="text-sm font-medium opacity-90 mb-1 cursor-text outline-none"
                @dblclick="(e: MouseEvent) => { const edit = makeCardEdit(i, 'description'); edit.startEdit(e.target as HTMLElement); emit('inline-edit', `cards[${i}].description`, card.description, e.target as HTMLElement) }"
              >{{ card.description }}</p>
              <h4
                class="text-xl font-semibold cursor-text outline-none"
                @dblclick="(e: MouseEvent) => { const edit = makeCardEdit(i, 'title'); edit.startEdit(e.target as HTMLElement); emit('inline-edit', `cards[${i}].title`, card.title, e.target as HTMLElement) }"
              >{{ card.title }}</h4>
            </div>
            <div v-if="card.cta_text" class="flex items-center gap-2 text-sm font-medium">
              <span>{{ card.cta_text }}</span>
              <svg class="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.6 12.5a.9.9 0 0 1 .9-.9h12.765l-4.989-4.751a.9.9 0 1 1 1.248-1.298l6.6 6.3a.9.9 0 0 1 0 1.298l-6.6 6.3a.9.9 0 1 1-1.248-1.298l4.989-4.751H4.5a.9.9 0 0 1-.9-.9Z" fill="currentColor"/></svg>
            </div>
          </div>
        </div>
      </template>

      <!-- Default style: image on top, text below -->
      <template v-else>
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
      </template>
    </div>
  </div>
</template>
