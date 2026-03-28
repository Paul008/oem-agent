<script lang="ts" setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import {
  GripVertical, X, Plus, ChevronDown, ChevronRight,
  AlignLeft, AlignCenter, AlignRight, Code2,
  Image as ImageIcon, Type, MessageSquare, Star, Award,
  BarChart3, Tag, MousePointerClick, Smile, Eye,
} from 'lucide-vue-next'
import { useOemData } from '@/composables/use-oem-data'
import { fetchStyleGuide } from '@/lib/worker-api'

const props = defineProps<{
  modelValue: Record<string, any>
  pattern: string
  brandTokens?: Record<string, any> | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

/* ───── Internal reactive state ───── */

const internal = ref<Record<string, any>>(structuredClone(props.modelValue ?? {}))
const showRawJson = ref(false)
const rawJsonText = ref(JSON.stringify(props.modelValue ?? {}, null, 2))
const rawJsonValid = ref(true)

// Sync incoming prop changes
watch(
  () => props.modelValue,
  (v) => {
    internal.value = structuredClone(v ?? {})
    rawJsonText.value = JSON.stringify(v ?? {}, null, 2)
  },
)

// Emit on internal changes (debounced via lazy inputs)
let emitTimer: ReturnType<typeof setTimeout> | null = null
watch(
  internal,
  (v) => {
    if (emitTimer) clearTimeout(emitTimer)
    emitTimer = setTimeout(() => {
      rawJsonText.value = JSON.stringify(v, null, 2)
      emit('update:modelValue', structuredClone(v))
    }, 150)
  },
  { deep: true },
)

function patch(updates: Record<string, any>) {
  internal.value = { ...internal.value, ...updates }
}

function patchNested(key: string, updates: Record<string, any>) {
  internal.value = {
    ...internal.value,
    [key]: { ...(internal.value[key] ?? {}), ...updates },
  }
}

/* ───── Raw JSON sync ───── */

function onRawJsonInput(e: Event) {
  const text = (e.target as HTMLTextAreaElement).value
  rawJsonText.value = text
  try {
    const parsed = JSON.parse(text)
    rawJsonValid.value = true
    internal.value = parsed
  } catch {
    rawJsonValid.value = false
  }
}

/* ───── Card Composition (card-grid) ───── */

const AVAILABLE_SLOTS = [
  { key: 'image', label: 'Image', icon: ImageIcon },
  { key: 'icon', label: 'Icon', icon: Smile },
  { key: 'title', label: 'Title', icon: Type },
  { key: 'subtitle', label: 'Subtitle', icon: Type },
  { key: 'body', label: 'Body', icon: MessageSquare },
  { key: 'badge', label: 'Badge', icon: Tag },
  { key: 'stat', label: 'Stat', icon: BarChart3 },
  { key: 'rating', label: 'Rating', icon: Star },
  { key: 'cta', label: 'CTA', icon: MousePointerClick },
  { key: 'logo', label: 'Logo', icon: Award },
] as const

const composition = computed({
  get: () => (internal.value.card_composition as string[]) ?? ['image', 'title', 'body', 'cta'],
  set: (v) => patch({ card_composition: v }),
})

const unusedSlots = computed(() =>
  AVAILABLE_SLOTS.filter((s) => !composition.value.includes(s.key)),
)

const showSlotDropdown = ref(false)

function addSlot(key: string) {
  composition.value = [...composition.value, key]
  showSlotDropdown.value = false
}

function removeSlot(index: number) {
  const arr = [...composition.value]
  arr.splice(index, 1)
  composition.value = arr
}

// Drag-drop reorder
const dragIndex = ref<number | null>(null)

function onDragStart(index: number, e: DragEvent) {
  dragIndex.value = index
  e.dataTransfer!.effectAllowed = 'move'
}

function onDrop(targetIndex: number, e: DragEvent) {
  e.preventDefault()
  if (dragIndex.value === null || dragIndex.value === targetIndex) return
  const arr = [...composition.value]
  const [moved] = arr.splice(dragIndex.value, 1)
  arr.splice(targetIndex, 0, moved)
  composition.value = arr
  dragIndex.value = null
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
}

/* ───── Card Style helpers ───── */

const cardStyle = computed(() => internal.value.card_style ?? {})

function updateCardStyle(key: string, value: any) {
  patchNested('card_style', { [key]: value })
}

/* ───── Section Style helpers ───── */

const sectionStyle = computed(() => internal.value.section_style ?? {})

function updateSectionStyle(key: string, value: any) {
  patchNested('section_style', { [key]: value })
}

/* ───── Typography helpers ───── */

const typography = computed(() => internal.value.typography ?? {})

function updateTypography(key: string, value: any) {
  patchNested('typography', { [key]: value })
}

/* ───── Shadow map ───── */

const SHADOW_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '0 1px 2px rgba(0,0,0,0.05)', label: 'Small' },
  { value: '0 4px 12px rgba(0,0,0,0.08)', label: 'Medium' },
  { value: '0 8px 24px rgba(0,0,0,0.12)', label: 'Large' },
]

/* ───── Preview helpers ───── */

const previewColumns = computed(() => internal.value.columns ?? 3)

const overlayPositionStyles = computed(() => {
  const pos = internal.value.overlay_position ?? 'bottom-left'
  const map: Record<string, Record<string, string>> = {
    'top-left': { top: '16px', left: '16px', textAlign: 'left' },
    'top-center': { top: '16px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' },
    'bottom-left': { bottom: '16px', left: '16px', textAlign: 'left' },
    'bottom-center': { bottom: '16px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' },
    center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' },
  }
  return map[pos] ?? map['bottom-left']
})

function slotIcon(key: string) {
  return AVAILABLE_SLOTS.find((s) => s.key === key)?.icon ?? Type
}

/* ───── Brand token preview switching ───── */

const { fetchOems } = useOemData()
const previewOems = ref<{ id: string; name: string }[]>([])
const previewOemId = ref('')
const previewTokens = ref<Record<string, any> | null>(null)
const loadingPreview = ref(false)

onMounted(async () => {
  try { previewOems.value = await fetchOems() } catch {}
})

watch(previewOemId, async (oemId) => {
  if (!oemId) { previewTokens.value = null; return }
  loadingPreview.value = true
  try {
    const data = await fetchStyleGuide(oemId)
    previewTokens.value = data.brand_tokens
  } catch { previewTokens.value = null }
  finally { loadingPreview.value = false }
})

const activeTokens = computed(() => previewTokens.value || props.brandTokens || null)
const brandPrimary = computed(() => activeTokens.value?.colors?.primary ?? null)
</script>

<template>
  <div class="grid grid-cols-5 gap-6 min-h-[480px]">
    <!-- ════════ LEFT: Controls ════════ -->
    <div class="col-span-3 space-y-5 overflow-y-auto max-h-[600px] pr-2">

      <!-- Card Composition (card-grid only) -->
      <section v-if="pattern === 'card-grid'" class="space-y-2">
        <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Card Composition</h4>
        <div class="space-y-1">
          <div
            v-for="(slot, idx) in composition"
            :key="slot + idx"
            class="flex items-center gap-2 px-2 py-1.5 rounded border bg-background hover:bg-muted/50 cursor-grab text-sm"
            draggable="true"
            @dragstart="onDragStart(idx, $event)"
            @drop="onDrop(idx, $event)"
            @dragover="onDragOver"
          >
            <GripVertical class="size-3.5 text-muted-foreground shrink-0" />
            <component :is="slotIcon(slot)" class="size-3.5 text-muted-foreground shrink-0" />
            <span class="flex-1 capitalize">{{ slot }}</span>
            <button class="text-muted-foreground hover:text-destructive" @click="removeSlot(idx)">
              <X class="size-3.5" />
            </button>
          </div>
        </div>
        <div class="relative">
          <button
            class="flex items-center gap-1.5 text-xs text-primary hover:underline"
            @click="showSlotDropdown = !showSlotDropdown"
          >
            <Plus class="size-3.5" /> Add Slot
          </button>
          <div
            v-if="showSlotDropdown && unusedSlots.length"
            class="absolute z-10 mt-1 bg-popover border rounded-md shadow-md py-1 w-40"
          >
            <button
              v-for="s in unusedSlots"
              :key="s.key"
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
              @click="addSlot(s.key)"
            >
              <component :is="s.icon" class="size-3.5 text-muted-foreground" />
              {{ s.label }}
            </button>
          </div>
          <p v-if="showSlotDropdown && !unusedSlots.length" class="text-xs text-muted-foreground mt-1">
            All slots added
          </p>
        </div>
      </section>

      <!-- Columns (card-grid only) -->
      <section v-if="pattern === 'card-grid'" class="space-y-2">
        <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Columns</h4>
        <div class="flex gap-1">
          <button
            v-for="n in [2, 3, 4]"
            :key="n"
            class="px-3 py-1 text-xs rounded border transition-colors"
            :class="(internal.columns ?? 3) === n ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'"
            @click="patch({ columns: n })"
          >
            {{ n }}
          </button>
        </div>
      </section>

      <!-- Card Style (card-grid only) -->
      <section v-if="pattern === 'card-grid'" class="space-y-3">
        <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Card Style</h4>

        <div class="grid grid-cols-2 gap-3">
          <!-- Background -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Background</label>
            <div class="flex items-center gap-2">
              <div
                class="size-5 rounded-full border shrink-0"
                :style="{ backgroundColor: cardStyle.background || 'transparent' }"
              />
              <input
                type="text"
                class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                :value="cardStyle.background ?? 'transparent'"
                placeholder="transparent"
                @change="updateCardStyle('background', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>

          <!-- Border -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Border</label>
            <input
              type="text"
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="cardStyle.border ?? 'none'"
              placeholder="none"
              @change="updateCardStyle('border', ($event.target as HTMLInputElement).value)"
            />
          </div>

          <!-- Shadow -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Shadow</label>
            <select
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="cardStyle.shadow ?? 'none'"
              @change="updateCardStyle('shadow', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in SHADOW_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- Border Radius -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">
              Radius: {{ cardStyle.border_radius ?? 8 }}px
            </label>
            <input
              type="range"
              min="0"
              max="24"
              :value="cardStyle.border_radius ?? 8"
              class="w-full accent-primary"
              @input="updateCardStyle('border_radius', Number(($event.target as HTMLInputElement).value))"
            />
          </div>

          <!-- Gap -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">
              Gap: {{ cardStyle.gap ?? 16 }}px
            </label>
            <input
              type="range"
              min="0"
              max="32"
              :value="cardStyle.gap ?? 16"
              class="w-full accent-primary"
              @input="updateCardStyle('gap', Number(($event.target as HTMLInputElement).value))"
            />
          </div>

          <!-- Padding -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Padding</label>
            <input
              type="text"
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="cardStyle.padding ?? '0'"
              placeholder="0"
              @change="updateCardStyle('padding', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <!-- Text Align -->
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Text Align</label>
          <div class="flex gap-1">
            <button
              v-for="align in (['left', 'center', 'right'] as const)"
              :key="align"
              class="p-1.5 rounded border transition-colors"
              :class="(cardStyle.text_align ?? 'left') === align ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'"
              @click="updateCardStyle('text_align', align)"
            >
              <component :is="align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight" class="size-3.5" />
            </button>
          </div>
        </div>
      </section>

      <!-- Hero Controls -->
      <section v-if="pattern === 'hero'" class="space-y-3">
        <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hero Settings</h4>

        <div class="grid grid-cols-2 gap-3">
          <!-- Heading Size -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Heading Size</label>
            <select
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="internal.heading_size ?? '4xl'"
              @change="patch({ heading_size: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="s in ['xl', '2xl', '3xl', '4xl', '5xl', '6xl']" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>

          <!-- Heading Weight -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Heading Weight</label>
            <select
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="internal.heading_weight ?? 'bold'"
              @change="patch({ heading_weight: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="w in ['light', 'normal', 'medium', 'semibold', 'bold', 'extrabold']" :key="w" :value="w">{{ w }}</option>
            </select>
          </div>

          <!-- Text Color -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Text Color</label>
            <div class="flex items-center gap-2">
              <div
                class="size-5 rounded-full border shrink-0"
                :style="{ backgroundColor: internal.text_color || '#ffffff' }"
              />
              <input
                type="text"
                class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                :value="internal.text_color ?? '#ffffff'"
                placeholder="#ffffff"
                @change="patch({ text_color: ($event.target as HTMLInputElement).value })"
              />
            </div>
          </div>

          <!-- Overlay Position -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Overlay Position</label>
            <select
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="internal.overlay_position ?? 'bottom-left'"
              @change="patch({ overlay_position: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="p in ['top-left', 'top-center', 'bottom-left', 'bottom-center', 'center']" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>

          <!-- Min Height -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Min Height</label>
            <select
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="internal.min_height ?? '75vh'"
              @change="patch({ min_height: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="h in ['50vh', '75vh', '100vh']" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
        </div>

        <!-- Text Align -->
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Text Align</label>
          <div class="flex gap-1">
            <button
              v-for="align in (['left', 'center', 'right'] as const)"
              :key="align"
              class="p-1.5 rounded border transition-colors"
              :class="(internal.text_align ?? 'left') === align ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'"
              @click="patch({ text_align: align })"
            >
              <component :is="align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight" class="size-3.5" />
            </button>
          </div>
        </div>
      </section>

      <!-- Split-Content Controls -->
      <section v-if="pattern === 'split-content'" class="space-y-3">
        <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Split Content</h4>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Image Position</label>
          <div class="flex gap-1">
            <button
              v-for="pos in (['left', 'right'] as const)"
              :key="pos"
              class="px-3 py-1 text-xs rounded border transition-colors capitalize"
              :class="(internal.image_position ?? internal.layout ?? 'left') === pos ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'"
              @click="patch({ image_position: pos, layout: pos })"
            >
              {{ pos }}
            </button>
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">
            Gap: {{ sectionStyle.gap ?? 24 }}px
          </label>
          <input
            type="range"
            min="0"
            max="48"
            :value="sectionStyle.gap ?? 24"
            class="w-full accent-primary"
            @input="updateSectionStyle('gap', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </section>

      <!-- Section Style (all patterns) -->
      <section class="space-y-3">
        <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Section Style</h4>
        <div class="grid grid-cols-2 gap-3">
          <!-- Background -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Background</label>
            <div class="flex items-center gap-2">
              <div
                class="size-5 rounded-full border shrink-0"
                :style="{ backgroundColor: sectionStyle.background || '#ffffff' }"
              />
              <input
                type="text"
                class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                :value="sectionStyle.background ?? '#ffffff'"
                placeholder="#ffffff"
                @change="updateSectionStyle('background', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>

          <!-- Max Width -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Max Width</label>
            <input
              type="text"
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="sectionStyle.max_width ?? ''"
              placeholder="e.g. 1440px"
              @change="updateSectionStyle('max_width', ($event.target as HTMLInputElement).value)"
            />
          </div>

          <!-- Padding Y -->
          <div class="col-span-2">
            <label class="text-xs text-muted-foreground mb-1 block">
              Padding Y: {{ sectionStyle.padding_y ?? 64 }}px
            </label>
            <input
              type="range"
              min="0"
              max="120"
              :value="sectionStyle.padding_y ?? 64"
              class="w-full accent-primary"
              @input="updateSectionStyle('padding_y', Number(($event.target as HTMLInputElement).value))"
            />
          </div>
        </div>
      </section>

      <!-- Typography (all patterns) -->
      <section class="space-y-3">
        <h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Typography</h4>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Title Size</label>
            <select
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="typography.title_size ?? 'xl'"
              @change="updateTypography('title_size', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="s in ['sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Title Weight</label>
            <select
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="typography.title_weight ?? 'semibold'"
              @change="updateTypography('title_weight', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="w in ['normal', 'medium', 'semibold', 'bold', 'extrabold']" :key="w" :value="w">{{ w }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Body Size</label>
            <select
              class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :value="typography.body_size ?? 'base'"
              @change="updateTypography('body_size', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="s in ['xs', 'sm', 'base', 'lg']" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Raw JSON (collapsible) -->
      <section class="space-y-2">
        <button
          class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
          @click="showRawJson = !showRawJson"
        >
          <component :is="showRawJson ? ChevronDown : ChevronRight" class="size-3.5" />
          <Code2 class="size-3.5" />
          Raw JSON
        </button>
        <div v-if="showRawJson">
          <textarea
            class="w-full h-48 rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            :class="{ 'border-destructive ring-1 ring-destructive': !rawJsonValid }"
            :value="rawJsonText"
            @input="onRawJsonInput"
          />
          <p v-if="!rawJsonValid" class="text-xs text-destructive mt-1">Invalid JSON</p>
        </div>
      </section>
    </div>

    <!-- ════════ RIGHT: Live Preview ════════ -->
    <div class="col-span-2 border rounded-lg overflow-hidden bg-muted/30 flex flex-col">
      <div class="px-3 py-2 border-b bg-muted/50 flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Eye class="size-3" /> Preview
        </span>
        <select
          v-model="previewOemId"
          class="text-[11px] bg-transparent border rounded px-1.5 py-0.5 text-muted-foreground"
        >
          <option value="">Current OEM</option>
          <option v-for="oem in previewOems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </option>
        </select>
      </div>

      <!-- Card Grid Preview -->
      <div
        v-if="pattern === 'card-grid'"
        class="flex-1 p-4 overflow-auto"
        :style="{
          backgroundColor: sectionStyle.background || '#f9fafb',
          paddingTop: (sectionStyle.padding_y ?? 64) / 4 + 'px',
          paddingBottom: (sectionStyle.padding_y ?? 64) / 4 + 'px',
        }"
      >
        <div
          class="grid"
          :style="{
            gridTemplateColumns: `repeat(${previewColumns}, 1fr)`,
            gap: (cardStyle.gap ?? 16) / 2 + 'px',
            maxWidth: sectionStyle.max_width || undefined,
            margin: sectionStyle.max_width ? '0 auto' : undefined,
          }"
        >
          <div
            v-for="i in Math.min(previewColumns, 4)"
            :key="i"
            class="flex flex-col overflow-hidden"
            :style="{
              backgroundColor: cardStyle.background || '#fff',
              border: cardStyle.border || 'none',
              boxShadow: cardStyle.shadow || 'none',
              textAlign: cardStyle.text_align || 'left',
              borderRadius: (cardStyle.border_radius ?? 8) + 'px',
              padding: cardStyle.padding || '0',
              gap: (cardStyle.gap ?? 16) / 4 + 'px',
            }"
          >
            <template v-for="slot in composition" :key="slot">
              <div
                v-if="slot === 'image'"
                class="w-full aspect-video bg-muted rounded-t"
              />
              <div
                v-else-if="slot === 'icon'"
                class="size-6 bg-muted rounded-full"
                :style="{ margin: cardStyle.text_align === 'center' ? '0 auto' : undefined }"
              />
              <div
                v-else-if="slot === 'title'"
                class="text-[11px] font-semibold truncate px-2"
                :style="{
                  fontSize: typography.title_size ? undefined : '11px',
                  fontWeight: typography.title_weight || 'semibold',
                }"
              >
                Card Title
              </div>
              <div
                v-else-if="slot === 'subtitle'"
                class="text-[9px] text-muted-foreground px-2"
              >
                Subtitle text
              </div>
              <div
                v-else-if="slot === 'body'"
                class="text-[9px] text-muted-foreground px-2"
              >
                Card body text preview...
              </div>
              <div
                v-else-if="slot === 'badge'"
                class="px-2"
              >
                <span
                  class="inline-block text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
                  :style="{ color: brandPrimary || undefined, backgroundColor: brandPrimary ? brandPrimary + '1a' : undefined }"
                >
                  Badge
                </span>
              </div>
              <div
                v-else-if="slot === 'stat'"
                class="text-[14px] font-bold px-2"
                :style="{ color: brandPrimary || undefined }"
              >
                1,234
              </div>
              <div
                v-else-if="slot === 'rating'"
                class="text-[10px] px-2"
              >
                <span class="text-amber-500">&#9733;&#9733;&#9733;&#9733;</span><span class="text-muted-foreground">&#9733;</span>
              </div>
              <div
                v-else-if="slot === 'cta'"
                class="text-[10px] font-medium px-2 pb-2"
                :style="{ color: brandPrimary || 'hsl(var(--primary))' }"
              >
                Learn More &rarr;
              </div>
              <div
                v-else-if="slot === 'logo'"
                class="size-8 bg-muted rounded"
                :style="{ margin: cardStyle.text_align === 'center' ? '4px auto' : '4px 0' }"
              />
            </template>
          </div>
        </div>
      </div>

      <!-- Hero Preview -->
      <div
        v-else-if="pattern === 'hero'"
        class="flex-1 relative bg-gradient-to-br from-zinc-700 to-zinc-900 overflow-hidden"
        :style="{ minHeight: '200px' }"
      >
        <div
          class="absolute p-4"
          :style="overlayPositionStyles"
        >
          <div
            :style="{
              color: internal.text_color || '#ffffff',
              fontWeight: internal.heading_weight || 'bold',
              fontSize: { xl: '16px', '2xl': '18px', '3xl': '22px', '4xl': '26px', '5xl': '32px', '6xl': '40px' }[internal.heading_size as string] || '26px',
            }"
          >
            Hero Heading
          </div>
          <div
            class="mt-1"
            :style="{ color: internal.text_color || '#ffffff', opacity: 0.7, fontSize: '11px' }"
          >
            Sub heading text goes here
          </div>
        </div>
      </div>

      <!-- Split Content Preview -->
      <div
        v-else-if="pattern === 'split-content'"
        class="flex-1 p-4 overflow-auto"
        :style="{ backgroundColor: sectionStyle.background || '#f9fafb' }"
      >
        <div
          class="flex gap-3 h-full min-h-[160px]"
          :style="{ flexDirection: (internal.image_position ?? internal.layout ?? 'left') === 'right' ? 'row' : 'row-reverse' }"
        >
          <div class="flex-1 flex flex-col justify-center gap-2 p-3">
            <div class="text-sm font-semibold">Section Title</div>
            <div class="text-[10px] text-muted-foreground leading-relaxed">
              Content text preview. This section supports rich text, images, and call-to-action buttons alongside a featured image.
            </div>
            <div
              class="text-[10px] font-medium mt-1"
              :style="{ color: brandPrimary || 'hsl(var(--primary))' }"
            >
              Learn More &rarr;
            </div>
          </div>
          <div class="flex-1 bg-muted rounded-lg" />
        </div>
      </div>

      <!-- Generic Preview (other patterns) -->
      <div
        v-else
        class="flex-1 p-4 flex items-center justify-center"
        :style="{
          backgroundColor: sectionStyle.background || '#f9fafb',
          paddingTop: (sectionStyle.padding_y ?? 64) / 4 + 'px',
          paddingBottom: (sectionStyle.padding_y ?? 64) / 4 + 'px',
        }"
      >
        <div class="text-center space-y-2">
          <div class="text-xs font-medium text-muted-foreground">{{ pattern }}</div>
          <div
            class="border rounded-lg p-6 bg-background"
            :style="{ maxWidth: sectionStyle.max_width || '400px' }"
          >
            <div class="text-sm font-semibold mb-1">Section Content</div>
            <div class="text-[10px] text-muted-foreground">
              Preview for {{ pattern }} pattern with current style settings
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
