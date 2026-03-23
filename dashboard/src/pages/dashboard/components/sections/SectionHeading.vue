<script lang="ts" setup>
const props = defineProps<{
  section: {
    type: 'heading'
    heading: string
    heading_tag?: string
    heading_size?: string
    heading_weight?: string
    sub_heading?: string
    sub_heading_size?: string
    sub_heading_weight?: string
    text_align?: string
    text_color?: string
    line_gap?: string
    background_color?: string
  }
}>()

const sizeClasses: Record<string, string> = {
  sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl',
  '2xl': 'text-2xl', '3xl': 'text-3xl', '4xl': 'text-4xl',
  '5xl': 'text-5xl', '6xl': 'text-6xl',
}
const weightClasses: Record<string, string> = {
  light: 'font-light', normal: 'font-normal', medium: 'font-medium',
  semibold: 'font-semibold', bold: 'font-bold', extrabold: 'font-extrabold',
}
const alignClasses: Record<string, string> = {
  left: 'text-left', center: 'text-center', right: 'text-right',
}
const gapClasses: Record<string, string> = {
  '0': 'mt-0', '2': 'mt-0.5', '4': 'mt-1', '6': 'mt-1.5',
  '8': 'mt-2', '12': 'mt-3', '16': 'mt-4', '20': 'mt-5', '24': 'mt-6', '32': 'mt-8',
}

function hSize() { return sizeClasses[props.section.heading_size || '3xl'] || 'text-3xl' }
function hWeight() { return weightClasses[props.section.heading_weight || 'bold'] || 'font-bold' }
function sSize() { return sizeClasses[props.section.sub_heading_size || 'lg'] || 'text-lg' }
function sWeight() { return weightClasses[props.section.sub_heading_weight || 'normal'] || 'font-normal' }
function align() { return alignClasses[props.section.text_align || 'left'] || 'text-left' }
function gap() { return gapClasses[props.section.line_gap || '8'] || 'mt-2' }
</script>

<template>
  <div
    class="px-8 py-6"
    :class="align()"
    :style="{ backgroundColor: section.background_color || undefined, color: section.text_color || undefined }"
  >
    <component
      :is="section.heading_tag || 'h2'"
      :class="[hSize(), hWeight()]"
      class="leading-tight"
    >
      {{ section.heading || 'Heading' }}
    </component>
    <p
      v-if="section.sub_heading"
      :class="[sSize(), sWeight(), gap()]"
      class="text-muted-foreground"
      :style="section.text_color ? { color: section.text_color, opacity: 0.7 } : undefined"
    >
      {{ section.sub_heading }}
    </p>
  </div>
</template>
