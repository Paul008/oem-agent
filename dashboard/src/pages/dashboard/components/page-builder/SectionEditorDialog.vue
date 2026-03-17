<script lang="ts" setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { GripVertical, X, Minimize2, Maximize2 } from 'lucide-vue-next'
import SectionProperties from './SectionProperties.vue'

const props = defineProps<{
  section: any
  regenerating: boolean
  oemId: string
  modelSlug: string
}>()

const emit = defineEmits<{
  close: []
  regenerate: []
  delete: []
  convert: [targetType: string]
  'update:section': [updates: Record<string, any>]
}>()

// Dragging state
const panelRef = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const dragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const collapsed = ref(false)
const initialized = ref(false)

// Position to bottom-right on first open
watch(() => props.section, (s) => {
  if (s && !initialized.value) {
    initialized.value = true
    // Place near bottom-right, offset from edge
    pos.value = {
      x: Math.max(40, window.innerWidth - 380),
      y: Math.max(80, 120),
    }
  }
}, { immediate: true })

function onPointerDown(e: PointerEvent) {
  if (!panelRef.value) return
  dragging.value = true
  dragOffset.value = {
    x: e.clientX - pos.value.x,
    y: e.clientY - pos.value.y,
  }
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const newX = e.clientX - dragOffset.value.x
  const newY = e.clientY - dragOffset.value.y
  // Clamp to viewport
  pos.value = {
    x: Math.max(0, Math.min(newX, window.innerWidth - 100)),
    y: Math.max(0, Math.min(newY, window.innerHeight - 60)),
  }
}

function onPointerUp() {
  dragging.value = false
}

function sectionLabel(s: any): string {
  return s?.heading || s?.title || s?.type || 'Section'
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="section"
      ref="panelRef"
      class="fixed z-50 flex flex-col bg-card border rounded-lg shadow-xl"
      :class="collapsed ? 'w-72' : 'w-80'"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    >
      <!-- Drag handle / title bar -->
      <div
        class="flex items-center gap-2 px-3 py-2 border-b bg-muted/50 rounded-t-lg cursor-grab select-none shrink-0"
        :class="dragging && 'cursor-grabbing'"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      >
        <GripVertical class="size-3.5 text-muted-foreground shrink-0" />
        <span class="text-xs font-semibold truncate flex-1">
          Edit: {{ sectionLabel(section) }}
        </span>
        <UiBadge variant="secondary" class="text-[9px] shrink-0">
          {{ section.type }}
        </UiBadge>
        <button
          class="p-0.5 rounded hover:bg-muted text-muted-foreground"
          :title="collapsed ? 'Expand' : 'Collapse'"
          @click="collapsed = !collapsed"
        >
          <Maximize2 v-if="collapsed" class="size-3" />
          <Minimize2 v-else class="size-3" />
        </button>
        <button
          class="p-0.5 rounded hover:bg-muted text-muted-foreground"
          title="Close editor"
          @click="emit('close')"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <!-- Editor body -->
      <div
        v-show="!collapsed"
        class="overflow-y-auto p-4"
        style="max-height: calc(100vh - 200px)"
      >
        <SectionProperties
          :section="section"
          :regenerating="regenerating"
          :oem-id="oemId"
          :model-slug="modelSlug"
          @regenerate="emit('regenerate')"
          @delete="emit('delete')"
          @convert="emit('convert', $event)"
          @update:section="emit('update:section', $event)"
        />
      </div>
    </div>
  </Teleport>
</template>
