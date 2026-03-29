<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  AlignLeft, AlignCenter, AlignRight,
  Pipette,
} from 'lucide-vue-next'
import FontPicker from './FontPicker.vue'

const props = defineProps<{
  target: HTMLElement | null
  sectionId: string
  field: string
  // Current values from section data
  fontSize?: string
  fontWeight?: string
  fontFamily?: string
  textAlign?: string
  textColor?: string
}>()

const emit = defineEmits<{
  updateField: [sectionId: string, field: string, value: any]
}>()

const toolbarRef = ref<HTMLElement | null>(null)
const showColorInput = ref(false)
const pos = ref({ top: 0, left: 0 })

// Position toolbar above the target element
function reposition() {
  if (!props.target || !toolbarRef.value) return
  const rect = props.target.getBoundingClientRect()
  const toolbar = toolbarRef.value.getBoundingClientRect()
  pos.value = {
    top: Math.max(8, rect.top - toolbar.height - 8),
    left: Math.max(8, rect.left + (rect.width - toolbar.width) / 2),
  }
}

onMounted(() => {
  nextTick(reposition)
  window.addEventListener('scroll', reposition, true)
})

onUnmounted(() => {
  window.removeEventListener('scroll', reposition, true)
})

watch(() => props.target, () => nextTick(reposition))

const SIZES = ['sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl']
const WEIGHTS = [
  { value: 'light', label: 'Light' },
  { value: 'normal', label: 'Regular' },
  { value: 'medium', label: 'Medium' },
  { value: 'semibold', label: 'Semi' },
  { value: 'bold', label: 'Bold' },
  { value: 'extrabold', label: 'Extra' },
]

function cycleSize(direction: 1 | -1) {
  const current = props.fontSize || 'base'
  const idx = SIZES.indexOf(current)
  const next = SIZES[Math.max(0, Math.min(SIZES.length - 1, idx + direction))]
  if (next !== current) emit('updateField', props.sectionId, fontSizeField.value, next)
}

// Map field names to their size/weight/align counterparts
const fontSizeField = computed(() => {
  if (props.field === 'heading') return 'heading_size'
  if (props.field === 'sub_heading') return 'sub_heading_size'
  return 'heading_size'
})

const fontWeightField = computed(() => {
  if (props.field === 'heading') return 'heading_weight'
  if (props.field === 'sub_heading') return 'sub_heading_weight'
  return 'heading_weight'
})

function setWeight(w: string) {
  emit('updateField', props.sectionId, fontWeightField.value, w)
}

function setAlign(a: string) {
  emit('updateField', props.sectionId, 'text_align', a)
}

function setColor(c: string) {
  emit('updateField', props.sectionId, 'text_color', c)
}

function setFontFamily(family: string) {
  emit('updateField', props.sectionId, 'font_family', family)
}

async function eyedrop() {
  if (!('EyeDropper' in window)) return
  try {
    const dropper = new (window as any).EyeDropper()
    const result = await dropper.open()
    if (result?.sRGBHex) setColor(result.sRGBHex)
  } catch { /* user cancelled */ }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="target"
      ref="toolbarRef"
      class="fixed z-[60] flex items-center gap-1 px-2 py-1.5 bg-card border rounded-lg shadow-xl"
      :style="{ top: pos.top + 'px', left: pos.left + 'px' }"
      @mousedown.prevent
    >
      <!-- Font family -->
      <FontPicker
        :model-value="fontFamily"
        @update:model-value="setFontFamily"
      />

      <div class="w-px h-4 bg-border mx-0.5" />

      <!-- Font size -->
      <button
        class="p-1 rounded hover:bg-muted text-xs font-mono min-w-[28px] text-center"
        title="Decrease size"
        @click="cycleSize(-1)"
      >
        A-
      </button>
      <span class="text-[10px] text-muted-foreground font-mono min-w-[24px] text-center">{{ fontSize || 'base' }}</span>
      <button
        class="p-1 rounded hover:bg-muted text-xs font-mono min-w-[28px] text-center"
        title="Increase size"
        @click="cycleSize(1)"
      >
        A+
      </button>

      <div class="w-px h-4 bg-border mx-0.5" />

      <!-- Font weight -->
      <select
        :value="fontWeight || 'normal'"
        class="h-6 text-[10px] bg-transparent border rounded px-1 cursor-pointer"
        title="Font weight"
        @change="setWeight(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="w in WEIGHTS" :key="w.value" :value="w.value">{{ w.label }}</option>
      </select>

      <div class="w-px h-4 bg-border mx-0.5" />

      <!-- Alignment -->
      <button
        class="p-1 rounded hover:bg-muted"
        :class="textAlign === 'left' || !textAlign ? 'bg-muted' : ''"
        title="Align left"
        @click="setAlign('left')"
      >
        <AlignLeft class="size-3" />
      </button>
      <button
        class="p-1 rounded hover:bg-muted"
        :class="textAlign === 'center' ? 'bg-muted' : ''"
        title="Align center"
        @click="setAlign('center')"
      >
        <AlignCenter class="size-3" />
      </button>
      <button
        class="p-1 rounded hover:bg-muted"
        :class="textAlign === 'right' ? 'bg-muted' : ''"
        title="Align right"
        @click="setAlign('right')"
      >
        <AlignRight class="size-3" />
      </button>

      <div class="w-px h-4 bg-border mx-0.5" />

      <!-- Color -->
      <div class="relative">
        <button
          class="p-1 rounded hover:bg-muted flex items-center gap-1"
          title="Text color"
          @click="showColorInput = !showColorInput"
        >
          <div class="size-3 rounded-sm border" :style="{ backgroundColor: textColor || '#000000' }" />
        </button>
        <div v-if="showColorInput" class="absolute top-full left-0 mt-1 p-2 bg-card border rounded-lg shadow-xl flex items-center gap-1.5 z-10">
          <input
            type="color"
            :value="textColor || '#000000'"
            class="size-7 rounded cursor-pointer border-0 p-0"
            @input="setColor(($event.target as HTMLInputElement).value)"
          />
          <input
            type="text"
            :value="textColor || '#000000'"
            class="h-7 w-20 text-xs font-mono px-1.5 border rounded"
            @change="setColor(($event.target as HTMLInputElement).value)"
          />
          <button
            v-if="'EyeDropper' in window"
            class="p-1 rounded hover:bg-muted"
            title="Pick color from screen"
            @click="eyedrop"
          >
            <Pipette class="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
