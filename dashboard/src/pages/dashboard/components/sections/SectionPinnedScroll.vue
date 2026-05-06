<script lang="ts" setup>
import { computed } from 'vue'

interface PinnedCard {
  image: string
  mobile_image?: string
  caption: string
  title_bg?: string
  content_bg?: string
}

const props = defineProps<{
  section: {
    type: 'pinned-scroll'
    title?: string
    background_image?: string
    background_image_mobile?: string
    cards: PinnedCard[]
    mobile_layout?: 'carousel' | 'stacked'
  }
}>()

const cards = computed<PinnedCard[]>(() => props.section.cards || [])
</script>

<template>
  <!--
    Dashboard preview of the pinned-scroll section.
    The editor shows cards as a horizontal strip; the live dealer render
    pins the section and scrubs horizontally on scroll.
  -->
  <div
    class="relative w-full overflow-hidden bg-slate-900"
    :style="section.background_image ? { backgroundImage: `url('${section.background_image}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
  >
    <!-- Dark scrim for readability -->
    <div v-if="section.background_image" class="absolute inset-0 bg-black/30 pointer-events-none" />

    <div class="relative z-10 py-16 px-6">
      <h2
        v-if="section.title"
        class="text-white text-2xl md:text-4xl font-bold text-center mb-10 drop-shadow"
      >
        {{ section.title }}
      </h2>

      <div
        v-if="cards.length"
        class="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory"
        style="scrollbar-width: thin;"
      >
        <div
          v-for="(card, i) in cards"
          :key="i"
          class="shrink-0 w-[85%] md:w-[480px] snap-start rounded-xl overflow-hidden bg-white shadow-lg"
        >
          <div class="aspect-[16/10] w-full bg-slate-200">
            <img
              v-if="card.image"
              :src="card.image"
              :alt="card.caption || ''"
              class="w-full h-full object-cover"
            >
          </div>
          <div
            class="p-5"
            :style="card.content_bg ? { background: card.content_bg, color: '#fff' } : {}"
          >
            <p class="text-base leading-snug">
              {{ card.caption || '—' }}
            </p>
          </div>
        </div>
      </div>

      <div
        v-else
        class="bg-white/10 border border-dashed border-white/40 rounded-lg py-12 text-center text-white/80"
      >
        No cards yet — add cards via the editor
      </div>

      <p class="mt-6 text-xs text-white/60 text-center">
        Preview only — the live page pins this section and scrubs horizontally on scroll.
      </p>
    </div>
  </div>
</template>
