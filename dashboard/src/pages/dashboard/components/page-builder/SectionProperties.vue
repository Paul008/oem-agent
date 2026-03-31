<script lang="ts" setup>
import { computed, ref } from 'vue'
import { RefreshCw, Trash2, Loader2, Plus, X, ImageOff, ImageIcon, ArrowRightLeft, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-vue-next'
import MediaUploadButton from './MediaUploadButton.vue'
import MediaLibraryDialog from './MediaLibraryDialog.vue'
import { getConvertibleTypes } from './section-converter'
import { SECTION_TYPE_INFO, type PageSectionType } from './section-templates'

const brokenImages = ref(new Set<string>())
function onImgError(url: string) {
  brokenImages.value.add(url)
}

const props = defineProps<{
  section: any
  regenerating: boolean
  oemId: string
  modelSlug: string
}>()

const emit = defineEmits<{
  regenerate: []
  delete: []
  convert: [targetType: string]
  'update:section': [updates: Record<string, any>]
}>()

const convertibleTypes = computed(() => {
  return getConvertibleTypes(props.section?.type as PageSectionType)
})

function update(key: string, value: any) {
  emit('update:section', { [key]: value })
}

function updateNested(arrayKey: string, index: number, field: string, value: any) {
  const arr = [...(props.section[arrayKey] || [])]
  arr[index] = { ...arr[index], [field]: value }
  emit('update:section', { [arrayKey]: arr })
}

function addArrayItem(arrayKey: string, template: Record<string, any>) {
  const arr = [...(props.section[arrayKey] || []), template]
  emit('update:section', { [arrayKey]: arr })
}

function removeArrayItem(arrayKey: string, index: number) {
  const arr = [...(props.section[arrayKey] || [])]
  arr.splice(index, 1)
  emit('update:section', { [arrayKey]: arr })
}

function onMediaUploaded(key: string, url: string) {
  update(key, url)
}

function onNestedMediaUploaded(arrayKey: string, index: number, field: string, url: string) {
  updateNested(arrayKey, index, field, url)
}

const sectionType = computed(() => props.section?.type)

const showMediaLibrary = ref(false)
const mediaLibraryCallback = ref<((url: string) => void) | null>(null)

function openMediaLibrary(callback: (url: string) => void) {
  mediaLibraryCallback.value = callback
  showMediaLibrary.value = true
}

function onMediaLibrarySelect(url: string) {
  mediaLibraryCallback.value?.(url)
  mediaLibraryCallback.value = null
}
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-sm font-semibold">Section Editor</h3>

    <!-- Type & ID (read-only) -->
    <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      <span class="text-muted-foreground">Type</span>
      <span class="font-medium">{{ section.type }}</span>
      <span class="text-muted-foreground">ID</span>
      <span class="font-mono text-[10px] break-all">{{ section.id }}</span>
    </div>

    <UiSeparator />

    <!-- ===== LAYOUT & STYLING (universal) ===== -->
    <details class="group">
      <summary class="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
        <span class="group-open:rotate-90 transition-transform text-[10px]">&#9654;</span>
        Layout & Style
        <span v-if="section.full_width || section.border_radius || section.spacing" class="text-[9px] text-primary">(custom)</span>
      </summary>
      <div class="space-y-3 mt-2">
        <!-- Full Width -->
        <div class="flex items-center gap-2">
          <UiSwitch :checked="!!section.full_width" @update:checked="update('full_width', $event)" />
          <label class="text-xs">Full width (edge-to-edge)</label>
        </div>

        <!-- Font Family -->
        <div>
          <label class="text-[10px] text-muted-foreground mb-1 block">Font Family</label>
          <UiInput :model-value="section.font_family || ''" class="h-8 text-xs" placeholder="e.g. Inter, Roboto" @update:model-value="update('font_family', $event)" />
        </div>

        <!-- Animation -->
        <div>
          <label class="text-[10px] text-muted-foreground mb-1 block">Scroll Animation</label>
          <UiSelect :model-value="section.animation || 'none'" @update:model-value="update('animation', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="none">None</UiSelectItem>
              <UiSelectItem value="fade-up">Fade Up</UiSelectItem>
              <UiSelectItem value="fade-in">Fade In</UiSelectItem>
              <UiSelectItem value="slide-left">Slide from Left</UiSelectItem>
              <UiSelectItem value="slide-right">Slide from Right</UiSelectItem>
              <UiSelectItem value="scale-in">Scale In</UiSelectItem>
              <UiSelectItem value="parallax">Parallax (images)</UiSelectItem>
              <UiSelectItem value="stagger-children">Stagger Children</UiSelectItem>
              <UiSelectItem value="count-up">Count Up (numbers)</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div v-if="section.animation && section.animation !== 'none'" class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] text-muted-foreground mb-1 block">Duration (s)</label>
            <UiInput type="number" :model-value="section.animation_duration ?? 0.7" class="h-8 text-xs" step="0.1" min="0.1" max="3" @update:model-value="update('animation_duration', parseFloat($event) || 0.7)" />
          </div>
          <div>
            <label class="text-[10px] text-muted-foreground mb-1 block">Delay (s)</label>
            <UiInput type="number" :model-value="section.animation_delay ?? 0" class="h-8 text-xs" step="0.1" min="0" max="3" @update:model-value="update('animation_delay', parseFloat($event) || 0)" />
          </div>
        </div>

        <!-- Text Alignment -->
        <div>
          <label class="text-[10px] text-muted-foreground mb-1 block">Text Align</label>
          <div class="flex gap-1">
            <button
              v-for="align in [
                { value: undefined, icon: AlignLeft, label: 'Default' },
                { value: 'left', icon: AlignLeft, label: 'Left' },
                { value: 'center', icon: AlignCenter, label: 'Center' },
                { value: 'right', icon: AlignRight, label: 'Right' },
                { value: 'justify', icon: AlignJustify, label: 'Justify' },
              ]"
              :key="align.label"
              class="p-1.5 rounded border transition-colors"
              :class="(section.text_align || undefined) === align.value
                ? 'bg-primary/10 border-primary text-primary'
                : 'border-border hover:bg-muted text-muted-foreground'"
              :title="align.label"
              @click="update('text_align', align.value)"
            >
              <component :is="align.icon" class="size-3.5" />
            </button>
          </div>
        </div>

        <!-- Border Radius -->
        <div>
          <label class="text-[10px] text-muted-foreground mb-1 block">Border Radius</label>
          <div class="flex items-center gap-2">
            <input
              type="range"
              :value="parseInt(section.border_radius) || 0"
              min="0"
              max="48"
              step="2"
              class="flex-1"
              @input="update('border_radius', ($event.target as HTMLInputElement).value + 'px')"
            />
            <UiInput
              :model-value="section.border_radius || ''"
              class="h-7 text-xs w-20"
              placeholder="0px"
              @update:model-value="update('border_radius', $event || undefined)"
            />
          </div>
          <div class="flex gap-1 mt-1">
            <button v-for="preset in ['0px', '8px', '16px', '24px', '9999px']" :key="preset" class="text-[9px] px-1.5 py-0.5 rounded border hover:bg-muted" :class="section.border_radius === preset ? 'bg-primary/10 border-primary text-primary' : 'border-border'" @click="update('border_radius', preset)">
              {{ preset === '9999px' ? 'Full' : preset }}
            </button>
          </div>
        </div>

        <!-- Spacing -->
        <div class="border-t pt-2">
          <p class="text-[10px] text-muted-foreground mb-1.5 font-medium">Spacing</p>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] text-muted-foreground">Padding Top</label>
              <UiInput :model-value="section.spacing?.padding_top || ''" class="h-7 text-xs" placeholder="0px" @update:model-value="update('spacing', { ...(section.spacing || {}), padding_top: $event || undefined })" />
            </div>
            <div>
              <label class="text-[10px] text-muted-foreground">Padding Bottom</label>
              <UiInput :model-value="section.spacing?.padding_bottom || ''" class="h-7 text-xs" placeholder="0px" @update:model-value="update('spacing', { ...(section.spacing || {}), padding_bottom: $event || undefined })" />
            </div>
            <div>
              <label class="text-[10px] text-muted-foreground">Padding Left</label>
              <UiInput :model-value="section.spacing?.padding_left || ''" class="h-7 text-xs" placeholder="0px" @update:model-value="update('spacing', { ...(section.spacing || {}), padding_left: $event || undefined })" />
            </div>
            <div>
              <label class="text-[10px] text-muted-foreground">Padding Right</label>
              <UiInput :model-value="section.spacing?.padding_right || ''" class="h-7 text-xs" placeholder="0px" @update:model-value="update('spacing', { ...(section.spacing || {}), padding_right: $event || undefined })" />
            </div>
            <div>
              <label class="text-[10px] text-muted-foreground">Margin Top</label>
              <UiInput :model-value="section.spacing?.margin_top || ''" class="h-7 text-xs" placeholder="0px" @update:model-value="update('spacing', { ...(section.spacing || {}), margin_top: $event || undefined })" />
            </div>
            <div>
              <label class="text-[10px] text-muted-foreground">Margin Bottom</label>
              <UiInput :model-value="section.spacing?.margin_bottom || ''" class="h-7 text-xs" placeholder="0px" @update:model-value="update('spacing', { ...(section.spacing || {}), margin_bottom: $event || undefined })" />
            </div>
          </div>
        </div>
      </div>
    </details>

    <UiSeparator />

    <!-- ===== HERO ===== -->
    <template v-if="sectionType === 'hero'">
      <div class="space-y-3">
        <!-- Heading -->
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Heading</label>
          <UiInput :model-value="section.heading || ''" class="h-8 text-xs" @update:model-value="update('heading', $event)" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Heading Size</label>
            <UiSelect :model-value="section.heading_size || '3xl'" @update:model-value="update('heading_size', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="lg">Large</UiSelectItem>
                <UiSelectItem value="xl">XL</UiSelectItem>
                <UiSelectItem value="2xl">2XL</UiSelectItem>
                <UiSelectItem value="3xl">3XL</UiSelectItem>
                <UiSelectItem value="4xl">4XL</UiSelectItem>
                <UiSelectItem value="5xl">5XL</UiSelectItem>
                <UiSelectItem value="6xl">6XL</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Heading Weight</label>
            <UiSelect :model-value="section.heading_weight || 'bold'" @update:model-value="update('heading_weight', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="light">Light</UiSelectItem>
                <UiSelectItem value="normal">Normal</UiSelectItem>
                <UiSelectItem value="medium">Medium</UiSelectItem>
                <UiSelectItem value="semibold">Semibold</UiSelectItem>
                <UiSelectItem value="bold">Bold</UiSelectItem>
                <UiSelectItem value="extrabold">Extra Bold</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
        </div>

        <!-- Sub-heading -->
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Sub-heading</label>
          <UiInput :model-value="section.sub_heading || ''" class="h-8 text-xs" @update:model-value="update('sub_heading', $event)" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Sub Size</label>
            <UiSelect :model-value="section.sub_heading_size || 'lg'" @update:model-value="update('sub_heading_size', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="sm">Small</UiSelectItem>
                <UiSelectItem value="base">Base</UiSelectItem>
                <UiSelectItem value="lg">Large</UiSelectItem>
                <UiSelectItem value="xl">XL</UiSelectItem>
                <UiSelectItem value="2xl">2XL</UiSelectItem>
                <UiSelectItem value="3xl">3XL</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Sub Weight</label>
            <UiSelect :model-value="section.sub_heading_weight || 'normal'" @update:model-value="update('sub_heading_weight', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="light">Light</UiSelectItem>
                <UiSelectItem value="normal">Normal</UiSelectItem>
                <UiSelectItem value="medium">Medium</UiSelectItem>
                <UiSelectItem value="semibold">Semibold</UiSelectItem>
                <UiSelectItem value="bold">Bold</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
        </div>

        <!-- Text Style -->
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Text Align</label>
            <div class="flex gap-0.5">
              <button v-for="align in ['left', 'center', 'right']" :key="align" class="flex-1 h-7 text-[10px] rounded border hover:bg-muted" :class="(section.text_align || 'left') === align ? 'bg-primary/10 border-primary text-primary' : 'border-border'" @click="update('text_align', align)">
                {{ align.charAt(0).toUpperCase() + align.slice(1) }}
              </button>
            </div>
          </div>
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Text Colour</label>
            <div class="flex gap-1 items-center">
              <input type="color" :value="section.text_color || '#ffffff'" class="h-7 w-7 rounded border cursor-pointer" @input="update('text_color', ($event.target as HTMLInputElement).value)" />
              <UiInput :model-value="section.text_color || '#ffffff'" class="h-7 text-xs flex-1" @update:model-value="update('text_color', $event)" />
            </div>
          </div>
        </div>

        <!-- Overlay Position -->
        <div>
          <label class="text-[10px] text-muted-foreground mb-0.5 block">Text Position</label>
          <UiSelect :model-value="section.overlay_position || 'bottom-left'" @update:model-value="update('overlay_position', $event)">
            <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="top-left">Top Left</UiSelectItem>
              <UiSelectItem value="top-center">Top Centre</UiSelectItem>
              <UiSelectItem value="center">Centre</UiSelectItem>
              <UiSelectItem value="bottom-left">Bottom Left</UiSelectItem>
              <UiSelectItem value="bottom-center">Bottom Centre</UiSelectItem>
              <UiSelectItem value="bottom-right">Bottom Right</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>

        <UiSeparator />

        <!-- CTA -->
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">CTA Text</label>
          <UiInput :model-value="section.cta_text || ''" class="h-8 text-xs" @update:model-value="update('cta_text', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">CTA URL</label>
          <UiInput :model-value="section.cta_url || ''" class="h-8 text-xs" @update:model-value="update('cta_url', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Desktop Image</label>
          <div v-if="section.desktop_image_url && !brokenImages.has(section.desktop_image_url)" class="relative rounded overflow-hidden bg-muted mb-1">
            <a :href="section.desktop_image_url" target="_blank" class="block">
              <img :src="section.desktop_image_url" alt="Desktop hero" class="w-full h-20 object-cover" @error="onImgError(section.desktop_image_url)" />
            </a>
          </div>
          <div class="flex gap-1">
            <UiInput :model-value="section.desktop_image_url || ''" class="h-8 text-xs" @update:model-value="update('desktop_image_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onMediaUploaded('desktop_image_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('desktop_image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Mobile Image</label>
          <div v-if="section.mobile_image_url && !brokenImages.has(section.mobile_image_url)" class="relative rounded overflow-hidden bg-muted mb-1">
            <a :href="section.mobile_image_url" target="_blank" class="block">
              <img :src="section.mobile_image_url" alt="Mobile hero" class="w-full h-20 object-cover" @error="onImgError(section.mobile_image_url)" />
            </a>
          </div>
          <div class="flex gap-1">
            <UiInput :model-value="section.mobile_image_url || ''" class="h-8 text-xs" @update:model-value="update('mobile_image_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onMediaUploaded('mobile_image_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('mobile_image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Video URL</label>
          <div class="flex gap-1">
            <UiInput :model-value="section.video_url || ''" class="h-8 text-xs" @update:model-value="update('video_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" accept="video/mp4,video/webm" @uploaded="onMediaUploaded('video_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('video_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>

        <UiSeparator />

        <!-- Image Display Options -->
        <div class="space-y-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" class="rounded" :checked="section.show_overlay !== false" @change="update('show_overlay', ($event.target as HTMLInputElement).checked)" />
            <span class="text-xs">Gradient overlay</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" class="rounded" :checked="section.full_width_image === true" @change="update('full_width_image', ($event.target as HTMLInputElement).checked)" />
            <span class="text-xs">Full-width image (no crop)</span>
          </label>
        </div>
      </div>
    </template>

    <!-- ===== HEADING ===== -->
    <template v-else-if="sectionType === 'heading'">
      <div class="space-y-3">
        <!-- Heading -->
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Heading</label>
          <UiInput :model-value="section.heading || ''" class="h-8 text-xs" @update:model-value="update('heading', $event)" />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Tag</label>
            <UiSelect :model-value="section.heading_tag || 'h2'" @update:model-value="update('heading_tag', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="h1">H1</UiSelectItem>
                <UiSelectItem value="h2">H2</UiSelectItem>
                <UiSelectItem value="h3">H3</UiSelectItem>
                <UiSelectItem value="h4">H4</UiSelectItem>
                <UiSelectItem value="h5">H5</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Size</label>
            <UiSelect :model-value="section.heading_size || '3xl'" @update:model-value="update('heading_size', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="lg">Large</UiSelectItem>
                <UiSelectItem value="xl">XL</UiSelectItem>
                <UiSelectItem value="2xl">2XL</UiSelectItem>
                <UiSelectItem value="3xl">3XL</UiSelectItem>
                <UiSelectItem value="4xl">4XL</UiSelectItem>
                <UiSelectItem value="5xl">5XL</UiSelectItem>
                <UiSelectItem value="6xl">6XL</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Weight</label>
            <UiSelect :model-value="section.heading_weight || 'bold'" @update:model-value="update('heading_weight', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="light">Light</UiSelectItem>
                <UiSelectItem value="normal">Normal</UiSelectItem>
                <UiSelectItem value="medium">Medium</UiSelectItem>
                <UiSelectItem value="semibold">Semibold</UiSelectItem>
                <UiSelectItem value="bold">Bold</UiSelectItem>
                <UiSelectItem value="extrabold">Extra Bold</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
        </div>

        <UiSeparator />

        <!-- Sub-heading -->
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Sub-heading</label>
          <UiInput :model-value="section.sub_heading || ''" class="h-8 text-xs" @update:model-value="update('sub_heading', $event)" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Sub Size</label>
            <UiSelect :model-value="section.sub_heading_size || 'lg'" @update:model-value="update('sub_heading_size', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="sm">Small</UiSelectItem>
                <UiSelectItem value="base">Base</UiSelectItem>
                <UiSelectItem value="lg">Large</UiSelectItem>
                <UiSelectItem value="xl">XL</UiSelectItem>
                <UiSelectItem value="2xl">2XL</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Sub Weight</label>
            <UiSelect :model-value="section.sub_heading_weight || 'normal'" @update:model-value="update('sub_heading_weight', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="light">Light</UiSelectItem>
                <UiSelectItem value="normal">Normal</UiSelectItem>
                <UiSelectItem value="medium">Medium</UiSelectItem>
                <UiSelectItem value="semibold">Semibold</UiSelectItem>
                <UiSelectItem value="bold">Bold</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
        </div>

        <UiSeparator />

        <!-- Layout -->
        <div>
          <label class="text-[10px] text-muted-foreground mb-0.5 block">Text Align</label>
          <div class="flex gap-0.5">
            <button v-for="a in ['left', 'center', 'right']" :key="a" class="flex-1 h-7 text-[10px] rounded border hover:bg-muted" :class="(section.text_align || 'left') === a ? 'bg-primary/10 border-primary text-primary' : 'border-border'" @click="update('text_align', a)">
              {{ a.charAt(0).toUpperCase() + a.slice(1) }}
            </button>
          </div>
        </div>
        <div>
          <label class="text-[10px] text-muted-foreground mb-0.5 block">Line Gap (heading → subheading)</label>
          <UiSelect :model-value="section.line_gap || '8'" @update:model-value="update('line_gap', $event)">
            <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="0">None</UiSelectItem>
              <UiSelectItem value="2">Tight (2px)</UiSelectItem>
              <UiSelectItem value="4">Small (4px)</UiSelectItem>
              <UiSelectItem value="8">Default (8px)</UiSelectItem>
              <UiSelectItem value="12">Medium (12px)</UiSelectItem>
              <UiSelectItem value="16">Large (16px)</UiSelectItem>
              <UiSelectItem value="24">XL (24px)</UiSelectItem>
              <UiSelectItem value="32">2XL (32px)</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Text Colour</label>
            <div class="flex gap-1 items-center">
              <input type="color" :value="section.text_color || '#000000'" class="h-7 w-7 rounded border cursor-pointer" @input="update('text_color', ($event.target as HTMLInputElement).value)" />
              <UiInput :model-value="section.text_color || ''" class="h-7 text-xs flex-1" placeholder="inherit" @update:model-value="update('text_color', $event)" />
            </div>
          </div>
          <div>
            <label class="text-[10px] text-muted-foreground mb-0.5 block">Background</label>
            <div class="flex gap-1 items-center">
              <input type="color" :value="section.background_color || '#ffffff'" class="h-7 w-7 rounded border cursor-pointer" @input="update('background_color', ($event.target as HTMLInputElement).value)" />
              <UiInput :model-value="section.background_color || ''" class="h-7 text-xs flex-1" placeholder="none" @update:model-value="update('background_color', $event)" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== INTRO ===== -->
    <template v-else-if="sectionType === 'intro'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Body HTML</label>
          <UiTextarea :model-value="section.body_html || ''" class="text-xs min-h-24 font-mono" @update:model-value="update('body_html', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Image Position</label>
          <UiSelect :model-value="section.image_position || 'right'" @update:model-value="update('image_position', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="left">Left</UiSelectItem>
              <UiSelectItem value="right">Right</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Image</label>
          <div v-if="section.image_url && !brokenImages.has(section.image_url)" class="relative rounded overflow-hidden bg-muted mb-1">
            <a :href="section.image_url" target="_blank" class="block">
              <img :src="section.image_url" alt="Intro image" class="w-full h-20 object-cover" @error="onImgError(section.image_url)" />
            </a>
          </div>
          <div class="flex gap-1">
            <UiInput :model-value="section.image_url || ''" class="h-8 text-xs" @update:model-value="update('image_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onMediaUploaded('image_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== TABS ===== -->
    <template v-else-if="sectionType === 'tabs'">
      <div class="space-y-3">
        <!-- Variant dropdown -->
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Style</label>
          <UiSelect :model-value="section.variant || 'default'" @update:model-value="update('variant', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="default">Default Tab Bar</UiSelectItem>
              <UiSelectItem value="kia-feature-bullets">Kia Feature Bullets</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>

        <!-- Theme -->
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Theme</label>
          <UiSelect :model-value="section.theme || 'light'" @update:model-value="update('theme', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="light">Light</UiSelectItem>
              <UiSelectItem value="dark">Dark</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>

        <!-- Image position (kia-feature-bullets only) -->
        <div v-if="section.variant === 'kia-feature-bullets'">
          <label class="text-xs text-muted-foreground mb-1 block">Image Position</label>
          <UiSelect :model-value="section.image_position || 'right'" @update:model-value="update('image_position', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="left">Left</UiSelectItem>
              <UiSelectItem value="right">Right</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>

        <!-- Category (kia-feature-bullets only) -->
        <div v-if="section.variant === 'kia-feature-bullets'">
          <label class="text-xs text-muted-foreground mb-1 block">Category Label</label>
          <UiInput :model-value="section.category || ''" class="h-8 text-xs" placeholder="e.g. Comfort" @update:model-value="update('category', $event)" />
        </div>

        <div>
          <label class="text-xs text-muted-foreground mb-1 block">{{ section.variant === 'kia-feature-bullets' ? 'Heading' : 'Title' }}</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" :placeholder="section.variant === 'kia-feature-bullets' ? 'e.g. Your new comfort zone.' : 'Section title'" @update:model-value="update('title', $event)" />
        </div>

        <!-- Tab / Feature items -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">{{ section.variant === 'kia-feature-bullets' ? 'Features' : 'Tabs' }} ({{ section.tabs?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('tabs', { label: section.variant === 'kia-feature-bullets' ? `Feature ${(section.tabs?.length ?? 0) + 1}` : `Tab ${(section.tabs?.length ?? 0) + 1}`, content_html: '', image_url: '', image_disclaimer: '', disclaimer: '' })">
              <Plus class="size-3 inline mr-0.5" />Add
            </button>
          </div>
          <div v-for="(tab, i) in (section.tabs || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div class="flex items-center gap-1">
              <UiInput :model-value="tab.label" class="h-7 text-xs" :placeholder="section.variant === 'kia-feature-bullets' ? 'Feature name' : 'Tab label'" @update:model-value="updateNested('tabs', i, 'label', $event)" />
              <button class="p-0.5 text-muted-foreground hover:text-destructive" @click="removeArrayItem('tabs', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <UiTextarea :model-value="tab.content_html || ''" class="text-xs min-h-12" :placeholder="section.variant === 'kia-feature-bullets' ? 'Description text' : 'HTML content'" @update:model-value="updateNested('tabs', i, 'content_html', $event)" />
            <!-- Image thumbnail + URL -->
            <div v-if="tab.image_url && !brokenImages.has(tab.image_url)" class="relative rounded overflow-hidden bg-muted">
              <a :href="tab.image_url" target="_blank" class="block">
                <img
                  :src="tab.image_url"
                  :alt="tab.label || 'Tab image'"
                  class="w-full h-16 object-cover"
                  @error="onImgError(tab.image_url)"
                />
              </a>
            </div>
            <div v-else-if="tab.image_url && brokenImages.has(tab.image_url)" class="flex items-center gap-1.5 rounded bg-muted px-2 py-1">
              <ImageOff class="size-3 text-muted-foreground shrink-0" />
              <span class="text-[10px] text-muted-foreground truncate">Failed to load image</span>
            </div>
            <div class="flex gap-1">
              <UiInput :model-value="tab.image_url || ''" class="h-7 text-xs" placeholder="Image URL" @update:model-value="updateNested('tabs', i, 'image_url', $event)" />
              <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onNestedMediaUploaded('tabs', i, 'image_url', $event)" />
              <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => updateNested('tabs', i, 'image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
            </div>
            <!-- Disclaimer fields only for kia-feature-bullets -->
            <template v-if="section.variant === 'kia-feature-bullets'">
              <UiInput :model-value="tab.image_disclaimer || ''" class="h-7 text-xs" placeholder="Image disclaimer (e.g. Overseas model shown)" @update:model-value="updateNested('tabs', i, 'image_disclaimer', $event)" />
              <UiInput :model-value="tab.disclaimer || ''" class="h-7 text-xs" placeholder="Disclaimer (e.g. Available on GT-Line, SX+ & SX grades.)" @update:model-value="updateNested('tabs', i, 'disclaimer', $event)" />
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== COLOR PICKER ===== -->
    <template v-else-if="sectionType === 'color-picker'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">360 Start Angle</label>
          <UiSelect :model-value="String(section.start_angle || 1)" @update:model-value="update('start_angle', Number($event))">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="1">Position 1 — Front (0°)</UiSelectItem>
              <UiSelectItem value="2">Position 2 — 60°</UiSelectItem>
              <UiSelectItem value="3">Position 3 — 120°</UiSelectItem>
              <UiSelectItem value="4">Position 4 — Rear (180°)</UiSelectItem>
              <UiSelectItem value="5">Position 5 — 240°</UiSelectItem>
              <UiSelectItem value="6">Position 6 — 300°</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <p class="text-xs text-muted-foreground">Colours loaded from database for this model.</p>
      </div>
    </template>

    <!-- ===== SPECS GRID ===== -->
    <template v-else-if="sectionType === 'specs-grid'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <p class="text-xs text-muted-foreground">
          {{ section.categories?.length ?? 0 }} categories,
          {{ section.categories?.reduce((n: number, c: any) => n + (c.specs?.length ?? 0), 0) ?? 0 }} specs
          (managed via data seed)
        </p>
      </div>
    </template>

    <!-- ===== GALLERY ===== -->
    <template v-else-if="sectionType === 'gallery'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Layout</label>
          <UiSelect :model-value="section.layout || 'carousel'" @update:model-value="update('layout', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="carousel">Carousel</UiSelectItem>
              <UiSelectItem value="grid">Grid</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Images ({{ section.images?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('images', { url: '', alt: '', caption: '', description: '' })">
              <Plus class="size-3 inline mr-0.5" />Add
            </button>
          </div>
          <div v-for="(img, i) in (section.images || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div v-if="img.url && !brokenImages.has(img.url)" class="relative rounded overflow-hidden bg-muted">
              <a :href="img.url" target="_blank" class="block">
                <img :src="img.url" :alt="img.caption || 'Gallery image'" class="w-full h-16 object-cover" @error="onImgError(img.url)" />
              </a>
            </div>
            <div class="flex items-center gap-1">
              <UiInput :model-value="img.url || ''" class="h-7 text-xs" placeholder="Image URL" @update:model-value="updateNested('images', i, 'url', $event)" />
              <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onNestedMediaUploaded('images', i, 'url', $event)" />
              <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => updateNested('images', i, 'url', url))"><ImageIcon class="size-3.5" /></UiButton>
              <button class="p-0.5 text-muted-foreground hover:text-destructive shrink-0" @click="removeArrayItem('images', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <UiInput :model-value="img.caption || ''" class="h-7 text-xs" placeholder="Caption / title" @update:model-value="updateNested('images', i, 'caption', $event)" />
            <UiTextarea :model-value="img.description || ''" class="text-xs min-h-12" placeholder="Description (shown in lightbox)" @update:model-value="updateNested('images', i, 'description', $event)" />
          </div>
        </div>
      </div>
    </template>

    <!-- ===== FEATURE CARDS ===== -->
    <template v-else-if="sectionType === 'feature-cards'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Columns</label>
          <UiSelect :model-value="String(section.columns || 3)" @update:model-value="update('columns', Number($event))">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="2">2</UiSelectItem>
              <UiSelectItem value="3">3</UiSelectItem>
              <UiSelectItem value="4">4</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Card Style</label>
          <UiSelect :model-value="section.card_style || 'default'" @update:model-value="update('card_style', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="default">Default</UiSelectItem>
              <UiSelectItem value="overlay">Image Overlay</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Cards ({{ section.cards?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('cards', { title: '', description: '', image_url: '' })">
              <Plus class="size-3 inline mr-0.5" />Add
            </button>
          </div>
          <div v-for="(card, i) in (section.cards || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div class="flex items-center gap-1">
              <UiInput :model-value="card.title || ''" class="h-7 text-xs" placeholder="Card title" @update:model-value="updateNested('cards', i, 'title', $event)" />
              <button class="p-0.5 text-muted-foreground hover:text-destructive" @click="removeArrayItem('cards', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <UiTextarea :model-value="card.description || ''" class="text-xs min-h-12" placeholder="Description" @update:model-value="updateNested('cards', i, 'description', $event)" />
            <div v-if="card.image_url && !brokenImages.has(card.image_url)" class="relative rounded overflow-hidden bg-muted">
              <a :href="card.image_url" target="_blank" class="block">
                <img :src="card.image_url" :alt="card.title || 'Card image'" class="w-full h-16 object-cover" @error="onImgError(card.image_url)" />
              </a>
            </div>
            <div class="flex gap-1">
              <UiInput :model-value="card.image_url || ''" class="h-7 text-xs" placeholder="Image URL" @update:model-value="updateNested('cards', i, 'image_url', $event)" />
              <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onNestedMediaUploaded('cards', i, 'image_url', $event)" />
              <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => updateNested('cards', i, 'image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
            </div>
            <div class="flex gap-1">
              <UiInput :model-value="card.cta_text || ''" class="h-7 text-xs flex-[2]" placeholder="CTA text" @update:model-value="updateNested('cards', i, 'cta_text', $event)" />
              <UiInput :model-value="card.cta_url || ''" class="h-7 text-xs flex-[3]" placeholder="CTA link URL" @update:model-value="updateNested('cards', i, 'cta_url', $event)" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== VIDEO ===== -->
    <!-- ===== IMAGE ===== -->
    <template v-else-if="sectionType === 'image'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Desktop Image</label>
          <div v-if="section.desktop_image_url && !brokenImages.has(section.desktop_image_url)" class="relative rounded overflow-hidden bg-muted mb-1">
            <a :href="section.desktop_image_url" target="_blank" class="block">
              <img :src="section.desktop_image_url" alt="Desktop image" class="w-full h-20 object-cover" @error="onImgError(section.desktop_image_url)" />
            </a>
          </div>
          <div class="flex gap-1">
            <UiInput :model-value="section.desktop_image_url || ''" class="h-8 text-xs" @update:model-value="update('desktop_image_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onMediaUploaded('desktop_image_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('desktop_image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Mobile Image</label>
          <div v-if="section.mobile_image_url && !brokenImages.has(section.mobile_image_url)" class="relative rounded overflow-hidden bg-muted mb-1">
            <a :href="section.mobile_image_url" target="_blank" class="block">
              <img :src="section.mobile_image_url" alt="Mobile image" class="w-full h-20 object-cover" @error="onImgError(section.mobile_image_url)" />
            </a>
          </div>
          <div class="flex gap-1">
            <UiInput :model-value="section.mobile_image_url || ''" class="h-8 text-xs" @update:model-value="update('mobile_image_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onMediaUploaded('mobile_image_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('mobile_image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Alt Text</label>
          <UiInput :model-value="section.alt || ''" class="h-8 text-xs" @update:model-value="update('alt', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Caption</label>
          <UiInput :model-value="section.caption || ''" class="h-8 text-xs" @update:model-value="update('caption', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Layout</label>
          <UiSelect :model-value="section.layout || 'full-width'" @update:model-value="update('layout', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="full-width">Full Width (edge-to-edge)</UiSelectItem>
              <UiSelectItem value="contained">Contained</UiSelectItem>
              <UiSelectItem value="center">Centred</UiSelectItem>
              <UiSelectItem value="left">Left Aligned</UiSelectItem>
              <UiSelectItem value="right">Right Aligned</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Aspect Ratio</label>
          <UiSelect :model-value="section.aspect_ratio || 'auto'" @update:model-value="update('aspect_ratio', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="auto">Auto (natural)</UiSelectItem>
              <UiSelectItem value="16:9">16:9 (Video)</UiSelectItem>
              <UiSelectItem value="21:9">21:9 (Ultra-wide)</UiSelectItem>
              <UiSelectItem value="4:3">4:3 (Classic)</UiSelectItem>
              <UiSelectItem value="1:1">1:1 (Square)</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" class="rounded" :checked="section.rounded === true" @change="update('rounded', ($event.target as HTMLInputElement).checked)" />
            <span class="text-xs">Rounded corners</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" class="rounded" :checked="section.shadow === true" @change="update('shadow', ($event.target as HTMLInputElement).checked)" />
            <span class="text-xs">Shadow</span>
          </label>
        </div>
      </div>
    </template>

    <!-- ===== VIDEO ===== -->
    <template v-else-if="sectionType === 'video'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Video URL</label>
          <div class="flex gap-1">
            <UiInput :model-value="section.video_url || ''" class="h-8 text-xs" @update:model-value="update('video_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" accept="video/mp4,video/webm" @uploaded="onMediaUploaded('video_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('video_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Poster Image</label>
          <div v-if="section.poster_url && !brokenImages.has(section.poster_url)" class="relative rounded overflow-hidden bg-muted mb-1">
            <a :href="section.poster_url" target="_blank" class="block">
              <img :src="section.poster_url" alt="Video poster" class="w-full h-20 object-cover" @error="onImgError(section.poster_url)" />
            </a>
          </div>
          <div class="flex gap-1">
            <UiInput :model-value="section.poster_url || ''" class="h-8 text-xs" @update:model-value="update('poster_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onMediaUploaded('poster_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('poster_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Layout</label>
          <UiSelect :model-value="section.layout || 'contained'" @update:model-value="update('layout', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="contained">Contained</UiSelectItem>
              <UiSelectItem value="wide">Wide</UiSelectItem>
              <UiSelectItem value="full-width">Full Width</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div class="flex items-center gap-2">
          <UiSwitch :checked="!!section.autoplay" @update:checked="update('autoplay', $event)" />
          <label class="text-xs">Autoplay</label>
        </div>
      </div>
    </template>

    <!-- ===== CTA BANNER ===== -->
    <template v-else-if="sectionType === 'cta-banner'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Heading</label>
          <UiInput :model-value="section.heading || ''" class="h-8 text-xs" @update:model-value="update('heading', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Body</label>
          <UiTextarea :model-value="section.body || ''" class="text-xs min-h-16" @update:model-value="update('body', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">CTA Text</label>
          <UiInput :model-value="section.cta_text || ''" class="h-8 text-xs" @update:model-value="update('cta_text', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">CTA URL</label>
          <UiInput :model-value="section.cta_url || ''" class="h-8 text-xs" @update:model-value="update('cta_url', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Background Color</label>
          <UiInput :model-value="section.background_color || ''" class="h-8 text-xs" placeholder="#000000" @update:model-value="update('background_color', $event)" />
        </div>
      </div>
    </template>

    <!-- ===== CONTENT BLOCK ===== -->
    <template v-else-if="sectionType === 'content-block'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Content HTML</label>
          <UiTextarea :model-value="section.content_html || ''" class="text-xs min-h-24 font-mono" @update:model-value="update('content_html', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Layout</label>
          <UiSelect :model-value="section.layout || 'contained'" @update:model-value="update('layout', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="contained">Contained</UiSelectItem>
              <UiSelectItem value="full-width">Full Width</UiSelectItem>
              <UiSelectItem value="two-column">Two Column</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Columns</label>
          <UiSelect :model-value="String(section.columns || 1)" @update:model-value="update('columns', Number($event))">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="1">1 (default)</UiSelectItem>
              <UiSelectItem value="2">2</UiSelectItem>
              <UiSelectItem value="3">3</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Image</label>
          <div v-if="section.image_url && !brokenImages.has(section.image_url)" class="relative rounded overflow-hidden bg-muted mb-1">
            <a :href="section.image_url" target="_blank" class="block">
              <img :src="section.image_url" alt="Content image" class="w-full h-20 object-cover" @error="onImgError(section.image_url)" />
            </a>
          </div>
          <div class="flex gap-1">
            <UiInput :model-value="section.image_url || ''" class="h-8 text-xs" @update:model-value="update('image_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onMediaUploaded('image_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Background</label>
          <UiInput :model-value="section.background || ''" class="h-8 text-xs" placeholder="#ffffff or gradient" @update:model-value="update('background', $event)" />
        </div>
      </div>
    </template>

    <!-- ===== ACCORDION ===== -->
    <template v-else-if="sectionType === 'accordion'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Section Anchor ID</label>
          <UiInput :model-value="section.section_id || ''" class="h-8 text-xs" placeholder="e.g. faq" @update:model-value="update('section_id', $event)" />
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Items ({{ section.items?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('items', { question: '', answer: '' })">
              <Plus class="size-3 inline mr-0.5" />Add
            </button>
          </div>
          <div v-for="(item, i) in (section.items || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div class="flex items-center gap-1">
              <UiInput :model-value="item.question || ''" class="h-7 text-xs" placeholder="Question" @update:model-value="updateNested('items', i, 'question', $event)" />
              <button class="p-0.5 text-muted-foreground hover:text-destructive" @click="removeArrayItem('items', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <UiTextarea :model-value="item.answer || ''" class="text-xs min-h-12" placeholder="Answer" @update:model-value="updateNested('items', i, 'answer', $event)" />
          </div>
        </div>
      </div>
    </template>

    <!-- ===== ENQUIRY FORM ===== -->
    <template v-else-if="sectionType === 'enquiry-form'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Heading</label>
          <UiInput :model-value="section.heading || ''" class="h-8 text-xs" @update:model-value="update('heading', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Sub-heading</label>
          <UiInput :model-value="section.sub_heading || ''" class="h-8 text-xs" @update:model-value="update('sub_heading', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Form Type</label>
          <UiSelect :model-value="section.form_type || 'contact'" @update:model-value="update('form_type', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="contact">Contact</UiSelectItem>
              <UiSelectItem value="test-drive">Test Drive</UiSelectItem>
              <UiSelectItem value="service">Service</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div class="flex items-center gap-2">
          <UiSwitch :checked="!!section.vehicle_context" @update:checked="update('vehicle_context', $event)" />
          <label class="text-xs">Include vehicle context</label>
        </div>
      </div>
    </template>

    <!-- ===== MAP ===== -->
    <template v-else-if="sectionType === 'map'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Sub-heading</label>
          <UiInput :model-value="section.sub_heading || ''" class="h-8 text-xs" @update:model-value="update('sub_heading', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Google Maps Embed URL</label>
          <UiInput :model-value="section.embed_url || ''" class="h-8 text-xs" placeholder="https://www.google.com/maps/embed?pb=..." @update:model-value="update('embed_url', $event)" />
        </div>
      </div>
    </template>

    <!-- ===== ALERT ===== -->
    <template v-else-if="sectionType === 'alert'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Message</label>
          <UiTextarea :model-value="section.message || ''" class="text-xs min-h-16" @update:model-value="update('message', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Variant</label>
          <UiSelect :model-value="section.variant || 'info'" @update:model-value="update('variant', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="info">Info</UiSelectItem>
              <UiSelectItem value="warning">Warning</UiSelectItem>
              <UiSelectItem value="success">Success</UiSelectItem>
              <UiSelectItem value="destructive">Destructive</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div class="flex items-center gap-2">
          <UiSwitch :checked="!!section.dismissible" @update:checked="update('dismissible', $event)" />
          <label class="text-xs">Dismissible</label>
        </div>
      </div>
    </template>

    <!-- ===== DIVIDER ===== -->
    <template v-else-if="sectionType === 'divider'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Style</label>
          <UiSelect :model-value="section.style || 'line'" @update:model-value="update('style', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="line">Line</UiSelectItem>
              <UiSelectItem value="space">Space</UiSelectItem>
              <UiSelectItem value="dots">Dots</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Spacing</label>
          <UiSelect :model-value="section.spacing || 'md'" @update:model-value="update('spacing', $event)">
            <UiSelectTrigger class="h-8 text-xs">
              <UiSelectValue />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="sm">Small</UiSelectItem>
              <UiSelectItem value="md">Medium</UiSelectItem>
              <UiSelectItem value="lg">Large</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
      </div>
    </template>

    <!-- ===== TESTIMONIAL ===== -->
    <template v-else-if="sectionType === 'testimonial'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Style</label>
          <UiSelect :model-value="section.style || 'default'" @update:model-value="update('style', $event)">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="default">Default (Cards)</UiSelectItem>
              <UiSelectItem value="dark">Dark (Large Quote)</UiSelectItem>
              <UiSelectItem value="minimal">Minimal</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Layout</label>
          <UiSelect :model-value="section.layout || 'carousel'" @update:model-value="update('layout', $event)">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="carousel">Carousel</UiSelectItem>
              <UiSelectItem value="grid">Grid</UiSelectItem>
              <UiSelectItem value="stacked">Stacked</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Testimonials ({{ section.testimonials?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('testimonials', { quote: '', author: '', role: '', avatar_url: '', rating: 5 })">
              <Plus class="size-3 inline mr-0.5" />Add
            </button>
          </div>
          <div v-for="(t, i) in (section.testimonials || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div class="flex items-center gap-1">
              <UiInput :model-value="t.author || ''" class="h-7 text-xs" placeholder="Author name" @update:model-value="updateNested('testimonials', i, 'author', $event)" />
              <button class="p-0.5 text-muted-foreground hover:text-destructive" @click="removeArrayItem('testimonials', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <UiInput :model-value="t.role || ''" class="h-7 text-xs" placeholder="Role (e.g. Owner, Driver)" @update:model-value="updateNested('testimonials', i, 'role', $event)" />
            <UiTextarea :model-value="t.quote || ''" class="text-xs min-h-12" placeholder="Quote / review text" @update:model-value="updateNested('testimonials', i, 'quote', $event)" />
            <div>
              <label class="text-[10px] text-muted-foreground">Rating (1-5)</label>
              <UiInput type="number" min="1" max="5" :model-value="String(t.rating ?? 5)" class="h-7 text-xs w-16" @update:model-value="updateNested('testimonials', i, 'rating', Number($event))" />
            </div>
            <div v-if="t.avatar_url && !brokenImages.has(t.avatar_url)" class="relative rounded overflow-hidden bg-muted">
              <img :src="t.avatar_url" alt="Avatar" class="size-10 rounded-full object-cover" @error="onImgError(t.avatar_url)" />
            </div>
            <div class="flex gap-1">
              <UiInput :model-value="t.avatar_url || ''" class="h-7 text-xs" placeholder="Avatar URL" @update:model-value="updateNested('testimonials', i, 'avatar_url', $event)" />
              <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onNestedMediaUploaded('testimonials', i, 'avatar_url', $event)" />
              <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => updateNested('testimonials', i, 'avatar_url', url))"><ImageIcon class="size-3.5" /></UiButton>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== COMPARISON TABLE ===== -->
    <template v-else-if="sectionType === 'comparison-table'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Columns ({{ section.columns?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('columns', { label: `Col ${(section.columns?.length ?? 0) + 1}`, highlighted: false })">
              <Plus class="size-3 inline mr-0.5" />Add Column
            </button>
          </div>
          <div v-for="(col, i) in (section.columns || [])" :key="i" class="flex items-center gap-1 mb-1">
            <UiInput :model-value="col.label || ''" class="h-7 text-xs" placeholder="Column label" @update:model-value="updateNested('columns', i, 'label', $event)" />
            <UiSwitch :checked="!!col.highlighted" class="scale-75" @update:checked="updateNested('columns', i, 'highlighted', $event)" />
            <span class="text-[9px] text-muted-foreground whitespace-nowrap">HL</span>
            <button class="p-0.5 text-muted-foreground hover:text-destructive shrink-0" @click="removeArrayItem('columns', i)">
              <X class="size-3.5" />
            </button>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Rows ({{ section.rows?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('rows', { feature: '', values: Array((section.columns?.length ?? 2) - 1).fill('') })">
              <Plus class="size-3 inline mr-0.5" />Add Row
            </button>
          </div>
          <div v-for="(row, i) in (section.rows || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1">
            <div class="flex items-center gap-1">
              <UiInput :model-value="row.feature || ''" class="h-7 text-xs font-medium" placeholder="Feature name" @update:model-value="updateNested('rows', i, 'feature', $event)" />
              <button class="p-0.5 text-muted-foreground hover:text-destructive shrink-0" @click="removeArrayItem('rows', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <div v-for="(val, vi) in (row.values || [])" :key="vi" class="flex items-center gap-1">
              <span class="text-[9px] text-muted-foreground w-12 shrink-0 truncate">{{ (section.columns || [])[vi + 1]?.label || `Col ${vi + 1}` }}</span>
              <UiInput
                :model-value="val || ''"
                class="h-7 text-xs"
                @update:model-value="(v: string) => {
                  const vals = [...(row.values || [])]
                  vals[vi] = v
                  updateNested('rows', i, 'values', vals)
                }"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== STATS ===== -->
    <template v-else-if="sectionType === 'stats'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Layout</label>
          <UiSelect :model-value="section.layout || 'row'" @update:model-value="update('layout', $event)">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="row">Row</UiSelectItem>
              <UiSelectItem value="grid">Grid</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Background</label>
          <UiInput :model-value="section.background || ''" class="h-8 text-xs" placeholder="#000000 or gradient" @update:model-value="update('background', $event)" />
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Stats ({{ section.stats?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('stats', { value: '', label: '', unit: '', icon_url: '' })">
              <Plus class="size-3 inline mr-0.5" />Add
            </button>
          </div>
          <div v-for="(stat, i) in (section.stats || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div class="flex items-center gap-1">
              <UiInput :model-value="stat.value || ''" class="h-7 text-xs w-20" placeholder="Value" @update:model-value="updateNested('stats', i, 'value', $event)" />
              <UiInput :model-value="stat.unit || ''" class="h-7 text-xs w-16" placeholder="Unit" @update:model-value="updateNested('stats', i, 'unit', $event)" />
              <button class="p-0.5 text-muted-foreground hover:text-destructive shrink-0" @click="removeArrayItem('stats', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <UiInput :model-value="stat.label || ''" class="h-7 text-xs" placeholder="Label (e.g. 0-100 km/h)" @update:model-value="updateNested('stats', i, 'label', $event)" />
            <div class="flex gap-1">
              <UiInput :model-value="stat.icon_url || ''" class="h-7 text-xs" placeholder="Icon URL (optional)" @update:model-value="updateNested('stats', i, 'icon_url', $event)" />
              <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onNestedMediaUploaded('stats', i, 'icon_url', $event)" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== LOGO STRIP ===== -->
    <template v-else-if="sectionType === 'logo-strip'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div class="flex items-center gap-2">
          <UiSwitch :checked="!!section.grayscale" @update:checked="update('grayscale', $event)" />
          <label class="text-xs">Greyscale logos</label>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Logos ({{ section.logos?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('logos', { name: '', image_url: '', link_url: '' })">
              <Plus class="size-3 inline mr-0.5" />Add
            </button>
          </div>
          <div v-for="(logo, i) in (section.logos || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div class="flex items-center gap-1">
              <UiInput :model-value="logo.name || ''" class="h-7 text-xs" placeholder="Logo name" @update:model-value="updateNested('logos', i, 'name', $event)" />
              <button class="p-0.5 text-muted-foreground hover:text-destructive shrink-0" @click="removeArrayItem('logos', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <div v-if="logo.image_url && !brokenImages.has(logo.image_url)" class="relative rounded overflow-hidden bg-muted">
              <img :src="logo.image_url" :alt="logo.name" class="h-10 object-contain" @error="onImgError(logo.image_url)" />
            </div>
            <div class="flex gap-1">
              <UiInput :model-value="logo.image_url || ''" class="h-7 text-xs" placeholder="Image URL" @update:model-value="updateNested('logos', i, 'image_url', $event)" />
              <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onNestedMediaUploaded('logos', i, 'image_url', $event)" />
              <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => updateNested('logos', i, 'image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
            </div>
            <UiInput :model-value="logo.link_url || ''" class="h-7 text-xs" placeholder="Link URL (optional)" @update:model-value="updateNested('logos', i, 'link_url', $event)" />
          </div>
        </div>
      </div>
    </template>

    <!-- ===== EMBED ===== -->
    <template v-else-if="sectionType === 'embed'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Embed URL</label>
          <UiInput :model-value="section.embed_url || ''" class="h-8 text-xs" placeholder="https://..." @update:model-value="update('embed_url', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Embed Type</label>
          <UiSelect :model-value="section.embed_type || 'iframe'" @update:model-value="update('embed_type', $event)">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="iframe">iFrame</UiSelectItem>
              <UiSelectItem value="script">Script Tag</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Aspect Ratio</label>
          <UiSelect :model-value="section.aspect_ratio || '16:9'" @update:model-value="update('aspect_ratio', $event)">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="16:9">16:9 (Widescreen)</UiSelectItem>
              <UiSelectItem value="4:3">4:3 (Standard)</UiSelectItem>
              <UiSelectItem value="1:1">1:1 (Square)</UiSelectItem>
              <UiSelectItem value="auto">Auto</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Max Width</label>
          <UiInput :model-value="section.max_width || ''" class="h-8 text-xs" placeholder="e.g. 800px or 100%" @update:model-value="update('max_width', $event)" />
        </div>
      </div>
    </template>

    <!-- ===== PRICING TABLE ===== -->
    <template v-else-if="sectionType === 'pricing-table'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Subtitle</label>
          <UiInput :model-value="section.subtitle || ''" class="h-8 text-xs" @update:model-value="update('subtitle', $event)" />
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Tiers ({{ section.tiers?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('tiers', { name: '', price: '', price_suffix: '', features: [], cta_text: 'Enquire', cta_url: '#', highlighted: false, badge_text: '' })">
              <Plus class="size-3 inline mr-0.5" />Add Tier
            </button>
          </div>
          <div v-for="(tier, i) in (section.tiers || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div class="flex items-center gap-1">
              <UiInput :model-value="tier.name || ''" class="h-7 text-xs" placeholder="Tier name (e.g. Sport)" @update:model-value="updateNested('tiers', i, 'name', $event)" />
              <button class="p-0.5 text-muted-foreground hover:text-destructive shrink-0" @click="removeArrayItem('tiers', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <div class="flex gap-1">
              <UiInput :model-value="tier.price || ''" class="h-7 text-xs" placeholder="$29,990" @update:model-value="updateNested('tiers', i, 'price', $event)" />
              <UiInput :model-value="tier.price_suffix || ''" class="h-7 text-xs w-24" placeholder="Drive Away" @update:model-value="updateNested('tiers', i, 'price_suffix', $event)" />
            </div>
            <UiTextarea
              :model-value="(tier.features || []).join('\n')"
              class="text-xs min-h-12"
              placeholder="One feature per line"
              @update:model-value="(v: string) => updateNested('tiers', i, 'features', v.split('\n').filter(Boolean))"
            />
            <div class="flex gap-1">
              <UiInput :model-value="tier.cta_text || ''" class="h-7 text-xs" placeholder="CTA text" @update:model-value="updateNested('tiers', i, 'cta_text', $event)" />
              <UiInput :model-value="tier.cta_url || ''" class="h-7 text-xs" placeholder="CTA URL" @update:model-value="updateNested('tiers', i, 'cta_url', $event)" />
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1">
                <UiSwitch :checked="!!tier.highlighted" class="scale-75" @update:checked="updateNested('tiers', i, 'highlighted', $event)" />
                <span class="text-[10px] text-muted-foreground">Highlight</span>
              </div>
              <UiInput :model-value="tier.badge_text || ''" class="h-7 text-xs flex-1" placeholder="Badge (e.g. Most Popular)" @update:model-value="updateNested('tiers', i, 'badge_text', $event)" />
            </div>
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Disclaimer</label>
          <UiTextarea :model-value="section.disclaimer || ''" class="text-xs min-h-12" placeholder="Legal disclaimer" @update:model-value="update('disclaimer', $event)" />
        </div>
      </div>
    </template>

    <!-- ===== STICKY BAR ===== -->
    <template v-else-if="sectionType === 'sticky-bar'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Position</label>
          <UiSelect :model-value="section.position || 'bottom'" @update:model-value="update('position', $event)">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="top">Top</UiSelectItem>
              <UiSelectItem value="bottom">Bottom</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Model Name</label>
          <UiInput :model-value="section.model_name || ''" class="h-8 text-xs" @update:model-value="update('model_name', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Price Text</label>
          <UiInput :model-value="section.price_text || ''" class="h-8 text-xs" placeholder="From $29,990" @update:model-value="update('price_text', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Show After Scroll (px)</label>
          <UiInput type="number" :model-value="String(section.show_after_scroll_px ?? 300)" class="h-8 text-xs" @update:model-value="update('show_after_scroll_px', Number($event))" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Background Color</label>
          <UiInput :model-value="section.background_color || ''" class="h-8 text-xs" placeholder="#000000" @update:model-value="update('background_color', $event)" />
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Buttons ({{ section.buttons?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('buttons', { text: 'Button', url: '#', variant: 'secondary' })">
              <Plus class="size-3 inline mr-0.5" />Add
            </button>
          </div>
          <div v-for="(btn, i) in (section.buttons || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div class="flex items-center gap-1">
              <UiInput :model-value="btn.text || ''" class="h-7 text-xs" placeholder="Button text" @update:model-value="updateNested('buttons', i, 'text', $event)" />
              <button class="p-0.5 text-muted-foreground hover:text-destructive shrink-0" @click="removeArrayItem('buttons', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <UiInput :model-value="btn.url || ''" class="h-7 text-xs" placeholder="URL" @update:model-value="updateNested('buttons', i, 'url', $event)" />
            <UiSelect :model-value="btn.variant || 'primary'" @update:model-value="updateNested('buttons', i, 'variant', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="primary">Primary</UiSelectItem>
                <UiSelectItem value="secondary">Secondary</UiSelectItem>
                <UiSelectItem value="ghost">Ghost</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== COUNTDOWN ===== -->
    <template v-else-if="sectionType === 'countdown'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Subtitle</label>
          <UiInput :model-value="section.subtitle || ''" class="h-8 text-xs" @update:model-value="update('subtitle', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Target Date</label>
          <UiInput type="datetime-local" :model-value="section.target_date ? section.target_date.slice(0, 16) : ''" class="h-8 text-xs" @update:model-value="update('target_date', $event ? new Date($event).toISOString() : '')" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Expired Message</label>
          <UiInput :model-value="section.expired_message || ''" class="h-8 text-xs" @update:model-value="update('expired_message', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">CTA Text</label>
          <UiInput :model-value="section.cta_text || ''" class="h-8 text-xs" @update:model-value="update('cta_text', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">CTA URL</label>
          <UiInput :model-value="section.cta_url || ''" class="h-8 text-xs" @update:model-value="update('cta_url', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Background Color</label>
          <UiInput :model-value="section.background_color || ''" class="h-8 text-xs" placeholder="#0f172a" @update:model-value="update('background_color', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Background Image</label>
          <div class="flex gap-1">
            <UiInput :model-value="section.background_image_url || ''" class="h-8 text-xs" placeholder="Image URL" @update:model-value="update('background_image_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onMediaUploaded('background_image_url', $event)" />
            <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => update('background_image_url', url))"><ImageIcon class="size-3.5" /></UiButton>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== FINANCE CALCULATOR ===== -->
    <template v-else-if="sectionType === 'finance-calculator'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Subtitle</label>
          <UiInput :model-value="section.subtitle || ''" class="h-8 text-xs" @update:model-value="update('subtitle', $event)" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Default Price ($)</label>
            <UiInput type="number" :model-value="String(section.default_price ?? 40000)" class="h-8 text-xs" @update:model-value="update('default_price', Number($event))" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Default Deposit ($)</label>
            <UiInput type="number" :model-value="String(section.default_deposit ?? 5000)" class="h-8 text-xs" @update:model-value="update('default_deposit', Number($event))" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Default Term (mo)</label>
            <UiInput type="number" :model-value="String(section.default_term_months ?? 60)" class="h-8 text-xs" @update:model-value="update('default_term_months', Number($event))" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Default Rate (%)</label>
            <UiInput type="number" step="0.1" :model-value="String(section.default_rate ?? 6.5)" class="h-8 text-xs" @update:model-value="update('default_rate', Number($event))" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Min Deposit ($)</label>
            <UiInput type="number" :model-value="String(section.min_deposit ?? 0)" class="h-8 text-xs" @update:model-value="update('min_deposit', Number($event))" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Max Term (mo)</label>
            <UiInput type="number" :model-value="String(section.max_term ?? 84)" class="h-8 text-xs" @update:model-value="update('max_term', Number($event))" />
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">CTA Text</label>
          <UiInput :model-value="section.cta_text || ''" class="h-8 text-xs" @update:model-value="update('cta_text', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">CTA URL</label>
          <UiInput :model-value="section.cta_url || ''" class="h-8 text-xs" @update:model-value="update('cta_url', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Disclaimer</label>
          <UiTextarea :model-value="section.disclaimer || ''" class="text-xs min-h-12" placeholder="Legal disclaimer" @update:model-value="update('disclaimer', $event)" />
        </div>
      </div>
    </template>

    <!-- ===== IMAGE SHOWCASE ===== -->
    <template v-else-if="sectionType === 'image-showcase'">
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Title</label>
          <UiInput :model-value="section.title || ''" class="h-8 text-xs" @update:model-value="update('title', $event)" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Layout</label>
          <UiSelect :model-value="section.layout || 'stacked'" @update:model-value="update('layout', $event)">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="stacked">Stacked (full-width)</UiSelectItem>
              <UiSelectItem value="fullscreen-scroll">Fullscreen Scroll</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Height</label>
          <UiSelect :model-value="section.height || 'large'" @update:model-value="update('height', $event)">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="screen">Full Screen (100vh)</UiSelectItem>
              <UiSelectItem value="large">Large (500px)</UiSelectItem>
              <UiSelectItem value="medium">Medium (320px)</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Overlay Style</label>
          <UiSelect :model-value="section.overlay_style || 'dark'" @update:model-value="update('overlay_style', $event)">
            <UiSelectTrigger class="h-8 text-xs"><UiSelectValue /></UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem value="dark">Dark overlay</UiSelectItem>
              <UiSelectItem value="light">Light overlay</UiSelectItem>
              <UiSelectItem value="none">No overlay</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-muted-foreground">Images ({{ section.images?.length ?? 0 }})</label>
            <button class="text-xs text-primary hover:underline" @click="addArrayItem('images', { url: '', alt: '', caption: '', description: '', overlay_position: 'bottom-left' })">
              <Plus class="size-3 inline mr-0.5" />Add
            </button>
          </div>
          <div v-for="(img, i) in (section.images || [])" :key="i" class="border rounded p-2 mb-1.5 space-y-1.5">
            <div v-if="img.url && !brokenImages.has(img.url)" class="relative rounded overflow-hidden bg-muted">
              <a :href="img.url" target="_blank" class="block">
                <img :src="img.url" :alt="img.alt || 'Showcase image'" class="w-full h-24 object-cover" @error="onImgError(img.url)" />
              </a>
            </div>
            <div class="flex items-center gap-1">
              <UiInput :model-value="img.url || ''" class="h-7 text-xs" placeholder="Image URL" @update:model-value="updateNested('images', i, 'url', $event)" />
              <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onNestedMediaUploaded('images', i, 'url', $event)" />
              <UiButton type="button" size="icon" variant="ghost" class="size-7 shrink-0" title="Browse media library" @click="openMediaLibrary((url) => updateNested('images', i, 'url', url))"><ImageIcon class="size-3.5" /></UiButton>
              <button class="p-0.5 text-muted-foreground hover:text-destructive shrink-0" @click="removeArrayItem('images', i)">
                <X class="size-3.5" />
              </button>
            </div>
            <UiInput :model-value="img.caption || ''" class="h-7 text-xs" placeholder="Caption / heading" @update:model-value="updateNested('images', i, 'caption', $event)" />
            <UiTextarea :model-value="img.description || ''" class="text-xs min-h-12" placeholder="Description text" @update:model-value="updateNested('images', i, 'description', $event)" />
            <UiSelect :model-value="img.overlay_position || 'bottom-left'" @update:model-value="updateNested('images', i, 'overlay_position', $event)">
              <UiSelectTrigger class="h-7 text-xs"><UiSelectValue /></UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem value="top-left">Top Left</UiSelectItem>
                <UiSelectItem value="top-right">Top Right</UiSelectItem>
                <UiSelectItem value="bottom-left">Bottom Left</UiSelectItem>
                <UiSelectItem value="bottom-right">Bottom Right</UiSelectItem>
                <UiSelectItem value="center">Center</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== FALLBACK ===== -->
    <template v-else>
      <p class="text-xs text-muted-foreground">Unknown section type: {{ sectionType }}</p>
    </template>

    <!-- Action buttons -->
    <div class="flex flex-col gap-2 pt-2 border-t">
      <!-- Convert To dropdown -->
      <UiDropdownMenu v-if="convertibleTypes.length > 0">
        <UiDropdownMenuTrigger as-child>
          <UiButton size="sm" variant="outline">
            <ArrowRightLeft class="size-3.5 mr-1.5" />
            Convert To...
          </UiButton>
        </UiDropdownMenuTrigger>
        <UiDropdownMenuContent align="start" class="w-48">
          <UiDropdownMenuLabel class="text-[10px] text-muted-foreground">
            Convert to a different type
          </UiDropdownMenuLabel>
          <UiDropdownMenuSeparator />
          <UiDropdownMenuItem
            v-for="targetType in convertibleTypes"
            :key="targetType"
            @select="emit('convert', targetType)"
          >
            {{ SECTION_TYPE_INFO[targetType]?.label || targetType }}
          </UiDropdownMenuItem>
        </UiDropdownMenuContent>
      </UiDropdownMenu>
      <UiButton
        size="sm"
        variant="outline"
        :disabled="regenerating"
        @click="emit('regenerate')"
      >
        <RefreshCw v-if="!regenerating" class="size-3.5 mr-1.5" />
        <Loader2 v-else class="size-3.5 mr-1.5 animate-spin" />
        Regenerate Section
      </UiButton>
      <UiButton
        size="sm"
        variant="outline"
        class="text-destructive hover:bg-destructive/10"
        @click="emit('delete')"
      >
        <Trash2 class="size-3.5 mr-1.5" />
        Delete Section
      </UiButton>
    </div>

    <MediaLibraryDialog
      :open="showMediaLibrary"
      :oem-id="oemId"
      :model-slug="modelSlug"
      @update:open="showMediaLibrary = $event"
      @select="onMediaLibrarySelect"
    />
  </div>
</template>
