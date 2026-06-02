<script lang="ts" setup>
import AnimatedSection from './AnimatedSection.vue'
import { resolveSectionComponent } from '../page-builder/section-registry'

interface PageSection {
  type: string
  id: string
  order: number
  animation?: string
  [key: string]: any
}

defineProps<{ sections: PageSection[] }>()
</script>

<template>
  <div class="space-y-0">
    <template v-for="section in sections" :key="section.id">
      <AnimatedSection :animation="section.animation as any" :animation-duration="section.animation_duration" :animation-delay="section.animation_delay">
        <component
          :is="resolveSectionComponent(section)"
          v-if="resolveSectionComponent(section)"
          :section="section"
        />
        <div
          v-else
          class="px-6 py-4 bg-muted/30 text-sm text-muted-foreground"
        >
          Unknown section type: {{ section.type }}
        </div>
      </AnimatedSection>
    </template>
  </div>
</template>
