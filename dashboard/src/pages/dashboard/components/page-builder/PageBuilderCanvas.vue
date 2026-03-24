<script lang="ts" setup>
import { defineAsyncComponent, ref } from 'vue'
import { AlertCircle, Settings, GripVertical } from 'lucide-vue-next'

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
}>()

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
  'hero': defineAsyncComponent(() => import('../sections/SectionHero.vue')),
  'heading': defineAsyncComponent(() => import('../sections/SectionHeading.vue')),
  'intro': defineAsyncComponent(() => import('../sections/SectionIntro.vue')),
  'tabs': defineAsyncComponent(() => import('../sections/SectionTabs.vue')),
  'color-picker': defineAsyncComponent(() => import('../sections/SectionColorPicker.vue')),
  'specs-grid': defineAsyncComponent(() => import('../sections/SectionSpecs.vue')),
  'gallery': defineAsyncComponent(() => import('../sections/SectionGallery.vue')),
  'feature-cards': defineAsyncComponent(() => import('../sections/SectionFeatureCards.vue')),
  'video': defineAsyncComponent(() => import('../sections/SectionVideo.vue')),
  'image': defineAsyncComponent(() => import('../sections/SectionImageBlock.vue')),
  'cta-banner': defineAsyncComponent(() => import('../sections/SectionCta.vue')),
  'content-block': defineAsyncComponent(() => import('../sections/SectionContentBlock.vue')),
  'accordion': defineAsyncComponent(() => import('../sections/SectionAccordion.vue')),
  'enquiry-form': defineAsyncComponent(() => import('../sections/SectionEnquiryForm.vue')),
  'map': defineAsyncComponent(() => import('../sections/SectionMap.vue')),
  'alert': defineAsyncComponent(() => import('../sections/SectionAlert.vue')),
  'divider': defineAsyncComponent(() => import('../sections/SectionDivider.vue')),
  'testimonial': defineAsyncComponent(() => import('../sections/SectionTestimonial.vue')),
  'comparison-table': defineAsyncComponent(() => import('../sections/SectionComparisonTable.vue')),
  'stats': defineAsyncComponent(() => import('../sections/SectionStats.vue')),
  'logo-strip': defineAsyncComponent(() => import('../sections/SectionLogoStrip.vue')),
  'embed': defineAsyncComponent(() => import('../sections/SectionEmbed.vue')),
  'pricing-table': defineAsyncComponent(() => import('../sections/SectionPricingTable.vue')),
  'sticky-bar': defineAsyncComponent(() => import('../sections/SectionStickyBar.vue')),
  'countdown': defineAsyncComponent(() => import('../sections/SectionCountdown.vue')),
  'finance-calculator': defineAsyncComponent(() => import('../sections/SectionFinanceCalculator.vue')),
  'image-showcase': defineAsyncComponent(() => import('../sections/SectionImageShowcase.vue')),
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
  // Full-bleed breakout for full-width layouts
  if (section.full_width || section.layout === 'full-width') {
    style.width = '100vw'
    style.marginLeft = 'calc(-50vw + 50%)'
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
  <div class="h-full overflow-y-auto bg-muted/30">
    <!-- Structured sections -->
    <template v-if="isStructured && sections.length > 0">
      <div class="space-y-0">
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
            v-if="componentMap[section.type]"
            :is="componentMap[section.type]"
            :section="section"
            v-bind="section.type === 'color-picker' ? { oemId: props.oemId, modelSlug: props.modelSlug } : {}"
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
</template>
