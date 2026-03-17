<script lang="ts" setup>
const props = defineProps<{
  section: {
    type: 'testimonial'
    title?: string
    testimonials: Array<{ quote: string; author: string; role?: string; avatar_url?: string; rating?: number }>
    layout: 'carousel' | 'grid' | 'stacked'
  }
}>()

function stars(rating: number | undefined) {
  const r = Math.min(5, Math.max(0, rating ?? 5))
  return '\u2605'.repeat(r) + '\u2606'.repeat(5 - r)
}
</script>

<template>
  <div class="px-8 py-8 bg-slate-50 dark:bg-slate-900/30">
    <h2 v-if="section.title" class="text-lg font-bold text-center mb-6">{{ section.title }}</h2>
    <div
      class="gap-4"
      :class="section.layout === 'grid' ? 'grid grid-cols-2' : 'flex flex-col max-w-xl mx-auto'"
    >
      <div
        v-for="(t, i) in section.testimonials"
        :key="i"
        class="bg-white dark:bg-slate-800 rounded-lg p-5 shadow-sm border"
      >
        <p class="text-amber-400 text-sm mb-2">{{ stars(t.rating) }}</p>
        <p class="text-sm italic text-muted-foreground mb-3">"{{ t.quote || 'Customer quote...' }}"</p>
        <div class="flex items-center gap-2">
          <div
            v-if="t.avatar_url"
            class="size-8 rounded-full bg-muted overflow-hidden shrink-0"
          >
            <img :src="t.avatar_url" :alt="t.author" class="size-full object-cover" />
          </div>
          <div
            v-else
            class="size-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0"
          >
            {{ (t.author || '?')[0].toUpperCase() }}
          </div>
          <div>
            <p class="text-sm font-medium">{{ t.author || 'Customer' }}</p>
            <p v-if="t.role" class="text-[10px] text-muted-foreground">{{ t.role }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
