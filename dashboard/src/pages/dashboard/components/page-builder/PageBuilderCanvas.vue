<script lang="ts" setup>
import { AlertCircle, ChevronLeft, ChevronRight, Copy, EyeOff, GripVertical, Image, Link, Monitor, Palette, Pipette, Play, Ruler, Settings, Smartphone, Tablet, Trash2, Wand2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { PageMode } from '../../page-builder/page-modes'

import CloneStudioCanvas from './CloneStudioCanvas.vue'
import EditToolbar from './EditToolbar.vue'
import { type RegionAction, type RegionActionId, buildPatchPayload, getRegionActions } from './region-actions'
import { resolveSectionComponent } from './section-registry'

const props = defineProps<{
  page: any
  sections: any[]
  selectedSectionId: string | null
  activeMode: PageMode
  selectedCloneRegionId: string | null
  isCloned: boolean
  isStructured: boolean
  workerBase: string
  oemId?: string
  modelSlug?: string
  readOnly?: boolean
  // Full-screen preview: let the desktop clone frame scale up to fill the window width.
  fitWidth?: boolean
  // Full-screen preview only: enables allow-same-origin in the iframe sandbox so timers and
  // permitted clone interactivity run at full speed. Never set this in the editor.
  allowSameOriginSandbox?: boolean
}>()
const emit = defineEmits<{
  selectSection: [id: string]
  openEditor: [id: string]
  moveSection: [fromIndex: number, toIndex: number]
  updateField: [sectionId: string, field: string, value: any]
  duplicateSection: [id: string]
  deleteSection: [id: string]
  selectCloneRegion: [region: any]
  cloneDomUpdated: [html: string]
  regionAction: [payload: { action: RegionActionId, regionId: string }]
}>()
// Responsive preview
const previewWidth = ref<'full' | 'tablet' | 'mobile'>('full')
const previewWidthClass: Record<string, string> = {
  full: 'w-full',
  tablet: 'max-w-[768px] mx-auto',
  mobile: 'max-w-[375px] mx-auto',
}
// Viewport width the cloned OEM page renders at, so its responsive CSS resolves to the intended
// device layout. 'full' uses a desktop width (scaled to fit the panel); tablet/mobile match the
// constrained container so they render at native device width.
const cloneFrameWidth = computed(() => {
  if (previewWidth.value === 'tablet')
    return 768
  if (previewWidth.value === 'mobile')
    return 375
  return 1280
})

const showCloneFrame = computed(() => props.activeMode === 'clone' && props.isCloned)
const showStructuredPreview = computed(() => props.activeMode === 'sections' && props.isStructured && props.sections.length > 0)
const cloneStudioCanvas = ref<InstanceType<typeof CloneStudioCanvas> | null>(null)

function patchCloneField(payload: Record<string, unknown>) {
  if (props.readOnly)
    return
  cloneStudioCanvas.value?.patchField(payload)
}

defineExpose({
  patchCloneField,
})

// ── Clone region context menu ──────────────────────────────────────────────
// Mirrors the section-mode context menu below, but driven by getRegionActions()
// off the emitted region payload and routed through the CloneStudioCanvas relay.
interface CloneMenuRegion { id: string, editable_fields: any, type_hint: any }
interface CloneMenuState {
  x: number
  y: number
  region: CloneMenuRegion
  actions: RegionAction[]
}
const cloneMenu = ref<CloneMenuState | null>(null)
// Sub-popover for actions needing input (URL / alt text / colour / height).
const cloneInput = ref<{ action: RegionActionId, value: string } | null>(null)
const cloneHasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window
// Per-region panel index for tab/carousel switching (default 0).
const clonePanelIndex = ref<Record<string, number>>({})

const cloneMenuGroups = computed<{ group: RegionAction['group'], actions: RegionAction[] }[]>(() => {
  if (!cloneMenu.value)
    return []
  const order: RegionAction['group'][] = ['content', 'layout', 'region']
  return order
    .map(group => ({ group, actions: cloneMenu.value!.actions.filter(a => a.group === group) }))
    .filter(g => g.actions.length > 0)
})

function onCloneContextMenu(menu: { regionId: any, fields: any, typeHint: any, x: number, y: number }) {
  if (props.readOnly)
    return
  const region: CloneMenuRegion = { id: menu.regionId, editable_fields: menu.fields, type_hint: menu.typeHint }
  cloneMenu.value = {
    x: menu.x,
    y: menu.y,
    region,
    actions: getRegionActions(region as any),
  }
  cloneInput.value = null
}

function closeCloneMenu() {
  cloneMenu.value = null
  cloneInput.value = null
}

function openCloneInput(action: RegionActionId, initial = '') {
  cloneInput.value = { action, value: initial }
}

function cloneInputPlaceholder(action: RegionActionId | undefined): string {
  switch (action) {
    case 'replace-image': return 'https://image-url…'
    case 'edit-link': return 'https://…'
    case 'alt-text': return 'Describe the image…'
    case 'height': return 'Height in px (blank to clear)'
    default: return ''
  }
}

function submitCloneInput() {
  const region = cloneMenu.value?.region
  const input = cloneInput.value
  if (!region || !input || props.readOnly) {
    closeCloneMenu()
    return
  }
  const value = input.value.trim()
  if (input.action === 'height') {
    const n = value === '' ? null : Number(value)
    if (n !== null && Number.isNaN(n))
      return
    cloneStudioCanvas.value?.setHeight(region.id, n)
    emit('updateField', region.id, 'height_override', n)
  }
  else {
    const payload = buildPatchPayload(input.action, region as any, value)
    if (payload)
      cloneStudioCanvas.value?.patchField(payload as unknown as Record<string, unknown>)
  }
  closeCloneMenu()
}

function setCloneBgColor(color: string) {
  const region = cloneMenu.value?.region
  if (!region || props.readOnly)
    return
  const payload = buildPatchPayload('background', region as any, color)
  if (payload)
    cloneStudioCanvas.value?.patchField(payload as unknown as Record<string, unknown>)
}

function onCloneBgColorInput(e: Event) {
  setCloneBgColor((e.target as HTMLInputElement).value)
}

async function eyedropCloneBg() {
  if (!('EyeDropper' in window) || !cloneMenu.value)
    return
  try {
    const dropper = new (window as any).EyeDropper()
    const result = await dropper.open()
    if (result?.sRGBHex)
      setCloneBgColor(result.sRGBHex)
  }
  catch { /* cancelled */ }
  closeCloneMenu()
}

function runCloneAction(id: RegionActionId) {
  const region = cloneMenu.value?.region
  if (!region || props.readOnly)
    return
  switch (id) {
    case 'edit-text':
      cloneStudioCanvas.value?.beginEdit(region.id)
      closeCloneMenu()
      break
    case 'replace-image':
      openCloneInput('replace-image')
      break
    case 'edit-link':
      openCloneInput('edit-link')
      break
    case 'alt-text':
      openCloneInput('alt-text')
      break
    case 'height':
      openCloneInput('height')
      break
    case 'background':
      // Inline colour picker rendered in the menu — toggle the input row.
      openCloneInput('background')
      break
    case 'hide': {
      const payload = buildPatchPayload('hide', region as any)
      if (payload)
        cloneStudioCanvas.value?.patchField(payload as unknown as Record<string, unknown>)
      closeCloneMenu()
      break
    }
    case 'next-panel':
    case 'prev-panel': {
      const current = clonePanelIndex.value[region.id] ?? 0
      const next = id === 'next-panel' ? current + 1 : Math.max(0, current - 1)
      clonePanelIndex.value = { ...clonePanelIndex.value, [region.id]: next }
      cloneStudioCanvas.value?.switchPanel(region.id, next)
      closeCloneMenu()
      break
    }
    case 'convert':
    case 'duplicate':
    case 'delete':
      // Parent (Task 9) owns destructive / structural region operations.
      emit('regionAction', { action: id, regionId: region.id })
      closeCloneMenu()
      break
    default:
      closeCloneMenu()
  }
}

// Preview animation on a section
async function previewAnimation(sectionId: string, animation: string) {
  const el = document.querySelector(`[data-section-id="${sectionId}"]`) as HTMLElement
  if (!el || !animation || animation === 'none')
    return
  const { gsap } = await import('gsap')
  // Reset then play
  gsap.set(el, { opacity: 1, x: 0, y: 0, scale: 1 })
  const presets: Record<string, any> = {
    'fade-up': { from: { opacity: 0, y: 40 }, to: { opacity: 1, y: 0 } },
    'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
    'slide-left': { from: { opacity: 0, x: -60 }, to: { opacity: 1, x: 0 } },
    'slide-right': { from: { opacity: 0, x: 60 }, to: { opacity: 1, x: 0 } },
    'scale-in': { from: { opacity: 0, scale: 0.9 }, to: { opacity: 1, scale: 1 } },
  }
  const preset = presets[animation]
  if (preset) {
    gsap.fromTo(el, preset.from, { ...preset.to, duration: 0.7, ease: 'power2.out' })
  }
  else if (animation === 'stagger-children') {
    gsap.fromTo(el.children, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' })
  }
}

// Context menu state
const contextMenu = ref<{ x: number, y: number, sectionId: string, sectionIndex: number } | null>(null)
const bgColorInput = ref(false)
const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

function onContextMenu(e: MouseEvent, sectionId: string, index: number) {
  if (props.readOnly)
    return
  e.preventDefault()
  contextMenu.value = { x: e.clientX, y: e.clientY, sectionId, sectionIndex: index }
  bgColorInput.value = false
}

function closeContextMenu() {
  contextMenu.value = null
  bgColorInput.value = false
}

function setBgColor(sectionId: string, color: string) {
  if (props.readOnly)
    return
  emit('updateField', sectionId, 'background', color)
  emit('updateField', sectionId, 'background_color', color)
}

function onBgColorInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (contextMenu.value?.sectionId)
    setBgColor(contextMenu.value.sectionId, val)
}

async function eyedropBg(sectionId: string) {
  if (!('EyeDropper' in window))
    return
  closeContextMenu()
  try {
    const dropper = new (window as any).EyeDropper()
    const result = await dropper.open()
    if (result?.sRGBHex)
      setBgColor(sectionId, result.sRGBHex)
  }
  catch { /* cancelled */ }
}

// Inline editing state
const editingTarget = ref<HTMLElement | null>(null)
const editingSectionId = ref<string | null>(null)
const editingField = ref<string | null>(null)
const editingSection = ref<any>(null)

function onInlineEdit(sectionId: string, field: string, value: string) {
  editingTarget.value = null
  editingSectionId.value = null
  editingField.value = null
  editingSection.value = null
  if (props.readOnly)
    return
  emit('updateField', sectionId, field, value)
}

// Link editor popover for captured HTML blocks
const linkEditor = ref<{ show: boolean, el: HTMLAnchorElement | null, href: string, sectionId: string, x: number, y: number }>({
  show: false,
  el: null,
  href: '',
  sectionId: '',
  x: 0,
  y: 0,
})

function onCapturedClick(e: MouseEvent, sectionId: string) {
  if (props.readOnly)
    return
  const link = (e.target as HTMLElement).closest?.('a')
  if (link) {
    e.preventDefault()
    const rect = link.getBoundingClientRect()
    linkEditor.value = {
      show: true,
      el: link as HTMLAnchorElement,
      href: link.getAttribute('href') || '',
      sectionId,
      x: rect.left,
      y: rect.bottom + 4,
    }
  }
  else {
    linkEditor.value.show = false
  }
}

function saveLinkHref() {
  if (props.readOnly) {
    linkEditor.value.show = false
    return
  }
  if (linkEditor.value.el) {
    linkEditor.value.el.setAttribute('href', linkEditor.value.href)
    // Save the updated HTML back to section
    const container = linkEditor.value.el.closest('.captured-section') as HTMLElement
    if (container) {
      onInlineEdit(linkEditor.value.sectionId, '_generated_html', container.innerHTML)
    }
  }
  linkEditor.value.show = false
}

function closeLinkEditor() {
  linkEditor.value.show = false
}

function onToolbarUpdate(sectionId: string, field: string, value: any) {
  if (props.readOnly)
    return
  emit('updateField', sectionId, field, value)
}

// Drag-and-drop state
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(e: DragEvent, index: number) {
  if (props.readOnly)
    return
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(e: DragEvent, index: number) {
  if (props.readOnly)
    return
  if (dragIndex.value === null)
    return
  e.preventDefault()
  if (e.dataTransfer)
    e.dataTransfer.dropEffect = 'move'
  dropIndex.value = index
}

function onDragLeave() {
  dropIndex.value = null
}

function onDrop(e: DragEvent, index: number) {
  if (props.readOnly)
    return
  e.preventDefault()
  if (dragIndex.value !== null && dragIndex.value !== index) {
    emit('moveSection', dragIndex.value, index)
  }
  dragIndex.value = null
  dropIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}

function sectionStyle(section: any): Record<string, string> {
  const style: Record<string, string> = {}
  // Spacing
  const s = section.spacing
  if (s) {
    if (s.padding_top)
      style.paddingTop = s.padding_top
    if (s.padding_bottom)
      style.paddingBottom = s.padding_bottom
    if (s.padding_left)
      style.paddingLeft = s.padding_left
    if (s.padding_right)
      style.paddingRight = s.padding_right
    if (s.margin_top)
      style.marginTop = s.margin_top
    if (s.margin_bottom)
      style.marginBottom = s.margin_bottom
  }
  // Text alignment — applies to all text-bearing sections
  if (section.text_align)
    style.textAlign = section.text_align
  // Full-bleed breakout for full-width layouts (use 100% within canvas panel)
  if (section.full_width || section.layout === 'full-width') {
    style.width = '100%'
    style.maxWidth = 'none'
    style.marginLeft = '0'
    style.marginRight = '0'
    style.paddingLeft = '0'
    style.paddingRight = '0'
  }
  // Border radius
  if (section.border_radius)
    style.borderRadius = section.border_radius
  // Overflow hidden when radius is set (clip content to rounded corners)
  if (section.border_radius && section.border_radius !== '0px')
    style.overflow = 'hidden'
  return style
}

</script>

<template>
  <div class="h-full flex flex-col bg-muted/30">
    <!-- Preview mode and responsive controls -->
    <div v-if="showStructuredPreview || showCloneFrame" class="flex items-center justify-between gap-2 py-1.5 px-2 border-b bg-card shrink-0">
      <div class="min-w-0 text-xs font-medium text-muted-foreground">
        {{ readOnly ? 'Preview' : (activeMode === 'clone' ? 'Clone Studio' : 'Section Builder') }}
      </div>

      <div class="flex items-center justify-center gap-1">
        <button
          class="p-1.5 rounded-md transition-colors"
          :class="previewWidth === 'full' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'"
          title="Desktop"
          @click="previewWidth = 'full'"
        >
          <Monitor class="size-3.5" />
        </button>
        <button
          class="p-1.5 rounded-md transition-colors"
          :class="previewWidth === 'tablet' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'"
          title="Tablet (768px)"
          @click="previewWidth = 'tablet'"
        >
          <Tablet class="size-3.5" />
        </button>
        <button
          class="p-1.5 rounded-md transition-colors"
          :class="previewWidth === 'mobile' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'"
          title="Mobile (375px)"
          @click="previewWidth = 'mobile'"
        >
          <Smartphone class="size-3.5" />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <!-- Cloned OEM page in iframe -->
      <template v-if="showCloneFrame">
        <div v-if="!isStructured" class="flex flex-col items-center justify-center py-4 bg-amber-50 dark:bg-amber-950/20 border-b">
          <AlertCircle class="size-5 text-amber-500 mb-1" />
          <p class="text-sm text-amber-700 dark:text-amber-400">
            This page is cloned but not structured. Click <strong>Structure</strong> to extract sections.
          </p>
        </div>
        <div class="h-full min-h-[720px] transition-all duration-300 bg-white" :class="previewWidthClass[previewWidth]">
          <!-- Clone Studio srcdoc preserves the legacy static preview image intent: oem-static-clone-shim .imgdesktop .dsktoponly -->
          <CloneStudioCanvas
            ref="cloneStudioCanvas"
            :page="page"
            :title="page?.name || 'Clone Studio'"
            :base-href="page?.source_url || workerBase"
            :worker-base="workerBase"
            :frame-width="cloneFrameWidth"
            :fit-width="fitWidth && previewWidth === 'full'"
            :editable="!readOnly"
            :allow-same-origin-sandbox="allowSameOriginSandbox"
            :selected-region-id="selectedCloneRegionId"
            @select-region="emit('selectCloneRegion', $event)"
            @dom-updated="!props.readOnly && emit('cloneDomUpdated', $event)"
            @context-menu="onCloneContextMenu"
          />
        </div>

        <!-- Clone region right-click context menu (mirrors the section menu below) -->
        <Teleport v-if="cloneMenu && !props.readOnly" to="body">
          <div class="fixed inset-0 z-[55]" @click="closeCloneMenu" @contextmenu.prevent="closeCloneMenu" />
          <div
            class="fixed z-[56] bg-card border rounded-lg shadow-xl py-1 min-w-[200px]"
            :style="{ left: `${cloneMenu.x}px`, top: `${cloneMenu.y}px` }"
            @keydown.escape="closeCloneMenu"
          >
            <template v-for="(grp, gi) in cloneMenuGroups" :key="grp.group">
              <div v-if="gi > 0" class="h-px bg-border my-1" />
              <template v-for="action in grp.actions" :key="action.id">
                <button
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left"
                  :class="action.id === 'delete' ? 'text-destructive' : ''"
                  @click="runCloneAction(action.id)"
                >
                  <component
                    :is="action.id === 'background' ? Palette : action.id === 'edit-text' ? Settings : action.id === 'replace-image' ? Image : action.id === 'edit-link' ? Link : action.id === 'height' ? Ruler : action.id === 'duplicate' ? Copy : action.id === 'delete' ? Trash2 : action.id === 'convert' ? Wand2 : action.id === 'hide' ? EyeOff : action.id === 'next-panel' ? ChevronRight : action.id === 'prev-panel' ? ChevronLeft : Settings"
                    class="size-3.5"
                    :class="action.id === 'delete' ? '' : 'text-muted-foreground'"
                  />
                  {{ action.label }}
                </button>
                <!-- Inline background colour picker -->
                <div v-if="action.id === 'background' && cloneInput?.action === 'background'" class="px-3 py-2 flex items-center gap-1.5">
                  <input type="color" value="#ffffff" class="size-7 rounded cursor-pointer border-0 p-0" @input="onCloneBgColorInput">
                  <input type="text" placeholder="#000000" class="h-7 w-20 text-xs font-mono px-1.5 border rounded" @change="onCloneBgColorInput">
                  <button v-if="cloneHasEyeDropper" class="p-1 rounded hover:bg-muted" title="Pick from screen" @click="eyedropCloneBg">
                    <Pipette class="size-3.5" />
                  </button>
                </div>
                <!-- Inline text/URL/height input for the active action -->
                <div
                  v-else-if="cloneInput && cloneInput.action === action.id && action.id !== 'background'"
                  class="px-3 py-2 flex items-center gap-1.5"
                >
                  <input
                    v-model="cloneInput.value"
                    :type="action.id === 'height' ? 'number' : action.id === 'alt-text' ? 'text' : 'url'"
                    :placeholder="cloneInputPlaceholder(cloneInput.action)"
                    class="h-7 w-44 px-2 text-xs bg-muted rounded border-0 outline-none focus:ring-2 ring-primary"
                    @keydown.enter="submitCloneInput"
                    @keydown.escape="closeCloneMenu"
                  >
                  <button class="h-7 px-2 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90" @click="submitCloneInput">
                    Apply
                  </button>
                </div>
              </template>
            </template>
          </div>
        </Teleport>
      </template>

      <!-- Structured sections -->
      <template v-else-if="showStructuredPreview">
        <div class="space-y-0 transition-all duration-300" :class="previewWidthClass[previewWidth]">
          <div
            v-for="(section, index) in sections"
            :key="section.id"
            class="relative transition-all group"
            :class="[
              selectedSectionId === section.id
                ? 'ring-2 ring-primary ring-offset-2'
                : 'hover:ring-1 hover:ring-muted-foreground/30 hover:ring-offset-1',
              props.readOnly ? 'cursor-default' : 'cursor-pointer',
              dragIndex === index ? 'opacity-40' : '',
              dropIndex === index && dragIndex !== index ? 'ring-2 ring-blue-500 ring-offset-2' : '',
            ]"
            :data-section-id="section.id"
            :style="sectionStyle(section)"
            :draggable="false"
            @click="emit('selectSection', section.id)"
            @contextmenu="onContextMenu($event, section.id, index)"
            @dragover="onDragOver($event, index)"
            @dragleave="onDragLeave"
            @drop="onDrop($event, index)"
          >
            <!-- Type label + drag handle + edit button overlay on hover -->
            <div
              class="absolute top-2 left-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <div
                v-if="!props.readOnly"
                draggable="true"
                class="bg-black/70 hover:bg-black/90 text-white rounded p-1 cursor-grab active:cursor-grabbing transition-colors"
                title="Drag to reorder"
                @dragstart="onDragStart($event, index)"
                @dragend="onDragEnd"
              >
                <GripVertical class="size-3.5" />
              </div>
              <span class="bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                {{ section.type }}
              </span>
              <template v-if="section.animation && section.animation !== 'none'">
                <span class="bg-purple-600 text-white text-[9px] font-medium px-1.5 py-0.5 rounded">
                  {{ section.animation }}
                </span>
                <button
                  class="bg-purple-600 hover:bg-purple-700 text-white rounded p-1 transition-colors"
                  title="Preview animation"
                  @click.stop="previewAnimation(section.id, section.animation)"
                >
                  <Play class="size-3" />
                </button>
              </template>
              <button
                v-if="!props.readOnly"
                class="bg-black/70 hover:bg-black/90 text-white rounded p-1 transition-colors"
                title="Edit section"
                @click.stop="emit('openEditor', section.id)"
              >
                <Settings class="size-3.5" />
              </button>
            </div>

            <!-- Render captured/cloned HTML — contenteditable for inline text editing -->
            <div
              v-if="section._generated_html"
              class="captured-section cursor-text outline-none focus:ring-2 focus:ring-primary/20 rounded"
              :contenteditable="!props.readOnly"
              spellcheck="false"
              @click="onCapturedClick($event, section.id)"
              @focus="editingTarget = $event.target as HTMLElement; editingSectionId = section.id; editingField = '_generated_html'; editingSection = section"
              @blur="editingTarget = null; editingSectionId = null; editingField = null; editingSection = null; onInlineEdit(section.id, '_generated_html', ($event.target as HTMLElement).innerHTML)"
              v-html="section._generated_html"
            />
            <!-- Otherwise render the standard section component -->
            <component
              :is="resolveSectionComponent(section)"
              v-else-if="resolveSectionComponent(section)"
              :section="section"
              :oem-id="props.oemId"
              :model-slug="props.modelSlug"
              @inline-edit="(field: string, _value: string, el: HTMLElement) => {
                if (props.readOnly)
                  return
                editingTarget = el
                editingSectionId = section.id
                editingField = field
                editingSection = section
              }"
              @update-text="(field: string, value: string) => !props.readOnly && onInlineEdit(section.id, field, value)"
            />
            <div
              v-else
              class="px-6 py-4 bg-muted/30 text-sm text-muted-foreground"
            >
              Unknown section type: {{ section.type }}
            </div>
          </div>
        </div>

        <!-- Inline edit toolbar -->
        <EditToolbar
          v-if="!props.readOnly && editingTarget && editingSectionId && editingField"
          :target="editingTarget"
          :section-id="editingSectionId"
          :field="editingField"
          :font-size="editingSection?.heading_size || editingSection?.sub_heading_size"
          :font-weight="editingSection?.heading_weight || editingSection?.sub_heading_weight"
          :font-family="editingSection?.font_family"
          :text-align="editingSection?.text_align"
          :text-color="editingSection?.text_color"
          @update-field="onToolbarUpdate"
        />

        <!-- Link editor popover for captured HTML blocks -->
        <div
          v-if="!props.readOnly && linkEditor.show"
          class="fixed z-[60] bg-popover border rounded-lg shadow-xl p-2 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-100"
          :style="{ left: `${linkEditor.x}px`, top: `${linkEditor.y}px` }"
        >
          <svg class="size-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
          <input
            v-model="linkEditor.href"
            type="url"
            placeholder="https://..."
            class="h-7 w-64 px-2 text-xs bg-muted rounded border-0 outline-none focus:ring-2 ring-primary"
            @keydown.enter="saveLinkHref"
            @keydown.escape="closeLinkEditor"
          >
          <button class="h-7 px-2 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90" @click="saveLinkHref">
            Save
          </button>
          <button class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" @click="closeLinkEditor">
            ✕
          </button>
        </div>
        <div v-if="!props.readOnly && linkEditor.show" class="fixed inset-0 z-[59]" @click="closeLinkEditor" />

        <!-- Right-click context menu -->
        <Teleport v-if="contextMenu && !props.readOnly" to="body">
          <div class="fixed inset-0 z-[55]" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu" />
          <div
            class="fixed z-[56] bg-card border rounded-lg shadow-xl py-1 min-w-[180px]"
            :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          >
            <button class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" @click="emit('openEditor', contextMenu.sectionId); closeContextMenu()">
              <Settings class="size-3.5 text-muted-foreground" /> Edit Section
            </button>
            <div class="h-px bg-border my-1" />
            <button class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" @click="bgColorInput = !bgColorInput">
              <Palette class="size-3.5 text-muted-foreground" /> Background Color
            </button>
            <div v-if="bgColorInput" class="px-3 py-2 flex items-center gap-1.5">
              <input type="color" value="#ffffff" class="size-7 rounded cursor-pointer border-0 p-0" @input="onBgColorInput">
              <input type="text" placeholder="#000000" class="h-7 w-20 text-xs font-mono px-1.5 border rounded" @change="onBgColorInput">
              <button v-if="hasEyeDropper" class="p-1 rounded hover:bg-muted" title="Pick from screen" @click="eyedropBg(contextMenu.sectionId)">
                <Pipette class="size-3.5" />
              </button>
            </div>
            <div class="h-px bg-border my-1" />
            <button class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" @click="emit('duplicateSection', contextMenu.sectionId); closeContextMenu()">
              <Copy class="size-3.5 text-muted-foreground" /> Duplicate
            </button>
            <button class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left text-destructive" @click="emit('deleteSection', contextMenu.sectionId); closeContextMenu()">
              <Trash2 class="size-3.5" /> Delete
            </button>
          </div>
        </Teleport>
      </template>

      <!-- No content — show workflow guidance -->
      <template v-else>
        <div class="flex flex-col items-center justify-center h-full text-center p-8 max-w-md mx-auto">
          <div class="size-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <AlertCircle class="size-8 text-muted-foreground/40" />
          </div>
          <h3 class="text-base font-semibold mb-2">
            No page content yet
          </h3>
          <p class="text-sm text-muted-foreground mb-6">
            <template v-if="props.readOnly">
              No editable page content is available in read-only mode.
            </template>
            <template v-else>
              Start by cloning the OEM page, or use the <strong>Adaptive Pipeline</strong> to clone, extract, and validate in one step.
            </template>
          </p>
          <div class="space-y-3 text-left w-full">
            <div class="flex items-start gap-3 text-sm">
              <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span class="text-[10px] font-bold text-primary">1</span>
              </div>
              <div>
                <p class="font-medium">
                  Clone
                </p>
                <p class="text-muted-foreground text-xs">
                  Captures the live OEM page with Puppeteer, downloads images to R2
                </p>
              </div>
            </div>
            <div class="flex items-start gap-3 text-sm">
              <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span class="text-[10px] font-bold text-primary">2</span>
              </div>
              <div>
                <p class="font-medium">
                  Structure
                </p>
                <p class="text-muted-foreground text-xs">
                  AI extracts typed sections (hero, gallery, specs, colors) from the cloned HTML
                </p>
              </div>
            </div>
            <div class="flex items-start gap-3 text-sm">
              <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span class="text-[10px] font-bold text-primary">3</span>
              </div>
              <div>
                <p class="font-medium">
                  Refine
                </p>
                <p class="text-muted-foreground text-xs">
                  Reorder, edit, delete, or regenerate individual sections
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
