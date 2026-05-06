<script lang="ts" setup>
import { Star } from 'lucide-vue-next'

defineProps<{
  section: {
    type: 'card-grid'
    title?: string
    columns?: 2 | 3 | 4
    cards: Array<{
      image_url?: string
      icon_url?: string
      title?: string
      subtitle?: string
      body?: string
      badge?: string
      stat?: string
      rating?: number
      cta_text?: string
      cta_url?: string
      logo_url?: string
    }>
    card_composition?: string[]
    card_style?: {
      background?: string
      border?: string
      border_radius?: number
      shadow?: boolean
      text_align?: string
      gap?: string
      padding?: string
    }
    section_style?: {
      background?: string
      padding?: string
    }
  }
}>()

const colClass: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}
</script>

<template>
  <div
    v-if="section.cards?.length"
    class="px-8 py-10"
    :style="{
      backgroundColor: section.section_style?.background || undefined,
      padding: section.section_style?.padding || undefined,
    }"
  >
    <h3 v-if="section.title" class="text-xl font-bold mb-6">
      {{ section.title }}
    </h3>

    <div class="grid" :class="[colClass[section.columns || 3] || colClass[3]]" :style="{ gap: section.card_style?.gap || '1rem' }">
      <div
        v-for="(card, idx) in section.cards"
        :key="idx"
        class="overflow-hidden flex flex-col"
        :style="{
          backgroundColor: section.card_style?.background || '#ffffff',
          border: section.card_style?.border || '1px solid #e5e7eb',
          borderRadius: `${section.card_style?.border_radius ?? 8}px`,
          boxShadow: section.card_style?.shadow ? '0 1px 3px 0 rgb(0 0 0 / 0.1)' : 'none',
          textAlign: (section.card_style?.text_align as any) || 'left',
          padding: section.card_style?.padding || '0',
        }"
      >
        <!-- Render slots in composition order -->
        <template v-for="slot in (section.card_composition || ['image', 'title', 'body'])" :key="slot">
          <!-- Image -->
          <div v-if="slot === 'image'" class="aspect-[16/9] bg-muted">
            <img
              v-if="card.image_url"
              :src="card.image_url"
              :alt="card.title || ''"
              class="w-full h-full object-cover"
            >
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30 text-xs">
              No image
            </div>
          </div>

          <!-- Icon -->
          <div v-else-if="slot === 'icon'" class="px-4 pt-4">
            <img
              v-if="card.icon_url"
              :src="card.icon_url"
              :alt="card.title || ''"
              class="w-10 h-10 object-contain"
            >
            <div v-else class="w-10 h-10 rounded-lg bg-muted" />
          </div>

          <!-- Logo -->
          <div v-else-if="slot === 'logo'" class="p-4 flex items-center justify-center">
            <img
              v-if="card.logo_url || card.image_url"
              :src="card.logo_url || card.image_url"
              :alt="card.title || ''"
              class="max-h-12 max-w-full object-contain"
            >
            <div v-else class="h-12 w-24 rounded bg-muted" />
          </div>

          <!-- Stat (large value) -->
          <div v-else-if="slot === 'stat'" class="px-4 pt-4">
            <p class="text-3xl font-bold tracking-tight">
              {{ card.stat || '—' }}
            </p>
          </div>

          <!-- Title -->
          <div v-else-if="slot === 'title'" class="px-4 pt-3">
            <h4 class="text-sm font-semibold leading-tight">
              {{ card.title || 'Untitled' }}
            </h4>
          </div>

          <!-- Subtitle -->
          <div v-else-if="slot === 'subtitle'" class="px-4 pt-1">
            <p class="text-xs text-muted-foreground">
              {{ card.subtitle }}
            </p>
          </div>

          <!-- Body -->
          <div v-else-if="slot === 'body'" class="px-4 pt-2 pb-4 flex-1">
            <div
              v-if="card.body"
              class="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none"
              v-html="card.body"
            />
          </div>

          <!-- Badge -->
          <div v-else-if="slot === 'badge' && card.badge" class="px-4 pt-2">
            <span class="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {{ card.badge }}
            </span>
          </div>

          <!-- Rating -->
          <div v-else-if="slot === 'rating'" class="px-4 pt-2 flex gap-0.5">
            <Star
              v-for="s in 5"
              :key="s"
              class="size-3.5"
              :class="s <= (card.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'"
            />
          </div>

          <!-- CTA -->
          <div v-else-if="slot === 'cta' && card.cta_text" class="px-4 pb-4 mt-auto">
            <a
              :href="card.cta_url || '#'"
              class="inline-block text-sm font-medium text-primary hover:underline"
            >
              {{ card.cta_text }}
            </a>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
