<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'

const props = defineProps<{
  section: {
    type: 'testimonial'
    title?: string
    testimonials: Array<{ quote: string, author: string, role?: string, avatar_url?: string, rating?: number }>
    layout: 'carousel' | 'grid' | 'stacked'
    style?: 'default' | 'dark' | 'minimal'
    cta_text?: string
    cta_url?: string
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()

const titleEdit = useInlineEdit(v => emit('update-text', 'title', v))

function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement
  edit.startEdit(el)
  emit('inline-edit', field, el.textContent || '', el)
}

function stars(rating: number | undefined) {
  const r = Math.min(5, Math.max(0, rating ?? 5))
  return '\u2605'.repeat(r) + '\u2606'.repeat(5 - r)
}

const isDark = computed(() => props.section.style === 'dark')
</script>

<template>
  <div :class="isDark ? 'px-8 py-12 bg-gray-950 text-white' : 'px-8 py-8 bg-slate-50 dark:bg-slate-900/30'">
    <!-- Title -->
    <h2
      v-if="section.title || !isDark"
      class="text-lg font-bold mb-6 cursor-text outline-none"
      :class="isDark ? 'text-sm text-gray-400 uppercase tracking-wider' : 'text-center'"
      :style="{ opacity: section.title ? 1 : 0.4 }"
      @dblclick="startEditing('title', titleEdit, $event)"
      @blur="titleEdit.stopEdit()"
      @keydown="titleEdit.onKeydown"
      @paste="titleEdit.onPaste"
    >
      {{ section.title || 'Double-click to add title' }}
    </h2>

    <!-- Dark style: large quote, single testimonial -->
    <template v-if="isDark">
      <div class="max-w-4xl">
        <blockquote
          v-if="section.testimonials?.[0]"
          class="text-2xl md:text-4xl font-bold leading-tight mb-8"
        >
          "{{ section.testimonials[0].quote }}"
        </blockquote>
        <div v-if="section.testimonials?.[0]?.author" class="text-sm text-gray-400">
          — {{ section.testimonials[0].author }}
          <span v-if="section.testimonials[0].role" class="ml-1">· {{ section.testimonials[0].role }}</span>
        </div>
        <a
          v-if="section.cta_text"
          :href="section.cta_url || '#'"
          class="inline-flex items-center gap-2 mt-6 text-sm font-medium text-white hover:opacity-80"
          @click.prevent
        >
          {{ section.cta_text }}
          <svg class="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.6 12.5a.9.9 0 0 1 .9-.9h12.765l-4.989-4.751a.9.9 0 1 1 1.248-1.298l6.6 6.3a.9.9 0 0 1 0 1.298l-6.6 6.3a.9.9 0 1 1-1.248-1.298l4.989-4.751H4.5a.9.9 0 0 1-.9-.9Z" fill="currentColor" /></svg>
        </a>
      </div>
    </template>

    <!-- Default/minimal style: card grid -->
    <template v-else>
      <div
        class="gap-4"
        :class="section.layout === 'grid' ? 'grid grid-cols-2' : 'flex flex-col max-w-xl mx-auto'"
      >
        <div
          v-for="(t, i) in section.testimonials"
          :key="i"
          class="bg-white dark:bg-slate-800 rounded-lg p-5 shadow-sm border"
        >
          <p v-if="section.style !== 'minimal'" class="text-amber-400 text-sm mb-2">
            {{ stars(t.rating) }}
          </p>
          <p class="text-sm italic text-muted-foreground mb-3">
            "{{ t.quote || 'Customer quote...' }}"
          </p>
          <div class="flex items-center gap-2">
            <div
              v-if="t.avatar_url"
              class="size-8 rounded-full bg-muted overflow-hidden shrink-0"
            >
              <img :src="t.avatar_url" :alt="t.author" class="size-full object-cover">
            </div>
            <div
              v-else
              class="size-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0"
            >
              {{ (t.author || '?')[0].toUpperCase() }}
            </div>
            <div>
              <p class="text-sm font-medium">
                {{ t.author || 'Customer' }}
              </p>
              <p v-if="t.role" class="text-[10px] text-muted-foreground">
                {{ t.role }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
