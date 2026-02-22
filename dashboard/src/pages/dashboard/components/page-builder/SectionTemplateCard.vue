<script lang="ts" setup>
import {
  Image, Type, Columns3, Palette, TableProperties, Images,
  LayoutGrid, Video, Megaphone, FileText, ImageIcon, Film, MousePointerClick, Plus,
} from 'lucide-vue-next'

const props = defineProps<{
  section: any
  sourceOemId?: string
  sourcePageName?: string
  mode: 'landing' | 'editor'
}>()

const emit = defineEmits<{
  insertSection: [section: any]
}>()

const typeIcons: Record<string, any> = {
  'hero': Image,
  'intro': Type,
  'tabs': Columns3,
  'color-picker': Palette,
  'specs-grid': TableProperties,
  'gallery': Images,
  'feature-cards': LayoutGrid,
  'video': Video,
  'cta-banner': Megaphone,
  'content-block': FileText,
}

function sectionLabel(s: any): string {
  return s.heading || s.title || s.name || s.type
}

function sectionSubtitle(s: any): string {
  return s.sub_heading || s.description || s.body || ''
}

function countImages(s: any): number {
  let count = 0
  if (s.desktop_image_url) count++
  if (s.mobile_image_url) count++
  if (s.image_url) count++
  if (Array.isArray(s.images)) count += s.images.length
  if (Array.isArray(s.tabs)) count += s.tabs.filter((t: any) => t.image_url).length
  if (Array.isArray(s.cards)) count += s.cards.filter((c: any) => c.image_url).length
  if (Array.isArray(s.colors)) count += s.colors.length
  return count
}

function oemLabel(id: string): string {
  return id.replace('-au', '').toUpperCase()
}
</script>

<template>
  <div class="group rounded-lg border bg-card shadow-sm hover:shadow-md transition-all">
    <div class="px-3 py-2.5 space-y-1.5">
      <!-- Header row -->
      <div class="flex items-center gap-2">
        <div class="flex items-center justify-center size-7 rounded-md bg-muted text-muted-foreground shrink-0">
          <component :is="typeIcons[section.type] || Type" class="size-3.5" />
        </div>
        <div class="flex-1 min-w-0">
          <UiBadge variant="secondary" class="text-[9px] px-1.5 py-0 font-normal">
            {{ section.type }}
          </UiBadge>
        </div>
        <span
          v-if="sourceOemId"
          class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0"
        >
          {{ oemLabel(sourceOemId) }}
        </span>
      </div>

      <!-- Content -->
      <div class="min-w-0">
        <p class="text-sm font-medium truncate leading-tight">
          {{ sectionLabel(section) }}
        </p>
        <p
          v-if="sectionSubtitle(section)"
          class="text-[11px] text-muted-foreground truncate mt-0.5"
        >
          {{ sectionSubtitle(section) }}
        </p>
      </div>

      <!-- Metadata chips -->
      <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span v-if="countImages(section) > 0" class="flex items-center gap-0.5">
          <ImageIcon class="size-2.5" /> {{ countImages(section) }}
        </span>
        <span v-if="section.video_url" class="flex items-center gap-0.5">
          <Film class="size-2.5" /> video
        </span>
        <span v-if="section.cta_text || section.cta_url" class="flex items-center gap-0.5">
          <MousePointerClick class="size-2.5" /> CTA
        </span>
        <span v-if="sourcePageName" class="truncate ml-auto">
          {{ sourcePageName }}
        </span>
      </div>

      <!-- Action -->
      <UiButton
        size="sm"
        :variant="mode === 'editor' ? 'default' : 'outline'"
        class="w-full mt-1 h-7 text-xs"
        @click="emit('insertSection', section)"
      >
        <Plus class="size-3 mr-1" />
        {{ mode === 'editor' ? 'Insert' : 'Use Template' }}
      </UiButton>
    </div>
  </div>
</template>
