<script lang="ts" setup>
import { ref } from 'vue'

import type { AnimationType } from '@/composables/use-section-animation'

import { useSectionAnimation } from '@/composables/use-section-animation'

const props = defineProps<{
  animation?: AnimationType
  animationDuration?: number
  animationDelay?: number
}>()

const sectionRef = ref<HTMLElement | null>(null)

useSectionAnimation(props.animation, sectionRef, {
  duration: props.animationDuration,
  delay: props.animationDelay,
})
</script>

<template>
  <div ref="sectionRef">
    <slot />
  </div>
</template>
