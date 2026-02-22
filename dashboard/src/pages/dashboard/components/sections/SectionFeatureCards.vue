<script lang="ts" setup>
defineProps<{
  section: {
    type: 'feature-cards'
    title?: string
    cards: Array<{ title: string; description: string; image_url?: string }>
    columns: 2 | 3 | 4
  }
}>()

const colClass: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}
</script>

<template>
  <div v-if="section.cards?.length" class="px-8 py-10">
    <h3 v-if="section.title" class="text-xl font-bold mb-6">{{ section.title }}</h3>
    <div :class="['grid gap-4', colClass[section.columns] || colClass[3]]">
      <UiCard v-for="card in section.cards" :key="card.title" class="overflow-hidden">
        <div v-if="card.image_url" class="aspect-[16/9] bg-muted">
          <img
            :src="card.image_url"
            :alt="card.title"
            class="w-full h-full object-cover"
          />
        </div>
        <UiCardHeader>
          <UiCardTitle class="text-base">{{ card.title }}</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none" v-html="card.description" />
        </UiCardContent>
      </UiCard>
    </div>
  </div>
</template>
