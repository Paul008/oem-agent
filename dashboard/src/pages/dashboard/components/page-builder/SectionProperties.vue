<script lang="ts" setup>
import { computed, ref } from 'vue'
import { RefreshCw, Trash2, Loader2, Plus, X, ImageOff } from 'lucide-vue-next'
import MediaUploadButton from './MediaUploadButton.vue'

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
  'update:section': [updates: Record<string, any>]
}>()

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

    <!-- ===== HERO ===== -->
    <template v-if="sectionType === 'hero'">
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
          </div>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Video URL</label>
          <div class="flex gap-1">
            <UiInput :model-value="section.video_url || ''" class="h-8 text-xs" @update:model-value="update('video_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" accept="video/mp4,video/webm" @uploaded="onMediaUploaded('video_url', $event)" />
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
            </div>
          </div>
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
          </div>
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
          <label class="text-xs text-muted-foreground mb-1 block">Image</label>
          <div v-if="section.image_url && !brokenImages.has(section.image_url)" class="relative rounded overflow-hidden bg-muted mb-1">
            <a :href="section.image_url" target="_blank" class="block">
              <img :src="section.image_url" alt="Content image" class="w-full h-20 object-cover" @error="onImgError(section.image_url)" />
            </a>
          </div>
          <div class="flex gap-1">
            <UiInput :model-value="section.image_url || ''" class="h-8 text-xs" @update:model-value="update('image_url', $event)" />
            <MediaUploadButton :oem-id="oemId" :model-slug="modelSlug" @uploaded="onMediaUploaded('image_url', $event)" />
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

    <!-- ===== FALLBACK ===== -->
    <template v-else>
      <p class="text-xs text-muted-foreground">Unknown section type: {{ sectionType }}</p>
    </template>

    <!-- Action buttons -->
    <div class="flex flex-col gap-2 pt-2 border-t">
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
  </div>
</template>
