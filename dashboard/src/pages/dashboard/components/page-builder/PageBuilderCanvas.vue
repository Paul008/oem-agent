<script lang="ts" setup>
import { defineAsyncComponent, ref, nextTick } from 'vue'
import { AlertCircle, Settings, GripVertical, Monitor, Tablet, Smartphone, Pipette, Copy, Trash2, Palette } from 'lucide-vue-next'
import EditToolbar from './EditToolbar.vue'

// Responsive preview
const previewWidth = ref<'full' | 'tablet' | 'mobile'>('full')
const previewWidthClass: Record<string, string> = {
  full: 'w-full',
  tablet: 'max-w-[768px] mx-auto',
  mobile: 'max-w-[375px] mx-auto',
}

const props = defineProps<{
  page: any
  sections: any[]
  selectedSectionId: string | null
  isCloned: boolean
  isStructured: boolean
  workerBase: string
  oemId?: string
  modelSlug?: string
}>()

const emit = defineEmits<{
  selectSection: [id: string]
  openEditor: [id: string]
  moveSection: [fromIndex: number, toIndex: number]
  updateField: [sectionId: string, field: string, value: any]
  duplicateSection: [id: string]
  deleteSection: [id: string]
}>()

// Context menu state
const contextMenu = ref<{ x: number; y: number; sectionId: string; sectionIndex: number } | null>(null)
const bgColorInput = ref(false)

function onContextMenu(e: MouseEvent, sectionId: string, index: number) {
  e.preventDefault()
  contextMenu.value = { x: e.clientX, y: e.clientY, sectionId, sectionIndex: index }
  bgColorInput.value = false
}

function closeContextMenu() {
  contextMenu.value = null
  bgColorInput.value = false
}

function setBgColor(sectionId: string, color: string) {
  emit('updateField', sectionId, 'background', color)
  emit('updateField', sectionId, 'background_color', color)
}

function onBgColorInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (contextMenu.value?.sectionId) setBgColor(contextMenu.value.sectionId, val)
}

async function eyedropBg(sectionId: string) {
  if (!('EyeDropper' in window)) return
  closeContextMenu()
  try {
    const dropper = new (window as any).EyeDropper()
    const result = await dropper.open()
    if (result?.sRGBHex) setBgColor(sectionId, result.sRGBHex)
  } catch { /* cancelled */ }
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
  emit('updateField', sectionId, field, value)
}

function onToolbarUpdate(sectionId: string, field: string, value: any) {
  emit('updateField', sectionId, field, value)
}

// Drag-and-drop state
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(e: DragEvent, index: number) {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(e: DragEvent, index: number) {
  if (dragIndex.value === null) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropIndex.value = index
}

function onDragLeave() {
  dropIndex.value = null
}

function onDrop(e: DragEvent, index: number) {
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

const componentMap: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  // Use standalone components with inline editing support (not consolidated renderers)
  'hero': defineAsyncComponent(() => import('../sections/SectionHero.vue')),
  'cta-banner': defineAsyncComponent(() => import('../sections/SectionCta.vue')),
  'countdown': defineAsyncComponent(() => import('../sections/SectionHero.vue')),
  'intro': defineAsyncComponent(() => import('../sections/SectionIntro.vue')),
  'content-block': defineAsyncComponent(() => import('../sections/SectionContentBlock.vue')),
  'split-content': defineAsyncComponent(() => import('../sections/SectionSplitContent.vue')),
  'gallery': defineAsyncComponent(() => import('../sections/SectionGallery.vue')),
  'video': defineAsyncComponent(() => import('../sections/SectionVideo.vue')),
  'image': defineAsyncComponent(() => import('../sections/SectionImageBlock.vue')),
  'image-showcase': defineAsyncComponent(() => import('../sections/SectionImageShowcase.vue')),
  'embed': defineAsyncComponent(() => import('../sections/SectionEmbed.vue')),
  'media': defineAsyncComponent(() => import('../sections/SectionMedia.vue')),
  'card-grid': defineAsyncComponent(() => import('../sections/SectionCardGrid.vue')),
  'heading': defineAsyncComponent(() => import('../sections/SectionHeading.vue')),
  'tabs': defineAsyncComponent(() => import('../sections/SectionTabs.vue')),
  'color-picker': defineAsyncComponent(() => import('../sections/SectionColorPicker.vue')),
  'specs-grid': defineAsyncComponent(() => import('../sections/SectionSpecs.vue')),
  'feature-cards': defineAsyncComponent(() => import('../sections/SectionFeatureCards.vue')),
  'accordion': defineAsyncComponent(() => import('../sections/SectionAccordion.vue')),
  'enquiry-form': defineAsyncComponent(() => import('../sections/SectionEnquiryForm.vue')),
  'map': defineAsyncComponent(() => import('../sections/SectionMap.vue')),
  'alert': defineAsyncComponent(() => import('../sections/SectionAlert.vue')),
  'divider': defineAsyncComponent(() => import('../sections/SectionDivider.vue')),
  'testimonial': defineAsyncComponent(() => import('../sections/SectionTestimonial.vue')),
  'comparison-table': defineAsyncComponent(() => import('../sections/SectionComparisonTable.vue')),
  'stats': defineAsyncComponent(() => import('../sections/SectionStats.vue')),
  'logo-strip': defineAsyncComponent(() => import('../sections/SectionLogoStrip.vue')),
  'pricing-table': defineAsyncComponent(() => import('../sections/SectionPricingTable.vue')),
  'sticky-bar': defineAsyncComponent(() => import('../sections/SectionStickyBar.vue')),
  'finance-calculator': defineAsyncComponent(() => import('../sections/SectionFinanceCalculator.vue')),
}

function resolveComponent(section: any) {
  if (Array.isArray(section.card_composition) && section.card_composition.length > 0) {
    return componentMap['card-grid']
  }
  return componentMap[section.type]
}

function sectionStyle(section: any): Record<string, string> {
  const style: Record<string, string> = {}
  // Spacing
  const s = section.spacing
  if (s) {
    if (s.padding_top) style.paddingTop = s.padding_top
    if (s.padding_bottom) style.paddingBottom = s.padding_bottom
    if (s.padding_left) style.paddingLeft = s.padding_left
    if (s.padding_right) style.paddingRight = s.padding_right
    if (s.margin_top) style.marginTop = s.margin_top
    if (s.margin_bottom) style.marginBottom = s.margin_bottom
  }
  // Text alignment — applies to all text-bearing sections
  if (section.text_align) style.textAlign = section.text_align
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
  if (section.border_radius) style.borderRadius = section.border_radius
  // Overflow hidden when radius is set (clip content to rounded corners)
  if (section.border_radius && section.border_radius !== '0px') style.overflow = 'hidden'
  return style
}

// Legacy compat — kept for reference but replaced by sectionStyle
function sectionSpacingStyle(section: any): Record<string, string> {
  const s = section.spacing
  if (!s) return {}
  const style: Record<string, string> = {}
  if (s.padding_top) style.paddingTop = s.padding_top
  if (s.padding_bottom) style.paddingBottom = s.padding_bottom
  if (s.padding_left) style.paddingLeft = s.padding_left
  if (s.padding_right) style.paddingRight = s.padding_right
  if (s.margin_top) style.marginTop = s.margin_top
  if (s.margin_bottom) style.marginBottom = s.margin_bottom
  return style
}

function oemName(id: string) {
  return id.replace(/-au$/, '').replace(/^\w/, c => c.toUpperCase())
}

function buildStandaloneHtml(p: any): string {
  let rendered = p.content?.rendered || ''
  const headParts: string[] = []

  rendered = rendered.replace(/<link\s[^>]*>/gi, (m: string) => {
    headParts.push(m)
    return ''
  })
  rendered = rendered.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m: string) => {
    headParts.push(m)
    return ''
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${props.workerBase}">
<title>${p.name} — ${oemName(p.oem_id)}</title>
${headParts.join('\n')}
</head>
<body style="margin:0;padding:0;background:#fff;">
${rendered}
</body>
</html>`
}
</script>

<template>
  <div class="h-full flex flex-col bg-muted/30">
    <!-- Responsive preview toggle -->
    <div v-if="isStructured && sections.length > 0" class="flex items-center justify-center gap-1 py-1.5 border-b bg-card shrink-0">
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

    <div class="flex-1 overflow-y-auto">
    <!-- Structured sections -->
    <template v-if="isStructured && sections.length > 0">
      <div class="space-y-0 transition-all duration-300" :class="previewWidthClass[previewWidth]">
        <div
          v-for="(section, index) in sections"
          :key="section.id"
          class="relative cursor-pointer transition-all group"
          :class="[
            selectedSectionId === section.id
              ? 'ring-2 ring-primary ring-offset-2'
              : 'hover:ring-1 hover:ring-muted-foreground/30 hover:ring-offset-1',
            dragIndex === index ? 'opacity-40' : '',
            dropIndex === index && dragIndex !== index ? 'ring-2 ring-blue-500 ring-offset-2' : '',
          ]"
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
            <span v-if="section.animation && section.animation !== 'none'" class="bg-purple-600 text-white text-[9px] font-medium px-1.5 py-0.5 rounded">
              {{ section.animation }}
            </span>
            <button
              class="bg-black/70 hover:bg-black/90 text-white rounded p-1 transition-colors"
              title="Edit section"
              @click.stop="emit('openEditor', section.id)"
            >
              <Settings class="size-3.5" />
            </button>
          </div>

          <!-- Render the actual section component -->
          <component
            v-if="resolveComponent(section)"
            :is="resolveComponent(section)"
            :section="section"
            :oem-id="props.oemId"
            :model-slug="props.modelSlug"
            @inline-edit="(field: string, value: string, el: HTMLElement) => {
              editingTarget = el
              editingSectionId = section.id
              editingField = field
              editingSection = section
            }"
            @update-text="(field: string, value: string) => onInlineEdit(section.id, field, value)"
          />
          <div
            v-else
            class="px-6 py-4 bg-muted/30 text-sm text-muted-foreground"
          >
            Unknown section type: {{ section.type }}
          </div>
        </div>
      </div>
    </template>

    <!-- Inline edit toolbar -->
    <EditToolbar
      v-if="editingTarget && editingSectionId && editingField"
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

    <!-- Right-click context menu -->
    <Teleport v-if="contextMenu" to="body">
      <div class="fixed inset-0 z-[55]" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu" />
      <div
        class="fixed z-[56] bg-card border rounded-lg shadow-xl py-1 min-w-[180px]"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <button class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" @click="emit('openEditor', contextMenu.sectionId); closeContextMenu()">
          <Settings class="size-3.5 text-muted-foreground" /> Edit Section
        </button>
        <div class="h-px bg-border my-1" />
        <button class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left" @click="bgColorInput = !bgColorInput">
          <Palette class="size-3.5 text-muted-foreground" /> Background Color
        </button>
        <div v-if="bgColorInput" class="px-3 py-2 flex items-center gap-1.5">
          <input type="color" value="#ffffff" class="size-7 rounded cursor-pointer border-0 p-0" @input="onBgColorInput" />
          <input type="text" placeholder="#000000" class="h-7 w-20 text-xs font-mono px-1.5 border rounded" @change="onBgColorInput" />
          <button v-if="'EyeDropper' in window" class="p-1 rounded hover:bg-muted" title="Pick from screen" @click="eyedropBg(contextMenu.sectionId)">
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

    <!-- Cloned page in iframe (not yet structured) -->
    <template v-else-if="isCloned && page?.content?.rendered">
      <div class="flex flex-col items-center justify-center py-4 bg-amber-50 dark:bg-amber-950/20 border-b">
        <AlertCircle class="size-5 text-amber-500 mb-1" />
        <p class="text-sm text-amber-700 dark:text-amber-400">
          This page is cloned but not structured. Click <strong>Structure</strong> to extract sections.
        </p>
      </div>
      <iframe
        :srcdoc="buildStandaloneHtml(page)"
        class="w-full border-0"
        style="height: calc(100% - 64px);"
        sandbox="allow-same-origin allow-scripts allow-popups allow-presentation"
      />
    </template>

    <!-- No content — show workflow guidance -->
    <template v-else>
      <div class="flex flex-col items-center justify-center h-full text-center p-8 max-w-md mx-auto">
        <div class="size-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <AlertCircle class="size-8 text-muted-foreground/40" />
        </div>
        <h3 class="text-base font-semibold mb-2">No page content yet</h3>
        <p class="text-sm text-muted-foreground mb-6">
          Start by cloning the OEM page, or use the <strong>Adaptive Pipeline</strong> to clone, extract, and validate in one step.
        </p>
        <div class="space-y-3 text-left w-full">
          <div class="flex items-start gap-3 text-sm">
            <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span class="text-[10px] font-bold text-primary">1</span>
            </div>
            <div>
              <p class="font-medium">Clone</p>
              <p class="text-muted-foreground text-xs">Captures the live OEM page with Puppeteer, downloads images to R2</p>
            </div>
          </div>
          <div class="flex items-start gap-3 text-sm">
            <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span class="text-[10px] font-bold text-primary">2</span>
            </div>
            <div>
              <p class="font-medium">Structure</p>
              <p class="text-muted-foreground text-xs">AI extracts typed sections (hero, gallery, specs, colors) from the cloned HTML</p>
            </div>
          </div>
          <div class="flex items-start gap-3 text-sm">
            <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span class="text-[10px] font-bold text-primary">3</span>
            </div>
            <div>
              <p class="font-medium">Refine</p>
              <p class="text-muted-foreground text-xs">Reorder, edit, delete, or regenerate individual sections</p>
            </div>
          </div>
        </div>
      </div>
    </template>
    </div>
  </div>
</template>
