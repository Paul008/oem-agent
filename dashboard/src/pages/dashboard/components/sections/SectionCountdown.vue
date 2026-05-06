<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps<{
  section: {
    type: 'countdown'
    title?: string
    subtitle?: string
    target_date: string
    expired_message: string
    cta_text?: string
    cta_url?: string
    background_color?: string
    background_image_url?: string
  }
}>()

const timeLeft = computed(() => {
  if (!props.section.target_date)
    return null
  const target = new Date(props.section.target_date).getTime()
  const now = Date.now()
  const diff = target - now
  if (diff <= 0)
    return null
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
})

const isExpired = computed(() => {
  if (!props.section.target_date)
    return false
  return new Date(props.section.target_date).getTime() <= Date.now()
})
</script>

<template>
  <div
    class="px-8 py-12 text-center relative overflow-hidden"
    :style="{
      backgroundColor: section.background_color || '#0f172a',
      color: '#fff',
      backgroundImage: section.background_image_url ? `url(${section.background_image_url})` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }"
  >
    <div v-if="section.background_image_url" class="absolute inset-0 bg-black/50" />
    <div class="relative z-10">
      <h2 v-if="section.title" class="text-2xl font-bold mb-2">
        {{ section.title }}
      </h2>
      <p v-if="section.subtitle" class="text-sm opacity-80 mb-8">
        {{ section.subtitle }}
      </p>

      <!-- Countdown display -->
      <template v-if="!isExpired && (timeLeft || !section.target_date)">
        <div class="flex items-center justify-center gap-4 mb-8">
          <div v-for="(unit, key) in { Days: timeLeft?.days ?? 0, Hours: timeLeft?.hours ?? 0, Minutes: timeLeft?.minutes ?? 0, Seconds: timeLeft?.seconds ?? 0 }" :key="key" class="text-center">
            <div class="text-4xl font-bold tabular-nums bg-white/10 rounded-lg px-4 py-3 min-w-[72px]">
              {{ String(unit).padStart(2, '0') }}
            </div>
            <p class="text-[10px] uppercase tracking-wider opacity-60 mt-1.5">
              {{ key }}
            </p>
          </div>
        </div>
        <p v-if="!section.target_date" class="text-xs opacity-50 mb-4">
          Set a target date to start the countdown
        </p>
      </template>

      <!-- Expired state -->
      <template v-else>
        <p class="text-xl font-semibold mb-6">
          {{ section.expired_message }}
        </p>
      </template>

      <a
        v-if="section.cta_text"
        :href="section.cta_url || '#'"
        class="inline-block px-6 py-2.5 bg-white text-slate-900 rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors"
      >
        {{ section.cta_text }}
      </a>
    </div>
  </div>
</template>
