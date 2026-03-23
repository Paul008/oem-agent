<script lang="ts" setup>
const props = defineProps<{
  section: {
    type: 'hero'
    heading: string
    sub_heading: string
    cta_text: string
    cta_url: string
    desktop_image_url: string
    mobile_image_url: string
    background_image_url?: string
    video_url?: string
    heading_size?: string
    heading_weight?: string
    sub_heading_size?: string
    sub_heading_weight?: string
    text_color?: string
    text_align?: string
    overlay_position?: string
    show_overlay?: boolean
    full_width_image?: boolean
  }
}>()

const sizeClasses: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  '5xl': 'text-5xl',
  '6xl': 'text-6xl',
}

const weightClasses: Record<string, string> = {
  light: 'font-light',
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
  extrabold: 'font-extrabold',
}

const alignClasses: Record<string, string> = {
  left: 'text-left items-start',
  center: 'text-center items-center',
  right: 'text-right items-end',
}

const positionClasses: Record<string, string> = {
  'bottom-left': 'bottom-0 left-0 p-8',
  'bottom-center': 'bottom-0 inset-x-0 p-8 flex flex-col items-center text-center',
  'bottom-right': 'bottom-0 right-0 p-8 flex flex-col items-end text-right',
  'center': 'inset-0 flex flex-col items-center justify-center text-center',
  'top-left': 'top-0 left-0 p-8',
  'top-center': 'top-0 inset-x-0 p-8 flex flex-col items-center text-center',
}

function headingSizeClass() {
  return sizeClasses[props.section.heading_size || '3xl'] || 'text-3xl'
}
function headingWeightClass() {
  return weightClasses[props.section.heading_weight || 'bold'] || 'font-bold'
}
function subSizeClass() {
  return sizeClasses[props.section.sub_heading_size || 'lg'] || 'text-lg'
}
function subWeightClass() {
  return weightClasses[props.section.sub_heading_weight || 'normal'] || 'font-normal'
}
function overlayPos() {
  return positionClasses[props.section.overlay_position || 'bottom-left'] || positionClasses['bottom-left']
}
function textAlignClass() {
  return alignClasses[props.section.text_align || 'left'] || ''
}
</script>

<template>
  <div
    class="relative w-full overflow-hidden bg-muted"
    :class="section.full_width_image ? '' : 'aspect-[16/7]'"
    :style="section.background_image_url && !section.desktop_image_url
      ? { backgroundImage: `url(${section.background_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : undefined"
  >
    <!-- Video background -->
    <video
      v-if="section.video_url"
      :src="section.video_url"
      autoplay
      muted
      loop
      playsinline
      class="absolute inset-0 w-full h-full object-cover"
    />
    <!-- Image -->
    <img
      v-else-if="section.desktop_image_url"
      :src="section.desktop_image_url"
      :alt="section.heading"
      :class="section.full_width_image ? 'w-full h-auto' : 'w-full h-full object-cover'"
    />
    <div v-if="section.show_overlay !== false" class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
    <div
      class="absolute"
      :class="[overlayPos(), textAlignClass()]"
    >
      <h2
        class="drop-shadow-lg"
        :class="[headingSizeClass(), headingWeightClass()]"
        :style="{ color: section.text_color || '#ffffff' }"
      >
        {{ section.heading }}
      </h2>
      <p
        v-if="section.sub_heading"
        class="mt-1 drop-shadow"
        :class="[subSizeClass(), subWeightClass()]"
        :style="{ color: section.text_color || '#ffffff', opacity: 0.85 }"
      >
        {{ section.sub_heading }}
      </p>
      <a
        v-if="section.cta_text"
        :href="section.cta_url"
        target="_blank"
        class="inline-block mt-4 bg-white text-black text-sm font-semibold px-6 py-2.5 rounded hover:bg-white/90 transition-colors"
      >
        {{ section.cta_text }}
      </a>
    </div>
  </div>
</template>
