<script lang="ts" setup>
const props = defineProps<{
  section: {
    type: 'pricing-table'
    title?: string
    subtitle?: string
    tiers: Array<{
      name: string
      price: string
      price_suffix?: string
      features: string[]
      cta_text: string
      cta_url: string
      highlighted?: boolean
      badge_text?: string
    }>
    disclaimer?: string
  }
}>()
</script>

<template>
  <div class="px-8 py-10">
    <div class="text-center mb-8">
      <h2 v-if="section.title" class="text-xl font-bold">{{ section.title }}</h2>
      <p v-if="section.subtitle" class="text-sm text-muted-foreground mt-1">{{ section.subtitle }}</p>
    </div>
    <div
      class="grid gap-4 max-w-5xl mx-auto"
      :class="{
        'grid-cols-1': section.tiers.length === 1,
        'grid-cols-2': section.tiers.length === 2,
        'grid-cols-3': section.tiers.length >= 3,
      }"
    >
      <div
        v-for="(tier, i) in section.tiers"
        :key="i"
        class="relative rounded-xl border p-6 flex flex-col"
        :class="tier.highlighted
          ? 'border-primary shadow-lg ring-2 ring-primary/20 scale-[1.02]'
          : 'border-border shadow-sm'"
      >
        <div
          v-if="tier.badge_text"
          class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-0.5 rounded-full"
        >
          {{ tier.badge_text }}
        </div>
        <h3 class="text-base font-semibold mb-1">{{ tier.name }}</h3>
        <div class="mb-4">
          <span class="text-2xl font-bold">{{ tier.price }}</span>
          <span v-if="tier.price_suffix" class="text-xs text-muted-foreground ml-1">{{ tier.price_suffix }}</span>
        </div>
        <ul v-if="tier.features.length" class="space-y-1.5 mb-6 flex-1">
          <li v-for="(f, fi) in tier.features" :key="fi" class="flex items-start gap-2 text-sm">
            <span class="text-emerald-500 shrink-0 mt-0.5">&#10003;</span>
            <span>{{ f }}</span>
          </li>
        </ul>
        <div v-else class="flex-1" />
        <a
          :href="tier.cta_url || '#'"
          class="block text-center py-2 rounded-lg text-sm font-medium transition-colors"
          :class="tier.highlighted
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-muted hover:bg-muted/80'"
        >
          {{ tier.cta_text || 'Learn More' }}
        </a>
      </div>
    </div>
    <p v-if="section.disclaimer" class="text-[10px] text-muted-foreground text-center mt-4 max-w-2xl mx-auto">
      {{ section.disclaimer }}
    </p>
  </div>
</template>
