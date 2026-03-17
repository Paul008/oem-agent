<script lang="ts" setup>
const props = defineProps<{
  section: {
    type: 'stats'
    title?: string
    stats: Array<{ value: string; label: string; unit?: string; icon_url?: string }>
    layout: 'row' | 'grid'
    background?: string
  }
}>()
</script>

<template>
  <div
    class="px-8 py-8"
    :style="section.background ? { background: section.background, color: '#fff' } : {}"
    :class="!section.background && 'bg-slate-900 text-white'"
  >
    <h2 v-if="section.title" class="text-lg font-bold text-center mb-6">{{ section.title }}</h2>
    <div
      class="gap-6 justify-center"
      :class="section.layout === 'grid' ? 'grid grid-cols-2 sm:grid-cols-4' : 'flex flex-wrap'"
    >
      <div
        v-for="(stat, i) in section.stats"
        :key="i"
        class="text-center"
        :class="section.layout === 'row' ? 'flex-1 min-w-[120px]' : ''"
      >
        <img
          v-if="stat.icon_url"
          :src="stat.icon_url"
          :alt="stat.label"
          class="size-8 mx-auto mb-2 object-contain"
        />
        <p class="text-3xl font-bold leading-tight">
          {{ stat.value || '—' }}
          <span v-if="stat.unit" class="text-base font-normal opacity-70">{{ stat.unit }}</span>
        </p>
        <p class="text-sm opacity-70 mt-1">{{ stat.label }}</p>
      </div>
    </div>
  </div>
</template>
