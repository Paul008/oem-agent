<script lang="ts" setup>
import { computed } from 'vue'
import { useInlineEdit } from '@/composables/use-inline-edit'

const props = defineProps<{
  section: {
    type: 'image-showcase'
    title?: string
    images: Array<{
      url: string
      alt?: string
      caption?: string
      description?: string
      overlay_position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
    }>
    layout: 'stacked' | 'fullscreen-scroll'
    height: 'screen' | 'large' | 'medium'
    overlay_style: 'dark' | 'light' | 'none'
  }
}>()

const heightClass = computed(() => {
  const map: Record<string, string> = {
    screen: 'min-h-[80vh]',
    large: 'min-h-[500px]',
    medium: 'min-h-[320px]',
  }
  return map[props.section.height] || map.large
})

function positionClass(pos?: string) {
  const map: Record<string, string> = {
    'top-left': 'top-6 left-6',
    'top-right': 'top-6 right-6 text-right',
    'bottom-left': 'bottom-6 left-6',
    'bottom-right': 'bottom-6 right-6 text-right',
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center',
  }
  return map[pos || 'bottom-left'] || map['bottom-left']
}

function overlayBg(style: string) {
  if (style === 'dark') return 'bg-black/40 text-white'
  if (style === 'light') return 'bg-white/70 text-slate-900'
  return ''
}

const emit = defineEmits<{ 'inline-edit': [field: string, value: string, el: HTMLElement]; 'update-text': [field: string, value: string] }>()
const titleEdit = useInlineEdit((v) => emit('update-text', 'title', v))
function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) { const el = e.target as HTMLElement; edit.startEdit(el); emit('inline-edit', field, el.textContent || '', el) }
</script>

<template>
  <div>
    <h2
      class="text-lg font-bold text-center py-4 bg-card cursor-text outline-none"
      :style="{ opacity: section.title ? 1 : 0.4 }"
      @dblclick="startEditing('title', titleEdit, $event)"
      @blur="titleEdit.stopEdit()"
      @keydown="titleEdit.onKeydown"
      @paste="titleEdit.onPaste"
    >
      {{ section.title || 'Double-click to add title' }}
    </h2>

    <div
      v-for="(img, i) in section.images"
      :key="i"
      class="relative w-full overflow-hidden bg-slate-900"
      :class="heightClass"
    >
      <img
        v-if="img.url"
        :src="img.url"
        :alt="img.alt || ''"
        class="absolute inset-0 w-full h-full object-cover"
      />
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center text-sm text-slate-500 bg-slate-800"
      >
        No image set
      </div>

      <!-- Overlay -->
      <div
        v-if="(img.caption || img.description) && section.overlay_style !== 'none'"
        class="absolute z-10 max-w-md px-5 py-3 rounded-lg"
        :class="[positionClass(img.overlay_position), overlayBg(section.overlay_style)]"
      >
        <p v-if="img.caption" class="text-lg font-bold leading-tight">{{ img.caption }}</p>
        <p v-if="img.description" class="text-sm mt-1 opacity-80">{{ img.description }}</p>
      </div>

      <!-- Dark overlay scrim for readability -->
      <div
        v-if="section.overlay_style === 'dark' && img.url"
        class="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none"
      />
    </div>

    <div
      v-if="!section.images?.length"
      class="flex items-center justify-center h-48 bg-muted text-sm text-muted-foreground"
    >
      No images added — use the editor to add full-bleed images
    </div>
  </div>
</template>
