<script lang="ts" setup>
import { computed } from 'vue'

import { useInlineEdit } from '@/composables/use-inline-edit'

import ImageOverlay from '../page-builder/ImageOverlay.vue'

const props = defineProps<{
  section: {
    type: 'hero' | 'cta-banner' | 'countdown'
    // Hero fields
    heading?: string
    sub_heading?: string
    cta_text?: string
    cta_url?: string
    desktop_image_url?: string
    mobile_image_url?: string
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
    full_width?: boolean
    font_family?: string
    // CTA-banner fields
    body?: string
    background_color?: string
    // Countdown fields
    title?: string
    subtitle?: string
    target_date?: string
    expired_message?: string
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()

const variant = computed(() => props.section.type as string)

function makeEditable(field: string) {
  return useInlineEdit((value: string) => emit('update-text', field, value))
}

const headingEdit = makeEditable('heading')
const subEdit = makeEditable('sub_heading')
const ctaEdit = makeEditable('cta_text')
const bodyEdit = makeEditable('body')
const titleEdit = makeEditable('title')

function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement
  edit.startEdit(el)
  emit('inline-edit', field, el.textContent || '', el)
}

// ---- Hero helpers ----
const isFullImage = computed(() => props.section.full_width_image || props.section.full_width)

const sizeClasses: Record<string, string> = {
  'sm': 'text-sm',
  'base': 'text-base',
  'lg': 'text-lg',
  'xl': 'text-xl',
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

function headingSizeClass() { return sizeClasses[props.section.heading_size || '3xl'] || 'text-3xl' }
function headingWeightClass() { return weightClasses[props.section.heading_weight || 'bold'] || 'font-bold' }
function subSizeClass() { return sizeClasses[props.section.sub_heading_size || 'lg'] || 'text-lg' }
function subWeightClass() { return weightClasses[props.section.sub_heading_weight || 'normal'] || 'font-normal' }
function overlayPos() { return positionClasses[props.section.overlay_position || 'bottom-left'] || positionClasses['bottom-left'] }
function textAlignClass() { return alignClasses[props.section.text_align || 'left'] || '' }

// ---- Countdown helpers ----
const timeLeft = computed(() => {
  if (!props.section.target_date)
    return null
  const diff = new Date(props.section.target_date).getTime() - Date.now()
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
  <!-- ═══ CTA-Banner variant ═══ -->
  <div
    v-if="variant === 'cta-banner'"
    class="px-8 py-12 text-center"
    :style="section.background_color ? { backgroundColor: section.background_color } : {}"
    :class="section.background_color ? 'text-white' : 'bg-primary text-primary-foreground'"
  >
    <h3
      class="text-2xl font-bold mb-2 cursor-text outline-none"
      @dblclick="startEditing('heading', headingEdit, $event)"
      @blur="headingEdit.stopEdit()"
      @keydown="headingEdit.onKeydown"
      @paste="headingEdit.onPaste"
    >
      {{ section.heading || 'Double-click to edit' }}
    </h3>
    <p
      class="mb-4 cursor-text outline-none"
      :style="{ opacity: section.body ? 0.9 : 0.4 }"
      @dblclick="startEditing('body', bodyEdit, $event)"
      @blur="bodyEdit.stopEdit()"
      @keydown="bodyEdit.onKeydown"
      @paste="bodyEdit.onPaste"
    >
      {{ section.body || 'Double-click to add body text' }}
    </p>
    <a
      v-if="section.cta_text"
      class="inline-block bg-white text-black text-sm font-semibold px-6 py-2.5 rounded hover:bg-white/90 transition-colors cursor-text outline-none"
      @dblclick.prevent="startEditing('cta_text', ctaEdit, $event)"
      @blur="ctaEdit.stopEdit()"
      @keydown="ctaEdit.onKeydown"
      @paste="ctaEdit.onPaste"
    >{{ section.cta_text }}</a>
  </div>

  <!-- ═══ Countdown variant ═══ -->
  <div
    v-else-if="variant === 'countdown'"
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

  <!-- ═══ Standard Hero ═══ -->
  <div
    v-else
    class="relative w-full overflow-hidden bg-muted"
    :class="isFullImage ? 'aspect-video' : 'aspect-[16/7]'"
    :style="section.background_image_url && !section.desktop_image_url
      ? { backgroundImage: `url(${section.background_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : undefined"
  >
    <video
      v-if="section.video_url"
      :src="section.video_url"
      autoplay muted loop playsinline
      class="absolute inset-0 w-full h-full object-cover"
    />
    <img
      v-else-if="section.desktop_image_url"
      :src="section.desktop_image_url"
      :alt="section.heading || ''"
      class="absolute inset-0 w-full h-full object-cover"
      :class="isFullImage ? 'object-top' : ''"
    >
    <ImageOverlay
      v-if="section.desktop_image_url"
      :current-url="section.desktop_image_url"
      @replace="emit('update-text', 'desktop_image_url', $event)"
    />
    <div v-if="section.show_overlay !== false" class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
    <div class="absolute" :class="[overlayPos(), textAlignClass()]" :style="section.font_family ? { fontFamily: `'${section.font_family}', sans-serif` } : {}">
      <h2
        class="drop-shadow-lg cursor-text outline-none"
        :class="[headingSizeClass(), headingWeightClass()]"
        :style="{ color: section.text_color || '#ffffff' }"
        @dblclick="startEditing('heading', headingEdit, $event)"
        @blur="headingEdit.stopEdit()"
        @keydown="headingEdit.onKeydown"
        @paste="headingEdit.onPaste"
      >
        {{ section.heading || 'Double-click to edit heading' }}
      </h2>
      <p
        class="mt-1 drop-shadow cursor-text outline-none"
        :class="[subSizeClass(), subWeightClass()]"
        :style="{ color: section.text_color || '#ffffff', opacity: section.sub_heading ? 0.85 : 0.4 }"
        @dblclick="startEditing('sub_heading', subEdit, $event)"
        @blur="subEdit.stopEdit()"
        @keydown="subEdit.onKeydown"
        @paste="subEdit.onPaste"
      >
        {{ section.sub_heading || 'Double-click to add subtitle' }}
      </p>
      <a
        v-if="section.cta_text"
        class="inline-block mt-4 bg-white text-black text-sm font-semibold px-6 py-2.5 rounded hover:bg-white/90 transition-colors cursor-text outline-none"
        @dblclick.prevent="startEditing('cta_text', ctaEdit, $event)"
        @blur="ctaEdit.stopEdit()"
        @keydown="ctaEdit.onKeydown"
        @paste="ctaEdit.onPaste"
      >
        {{ section.cta_text }}
      </a>
    </div>
  </div>
</template>
